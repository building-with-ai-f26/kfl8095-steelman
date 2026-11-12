// Runs once before the browser tests: starts Postgres (Docker or embedded,
// as for the other tests), migrates one template database that each test
// copies, and builds the web app once. Returns the matching teardown.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { build } from "vite";
import { migrate } from "../../server/src/db/migrate.ts";
import { startPostgres } from "../../server/test/support/postgres.ts";

export const TEMPLATE_DATABASE = "steelman_e2e_template";

export default async function globalSetup() {
  const postgres = await startPostgres();
  const admin = new pg.Client({ connectionString: postgres.url });
  await admin.connect();
  await admin.query(`create database ${TEMPLATE_DATABASE}`);
  await admin.end();
  const template = new URL(postgres.url);
  template.pathname = `/${TEMPLATE_DATABASE}`;
  await migrate(template.href);

  const webDirectory = await mkdtemp(join(tmpdir(), "steelman-e2e-web-"));
  await build({ root: join(import.meta.dirname, "../../web"), mode: "test", logLevel: "warn", build: { outDir: webDirectory, emptyOutDir: true } });

  // Workers read these when they start.
  process.env.E2E_DATABASE_URL = postgres.url;
  process.env.E2E_WEB_DIRECTORY = webDirectory;

  return async () => {
    await postgres.stop();
    await rm(webDirectory, { recursive: true, force: true });
  };
}
