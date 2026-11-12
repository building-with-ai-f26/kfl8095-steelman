// The simulation (plans/architecture.md §8): the real write path and the
// browser's real sync rules, run together in one process against a real
// database, with a fake clock. fast-check invents a board's worth of random
// sequences of actions by three readers; after every step, the nine
// "always true" checks below must hold. When one fails, fast-check shrinks
// the sequence to the shortest one that still fails and prints it.

import fc from "fast-check";
import type pg from "pg";
import { enqueue, nextBoardOrder, openView, pressUpdate, receive } from "@steelman/shared";
import type { BoardCounts, BoardOrder, QueuedAction, Ranked, ReaderView, RefusalReason } from "@steelman/shared";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import type { FakeClock } from "@steelman/shared/testing";
import type { Db } from "../../src/db/database.ts";
import type * as OrderModule from "../../src/order.ts";
import type * as ReadModule from "../../src/read.ts";
import type * as VotesModule from "../../src/votes.ts";
import type * as WritingModule from "../../src/writing.ts";
import type { WriteResult } from "../../src/write-path.ts";
import { NOON, addAccount, seedBoard } from "../support/board.ts";

/** The server code under test. Normally the real modules; a planted-bug test hands in altered copies. */
export interface ServerCode {
  votes: typeof VotesModule;
  writing: typeof WritingModule;
  read: typeof ReadModule;
  order: typeof OrderModule;
}

/** One step of a sequence. Targets are positions in what the acting reader sees, wrapped to fit. */
export type Step =
  | { kind: "importance"; reader: number; target: number; value: 1 | -1 | null }
  | { kind: "articulation"; reader: number; target: number; value: 1 | -1 | null }
  | { kind: "assess"; reader: number; target: number; supported: boolean | null }
  | { kind: "addArgument"; reader: number; option: number }
  | { kind: "addWording"; reader: number; target: number }
  | { kind: "edit"; reader: number; target: number }
  | { kind: "delete"; reader: number; target: number }
  | { kind: "minutePasses" }
  | { kind: "poll"; reader: number }
  | { kind: "update"; reader: number }
  | { kind: "offline"; reader: number }
  | { kind: "online"; reader: number };

const READERS = 3;
const reader = fc.nat(READERS - 1);
// Targets are positions in what the reader sees. Keeping them small makes
// actions pile onto the same few things, where the interesting interleavings
// are (a vote on something just deleted, an assessment of something just edited).
const target = fc.nat(3);
const vote = fc.constantFrom<1 | -1 | null>(1, -1, null);

export const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("importance" as const), reader, target, value: vote }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("articulation" as const), reader, target, value: vote }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("assess" as const), reader, target, supported: fc.constantFrom<boolean | null>(true, false, null) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("addArgument" as const), reader, option: fc.nat(1) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("addWording" as const), reader, target }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("edit" as const), reader, target }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("delete" as const), reader, target }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("minutePasses" as const) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("poll" as const), reader }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("update" as const), reader }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("offline" as const), reader }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("online" as const), reader }) },
);

interface Reader {
  person: string;
  view: ReaderView;
  online: boolean;
  queue: QueuedAction[];
}

/** What a run exercised, so a passing run can show it did something. */
export interface Tally {
  sequences: number;
  steps: number;
  done: number;
  alreadyDone: number;
  refused: Record<string, number>;
  queuedOffline: number;
  updatesCompared: number;
  ordersPublished: number;
}

export function emptyTally(): Tally {
  return { sequences: 0, steps: 0, done: 0, alreadyDone: 0, refused: {}, queuedOffline: 0, updatesCompared: 0, ordersPublished: 0 };
}

class CheckFailed extends Error {}
function check(holds: boolean, rule: string, detail: unknown = ""): void {
  if (!holds) throw new CheckFailed(`${rule}${detail === "" ? "" : `\n${JSON.stringify(detail, null, 2)}`}`);
}

/**
 * Runs `numRuns` random sequences, each on a new board. Throws fast-check's
 * report (seed, and the shrunk sequence) if any check fails.
 */
export async function runSimulation(code: ServerCode, connection: { db: Db; client: pg.Client }, options: { numRuns: number; seed?: number }): Promise<Tally> {
  const tally = emptyTally();
  await fc.assert(
    fc.asyncProperty(fc.array(stepArbitrary, { maxLength: 40, size: "medium" }), async (steps) => {
      await playSequence(code, connection, steps, tally);
    }),
    { numRuns: options.numRuns, ...(options.seed === undefined ? {} : { seed: options.seed }) },
  );
  return tally;
}

/** Each sequence gets a new board, so each needs IDs no earlier board used. IDs don't change what happens. */
let boardsMade = 0;

