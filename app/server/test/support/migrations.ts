// Applies the SQL migrations in server/migrations to a test database, in
// file-name order, each in its own transaction.
//
// This is a test helper only. `npm run db:migrate`, which applies the same
// files outside tests and records which have run, arrives with the migration
// runner (see the pull request for M0-3).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const directory = fileURLToPath(new URL("../../migrations/", import.meta.url));

export function migrationFiles(): string[] {
  return readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
}

export async function applyMigrations(client: pg.Client): Promise<void> {
  for (const file of migrationFiles()) {
    const sql = readFileSync(`${directory}${file}`, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Migration ${file} failed: ${String(error)}`, { cause: error });
    }
  }
}
