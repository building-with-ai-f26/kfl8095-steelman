import { expect, test } from "vitest";
import { useTestDatabase } from "../support/database.ts";
import { recount, soak } from "./soak.ts";

// The soak run (plans/architecture.md §8, layer 8) is 30 voters for five
// minutes in real time, nightly (`npm run test:soak`). Here the same run is
// short and doesn't pause, so `npm run check` proves the machinery works and
// that its recount can fail.

const db = useTestDatabase({ migrated: true });

test("M0-7 B-01 B-02 M-02: a short soak ends with stored counts equal to a recount, and every reader agrees with a fresh one", async () => {
  const result = await soak({ databaseUrl: db.url, voters: 6, stop: { actionsPerVoter: 25 }, pauseMs: [0, 0], seed: 1 });

  expect(result.errors).toEqual([]);
  expect(result.writes).toBeGreaterThan(50);
  expect(result.drifted).toEqual([]);
  expect(result.disagreeing).toEqual([]);
  // About two seconds alone; more when the machine is busy, as when every test file runs at once.
}, 60_000);

test("M0-7: the recount notices a count that drifted", async () => {
  const before = await recount(db.client);
  expect(before).toEqual([]);

  const { rows } = await db.client.query("select id from argument limit 1");
  // A write as the write path would make it, stamped with the board's next change number, but with a wrong count.
  await db.client.query("begin");
  const { rows: taken } = await db.client.query("select take_change_number('demo-board-1') as seq");
  await db.client.query("update argument set importance = importance + 1, changed_seq = $2 where id = $1", [rows[0].id, taken[0].seq]);
  await db.client.query("commit");
  expect(await recount(db.client)).toEqual([`argument ${rows[0].id}`]);
});