export async function playSequence(code: ServerCode, { db, client }: { db: Db; client: pg.Client }, steps: Step[], tally: Tally = emptyTally()): Promise<void> {
  tally.sequences++;
  const ids = createSeededIds(++boardsMade * 7919);
  const clock: FakeClock = createFakeClock(new Date(NOON));
  const services = { db, clock };
  const b = await seedBoard(client, ids);
  const people = [b.ana, b.ben, await addAccount(client, ids, "cy")];
  const options = [b.yes, b.no];

  const snapshot = async (person: string) => {
    await code.order.publishOrderIfDue(db, clock, b.board);
    const s = await code.read.readSnapshot(db, b.board, person);
    if (!s) throw new Error("board vanished");
    return s;
  };
  // Each reader has written a wording, so any of them can edit or delete one.
  for (const person of people.slice(1)) {
    await code.writing.addWording(services, b.board, person, b.argument, { id: ids.itemId(), wording: "Another wording, by someone else.", context: "" });
  }
  const readers: Reader[] = [];
  for (const person of people) readers.push({ person, view: openView(await snapshot(person)), online: true, queue: [] });

  const lastSeq = async () => Number((await client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

  /** Sends one action as a reader, and checks the answer against what the database says should happen. */
  const send = async (r: Reader, action: QueuedAction): Promise<WriteResult> => {
    const expected = await expectedRefusal(client, r.person, action);
    const result = await perform(code, services, b.board, r.person, action);
    if (result.status === "done") tally.done++;
    else if (result.status === "already_done") tally.alreadyDone++;
    else if (result.status === "refused") tally.refused[result.reason] = (tally.refused[result.reason] ?? 0) + 1;

    // Check 9: an action refused as stale is refused for the reason the table gives; one that shouldn't be, isn't.
    if (expected) check(result.status === "refused" && result.reason === expected, "9. A stale action is refused for the reason the table gives", { action, expected, result });
    else check(result.status === "done" || result.status === "already_done", "9. An action that isn't stale is not refused", { action, result });

    // Check 5: sending it a second time changes nothing.
    if (result.status === "done") {
      const before = await lastSeq();
      const again = await perform(code, services, b.board, r.person, action);
      check(again.status === "already_done" && (await lastSeq()) === before, "5. Sending an action a second time changes nothing", { action, again });
    }
    return result;
  };

  const act = async (r: Reader, action: QueuedAction | null) => {
    if (!action) return;
    if (r.online) {
      // Like the board screen, a reader sees their own change straight away.
      if ((await send(r, action)).status === "done") await poll(r);
    } else {
      r.queue = enqueue(r.queue, action);
      tally.queuedOffline++;
    }
  };

  const poll = async (r: Reader) => {
    const held = r.view.seq;
    const savedBefore = await savedOrder(client, b.board);
    const counts = await countsNow(client, b.board);
    await code.order.publishOrderIfDue(db, clock, b.board);
    const changes = await code.read.readChanges(db, b.board, r.person, held);
    if (!changes) throw new Error("board vanished");

    // Check 4: no reader is ever handed a change number at or below the one they hold.
    check(changes.seq >= held, "4. No reader is handed a change number below the one they hold", { held, seq: changes.seq });
    for (const row of [...changes.options, ...changes.arguments, ...changes.versions, ...changes.sources]) {
      check(row.changedSeq > held, "4. No reader is handed a row stamped at or below the change number they hold", { held, row });
    }

    // Check 6: a newly saved order is exactly what the rule gives from the previous order and the counts at that moment.
    const savedAfter = await savedOrder(client, b.board);
    if (savedAfter && savedAfter.seq !== savedBefore?.seq) {
      tally.ordersPublished++;
      const expected = nextBoardOrder(savedBefore?.order ?? { arguments: {}, versions: {} }, counts);
      check(sameOrder(savedAfter.order, expected), "6. The saved order is what the ordering rule gives", { saved: savedAfter.order, expected });
    }

    // Check 7: a reader's rows never move unless they pressed Update.
    const before = r.view.shown;
    r.view = receive(r.view, changes);
    for (const [key, list] of [...Object.entries(before.arguments), ...Object.entries(before.versions)]) {
      const now = r.view.shown.arguments[key] ?? r.view.shown.versions[key] ?? [];
      check(list.every((id, i) => now[i] === id), "7. A reader's rows never move unless they press Update", { key, before: list, now });
    }
  };

  for (const step of steps) {
    tally.steps++;
    if (step.kind === "minutePasses") clock.advance(60_000);
    else {
      const r = readers[step.reader]!;
      switch (step.kind) {
        case "poll":
          if (r.online) await poll(r);
          break;
        case "update":
          if (!r.online) {
            r.view = pressUpdate(r.view);
            break;
          }
          await poll(r);
          r.view = pressUpdate(r.view);
          {
            // Check 8: a reader who catches up and presses Update has exactly the board a newly arrived reader gets.
            const fresh = openView(await snapshot(r.person));
            check(JSON.stringify(sorted(r.view)) === JSON.stringify(sorted(fresh)), "8. A caught-up reader who presses Update sees what a new reader sees", { caughtUp: r.view, fresh });
            tally.updatesCompared++;
          }
          break;
        case "offline":
          r.online = false;
          break;
        case "online":
          if (r.online) break;
          r.online = true;
          for (const queued of r.queue) await send(r, queued);
          r.queue = [];
          await poll(r);
          break;
        default:
          await act(r, chooseAction(step, r, options, ids, step.kind === "edit" ? clock.now().getTime() : 0));
      }
    }
    await alwaysTrue(client, b.board);
  }
}

/** Turns a step into an action on something the reader can see, or null if there's nothing to act on. */
function chooseAction(step: Step, r: Reader, options: string[], ids: { itemId(): string }, salt: number): QueuedAction | null {
  const shownArguments = Object.values(r.view.shown.arguments).flat().filter((id) => r.view.rows.arguments[id] && !r.view.rows.arguments[id]!.deleted);
  const shownVersions = Object.values(r.view.shown.versions).flat().filter((id) => r.view.rows.versions[id] && !r.view.rows.versions[id]!.deleted);
  const mine = shownVersions.filter((id) => r.view.rows.versions[id]!.authorId === r.person);
  const pick = <T>(list: T[], index: number): T | undefined => (list.length === 0 ? undefined : list[index % list.length]);

  switch (step.kind) {
    case "importance": {
      const id = pick(shownArguments, step.target);
      return id ? { kind: "importance", argumentId: id, value: step.value } : null;
    }
    case "articulation": {
      const id = pick(shownVersions, step.target);
      return id ? { kind: "articulation", versionId: id, value: step.value } : null;
    }
    case "assess": {
      const id = pick(shownVersions, step.target);
      return id ? { kind: "assess", versionId: id, rev: r.view.rows.versions[id]!.rev, supported: step.supported } : null;
    }
    case "addArgument":
      return { kind: "addArgument", id: ids.itemId(), optionId: options[step.option]!, versionId: ids.itemId(), wording: "A new argument.", context: "" };
    case "addWording": {
      const id = pick(shownArguments, step.target);
      return id ? { kind: "addWording", argumentId: id, id: ids.itemId(), wording: "Another way to put it.", context: "" } : null;
    }
    case "edit": {
      const id = pick(mine, step.target);
      if (!id) return null;
      const row = r.view.rows.versions[id]!;
      return { kind: "edit", versionId: id, baseRev: row.rev, wording: `Edited at ${salt}, from revision ${row.rev}.`, context: "" };
    }
    case "delete": {
      const id = pick(mine, step.target);
      return id ? { kind: "delete", versionId: id } : null;
    }
    default:
      return null;
  }
}

function perform(code: ServerCode, services: { db: Db; clock: FakeClock }, board: string, person: string, action: QueuedAction): Promise<WriteResult> {
  switch (action.kind) {
    case "importance":
      return code.votes.setImportance(services, board, person, action.argumentId, action.value);
    case "articulation":
      return code.votes.setArticulation(services, board, person, action.versionId, action.value);
    case "assess":
      return code.votes.setAssessment(services, board, person, action.versionId, { rev: action.rev, supported: action.supported });
    case "addArgument":
      return code.writing.addArgument(services, board, person, action);
    case "addWording":
      return code.writing.addWording(services, board, person, action.argumentId, { id: action.id, wording: action.wording, context: action.context });
    case "edit":
      return code.writing.editWording(services, board, person, action.versionId, action);
    case "delete":
      return code.writing.deleteWording(services, board, person, action.versionId);
  }
}

/**
 * What the stale-write table (architecture §3) says should happen to this
 * action now, worked out from the database directly, not from the server's
 * code: the reason it should be refused, or null if it shouldn't be.
 */
async function expectedRefusal(client: pg.Client, person: string, action: QueuedAction): Promise<RefusalReason | null> {
  const one = async (query: string, params: unknown[]) => (await client.query(query, params)).rows[0];
  switch (action.kind) {
    case "importance":
      return (await one("select deleted_at from argument where id = $1", [action.argumentId])).deleted_at ? "argument_deleted" : null;
    case "articulation":
      return (await one("select deleted_at from version where id = $1", [action.versionId])).deleted_at ? "version_deleted" : null;
    case "assess": {
      const v = await one("select deleted_at, current_rev from version where id = $1", [action.versionId]);
      if (v.deleted_at) return "version_deleted";
      if (v.current_rev !== action.rev) return "revision_changed";
      if (action.supported !== true) return null;
      const evidence = await one(
        "select count(*)::int as n from revision_source c join source s on s.id = c.source_id where c.version_id = $1 and c.rev = $2 and s.unavailable_at is null",
        [action.versionId, action.rev],
      );
      return evidence.n === 0 ? "needs_evidence" : null;
    }
    case "addArgument":
      return null;
    case "addWording":
      return (await one("select deleted_at from argument where id = $1", [action.argumentId])).deleted_at ? "argument_deleted" : null;
    case "edit": {
      const v = await one(
        "select v.author_id, v.deleted_at, v.current_rev, r.wording, r.created_by from version v join version_revision r on r.version_id = v.id and r.rev = v.current_rev where v.id = $1",
        [action.versionId],
      );
      if (v.author_id !== person) return "not_author";
      if (v.deleted_at) return "version_deleted";
      const alreadySaved = action.baseRev === v.current_rev - 1 && v.wording === action.wording && v.created_by === person;
      return action.baseRev === v.current_rev || alreadySaved ? null : "revision_changed";
    }
    case "delete":
      return (await one("select author_id from version where id = $1", [action.versionId])).author_id === person ? null : "not_author";
  }
}

/** Checks 1, 2, and 3, from the database, after every step. */
async function alwaysTrue(client: pg.Client, board: string): Promise<void> {
  // Checks 1 and 3: every count equals a recount, and only the current revision's assessments count.
  const drifted = await client.query(
    `select 'argument ' || a.id as item from argument a
     where a.board_id = $1
       and (a.importance <> (select coalesce(sum(value), 0) from importance_vote where argument_id = a.id)
         or a.importance_voters <> (select count(*) from importance_vote where argument_id = a.id))
     union all
     select 'version ' || v.id from version v
     where v.board_id = $1
       and (v.articulation <> (select coalesce(sum(value), 0) from articulation_vote where version_id = v.id)
         or v.articulation_voters <> (select count(*) from articulation_vote where version_id = v.id)
         or v.yes <> (select count(*) from assessment where version_id = v.id and rev = v.current_rev and supported)
         or v.no <> (select count(*) from assessment where version_id = v.id and rev = v.current_rev and not supported))`,
    [board],
  );
  check(drifted.rowCount === 0, "1 and 3. Every count equals a recount of the current votes and assessments", drifted.rows);

  // Check 2: nobody has two votes on one thing.
  const doubled = await client.query(
    `select 'importance' from importance_vote where board_id = $1 group by argument_id, account_id having count(*) > 1
     union all select 'articulation' from articulation_vote where board_id = $1 group by version_id, account_id having count(*) > 1
     union all select 'assessment' from assessment where board_id = $1 group by version_id, rev, account_id having count(*) > 1`,
    [board],
  );
  check(doubled.rowCount === 0, "2. Nobody has two votes on one thing", doubled.rows);
}

async function savedOrder(client: pg.Client, board: string): Promise<{ order: BoardOrder; seq: number } | null> {
  const row = (await client.query("select arguments, versions, changed_seq::int as seq from published_order where board_id = $1", [board])).rows[0];
  return row ? { order: { arguments: row.arguments, versions: row.versions }, seq: row.seq } : null;
}

/** The counts the ordering rule works from, read straight from the tables. */
async function countsNow(client: pg.Client, board: string): Promise<BoardCounts> {
  const options = (await client.query("select id from option where board_id = $1 and deleted_at is null order by position", [board])).rows;
  const args = (
    await client.query(
      "select id, option_id, importance, importance_voters from argument where board_id = $1 and deleted_at is null and merged_into is null order by created_seq, id",
      [board],
    )
  ).rows;
  const versions = (
    await client.query(
      "select id, argument_id, articulation, articulation_voters from version where board_id = $1 and deleted_at is null and hidden_at is null order by created_seq, id",
      [board],
    )
  ).rows;
  const counts: BoardCounts = { arguments: {}, versions: {} };
  const byOption: Record<string, Ranked[]> = Object.fromEntries(options.map((o) => [o.id, []]));
  const byArgument: Record<string, Ranked[]> = {};
  for (const a of args) {
    byOption[a.option_id]?.push({ id: a.id, score: a.importance, voters: a.importance_voters });
    byArgument[a.id] = [];
  }
  for (const v of versions) byArgument[v.argument_id]?.push({ id: v.id, score: v.articulation, voters: v.articulation_voters });
  counts.arguments = byOption;
  counts.versions = byArgument;
  return counts;
}

function sameOrder(a: BoardOrder, b: BoardOrder): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

/** A copy with every object's keys in alphabetical order, so two equal values print the same. */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted((value as Record<string, unknown>)[key])]));
  return value;
}
