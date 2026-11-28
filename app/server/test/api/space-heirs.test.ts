import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// Who takes a deleted person's spaces and boards (M-07, G-04, M3d-33;
// plans/architecture.md §2's deletion table; finding F2 of the public-spaces
// security review). A space passes to its longest-standing Admin, else to its
// longest-standing Member who was invited; someone who joined by themselves
// never inherits it, and a space with no such heir is deleted. A board in a
// space passes to the space's Owner or an Admin who held that role before the
// deletion, so a Member whom the same deletion makes Owner never takes the
// deleted person's boards. Without such an heir, the board passes to its own
// longest-standing editor, else contributor, and it is deleted when there is
// no one.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1932 });
const ids = createSeededIds(1933);
const NOT_FOUND = { status: 404, body: { reason: "not_found" } };
const NO_ACCESS = { status: 403, body: { status: "refused", reason: "no_access" } };

const usernameOf = async (account: string): Promise<string> => (await db.client.query("select username from account where id = $1", [account])).rows[0].username;
const deleteAccount = async (account: string) => api.post("/api/account/delete", { as: account, body: { username: await usernameOf(account) } });
const roleIn = async (space: string, account: string) => (await db.client.query("select role from space_member where space_id = $1 and account_id = $2", [space, account])).rows[0]?.role;
const viaIn = async (space: string, account: string) => (await db.client.query("select joined_via from space_member where space_id = $1 and account_id = $2", [space, account])).rows[0]?.joined_via;
const ownerOf = async (board: string) => (await db.client.query("select account_id from board_member where board_id = $1 and role = 'owner'", [board])).rows.map((r) => r.account_id);
const boardRole = async (board: string, account: string) => (await db.client.query("select role from board_member where board_id = $1 and account_id = $2", [board, account])).rows[0]?.role;
const mySpaces = async (as: string) => ((await api.get("/api/spaces", { as })).body.spaces as { id: string }[]).map((s) => s.id);
const at = (minute: number) => `2026-11-16T12:${String(minute).padStart(2, "0")}:00Z`;

/** Someone who joined a space by themselves (M3d-20's Join), at `joinedAt`. */
async function addJoiner(space: string, account: string, joinedAt: string): Promise<void> {
  await db.client.query("insert into space_member (space_id, account_id, role, joined_via, joined_at) values ($1, $2, 'member', 'join', $3)", [space, account, joinedAt]);
}

/** Ana owns a space and an invited-only board in it, with Eve as the board's Editor and Ben as its Contributor. */
async function anasSpace() {
  const b = await seedBoard(db.client, ids);
  const space = await addSpace(db.client, ids, b.ana);
  const eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  expect((await api.put(`/api/boards/${b.board}/space`, { as: b.ana, body: { space } })).status).toBe(200);
  return { b, space, eve };
}

