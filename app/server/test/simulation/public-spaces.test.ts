import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fc from "fast-check";
import type pg from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { LINK_ROLES, ROLES } from "@steelman/shared";
import type { Access, Role } from "@steelman/shared";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import * as access from "../../src/access.ts";
import * as list from "../../src/list.ts";
import * as sharing from "../../src/sharing.ts";
import * as spaces from "../../src/spaces.ts";
import { createBoard } from "../../src/boards.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { NOON, addAccount } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// The simulation's checks for public spaces (G-07, G-05, H-02, M3d-20;
// plans/architecture.md §8 and §7, point 4; security review F4). This world
// is its own, in this file, so space-world.ts's random sequences stay as they
// were: five people and one space, owned by person 0, who is never removed;
// persons 1 (a Member) and 2 (an Admin) start in it, and persons 3 and 4
// start outside it. Each of persons 0, 1, and 2 owns one board, made in the
// space while it was private and shared with everyone in it. Random steps
// let people join and leave, make the space public and private, invite and
// remove people as its Owner, change each board's general access as its
// Owner, and open boards. After every step, every person asks for every
// board, and two checks must always hold, counted again from the tables:
//
// - no one who isn't a member reads a board in a private space through it:
//   without a board role of their own, or the board's link, they don't get
//   in and don't find it listed;
// - someone who joins after the space goes public can't open a board that
//   another member shared with the space before then, until its Owner shares
//   it again.
//
// A member does get in to a board shared with the space while its Owner is
// in it, so checks that let no one in would fail too. Each check is shown to
// fail with a planted bug: one that lets any member of the space stand in
// for the reader in access.ts, and one where Make public skips stopping
// other members' boards being shared. This file has its own copy of the
// planting helper, because the existing files are protected (AGENTS.md
// rule 9).

interface Code {
  access: typeof access;
  list: typeof list;
  sharing: typeof sharing;
  spaces: typeof spaces;
}

type Step =
  | { kind: "join"; person: number }
  | { kind: "leave"; person: number }
  | { kind: "public" }
  | { kind: "private" }
  | { kind: "invite"; person: number }
  | { kind: "remove"; person: number }
  | { kind: "general"; board: number; general: Access["general"]; role: Access["linkRole"] }
  | { kind: "open"; person: number; board: number };

const PEOPLE = 5;
/** Board n is owned by person n. */
const BOARDS = 3;
const person = fc.integer({ min: 1, max: PEOPLE - 1 });
const anyone = fc.nat(PEOPLE - 1);
const board = fc.nat(BOARDS - 1);

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("join" as const), person }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("leave" as const), person }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("public" as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("private" as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("invite" as const), person }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("remove" as const), person }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("general" as const), board, general: fc.constantFrom("invited", "link", "space"), role: fc.constantFrom(...LINK_ROLES) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("open" as const), person: anyone, board }) },
);

const NO_OUTSIDER_READS_A_PRIVATE_SPACE = "G-07. No one who isn't a member reads a board in a private space through it, or finds it listed";
const NO_JOINER_OPENS_AN_EARLIER_SHARE = "G-07. Someone who joins after a space goes public can't open a board another member shared before then, until its Owner shares it again";
const A_MEMBER_REACHES_A_SHARED_BOARD = "G-05. While its Owner is in the space, a member of the space gets into a board shared with it, and finds it listed";
const STEP_DID_WHAT_IT_ASKED = "G-07. Each step does what it asks, or refuses only for its own reason";

class CheckFailed extends Error {}
function check(holds: boolean, rule: string, detail: unknown): void {
  if (!holds) throw new CheckFailed(`${rule}\n${JSON.stringify(detail, null, 2)}`);
}

let worldsMade = 0;

const inSpaceNow = async (client: pg.Client, space: string, account: string) =>
  (await client.query("select 1 from space_member sm join space s on s.id = sm.space_id where sm.space_id = $1 and sm.account_id = $2 and s.deleted_at is null", [space, account])).rowCount === 1;

/** The person's role on the board, counted again from the tables, with their place and the Owner's in the space. */
async function counted(client: pg.Client, space: string, boardId: string, account: string) {
  const row = (await client.query("select general_access, link_role from board where id = $1", [boardId])).rows[0];
  const member = (await client.query("select role from board_member where board_id = $1 and account_id = $2", [boardId, account])).rows[0];
  const owner = (await client.query("select account_id from board_member where board_id = $1 and role = 'owner'", [boardId])).rows[0].account_id as string;
  const visibility = (await client.query("select visibility from space where id = $1", [space])).rows[0].visibility as string;
  const ownRole = member && (ROLES as readonly string[]).includes(member.role) ? (member.role as Role) : null;
  return { ownRole, general: row.general_access as Access["general"], linkRole: row.link_role as Role, visibility, inSpace: await inSpaceNow(client, space, account), ownerInSpace: await inSpaceNow(client, space, owner) };
}

