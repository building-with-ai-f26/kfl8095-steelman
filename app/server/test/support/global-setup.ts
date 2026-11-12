// Runs once before the server's tests: starts Postgres and tells the test
// files where it is. Runs once after them: stops it.

import type { TestProject } from "vitest/node";
import { startPostgres } from "./postgres.ts";

export default async function setup(project: TestProject) {
  const postgres = await startPostgres();
  project.provide("testDatabaseUrl", postgres.url);
  project.provide("testDatabaseKind", postgres.kind);
  return () => postgres.stop();
}

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
    testDatabaseKind: "docker" | "embedded";
  }
}
