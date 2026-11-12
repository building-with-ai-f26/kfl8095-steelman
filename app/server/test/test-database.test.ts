import { expect, test } from "vitest";
import { useTestDatabase } from "./support/database.ts";

const db = useTestDatabase();

test("M0-1: the test database is a real Postgres 17", async () => {
  const result = await db.client.query("select current_setting('server_version_num')::int as version");

  expect(result.rows[0].version).toBeGreaterThanOrEqual(170000);
  expect(result.rows[0].version).toBeLessThan(180000);
});

test("M0-1: a test file's database is named after the file", () => {
  expect(db.name).toMatch(/^test_database_[0-9a-f]{8}$/);
});

// The sibling file makes a table with the same name. Whichever of the two
// runs second would fail here if they were handed the same database.
test("M0-1: each test file gets its own empty database", async () => {
  const tables = await db.client.query("select tablename from pg_tables where schemaname = 'public'");
  expect(tables.rows).toEqual([]);

  await db.client.query("create table marker (id int primary key)");
  await db.client.query("insert into marker values (1)");
});
