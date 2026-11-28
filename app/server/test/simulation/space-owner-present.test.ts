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

// The simulation's check that a board leaves its space with its Owner (G-04,
// G-05, H-02, M3d-34; plans/architecture.md §8 and §7, point 4; security
// review F1 and F4). space-world.ts has one person owning the space and every
// board, and never removes them, so it can't see this. This world is its own,
// in this file, so the existing random sequences stay as they were: four
// people and one space, owned by person 0, who is never removed; persons 1
// (a Member) and 2 (an Admin) start in it, and person 3 starts outside it.
// Each of persons 0, 1, and 2 owns one board, made in the space. Random steps
// invite people, remove them, let them leave, change each board's general
// access as its Owner, and move boards in and out of the space as their
// Owner. After every step, every person asks for every board, and one check
// must always hold, counted again from the tables:
//
// - no one reaches a board through a space its Owner isn't in: without a
//   board role of their own, they don't get in and don't find it listed.
//
// A member of the space does get in, and finds it, while its Owner is in the
// space, so a check that let no one in would fail too. A planted bug that
// drops the Owner clause from access.ts is caught. This file has its own copy
// of the planting helper, because the existing files are protected
// (AGENTS.md rule 9).

interface Code {
  access: typeof access;
  list: typeof list;
  sharing: typeof sharing;
  spaces: typeof spaces;
}

type Step =
  | { kind: "invite"; person: number }
  | { kind: "remove"; person: number }
  | { kind: "leave"; person: number }
  | { kind: "general"; board: number; general: Access["general"]; role: Access["linkRole"] }
  | { kind: "move"; board: number; inSpace: boolean }
  | { kind: "open"; person: number; board: number };

const PEOPLE = 4;
/** Board n is owned by person n. */
const BOARDS = 3;
const person = fc.integer({ min: 1, max: PEOPLE - 1 });
const anyone = fc.nat(PEOPLE - 1);
const board = fc.nat(BOARDS - 1);

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("invite" as const), person }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("remove" as const), person }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("leave" as const), person }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("general" as const), board, general: fc.constantFrom("invited", "link", "space"), role: fc.constantFrom(...LINK_ROLES) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("move" as const), board, inSpace: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("open" as const), person: anyone, board }) },
);

const NO_ONE_REACHES_A_BOARD_WHOSE_OWNER_LEFT = "G-05. No one reaches a board through a space its Owner isn't in, or finds it listed";
const A_MEMBER_REACHES_A_SHARED_BOARD = "G-05. While its Owner is in the space, a member of the space gets into a board shared with it, and finds it listed";
const STEP_DID_WHAT_IT_ASKED = "G-05. Each step does what it asks, or refuses only for its own reason";

class CheckFailed extends Error {}
function check(holds: boolean, rule: string, detail: unknown): void {
  if (!holds) throw new CheckFailed(`${rule}\n${JSON.stringify(detail, null, 2)}`);
}

let worldsMade = 0;

const inSpaceNow = async (client: pg.Client, space: string, account: string) =>
  (await client.query("select 1 from space_member sm join space s on s.id = sm.space_id where sm.space_id = $1 and sm.account_id = $2 and s.deleted_at is null", [space, account])).rowCount === 1;

/** The person's role on the board, counted again from the tables, with the Owner's place in the space. */
async function counted(client: pg.Client, boardId: string, account: string) {
  const row = (await client.query("select general_access, link_role, space_id from board where id = $1", [boardId])).rows[0];
  const member = (await client.query("select role from board_member where board_id = $1 and account_id = $2", [boardId, account])).rows[0];
  const owner = (await client.query("select account_id from board_member where board_id = $1 and role = 'owner'", [boardId])).rows[0].account_id as string;
  const sharedWithSpace = row.general_access === "space" && row.space_id !== null;
  const inSpace = row.space_id !== null && (await inSpaceNow(client, row.space_id, account));
  const ownerInSpace = row.space_id !== null && (await inSpaceNow(client, row.space_id, owner));
  const ownRole = member && (ROLES as readonly string[]).includes(member.role) ? (member.role as Role) : null;
  return { ownRole, sharedWithSpace, inSpace, ownerInSpace, linkRole: row.link_role as Role };
}

