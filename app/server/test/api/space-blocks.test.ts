import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { blockedFrom } from "../../src/spaces.ts";
import { addAccount } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember, spaceChanges, spaceMembers } from "../support/space.ts";

// Removal from a space sticks (G-04, G-07, M3d-35; plans/architecture.md §2,
// the space_block table; finding F3 of the public-spaces security review).
// When an Admin or the Owner removes someone, the service keeps a block, so
// M3d-20's Join and Find spaces can keep them out (blockedFrom). Leaving keeps
// no block. An invite from an Admin or the Owner lifts it, and its change row
// says so with no text. Download your data lists the spaces that removed the
// person, with when, and never who removed them. Deleting an account deletes
// its blocks, and a block someone wrote is credited to the stand-in when they
// delete their account. This copies how Slack and Discord remove someone so
// they can't come back by themselves, and GitHub's organization block.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1936 });
const ids = createSeededIds(1937);
const DELETED = "deleted_account";
const NOT_FOUND = { status: 404, body: { reason: "not_found" } };

let service: Db;
beforeAll(() => {
  service = createDatabase(db.url);
});
afterAll(async () => {
  await service.destroy();
});

const usernameOf = async (account: string): Promise<string> => (await db.client.query("select username from account where id = $1", [account])).rows[0].username;
const read = (space: string, as: string) => api.get(`/api/spaces/${space}`, { as });
const people = (space: string, as: string) => api.get(`/api/spaces/${space}/people`, { as });
const settings = (space: string, as: string, body: object) => api.put(`/api/spaces/${space}`, { as, body });
const invite = async (space: string, as: string, account: string, role: string) => api.post(`/api/spaces/${space}/invites`, { as, body: { username: await usernameOf(account), role } });
const remove = (space: string, as: string, account: string) => api.delete(`/api/spaces/${space}/people/${account}`, { as });
const deleteAccount = async (account: string) => api.post("/api/account/delete", { as: account, body: { username: await usernameOf(account) } });
const blocks = async (space: string) => (await db.client.query("select account_id, blocked_by, at from space_block where space_id = $1 order by account_id", [space])).rows;
const allBlocks = async () => (await db.client.query("select count(*)::int as n from space_block")).rows[0].n;
const changes = async (space: string) => (await db.client.query("select actor_id, kind, after from space_change where space_id = $1 order by id", [space])).rows;

/** Every text column in the database that holds `id`, as spaces.test.ts scans after a deletion. */
async function whereIs(id: string): Promise<string[]> {
  const columns = await db.client.query(
    `select table_schema, table_name, column_name from information_schema.columns
     where table_schema in ('public', 'sign_in') and data_type in ('text', 'jsonb')`,
  );
  const found: string[] = [];
  for (const { table_schema, table_name, column_name } of columns.rows) {
    const hits = await db.client.query(`select count(*)::int as n from "${table_schema}"."${table_name}" where "${column_name}"::text like $1`, [`%${id}%`]);
    if (hits.rows[0].n > 0) found.push(`${table_schema}.${table_name}.${column_name}`);
  }
  return found;
}

/** Olu owns Pod 6; Ada is its Admin and Mel a Member. */
let olu: string, ada: string, mel: string, space: string;
beforeEach(async () => {
  olu = await addAccount(db.client, ids, "olu", { confirmed: true });
  ada = await addAccount(db.client, ids, "ada", { confirmed: true });
  mel = await addAccount(db.client, ids, "mel", { confirmed: true });
  space = await addSpace(db.client, ids, olu);
  await addSpaceMember(db.client, space, ada, "admin");
  await addSpaceMember(db.client, space, mel, "member");
});

