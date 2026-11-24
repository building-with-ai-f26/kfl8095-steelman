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

// A planted bug for closing (M3b-4, I-05), as planted-bugs.test.ts plants its
// own: a copy of the server's code whose write path ignores the closing time,
// so a board closed by its time still takes writes. The simulation must catch
// it with its closing check (11), shrink the sequence, and print it. This file
// has its own copy of the planting helper, because the existing file is
// protected (AGENTS.md rule 9).

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const here = dirname(fileURLToPath(import.meta.url));
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

test("I-05, M0-5: a planted write path that ignores the closing time is caught by the closing check, with a shrunk sequence", async () => {
  const planted = await plant(
    "closing-time-ignored",
    "write-path.ts",
    "const closed = closedSince({ closedAt: board.closed_at, closesAt: board.closes_at }, clock.now()) !== null;",
    "const closed = closedSince({ closedAt: board.closed_at, closesAt: null }, clock.now()) !== null;",
  );
  try {
    const failure = await runSimulation(planted.code, { db: kysely, client: db.client }, { numRuns: 1000, seed: PLANTED_SEED }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure, "the simulation didn't catch the write path that ignores the closing time").toBeInstanceOf(Error);
    const error = failure as Error & { cause?: unknown };
    const report = `${error.message}\nWhich check failed: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`;
    console.log(`Planted bug "closing-time-ignored", as the simulation reports it:\n${report}`);
    expect(report).toMatch(/Counterexample: /);
    expect(report).toMatch(/Shrunk \d+ time/);
    expect(report).toMatch(/11\. A closed board refuses every write, closed by hand or by its time/);
  } finally {
    planted.remove();
  }
}, 600_000);
