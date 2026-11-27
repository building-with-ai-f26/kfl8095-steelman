import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { migrate, migrationNames } from "../../src/db/migrate.ts";
import { NOON, addAccount, asRole, seedBoard } from "../support/board.ts";
import { createTestDatabase, useTestDatabase } from "../support/database.ts";
import { addSpace } from "../support/space.ts";

// A board's space (G-04, G-05, M-01, M3d-18; plans/architecture.md §2, the
// board table's space_id): what the database itself holds true. A board is in
// no space, or in one real space. "Everyone in the space" is a service word
// for general access, as "invited" and "link" are, so the schema doesn't
// list it (Q24). Account deletion may now add the space's Owner or an Admin
// to a board as its Owner, and nothing more.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1822);

describe("a board's space", () => {
  test("G-05, M-01: a board names no space, or a real one", async () => {
    const b = await seedBoard(db.client, ids);
    const space = await addSpace(db.client, ids, b.ana);

    expect((await db.client.query("select space_id from board where id = $1", [b.board])).rows[0].space_id).toBeNull();
    await expect(db.client.query("update board set space_id = 'no-such-space' where id = $1", [b.board])).rejects.toThrow(/foreign key/);
    await db.client.query("update board set space_id = $2, general_access = 'space' where id = $1", [b.board, space]);
    expect((await db.client.query("select space_id, general_access from board where id = $1", [b.board])).rows[0]).toEqual({ space_id: space, general_access: "space" });
  });

  test("G-05, M-01: the service may put a board in a space and take it out", async () => {
    const b = await seedBoard(db.client, ids);
    const space = await addSpace(db.client, ids, b.ana);

    await asRole(db.client, "steelman_app", async () => {
      await db.client.query("update board set space_id = $2 where id = $1", [b.board, space]);
      await db.client.query("update board set space_id = null where id = $1", [b.board]);
    });
  });

  test("M-07, M-01: account deletion may add someone to a board and change how they joined, and still can't change a board's space", async () => {
    const b = await seedBoard(db.client, ids);
    const space = await addSpace(db.client, ids, b.ana);
    const olu = await addAccount(db.client, ids, "olu");
    const ben = b.ben;

    await asRole(db.client, "steelman_account_deletion", async () => {
      await db.client.query("begin");
      await db.client.query("insert into board_member (board_id, account_id, role, joined_via, joined_at) values ($1, $2, 'owner', 'invite', $3)", [b.board, olu, NOON]);
      await db.client.query("update board_member set role = 'owner', joined_via = 'invite' where board_id = $1 and account_id = $2", [b.board, ben]);
      await db.client.query("commit");
    });
    await asRole(db.client, "steelman_account_deletion", async () => {
      await expect(db.client.query("update board set space_id = $2 where id = $1", [b.board, space])).rejects.toThrow(/permission denied/);
    });
    await asRole(db.client, "steelman_account_deletion", async () => {
      await expect(db.client.query("update board_member set joined_at = $3 where board_id = $1 and account_id = $2", [b.board, ben, NOON])).rejects.toThrow(/permission denied/);
    });
  });

  test("G-05, M-01: the migration applies as an upgrade of a database that already holds spaces and boards, and puts no board in a space", async () => {
    const upgrade = await createTestDatabase("board_spaces_upgrade");
    try {
      const before = migrationNames().filter((name) => name < "0017");
      await migrate(upgrade.url, { to: before.at(-1)! });
      const board = await seedBoard(upgrade.client, ids);
      const space = await addSpace(upgrade.client, ids, board.ana);
      const boardBefore = (await upgrade.client.query("select * from board where id = $1", [board.board])).rows[0];

      const { applied } = await migrate(upgrade.url, { to: "0017_board_spaces" });

      expect(applied).toEqual(["0017_board_spaces"]);
      expect((await upgrade.client.query("select * from board where id = $1", [board.board])).rows[0]).toEqual({ ...boardBefore, space_id: null });
      expect((await upgrade.client.query("select count(*)::int as n from space where id = $1", [space])).rows[0].n).toBe(1);
    } finally {
      await upgrade.drop();
    }
  });
});