describe("removing someone keeps them out", () => {
  test("G-04, G-07: an Admin's removal writes a block with the remover and the time, and the change row stays as it was", async () => {
    api.clock.advance(60_000);
    const at = api.clock.now();

    expect((await remove(space, ada, mel)).body).toEqual({ status: "done" });

    expect(await blocks(space)).toEqual([{ account_id: mel, blocked_by: ada, at }]);
    expect(await blockedFrom(service, space, mel)).toBe(true);
    expect(await changes(space)).toEqual([{ actor_id: ada, kind: "member_removed", after: { account: mel } }]);
  });

  test("G-04, G-07: the Owner's removal of an Admin writes a block too", async () => {
    expect((await remove(space, olu, ada)).body).toEqual({ status: "done" });

    expect((await blocks(space)).map((row) => [row.account_id, row.blocked_by])).toEqual([[ada, olu]]);
    expect(await blockedFrom(service, space, ada)).toBe(true);
  });

  test("G-04, G-07: leaving writes no block, so someone who left isn't blocked", async () => {
    expect((await remove(space, mel, mel)).body).toEqual({ status: "done" });
    expect((await remove(space, ada, ada)).body).toEqual({ status: "done" });

    expect(await blocks(space)).toEqual([]);
    expect(await blockedFrom(service, space, mel)).toBe(false);
    expect(await blockedFrom(service, space, ada)).toBe(false);
  });

  test("G-04, G-07: a refused removal, or one of someone not in the space, writes no block", async () => {
    const sam = await addAccount(db.client, ids, "sam", { confirmed: true });

    expect((await remove(space, ada, sam)).body).toEqual({ status: "already_done" });
    expect((await remove(space, mel, ada)).status).toBe(403);
    expect((await remove(space, ada, olu)).status).toBe(409);

    expect(await blocks(space)).toEqual([]);
    expect(await blockedFrom(service, space, sam)).toBe(false);
  });

  test("G-04, G-07: a block is for one space only, and blockedFrom answers false for anyone never removed", async () => {
    const other = await addSpace(db.client, ids, ada, { name: "Pod 7" });
    await addSpaceMember(db.client, other, mel, "member");

    await remove(space, ada, mel);

    expect(await blockedFrom(service, space, mel)).toBe(true);
    expect(await blockedFrom(service, other, mel)).toBe(false);
    expect(await blockedFrom(service, space, olu)).toBe(false);
    expect((await read(other, mel)).status).toBe(200);
  });

  test("G-04: a removed person still gets 404 for the space, as anyone outside it does", async () => {
    await remove(space, ada, mel);

    expect(await read(space, mel)).toEqual(NOT_FOUND);
    expect(await people(space, mel)).toEqual(NOT_FOUND);
    expect(await settings(space, mel, { name: "Back", about: "", canvas: "stone" })).toEqual(NOT_FOUND);
    expect(await remove(space, mel, mel)).toEqual(NOT_FOUND);
    expect(await invite(space, mel, mel, "member")).toEqual(NOT_FOUND);
  });
});

describe("an invite lifts the block", () => {
  test("G-04, G-07: an Admin's invite lifts the block, and its change row says so with no text", async () => {
    await remove(space, ada, mel);

    expect((await invite(space, ada, mel, "member")).body).toEqual({ status: "done" });

    expect(await blocks(space)).toEqual([]);
    expect(await blockedFrom(service, space, mel)).toBe(false);
    expect((await read(space, mel)).body).toMatchObject({ role: "member" });
    expect((await changes(space)).at(-1)).toEqual({ actor_id: ada, kind: "member_added", after: { account: mel, role: "member", unblocked: true } });
  });

  test("G-04, G-07: the Owner's invite as Admin lifts it too; an invite of someone never removed records no lift", async () => {
    const sam = await addAccount(db.client, ids, "sam", { confirmed: true });
    await remove(space, olu, ada);

    expect((await invite(space, olu, ada, "admin")).body).toEqual({ status: "done" });
    expect((await invite(space, olu, sam, "member")).body).toEqual({ status: "done" });

    expect(await blockedFrom(service, space, ada)).toBe(false);
    expect((await changes(space)).slice(-2)).toEqual([
      { actor_id: olu, kind: "member_added", after: { account: ada, role: "admin", unblocked: true } },
      { actor_id: olu, kind: "member_added", after: { account: sam, role: "member" } },
    ]);
  });
});

describe("Download your data", () => {
  test("G-04, G-07, M-07: the export lists the spaces that removed you, with when, and never who removed you", async () => {
    const left = await addSpace(db.client, ids, olu, { name: "Pod 8" });
    await addSpaceMember(db.client, left, mel, "member");
    const gone = await addSpace(db.client, ids, ada, { name: "Pod 9" });
    await addSpaceMember(db.client, gone, mel, "member");
    api.clock.advance(60_000);
    const at = api.clock.now();
    await remove(space, ada, mel);
    await remove(gone, ada, mel);
    await db.client.query("update space set deleted_at = $2 where id = $1", [gone, at]);
    await remove(left, mel, mel);

    const data = (await api.get("/api/account/data", { as: mel })).body;

    expect(data.removedFrom).toEqual([{ space, at: at.toISOString() }]);
    const text = JSON.stringify(data);
    for (const other of [olu, ada, await usernameOf(olu), await usernameOf(ada), "Pod 6"]) expect(text).not.toContain(other);
  });

  test("G-04, M-07: someone never removed has an empty list, and an invite back takes the space off it", async () => {
    expect((await api.get("/api/account/data", { as: mel })).body.removedFrom).toEqual([]);

    await remove(space, ada, mel);
    await invite(space, ada, mel, "member");

    expect((await api.get("/api/account/data", { as: mel })).body.removedFrom).toEqual([]);
  });

  test("G-04, M-07: the remover's export doesn't list the people they removed", async () => {
    await remove(space, ada, mel);

    const data = (await api.get("/api/account/data", { as: ada })).body;

    expect(data.removedFrom).toEqual([]);
    expect(JSON.stringify(data)).not.toContain(mel);
  });
});

