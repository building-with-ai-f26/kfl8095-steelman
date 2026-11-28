import { describe, expect, test } from "vitest";
import { migrate, migrationNames } from "../../src/db/migrate.ts";
import { NOON } from "../support/board.ts";
import { createTestDatabase, useTestDatabase } from "../support/database.ts";

// One email address, one account (L-01; build plan M3d-32, finding F7; the
// builder's decision on Nov 28): what the database itself holds true,
// whatever the code does. Two accounts can't have addresses that are the same
// once their case is lowered and Unicode NFKC is applied, so capitals, a
// composed or decomposed letter, and a full-width letter all count as one
// address. An account with no email (a deleted one, or a test user) takes no
// address. Q24 allows the index, because one account per address is an
// invariant.

const db = useTestDatabase({ migrated: true });

let n = 0;
const account = (email: string | null, client = db.client) =>
  client.query("insert into account (id, created_at, email, email_verified) values ($1, $2, $3, true)", [`one-email-${++n}`, NOON, email]);

describe("an email address in the account table", () => {
  test("L-01: a second account for the same address in other capitals is refused", async () => {
    await account("dana@x.edu");
    await expect(account("Dana@X.EDU")).rejects.toThrow(/duplicate key/);
  });

  test("L-01: a second account for the same address with a decomposed é is refused", async () => {
    await account("café@x.edu");
    await expect(account("café@x.edu")).rejects.toThrow(/duplicate key/);
  });

  test("L-01: a second account for the same address with a full-width letter is refused", async () => {
    await account("robin@x.edu");
    await expect(account("ｒobin@x.edu")).rejects.toThrow(/duplicate key/);
    await expect(account("Ｒobin@x.edu")).rejects.toThrow(/duplicate key/);
  });

  test("L-01: other addresses, and accounts with no email, are all allowed", async () => {
    await account("sam@x.edu");
    await account("sam.reyes@x.edu");
    await account("sam+boards@x.edu");
    await account(null);
    await account(null);
  });

  test("L-01: the migration applies as an upgrade of a database that already holds accounts", async () => {
    const upgrade = await createTestDatabase("one_email_upgrade");
    try {
      const before = migrationNames().filter((name) => name < "0018");
      await migrate(upgrade.url, { to: before.at(-1)! });
      await account("kept@x.edu", upgrade.client);
      await account("Other@X.edu", upgrade.client);
      await account(null, upgrade.client);

      const { applied } = await migrate(upgrade.url);

      expect(applied[0]).toMatch(/^0018_one_email$/);
      expect((await upgrade.client.query("select email from account order by email")).rows).toEqual([{ email: "Other@X.edu" }, { email: "kept@x.edu" }, { email: null }]);
      await expect(account("KEPT@x.edu", upgrade.client)).rejects.toThrow(/duplicate key/);
    } finally {
      await upgrade.drop();
    }
  });

  test("L-01: over two accounts that already share an address, the upgrade stops and keeps both, as a deploy to staging would", async () => {
    const upgrade = await createTestDatabase("one_email_collision");
    try {
      const before = migrationNames().filter((name) => name < "0018");
      await migrate(upgrade.url, { to: before.at(-1)! });
      // Before 0018, only capitals counted, so these two could both exist.
      await account("café@x.edu", upgrade.client);
      await account("café@x.edu", upgrade.client);

      await expect(migrate(upgrade.url)).rejects.toThrow(/0018_one_email/);

      expect((await upgrade.client.query("select count(*)::int as n from account")).rows[0].n).toBe(2);
      const index = await upgrade.client.query("select 1 from pg_indexes where indexname = 'account_email_one'");
      expect(index.rowCount).toBe(0);
    } finally {
      await upgrade.drop();
    }
  });
});
