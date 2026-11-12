// A demo board to open with `npm run dev`, and the board the browser tests
// start from. People, the board, and its options go straight into the
// database, because nothing in M0 creates them; everything after that goes
// through the same service functions the API uses.

import { sql } from "kysely";
import type { Clock, IdSource } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import { publishOrderIfDue } from "./order.ts";
import { setArticulation, setImportance } from "./votes.ts";
import { addArgument, addWording } from "./writing.ts";
import type { WriteResult } from "./write-path.ts";

/** The demo board's link: /b/demo-board-1. */
export const DEMO_BOARD = "demo-board-1";

/** The test accounts, in the order the switch lists them. */
export const DEMO_PEOPLE = ["jordan_w", "lin.zhao", "maya.chen", "omar_h", "tess.b"] as const;
export type DemoPerson = (typeof DEMO_PEOPLE)[number];

export interface DemoBoard {
  board: string;
  people: Record<DemoPerson, string>;
  options: { yes: string; no: string };
}

/** Each argument: who wrote its wordings, best first. */
const ARGUMENTS: { option: "yes" | "no"; wordings: [[DemoPerson, string], ...[DemoPerson, string][]]; importance: Partial<Record<DemoPerson, 1 | -1>> }[] = [
  {
    option: "yes",
    wordings: [
      ["maya.chen", "Sunday is the only free day for many people who work weekdays."],
      ["omar_h", "Shift workers can only come on Sundays."],
    ],
    importance: { "maya.chen": 1, omar_h: 1, "lin.zhao": 1 },
  },
  { option: "yes", wordings: [["lin.zhao", "Students need a quiet place to study before Monday exams."]], importance: { "tess.b": 1, omar_h: 1 } },
  { option: "yes", wordings: [["tess.b", "Families could visit together on the one day nobody has school or work."]], importance: { jordan_w: 1 } },
  {
    option: "no",
    wordings: [
      ["omar_h", "Staff need a guaranteed day off."],
      ["jordan_w", "Library staff already work Saturdays, so Sunday would leave them no weekend."],
    ],
    importance: { "maya.chen": 1, jordan_w: 1, "tess.b": 1 },
  },
  { option: "no", wordings: [["jordan_w", "Opening a seventh day costs more than the budget allows."]], importance: { "lin.zhao": 1 } },
  { option: "no", wordings: [["tess.b", "Few people would come, judging by Saturday afternoons."]], importance: { "maya.chen": -1 } },
];

/** Builds the demo board in an empty, migrated database. */
export async function seedDemoBoard(db: Db, clock: Clock, ids: IdSource): Promise<DemoBoard> {
  const people = {} as Record<DemoPerson, string>;
  for (const name of DEMO_PEOPLE) people[name] = ids.itemId();
  const options = { yes: ids.itemId(), no: ids.itemId() };

  await db.transaction().execute(async (trx) => {
    await trx.insertInto("account").values(DEMO_PEOPLE.map((name) => ({ id: people[name], username: name, created_at: clock.now() }))).execute();
    await trx.insertInto("board").values({ id: DEMO_BOARD, question: "Should our library open on Sundays?", created_by: people["maya.chen"], created_at: clock.now() }).execute();
    const seq = Number((await sql<{ seq: string }>`select take_change_number(${DEMO_BOARD}) as seq`.execute(trx)).rows[0]!.seq);
    await trx
      .insertInto("option")
      .values([
        { id: options.yes, board_id: DEMO_BOARD, name: "Yes", position: 1, created_at: clock.now(), changed_seq: seq },
        { id: options.no, board_id: DEMO_BOARD, name: "No", position: 2, created_at: clock.now(), changed_seq: seq },
      ])
      .execute();
  });

  const services = { db, clock };
  for (const argument of ARGUMENTS) {
    const argumentId = ids.itemId();
    const [[firstAuthor, firstWording], ...more] = argument.wordings;
    const first = ids.itemId();
    ok(await addArgument(services, DEMO_BOARD, people[firstAuthor], { id: argumentId, optionId: options[argument.option], versionId: first, wording: firstWording, context: "" }));
    const versions = [first];
    for (const [author, wording] of more) {
      const id = ids.itemId();
      ok(await addWording(services, DEMO_BOARD, people[author], argumentId, { id, wording, context: "" }));
      versions.push(id);
    }
    for (const [person, value] of Object.entries(argument.importance) as [DemoPerson, 1 | -1][]) {
      ok(await setImportance(services, DEMO_BOARD, people[person], argumentId, value));
    }
    // The first wording is the better articulated one.
    if (versions.length > 1) ok(await setArticulation(services, DEMO_BOARD, people["tess.b"], versions[0]!, 1));
  }
  await publishOrderIfDue(db, clock, DEMO_BOARD);
  return { board: DEMO_BOARD, people, options };
}

function ok(result: WriteResult): void {
  if (result.status !== "done") throw new Error(`Seeding the demo board failed: ${JSON.stringify(result)}`);
}
