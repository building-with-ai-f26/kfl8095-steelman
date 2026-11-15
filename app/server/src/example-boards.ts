// The prototype's example boards, for `npm run db:seed` (M1-6), so a local
// database looks like the prototype: docs/prototype/source/steelman-refined.html
// (seedDocs and seedCards), copied on Nov 14. The people who wrote them become
// test accounts. The first board's sources and evidence assessments came with
// M1-9. Left out for now: the prototype's unavailable source (marking one
// unavailable comes with M2), comments (T3), the AI-drafted argument (T3), and
// spaces (T4). The prototype's own
// "you" is riley_park here, so the seed doesn't take a username the builder
// might choose when signing in locally.
//
// Importance in the prototype is a score; here it's that many votes divided
// by four (the seed has 17 people, and a board's order comes from votes), so
// each option's arguments keep the prototype's order. A wording's articulation
// is half its score, the same way. Its assessments are the prototype's yes
// and no counts, scaled down to the seed's people where they'd need more.

import { sql } from "kysely";
import type { Clock, IdSource } from "@steelman/shared";
import { createBoard } from "./boards.ts";
import type { Db } from "./db/database.ts";
import { publishOrderIfDue } from "./order.ts";
import { addSource, citeSource } from "./sources.ts";
import { setArticulation, setAssessment, setImportance } from "./votes.ts";
import { addArgument, addWording } from "./writing.ts";
import type { WriteResult } from "./write-path.ts";

/** A wording: who wrote it, what it says, its articulation score in the prototype, and the sources it cites with its assessments there. */
type Wording = [author: string, text: string, articulation: number, evidence?: Evidence];

interface Evidence {
  sources: (keyof typeof EXAMPLE_SOURCES)[];
  yes: number;
  no: number;
}

/**
 * The prototype's sources (seedSources), as it words them. Its locators are
 * descriptions rather than links, so they show as text. Each was added by the
 * first person whose wording cites it, or by riley_park where the prototype's
 * "you" added it.
 */
