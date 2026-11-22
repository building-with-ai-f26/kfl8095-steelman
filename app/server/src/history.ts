// History (M3a-4, J-03): the board's change log read back, newest first, for
// everyone who can read the board, as Google Drive's Activity panel and
// Wikipedia's page history are. Each entry says who, when, what kind of
// change, what it was made to (by ID), and a moderator's reason. The log never
// holds what anyone wrote (invariant 7), so neither does History: the board
// names each thing from the rows the reader already has, and a hidden
// wording's text stays with the moderators who can see it.

import type { HistoryEntry, Role } from "@steelman/shared";
import type { Db } from "./db/database.ts";

/** Enough for any board in the class trial; older entries wait for paging, if a board ever needs it. */
const MOST = 500;

export async function readHistory(db: Db, boardId: string): Promise<HistoryEntry[]> {
  const rows = await db
    .selectFrom("change as c")
    .innerJoin("account as actor", "actor.id", "c.actor_id")
    .select(["c.seq", "c.at", "actor.username", "c.kind", "c.subject_kind", "c.subject_id", "c.reason", "c.before", "c.after"])
    .where("c.board_id", "=", boardId)
    .orderBy("c.seq", "desc")
    .limit(MOST)
    .execute();
  // A role change names the person by ID; History says their username.
  const accounts = [...new Set(rows.flatMap((row) => (row.kind === "role_changed" ? [String(field(row.after, "account"))] : [])))];
  const names = new Map(
    accounts.length === 0 ? [] : (await db.selectFrom("account").select(["id", "username"]).where("id", "in", accounts).execute()).map((account) => [account.id, account.username ?? ""]),
  );
  return rows.map((row) => ({
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
}

/** What an entry needs beyond its subject, from the row's `after`: IDs, a role, or an access setting, never text. */
function detailOf(kind: string, subject: string, after: unknown, names: Map<string, string>): HistoryEntry["detail"] {
  switch (kind) {
    case "source_added":
      return { version: String(field(after, "version")), source: subject };
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
    case "access_changed":
      return { general: field(after, "general") as "link" | "invited", linkRole: field(after, "linkRole") as Role };
    default:
      return {};
  }
}

function field(json: unknown, key: string): unknown {
  return json && typeof json === "object" ? (json as Record<string, unknown>)[key] : undefined;
}
