// The simulation's profile reads (L-03, M3d-16; plans/architecture.md §8 and
// §7 "Who sees what about people"). A small world of its own, beside world.ts
// rather than in it, so the existing random sequences stay as they were: four
// people and three boards, one open only to invited people and two open to
// anyone with the link. Random steps open boards by their link, invite and
// remove people, turn links off and on, write arguments, and hide wordings.
// After every step, every person reads every profile, and one check must
// always hold: no profile shows an item from a board where the viewer has no
// role, counted again here from the board_member table.

import fc from "fast-check";
import type pg from "pg";
import { ROLES } from "@steelman/shared";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import type { Db } from "../../src/db/database.ts";
import type * as ProfilesModule from "../../src/profiles.ts";
import { joinByLink } from "../../src/access.ts";
import { createBoard } from "../../src/boards.ts";
import * as moderation from "../../src/moderation.ts";
import * as sharing from "../../src/sharing.ts";
import * as writing from "../../src/writing.ts";
import { NOON, addAccount } from "../support/board.ts";

export type ProfileStep =
  | { kind: "join"; person: number; board: number }
  | { kind: "invite"; person: number; board: number }
  | { kind: "remove"; person: number; board: number }
  | { kind: "link"; board: number; on: boolean }
  | { kind: "write"; person: number; board: number }
  | { kind: "hide"; board: number; target: number };

const PEOPLE = 4;
const BOARDS = 3;
const person = fc.nat(PEOPLE - 1);
const board = fc.nat(BOARDS - 1);

export const profileStepArbitrary: fc.Arbitrary<ProfileStep> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("join" as const), person, board }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("invite" as const), person, board }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("remove" as const), person, board }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("link" as const), board, on: fc.boolean() }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("write" as const), person, board }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("hide" as const), board, target: fc.nat(5) }) },
);

export const NO_ITEM_FROM_A_BOARD_WITHOUT_A_ROLE = "L-03. No profile shows an item from a board where the viewer has no role";

class CheckFailed extends Error {}
function check(holds: boolean, rule: string, detail: unknown): void {
  if (!holds) throw new CheckFailed(`${rule}\n${JSON.stringify(detail, null, 2)}`);
}

/** Each sequence gets its own people and boards, so each needs IDs no earlier one used. */
let worldsMade = 0;

/** Plays one sequence against this copy of profiles.ts, checking every profile after setting up and after each step. */
export async function playProfiles(profiles: typeof ProfilesModule, { db, client }: { db: Db; client: pg.Client }, steps: ProfileStep[]): Promise<void> {
  const ids = createSeededIds(++worldsMade * 4243);
  const clock = createFakeClock(new Date(NOON));
  const services = { db, clock };
  const people: string[] = [];
  for (let index = 0; index < PEOPLE; index++) people.push(await addAccount(client, ids, `pf${index}`, { confirmed: true }));
  const names: string[] = [];
  for (const id of people) names.push((await client.query("select username from account where id = $1", [id])).rows[0].username);

  // Board k is owned by person k: board 0 is open only to invited people, the others to anyone with the link.
  const boards: { id: string; owner: string; options: string[]; versions: string[] }[] = [];
  for (let index = 0; index < BOARDS; index++) {
    const owner = people[index]!;
    const id = await createBoard(db, clock, ids, owner, {
      question: `Profile world ${worldsMade} board ${index}?`,
      options: ["Yes", "No"],
      access: { general: index === 0 ? "invited" : "link", linkRole: "contributor" },
    });
    const options = (await client.query("select id from option where board_id = $1 order by position", [id])).rows.map((row) => row.id as string);
    boards.push({ id, owner, options, versions: [] });
  }

  const write = async (by: string, on: (typeof boards)[number]) => {
    const versionId = ids.itemId();
    const result = await writing.addArgument(services, on.id, by, { id: ids.itemId(), optionId: on.options[on.versions.length % 2]!, versionId, wording: `Argument ${versionId.slice(0, 6)} holds.`, context: "" });
    if (result.status === "done") on.versions.push(versionId);
  };
  for (const each of boards) await write(each.owner, each);

  const everyProfile = async (after: ProfileStep | "setup") => {
    for (const [viewerIndex, viewer] of people.entries()) {
      const roles = await client.query(
        `select m.board_id from board_member m join board b on b.id = m.board_id
          where m.account_id = $1 and b.deleted_at is null and m.role = any($2)`,
        [viewer, [...ROLES]],
      );
      const mine = new Set(roles.rows.map((row) => row.board_id as string));
      for (const name of names) {
        const answer = await profiles.readProfile(db, clock, viewer, name);
        if (answer === null || answer === "signed_out") throw new Error(`The profile of ${name} didn't answer for viewer ${viewerIndex}`);
        for (const item of [...answer.arguments, ...answer.wordings, ...answer.sources]) {
          check(mine.has(item.board), NO_ITEM_FROM_A_BOARD_WITHOUT_A_ROLE, { after, viewer: viewerIndex, profile: name, item, viewerBoards: [...mine] });
        }
      }
    }
  };

  await everyProfile("setup");
  for (const step of steps) {
    const on = boards[step.board]!;
    switch (step.kind) {
      case "join":
        await joinByLink(db, clock, on.id, people[step.person]!);
        break;
      case "invite":
        await sharing.inviteByUsername(services, on.id, on.owner, names[step.person]!, "contributor");
        break;
      case "remove":
        await sharing.removeMember(services, on.id, on.owner, people[step.person]!);
        break;
      case "link":
        await sharing.setAccess(services, on.id, on.owner, { general: step.on ? "link" : "invited", linkRole: "contributor" });
        break;
      case "write":
        await write(people[step.person]!, on);
        break;
      case "hide": {
        const version = on.versions[step.target % Math.max(on.versions.length, 1)];
        if (version) await moderation.hideWording(services, on.id, on.owner, version, "offtopic");
        break;
      }
    }
    clock.advance(1000);
    await everyProfile(step);
  }
}

/** Runs random sequences; fast-check reports the seed and the shrunk sequence if the check fails. */
export async function runProfiles(profiles: typeof ProfilesModule, connection: { db: Db; client: pg.Client }, options: { numRuns: number; seed?: number }): Promise<void> {
  await fc.assert(
    fc.asyncProperty(fc.array(profileStepArbitrary, { maxLength: 16 }), async (steps) => {
      await playProfiles(profiles, connection, steps);
    }),
    { numRuns: options.numRuns, ...(options.seed === undefined ? {} : { seed: options.seed }) },
  );
}