describe("account deletion", () => {
  test("M-07, G-04: deleting a removed person's account deletes their blocks in every space, and their ID is nowhere but their own account row", async () => {
    const other = await addSpace(db.client, ids, ada, { name: "Pod 7" });
    await addSpaceMember(db.client, other, mel, "member");
    await remove(space, ada, mel);
    await remove(other, ada, mel);

    expect((await deleteAccount(mel)).status).toBe(200);

    expect(await blocks(space)).toEqual([]);
    expect(await blocks(other)).toEqual([]);
    expect(await whereIs(mel)).toEqual(["public.account.id"]);
  });

  test("M-07, G-04: a block written by someone who deletes their account is credited to the stand-in and still keeps the person out", async () => {
    const at = api.clock.now();
    await remove(space, ada, mel);

    expect((await deleteAccount(ada)).status).toBe(200);

    expect(await blocks(space)).toEqual([{ account_id: mel, blocked_by: DELETED, at }]);
    expect(await blockedFrom(service, space, mel)).toBe(true);
    expect(await whereIs(ada)).toEqual(["public.account.id"]);
  });

  test("M-07, G-04: a block in a space deleted with its Owner's account is credited to the stand-in, and the Owner's ID is nowhere else", async () => {
    await remove(space, olu, mel);
    await remove(space, olu, ada);

    expect((await deleteAccount(olu)).status).toBe(200);

    expect((await blocks(space)).map((row) => [row.account_id, row.blocked_by])).toEqual([[ada, DELETED], [mel, DELETED]].sort((x, y) => (x[0]! < y[0]! ? -1 : 1)));
    expect(await whereIs(olu)).toEqual(["public.account.id"]);
  });

  test("M-07, G-04: a removal at the same moment as the removed person's own deletion waits for it, and neither one fails", async () => {
    // How many requests are waiting on a lock in this test's database.
    const waiting = async () =>
      Number((await sql<{ n: string }>`select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`.execute(service)).rows[0]!.n);
    const until = async (n: number) => {
      for (let tries = 0; (await waiting()) < n; tries++) {
        if (tries > 500) throw new Error(`${n} requests never waited on a lock`);
        await new Promise((resolve) => setImmediate(resolve));
      }
    };
    // The space is held, so the removal queues for it first, then the deletion, which locks Mel's account before it
    // reaches the space. Removing her must not then need her account while the deletion waits for the space.
    await db.client.query("begin");
    await db.client.query("select id from space where id = $1 for update", [space]);
    const removal = remove(space, ada, mel);
    await until(1);
    const deletion = deleteAccount(mel);
    await until(2);
    await db.client.query("rollback");

    const [removed, deleted] = await Promise.all([removal, deletion]);

    expect(removed.body).toEqual({ status: "done" });
    expect(deleted.status).toBe(200);
    expect(await blocks(space)).toEqual([]);
    expect(await whereIs(mel)).toEqual(["public.account.id"]);
  });
});

describe("each write sent twice changes nothing the second time", () => {
  test("G-04, G-07: a removal and the invite that lifts it each answer already done the second time and change nothing", async () => {
    const writes: [string, () => Promise<{ body: unknown }>][] = [
      ["remove", () => remove(space, ada, mel)],
      ["invite", () => invite(space, ada, mel, "member")],
    ];
    for (const [name, write] of writes) {
      expect((await write()).body, name).toEqual({ status: "done" });
      const before = { members: await spaceMembers(db.client, space), changes: await spaceChanges(db.client, space), blocks: await blocks(space), all: await allBlocks() };

      expect((await write()).body, name).toEqual({ status: "already_done" });

      expect({ members: await spaceMembers(db.client, space), changes: await spaceChanges(db.client, space), blocks: await blocks(space), all: await allBlocks() }, name).toEqual(before);
    }
  });
});
