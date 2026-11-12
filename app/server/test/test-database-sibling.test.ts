import { expect, test } from "vitest";
import { useTestDatabase } from "./support/database.ts";

const db = useTestDatabase();

// See test-database.test.ts: the two files make the same table, so sharing
// one database would fail one of them.
test("M0-1: each test file gets its own empty database (sibling)", async () => {
  const tables = await db.client.query("select tablename from pg_tables where schemaname = 'public'");
  expect(tables.rows).toEqual([]);

  await db.client.query("create table marker (id int primary key)");
  await db.client.query("insert into marker values (1)");
});