async function play(code: Code, { db, client }: { db: Db; client: pg.Client }, steps: Step[]): Promise<void> {
  const ids = createSeededIds(++worldsMade * 2027);
  const clock = createFakeClock(new Date(NOON));
  const services = { db, clock };
  const people: string[] = [];
  for (let index = 0; index < PEOPLE; index++) people.push(await addAccount(client, ids, `pp${index}`, { confirmed: true }));
  const names: string[] = [];
  for (const id of people) names.push((await client.query("select username from account where id = $1", [id])).rows[0].username);
  const spaceOwner = people[0]!;
  const space = await addSpace(client, ids, spaceOwner, { name: `Public world ${worldsMade}` });
  await addSpaceMember(client, space, people[1]!, "member");
  await addSpaceMember(client, space, people[2]!, "admin");

  const boards: string[] = [];
  for (let index = 0; index < BOARDS; index++) {
    boards.push(await createBoard(db, clock, ids, people[index]!, { question: `Public world ${worldsMade} board ${index}?`, options: ["Yes", "No"], space, access: { general: "space", linkRole: "contributor" } }));
  }

  // What the steps have done, as the model keeps it: who an Admin removed, who joined while the space was public, and
  // which boards another member shared with the space before it last went public and haven't shared since.
  const blocked = new Set<number>();
  const joinedPublic = new Set<number>();
  const stale = new Set<number>();
  let visibility = "private";

  const everyone = async (after: Step | "setup") => {
    for (const [index, account] of people.entries()) {
      const listed = new Set((await code.list.listBoards(db, clock, account)).boards.map((each) => each.id));
      for (const [boardIndex, each] of boards.entries()) {
        const tables = await counted(client, space, each, account);
        const entry = await code.access.entryTo(db, each, account);
        const detail = { after, person: index, board: boardIndex, tables, entry, listed: listed.has(each), stale: stale.has(boardIndex), joinedPublic: joinedPublic.has(index) };
        if (tables.ownRole !== null || tables.general === "link") continue;
        if (!tables.inSpace && tables.visibility === "private") check(entry.role === null && !listed.has(each), NO_OUTSIDER_READS_A_PRIVATE_SPACE, detail);
        if (tables.inSpace && joinedPublic.has(index) && stale.has(boardIndex)) check(entry.role === null && !listed.has(each), NO_JOINER_OPENS_AN_EARLIER_SHARE, detail);
        if (tables.inSpace && tables.general === "space" && tables.ownerInSpace) check(entry.role === tables.linkRole && listed.has(each), A_MEMBER_REACHES_A_SHARED_BOARD, detail);
      }
    }
  };

  await everyone("setup");
  for (const step of steps) {
    switch (step.kind) {
      case "join": {
        const was = await inSpaceNow(client, space, people[step.person]!);
        const result = await code.spaces.joinSpace(services, space, people[step.person]!);
        // A member is in already, whatever the visibility; anyone else gets in only to a public space no Admin removed them from.
        const expected = was ? "already_done" : visibility !== "public" || blocked.has(step.person) ? "not_found" : "done";
        check(result.status === expected, STEP_DID_WHAT_IT_ASKED, { step, was, result });
        if (result.status === "done") joinedPublic.add(step.person);
        break;
      }
      case "leave": {
        const was = await inSpaceNow(client, space, people[step.person]!);
        const result = await code.spaces.removeFromSpace(services, space, people[step.person]!, people[step.person]!);
        check(was ? result.status === "done" : result.status === "not_found", STEP_DID_WHAT_IT_ASKED, { step, was, result });
        joinedPublic.delete(step.person);
        break;
      }
      case "public":
      case "private": {
        const result = await code.spaces.setSpaceVisibility(services, space, spaceOwner, step.kind);
        check(result.status === (visibility === step.kind ? "already_done" : "done"), STEP_DID_WHAT_IT_ASKED, { step, result });
        if (result.status === "done" && step.kind === "public") {
          for (const [index, each] of boards.entries()) {
            if (index === 0) continue;
            const row = (await client.query("select general_access from board where id = $1", [each])).rows[0];
            // The model's own note, from before the step's answer was read back: what was shared then is stale now.
            if (row.general_access !== "link") stale.add(index);
          }
        }
        visibility = step.kind;
        break;
      }
      case "invite": {
        const result = await code.spaces.inviteToSpace(services, space, spaceOwner, names[step.person]!.toLowerCase(), "member");
        check(result.status === "done" || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, result });
        blocked.delete(step.person);
        if (result.status === "done") joinedPublic.delete(step.person);
        break;
      }
      case "remove": {
        const was = await inSpaceNow(client, space, people[step.person]!);
        const result = await code.spaces.removeFromSpace(services, space, spaceOwner, people[step.person]!);
        check(result.status === (was ? "done" : "already_done"), STEP_DID_WHAT_IT_ASKED, { step, was, result });
        if (was) blocked.add(step.person);
        joinedPublic.delete(step.person);
        break;
      }
      case "general": {
        const on = boards[step.board]!;
        const owner = people[step.board]!;
        const ownerIn = await inSpaceNow(client, space, owner);
        const result = await code.sharing.setAccess(services, on, owner, { general: step.general, linkRole: step.role });
        const refusedForNoSpace = result.status === "refused" && result.reason === "no_space";
        if (step.general === "space" && !ownerIn) check(refusedForNoSpace || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, ownerIn, result });
        else check(result.status === "done" || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, ownerIn, result });
        // Its Owner's own choice, made after the space went public, counts as sharing it again.
        if (result.status === "done") stale.delete(step.board);
        break;
      }
      case "open": {
        // As the board route lets a reader in (app.ts's letIn): someone coming by the link is recorded then.
        const entry = await code.access.entryTo(db, boards[step.board]!, people[step.person]!);
        if (entry.joiningByLink) await code.access.joinByLink(db, clock, boards[step.board]!, people[step.person]!);
        break;
      }
    }
    clock.advance(1000);
    await everyone(step);
  }
}

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../../src");

