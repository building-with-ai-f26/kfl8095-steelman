// The prototype's example boards, for `npm run db:seed` (M1-6), so a local
// database looks like the prototype: docs/prototype/source/steelman-refined.html
// (seedDocs and seedCards), copied on Nov 14. The people who wrote them become
// test accounts. Left out for now: sources and evidence votes (with M1-9), comments
// (T3), the AI-drafted argument (T3), and spaces (T4). The prototype's own
// "you" is riley_park here, so the seed doesn't take a username the builder
// might choose when signing in locally.
//
// Importance in the prototype is a score; here it's that many votes divided
// by four (the seed has 17 people, and a board's order comes from votes), so
// each option's arguments keep the prototype's order. A wording's articulation
// is half its score, the same way.

import { sql } from "kysely";
import type { Clock, IdSource } from "@steelman/shared";
import { createBoard } from "./boards.ts";
import type { Db } from "./db/database.ts";
import { publishOrderIfDue } from "./order.ts";
import { setArticulation, setImportance } from "./votes.ts";
import { addArgument, addWording } from "./writing.ts";
import type { WriteResult } from "./write-path.ts";

/** A wording: who wrote it, what it says, and its articulation score in the prototype. */
type Wording = [author: string, text: string, articulation: number];

export interface ExampleBoard {
  /** A fixed ID, so its link is the same in every local database. */
  id: string;
  question: string;
  owner: string;
  /** Open to anyone with the link (as Contributor), or only to its owner. */
  open: boolean;
  options: { name: string; arguments: { importance: number; wordings: [Wording, ...Wording[]] }[] }[];
}

