import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { migrate, migrationNames } from "../../src/db/migrate.ts";
import { NOON, addAccount, asRole } from "../support/board.ts";
import { createTestDatabase, useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// How someone came into a space (G-04, M-07, M3d-33; plans/architecture.md
// §2, the space_member table): what the database itself holds true. Every
// membership says how it began, and every membership made before the column
// existed reads "invite", since an Owner or an Admin added each of them by
// name. "invite" and "join" are the service's words, so the schema doesn't
// list them (Q24). Account deletion reads the column and never changes it.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1931);

const via = async (client: typeof db.client, space: string, account: string) =>
  (await client.query("select joined_via from space_member where space_id = $1 and account_id = $2", [space, account])).rows[0]?.joined_via;

describe("how someone came into a space", () => {
  test("G-04: the migration applies as an upgrade, and every existing member reads invite, with nothing else changed", async () => {
    const upgrade = await createTestDatabase("space_joined_via_upgrade");
    try {
      const before = migrationNames().filter((name) => name < "0019");
      await migrate(upgrade.url, { to: before.at(-1)! });
      const owner = await addAccount(upgrade.client, ids, "jv_owner");
      const admin = await addAccount(upgrade.client, ids, "jv_admin");
      const member = await addAccount(upgrade.client, ids, "jv_member");
      const space = await addSpace(upgrade.client, ids, owner);
      await addSpaceMember(upgrade.client, space, admin, "admin", "2026-11-16T12:01:00Z");
      await addSpaceMember(upgrade.client, space, member, "member", "2026-11-16T12:02:00Z");
      const rowsBefore = (await upgrade.client.query("select * from space_member where space_id = $1 order by account_id", [space])).rows;

      const { applied } = await migrate(upgrade.url, { to: "0019_space_joined_via" });

      expect(applied).toEqual(["0019_space_joined_via"]);
      const rowsAfter = (await upgrade.client.query("select * from space_member where space_id = $1 order by account_id", [space])).rows;
      expect(rowsAfter).toEqual(rowsBefore.map((row) => ({ ...row, joined_via: "invite" })));
    } finally {
      await upgrade.drop();
    }
  });

  test("G-04, M-01: a membership takes invite, join, or any other word, and never no word at all", async () => {
    const owner = await addAccount(db.client, ids, "jv_b");
    const joiner = await addAccount(db.client, ids, "jv_b2");
    const other = await addAccount(db.client, ids, "jv_b3");
    const space = await addSpace(db.client, ids, owner);

    expect(await via(db.client, space, owner)).toBe("invite");
    await db.client.query("insert into space_member (space_id, account_id, role, joined_via, joined_at) values ($1, $2, 'member', 'join', $3)", [space, joiner, NOON]);
    expect(await via(db.client, space, joiner)).toBe("join");
    // The words are the service's (Q24), so the schema accepts one it doesn't know.
    await db.client.query("insert into space_member (space_id, account_id, role, joined_via, joined_at) values ($1, $2, 'member', 'imported', $3)", [space, other, NOON]);
    await expect(db.client.query("update space_member set joined_via = null where space_id = $1 and account_id = $2", [space, other])).rejects.toThrow(/null value/);
  });

  test("G-04, M-07: the service writes how someone came in, and account deletion may read it but never change it", async () => {
    const owner = await addAccount(db.client, ids, "jv_c");
    const joiner = await addAccount(db.client, ids, "jv_c2");
    const space = await addSpace(db.client, ids, owner);

    await asRole(db.client, "steelman_app", async () => {
      await db.client.query("insert into space_member (space_id, account_id, role, joined_via, joined_at) values ($1, $2, 'member', 'join', $3)", [space, joiner, NOON]);
      await db.client.query("update space_member set joined_via = 'invite' where space_id = $1 and account_id = $2", [space, joiner]);
    });
    await asRole(db.client, "steelman_account_deletion", async () => {
      expect((await db.client.query("select joined_via from space_member where space_id = $1 order by account_id", [space])).rows).toEqual([{ joined_via: "invite" }, { joined_via: "invite" }]);
    });
    await asRole(db.client, "steelman_account_deletion", async () => {
      await expect(db.client.query("update space_member set joined_via = 'join' where space_id = $1 and account_id = $2", [space, joiner])).rejects.toThrow(/permission denied/);
    });
  });
});
