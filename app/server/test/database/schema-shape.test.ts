import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Rules about the shape of the schema itself, so a later migration can't
// quietly leave one out. Length limits and allowed values are deliberately
// not here: the service checks those, so they can change without a
// migration (Q24).

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(307);

const BOARD_TABLES = ["option", "argument", "version", "version_revision", "revision_source", "source", "importance_vote", "articulation_vote", "assessment", "change", "published_order"];
const STAMPED_TABLES = ["option", "argument", "version", "source", "published_order"];

describe("the shape of the schema", () => {
  test("M-01: every table the plan lists exists", async () => {
    const tables = await db.client.query("select tablename from pg_tables where schemaname = 'public' order by tablename");

    expect(tables.rows.map((row) => row.tablename)).toEqual(["account", "board", "board_member", ...BOARD_TABLES].sort());
  });

  test("M-01: every table that belongs to a board carries board_id, tied to the board", async () => {
    for (const table of BOARD_TABLES) {
      const tied = await db.client.query(
        `select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
         where c.conrelid = $1::regclass and c.contype = 'f' and a.attname = 'board_id'`,
        [table],
      );
      expect(tied.rowCount, table).toBeGreaterThan(0);
    }
  });

  test("M-02: every row a reader is sent carries changed_seq, indexed with its board", async () => {
    for (const table of STAMPED_TABLES) {
      const indexes = await db.client.query("select indexdef from pg_indexes where schemaname = 'public' and tablename = $1", [table]);
      const covered = indexes.rows.some((row) => /\(board_id, changed_seq\)/.test(row.indexdef));
      expect(covered, table).toBe(true);
    }
  });

  test("M-01: no column takes its value from the database's clock, so tests own the time", async () => {
    const defaults = await db.client.query(
      `select table_name, column_name, column_default from information_schema.columns
       where table_schema = 'public' and column_default ~* '(now\\(|current_timestamp|clock_timestamp|current_date|localtimestamp)'`,
    );

    expect(defaults.rows).toEqual([]);
  });

  test("M-01: the two database roles exist and can't sign in by themselves", async () => {
    const roles = await db.client.query("select rolname, rolcanlogin, rolsuper from pg_roles where rolname like 'steelman_%' order by rolname");

    expect(roles.rows).toEqual([
      { rolname: "steelman_account_deletion", rolcanlogin: false, rolsuper: false },
      { rolname: "steelman_app", rolcanlogin: false, rolsuper: false },
    ]);
  });

  test("L-01: usernames are unique whatever their capitals", async () => {
    await db.client.query("insert into account (id, username, created_at) values ($1, 'Morgan', $2)", [ids.itemId(), NOON]);

    await expect(db.client.query("insert into account (id, username, created_at) values ($1, 'mORGAN', $2)", [ids.itemId(), NOON])).rejects.toThrow(/duplicate key/);
  });
});

