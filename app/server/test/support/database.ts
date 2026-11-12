// Gives a test file its own empty database on the Postgres that the global
// setup started, and drops it when the file is done. Because no two files
// share one, test files can run side by side.

import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, expect, inject } from "vitest";
import { migrate } from "../../src/db/migrate.ts";

export interface TestDatabase {
  /** The database's name: the test file's name plus a random ending. */
  readonly name: string;
  /** Connection address, for code that opens its own connections. */
  readonly url: string;
  /** An open connection, for tests that just want to run SQL. */
  readonly client: pg.Client;
}

/** Makes one new, empty database. Most tests want `useTestDatabase` instead, which also cleans up. */
export async function createTestDatabase(label: string): Promise<TestDatabase & { drop(): Promise<void> }> {
  const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}_${randomBytes(4).toString("hex")}`;
  const url = new URL(inject("testDatabaseUrl"));
  await asAdmin((admin) => admin.query(`create database "${name}"`));
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  return {
    name,
    url: url.href,
    client,
    async drop() {
      await client.end();
      await asAdmin((admin) => admin.query(`drop database "${name}" with (force)`));
    },
  };
}

/**
 * Call once at the top of a test file. The database exists from before the
 * file's first test until after its last. It starts empty, or with every
 * migration applied if you ask for `migrated`.
 */
export function useTestDatabase(options: { migrated?: boolean } = {}): TestDatabase {
  let current: (TestDatabase & { drop(): Promise<void> }) | undefined;

  beforeAll(async () => {
    const file = basename(expect.getState().testPath ?? "test").replace(/\.test\.tsx?$/, "");
    current = await createTestDatabase(file);
    if (options.migrated) await migrate(current.url);
  });

  afterAll(async () => {
    const finished = current;
    current = undefined;
    await finished?.drop();
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