describe("when a space's Owner deletes their account", () => {
  test("M-07, G-04: an invited Member who becomes the space's Owner doesn't take the deleted Owner's invited-only board in it, and its Editor does", async () => {
    const { b, space, eve } = await anasSpace();
    const sam = await addAccount(db.client, ids, "sam", { confirmed: true });
    await addSpaceMember(db.client, space, sam, "member", at(1));

    expect((await deleteAccount(b.ana)).status).toBe(200);

    expect(await roleIn(space, sam)).toBe("owner");
    expect(await ownerOf(b.board)).toEqual([eve]);
    expect(await boardRole(b.board, sam)).toBeUndefined();
    expect(await api.get(`/api/boards/${b.board}`, { as: sam })).toEqual(NO_ACCESS);
    expect((await api.get(`/api/boards/${b.board}`, { as: eve })).body.role).toBe("owner");
  });

  test("M-07, G-04: an Admin who was there before takes the space and the board, as before", async () => {
    const { b, space, eve } = await anasSpace();
    const sam = await addAccount(db.client, ids, "sam", { confirmed: true });
    const ada = await addAccount(db.client, ids, "ada", { confirmed: true });
    await addSpaceMember(db.client, space, sam, "member", at(1));
    await addSpaceMember(db.client, space, ada, "admin", at(2));

    expect((await deleteAccount(b.ana)).status).toBe(200);

    expect(await roleIn(space, ada)).toBe("owner");
    expect(await ownerOf(b.board)).toEqual([ada]);
    expect(await boardRole(b.board, eve)).toBe("editor");
  });

  test("M-07, G-04: a Member who joined by themselves never inherits the space or a board, even when they joined first", async () => {
    const { b, space, eve } = await anasSpace();
    const jo = await addAccount(db.client, ids, "jo", { confirmed: true });
    const sam = await addAccount(db.client, ids, "sam", { confirmed: true });
    await addJoiner(space, jo, at(1));
    await addSpaceMember(db.client, space, sam, "member", at(2));

    expect((await deleteAccount(b.ana)).status).toBe(200);

    expect(await roleIn(space, jo)).toBe("member");
    expect(await roleIn(space, sam)).toBe("owner");
    expect(await ownerOf(b.board)).toEqual([eve]);
    expect(await boardRole(b.board, jo)).toBeUndefined();
  });

  test("M-07, G-04: a space whose only other members joined by themselves is deleted with the account and leaves their lists at once", async () => {
    const { b, space } = await anasSpace();
    const jo = await addAccount(db.client, ids, "jo", { confirmed: true });
    const kim = await addAccount(db.client, ids, "kim", { confirmed: true });
    await addJoiner(space, jo, at(1));
    await addJoiner(space, kim, at(2));
    expect(await mySpaces(jo)).toEqual([space]);

    expect((await deleteAccount(b.ana)).status).toBe(200);

    const row = (await db.client.query("select name, about, deleted_at from space where id = $1", [space])).rows[0];
    expect(row).toMatchObject({ name: "", about: "" });
    expect(row.deleted_at).not.toBeNull();
    expect(await mySpaces(jo)).toEqual([]);
    expect(await mySpaces(kim)).toEqual([]);
    expect(await api.get(`/api/spaces/${space}`, { as: jo })).toEqual(NOT_FOUND);
    expect(await roleIn(space, jo)).not.toBe("owner");
    expect(await roleIn(space, kim)).not.toBe("owner");
  });

  test("M-07, G-04: invited Members still inherit a space in the order they joined", async () => {
    const owner = await addAccount(db.client, ids, "olu", { confirmed: true });
    const space = await addSpace(db.client, ids, owner);
    const jo = await addAccount(db.client, ids, "jo", { confirmed: true });
    const mel = await addAccount(db.client, ids, "mel", { confirmed: true });
    const abe = await addAccount(db.client, ids, "abe", { confirmed: true });
    await addJoiner(space, jo, at(1));
    await addSpaceMember(db.client, space, mel, "member", at(3));
    await addSpaceMember(db.client, space, abe, "member", at(2));

    expect((await deleteAccount(owner)).status).toBe(200);

    expect(await roleIn(space, abe)).toBe("owner");
    expect(await roleIn(space, mel)).toBe("member");
    expect(await roleIn(space, jo)).toBe("member");
  });

  test("M-07, G-04: an Admin who joined by themselves still inherits the space ahead of an invited Member", async () => {
    const owner = await addAccount(db.client, ids, "olu", { confirmed: true });
    const space = await addSpace(db.client, ids, owner);
    const ada = await addAccount(db.client, ids, "ada", { confirmed: true });
    const mel = await addAccount(db.client, ids, "mel", { confirmed: true });
    await db.client.query("insert into space_member (space_id, account_id, role, joined_via, joined_at) values ($1, $2, 'admin', 'join', $3)", [space, ada, at(2)]);
    await addSpaceMember(db.client, space, mel, "member", at(1));

    expect((await deleteAccount(owner)).status).toBe(200);

    expect(await roleIn(space, ada)).toBe("owner");
    expect(await roleIn(space, mel)).toBe("member");
  });

  test("M-07, G-04: a board in a space its Owner has left still passes to that space's Owner", async () => {
    const b = await seedBoard(db.client, ids);
    const olu = await addAccount(db.client, ids, "olu", { confirmed: true });
    const space = await addSpace(db.client, ids, olu);
    await addSpaceMember(db.client, space, b.ana, "member", at(1));
    expect((await api.put(`/api/boards/${b.board}/space`, { as: b.ana, body: { space } })).status).toBe(200);
    expect((await api.delete(`/api/spaces/${space}/people/${b.ana}`, { as: b.ana })).status).toBe(200);

    expect((await deleteAccount(b.ana)).status).toBe(200);

    expect(await ownerOf(b.board)).toEqual([olu]);
  });
});

describe("how someone came into a space", () => {
  test("M-07, G-04: making a space and inviting someone to it both record that they were added by name", async () => {
    const sam = await addAccount(db.client, ids, "sam", { confirmed: true });
    const mel = await addAccount(db.client, ids, "mel", { confirmed: true });
    const space = ids.itemId();
    expect((await api.post("/api/spaces", { as: sam, body: { id: space, name: "Debate club", about: "" } })).body).toEqual({ status: "done" });
    expect((await api.post(`/api/spaces/${space}/invites`, { as: sam, body: { username: await usernameOf(mel), role: "member" } })).body).toEqual({ status: "done" });

    expect(await viaIn(space, sam)).toBe("invite");
    expect(await viaIn(space, mel)).toBe("invite");
  });

  test("M-07, G-04: Download your data says when someone joined a space by themselves, and otherwise keeps its shape", async () => {
    const owner = await addAccount(db.client, ids, "olu", { confirmed: true });
    const joined = await addSpace(db.client, ids, owner, { name: "Open pod" });
    const invited = await addSpace(db.client, ids, owner, { name: "Closed pod" });
    const jo = await addAccount(db.client, ids, "jo", { confirmed: true });
    await addJoiner(joined, jo, at(1));
    await addSpaceMember(db.client, invited, jo, "member", at(2));

    const { body } = await api.get("/api/account/data", { as: jo });

    expect(body.spaces).toEqual([
      { space: joined, role: "member", joined: "2026-11-16T12:01:00.000Z", joinedVia: "join" },
      { space: invited, role: "member", joined: "2026-11-16T12:02:00.000Z" },
    ]);
  });
});
