import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Comments and the account (M3b-8, D-01, M-07): deleting an account erases
// its comments' text and author and keeps each row, as a deleted wording's
// is (architecture §2, the deletion table); a board deleted with its owner
// keeps no comment text; and Download your data lists the person's comments.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3803);

let b: SeededBoard;
let cara: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  cara = await addAccount(db.client, ids, "cara", { confirmed: true });
  await addMember(db.client, b.board, cara, "viewer");
});

const usernameOf = async (account: string): Promise<string> => (await db.client.query("select username from account where id = $1", [account])).rows[0].username;
const deleteAccount = async (account: string) => api.post("/api/account/delete", { as: account, body: { username: await usernameOf(account) } });
const comment = async (as: string, body: string, target: { versionId?: string; optionId?: string } = {}) => {
  const id = ids.itemId();
  expect((await api.post(`/api/boards/${b.board}/comments`, { as, body: { id, body, ...target } })).status).toBe(200);
  return id;
};
const row = async (id: string) => (await db.client.query("select body, author_id, deleted_at from comment where id = $1", [id])).rows[0];

describe("deleting an account", () => {
  test("D-01, M-07: the person's comments lose their text and author and stay as deleted rows; other people's are untouched", async () => {
    const mine = [await comment(cara, "Which survey?", { versionId: b.version }), await comment(cara, "And the question?")];
    const anas = await comment(b.ana, "The 2025 one.", { versionId: b.version });

    expect((await deleteAccount(cara)).status).toBe(200);

    for (const id of mine) {
      const kept = await row(id);
      expect(kept.body).toBeNull();
      expect(kept.author_id).toBe("deleted_account");
      expect(kept.deleted_at).toBeInstanceOf(Date);
    }
    expect(await row(anas)).toMatchObject({ body: "The 2025 one.", author_id: b.ana, deleted_at: null });
  });

  test("D-01, M-07: afterwards their ID is nowhere but their own account row, with comments on the board", async () => {
    await comment(cara, "Which survey?", { optionId: b.yes });

    await deleteAccount(cara);

    const columns = await db.client.query(
      `select table_schema, table_name, column_name from information_schema.columns
       where table_schema in ('public', 'sign_in') and data_type in ('text', 'jsonb')`,
    );
    const found: string[] = [];
    for (const { table_schema, table_name, column_name } of columns.rows) {
      const hits = await db.client.query(`select count(*)::int as n from "${table_schema}"."${table_name}" where "${column_name}"::text like $1`, [`%${cara}%`]);
      if (hits.rows[0].n > 0) found.push(`${table_schema}.${table_name}.${column_name}`);
    }
    expect(found).toEqual(["public.account.id"]);
  });

  test("D-01, M-07: a board deleted with its owner keeps no comment text, anyone's", async () => {
    // Nobody can take the board: its other members are a voter and a viewer.
    await db.client.query("update board_member set role = 'voter' where board_id = $1 and account_id = $2", [b.board, b.ben]);
    const id = await comment(cara, "Which survey?");
    await comment(b.ana, "The 2025 one.");

    await deleteAccount(b.ana);

    expect((await db.client.query("select deleted_at is not null as deleted from board where id = $1", [b.board])).rows[0].deleted).toBe(true);
    expect((await db.client.query("select count(*)::int as n from comment where board_id = $1 and body is not null", [b.board])).rows[0].n).toBe(0);
    expect((await row(id)).body).toBeNull();
    expect((await db.client.query("select count(*)::int as n from comment where board_id = $1 and deleted_at is null", [b.board])).rows[0].n).toBe(0);
  });
});

describe("Download your data", () => {
  test("D-01, M-07: the export lists the person's comments under comments, with their target and text, and nobody else's", async () => {
    const onWording = await comment(cara, "Which survey?", { versionId: b.version });
    const onQuestion = await comment(cara, "Is this the main branch?");
    const deleted = await comment(cara, "Never mind.");
    await api.delete(`/api/boards/${b.board}/comments/${deleted}`, { as: cara });
    await comment(b.ana, "The 2025 one.", { versionId: b.version });

    const { body } = await api.get("/api/account/data", { as: cara });

    expect(body.comments).toHaveLength(2);
    expect(body.comments).toEqual(
      expect.arrayContaining([
        { board: b.board, comment: onWording, version: b.version, option: null, body: "Which survey?", at: expect.any(String) },
        { board: b.board, comment: onQuestion, version: null, option: null, body: "Is this the main branch?", at: expect.any(String) },
      ]),
    );
    expect(JSON.stringify(body)).not.toContain("The 2025 one.");
  });
});
