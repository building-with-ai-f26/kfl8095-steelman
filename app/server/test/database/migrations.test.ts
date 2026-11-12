import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { migrate, migrationNames } from "../../src/db/migrate.ts";
import { createTestDatabase } from "../support/database.ts";

// The migration runner (plans/architecture.md §6): plain SQL files, applied
// in order, forward only, and tested both on an empty database and as an
// upgrade of one that already holds rows.

type Database = Awaited<ReturnType<typeof createTestDatabase>>;
const open: Database[] = [];
const newDatabase = async (label: string) => {
  const db = await createTestDatabase(label);
  open.push(db);
  return db;
};
afterEach(async () => {
  for (const db of open.splice(0)) await db.drop();
});

const publicTables = async (db: Database) =>
  (await db.client.query("select tablename from pg_tables where schemaname = 'public' order by tablename")).rows.map((row) => row.tablename as string);

describe("running the migrations", () => {
  test("M-01: they run on an empty database, in file-name order", async () => {
    const db = await newDatabase("empty");

    const { applied } = await migrate(db.url);

    expect(applied).toEqual(migrationNames());
    expect(applied).toEqual([...applied].sort());
    expect(await publicTables(db)).toContain("board");
  });

  test("M-01: running them again applies nothing", async () => {
    const db = await newDatabase("again");
    await migrate(db.url);

    expect((await migrate(db.url)).applied).toEqual([]);
  });

  test("M-01: they can be run up to a named migration, then finished later", async () => {
    const db = await newDatabase("partway");
    const names = migrationNames();

    expect((await migrate(db.url, { to: names[1] })).applied).toEqual(names.slice(0, 2));
    expect((await migrate(db.url)).applied).toEqual(names.slice(2));
  });

  test("M-01: the runner's own record of what has run is kept apart from the product's tables, out of the service's reach", async () => {
    const db = await newDatabase("bookkeeping");
    await migrate(db.url);

    expect((await publicTables(db)).filter((name) => name.includes("migration"))).toEqual([]);
    const recorded = await db.client.query("select name from migrations.kysely_migration order by name");
    expect(recorded.rows.map((row) => row.name)).toEqual(migrationNames());

    await db.client.query("set role steelman_app");
    await expect(db.client.query("select * from migrations.kysely_migration")).rejects.toThrow(/permission denied/);
    await db.client.query("reset role");
  });
});

describe("a migration that fails", () => {
  test("M-01: stops the run, names itself, and leaves the database as it was", async () => {
    const db = await newDatabase("broken");
    const directory = mkdtempSync(join(tmpdir(), "steelman-migrations-"));
    writeFileSync(join(directory, "0001_fine.sql"), "create table fine (id int primary key);");
    writeFileSync(join(directory, "0002_broken.sql"), "create table half_done (id int primary key);\nselect * from a_table_that_does_not_exist;");
    writeFileSync(join(directory, "0003_never.sql"), "create table never (id int primary key);");

    try {
      await expect(migrate(db.url, { directory })).rejects.toThrow(/0002_broken/);
      expect(await publicTables(db)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});

describe("migrations as an upgrade", () => {
  const seedDirectory = fileURLToPath(new URL("./seeds/", import.meta.url));
  // "after-0006_grants.sql" holds rows for the schema as it stood after migration 0006_grants.
  const seeds = readdirSync(seedDirectory)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, after: file.replace(/^after-/, "").replace(/\.sql$/, "") }));

  const rowCounts = async (db: Database, tables: string[]) => {
    const counts: Record<string, number> = {};
    for (const table of tables) counts[table] = (await db.client.query(`select count(*)::int as n from "${table}"`)).rows[0].n;
    return counts;
  };

  test("M-01: there is seed data, and each seed is for a migration that exists", () => {
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) expect(migrationNames(), seed.file).toContain(seed.after);
  });

  test.each(seeds)("M-01: a database holding $file takes every later migration and keeps its rows", async (seed) => {
    const db = await newDatabase("upgrade");
    await migrate(db.url, { to: seed.after });
    await db.client.query(readFileSync(join(seedDirectory, seed.file), "utf8"));
    const tables = await publicTables(db);
    const before = await rowCounts(db, tables);
    expect(before.importance_vote, "the seed should hold votes").toBeGreaterThan(0);

    await migrate(db.url);

    const stillThere = (await publicTables(db)).filter((table) => tables.includes(table));
    expect(await rowCounts(db, stillThere)).toEqual(Object.fromEntries(stillThere.map((table) => [table, before[table]])));
  });

  test.each(seeds)("M-01, B-01, B-02, B-03: after upgrading $file, every cached count still equals a recount", async (seed) => {
    const db = await newDatabase("recount");
    await migrate(db.url, { to: seed.after });
    await db.client.query(readFileSync(join(seedDirectory, seed.file), "utf8"));
    await migrate(db.url);

    const drifted = await db.client.query(`
      select 'argument ' || a.id as item from argument a
      where a.importance <> (select coalesce(sum(value), 0) from importance_vote where argument_id = a.id)
         or a.importance_voters <> (select count(*) from importance_vote where argument_id = a.id)
      union all
      select 'version ' || v.id from version v
      where v.articulation <> (select coalesce(sum(value), 0) from articulation_vote where version_id = v.id)
         or v.articulation_voters <> (select count(*) from articulation_vote where version_id = v.id)
         or v.yes <> (select count(*) from assessment where version_id = v.id and rev = v.current_rev and supported)
         or v.no <> (select count(*) from assessment where version_id = v.id and rev = v.current_rev and not supported)`);
    expect(drifted.rows).toEqual([]);
  });
});
