// The simulation (plans/architecture.md §8): the real write path and the
// browser's real sync rules, run together in one process against a real
// database, with a fake clock. fast-check invents a board's worth of random
// sequences of actions by three readers; after every step, the twelve
// "always true" checks below must hold: the eleventh, since M3b-4, is that a
// closed board refuses every write except a comment, and the twelfth, since
// M3b-10, labelled D-01, is that no reader is handed a comment whose wording
// or option is gone. When one fails, fast-check shrinks the sequence to the
// shortest one that still fails and prints it.
//
// Comments (M3b-10) are steps too: add one, reply, resolve or reopen, and
// delete. They aren't refused on a closed board. A comment is sent only while
// its subject stands, so check 8 compares the comments a caught-up reader
// holds through the helpers' rule (subjectStands), which the speech bubbles
// and panel will use (M3b-11 to M3b-14), and check 4 lets a comment through
// at or below the reader's change number only when History's Restore brought
// its subject back in that answer.

import fc from "fast-check";
import type pg from "pg";
import { enqueue, nextBoardOrder, openView, pressUpdate, receive, subjectStands } from "@steelman/shared";
import type { BoardCounts, BoardOrder, CommentRow, QueuedAction, Ranked, ReaderView, RefusalReason } from "@steelman/shared";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import type { FakeClock } from "@steelman/shared/testing";
import type { Db } from "../../src/db/database.ts";
import type * as OrderModule from "../../src/order.ts";
import type * as ReadModule from "../../src/read.ts";
import type * as VotesModule from "../../src/votes.ts";
import type * as WritingModule from "../../src/writing.ts";
import type { WriteResult } from "../../src/write-path.ts";
import * as closing from "../../src/closing.ts";
import * as comments from "../../src/comments.ts";
import * as realModeration from "../../src/moderation.ts";
import * as sources from "../../src/sources.ts";
import * as structure from "../../src/structure.ts";
import { NOON, addAccount, addMember, seedBoard } from "../support/board.ts";

/** The server code under test. Normally the real modules; a planted-bug test hands in altered copies. */
export interface ServerCode {
  votes: typeof VotesModule;
  writing: typeof WritingModule;
  read: typeof ReadModule;
  order: typeof OrderModule;
  /** Hide and restore (M2-4). Left out, the real module. */
  moderation?: typeof realModeration;
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
  /** A moderator's (M2-4): only Ana, the owner, may; anyone else is refused. Not queued: moderation needs the service there. */
  | { kind: "hide"; reader: number; target: number }
  | { kind: "restore"; reader: number; target: number }
  /** "Can't open it?" (M3a-3) on the board's one source: anyone may report it; the reporter or the owner clears it. Not queued, like moderation. */
  | { kind: "reportSource"; reader: number }
  | { kind: "clearSource"; reader: number }
  /** Combine a wording into another argument, and separate one (M3a-6): only Ana, the owner, may. Not queued, like moderation. Undo undoes the newest one not yet undone. */
  | { kind: "combine"; reader: number; target: number; into: number }
  | { kind: "separate"; reader: number; target: number }
  | { kind: "undo"; reader: number; target: number }
  | { kind: "minutePasses" }
  /**
   * Closing (M3b-4, I-05), the Owner's: now, or at a time a minute or two ahead, which the minute step carries the
   * board over. Each is paired with a reopen `for` steps later, which also clears the closing time, so the other
   * checks still see enough saved actions.
   */
  | { kind: "close"; for: number }
  | { kind: "closeAt"; minutes: 1 | 2; for: number }
  /**
   * Comments (M3b-10, D-01), by anyone, on a closed board too. Not queued: comments need the service there. A comment
   * goes on the question, an option, or a wording the reader sees; a reply, a resolve, and a reopen on a thread the
   * reader holds; a delete on one of the reader's own comments, or with `mine` false on someone else's.
   */
  | { kind: "comment"; reader: number; on: "question" | "option" | "wording"; target: number }
  | { kind: "reply"; reader: number; target: number }
  | { kind: "resolve"; reader: number; target: number; reopen: boolean }
  | { kind: "deleteComment"; reader: number; target: number; mine: boolean }
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
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("hide" as const), reader, target }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("restore" as const), reader, target }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("reportSource" as const), reader }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("clearSource" as const), reader }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("combine" as const), reader, target, into: fc.nat(3) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("separate" as const), reader, target }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("undo" as const), reader, target }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("minutePasses" as const) }) },
  // Low weights, so most of a sequence runs on an open board.
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("close" as const), for: fc.integer({ min: 1, max: 6 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("closeAt" as const), minutes: fc.constantFrom<1 | 2>(1, 2), for: fc.integer({ min: 1, max: 6 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("comment" as const), reader, on: fc.constantFrom<"question" | "option" | "wording">("question", "option", "wording"), target }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("reply" as const), reader, target }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("resolve" as const), reader, target, reopen: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("deleteComment" as const), reader, target, mine: fc.boolean() }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("poll" as const), reader }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("update" as const), reader }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("offline" as const), reader }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("online" as const), reader }) },
);