export const EXAMPLE_BOARDS: ExampleBoard[] = [
  {
    id: "example-0001",
    question: "Is open-weight AI a smart bet for China?",
    owner: "riley_park",
    open: true,
    options: [
      { name: "Why it makes sense", arguments: [
        { importance: 44, wordings: [["maya.chen", "If the best open-weight models were American, China’s AI would be built on them. Releasing its own keeps China’s stack independent of US companies.", 24], ["omar_h", "Without its own open models, China would be completely dependent on American AI.", 7], ["priya_s", "Chinese developers built on Meta’s Llama in 2023 and 2024, and in July 2024 OpenAI cut off API access from China.", 5]] },
        { importance: 39, wordings: [["jordan_w", "A closed Chinese model could reach Western users only as a service run from China, which governments and companies avoid. Open weights run on their own servers.", 19], ["tess.b", "Closed Chinese models wouldn’t be used in the West, because no one wants to send their data to a .cn service.", 6]] },
        { importance: 30, wordings: [["riley_park", "China controls AI where it’s deployed: every public AI service must be filed with regulators, so open weights cost it little control at home.", 10]] },
        { importance: 16, wordings: [["maya.chen", "Open release has made Chinese models among the most built-on in the world, which gives China influence over AI tools and norms.", 8]] },
        { importance: 3, wordings: [["dev_oka17", "Nobody abroad will trust a Chinese AI service, but they’ll happily download free weights.", 1]] },
      ] },
      { name: "Why it might not", arguments: [
        { importance: 41, wordings: [["priya_s", "Open weights earn nothing directly, and anyone can host them, so the money from serving Chinese models can go to other companies’ clouds.", 17], ["omar_h", "They don’t make any money directly from open weights.", 9]] },
        { importance: 33, wordings: [["jordan_w", "Open weights don’t fix the trust problem: US agencies treat Chinese models as risky wherever they run.", 14]] },
        { importance: 28, wordings: [["samr_92", "Anyone can modify open weights and strip out what China’s rules require, so its control over its own models is fragile, however strict the regulations.", 6]] },
        { importance: 25, wordings: [["tess.b", "Releasing weights hands China’s best work to its rivals, including their militaries, with no way to take it back.", 4]] },
        { importance: 12, wordings: [["lin.zhao", "The strategy is subsidized and may not last: Beijing could restrict releases once the market consolidates.", 3]] },
      ] },
    ],
  },
  {
    id: "example-0002",
    question: "Should capstone teams be allowed to ship AI-written code?",
    owner: "maya.chen",
    open: true,
    options: [
      { name: "Allow it, with disclosure", arguments: [
        { importance: 34, wordings: [["priya_s", "Disclosure keeps grading honest while letting teams build the way they will at work.", 0]] },
        { importance: 22, wordings: [["tess.b", "A ban is hard to enforce; disclosure at least makes AI use visible.", 0]] },
      ] },
      { name: "Require hand-written code", arguments: [
        { importance: 29, wordings: [["riley_park", "Students can’t defend design trade-offs in code they didn’t write.", 0]] },
      ] },
    ],
  },
  {
    id: "example-0003",
    question: "Should we replace daily standups with written updates?",
    owner: "priya_s",
    open: true,
    options: [
      { name: "Go async", arguments: [
        { importance: 18, wordings: [["alexkim.dev", "Written updates free a fixed meeting slot for a team spread over four time zones.", 0]] },
        { importance: 11, wordings: [["june.o", "A written log shows who was blocked, days later.", 0]] },
      ] },
      { name: "Keep live standups", arguments: [
        { importance: 15, wordings: [["bo_lindqvist", "Live standups surface blockers people don’t think to write down.", 0]] },
        { importance: 6, wordings: [["rafa_m", "New hires pick up team norms faster by hearing them daily.", 0]] },
      ] },
      { name: "Two live days, three written", arguments: [
      ] },
    ],
  },
  {
    id: "example-0004",
    question: "Should 7th Avenue get a protected bike lane?",
    owner: "dev_oka17",
    open: true,
    options: [
      { name: "Build the protected lane", arguments: [
        { importance: 61, wordings: [["kwame_b", "Protected lanes cut injuries on comparable avenues.", 0]] },
        { importance: 33, wordings: [["riley_park", "A continuous lane connects the two park entrances.", 0]] },
        { importance: 18, wordings: [["ana.lu", "Delivery loading zones can be kept on side streets.", 0]] },
      ] },
      { name: "Keep parking, paint a lane", arguments: [
        { importance: 47, wordings: [["kwame_b", "Shops on the avenue depend on short-stay parking.", 0]] },
      ] },
    ],
  },
  {
    id: "example-0005",
    question: "Should intro courses grade on a curve?",
    owner: "samr_92",
    open: true,
    options: [
      { name: "Grade on a curve", arguments: [
        { importance: 40, wordings: [["kt_nguyen", "A curve corrects for an exam that turned out harder than intended.", 0]] },
        { importance: 21, wordings: [["kt_nguyen", "Curving keeps grades comparable across sections with different instructors.", 0]] },
      ] },
      { name: "Grade against fixed standards", arguments: [
        { importance: 44, wordings: [["bwells", "Fixed standards let every student succeed without competing with classmates.", 0]] },
        { importance: 27, wordings: [["bwells", "Curves discourage studying together.", 0]] },
        { importance: 13, wordings: [["bwells", "A fixed rubric tells students what they need to learn.", 0]] },
      ] },
    ],
  },
  {
    id: "example-0006",
    question: "Should small teams adopt a four-day work week?",
    owner: "alexkim.dev",
    open: true,
    options: [
      { name: "Adopt it", arguments: [
        { importance: 52, wordings: [["june.o", "Trials report similar output with less burnout.", 0]] },
        { importance: 23, wordings: [["june.o", "A shorter week is a hiring advantage small teams can afford.", 0]] },
      ] },
      { name: "Keep five days", arguments: [
        { importance: 31, wordings: [["june.o", "Customers still expect Friday replies, and a small team has little cover.", 0]] },
      ] },
    ],
  },
  {
    id: "example-0007",
    question: "Should I take the job offer in Denver?",
    owner: "riley_park",
    open: false,
    options: [
      { name: "Take the offer", arguments: [
        { importance: 3, wordings: [["riley_park", "The role is a step up I would otherwise wait two years for.", 0]] },
      ] },
      { name: "Stay in New York", arguments: [
      ] },
    ],
  },
];

/** Everyone who owns or wrote on an example board: the seed's test accounts, in name order. */
export const EXAMPLE_PEOPLE: string[] = [
  ...new Set(EXAMPLE_BOARDS.flatMap((board) => [board.owner, ...board.options.flatMap((o) => o.arguments.flatMap((a) => a.wordings.map(([author]) => author)))])),
].sort();

