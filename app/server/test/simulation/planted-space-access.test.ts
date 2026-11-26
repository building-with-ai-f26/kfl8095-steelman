import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import * as access from "../../src/access.ts";
import * as list from "../../src/list.ts";
import * as sharing from "../../src/sharing.ts";
import * as spaces from "../../src/spaces.ts";
import * as writing from "../../src/writing.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { NO_NON_MEMBER_READS_A_SPACE_BOARD, playSpaces } from "./space-world.ts";
import type { SpaceCode, SpaceStep } from "./space-world.ts";

// Planted bugs for space access (G-05, M3d-18), as planted-profiles.test.ts
// plants its own: a copy of the server's code with one change in one file.
// The space checks must catch each. This file has its own copy of the
// planting helper, because the existing files are protected (AGENTS.md
// rule 9).

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

/** A copy of server/src with one change made in `file`, with the modules the space world uses loaded from the copy. */
async function plant(name: string, file: string, from: string, to: string): Promise<{ code: SpaceCode; remove(): void }> {
  const directory = join(here, ".planted", `${name}-${randomBytes(3).toString("hex")}`);
  cpSync(source, directory, { recursive: true });
  const target = join(directory, file);
  const text = readFileSync(target, "utf8");
  if (!text.includes(from)) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`The planted bug "${name}" no longer fits ${file}: that code has changed shape. Plant it again in the new code.`);
  }
  writeFileSync(target, text.replace(from, to));
  const load = async (module: string) => import(pathToFileURL(join(directory, module)).href);
  const code = { access: await load("access.ts"), list: await load("list.ts"), sharing: await load("sharing.ts"), spaces: await load("spaces.ts"), writing: await load("writing.ts") } as SpaceCode;
  return { code, remove: () => rmSync(directory, { recursive: true, force: true }) };
}

// Board 1 is shared with everyone in the space as Contributor; person 3, outside the space, opens it and writes on it.
const SEQUENCE: SpaceStep[] = [
  { kind: "general", board: 1, general: "space", role: "contributor" },
  { kind: "open", person: 3, board: 1 },
  { kind: "write", person: 3, board: 1 },
  // Person 1 is removed from the space, and then writes on it.
  { kind: "remove", person: 1 },
  { kind: "write", person: 1, board: 1 },
];

test("G-05, M0-5: the same sequence holds the space checks with the real code, so the failures below are the planted bugs'", async () => {
  await playSpaces({ access, list, sharing, spaces, writing }, { db: kysely, client: db.client }, SEQUENCE);
}, 60_000);

test("G-05, M0-5: a planted role lookup that lets in anyone once a space has a member is caught", async () => {
  // As if the lookup asked whether the space has members rather than whether this person is one.
  const planted = await plant("any-member", "access.ts", "join space_member sm on sm.space_id = s.id and sm.account_id = ${person}", "join space_member sm on sm.space_id = s.id");
  try {
    await expect(playSpaces(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(NO_NON_MEMBER_READS_A_SPACE_BOARD);
  } finally {
    planted.remove();
  }
}, 60_000);

test("G-05, E-03, M0-5: a planted list that gives everyone the boards shared with any space is caught", async () => {
  // As if the list asked whether the space has members rather than whether this person is one.
  const planted = await plant("list-any-space", "access.ts", "and sm.account_id = ${person} and", "and");
  try {
    await expect(playSpaces(planted.code, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(NO_NON_MEMBER_READS_A_SPACE_BOARD);
  } finally {
    planted.remove();
  }
}, 60_000);
