// History (M3a-4, J-03): what happened on the board, newest first, for
// everyone who can read the board, as Google Drive's Activity panel and
// Wikipedia's page history are. It lists two things together:
//
// - The board's change log, read back. Each entry says who, when, what kind
//   of change, what it was made to (by ID), and a moderator's reason.
// - Each argument and wording that was added (the builder, Nov 22, 2026).
//   Adding one writes no change-log row, so these entries are built here,
//   when History is read, from the wording rows the board already holds: its
//   author, when it was added, and the change number of the write that added
//   it. Nothing new is stored for them.
//
// The log never holds what anyone wrote (invariant 7), and neither does
// History: an entry carries IDs, and the board names each thing from the rows
// the reader already has, so a hidden wording's text stays with the
// moderators who can see it.

import type { HistoryEntry, Role } from "@steelman/shared";
import type { Db } from "./db/database.ts";

/** Enough for any board in the class trial; older entries wait for paging, if a board ever needs it. */
const MOST = 500;

export async function readHistory(db: Db, boardId: string): Promise<HistoryEntry[]> {
  // The newest of each kind, so the newest of both together are among them.
  const [rows, added] = await Promise.all([
    db
      .selectFrom("change as c")
      .innerJoin("account as actor", "actor.id", "c.actor_id")
      .select(["c.seq", "c.at", "actor.username", "c.kind", "c.subject_kind", "c.subject_id", "c.reason", "c.before", "c.after"])
      .where("c.board_id", "=", boardId)
      .orderBy("c.seq", "desc")
      .limit(MOST)
      .execute(),
    additions(db, boardId),
  ]);
  // A role change names the person by ID; History says their username.
  const accounts = [...new Set(rows.flatMap((row) => (row.kind === "role_changed" ? [String(field(row.after, "account"))] : [])))];
  const names = new Map(
    accounts.length === 0 ? [] : (await db.selectFrom("account").select(["id", "username"]).where("id", "in", accounts).execute()).map((account) => [account.id, account.username ?? ""]),
  );
  const changes: HistoryEntry[] = rows.map((row) => ({
    seq: Number(row.seq),
    at: row.at.toISOString(),
    // Only an account with a username can write (app.ts), and a deleted one is credited to deleted_account.
    actorName: row.username ?? "",
    kind: row.kind,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    reason: row.reason,
    detail: detailOf(row.kind, row.subject_id, row.after, names),
  }));
  return [...changes, ...added].sort(newestFirst).slice(0, MOST);
}

/**
 * An entry for each wording on the board, from its own row: who added it, when, and in which write. A new argument
 * arrives with its first wording in one write, so a wording with an argument's change number began that argument;
 * any other was added to an argument already there. A separation makes an argument too, but no wording, so it gives
 * no entry here: it has its own row in the change log. A wording keeps its entry when it's hidden, deleted, or
 * moved, as the board's rows keep it.
 */
async function additions(db: Db, boardId: string): Promise<HistoryEntry[]> {
  const rows = await db
    .selectFrom("version as v")
    .innerJoin("account as author", "author.id", "v.author_id")
    .leftJoin(
      (eb) => eb.selectFrom("argument").select("created_seq").distinct().where("board_id", "=", boardId).as("began"),
      (join) => join.onRef("began.created_seq", "=", "v.created_seq"),
    )
    .select(["v.id", "v.created_seq", "v.created_at", "author.username", "began.created_seq as argument_seq"])
    .where("v.board_id", "=", boardId)
    .orderBy("v.created_seq", "desc")
    .orderBy("v.id")
    .limit(MOST)
    .execute();
  return rows.map((row) => ({
    seq: Number(row.created_seq),
    at: row.created_at.toISOString(),
    // What a deleted account wrote is already credited to deleted_account (account.ts).
    actorName: row.username ?? "",
    kind: row.argument_seq === null ? "wording_added" : "argument_added",
    subjectKind: "version",
    subjectId: row.id,
    reason: null,
    detail: {},
  }));
}

/**
 * By change number, newest first. A seeded board's first write adds several things under one number: there, a change
 * comes before an addition, and additions go by ID, so the order is the same on every read.
 */
function newestFirst(a: HistoryEntry, b: HistoryEntry): number {
  return b.seq - a.seq || Number(isAddition(a)) - Number(isAddition(b)) || (a.subjectId < b.subjectId ? -1 : a.subjectId > b.subjectId ? 1 : 0);
}

function isAddition(entry: HistoryEntry): boolean {
  return entry.kind === "argument_added" || entry.kind === "wording_added";
}

/** What an entry needs beyond its subject, from the row's `after`: IDs, a role, an access setting, or a yes, never text. */
function detailOf(kind: string, subject: string, after: unknown, names: Map<string, string>): HistoryEntry["detail"] {
  switch (kind) {
    case "source_added":
      return { version: String(field(after, "version")), source: subject };
    case "source_edited":
      // Editing a reported source's link clears its "can't be opened" report (sources.ts).
      return field(after, "cleared") === true ? { cleared: true } : {};
    case "source_cited":
    case "source_removed":
      return { version: subject, source: String(field(after, "source")) };
    case "version_deleted":
      return field(after, "argumentDeleted") ? { argumentDeleted: true } : {};
    case "role_changed": {
      // Someone who came by the link may not have chosen a username yet: the board then says "someone".
      const name = names.get(String(field(after, "account")));
      return { ...(name ? { accountName: name } : {}), role: field(after, "role") as Role };
    }
    case "wording_combined":
      return { from: String(field(after, "from")), into: String(field(after, "into")), ...(field(after, "merged") ? { merged: true as const } : {}) };
    case "wording_separated":
      return { from: String(field(after, "from")), argument: String(field(after, "argument")) };
    case "wording_uncombined":
    case "wording_unseparated":
      return { undoes: Number(field(after, "undoes")) };
    case "closing_date_set":
      // Kept as a number, since the log holds no text (M3b-3).
      // A row without a usable moment says only that a date was set, rather than breaking all of History.
      return Number.isFinite(Number(field(after, "at"))) ? { closesAt: new Date(Number(field(after, "at"))).toISOString() } : {};
    case "access_changed":
      return { general: field(after, "general") as "link" | "invited", linkRole: field(after, "linkRole") as Role };
    default:
      return {};
  }
}

function field(json: unknown, key: string): unknown {
  return json && typeof json === "object" ? (json as Record<string, unknown>)[key] : undefined;
}
