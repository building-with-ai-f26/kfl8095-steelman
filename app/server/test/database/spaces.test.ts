import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { migrate, migrationNames } from "../../src/db/migrate.ts";
import { NOON, addAccount, asRole, seedBoard } from "../support/board.ts";
import { createTestDatabase, useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// The space tables (G-03, G-04, M3d-17; plans/architecture.md §2, "Entities"):
// what the database itself holds true, whatever the code does. A space names
// the account that made it; a membership names a real space and a real
// account, once per person per space; a space change row names its space and
// who made it, and holds IDs and short keywords only, never text (invariant 7).
// Lengths, the role words, the canvases, the visibilities, and "exactly one
// owner" are the service's rules, not the schema's (Q24).

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1717);

const insertSpace = (values: { id?: string | null; name?: string | null; about?: string | null; canvas?: string | null; visibility?: string | null; createdBy?: string | null; createdAt?: string | null }) =>
  db.client.query("insert into space (id, name, about, canvas, visibility, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7)", [
    values.id === undefined ? ids.itemId() : values.id,
    values.name === undefined ? "Pod 6" : values.name,
    values.about === undefined ? "" : values.about,
    values.canvas === undefined ? "stone" : values.canvas,
    values.visibility === undefined ? "private" : values.visibility,
    values.createdBy,
    values.createdAt === undefined ? NOON : values.createdAt,
  ]);

const insertChange = (space: string, actor: string, after: object) =>
  db.client.query("insert into space_change (space_id, at, actor_id, kind, after) values ($1, $2, $3, 'space_edited', $4)", [space, NOON, actor, JSON.stringify(after)]);

