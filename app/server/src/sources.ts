// Sources (C-01): a piece of evidence, shared on the board. Anyone who can
// contribute adds one to a wording, or cites one already on the board; only
// the person who added a source edits it (the prototype's rule). Taking one
// off a wording is for whoever added it, the wording's author, or the Owner. Nothing leaves the board (invariant 6), so a source
// taken off its last wording stays, cited by nothing.
//
// Changing which sources a wording cites saves revision n + 1 with the same
// text, so its credibility starts over (invariant 2). Editing a source's
// evidence (where to find it, its finding) does the same to every wording
// whose current revision cites it; fixing its name doesn't, nor do what it
// backs up and its limits, which the screens no longer ask for (Q10, as the
// builder revised it on Nov 14). Old assessments stay, keyed to the revision
// they judged.
//
// Safe to send twice (invariant 10): a new source arrives with an ID the
// browser made; citing or taking off says what the list should hold; an edit
// sends the whole source, so a repeat finds it already says that.

import { sql } from "kysely";
import type { Clock, SourceInput } from "@steelman/shared";
import { writeToBoard } from "./write-path.ts";
import type { Outcome, Services, Trx, WriteResult } from "./write-path.ts";

type NewSource = SourceInput & { id: string };

/** A wording, as these writes need it: its revision now, and the sources that revision cites. */
interface Wording {
  author_id: string;
  current_rev: number;
  deleted_at: Date | null;
  hidden_at: Date | null;
  cited: string[];
}

export function addSource({ db, clock }: Services, boardId: string, person: string | null, versionId: string, input: NewSource): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "add",
    load: (trx) => loadWording(trx, boardId, versionId),
    stale: async (trx, wording): Promise<Outcome | null> => {
      const existing = await trx.selectFrom("source").select(["board_id", "added_by"]).where("id", "=", input.id).executeTakeFirst();
      if (existing) {
        // Sent again: this person added it to this wording. It may have been taken off since; a repeat doesn't put it back.
        const same = existing.board_id === boardId && existing.added_by === person && (await everCited(trx, versionId, input.id));
        return same ? "already_done" : { refused: "id_taken" };
      }
      return gone(wording);
    },
    change: async (trx, wording, seq) => {
      await trx
        .insertInto("source")
        .values({
          id: input.id,
          board_id: boardId,
          name: input.name,
          locator: input.locator,
          finding: input.finding,
          backs_up: input.backsUp,
          limits: input.limits,
          added_by: person!,
          created_at: clock.now(),
          changed_seq: seq,
        })
        .execute();
      const rev = await saveRevision(trx, clock, { boardId, versionId, from: wording.current_rev, sourceIds: [...wording.cited, input.id], why: "sources_changed", person: person!, seq });
      await log(trx, clock, { boardId, seq, person: person!, kind: "source_added", subjectKind: "source", subjectId: input.id, after: { version: versionId, rev } });
      return "done";
    },
  });
}

/** Cites a source already on the board on one more wording. */
export function citeSource({ db, clock }: Services, boardId: string, person: string | null, versionId: string, sourceId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "add",
    load: async (trx) => ((await sourceOnBoard(trx, boardId, sourceId)) ? loadWording(trx, boardId, versionId) : null),
    stale: async (_trx, wording) => (wording.cited.includes(sourceId) ? "already_done" : gone(wording)),
    change: async (trx, wording, seq) => {
      const rev = await saveRevision(trx, clock, { boardId, versionId, from: wording.current_rev, sourceIds: [...wording.cited, sourceId], why: "sources_changed", person: person!, seq });
      await log(trx, clock, { boardId, seq, person: person!, kind: "source_cited", subjectKind: "version", subjectId: versionId, before: { rev: wording.current_rev }, after: { rev, source: sourceId } });
      return "done";
    },
  });
}

/**
 * Takes a source off a wording. The source stays on the board. The person who
 * added the source may, and so may the wording's author, since anyone can
 * cite a source on anyone's wording; the Owner may take any off (policy.ts).
 */
