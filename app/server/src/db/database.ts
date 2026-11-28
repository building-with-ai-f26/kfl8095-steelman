// The service's connection to Postgres, through Kysely (a typed query
// builder: the SQL stays visible, and the compiler checks column names).
//
// The types below describe the tables in server/migrations. They are written
// by hand; when a migration changes a table, change its type here too.

import { Kysely, PostgresDialect } from "kysely";
import type { ColumnType, Generated } from "kysely";
import pg from "pg";

/** Postgres returns bigint as text, so JavaScript never rounds it. Change numbers are read through Number(). */
type BigIntColumn = ColumnType<string, number | string, number | string>;

export interface Database {
  account: {
    id: string;
    /** Null until the person picks one, after their first sign-in. */
    username: string | null;
    email: ColumnType<string | null, string | null | undefined, string | null>;
    email_verified: ColumnType<boolean, boolean | undefined, boolean>;
    name: ColumnType<string, string | undefined, string>;
    image: ColumnType<string | null, string | null | undefined, string | null>;
    created_at: Date;
    updated_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    deleted_at: Date | null;
    /** When the account was first shown the tour (L-02; migration 0011). Null until then. */
    tour_seen_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
  };
  /** A changed username's old name, kept from others until ends_at (L-04; migration 0015). */
  username_hold: { old_name: string; account_id: string; ends_at: Date };
  /** A group of people, such as a class pod (G-03; migration 0016). Set deleted_at when it was deleted with its Owner's account; its text is erased. */
  space: {
    id: string;
    name: string;
    about: string;
    /** One of the prototype's six canvases (SPACE_CANVASES). */
    canvas: string;
    /** "private" until M3d-20 adds "public". */
    visibility: string;
    created_by: string;
    created_at: Date;
    deleted_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
  };
  /**
   * A person's role in a space: "owner", "admin", or "member" (G-04; migration 0016), and how they came in:
   * "invite" when added by name, "join" when they joined by themselves (migration 0019).
   */
  space_member: { space_id: string; account_id: string; role: string; joined_via: string; joined_at: Date };
  /** One row per change to a space or its members, holding IDs and keywords only (migration 0016). */
  space_change: {
    id: ColumnType<string, never, never>;
    space_id: string;
    at: Date;
    actor_id: string;
    kind: string;
    before: ColumnType<unknown, string | undefined, never>;
    after: ColumnType<unknown, string | undefined, never>;
  };
  /** A person an Admin or the Owner removed from a space, kept out until invited back (G-04, G-07; migration 0020). */
  space_block: { space_id: string; account_id: string; blocked_by: string; at: Date };
  // Sign-in's own tables (migration 0007). Better Auth reads and writes
  // these; the service's own code uses only sent_email.
  "sign_in.session": { id: string; account_id: string; token: string; expires_at: Date; created_at: Date; updated_at: Date };
  "sign_in.sign_in_method": { id: string; account_id: string; provider: string; provider_subject: string; created_at: Date; updated_at: Date };
  "sign_in.sign_in_code": { id: string; identifier: string; value: string; expires_at: Date; created_at: Date; updated_at: Date };
  "sign_in.sent_email": { address_hash: string; sent_at: Date };
  board: {
    id: string;
    question: string;
    created_by: string;
    created_at: Date;
    closed_at: Date | null;
    /** The moment the Owner set the board to close (migration 0013), or null. */
    closes_at: Date | null;
    tick_seconds: Generated<number>;
    last_seq: ColumnType<string, never, never>;
    /** "invited", "link", or "space", everyone in the board's space (migrations 0008 and 0017). */
    general_access: Generated<string>;
    /** The role the link gives: "viewer", "voter", or "contributor". */
    link_role: Generated<string>;
    /** Set when it was deleted with its owner's account, nobody else able to open it (Q11; migration 0009). Its text is erased. */
    deleted_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    /** The space the board is in, or null (G-05, M3d-18; migration 0017). */
    space_id: ColumnType<string | null, string | null | undefined, string | null>;
  };
  /** A person's role on a board, and whether they came by the link or were added by name (migration 0008). */
  board_member: { board_id: string; account_id: string; role: string; joined_via: string; joined_at: Date };
  option: { id: string; board_id: string; name: string; position: number; created_at: Date; deleted_at: Date | null; changed_seq: BigIntColumn };
  argument: {
    id: string;
    board_id: string;
    option_id: string;
    created_by: string;
    created_at: Date;
    created_seq: BigIntColumn;
    merged_into: string | null;
    deleted_at: Date | null;
    importance: Generated<number>;
    importance_voters: Generated<number>;
    changed_seq: BigIntColumn;
  };
  version: {
    id: string;
    board_id: string;
    argument_id: string;
    author_id: string;
    created_at: Date;
    created_seq: BigIntColumn;
    current_rev: number;
    hidden_at: Date | null;
    hidden_by: string | null;
    hidden_reason: string | null;
    deleted_at: Date | null;
    articulation: Generated<number>;
    articulation_voters: Generated<number>;
    yes: Generated<number>;
    no: Generated<number>;
    changed_seq: BigIntColumn;
  };
  version_revision: {
    version_id: string;
    board_id: string;
    rev: number;
    wording: string | null;
    context: string | null;
    why: string;
    importance_votes_before: number | null;
    articulation_votes_before: number | null;
    created_by: string;
    created_at: Date;
  };
  revision_source: { version_id: string; rev: number; source_id: string; board_id: string };
  comment: {
    id: string;
    board_id: string;
    option_id: string | null;
    version_id: string | null;
    parent_id: string | null;
    author_id: string;
    body: string | null;
    created_at: Date;
    resolved_at: Date | null;
    hidden_at: Date | null;
    hidden_by: string | null;
    hidden_reason: string | null;
    deleted_at: Date | null;
    changed_seq: BigIntColumn;
  };
  report: {
    board_id: string;
    version_id: string;
    reporter_id: string;
    reason: string;
    note: string;
    reported_at: Date;
    withdrawn_at: Date | null;
    resolved_at: Date | null;
    resolved_by: string | null;
    resolved_how: string | null;
    changed_seq: BigIntColumn;
  };
  source: {
    id: string;
    board_id: string;
    name: string;
    locator: string;
    finding: string;
    backs_up: string;
    limits: string;
    added_by: string;
    created_at: Date;
    unavailable_at: Date | null;
    unavailable_by: string | null;
    changed_seq: BigIntColumn;
  };
  published_order: { board_id: string; computed_at: Date; arguments: ColumnType<unknown, string, string>; versions: ColumnType<unknown, string, string>; changed_seq: BigIntColumn };
  importance_vote: { argument_id: string; account_id: string; board_id: string; value: number; voted_at: Date };
  /** Each person's importance votes on two arguments when they were combined (M3a-6), for undo and for asking them to vote again. */
  combine_vote: {
    board_id: string;
    seq: BigIntColumn;
    account_id: string;
    from_id: string;
    into_id: string;
    from_value: number | null;
    into_value: number | null;
    after_value: number | null;
    asked_again: boolean;
    revoted: Generated<boolean>;
  };
  articulation_vote: { version_id: string; account_id: string; board_id: string; value: number; voted_at: Date };
  assessment: { version_id: string; rev: number; account_id: string; board_id: string; supported: boolean; assessed_at: Date };
  change: {
    board_id: string;
    seq: BigIntColumn;
    at: Date;
    actor_id: string;
    kind: string;
    subject_kind: string;
    subject_id: string;
    before: ColumnType<unknown, string | undefined, never>;
    after: ColumnType<unknown, string | undefined, never>;
    reason: string | null;
  };
}

export type Db = Kysely<Database>;

/**
 * Opens a pool of connections. At most 5 per service instance, so three
 * instances stay well inside the smallest Cloud SQL's limit (architecture §4).
 */
export function createDatabase(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  // The database can end a connection while it sits idle in the pool: Cloud SQL's maintenance does, and so does
  // dropping a test's database. The pool drops it and opens another when next needed; without this listener, Node
  // would treat it as an uncaught error and stop the process. The line names no person: only Postgres's reason.
  pool.on("error", (error) => console.warn(JSON.stringify({ severity: "WARNING", message: `A database connection ended while idle: ${error.message}` })));
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
