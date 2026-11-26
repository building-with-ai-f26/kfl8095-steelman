// The simulation's spaces (G-04, G-05, H-02, M3d-18; plans/architecture.md §8
// and §7, point 4). A small world of its own, beside world.ts rather than in
// it, so the existing random sequences stay as they were: four people, one
// space, and three boards. Person 0 owns the space and the boards; persons 1
// and 2 start in the space, and person 3 starts outside it. Random steps
// invite people to the space and remove them, change each board's general
// access (invited, anyone with the link, or everyone in the space) and its
// role, take a board out of the space and put it back, open boards, and write
// on them. After every step, every person asks for every board, and two
// checks must always hold, counted again here from the tables:
//
// - no one outside the space, and with no board role of their own, ever gets
//   into a board shared with everyone in the space, or finds it in their list;
// - no write is saved for someone whose role, counted the same way, doesn't
//   allow it.

import fc from "fast-check";
import type pg from "pg";
import { LINK_ROLES, ROLES } from "@steelman/shared";
import type { Access, Role } from "@steelman/shared";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import type { Db } from "../../src/db/database.ts";
import type * as AccessModule from "../../src/access.ts";
import type * as ListModule from "../../src/list.ts";
import type * as SharingModule from "../../src/sharing.ts";
import type * as SpacesModule from "../../src/spaces.ts";
import type * as WritingModule from "../../src/writing.ts";
import { createBoard } from "../../src/boards.ts";
import { NOON, addAccount } from "../support/board.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

/** The code under test: the real modules, or a planted copy of them. */
export interface SpaceCode {
  access: typeof AccessModule;
  list: typeof ListModule;
  sharing: typeof SharingModule;
  spaces: typeof SpacesModule;
  writing: typeof WritingModule;
}

export type SpaceStep =
  | { kind: "invite"; person: number }
  | { kind: "remove"; person: number }
  | { kind: "general"; board: number; general: Access["general"]; role: Access["linkRole"] }
  | { kind: "move"; board: number; inSpace: boolean }
  | { kind: "open"; person: number; board: number }
  | { kind: "write"; person: number; board: number };

const PEOPLE = 4;
const BOARDS = 3;
const person = fc.integer({ min: 1, max: PEOPLE - 1 });
const anyone = fc.nat(PEOPLE - 1);
const board = fc.nat(BOARDS - 1);

export const spaceStepArbitrary: fc.Arbitrary<SpaceStep> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("invite" as const), person }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("remove" as const), person }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("general" as const), board, general: fc.constantFrom("invited", "link", "space"), role: fc.constantFrom(...LINK_ROLES) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("move" as const), board, inSpace: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("open" as const), person: anyone, board }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("write" as const), person: anyone, board }) },
);

export const NO_NON_MEMBER_READS_A_SPACE_BOARD = "G-05. No one outside a space, without a board role of their own, gets into a board shared with everyone in it, or finds it listed";
export const NO_WRITE_WITHOUT_A_ROLE = "G-05. No write is saved for someone whose role doesn't allow it";
export const STEP_DID_WHAT_IT_ASKED = "G-05. Each step that changes the space or a board's access does it, or refuses only for its own reason";

class CheckFailed extends Error {}
function check(holds: boolean, rule: string, detail: unknown): void {
  if (!holds) throw new CheckFailed(`${rule}\n${JSON.stringify(detail, null, 2)}`);
}

/** Each sequence gets its own people, space, and boards, so each needs IDs no earlier one used. */
let worldsMade = 0;

/** The person's role on the board, counted again from the tables, as architecture §7, point 4, says it is found. */
async function roleFromTables(client: pg.Client, boardId: string, account: string): Promise<{ role: Role | null; viaSpace: boolean; sharedWithSpace: boolean; inSpace: boolean }> {
  const board = (await client.query("select general_access, link_role, space_id from board where id = $1", [boardId])).rows[0];
  const member = (await client.query("select role from board_member where board_id = $1 and account_id = $2", [boardId, account])).rows[0];
  const inSpace =
    board.space_id !== null &&
    (await client.query("select 1 from space_member sm join space s on s.id = sm.space_id where sm.space_id = $1 and sm.account_id = $2 and s.deleted_at is null", [board.space_id, account])).rowCount === 1;
  const sharedWithSpace = board.general_access === "space" && board.space_id !== null;
  if (member && (ROLES as readonly string[]).includes(member.role)) return { role: member.role as Role, viaSpace: false, sharedWithSpace, inSpace };
  if (sharedWithSpace && inSpace) return { role: board.link_role as Role, viaSpace: true, sharedWithSpace, inSpace };
  if (board.general_access === "link") return { role: board.link_role as Role, viaSpace: false, sharedWithSpace, inSpace };
  return { role: null, viaSpace: false, sharedWithSpace, inSpace };
}