export function unciteSource({ db, clock }: Services, boardId: string, person: string | null, versionId: string, sourceId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "uncite",
    load: async (trx) => {
      const source = await sourceOnBoard(trx, boardId, sourceId);
      const wording = source && (await loadWording(trx, boardId, versionId));
      return source && wording ? { ...wording, added_by: source.added_by } : null;
    },
    authorOf: (wording) => [wording.added_by, wording.author_id],
    stale: async (_trx, wording) => (wording.cited.includes(sourceId) ? gone(wording) : "already_done"),
    change: async (trx, wording, seq) => {
      const rest = wording.cited.filter((id) => id !== sourceId);
      const rev = await saveRevision(trx, clock, { boardId, versionId, from: wording.current_rev, sourceIds: rest, why: "sources_changed", person: person!, seq });
      await log(trx, clock, { boardId, seq, person: person!, kind: "source_removed", subjectKind: "version", subjectId: versionId, before: { rev: wording.current_rev }, after: { rev, source: sourceId } });
      return "done";
    },
  });
}

/**
 * Edits a source (Q10). If its evidence changed, every wording whose current
 * revision cites it gets a new revision, deleted ones aside (their text is
 * gone). A hidden wording gets one too, so it starts over if it's restored.
 * If the link changed and the source was reported as one that can't be
 * opened, the edit clears the report; a change to anything else leaves it.
 */
export function editSource({ db, clock }: Services, boardId: string, person: string | null, sourceId: string, input: SourceInput): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "edit",
    load: (trx) => sourceOnBoard(trx, boardId, sourceId),
    authorOf: (source) => source.added_by,
    change: async (trx, source, seq) => {
      const evidenceChanged = source.locator !== input.locator || source.finding !== input.finding;
      const anyChange = evidenceChanged || source.name !== input.name || source.backs_up !== input.backsUp || source.limits !== input.limits;
      if (!anyChange) return "already_done";
      // A new link on a source reported as one that can't be opened clears the report, as a Wikipedia editor removes a
      // dead-link tag when fixing the link (C-02; the builder, Nov 22). Anyone can report it again.
      const cleared = source.unavailable_at !== null && source.locator !== input.locator;
      await trx
        .updateTable("source")
        .set({
          name: input.name,
          locator: input.locator,
          finding: input.finding,
          backs_up: input.backsUp,
          limits: input.limits,
          changed_seq: seq,
          ...(cleared ? { unavailable_at: null, unavailable_by: null } : {}),
        })
        .where("id", "=", sourceId)
        .execute();

      const revised: { version: string; rev: number }[] = [];
      if (evidenceChanged) {
        const citing = await trx
          .selectFrom("version as v")
          .innerJoin("revision_source as c", (join) => join.onRef("c.version_id", "=", "v.id").onRef("c.rev", "=", "v.current_rev"))
          .select(["v.id", "v.current_rev"])
          .where("c.source_id", "=", sourceId)
          .where("v.board_id", "=", boardId)
          .where("v.deleted_at", "is", null)
          .orderBy("v.id")
          .execute();
        for (const version of citing) {
          const sourceIds = await citedBy(trx, version.id, version.current_rev);
          const rev = await saveRevision(trx, clock, { boardId, versionId: version.id, from: version.current_rev, sourceIds, why: "source_changed", person: person!, seq });
          revised.push({ version: version.id, rev });
        }
      }
      // One write is one change row, so this row also says when the edit cleared a report.
      await log(trx, clock, { boardId, seq, person: person!, kind: "source_edited", subjectKind: "source", subjectId: sourceId, after: { revised, ...(cleared ? { cleared: true } : {}) } });
      return "done";
    },
  });
}

/**
 * "Can't open it?" (C-02, M3a-3): anyone who can read reports that a source
 * can't be opened. The mark is the source's, so it shows on every wording
 * that cites it, and while a wording cites no other source it can't be
 * assessed as supported (votes.ts). It changes no revision: an unavailable
 * source doesn't make the wording false, and its assessments stand.
 * A second report, by anyone, changes nothing.
 */
export function reportUnavailable({ db, clock }: Services, boardId: string, person: string | null, sourceId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "report",
    load: (trx) => sourceOnBoard(trx, boardId, sourceId),
    change: async (trx, source, seq) => {
      if (source.unavailable_at) return "already_done";
      await trx.updateTable("source").set({ unavailable_at: clock.now(), unavailable_by: person!, changed_seq: seq }).where("id", "=", sourceId).execute();
      await log(trx, clock, { boardId, seq, person: person!, kind: "source_unavailable", subjectKind: "source", subjectId: sourceId, after: {} });
      return "done";
    },
  });
}