async function play(code: Code, { db, client }: { db: Db; client: pg.Client }, steps: Step[]): Promise<void> {
  const ids = createSeededIds(++worldsMade * 3438);
  const clock = createFakeClock(new Date(NOON));
  const services = { db, clock };
  const people: string[] = [];
  for (let index = 0; index < PEOPLE; index++) people.push(await addAccount(client, ids, `op${index}`, { confirmed: true }));
  const names: string[] = [];
  for (const id of people) names.push((await client.query("select username from account where id = $1", [id])).rows[0].username);
  const spaceOwner = people[0]!;
  const space = await addSpace(client, ids, spaceOwner, { name: `Owner world ${worldsMade}` });
  await addSpaceMember(client, space, people[1]!, "member");
  await addSpaceMember(client, space, people[2]!, "admin");

  // Board n is person n's, made in the space and shared with everyone in it as Contributor.
  const boards: string[] = [];
  for (let index = 0; index < BOARDS; index++) {
    boards.push(await createBoard(db, clock, ids, people[index]!, { question: `Owner world ${worldsMade} board ${index}?`, options: ["Yes", "No"], space, access: { general: "space", linkRole: "contributor" } }));
  }

  const everyone = async (after: Step | "setup") => {
    for (const [index, account] of people.entries()) {
      const listed = new Set((await code.list.listBoards(db, clock, account)).boards.map((each) => each.id));
      for (const [boardIndex, each] of boards.entries()) {
        const tables = await counted(client, each, account);
        const entry = await code.access.entryTo(db, each, account);
        const detail = { after, person: index, board: boardIndex, tables, entry, listed: listed.has(each) };
        if (tables.ownRole !== null || !tables.sharedWithSpace) continue;
        if (!tables.ownerInSpace) check(entry.role === null && !listed.has(each), NO_ONE_REACHES_A_BOARD_WHOSE_OWNER_LEFT, detail);
        else if (tables.inSpace) check(entry.role === tables.linkRole && listed.has(each), A_MEMBER_REACHES_A_SHARED_BOARD, detail);
      }
    }
  };

  await everyone("setup");
  for (const step of steps) {
    switch (step.kind) {
      case "invite": {
        const result = await code.spaces.inviteToSpace(services, space, spaceOwner, names[step.person]!.toLowerCase(), "member");
        check(result.status === "done" || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, result });
        break;
      }
      case "remove": {
        const result = await code.spaces.removeFromSpace(services, space, spaceOwner, people[step.person]!);
        check(result.status === "done" || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, result });
        break;
      }
      case "leave": {
        const was = await inSpaceNow(client, space, people[step.person]!);
        const result = await code.spaces.removeFromSpace(services, space, people[step.person]!, people[step.person]!);
        // Someone who isn't in the space can't learn it's there, so their leaving isn't found.
        check(was ? result.status === "done" : result.status === "not_found", STEP_DID_WHAT_IT_ASKED, { step, was, result });
        break;
      }
      case "general": {
        const on = boards[step.board]!;
        const owner = people[step.board]!;
        const row = (await client.query("select space_id from board where id = $1", [on])).rows[0];
        const ownerIn = row.space_id !== null && (await inSpaceNow(client, row.space_id, owner));
        const result = await code.sharing.setAccess(services, on, owner, { general: step.general, linkRole: step.role });
        const refusedForNoSpace = result.status === "refused" && result.reason === "no_space";
        if (step.general === "space" && !ownerIn) check(refusedForNoSpace || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, ownerIn, result });
        else check(result.status === "done" || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, ownerIn, result });
        break;
      }
      case "move": {
        const on = boards[step.board]!;
        const owner = people[step.board]!;
        const ownerIn = await inSpaceNow(client, space, owner);
        const result = await code.sharing.setBoardSpace(services, on, owner, step.inSpace ? space : null);
        const already = result.status === "already_done";
        if (step.inSpace && !ownerIn) check(already || (result.status === "refused" && result.reason === "no_space"), STEP_DID_WHAT_IT_ASKED, { step, ownerIn, result });
        else check(result.status === "done" || already, STEP_DID_WHAT_IT_ASKED, { step, ownerIn, result });
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

test(`G-04, G-05, H-02, M0-5: no one reaches a board through a space its Owner isn't in, over ${RUNS} random sequences`, async () => {
  await fc.assert(
    fc.asyncProperty(fc.array(stepArbitrary, { maxLength: 20 }), async (steps) => {
      await play(REAL, { db: kysely, client: db.client }, steps);
    }),
    { numRuns: RUNS },
  );
}, 600_000);

// Person 1, a Member, owns board 1, shared with everyone in the space; an Admin removes them, and then person 1
// comes back and leaves by themself.
const SEQUENCE: Step[] = [
  { kind: "open", person: 2, board: 1 },
  { kind: "remove", person: 1 },
  { kind: "open", person: 0, board: 1 },
  { kind: "invite", person: 1 },
  { kind: "leave", person: 1 },
];

test("G-05, M0-5: the same sequence holds the check with the real code, so the failure below is the planted bug's", async () => {
  await play(REAL, { db: kysely, client: db.client }, SEQUENCE);
}, 60_000);

test("G-05, H-02, M0-5: a planted lookup that forgets whether the board's Owner is still in the space is caught", async () => {
  // As if the clause asked whether anyone were in the space, not the board's Owner: someone already in it always is, so
  // the board stays open through the space after its Owner has gone, and every other condition stays as it is.
  const planted = await plant("owner-gone", "access.ts", "so.space_id = b.space_id and so.account_id = bo.account_id", "so.space_id = b.space_id");
  try {
    await expect(play(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(NO_ONE_REACHES_A_BOARD_WHOSE_OWNER_LEFT);
  } finally {
    planted.remove();
  }
}, 60_000);
