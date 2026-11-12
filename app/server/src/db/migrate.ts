// The migration runner: applies the plain SQL files in server/migrations, in
// file-name order, and records which have run (plans/architecture.md §6).
//
// It uses the migration tool that comes with Kysely, which expects each
// migration as code; `SqlFiles` below hands it each .sql file wrapped as "run
// this text". On Postgres, Kysely runs everything still to apply inside one
// transaction, behind a lock: if any migration fails, none of that run is
// kept, and two runners can't trip over each other.
//
// Migrations only move forward. There is no "down": undoing one is a new
// migration (AGENTS.md rule 7).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Migrator } from "kysely/migration";
import type { Migration, MigrationProvider } from "kysely/migration";
import pg from "pg";

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** Kysely keeps its record of what has run in two small tables. They live in this schema, apart from the product's own. */
const BOOKKEEPING_SCHEMA = "migrations";

/** The migrations in a directory, by name (the file name without ".sql"), in the order they run. */
export function migrationNames(directory: string = MIGRATIONS_DIRECTORY): string[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.slice(0, -".sql".length))
    .sort();
}

class SqlFiles implements MigrationProvider {
  constructor(private readonly directory: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {};
    for (const name of migrationNames(this.directory)) {
      const text = readFileSync(join(this.directory, `${name}.sql`), "utf8");
      migrations[name] = { up: async (db) => void (await sql.raw(text).execute(db)) };
    }
    return migrations;
  }
}

export interface MigrateOptions {
  /** Stop after this migration instead of running them all. Used by the upgrade test. */
  to?: string;
  /** Where the .sql files are. Tests point this at a directory of their own. */
  directory?: string;
}

/**
 * Brings a database up to date.
 *
 * @returns The names of the migrations this run applied, in order.
 * @throws If a migration fails. Nothing from the run is kept.
 */
export async function migrate(databaseUrl: string, options: MigrateOptions = {}): Promise<{ applied: string[] }> {
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl, max: 1 }) }),
  });
  try {
    const migrator = new Migrator({
      db,
      provider: new SqlFiles(options.directory ?? MIGRATIONS_DIRECTORY),
      migrationTableSchema: BOOKKEEPING_SCHEMA,
    });
    const { error, results = [] } = options.to ? await migrator.migrateTo(options.to) : await migrator.migrateToLatest();
    if (error) {
      const failed = results.find((result) => result.status === "Error")?.migrationName;
      throw new Error(`Migration ${failed ?? "run"} failed, so none of this run was kept: ${String(error)}`, { cause: error });
    }
    return { applied: results.filter((result) => result.status === "Success").map((result) => result.migrationName) };
  } finally {
    await db.destroy();
  }
}