/**
 * Clears the mark: the person who reported it withdraws it, or an Editor or the Owner clears it. Clearing an unmarked
 * source changes nothing. (The person who added the source clears it another way: by changing its link, in `editSource`.)
 */
export function clearUnavailable({ db, clock }: Services, boardId: string, person: string | null, sourceId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "unreport",
    load: (trx) => sourceOnBoard(trx, boardId, sourceId),
    // Nothing to clear is nobody's report: whoever asks is told it's done already. A mark with no reporter is an Editor's to clear.
    authorOf: (source) => (source.unavailable_at ? (source.unavailable_by ?? "") : (person ?? "")),
    change: async (trx, source, seq) => {
      if (!source.unavailable_at) return "already_done";
      await trx.updateTable("source").set({ unavailable_at: null, unavailable_by: null, changed_seq: seq }).where("id", "=", sourceId).execute();
      await log(trx, clock, { boardId, seq, person: person!, kind: "source_available", subjectKind: "source", subjectId: sourceId, after: {} });
      return "done";
    },
  });
}

async function loadWording(trx: Trx, boardId: string, versionId: string): Promise<Wording | null> {
  const version = await trx
    .selectFrom("version")
    .select(["author_id", "current_rev", "deleted_at", "hidden_at"])
    .where("id", "=", versionId)
    .where("board_id", "=", boardId)
    .executeTakeFirst();
  return version ? { ...version, cited: await citedBy(trx, versionId, version.current_rev) } : null;
}

async function sourceOnBoard(trx: Trx, boardId: string, sourceId: string) {
  return (await trx.selectFrom("source").selectAll().where("id", "=", sourceId).where("board_id", "=", boardId).executeTakeFirst()) ?? null;
}

async function citedBy(trx: Trx, versionId: string, rev: number): Promise<string[]> {
  const rows = await trx.selectFrom("revision_source").select("source_id").where("version_id", "=", versionId).where("rev", "=", rev).execute();
  return rows.map((row) => row.source_id);
}

async function everCited(trx: Trx, versionId: string, sourceId: string): Promise<boolean> {
  return (await trx.selectFrom("revision_source").select("rev").where("version_id", "=", versionId).where("source_id", "=", sourceId).executeTakeFirst()) !== undefined;
}

/** A wording that was deleted or hidden takes no new sources. */
function gone(wording: Wording): Outcome | null {
  return wording.deleted_at || wording.hidden_at ? { refused: "version_deleted" } : null;
}

/**
 * Saves revision `from + 1` of a wording: the same text, citing `sourceIds`.
 * Its credibility starts over; importance and articulation votes don't
 * mention revisions, so they stay.
 */
async function saveRevision(
  trx: Trx,
  clock: Clock,
  r: { boardId: string; versionId: string; from: number; sourceIds: string[]; why: "sources_changed" | "source_changed"; person: string; seq: number },
): Promise<number> {
  const rev = r.from + 1;
  await sql`insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at)
            select version_id, board_id, ${rev}, wording, context, ${r.why}, ${r.person}, ${clock.now()}
            from version_revision where version_id = ${r.versionId} and rev = ${r.from}`.execute(trx);
  if (r.sourceIds.length > 0) {
    await trx
      .insertInto("revision_source")
      .values(r.sourceIds.map((sourceId) => ({ version_id: r.versionId, rev, source_id: sourceId, board_id: r.boardId })))
      .execute();
  }
  await trx.updateTable("version").set({ current_rev: rev, yes: 0, no: 0, changed_seq: r.seq }).where("id", "=", r.versionId).execute();
  return rev;
}

/** A change-log row: IDs and revision numbers only, never what anyone wrote (invariant 7). */
async function log(
  trx: Trx,
  clock: Clock,
  row: { boardId: string; seq: number; person: string; kind: string; subjectKind: "source" | "version"; subjectId: string; before?: object; after: object },
): Promise<void> {
  await trx
    .insertInto("change")
    .values({
      board_id: row.boardId,
      seq: row.seq,
      at: clock.now(),
      actor_id: row.person,
      kind: row.kind,
      subject_kind: row.subjectKind,
      subject_id: row.subjectId,
      before: JSON.stringify(row.before ?? {}),
      after: JSON.stringify(row.after),
    })
    .execute();
}
