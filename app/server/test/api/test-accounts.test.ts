import { afterAll, beforeAll, expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { seedDemoBoard } from "../../src/demo-board.ts";
import { seedExampleBoards } from "../../src/example-boards.ts";
import { NOON } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The seed's test accounts (`npm run db:seed`, for the local "Acting as"
// switch) count as having confirmed an email, as everyone who signs in has,
// so a board open to anyone with the link lets them in. They still have no
// email: that's how the seed tells them from a real person's account.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const clock = createFakeClock(new Date(NOON));
const ids = createSeededIds(612);
let kysely: Db;
const accountId = async (username: string) => (await db.client.query("select id from account where username = $1", [username])).rows[0]?.id as string;

beforeAll(async () => {
  kysely = createDatabase(db.url);
  // An older seed's account, from before they counted as confirmed: running the seed again brings it up to date.
  await db.client.query("insert into account (id, username, created_at) values ('olderseedpriya000000', 'priya_s', $1)", [NOON]);
  await seedDemoBoard(kysely, clock, ids);
  await seedExampleBoards(kysely, clock, ids);
}, 60_000);
afterAll(async () => {
  await kysely.destroy();
});

test("H-02: every test account from the seed counts as confirmed, and has no email", async () => {
  const { rows } = await db.client.query("select username, email, email_verified from account order by username");

  expect(rows.length).toBeGreaterThan(5);
  for (const row of rows) expect(row, row.username).toMatchObject({ email: null, email_verified: true });
});

test("H-02: a test account opens another test account's board that's open to anyone with the link, and comes in with the link's role", async () => {
  const maya = await accountId("maya.chen");
  const tess = await accountId("tess.b");
  const { body } = await api.post("/api/boards", { as: maya, body: { question: "What is your favorite color?", options: ["Blue", "Red"] } });

  const opened = await api.get(`/api/boards/${(body as { board: string }).board}`, { as: tess });

  expect(opened.status).toBe(200);
  expect((opened.body as { role: string }).role).toBe("contributor");
});