describe("the space tables", () => {
  test("G-03, M-01: a space names a real account as its maker, and every column is there", async () => {
    const a = await addAccount(db.client, ids, "space_a");

    await expect(insertSpace({ createdBy: "no-such-account" })).rejects.toThrow(/foreign key/);
    for (const column of ["id", "name", "about", "canvas", "visibility", "createdAt"] as const) {
      await expect(insertSpace({ createdBy: a, [column]: null }), column).rejects.toThrow(/null value/);
    }
    await expect(insertSpace({ createdBy: null })).rejects.toThrow(/null value/);
    await insertSpace({ createdBy: a });
  });

  test("G-03, M-01: the database checks no length or value, which are the service's to check (Q24)", async () => {
    const a = await addAccount(db.client, ids, "space_b");

    await insertSpace({ createdBy: a, name: "n".repeat(300), about: "a".repeat(3000), canvas: "plaid", visibility: "anything" });
    const space = await addSpace(db.client, ids, a);
    const b = await addAccount(db.client, ids, "space_b2");
    await db.client.query("insert into space_member (space_id, account_id, role, joined_at) values ($1, $2, 'moderator', $3)", [space, b, NOON]);
  });

  test("G-04, M-01: a membership names a real space and a real account, once per person per space", async () => {
    const a = await addAccount(db.client, ids, "space_c");
    const b = await addAccount(db.client, ids, "space_c2");
    const space = await addSpace(db.client, ids, a);

    await expect(addSpaceMember(db.client, space, a, "admin")).rejects.toThrow(/duplicate key/);
    await expect(addSpaceMember(db.client, "no-such-space", b, "member")).rejects.toThrow(/foreign key/);
    await expect(addSpaceMember(db.client, space, "no-such-account", "member")).rejects.toThrow(/foreign key/);
    await expect(db.client.query("insert into space_member (space_id, account_id, role, joined_at) values ($1, $2, null, $3)", [space, b, NOON])).rejects.toThrow(/null value/);
    await expect(db.client.query("insert into space_member (space_id, account_id, role, joined_at) values ($1, $2, 'member', null)", [space, b])).rejects.toThrow(/null value/);
    await addSpaceMember(db.client, space, b, "member");
  });

  test("G-03, G-04, M-01: an account or a space with memberships can't be removed, so deleting an account keeps its row", async () => {
    const a = await addAccount(db.client, ids, "space_d");
    const space = await addSpace(db.client, ids, a);

    await expect(db.client.query("delete from account where id = $1", [a])).rejects.toThrow(/foreign key/);
    await expect(db.client.query("delete from space where id = $1", [space])).rejects.toThrow(/foreign key/);
  });

  test("G-03, G-04, M-01: a space change row names its space and who made it, and holds no text", async () => {
    const a = await addAccount(db.client, ids, "space_e");
    const space = await addSpace(db.client, ids, a);

    await insertChange(space, a, { account: a, role: "admin" });
    await expect(insertChange(space, a, { name: "Pod 6, the renamed one" })).rejects.toThrow(/check constraint/);
    await expect(insertChange("no-such-space", a, {})).rejects.toThrow(/foreign key/);
    await expect(insertChange(space, "no-such-account", {})).rejects.toThrow(/foreign key/);
    const rows = (await db.client.query("select id, before, after from space_change where space_id = $1", [space])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toEqual({});
  });

  test("G-03, G-04, M-01: the service reads, adds, and changes spaces, but never removes one; it adds and removes memberships; it only adds change rows", async () => {
    const a = await addAccount(db.client, ids, "space_f");
    const b = await addAccount(db.client, ids, "space_f2");
    const space = await addSpace(db.client, ids, a);
    await asRole(db.client, "steelman_app", async () => {
      await insertSpace({ createdBy: a });
      await db.client.query("update space set name = 'Renamed' where id = $1", [space]);
      await addSpaceMember(db.client, space, b, "member");
      await db.client.query("update space_member set role = 'admin' where space_id = $1 and account_id = $2", [space, b]);
      expect((await db.client.query("delete from space_member where space_id = $1 and account_id = $2", [space, b])).rowCount).toBe(1);
      await insertChange(space, a, {});
      expect((await db.client.query("select count(*)::int as n from space_change where space_id = $1", [space])).rows[0].n).toBe(1);
    });
    await asRole(db.client, "steelman_app", async () => {
      await expect(db.client.query("delete from space where id = $1", [space])).rejects.toThrow(/permission denied/);
    });
    await asRole(db.client, "steelman_app", async () => {
      await expect(db.client.query("update space_change set kind = 'x' where space_id = $1", [space])).rejects.toThrow(/permission denied/);
    });
    await asRole(db.client, "steelman_app", async () => {
      await expect(db.client.query("delete from space_change where space_id = $1", [space])).rejects.toThrow(/permission denied/);
    });
  });

  test("G-03, G-04, M-07: account deletion may hand a space over, erase one, end memberships, and scrub change rows, and nothing more", async () => {
    const a = await addAccount(db.client, ids, "space_g");
    const b = await addAccount(db.client, ids, "space_g2");
    const space = await addSpace(db.client, ids, a);
    await addSpaceMember(db.client, space, b, "member");
    await insertChange(space, a, { account: a });
    await asRole(db.client, "steelman_account_deletion", async () => {
      await db.client.query("select id from space where id = $1 for update", [space]);
      await db.client.query("update space_member set role = 'owner' where space_id = $1 and account_id = $2", [space, b]);
      await db.client.query("delete from space_member where space_id = $1 and account_id = $2", [space, a]);
      await db.client.query("update space set created_by = $2, name = '', about = '', deleted_at = $3 where id = $1", [space, b, NOON]);
      await db.client.query("update space_change set actor_id = $2, before = '{}', after = '{}' where space_id = $1", [space, b]);
    });
    await asRole(db.client, "steelman_account_deletion", async () => {
      await expect(db.client.query("update space set canvas = 'sage' where id = $1", [space])).rejects.toThrow(/permission denied/);
    });
    await asRole(db.client, "steelman_account_deletion", async () => {
      await expect(db.client.query("delete from space where id = $1", [space])).rejects.toThrow(/permission denied/);
    });
    await asRole(db.client, "steelman_account_deletion", async () => {
      await expect(db.client.query("update space_change set kind = 'x' where space_id = $1", [space])).rejects.toThrow(/permission denied/);
    });
  });

  test("G-03, G-04, M-01: the migration applies as an upgrade of a database that already holds accounts and boards, and changes none of them", async () => {
    const upgrade = await createTestDatabase("spaces_upgrade");
    try {
      const before = migrationNames().filter((name) => name < "0016");
      await migrate(upgrade.url, { to: before.at(-1)! });
      await upgrade.client.query("insert into account (id, username, created_at) values ('kept', 'kept_name', $1)", [NOON]);
      const board = await seedBoard(upgrade.client, ids);
      const boardBefore = (await upgrade.client.query("select * from board where id = $1", [board.board])).rows;

      // Up to 0016 only: 0017 (M3d-18) adds board.space_id, which this check of 0016 doesn't expect (the builder approved, Nov 26).
      const { applied } = await migrate(upgrade.url, { to: "0016_spaces" });

      expect(applied[0]).toMatch(/^0016_spaces$/);
      expect((await upgrade.client.query("select username from account where id = 'kept'")).rows).toEqual([{ username: "kept_name" }]);
      expect((await upgrade.client.query("select * from board where id = $1", [board.board])).rows).toEqual(boardBefore);
      for (const table of ["space", "space_member", "space_change"]) {
        expect((await upgrade.client.query(`select count(*)::int as n from ${table}`)).rows[0].n, table).toBe(0);
      }
      // A board isn't in a space yet: that is M3d-18's column.
      expect((await upgrade.client.query("select 1 from information_schema.columns where table_name = 'board' and column_name = 'space_id'")).rowCount).toBe(0);
    } finally {
      await upgrade.drop();
    }
  });
});
