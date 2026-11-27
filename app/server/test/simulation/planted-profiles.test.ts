import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import * as profiles from "../../src/profiles.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";
import { NO_ITEM_FROM_A_BOARD_WITHOUT_A_ROLE, playProfiles } from "./profile-world.ts";
import type { ProfileStep } from "./profile-world.ts";

// A planted bug for profiles (L-03, M3d-16), as planted-comments.test.ts
// plants its own: a copy of the server's code with one change in profiles.ts.
// The profile check must catch it. This file has its own copy of the planting
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

/** A copy of server/src with one change made, with its profiles.ts loaded as the code under test. */
async function plant(name: string, from: string, to: string): Promise<{ profiles: typeof profiles; remove(): void }> {
  const directory = join(here, ".planted", `${name}-${randomBytes(3).toString("hex")}`);
  cpSync(source, directory, { recursive: true });
  const target = join(directory, "profiles.ts");
  const text = readFileSync(target, "utf8");
  if (!text.includes(from)) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`The planted bug "${name}" no longer fits profiles.ts: that code has changed shape. Plant it again in the new code.`);
  }
  writeFileSync(target, text.replace(from, to));
  return { profiles: await import(pathToFileURL(join(directory, "profiles.ts")).href), remove: () => rmSync(directory, { recursive: true, force: true }) };
}

// Person 1 owns a link board that person 0 never opens, then opens, then is removed from.
const SEQUENCE: ProfileStep[] = [
  { kind: "write", person: 1, board: 1 },
  { kind: "join", person: 0, board: 1 },
  { kind: "remove", person: 0, board: 1 },
  { kind: "link", board: 2, on: false },
];

test("L-03, M0-5: the same sequence holds the profile check with the real code, so the failure below is the planted bug's", async () => {
  await playProfiles(profiles, { db: kysely, client: db.client }, SEQUENCE);
});

test("L-03, M0-5: a planted profile that counts every board open by its link as the viewer's is caught", async () => {
  // As if it asked whether the viewer could open the board (access.ts's entryTo) rather than whether they have a role.
  const planted = await plant("link-boards-count", "where m.account_id = ${viewer} and", "where (m.account_id = ${viewer} or b.general_access = 'link') and");
  try {
    await expect(playProfiles(planted.profiles, { db: kysely, client: db.client }, SEQUENCE)).rejects.toThrow(NO_ITEM_FROM_A_BOARD_WITHOUT_A_ROLE);
  } finally {
    planted.remove();
  }
});
