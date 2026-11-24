import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import * as order from "../../src/order.ts";
import * as read from "../../src/read.ts";
import * as votes from "../../src/votes.ts";
import * as writing from "../../src/writing.ts";
import { playSequence } from "./world.ts";
import type { ServerCode, Step } from "./world.ts";

// Planted bugs for comments (D-01, M3b-10), as planted-closing.test.ts plants
// its own: a copy of the server's code with one change in read.ts. The
// simulation must catch each with the check that guards it. This file has its
// own copy of the planting helper, because the existing files are protected
// (AGENTS.md rule 9).

const db = useTestDatabase({ migrated: true });
let kysely: Db;
beforeAll(() => {
  kysely = createDatabase(db.url);
});
afterAll(async () => {
  await kysely.destroy();
});

const here = dirname(fileURLToPath(import.meta.url));
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

// Cy is offline while Ben comments on a wording and then on the question, and Ana hides the wording, so Cy comes back
// without the wording's comment. Ana restores it, and Cy catches up and presses Update.
const SEQUENCE: Step[] = [
  { kind: "offline", reader: 2 },
  { kind: "comment", reader: 1, on: "wording", target: 0 },
  { kind: "comment", reader: 1, on: "question", target: 0 },
  { kind: "hide", reader: 0, target: 0 },
  { kind: "online", reader: 2 },
  { kind: "restore", reader: 0, target: 0 },
  { kind: "update", reader: 2 },
];

test("D-01, M0-5: the same sequence holds every check with the real code, so each failure below is the planted bug's", async () => {
  await playSequence({ order, read, votes, writing }, { db: kysely, client: db.client }, SEQUENCE);
});

test("D-01, M0-5: a planted read that doesn't send a restored wording's comments again is caught by check 8", async () => {
  const planted = await plant(
    "restore-not-resent",
    "read.ts",
    'const restored = log.filter((row) => row.kind === "version_restored" || row.kind === "option_restored").map((row) => row.subjectId);',
    "const restored: string[] = [];",
  );
  try {
    await expect(playSequence(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(/8\. A caught-up reader who presses Update sees what a new reader sees/);
  } finally {
    planted.remove();
  }
});

test("D-01, M0-5: a planted read that sends every comment in every answer is caught by check 4", async () => {
  const planted = await plant("every-comment-sent", "read.ts", "(c.changed_seq > ${after} or", "(c.changed_seq >= 0 or");
  try {
    await expect(playSequence(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(/4\. No reader is handed a comment stamped at or below the change number they hold/);
  } finally {
    planted.remove();
  }
});

test("D-01, M0-5: a planted read that sends comments on a hidden wording is caught", async () => {
  const planted = await plant("hidden-subject-sent", "read.ts", "and v.hidden_at is null", "");
  try {
    await expect(playSequence(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(/D-01\. No reader is handed a comment whose wording or option is gone/);
  } finally {
    planted.remove();
  }
});
