// Gives a test file its own empty database on the Postgres that the global
// setup started, and drops it when the file is done. Because no two files
// share one, test files can run side by side.

import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, expect, inject } from "vitest";

export interface TestDatabase {
  /** The database's name: the test file's name plus a random ending. */
  readonly name: string;
  /** Connection address, for code that opens its own connections. */
  readonly url: string;
  /** An open connection, for tests that just want to run SQL. */
  readonly client: pg.Client;
}

/**
 * Call once at the top of a test file. The database exists from before the
 * file's first test until after its last.
 */
export function useTestDatabase(): TestDatabase {
  let current: TestDatabase | undefined;

  beforeAll(async () => {
    const file = basename(expect.getState().testPath ?? "test").replace(/\.test\.tsx?$/, "");
    const name = `${file.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}_${randomBytes(4).toString("hex")}`;
    const url = new URL(inject("testDatabaseUrl"));
    await asAdmin((admin) => admin.query(`create database "${name}"`));
    url.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: url.href });
    await client.connect();
    current = { name, url: url.href, client };
  });

  afterAll(async () => {
    if (!current) return;
    const { name, client } = current;
    current = undefined;
    await client.end();
    await asAdmin((admin) => admin.query(`drop database "${name}" with (force)`));
  });

  const started = (): TestDatabase => {
    if (!current) throw new Error("The test database exists only while the file's tests are running");
    return current;
  };
  return {
    get name() { return started().name; },
    get url() { return started().url; },
    get client() { return started().client; },
  };
}

async function asAdmin(work: (admin: pg.Client) => Promise<unknown>): Promise<void> {
  const admin = new pg.Client({ connectionString: inject("testDatabaseUrl") });
  await admin.connect();
  try {
    await work(admin);
  } finally {
    await admin.end();
  }
}
