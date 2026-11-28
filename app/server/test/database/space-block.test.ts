import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { migrate, migrationNames } from "../../src/db/migrate.ts";
import { NOON, addAccount, asRole } from "../support/board.ts";
import { createTestDatabase, useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// Removal from a space sticks (G-04, G-07, M3d-35; plans/architecture.md §2,
// the space_block table; finding F3 of the public-spaces security review):
// what the database itself holds true. A block names a real space, a real
// account, and the real account that removed them, once per person per
// space. Its time comes from the service's clock. The service writes a block
// and lifts it, and never changes one; account deletion deletes a person's
// blocks and credits the blocks they wrote to the stand-in, and may change
// nothing else.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1935);

const blocks = async (client: typeof db.client, space: string) =>
  (await client.query("select account_id, blocked_by, at from space_block where space_id = $1 order by account_id", [space])).rows;

/** Olu owns a space, Ada is its Admin, and Mel is someone Ada removed (a block written straight to the table). */
async function blockedMel(prefix: string) {
  const olu = await addAccount(db.client, ids, `${prefix}_olu`);
  const ada = await addAccount(db.client, ids, `${prefix}_ada`);
  const mel = await addAccount(db.client, ids, `${prefix}_mel`);
  const space = await addSpace(db.client, ids, olu);
  await addSpaceMember(db.client, space, ada, "admin");
  await db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4)", [space, mel, ada, NOON]);
  return { olu, ada, mel, space };
}

describe("a removal that sticks", () => {
  test("G-04: the migration applies as an upgrade, with no block and nothing else changed", async () => {
    const upgrade = await createTestDatabase("space_block_upgrade");
    try {
      const before = migrationNames().filter((name) => name < "0020");
      await migrate(upgrade.url, { to: before.at(-1)! });
      const owner = await addAccount(upgrade.client, ids, "sb_owner");
      const member = await addAccount(upgrade.client, ids, "sb_member");
      const space = await addSpace(upgrade.client, ids, owner);
      await addSpaceMember(upgrade.client, space, member, "member", "2026-11-16T12:01:00Z");
      const membersBefore = (await upgrade.client.query("select * from space_member order by space_id, account_id")).rows;
      const spacesBefore = (await upgrade.client.query("select * from space order by id")).rows;

      const { applied } = await migrate(upgrade.url, { to: "0020_space_block" });

      expect(applied).toEqual(["0020_space_block"]);
      expect((await upgrade.client.query("select * from space_member order by space_id, account_id")).rows).toEqual(membersBefore);
      expect((await upgrade.client.query("select * from space order by id")).rows).toEqual(spacesBefore);
      expect((await upgrade.client.query("select count(*)::int as n from space_block")).rows[0].n).toBe(0);
    } finally {
      await upgrade.drop();
    }
  });

  test("G-04, M-01: space_block is in the schema's list of tables", async () => {
    const tables = (await db.client.query("select tablename from pg_tables where schemaname = 'public'")).rows.map((row) => row.tablename);

    expect(tables).toContain("space_block");
  });

  test("G-04, M-01: a block names a real space, a real account, and a real remover, once per person per space, with its time given", async () => {
    const { ada, mel, space } = await blockedMel("sb_keys");
    const nobody = ids.itemId();

    expect(await blocks(db.client, space)).toEqual([{ account_id: mel, blocked_by: ada, at: new Date(NOON) }]);
    await expect(db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4)", [space, mel, ada, NOON])).rejects.toThrow(/duplicate key/);
    await expect(db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4)", [nobody, mel, ada, NOON])).rejects.toThrow(/foreign key/);
    await expect(db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4)", [space, nobody, ada, NOON])).rejects.toThrow(/foreign key/);
    await expect(db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4)", [space, ada, nobody, NOON])).rejects.toThrow(/foreign key/);
    await expect(db.client.query("insert into space_block (space_id, account_id, blocked_by) values ($1, $2, $3)", [space, ada, mel])).rejects.toThrow(/null value/);
    await expect(db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, null, $3)", [space, ada, NOON])).rejects.toThrow(/null value/);
  });

  test("G-04: the service reads, writes, and lifts a block, and never changes one", async () => {
    const { olu, ada, mel, space } = await blockedMel("sb_app");

    await asRole(db.client, "steelman_app", async () => {
      expect((await db.client.query("select account_id from space_block where space_id = $1", [space])).rows).toEqual([{ account_id: mel }]);
      await db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4) on conflict (space_id, account_id) do nothing", [space, mel, olu, NOON]);
      await db.client.query("delete from space_block where space_id = $1 and account_id = $2", [space, mel]);
      await db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4)", [space, mel, ada, NOON]);
    });
    await asRole(db.client, "steelman_app", async () => {
      await expect(db.client.query("update space_block set blocked_by = $3 where space_id = $1 and account_id = $2", [space, mel, olu])).rejects.toThrow(/permission denied/);
    });
    expect(await blocks(db.client, space)).toEqual([{ account_id: mel, blocked_by: ada, at: new Date(NOON) }]);
  });

  test("G-04, M-07: account deletion deletes a block and credits its remover to the stand-in, and changes nothing else about it", async () => {
    const { olu, ada, mel, space } = await blockedMel("sb_del");
    const other = await addAccount(db.client, ids, "sb_del_other");
    await db.client.query("insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4)", [space, other, ada, NOON]);

    await asRole(db.client, "steelman_account_deletion", async () => {
      await db.client.query("delete from space_block where account_id = $1", [mel]);
      await db.client.query("update space_block set blocked_by = $2 where blocked_by = $1", [ada, olu]);
    });
    for (const statement of [
      ["insert into space_block (space_id, account_id, blocked_by, at) values ($1, $2, $3, $4)", [space, mel, ada, NOON]],
      ["update space_block set at = $2 where space_id = $1", [space, NOON]],
      ["update space_block set account_id = $2 where space_id = $1", [space, mel]],
    ] as const) {
      await asRole(db.client, "steelman_account_deletion", async () => {
        await expect(db.client.query(statement[0], [...statement[1]])).rejects.toThrow(/permission denied/);
      });
    }
    expect(await blocks(db.client, space)).toEqual([{ account_id: other, blocked_by: olu, at: new Date(NOON) }]);
  });
});