export const EXAMPLE_SOURCES = {
  openaiblock: { addedBy: "maya.chen", name: "OpenAI blocks API access from China", locator: "Bloomberg, June 25, 2024; in effect July 9, 2024", finding: "OpenAI told developers in China it would block their API access from July 9, 2024. Alibaba and Zhipu invited them to switch to domestic models." },
  metaclosed: { addedBy: "maya.chen", name: "Meta weighs closing its frontier model", locator: "New York Times, July 14, 2025; Zuckerberg remarks, July 30, 2025", finding: "Meta’s superintelligence lab discussed not releasing its most powerful model openly; Zuckerberg later said Meta would be careful about what it open-sources." },
  llamachina: { addedBy: "priya_s", name: "Chinese labs and Meta’s Llama", locator: "South China Morning Post and TechNode reporting, 2023–2024", finding: "Chinese firms used Llama in 2023 and 2024 to build their own models; 01.AI’s Yi used Llama’s architecture and later credited it." },
  deepseekbans: { addedBy: "jordan_w", name: "Restrictions on DeepSeek’s app", locator: "Italy’s data regulator, January 30, 2025; Australian and Taiwanese government-device bans; DeepSeek privacy policy", finding: "DeepSeek’s privacy policy says user data is stored in China. Italy’s regulator ordered it to stop processing Italians’ data, and several governments banned it on official devices." },
  clouds: { addedBy: "riley_park", name: "US clouds host DeepSeek-R1", locator: "AWS and Microsoft announcements, January 2025", finding: "Amazon Bedrock and Microsoft’s Azure AI Foundry offered DeepSeek-R1, running on their own infrastructure." },
  airbnb: { addedBy: "riley_park", name: "Airbnb’s customer-service agent", locator: "Bloomberg, October 2025", finding: "Airbnb’s CEO said its agent relies heavily on Alibaba’s Qwen because it is fast and cheap; the agent uses 13 models in all." },
  genaimeasures: { addedBy: "riley_park", name: "Interim Measures for Generative AI Services", locator: "Cyberspace Administration of China and other agencies, 2023, Article 2", finding: "The rules apply to generative AI services offered to the public in mainland China, and exclude research and development not offered to the public." },
  cacfilings: { addedBy: "riley_park", name: "Generative AI service filings", locator: "Cyberspace Administration of China, as of June 30, 2025", finding: "439 generative AI services had completed filing with the regulator, and 233 apps or features built on them had registered." },
  aiplus: { addedBy: "maya.chen", name: "“AI+” action plan", locator: "State Council of China, August 2025", finding: "The plan lists building an open-source ecosystem among its priorities, including communities and projects with international influence." },
  haibrief: { addedBy: "maya.chen", name: "“Beyond DeepSeek” policy brief", locator: "Stanford HAI and DigiChina, December 2025", finding: "Chinese open-weight models seem to have caught up with or pulled ahead of others in capability and adoption; how labs will make money from them remains uncertain." },
  ipolosses: { addedBy: "priya_s", name: "Zhipu and MiniMax IPO filings", locator: "Hong Kong listings, 2026", finding: "Both Chinese model makers reported losses far larger than their revenue before listing." },
  deepseekmargin: { addedBy: "omar_h", name: "DeepSeek’s inference cost disclosure", locator: "DeepSeek, March 1, 2025", finding: "DeepSeek said its theoretical daily cost-profit ratio for serving V3 and R1 was 545% if every user paid, and that actual revenue is much lower." },
  caisi: { addedBy: "jordan_w", name: "Evaluation of DeepSeek models", locator: "NIST Center for AI Standards and Innovation, September 30, 2025", finding: "The US evaluation found DeepSeek models trailed US models, were far more vulnerable to agent hijacking and jailbreaks, and repeated misleading CCP narratives about four times as often." },
  noadversarial: { addedBy: "jordan_w", name: "“No Adversarial AI Act”", locator: "Introduced in Congress, June 2025", finding: "A bipartisan bill would bar federal agencies from buying or using AI models from China and other adversary countries, kept on a public list." },
  r1776: { addedBy: "samr_92", name: "R1 1776: DeepSeek-R1 with its censorship removed", locator: "Perplexity, February 2025; weights published on Hugging Face", finding: "Perplexity post-trained DeepSeek-R1 on about 300 topics it identified as censored by the CCP, and released the modified weights; it reported that reasoning ability was unaffected." },
  finetune: { addedBy: "samr_92", name: "Research on fine-tuning away safeguards", locator: "e.g. Qi et al., 2023, “Fine-tuning Aligned Language Models Compromises Safety”", finding: "Safety training in a model can be weakened with a small amount of further fine-tuning." },
  plallama: { addedBy: "tess.b", name: "Military model built on Llama 2", locator: "Reuters, November 2024", finding: "Researchers linked to China’s military built a military-focused model on Meta’s Llama 2, despite a license forbidding military use." },
  takshashila: { addedBy: "lin.zhao", name: "“Why Is China Giving Away Its AI Models?”", locator: "Takshashila Institution, August 2026", finding: "The paper argues consolidation and market saturation could lead Beijing to restrict releases, possibly around late 2028." },
} satisfies Record<string, { addedBy: string; name: string; locator: string; finding: string }>;

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
        { importance: 44, wordings: [["maya.chen", "If the best open-weight models were American, China’s AI would be built on them. Releasing its own keeps China’s stack independent of US companies.", 24, { sources: ["openaiblock", "metaclosed"], yes: 14, no: 6 }], ["omar_h", "Without its own open models, China would be completely dependent on American AI.", 7, { sources: ["openaiblock"], yes: 1, no: 9 }], ["priya_s", "Chinese developers built on Meta’s Llama in 2023 and 2024, and in July 2024 OpenAI cut off API access from China.", 5, { sources: ["llamachina", "openaiblock"], yes: 4, no: 0 }]] },
        { importance: 39, wordings: [["jordan_w", "A closed Chinese model could reach Western users only as a service run from China, which governments and companies avoid. Open weights run on their own servers.", 19, { sources: ["deepseekbans", "clouds", "airbnb"], yes: 16, no: 4 }], ["tess.b", "Closed Chinese models wouldn’t be used in the West, because no one wants to send their data to a .cn service.", 6, { sources: ["deepseekbans"], yes: 3, no: 7 }]] },
        { importance: 30, wordings: [["riley_park", "China controls AI where it’s deployed: every public AI service must be filed with regulators, so open weights cost it little control at home.", 10, { sources: ["genaimeasures", "cacfilings"], yes: 15, no: 2 }]] },
        { importance: 16, wordings: [["maya.chen", "Open release has made Chinese models among the most built-on in the world, which gives China influence over AI tools and norms.", 8, { sources: ["haibrief", "aiplus"], yes: 7, no: 5 }]] },
        { importance: 3, wordings: [["dev_oka17", "Nobody abroad will trust a Chinese AI service, but they’ll happily download free weights.", 1]] },
      ] },
      { name: "Why it might not", arguments: [
        { importance: 41, wordings: [["priya_s", "Open weights earn nothing directly, and anyone can host them, so the money from serving Chinese models can go to other companies’ clouds.", 17, { sources: ["clouds", "ipolosses"], yes: 12, no: 3 }], ["omar_h", "They don’t make any money directly from open weights.", 9, { sources: ["deepseekmargin"], yes: 5, no: 4 }]] },
        { importance: 33, wordings: [["jordan_w", "Open weights don’t fix the trust problem: US agencies treat Chinese models as risky wherever they run.", 14, { sources: ["caisi", "noadversarial"], yes: 13, no: 2 }]] },
        { importance: 28, wordings: [["samr_92", "Anyone can modify open weights and strip out what China’s rules require, so its control over its own models is fragile, however strict the regulations.", 6, { sources: ["r1776", "finetune", "genaimeasures"], yes: 9, no: 2 }]] },
        { importance: 25, wordings: [["tess.b", "Releasing weights hands China’s best work to its rivals, including their militaries, with no way to take it back.", 4, { sources: ["plallama"], yes: 3, no: 1 }]] },
        { importance: 12, wordings: [["lin.zhao", "The strategy is subsidized and may not last: Beijing could restrict releases once the market consolidates.", 3, { sources: ["takshashila"], yes: 0, no: 0 }]] },
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
    /** The sources added so far, by their key: a source cited again is the same source. */
    const sourceIds: Partial<Record<keyof typeof EXAMPLE_SOURCES, string>> = {};
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
        for (const [w, [author, , , evidence]] of argument.wordings.entries()) {
          if (!evidence) continue;
          const versionId = versionIds[w]!;
          for (const key of evidence.sources) {
            const source = EXAMPLE_SOURCES[key];
            if (sourceIds[key]) ok(await citeSource(services, example.id, person[author]!, versionId, sourceIds[key]));
            else {
              sourceIds[key] = ids.itemId();
              const fields = { name: source.name, locator: source.locator, finding: source.finding, backsUp: "", limits: "" };
              ok(await addSource(services, example.id, person[source.addedBy]!, versionId, { id: sourceIds[key], ...fields }));
            }
          }
          const { rev } = await db.selectFrom("version").select("current_rev as rev").where("id", "=", versionId).executeTakeFirstOrThrow();
          const { yes, no } = scaled(evidence, voters.length);
          for (const [i, voter] of pick(yes + no).entries()) ok(await setAssessment(services, example.id, person[voter]!, versionId, { rev, supported: i < yes }));
        }
        turn += 3;
      }
    }
    await publishOrderIfDue(db, clock, example.id);
    added.push(example.id);
  }
  return added;
}

/** A wording's assessments in the seed: the prototype's counts, scaled down to fit when there are more than `people`. */
export function scaled(evidence: { yes: number; no: number }, people: number): { yes: number; no: number } {
  const total = evidence.yes + evidence.no;
  if (total <= people) return { yes: evidence.yes, no: evidence.no };
  const yes = Math.round((evidence.yes * people) / total);
  return { yes, no: people - yes };
}

function ok(result: WriteResult): void {
  if (result.status !== "done") throw new Error(`Seeding an example board failed: ${JSON.stringify(result)}`);
}
