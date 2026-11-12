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
  account: { id: string; username: string; created_at: Date; deleted_at: Date | null };
  board: {
    id: string;
    question: string;
    created_by: string;
    created_at: Date;
    closed_at: Date | null;
    tick_seconds: Generated<number>;
    last_seq: ColumnType<string, never, never>;
  };
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
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 5 }) }) });
}
