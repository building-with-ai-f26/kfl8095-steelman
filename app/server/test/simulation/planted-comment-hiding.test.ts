import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { playSequence } from "./world.ts";
import type { ServerCode, Step } from "./world.ts";

// Planted bugs for hiding a comment (M3b-14, D-01, J-02), as
// planted-comments.test.ts plants its own: a copy of the server's code with
// one change, in read.ts or in moderation.ts. The simulation must catch each
// with the check that guards it. This file has its own copy of the planting
// helper, because the existing files are protected (AGENTS.md rule 9).

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

/** A copy of server/src with one change made, loaded as the code under test, moderation.ts included. */
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
  const code: ServerCode = {
    votes: await load("votes.ts"),
    writing: await load("writing.ts"),
    read: await load("read.ts"),
    order: await load("order.ts"),
    moderation: await load("moderation.ts"),
  };
  return { code, remove: () => rmSync(directory, { recursive: true, force: true }) };
}

// Ben comments on a wording and Cy on the question, and Ana tries to hide her own comment, then hides Ben's. Ben and Cy
// poll, and a new reader opens the board.
const SEQUENCE: Step[] = [
  { kind: "comment", reader: 1, on: "wording", target: 0 },
  { kind: "minutePasses" },
  { kind: "comment", reader: 0, on: "question", target: 0 },
  { kind: "minutePasses" },
  { kind: "hideComment", reader: 0, target: 1 },
  { kind: "poll", reader: 0 },
  { kind: "hideComment", reader: 0, target: 0 },
  { kind: "poll", reader: 1 },
  { kind: "poll", reader: 2 },
  { kind: "update", reader: 1 },
];

test("D-01, J-02, M0-5: the same sequence holds every check with the real code, so each failure below is the planted bug's", async () => {
  const real = await plant("unchanged", "read.ts", "", "");
  try {
    await playSequence(real.code, { db: kysely, client: db.client }, SEQUENCE);
  } finally {
    real.remove();
  }
});

test("D-01, J-02, M0-5: a planted read that sends a hidden comment's text to everyone is caught by check 10, for comments", async () => {
  const planted = await plant("hidden-comment-text", "read.ts", "body: row.deleted || (row.hidden && !moderator) ? null : row.body,", "body: row.deleted ? null : row.body,");
  try {
    await expect(playSequence(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(/10\. No hidden comment's text reaches anyone but an Editor or the Owner/);
  } finally {
    planted.remove();
  }
});

test("D-01, J-02, M0-5: a planted service that lets a moderator hide their own comment is caught by check 9", async () => {
  const planted = await plant("own-comment-hidden", "moderation.ts", 'comment.author_id === person ? { refused: "own_comment" as const } : null', "null");
  try {
    await expect(playSequence(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(/9\. A hide or restore of a comment is done, or refused for the reason the database gives/);
  } finally {
    planted.remove();
  }
});
