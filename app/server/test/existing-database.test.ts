import { afterEach, expect, test } from "vitest";
import { startPostgres } from "./support/postgres.ts";

// The mutation run starts one Postgres for the whole run and hands its
// address to every test runner in TEST_DATABASE_URL. Stryker kills a runner
// that hangs, which skips its cleanup; a runner that only connects leaves
// nothing behind, where one that started its own Postgres would leak it.

const saved = { url: process.env.TEST_DATABASE_URL, kind: process.env.TEST_DATABASE };

afterEach(() => {
  process.env.TEST_DATABASE_URL = saved.url;
  process.env.TEST_DATABASE = saved.kind;
  if (saved.url === undefined) delete process.env.TEST_DATABASE_URL;
  if (saved.kind === undefined) delete process.env.TEST_DATABASE;
});

test("M1-1: with TEST_DATABASE_URL set, the tests use that Postgres and start none of their own", async () => {
  process.env.TEST_DATABASE_URL = "postgres://postgres:secret@127.0.0.1:1/postgres";
  process.env.TEST_DATABASE = "embedded";

  const postgres = await startPostgres();

  expect(postgres.url).toBe("postgres://postgres:secret@127.0.0.1:1/postgres");
  expect(postgres.kind).toBe("embedded");
  // Stopping it is the job of whoever started it.
  await expect(postgres.stop()).resolves.toBeUndefined();
});
