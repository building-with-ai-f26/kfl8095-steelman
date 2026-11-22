import { expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The tour (L-02, M2-9): shown once per account, on any device. The service
// keeps when the account was first shown it (account.tour_seen_at); the board
// asks whether it has been, and says so when it shows it.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(909);

const seenAt = async (account: string) => (await db.client.query("select tour_seen_at from account where id = $1", [account])).rows[0].tour_seen_at as Date | null;

test("L-02: an account that has never been shown the tour hasn't seen it", async () => {
  const ana = await addAccount(db.client, ids, "ana_tour", { confirmed: true });

  expect(await api.get("/api/account/tour", { as: ana })).toMatchObject({ status: 200, body: { seen: false } });
});

test("L-02: once the tour has been shown, the account has seen it, whichever device asks", async () => {
  const ben = await addAccount(db.client, ids, "ben_tour", { confirmed: true });

  expect(await api.put("/api/account/tour", { as: ben })).toMatchObject({ status: 200, body: { status: "done" } });

  expect((await api.get("/api/account/tour", { as: ben })).body).toEqual({ seen: true });
  expect(await seenAt(ben)).toEqual(api.clock.now());
});

test("L-02: saying so again, as a retaken tour does, keeps when it was first shown", async () => {
  const cy = await addAccount(db.client, ids, "cy_tour", { confirmed: true });
  await api.put("/api/account/tour", { as: cy });
  const first = api.clock.now();

  api.clock.advance(60 * 60_000);
  await api.put("/api/account/tour", { as: cy });

  expect(await seenAt(cy)).toEqual(first);
});

test("L-02: one account seeing the tour doesn't count for another", async () => {
  const dee = await addAccount(db.client, ids, "dee_tour", { confirmed: true });
  const eli = await addAccount(db.client, ids, "eli_tour", { confirmed: true });

  await api.put("/api/account/tour", { as: dee });

  expect((await api.get("/api/account/tour", { as: eli })).body).toEqual({ seen: false });
});

test("L-02: signed out, there is no tour to ask about or to mark", async () => {
  expect(await api.get("/api/account/tour")).toMatchObject({ status: 401, body: { reason: "signed_out" } });
  expect(await api.put("/api/account/tour")).toMatchObject({ status: 401, body: { reason: "signed_out" } });
});
