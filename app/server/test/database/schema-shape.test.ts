import { beforeAll, describe, expect, test } from "vitest";
import { LIMITS } from "@steelman/shared";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, addAccount, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Rules about the shape of the schema itself, so a later migration can't
// quietly leave one out.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(307);
let b: SeededBoard;
beforeAll(async () => {
  b = await seedBoard(db.client, ids);
});

const BOARD_TABLES = ["option", "argument", "version", "version_revision", "revision_source", "source", "importance_vote", "articulation_vote", "assessment", "change", "published_order"];
const STAMPED_TABLES = ["option", "argument", "version", "source", "published_order"];

describe("the shape of the schema", () => {
  test("M-01: every table the plan lists exists", async () => {
    const tables = await db.client.query("select tablename from pg_tables where schemaname = 'public' order by tablename");

    expect(tables.rows.map((row) => row.tablename)).toEqual(["account", "board", ...BOARD_TABLES].sort());
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

describe("the database's length limits are the ones in shared/", () => {
  const chars = (count: number) => "x".repeat(count);

  test("A-01: a question", async () => {
    const author = await addAccount(db.client, ids, "cy");
    const add = (question: string) => db.client.query("insert into board (id, question, created_by, created_at) values ($1, $2, $3, $4)", [ids.boardId(), question, author, NOON]);

    await add(chars(LIMITS.question));
    await expect(add(chars(LIMITS.question + 1))).rejects.toThrow(/check constraint/);
    await expect(add("")).rejects.toThrow(/check constraint/);
  });

  test("A-01: an option's name", async () => {
    const add = (name: string, position: number) =>
      write(db.client, b.board, (seq) =>
        db.client.query("insert into option (id, board_id, name, position, created_at, changed_seq) values ($1, $2, $3, $4, $5, $6)", [ids.itemId(), b.board, name, position, NOON, seq]),
      );

    await add(chars(LIMITS.optionName), 3);
    await expect(add(chars(LIMITS.optionName + 1), 4)).rejects.toThrow(/check constraint/);
    await expect(add("", 4)).rejects.toThrow(/check constraint/);
  });

  test("A-03: a wording and its context", async () => {
    const add = (rev: number, wording: string, context: string) =>
      write(db.client, b.board, async (seq) => {
        await db.client.query(
          "insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at) values ($1, $2, $3, $4, $5, 'edited', $6, $7)",
          [b.otherVersion, b.board, rev, wording, context, b.ana, NOON],
        );
        await db.client.query("update version set current_rev = $2, changed_seq = $3 where id = $1", [b.otherVersion, rev, seq]);
      });

    await add(2, chars(LIMITS.wording), chars(LIMITS.context));
    await expect(add(3, chars(LIMITS.wording + 1), "")).rejects.toThrow(/check constraint/);
    await expect(add(3, "", "")).rejects.toThrow(/check constraint/);
    await expect(add(3, "Fine.", chars(LIMITS.context + 1))).rejects.toThrow(/check constraint/);
  });

  test("C-01: each field of a source", async () => {
    const add = (fields: Partial<Record<"name" | "locator" | "finding" | "backs_up" | "limits", string>>) =>
      write(db.client, b.board, (seq) =>
        db.client.query(
          "insert into source (id, board_id, name, locator, finding, backs_up, limits, added_by, created_at, changed_seq) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
          [ids.itemId(), b.board, fields.name ?? "Name", fields.locator ?? "", fields.finding ?? "Finding.", fields.backs_up ?? "", fields.limits ?? "", b.ana, NOON, seq],
        ),
      );

    await add({
      name: chars(LIMITS.sourceName),
      locator: chars(LIMITS.sourceLocator),
      finding: chars(LIMITS.sourceFinding),
      backs_up: chars(LIMITS.sourceBacksUp),
      limits: chars(LIMITS.sourceLimits),
    });
    await expect(add({ name: chars(LIMITS.sourceName + 1) })).rejects.toThrow(/check constraint/);
    await expect(add({ name: "" })).rejects.toThrow(/check constraint/);
    await expect(add({ locator: chars(LIMITS.sourceLocator + 1) })).rejects.toThrow(/check constraint/);
    await expect(add({ finding: chars(LIMITS.sourceFinding + 1) })).rejects.toThrow(/check constraint/);
    await expect(add({ finding: "" })).rejects.toThrow(/check constraint/);
    await expect(add({ backs_up: chars(LIMITS.sourceBacksUp + 1) })).rejects.toThrow(/check constraint/);
    await expect(add({ limits: chars(LIMITS.sourceLimits + 1) })).rejects.toThrow(/check constraint/);
  });

  test("M-06: IDs must have the shape the app makes", async () => {
    const author = await addAccount(db.client, ids, "di");
    await expect(db.client.query("insert into board (id, question, created_by, created_at) values ('short', 'Q?', $1, $2)", [author, NOON])).rejects.toThrow(/check constraint/);
    await expect(
      write(db.client, b.board, (seq) =>
        db.client.query("insert into argument (id, board_id, option_id, created_by, created_at, created_seq, changed_seq) values ('not an id', $1, $2, $3, $4, $5, $5)", [
          b.board,
          b.yes,
          b.ana,
          NOON,
          seq,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  test("B-01, B-02, B-03: cached counts can't be impossible", async () => {
    const set = (sql: string, id: string) => write(db.client, b.board, (seq) => db.client.query(sql, [id, seq]));

    await expect(set("update argument set importance = 2, importance_voters = 1, changed_seq = $2 where id = $1", b.argument)).rejects.toThrow(/check constraint/);
    await expect(set("update argument set importance = 0, importance_voters = 1, changed_seq = $2 where id = $1", b.argument)).rejects.toThrow(/check constraint/);
    await expect(set("update version set articulation = -3, articulation_voters = 2, changed_seq = $2 where id = $1", b.version)).rejects.toThrow(/check constraint/);
    await expect(set("update version set yes = -1, changed_seq = $2 where id = $1", b.version)).rejects.toThrow(/check constraint/);
  });
});
