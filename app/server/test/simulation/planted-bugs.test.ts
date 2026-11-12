import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { runSimulation } from "./world.ts";
import type { ServerCode } from "./world.ts";

// "The simulation has to be shown to fail" (plans/architecture.md §8). Each
// test copies the server's code, plants one deliberate bug in the copy, and
// runs the simulation against it. The simulation must fail, shrink the
// sequence that shows it, and print it.
//
// If the code a bug is planted in changes shape, its test fails with a note
// saying so: that is the moment to plant it again (architecture §8).

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const here = dirname(fileURLToPath(import.meta.url));

// A fixed seed, so whether a planted bug is found never depends on luck: the
// same sequences are tried every time, up to 1,000 of them. A run stops at the
// first failure, so this costs time only if a bug goes unseen. (The ordinary
// simulation uses a new seed each run, to keep exploring.)
const PLANTED_SEED = 2026;
const source = join(here, "../../src");

/** A copy of server/src with one change made, loaded as the code under test. */
async function plant(name: string, file: string, from: string, to: string): Promise<{ code: ServerCode; remove(): void }> {
  const directory = join(here, ".planted", `${name}-${randomBytes(3).toString("hex")}`);
  cpSync(source, directory, { recursive: true });
  const target = join(directory, file);
  const text = readFileSync(target, "utf8");
  if (!text.includes(from)) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`The planted bug "${name}" no longer fits ${file}: that code has changed shape. Plant it again in the new code.`);
  }
  writeFileSync(target, text.replace(from, to));
  const load = (module: string) => import(pathToFileURL(join(directory, module)).href);
  const code: ServerCode = { votes: await load("votes.ts"), writing: await load("writing.ts"), read: await load("read.ts"), order: await load("order.ts") };
  return { code, remove: () => rmSync(directory, { recursive: true, force: true }) };
}

async function expectCaught(name: string, file: string, from: string, to: string, shows: RegExp): Promise<void> {
  const planted = await plant(name, file, from, to);
  try {
    const failure = await runSimulation(planted.code, { db: kysely, client: db.client }, { numRuns: 1000, seed: PLANTED_SEED }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure, `the simulation didn't catch "${name}"`).toBeInstanceOf(Error);
    // fast-check's message has the seed and the shrunk sequence; the check that failed is its cause.
    const error = failure as Error & { cause?: unknown };
    const report = `${error.message}\nWhich check failed: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`;
    console.log(`Planted bug "${name}", as the simulation reports it:\n${report}`);
    expect(report).toMatch(/Counterexample: /);
    expect(report).toMatch(/Shrunk \d+ time/);
    expect(report).toMatch(shows);
  } finally {
    planted.remove();
  }
}

test("M0-5: a planted skipped stamp is caught, with a shrunk sequence", async () => {
  await expectCaught(
    "skipped-stamp",
    "votes.ts",
    "importance_voters: sql<number>`(select count(*) from importance_vote where argument_id = ${argumentId})`,\n          changed_seq: seq,\n",
    "importance_voters: sql<number>`(select count(*) from importance_vote where argument_id = ${argumentId})`,\n",
    /must be stamped/,
  );
}, 600_000);

test("M0-5: a planted bug counting an old revision's assessments is caught, with a shrunk sequence", async () => {
  await expectCaught(
    "old-revision-counted",
    "votes.ts",
    "yes: sql<number>`(select count(*) from assessment where version_id = ${versionId} and rev = ${rev} and supported)`,\n          no: sql<number>`(select count(*) from assessment where version_id = ${versionId} and rev = ${rev} and not supported)`,",
    "yes: sql<number>`(select count(*) from assessment where version_id = ${versionId} and supported)`,\n          no: sql<number>`(select count(*) from assessment where version_id = ${versionId} and not supported)`,",
    /1 and 3\. Every count equals a recount/,
  );
}, 600_000);