/** Plays one sequence against this copy of the code, checking every person and board after setting up and after each step. */
export async function playSpaces(code: SpaceCode, { db, client }: { db: Db; client: pg.Client }, steps: SpaceStep[]): Promise<void> {
  const ids = createSeededIds(++worldsMade * 4801);
  const clock = createFakeClock(new Date(NOON));
  const services = { db, clock };
  const people: string[] = [];
  for (let index = 0; index < PEOPLE; index++) people.push(await addAccount(client, ids, `sp${index}`, { confirmed: true }));
  const names: string[] = [];
  for (const id of people) names.push((await client.query("select username from account where id = $1", [id])).rows[0].username);
  const owner = people[0]!;
  const space = await addSpace(client, ids, owner, { name: `Space world ${worldsMade}` });
  await addSpaceMember(client, space, people[1]!, "member");
  await addSpaceMember(client, space, people[2]!, "admin");

  // Every board starts in the space, open only to invited people.
  const boards: { id: string; options: string[] }[] = [];
  for (let index = 0; index < BOARDS; index++) {
    const id = await createBoard(db, clock, ids, owner, { question: `Space world ${worldsMade} board ${index}?`, options: ["Yes", "No"], access: { general: "invited", linkRole: "voter" } });
    await code.sharing.setBoardSpace(services, id, owner, space);
    const options = (await client.query("select id from option where board_id = $1 order by position", [id])).rows.map((row) => row.id as string);
    boards.push({ id, options });
  }

  const everyone = async (after: SpaceStep | "setup") => {
    for (const [index, account] of people.entries()) {
      const listed = new Set((await code.list.listBoards(db, clock, account)).boards.map((each) => each.id));
      for (const [boardIndex, each] of boards.entries()) {
        const counted = await roleFromTables(client, each.id, account);
        const entry = await code.access.entryTo(db, each.id, account);
        const outsider = counted.sharedWithSpace && !counted.inSpace && counted.role === null;
        const detail = { after, person: index, board: boardIndex, counted, entry, listed: listed.has(each.id) };
        if (outsider) check(entry.role === null && !listed.has(each.id), NO_NON_MEMBER_READS_A_SPACE_BOARD, detail);
        // A member of the space gets the board's role for the space, and finds the board.
        if (counted.viaSpace) check(entry.role === counted.role && !entry.joiningByLink && listed.has(each.id), NO_NON_MEMBER_READS_A_SPACE_BOARD, detail);
      }
    }
  };

  await everyone("setup");
  for (const step of steps) {
    switch (step.kind) {
      // Each step must do what it asks, or refuse only for its own reason, so a step that quietly does nothing fails the run.
      case "invite": {
        // Lowercased, as the route's spaceInviteInput does: the service matches lower(username).
        const result = await code.spaces.inviteToSpace(services, space, owner, names[step.person]!.toLowerCase(), "member");
        check(result.status === "done" || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, result });
        break;
      }
      case "remove": {
        const result = await code.spaces.removeFromSpace(services, space, owner, people[step.person]!);
        check(result.status === "done" || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, result });
        break;
      }
      case "general": {
        const on = boards[step.board]!.id;
        const inTheSpace = (await client.query("select space_id from board where id = $1", [on])).rows[0].space_id !== null;
        const result = await code.sharing.setAccess(services, on, owner, { general: step.general, linkRole: step.role });
        const refusedForNoSpace = result.status === "refused" && result.reason === "no_space" && step.general === "space" && !inTheSpace;
        check(result.status === "done" || result.status === "already_done" || refusedForNoSpace, STEP_DID_WHAT_IT_ASKED, { step, inTheSpace, result });
        if (step.general === "space" && !inTheSpace) check(refusedForNoSpace, STEP_DID_WHAT_IT_ASKED, { step, inTheSpace, result });
        break;
      }
      case "move": {
        const result = await code.sharing.setBoardSpace(services, boards[step.board]!.id, owner, step.inSpace ? space : null);
        check(result.status === "done" || result.status === "already_done", STEP_DID_WHAT_IT_ASKED, { step, result });
        break;
      }
      case "open": {
        // As the board route lets a reader in (app.ts's letIn): someone coming by the link is recorded then.
        const entry = await code.access.entryTo(db, boards[step.board]!.id, people[step.person]!);
        if (entry.joiningByLink) await code.access.joinByLink(db, clock, boards[step.board]!.id, people[step.person]!);
        break;
      }
      case "write": {
        const on = boards[step.board]!;
        const writer = people[step.person]!;
        const counted = await roleFromTables(client, on.id, writer);
        const result = await code.writing.addArgument(services, on.id, writer, { id: ids.itemId(), optionId: on.options[0]!, versionId: ids.itemId(), wording: "A new argument holds here.", context: "" });
        const allowed = counted.role !== null && ROLES.indexOf(counted.role) >= ROLES.indexOf("contributor");
        check(result.status !== "done" || allowed, NO_WRITE_WITHOUT_A_ROLE, { step, counted, result });
        break;
      }
    }
    clock.advance(1000);
    await everyone(step);
  }
}

/** Runs random sequences; fast-check reports the seed and the shrunk sequence if a check fails. */
export async function runSpaces(code: SpaceCode, connection: { db: Db; client: pg.Client }, options: { numRuns: number; seed?: number }): Promise<void> {
  await fc.assert(
    fc.asyncProperty(fc.array(spaceStepArbitrary, { maxLength: 20 }), async (steps) => {
      await playSpaces(code, connection, steps);
    }),
    { numRuns: options.numRuns, ...(options.seed === undefined ? {} : { seed: options.seed }) },
  );
}