/** A copy of server/src with one change made in `file`, with the modules this world uses loaded from the copy. */
async function plant(name: string, file: string, from: string, to: string): Promise<{ code: Code; remove(): void }> {
  const directory = join(here, ".planted", `${name}-${randomBytes(3).toString("hex")}`);
  cpSync(source, directory, { recursive: true });
  const target = join(directory, file);
  const text = readFileSync(target, "utf8");
  if (!text.includes(from)) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`The planted bug "${name}" no longer fits ${file}: that code has changed shape. Plant it again in the new code.`);
  }
  writeFileSync(target, text.replace(from, to));
  const load = async (module: string) => import(pathToFileURL(join(directory, module)).href);
  const code = { access: await load("access.ts"), list: await load("list.ts"), sharing: await load("sharing.ts"), spaces: await load("spaces.ts") } as Code;
  return { code, remove: () => rmSync(directory, { recursive: true, force: true }) };
}

const REAL: Code = { access, list, sharing, spaces };
const RUNS = Math.max(1, Math.round(Number(process.env.SIMULATION_RUNS ?? 300) / 10));

test(`G-07, G-05, H-02, M0-5: no outsider reads a private space's boards, and no joiner opens a board shared before the space went public, over ${RUNS} random sequences`, async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(stepArbitrary, { maxLength: 20 }), async (steps) => {
      await play(REAL, { db: kysely, client: db.client }, steps);
    }),
    { numRuns: RUNS },
  );
}, 600_000);

// Person 3, outside the space, asks for board 1; the space goes public and person 3 joins; board 1's Owner shares it
// again, and person 4 joins too; the space goes private and person 3 leaves.
const SEQUENCE: Step[] = [
  { kind: "open", person: 3, board: 1 },
  { kind: "public" },
  { kind: "join", person: 3 },
  { kind: "general", board: 1, general: "space", role: "voter" },
  { kind: "join", person: 4 },
  { kind: "private" },
  { kind: "leave", person: 3 },
];

test("G-07, M0-5: the same sequence holds both checks with the real code, so the failures below are the planted bugs'", async () => {
  await play(REAL, { db: kysely, client: db.client }, SEQUENCE);
}, 60_000);

test("G-07, M0-5: a planted lookup that lets any member of the space stand in for the reader is caught by the private-space check", async () => {
  const planted = await plant("any-member", "access.ts", "join space_member sm on sm.space_id = s.id and sm.account_id = ${person}", "join space_member sm on sm.space_id = s.id");
  try {
    await expect(play(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(NO_OUTSIDER_READS_A_PRIVATE_SPACE);
  } finally {
    planted.remove();
  }
}, 60_000);

test("G-07, M0-5: a planted Make public that keeps other members' boards shared is caught by the joiner check", async () => {
  const planted = await plant("keep-shared", "spaces.ts", "const unshared = await othersSharedBoards(trx, spaceId, person!);", "const unshared: Awaited<ReturnType<typeof othersSharedBoards>> = [];");
  try {
    await expect(play(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(NO_JOINER_OPENS_AN_EARLIER_SHARE);
  } finally {
    planted.remove();
  }
}, 60_000);