/**
 * One sequence played before the random ones in every run, so each run sees an action refused for each way it
 * can go stale, however the random ones fall: a deleted argument can only be acted on by a reader who saw it
 * before it went, and in 300 random sequences that sometimes never happens. Ben (reader 1) goes offline and,
 * from his old view, votes on both arguments and on and assesses every wording; meanwhile Cy edits his
 * wording, and Ana deletes both of hers, which deletes the argument that had only hers. Back online, Ben's
 * queue is refused for a deleted argument, a deleted wording, and a changed revision.
 */
export const EVERY_STALE_REFUSAL: Step[] = [
  { kind: "offline", reader: 1 },
  ...[0, 1].map((target): Step => ({ kind: "importance", reader: 1, target, value: 1 })),
  ...[0, 1, 2, 3].map((target): Step => ({ kind: "articulation", reader: 1, target, value: 1 })),
  ...[0, 1, 2, 3].map((target): Step => ({ kind: "assess", reader: 1, target, supported: true })),
  { kind: "edit", reader: 2, target: 0 },
  { kind: "delete", reader: 0, target: 0 },
  { kind: "delete", reader: 0, target: 1 },
  { kind: "online", reader: 1 },
];

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
  /** Wordings hidden and restored (M2-4). */
  hidden: number;
  restored: number;
  /** Reports that the source can't be opened, and clearings (M3a-3). */
  sourceReports: number;
  sourceClears: number;
  /** Combines, separations, and undos done (M3a-6). */
  combined: number;
  separated: number;
  undone: number;
  /** Boards closed by hand, and by their time (M3b-4), counted when each is reopened. */
  closedByHand: number;
  closedByTime: number;
  /** Each kind of action refused because the board was closed, and each done again after a reopen. */
  closedRefusals: Record<string, number>;
  acceptedAfterReopen: Record<string, number>;
  /** Closes sent a second time, which changed nothing. */
  closeSentTwice: number;
  /** Comments and replies added, threads resolved and reopened, and comments deleted (M3b-10). */
  commentsAdded: number;
  replies: number;
  resolves: number;
  reopens: number;
  commentsDeleted: number;
  /** Comment steps done while the board was closed, which allows them. */
  commentsWhileClosed: number;
  /** Comment steps refused, by reason, kept apart from `refused` so the fixed sequences' counts stay as they were. */
  commentRefused: Record<string, number>;
  /** Comments sent again, older than the reader's change number, because Restore brought their subject back. */
  commentsResent: number;
}