/**
 * Adds the example boards and their people to a migrated database. A board
 * that's already there is left as it is, and a test account with the same
 * username is used rather than made again, so running it twice adds nothing.
 * It stops, before writing anything, if a real account (one with an email)
 * has one of its usernames. A run that fails partway leaves that board
 * half-made, and a later run leaves it so: start from a fresh database.
 *
 * @returns The IDs of the boards it added.
 */
export async function seedExampleBoards(db: Db, clock: Clock, ids: IdSource): Promise<string[]> {
  const person: Record<string, string> = {};
  // Usernames are unique ignoring capitals, so look them up the same way. A test account has no email; one with
  // an email is a real person who signed in and chose the name, and the seed never writes as them. All are
  // checked before anything is written.
  const found = new Map<string, { id: string; email: string | null }>();
  for (const name of EXAMPLE_PEOPLE) {
    const account = await db.selectFrom("account").select(["id", "email"]).where(sql`lower(username)`, "=", name.toLowerCase()).executeTakeFirst();
    if (account) found.set(name, account);
  }
  const taken = [...found].filter(([, account]) => account.email !== null).map(([name]) => name);
  if (taken.length > 0) throw new Error(`The seed's usernames ${taken.join(", ")} belong to real accounts (with an email) here. Rename them, or use a fresh database.`);
  for (const name of EXAMPLE_PEOPLE) {
    person[name] = found.get(name)?.id ?? ids.itemId();
    if (!found.has(name)) await db.insertInto("account").values({ id: person[name], username: name, created_at: clock.now() }).execute();
  }

  const services = { db, clock };
  const added: string[] = [];
  for (const example of EXAMPLE_BOARDS) {
    if (await db.selectFrom("board").select("id").where("id", "=", example.id).executeTakeFirst()) continue;
    const access = example.open ? ({ general: "link", linkRole: "contributor" } as const) : ({ general: "invited", linkRole: "contributor" } as const);
    await createBoard(db, clock, ids, person[example.owner]!, { question: example.question, options: example.options.map((o) => o.name), access }, example.id);
    // On an open board, everyone in the seed was invited to contribute; a private board is its owner's alone.
    const others = example.open ? EXAMPLE_PEOPLE.filter((name) => name !== example.owner) : [];
    if (others.length > 0) {
      await db
        .insertInto("board_member")
        .values(others.map((name) => ({ board_id: example.id, account_id: person[name]!, role: "contributor", joined_via: "invite", joined_at: clock.now() })))
        .execute();
    }
    const voters = example.open ? EXAMPLE_PEOPLE : [example.owner];
    const optionIds = (await db.selectFrom("option").select("id").where("board_id", "=", example.id).orderBy("position").execute()).map((o) => o.id);

    let turn = 0;
    for (const [o, option] of example.options.entries()) {
      for (const argument of option.arguments) {
        const argumentId = ids.itemId();
        const versionIds: string[] = [];
        for (const [w, [author, text]] of argument.wordings.entries()) {
          const id = ids.itemId();
          versionIds.push(id);
          ok(
            w === 0
              ? await addArgument(services, example.id, person[author]!, { id: argumentId, optionId: optionIds[o]!, versionId: id, wording: text, context: "" })
              : await addWording(services, example.id, person[author]!, argumentId, { id, wording: text, context: "" }),
          );
        }
        // Different people vote on different arguments, so no one person has voted on everything.
        const pick = (count: number) => Array.from({ length: Math.min(count, voters.length) }, (_, i) => voters[(turn + i) % voters.length]!);
        for (const voter of pick(Math.round(argument.importance / 4))) ok(await setImportance(services, example.id, person[voter]!, argumentId, 1));
        if (argument.wordings.length > 1) {
          for (const [w, [, , articulation]] of argument.wordings.entries()) {
            for (const voter of pick(Math.round(articulation / 2))) ok(await setArticulation(services, example.id, person[voter]!, versionIds[w]!, 1));
          }
        }
        turn += 3;
      }
    }
    await publishOrderIfDue(db, clock, example.id);
    added.push(example.id);
  }
  return added;
}

function ok(result: WriteResult): void {
  if (result.status !== "done") throw new Error(`Seeding an example board failed: ${JSON.stringify(result)}`);
}
