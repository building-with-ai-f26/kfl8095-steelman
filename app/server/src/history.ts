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
//
// A board put in a space, or shared with everyone in one (G-05, M3d-18), logs
// the space's ID. History names the space only to a reader who is in it, so
// no one else learns its name, as the board's answers name it (access.ts).

import type { HistoryEntry, Role } from "@steelman/shared";
import type { Db } from "./db/database.ts";

/** Change rows that name a person by their account (M2-2b, M3b-7). */
const PERSON_KINDS = new Set(["role_changed", "member_added", "member_removed"]);

/** Enough for any board in the class trial; older entries wait for paging, if a board ever needs it. */
const MOST = 500;

/** Change rows that name a space by its ID (M3d-18). */
const SPACE_KINDS = new Set(["access_changed", "space_changed"]);

export async function readHistory(db: Db, boardId: string, reader: string | null = null): Promise<HistoryEntry[]> {
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
  // A role change, an addition, and a removal name the person by ID; History says their username.
  const accounts = [...new Set(rows.flatMap((row) => (PERSON_KINDS.has(row.kind) ? [String(field(row.after, "account"))] : [])))];
  const names = new Map(
    accounts.length === 0 ? [] : (await db.selectFrom("account").select(["id", "username"]).where("id", "in", accounts).execute()).map((account) => [account.id, account.username ?? ""]),
  );
  // A space is named by the spaces the reader is in, and only those that aren't deleted.
  const spaceIds = [...new Set(rows.flatMap((row) => (SPACE_KINDS.has(row.kind) && typeof field(row.after, "space") === "string" ? [String(field(row.after, "space"))] : [])))];
  const spaces = new Map(
    spaceIds.length === 0 || reader === null
      ? []
      : (
          await db
            .selectFrom("space as s")
            .innerJoin("space_member as sm", (join) => join.onRef("sm.space_id", "=", "s.id").on("sm.account_id", "=", reader))
            .select(["s.id", "s.name"])
            .where("s.id", "in", spaceIds)
            .where("s.deleted_at", "is", null)
            .execute()
        ).map((space) => [space.id, space.name]),
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
    detail: detailOf(row.kind, row.subject_id, row.after, names, spaces),
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
function detailOf(kind: string, subject: string, after: unknown, names: Map<string, string>, spaces: Map<string, string>): HistoryEntry["detail"] {
  const space = spaces.get(String(field(after, "space")));
  const spaceName = space ? { spaceName: space } : {};
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
    case "member_removed": {
      const name = names.get(String(field(after, "account")));
      return name ? { accountName: name } : {};
    }
    case "member_added":
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
      return { general: field(after, "general") as "link" | "invited" | "space", linkRole: field(after, "linkRole") as Role, ...spaceName };
    case "space_changed":
      // Put in a space, or taken out of one; either way, a board that was shared with its space is now invited only.
      return { ...spaceName, ...(field(after, "space") === undefined ? { outOfSpace: true as const } : {}), ...(field(after, "general") === "invited" ? { general: "invited" as const } : {}) };
    default:
      return {};
  }
}

function field(json: unknown, key: string): unknown {
  return json && typeof json === "object" ? (json as Record<string, unknown>)[key] : undefined;
}
