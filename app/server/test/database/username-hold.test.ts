import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { migrate, migrationNames } from "../../src/db/migrate.ts";
import { NOON, addAccount, asRole } from "../support/board.ts";
import { createTestDatabase, useTestDatabase } from "../support/database.ts";

// The username_hold table (L-04, M3d-15; plans/architecture.md §2, "Entities"):
// what the database itself holds true, whatever the code does. An old name is
// held by one account at a time, whatever its capitals; every hold names a
// real account and says when it ends. The 30-day limit and taking a name back
// are the service's rules, not the schema's (Q24).

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1516);
const ENDS = "2026-12-16T12:00:00Z";

const hold = (oldName: string | null, account: string | null, endsAt: string | null = ENDS) =>
  db.client.query("insert into username_hold (old_name, account_id, ends_at) values ($1, $2, $3)", [oldName, account, endsAt]);

describe("the username_hold table", () => {
  test("L-04, M-01: an old name is held once, whatever its capitals", async () => {
    const a = await addAccount(db.client, ids, "hold_a");
    const b = await addAccount(db.client, ids, "hold_b");
    await hold("lin_zhao", a);

    await expect(hold("Lin_Zhao", b)).rejects.toThrow(/duplicate key/);
    await expect(hold("lin_zhao", a)).rejects.toThrow(/duplicate key/);
    await hold("lin_zhao_2", a);
  });

  test("L-04, M-01: a hold names a real account, its old name, and when it ends", async () => {
    const a = await addAccount(db.client, ids, "hold_c");

    await expect(hold("nobody_held", "no-such-account")).rejects.toThrow(/foreign key/);
    await expect(hold(null, a)).rejects.toThrow(/null value/);
    await expect(hold("held_name", null)).rejects.toThrow(/null value/);
    await expect(hold("held_name", a, null)).rejects.toThrow(/null value/);
  });

  test("L-04, M-01: an account with a hold can't be removed, so deleting the account keeps it", async () => {
    const a = await addAccount(db.client, ids, "hold_d");
    await hold("kept_name", a);

    await expect(db.client.query("delete from account where id = $1", [a])).rejects.toThrow(/foreign key/);
  });

  test("L-04: the service may read, add, and delete holds, and may not change one", async () => {
    const a = await addAccount(db.client, ids, "hold_e");
    await asRole(db.client, "steelman_app", async () => {
      await hold("svc_name", a);
      expect((await db.client.query("select old_name from username_hold where account_id = $1", [a])).rows).toEqual([{ old_name: "svc_name" }]);
      await expect(db.client.query("update username_hold set ends_at = $1 where account_id = $2", [NOON, a])).rejects.toThrow(/permission denied/);
    });
    await asRole(db.client, "steelman_app", async () => {
      expect((await db.client.query("delete from username_hold where account_id = $1", [a])).rowCount).toBe(1);
    });
  });

  test("L-04, M-01: the migration applies as an upgrade of a database that already holds accounts", async () => {
    const upgrade = await createTestDatabase("username_hold_upgrade");
    try {
      const before = migrationNames().filter((name) => name < "0015");
      await migrate(upgrade.url, { to: before.at(-1)! });
      await upgrade.client.query("insert into account (id, username, created_at) values ('kept', 'kept_name', $1)", [NOON]);

      const { applied } = await migrate(upgrade.url);

      expect(applied[0]).toMatch(/^0015_username_hold$/);
      expect((await upgrade.client.query("select username from account")).rows).toEqual([{ username: "kept_name" }]);
      expect((await upgrade.client.query("select count(*)::int as n from username_hold")).rows[0].n).toBe(0);
    } finally {
      await upgrade.drop();
    }
  });
});