export function emptyTally(): Tally {
  return { sequences: 0, steps: 0, done: 0, alreadyDone: 0, refused: {}, queuedOffline: 0, updatesCompared: 0, ordersPublished: 0, hidden: 0, restored: 0, sourceReports: 0, sourceClears: 0, combined: 0, separated: 0, undone: 0, closedByHand: 0, closedByTime: 0, closedRefusals: {}, acceptedAfterReopen: {}, closeSentTwice: 0, commentsAdded: 0, replies: 0, resolves: 0, reopens: 0, commentsDeleted: 0, commentsWhileClosed: 0, commentRefused: {}, commentsResent: 0 };
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
    // fast-check counts the example among numRuns, so one more keeps every random sequence there was before.
    { numRuns: options.numRuns + 1, examples: [[EVERY_STALE_REFUSAL]], ...(options.seed === undefined ? {} : { seed: options.seed }) },
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
  const cy = await addAccount(client, ids, "cy");
  await addMember(client, b.board, cy, "contributor");
  const people = [b.ana, b.ben, cy];
  const options = [b.yes, b.no];
  const moderation = code.moderation ?? realModeration;
  /** Ana owns the board, so she sees hidden wordings' text and may hide and restore (M2-4). */
  const moderates = (person: string) => person === b.ana;

  /** Check 10: no hidden wording's text reaches anyone but a moderator. */
  const noHiddenText = (person: string, rows: { id: string; hidden: boolean; wording: string | null; context: string | null; previousWording: string | null }[]) => {
    if (moderates(person)) return;
    for (const row of rows) {
      if (row.hidden) check(row.wording === null && row.context === null && row.previousWording === null, "10. No hidden text reaches anyone but an Editor or the Owner", { person, row });
    }
  };

  /** No comment reaches a reader while its wording or option is gone (M3b-10). `view` holds the rows as of the same answer. */
  const noGoneSubject = (person: string, view: ReaderView, sent: CommentRow[]) => {
    for (const row of sent) check(subjectStands(view.rows, row), "D-01. No reader is handed a comment whose wording or option is gone", { person, row });
  };

  const snapshot = async (person: string) => {
    await code.order.publishOrderIfDue(db, clock, b.board);
    const s = await code.read.readSnapshot(db, b.board, person, moderates(person), clock.now());
    if (!s) throw new Error("board vanished");
    noHiddenText(person, s.versions);
    noGoneSubject(person, openView(s), s.comments ?? []);
    return s;
  };
  // Each reader has written a wording, so any of them can edit or delete one.
  for (const person of people.slice(1)) {
    await code.writing.addWording(services, b.board, person, b.argument, { id: ids.itemId(), wording: "Another wording, by someone else.", context: "" });
  }
  const readers: Reader[] = [];
  for (const person of people) readers.push({ person, view: openView(await snapshot(person)), online: true, queue: [] });

  const lastSeq = async () => Number((await client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
  /** Whether the board is closed now, by hand or by its time, from the database and the clock (M3b-4). */
  const closedNow = async () =>
    (await client.query("select closed_at is not null or closes_at <= $2 as closed from board where id = $1", [b.board, clock.now()])).rows[0].closed === true;
  /** Steps until the paired reopen, or null when none is due. */
  let reopenIn: number | null = null;
  /** Whether a reopen has happened, so actions done since count as accepted after one. */
  let reopened = false;

  /** Sends one action as a reader, and checks the answer against what the database says should happen. */
  const send = async (r: Reader, action: QueuedAction): Promise<WriteResult> => {
    const expected = await expectedRefusal(client, r.person, action, await closedNow());
    const result = await perform(code, services, b.board, r.person, action);
    // Check 11: a closed board, by hand or by its time, refuses every write (M3b-4). The write path says so after a
    // role too low and before whose item it is or what went stale, so it comes first here: everyone here may write.
    if (expected === "board_closed") {
      check(result.status === "refused" && result.reason === "board_closed", "11. A closed board refuses every write, closed by hand or by its time", { action, result });
      tally.closedRefusals[action.kind] = (tally.closedRefusals[action.kind] ?? 0) + 1;
    } else if (result.status === "done" && reopened) tally.acceptedAfterReopen[action.kind] = (tally.acceptedAfterReopen[action.kind] ?? 0) + 1;
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
    const changes = await code.read.readChanges(db, b.board, r.person, held, moderates(r.person));
    if (!changes) throw new Error("board vanished");
    noHiddenText(r.person, changes.versions);

    // Check 4: no reader is ever handed a change number at or below the one they hold.
    check(changes.seq >= held, "4. No reader is handed a change number below the one they hold", { held, seq: changes.seq });
    for (const row of [...changes.options, ...changes.arguments, ...changes.versions, ...changes.sources]) {
      check(row.changedSeq > held, "4. No reader is handed a row stamped at or below the change number they hold", { held, row });
    }
    // A comment may be older than that only when Restore brought its wording or option back in this answer (M3b-10).
    const restored = new Set(changes.log.filter((row) => row.kind === "version_restored" || row.kind === "option_restored").map((row) => row.subjectId));
    for (const row of changes.comments ?? []) {
      if (row.changedSeq > held) continue;
      const subject = row.versionId ?? row.optionId;
      check(subject !== null && restored.has(subject), "4. No reader is handed a comment stamped at or below the change number they hold, unless Restore brought its subject back", { held, row });
      tally.commentsResent++;
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
    // Checked against the rows after the answer, which are the board as of its change number.
    noGoneSubject(r.person, r.view, changes.comments ?? []);
    for (const [key, list] of [...Object.entries(before.arguments), ...Object.entries(before.versions)]) {
      const now = r.view.shown.arguments[key] ?? r.view.shown.versions[key] ?? [];
      check(list.every((id, i) => now[i] === id), "7. A reader's rows never move unless they press Update", { key, before: list, now });
    }
  };

  /** A combine, separation, or undo, checked against what the database says should happen (check 9). Null when there's nothing to try it on. */
  const structureStep = async (step: Extract<Step, { kind: "combine" | "separate" | "undo" }>, r: Reader): Promise<WriteResult | null> => {
    const live = async (id: string) => (await client.query("select deleted_at is null and merged_into is null as live from argument where id = $1", [id])).rows[0]?.live === true;
    if (step.kind === "combine") {
      // A wording the reader sees, into another argument they see in its option, as a drag does.
      const columns = Object.values(r.view.shown.arguments).filter((list) => list.length >= 2);
      const list = columns[step.target % Math.max(columns.length, 1)];
      if (!list) return null;
      const shownIn = list[step.target % list.length]!;
      const into = list[(step.target + 1 + step.into) % list.length]!;
      const wordings = r.view.shown.versions[shownIn] ?? [];
      const versionId = wordings[step.into % Math.max(wordings.length, 1)];
      if (shownIn === into || !versionId) return null;
      const v = (await client.query("select argument_id, deleted_at from version where id = $1", [versionId])).rows[0];
      const bothLive = (await live(v.argument_id)) && (await live(into));
      const sameOption = (await client.query("select count(distinct option_id)::int as n from argument where id in ($1, $2)", [v.argument_id, into])).rows[0].n === 1;
      const closed = await closedNow();
      const result = await structure.combineWording(services, b.board, r.person, versionId, into);
      if (!moderates(r.person)) check(result.status === "refused" && result.reason === "not_allowed", "9. Only an Editor or the Owner may combine", { step, result });
      else if (closed) check(result.status === "refused" && result.reason === "board_closed", "11. A closed board refuses every write, closed by hand or by its time", { step, result });
      else if (v.argument_id === into) check(result.status === "already_done", "9. A combine sent again is already done", { step, result });
      else if (v.deleted_at) check(result.status === "refused" && result.reason === "version_deleted", "9. Combining a deleted wording is refused", { step, result });
      else if (!sameOption) check(result.status === "refused" && result.reason === "not_same_option", "9. A wording is combined only within its option", { step, result });
      else if (!bothLive) check(result.status === "refused" && result.reason === "argument_deleted", "9. A combine with an argument gone since is refused", { step, result });
      else check(result.status === "done", "9. The owner's combine of a wording into a live argument is done", { step, result });
      return result;
    }
    if (step.kind === "separate") {
      const shown = Object.values(r.view.shown.versions).flat();
      const versionId = shown[step.target % Math.max(shown.length, 1)];
      if (!versionId) return null;
      const v = (await client.query("select argument_id, deleted_at from version where id = $1", [versionId])).rows[0];
      const others = (await client.query("select count(*)::int as n from version where argument_id = $1 and id <> $2 and deleted_at is null", [v.argument_id, versionId])).rows[0].n;
      const argumentLive = await live(v.argument_id);
      const closed = await closedNow();
      const result = await structure.separateWording(services, b.board, r.person, versionId, ids.itemId());
      if (!moderates(r.person)) check(result.status === "refused" && result.reason === "not_allowed", "9. Only an Editor or the Owner may separate", { step, result });
      else if (closed) check(result.status === "refused" && result.reason === "board_closed", "11. A closed board refuses every write, closed by hand or by its time", { step, result });
      else if (v.deleted_at) check(result.status === "refused" && result.reason === "version_deleted", "9. Separating a deleted wording is refused", { step, result });
      else if (!argumentLive) check(result.status === "refused" && result.reason === "argument_deleted", "9. Separating from an argument gone since is refused", { step, result });
      else if (others === 0) check(result.status === "refused" && result.reason === "only_wording", "9. An argument's only wording isn't separated", { step, result });
      else check(result.status === "done", "9. The owner's separation is done", { step, result });
      return result;
    }
    // Undo: any combine or separation not yet undone, newest first by `target`, so undos also come out of order.
    const open = (
      await client.query(
        `select seq from change c where board_id = $1 and kind in ('wording_combined', 'wording_separated')
           and not exists (select 1 from change u where u.board_id = c.board_id and (u.after->>'undoes')::bigint = c.seq)
         order by seq desc`,
        [b.board],
      )
    ).rows.map((row) => Number(row.seq));
    if (open.length === 0) return null;
    const closed = await closedNow();
    const result = await structure.undoStructure(services, b.board, r.person, open[step.target % open.length]!);
    if (!moderates(r.person)) check(result.status === "refused" && result.reason === "not_allowed", "9. Only an Editor or the Owner may undo", { step, result });
    else if (closed) check(result.status === "refused" && result.reason === "board_closed", "11. A closed board refuses every write, closed by hand or by its time", { step, result });
    else
      check(
        result.status === "done" || (result.status === "refused" && ["combined_since", "version_deleted", "argument_deleted"].includes(result.reason)),
        "9. The owner's undo is done, or says why not",
        { step, result },
      );
    return result;
  };

  /**
   * A comment step (M3b-10), checked against what the database says should happen, in the order comments.ts decides
   * (check 9), and sent a second time to see it changes nothing (check 5). A closed board refuses none of them. Null
   * when there's nothing to try it on.
   */
  const commentStep = async (step: Extract<Step, { kind: "comment" | "reply" | "resolve" | "deleteComment" }>, r: Reader): Promise<WriteResult | null> => {
    const one = async (query: string, params: unknown[]) => (await client.query(query, params)).rows[0];
    const held = Object.values(r.view.rows.comments)
      .filter((row) => subjectStands(r.view.rows, row))
      .sort((a, x) => (a.createdAt < x.createdAt ? -1 : a.createdAt > x.createdAt ? 1 : a.id < x.id ? -1 : 1));
    const pick = <T>(list: T[]): T | undefined => (list.length === 0 ? undefined : list[step.target % list.length]);
    let expected: WriteResult["status"] | RefusalReason;
    let send: () => Promise<WriteResult>;
    let count: () => void;

    if (step.kind === "comment" || step.kind === "reply") {
      let target: { optionId?: string; versionId?: string } = {};
      let parent: CommentRow | undefined;
      if (step.kind === "reply") {
        parent = pick(held.filter((row) => row.parentId === null));
        if (!parent) return null;
        target = parent.versionId ? { versionId: parent.versionId } : parent.optionId ? { optionId: parent.optionId } : {};
      } else if (step.on === "option") {
        const option = pick(Object.values(r.view.rows.options).filter((row) => !row.deleted).sort((a, x) => a.position - x.position));
        if (!option) return null;
        target = { optionId: option.id };
      } else if (step.on === "wording") {
        // Any wording the reader sees that isn't deleted, hidden ones too, so a comment on one is refused.
        const versionId = pick(Object.values(r.view.shown.versions).flat().filter((id) => r.view.rows.versions[id] && !r.view.rows.versions[id]!.deleted));
        if (!versionId) return null;
        target = { versionId };
      }
      const input = { id: ids.itemId(), ...target, ...(parent ? { parentId: parent.id } : {}), body: step.kind === "reply" ? "A reply." : "A comment." };
      expected = "done";
      if (target.versionId) {
        const v = await one("select deleted_at, hidden_at from version where id = $1", [target.versionId]);
        if (v.deleted_at || v.hidden_at) expected = "version_deleted";
      } else if (target.optionId) {
        if ((await one("select deleted_at from option where id = $1", [target.optionId])).deleted_at) expected = "option_deleted";
      }
      if (expected === "done" && parent) {
        const p = await one("select parent_id, resolved_at, deleted_at, hidden_at from comment where id = $1", [parent.id]);
        if (p.parent_id !== null) expected = "not_a_thread";
        else if (p.deleted_at || p.hidden_at) expected = "thread_deleted";
        else if (p.resolved_at) expected = "thread_resolved";
      }
      send = () => comments.addComment(services, b.board, r.person, input);
      count = () => (step.kind === "reply" ? tally.replies++ : tally.commentsAdded++);
    } else if (step.kind === "resolve") {
      const thread = pick(held.filter((row) => row.parentId === null));
      if (!thread) return null;
      const t = await one("select parent_id, resolved_at, deleted_at, hidden_at from comment where id = $1", [thread.id]);
      if (t.parent_id !== null) expected = "not_a_thread";
      else if ((t.resolved_at !== null) !== step.reopen) expected = "already_done";
      else if (t.deleted_at || t.hidden_at) expected = "thread_deleted";
      else expected = "done";
      send = () => (step.reopen ? comments.reopenThread : comments.resolveThread)(services, b.board, r.person, thread.id);
      count = () => (step.reopen ? tally.reopens++ : tally.resolves++);
    } else {
      const comment = pick(held.filter((row) => !row.deleted && (row.authorId === r.person) === step.mine));
      if (!comment) return null;
      const c = await one("select author_id, deleted_at from comment where id = $1", [comment.id]);
      expected = c.author_id !== r.person ? "not_author" : c.deleted_at ? "already_done" : "done";
      send = () => comments.deleteComment(services, b.board, r.person, comment.id);
      count = () => tally.commentsDeleted++;
    }

    const result = await send();
    const got = result.status === "refused" ? result.reason : result.status;
    check(got === expected, "9. A comment step is done, or refused for the reason the database gives, on an open board or a closed one", { step, expected, result });
    if (result.status === "done") {
      count();
      const before = await lastSeq();
      const again = await send();
      check(again.status === "already_done" && (await lastSeq()) === before, "5. Sending an action a second time changes nothing", { step, again });
    }
    return result;
  };

  /** The paired reopen (M3b-4): the Owner reopens the board and clears its closing time. */
  const reopenNow = async () => {
    const byHand = (await client.query("select closed_at is not null as hand from board where id = $1", [b.board])).rows[0].hand === true;
    const closed = await closedNow();
    const reopenedNow = await closing.reopenBoard(services, b.board, b.ana);
    check(reopenedNow.status === (closed ? "done" : "already_done"), "11. The Owner reopens a closed board, and reopening an open one is already done", { reopenedNow });
    if (closed) {
      if (byHand) tally.closedByHand++;
      else tally.closedByTime++;
    }
    const cleared = await closing.setClosingTime(services, b.board, b.ana, null);
    check(cleared.status === "done" || cleared.status === "already_done", "11. The Owner clears the closing time", { cleared });
    check(!(await closedNow()), "11. A reopened board is open", {});
    reopenIn = null;
    reopened = true;
  };

  for (const step of steps) {
    tally.steps++;
    if (step.kind === "minutePasses") clock.advance(60_000);
    else if (step.kind === "close" || step.kind === "closeAt") {
      // One closing at a time: a second one, while the first waits for its reopen, does nothing.
      if (reopenIn !== null) {
        // Nothing to do.
      } else if (step.kind === "close") {
        const closed = await closedNow();
        const result = await closing.closeBoard(services, b.board, b.ana);
        check(result.status === (closed ? "already_done" : "done"), "11. The Owner closes an open board, and closing a closed one is already done", { result });
        const before = await lastSeq();
        const again = await closing.closeBoard(services, b.board, b.ana);
        check(again.status === "already_done" && (await lastSeq()) === before, "5. Sending an action a second time changes nothing", { step, again });
        tally.closeSentTwice++;
      } else {
        const at = new Date(clock.now().getTime() + step.minutes * 60_000);
        const result = await closing.setClosingTime(services, b.board, b.ana, at);
        check(result.status === "done", "11. The Owner sets a closing time ahead", { result });
      }
      // The reopen comes `for` steps after this one; the countdown below also counts this step, so one more.
      if (reopenIn === null) reopenIn = step.for + 1;
    } else {
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
            // The caught-up reader's comments go through the rule the screen uses: one whose wording or option has gone
            // since is still held but never shown (M3b-10). The new reader's side is compared as it comes.
            const fresh = openView(await snapshot(r.person));
            const shownComments = Object.fromEntries(Object.entries(r.view.rows.comments).filter(([, row]) => subjectStands(r.view.rows, row)));
            const caughtUp = { ...r.view, rows: { ...r.view.rows, comments: shownComments } };
            check(JSON.stringify(sorted(caughtUp)) === JSON.stringify(sorted(fresh)), "8. A caught-up reader who presses Update sees what a new reader sees", { caughtUp, fresh });
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
        case "hide":
        case "restore": {
          if (!r.online) break;
          // Hide picks among the wordings the reader sees, restore among the hidden ones.
          const candidates = Object.values(r.view.shown.versions)
            .flat()
            .filter((id) => r.view.rows.versions[id] && !r.view.rows.versions[id]!.deleted && r.view.rows.versions[id]!.hidden === (step.kind === "restore"));
          const versionId = candidates.length === 0 ? undefined : candidates[step.target % candidates.length];
          if (!versionId) break;
          // From the database, not the reader's view, which may be out of date: a wording deleted since can't be hidden.
          const gone = (await client.query("select deleted_at from version where id = $1", [versionId])).rows[0].deleted_at !== null;
          const closed = await closedNow();
          const result =
            step.kind === "hide" ? await moderation.hideWording(services, b.board, r.person, versionId, "spam") : await moderation.restoreWording(services, b.board, r.person, versionId);
          // Check 9, for moderation: only a moderator may, and a hide or restore of a wording deleted since is refused as stale.
          if (!moderates(r.person)) check(result.status === "refused" && result.reason === "not_allowed", "9. Only an Editor or the Owner may hide or restore", { step, result });
          else if (closed) check(result.status === "refused" && result.reason === "board_closed", "11. A closed board refuses every write, closed by hand or by its time", { step, result });
          else if (gone) check(result.status === "refused" && result.reason === "version_deleted", "9. A hide or restore of a wording deleted since is refused", { step, result });
          else check(result.status === "done" || result.status === "already_done", "9. A moderator's hide or restore of a wording that's there is done", { step, result });
          if (result.status === "done") {
            if (step.kind === "hide") tally.hidden++;
            else tally.restored++;
            await poll(r);
          }
          break;
        }
        case "combine":
        case "separate":
        case "undo": {
          if (!r.online) break;
          const result = await structureStep(step, r);
          if (!result) break;
          if (result.status === "done") tally.done++;
          else if (result.status === "already_done") tally.alreadyDone++;
          else if (result.status === "refused") tally.refused[result.reason] = (tally.refused[result.reason] ?? 0) + 1;
          if (result.status === "done") {
            if (step.kind === "combine") tally.combined++;
            else if (step.kind === "separate") tally.separated++;
            else tally.undone++;
            await poll(r);
          }
          break;
        }
        case "comment":
        case "reply":
        case "resolve":
        case "deleteComment": {
          if (!r.online) break;
          const result = await commentStep(step, r);
          if (!result) break;
          if (result.status === "done") tally.done++;
          else if (result.status === "already_done") tally.alreadyDone++;
          else if (result.status === "refused") tally.commentRefused[result.reason] = (tally.commentRefused[result.reason] ?? 0) + 1;
          if (result.status === "done") {
            if (await closedNow()) tally.commentsWhileClosed++;
            await poll(r);
          }
          break;
        }
        case "reportSource":
        case "clearSource": {
          if (!r.online) break;
          const reporter = (await client.query("select unavailable_by from source where id = $1", [b.source])).rows[0].unavailable_by as string | null;
          const closed = await closedNow();
          const result = step.kind === "reportSource" ? await sources.reportUnavailable(services, b.board, r.person, b.source) : await sources.clearUnavailable(services, b.board, r.person, b.source);
          if (result.status === "done") tally.done++;
          else if (result.status === "already_done") tally.alreadyDone++;
          else if (result.status === "refused") tally.refused[result.reason] = (tally.refused[result.reason] ?? 0) + 1;
          // Check 9, for source reports: anyone may report; a report is cleared only by its reporter or the owner; a second one is already done.
          if (closed) check(result.status === "refused" && result.reason === "board_closed", "11. A closed board refuses every write, closed by hand or by its time", { step, result });
          else if (step.kind === "reportSource") check(result.status === (reporter ? "already_done" : "done"), "9. Anyone may report a source; a second report is already done", { step, result });
          else if (!reporter) check(result.status === "already_done", "9. Clearing an unreported source is already done", { step, result });
          else if (reporter === r.person || moderates(r.person)) check(result.status === "done", "9. The reporter or the owner clears a report", { step, result });
          else check(result.status === "refused" && result.reason === "not_author", "9. Someone else's report is cleared only by the owner", { step, result });
          if (result.status === "done") {
            if (step.kind === "reportSource") tally.sourceReports++;
            else tally.sourceClears++;
            await poll(r);
          }
          break;
        }
        default:
          await act(r, chooseAction(step, r, options, ids, step.kind === "edit" ? clock.now().getTime() : 0));
      }
    }
    await alwaysTrue(client, b.board);
    if (reopenIn !== null && --reopenIn <= 0) await reopenNow();
  }
  // A sequence never ends closed, so the next starts as every other does.
  if (reopenIn !== null) await reopenNow();
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
    case "addSource":
    case "editSource":
    case "uncite":
      // Sources (M1-8, M1-9) aren't among the steps the simulation picks yet; adding them is the builder's call.
      throw new Error(`The simulation doesn't play ${action.kind} yet`);
  }
}

/**
 * What the stale-write table (architecture §3) says should happen to this
 * action now, worked out from the database directly, not from the server's
 * code: the reason it should be refused, or null if it shouldn't be.
 */
/** Where an argument's wordings are now: itself, or the argument it was combined into, followed through later combines. */
async function finalArgument(client: pg.Client, argumentId: string): Promise<string> {
  let id = argumentId;
  for (;;) {
    const merged = (await client.query("select merged_into from argument where id = $1", [id])).rows[0]?.merged_into;
    if (!merged) return id;
    id = merged;
  }
}

/**
 * @param closed Whether the board is closed now, by hand or by its time (M3b-4). The write path says so after a role
 *   too low and before whose item it is or what went stale; everyone in the simulation may write, so it comes first.
 */
async function expectedRefusal(client: pg.Client, person: string, action: QueuedAction, closed: boolean): Promise<RefusalReason | null> {
  if (closed) return "board_closed";
  const one = async (query: string, params: unknown[]) => (await client.query(query, params)).rows[0];
  switch (action.kind) {
    // A vote or wording for an argument combined away follows it to where it went (M3a-6, §3).
    case "importance":
      return (await one("select deleted_at from argument where id = $1", [await finalArgument(client, action.argumentId)])).deleted_at ? "argument_deleted" : null;
    case "articulation": {
      // A hidden wording is dropped as a deleted one is (M2-4).
      const v = await one("select deleted_at, hidden_at from version where id = $1", [action.versionId]);
      return v.deleted_at || v.hidden_at ? "version_deleted" : null;
    }
    case "assess": {
      const v = await one("select deleted_at, hidden_at, current_rev from version where id = $1", [action.versionId]);
      if (v.deleted_at || v.hidden_at) return "version_deleted";
      if (v.current_rev !== action.rev) return "revision_changed";
      if (action.supported !== true) return null;
      // A Yes that already stands is sent twice: already done, even if its source was reported since (M3a-3), as an assessment made before the report stands.
      const standing = await one("select count(*)::int as n from assessment where version_id = $1 and rev = $2 and account_id = $3 and supported", [action.versionId, action.rev, person]);
      if (standing.n > 0) return null;
      const evidence = await one(
        "select count(*)::int as n from revision_source c join source s on s.id = c.source_id where c.version_id = $1 and c.rev = $2 and s.unavailable_at is null",
        [action.versionId, action.rev],
      );
      return evidence.n === 0 ? "needs_evidence" : null;
    }
    case "addArgument":
      return null;
    case "addWording":
      return (await one("select deleted_at from argument where id = $1", [await finalArgument(client, action.argumentId)])).deleted_at ? "argument_deleted" : null;
    case "edit": {
      const v = await one(
        "select v.author_id, v.deleted_at, v.hidden_at, v.current_rev, r.wording, r.created_by from version v join version_revision r on r.version_id = v.id and r.rev = v.current_rev where v.id = $1",
        [action.versionId],
      );
      if (v.author_id !== person) return "not_author";
      // A hidden wording is gone for its author's edits too (M2-4).
      if (v.deleted_at || v.hidden_at) return "version_deleted";
      const alreadySaved = action.baseRev === v.current_rev - 1 && v.wording === action.wording && v.created_by === person;
      return action.baseRev === v.current_rev || alreadySaved ? null : "revision_changed";
    }
    case "delete":
      return (await one("select author_id from version where id = $1", [action.versionId])).author_id === person ? null : "not_author";
    case "addSource":
    case "editSource":
    case "uncite":
      // Sources (M1-8, M1-9) aren't among the steps the simulation picks yet; adding them is the builder's call.
      throw new Error(`The simulation doesn't play ${action.kind} yet`);
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

  // Added by the M3a audit (Nov 22): combining, separating, and undoing either never leave an argument on the board
  // with no wording. A hidden wording still keeps its argument (writing.ts).
  const empty = await client.query(
    `select 'argument ' || a.id as item from argument a
     where a.board_id = $1 and a.deleted_at is null and a.merged_into is null
       and not exists (select 1 from version v where v.argument_id = a.id and v.deleted_at is null)`,
    [board],
  );
  check(empty.rowCount === 0, "A-10. Every argument still on the board has a wording", empty.rows);
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
