import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, addAccount, seedBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember, spaceChanges, spaceMembers } from "../support/space.ts";

// Spaces on the service (G-03, G-04, M3d-17; plans/architecture.md §2 and §7).
// Any signed-in account makes a space and becomes its one Owner (the builder,
// Nov 24). An Admin or the Owner renames it, edits its about text and canvas,
// invites a classmate by username, removes a member, and switches a role
// between Admin and Member. Only the Owner changes its visibility, and only
// "private" is accepted until M3d-20. No one demotes or removes the Owner, and
// the Owner can't leave. Only members learn that a space exists: every read
// and write by anyone else answers 404, as an unknown space does.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1718 });
const ids = createSeededIds(1719);
const HOUR = 3_600_000;
const DELETED = "deleted_account";
const NOT_FOUND = { status: 404, body: { reason: "not_found" } };
const OWNER_KEEPS_ROLE = { status: "refused", reason: "owner_keeps_role" };

const usernameOf = async (account: string): Promise<string> => (await db.client.query("select username from account where id = $1", [account])).rows[0].username;

const create = (as: string | null, body: object) => api.post("/api/spaces", { ...(as === null ? {} : { as }), body });
const read = (space: string, as: string | null) => api.get(`/api/spaces/${space}`, as === null ? {} : { as });
const people = (space: string, as: string | null) => api.get(`/api/spaces/${space}/people`, as === null ? {} : { as });
const mine = async (as: string) => (await api.get("/api/spaces", { as })).body.spaces as { id: string; name: string; role: string }[];
const settings = (space: string, as: string | null, body: object) => api.put(`/api/spaces/${space}`, { ...(as === null ? {} : { as }), body });
const visibility = (space: string, as: string | null, value: unknown) => api.put(`/api/spaces/${space}/visibility`, { ...(as === null ? {} : { as }), body: { visibility: value } });
const invite = (space: string, as: string | null, username: string, role: string) => api.post(`/api/spaces/${space}/invites`, { ...(as === null ? {} : { as }), body: { username, role } });
const setRole = (space: string, as: string | null, account: string, role: string) => api.put(`/api/spaces/${space}/people/${account}`, { ...(as === null ? {} : { as }), body: { role } });
const remove = (space: string, as: string | null, account: string) => api.delete(`/api/spaces/${space}/people/${account}`, as === null ? {} : { as });
const deleteAccount = async (account: string) => api.post("/api/account/delete", { as: account, body: { username: await usernameOf(account) } });
const roleIn = async (space: string, account: string) => (await db.client.query("select role from space_member where space_id = $1 and account_id = $2", [space, account])).rows[0]?.role;

/** Olu owns Pod 6; Ada is its Admin and Mel a Member; Sam has an account and isn't in it. */
let olu: string, ada: string, mel: string, sam: string, space: string;
beforeEach(async () => {
  olu = await addAccount(db.client, ids, "olu", { confirmed: true });
  ada = await addAccount(db.client, ids, "ada", { confirmed: true });
  mel = await addAccount(db.client, ids, "mel", { confirmed: true });
  sam = await addAccount(db.client, ids, "sam", { confirmed: true });
  space = await addSpace(db.client, ids, olu);
  await addSpaceMember(db.client, space, ada, "admin");
  await addSpaceMember(db.client, space, mel, "member");
});

describe("making a space", () => {
  test("G-03: any signed-in account makes a space and becomes its one Owner; it starts private, on the stone canvas", async () => {
    const id = ids.itemId();
    const at = api.clock.now();

    const made = await create(sam, { id, name: "  Debate   club ", about: "" });

    expect(made).toEqual({ status: 200, body: { status: "done" } });
    expect((await read(id, sam)).body).toEqual({ id, name: "Debate club", about: "", canvas: "stone", visibility: "private", role: "owner", members: 1 });
    expect(await spaceMembers(db.client, id)).toEqual([{ account_id: sam, role: "owner" }]);
    expect((await mine(sam)).map((each) => each.id)).toEqual([id]);
    expect((await db.client.query("select created_by, created_at from space where id = $1", [id])).rows[0]).toEqual({ created_by: sam, created_at: at });
  });

  test("G-03: the maker may choose its about text, its canvas, and private", async () => {
    const id = ids.itemId();

    expect((await create(sam, { id, name: "Pod 7", about: "Fall 2026", canvas: "sage", visibility: "private" })).status).toBe(200);

    expect((await read(id, sam)).body).toMatchObject({ name: "Pod 7", about: "Fall 2026", canvas: "sage", visibility: "private" });
  });

  test("G-03: someone signed out can't make a space", async () => {
    const id = ids.itemId();

    expect(await create(null, { id, name: "Pod 7" })).toEqual({ status: 401, body: { status: "refused", reason: "signed_out" } });
    expect((await db.client.query("select 1 from space where id = $1", [id])).rowCount).toBe(0);
  });

  test("G-03: a visibility other than private is refused, so no public space can be made yet", async () => {
    for (const value of ["public", "secret", null]) {
      const id = ids.itemId();
      expect((await create(sam, { id, name: "Pod 7", visibility: value })).status, String(value)).toBe(400);
      expect((await db.client.query("select 1 from space where id = $1", [id])).rowCount, String(value)).toBe(0);
    }
  });

  test("G-03: a name of 41 characters, an about text of 121, an empty name, or an unknown canvas is refused; 40 and 120 are allowed", async () => {
    for (const body of [{ name: "n".repeat(41) }, { name: "Pod", about: "a".repeat(121) }, { name: "   " }, { name: "Pod", canvas: "plaid" }]) {
      expect((await create(sam, { id: ids.itemId(), ...body })).body, JSON.stringify(body).slice(0, 40)).toMatchObject({ reason: "invalid" });
    }
    expect((await create(sam, { id: ids.itemId(), name: "n".repeat(40), about: "a".repeat(120) })).status).toBe(200);
  });

  test("G-03: sent twice, making a space makes one; someone else's ID is refused and still tells them nothing about it", async () => {
    const id = ids.itemId();
    expect((await create(sam, { id, name: "Pod 7" })).body).toEqual({ status: "done" });

    expect((await create(sam, { id, name: "Pod 7" })).body).toEqual({ status: "already_done" });
    expect((await db.client.query("select count(*)::int as n from space where created_by = $1", [sam])).rows[0].n).toBe(1);
    expect(await spaceChanges(db.client, id)).toBe(1);

    const taken = await create(mel, { id, name: "Pod 8" });
    expect(taken).toEqual({ status: 409, body: { status: "refused", reason: "id_taken" } });
    expect(await read(id, mel)).toEqual(NOT_FOUND);
    expect((await db.client.query("select name from space where id = $1", [id])).rows[0].name).toBe("Pod 7");
  });

  test("G-03, M-12: making spaces is limited as making boards is: the 21st in an hour is refused, and allowed after the window", async () => {
    const maker = await addAccount(db.client, ids, "maker", { confirmed: true });
    for (let n = 0; n < 20; n++) expect((await create(maker, { id: ids.itemId(), name: `Pod ${n}` })).status, String(n)).toBe(200);

    const over = await create(maker, { id: ids.itemId(), name: "Pod 21" });

    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ status: "refused", reason: "too_many" });
    api.clock.advance(HOUR);
    expect((await create(maker, { id: ids.itemId(), name: "Pod 21" })).status).toBe(200);
  });
});

describe("reading a space", () => {
  test("G-03, G-04: a member reads the space, with their role and how many members it has", async () => {
    expect((await read(space, olu)).body).toEqual({ id: space, name: "Pod 6", about: "Building with AI", canvas: "stone", visibility: "private", role: "owner", members: 3 });
    expect((await read(space, ada)).body).toMatchObject({ role: "admin", members: 3 });
    expect((await read(space, mel)).body).toMatchObject({ role: "member", members: 3 });
  });

  test("G-03, G-04: a non-member can't learn that a space exists: every read answers as an unknown, a deleted, or a malformed space does", async () => {
    const deleted = await addSpace(db.client, ids, sam);
    await db.client.query("update space set deleted_at = $2 where id = $1", [deleted, NOON]);

    for (const id of [space, ids.itemId(), deleted, "not-an-id", "a".repeat(21)]) {
      expect(await read(id, sam), id).toEqual(NOT_FOUND);
      expect(await people(id, sam), id).toEqual(NOT_FOUND);
    }
    // Sam owns the deleted space, and it isn't among Sam's spaces either.
    expect(await mine(sam)).toEqual([]);
  });

  test("G-03: someone signed out is told to sign in, whichever space they name", async () => {
    for (const id of [space, ids.itemId()]) {
      expect((await read(id, null)).status).toBe(401);
      expect((await people(id, null)).status).toBe(401);
    }
    expect((await api.get("/api/spaces")).status).toBe(401);
  });

  test("G-04: a member sees the members by username: the Owner first, then Admins, then Members, each by username, and never an email", async () => {
    const abe = await addAccount(db.client, ids, "abe", { confirmed: true });
    await addSpaceMember(db.client, space, abe, "member");
    const gone = await addAccount(db.client, ids, "gone", { confirmed: true });
    await addSpaceMember(db.client, space, gone, "member");
    await db.client.query("update account set deleted_at = $2 where id = $1", [gone, NOON]);

    const listed = await people(space, mel);

    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({
      people: [
        { id: olu, name: await usernameOf(olu), role: "owner" },
        { id: ada, name: await usernameOf(ada), role: "admin" },
        { id: abe, name: await usernameOf(abe), role: "member" },
        { id: mel, name: await usernameOf(mel), role: "member" },
      ],
    });
    expect(JSON.stringify(listed.body)).not.toContain("@example.test");
  });

  test("G-03: your spaces lists only the spaces you belong to, by name, with your role in each", async () => {
    const other = await addSpace(db.client, ids, sam, { name: "Another pod" });
    await addSpaceMember(db.client, other, mel, "admin");
    await addSpace(db.client, ids, sam, { name: "Sam's own" });

    expect(await mine(mel)).toEqual([
      { id: other, name: "Another pod", about: "Building with AI", canvas: "stone", visibility: "private", role: "admin", members: 2 },
      { id: space, name: "Pod 6", about: "Building with AI", canvas: "stone", visibility: "private", role: "member", members: 3 },
    ]);
  });
});

describe("a space's settings", () => {
  test("G-03: an Admin or the Owner renames the space and changes its about text and canvas; the change row holds no text", async () => {
    expect((await settings(space, ada, { name: "Pod Six", about: "Fall 2026 cohort", canvas: "lilac" })).body).toEqual({ status: "done" });
    expect((await read(space, mel)).body).toMatchObject({ name: "Pod Six", about: "Fall 2026 cohort", canvas: "lilac" });
    expect((await settings(space, olu, { name: "Pod 6", about: "", canvas: "stone" })).body).toEqual({ status: "done" });

    const rows = (await db.client.query("select actor_id, kind, before::text || after::text as detail from space_change where space_id = $1 order by id", [space])).rows;
    expect(rows.map((row) => [row.actor_id, row.kind])).toEqual([
      [ada, "space_edited"],
      [olu, "space_edited"],
    ]);
    for (const row of rows) for (const text of ["Pod Six", "Fall 2026", "Pod 6", "Building"]) expect(row.detail).not.toContain(text);
  });

  test("G-03: a Member can't change the settings, and a name of 41 characters or an about text of 121 is refused", async () => {
    expect(await settings(space, mel, { name: "Mine now", about: "", canvas: "stone" })).toEqual({ status: 403, body: { status: "refused", reason: "not_allowed" } });
    expect((await settings(space, ada, { name: "n".repeat(41), about: "", canvas: "stone" })).status).toBe(400);
    expect((await settings(space, ada, { name: "Pod", about: "a".repeat(121), canvas: "stone" })).status).toBe(400);
    expect((await read(space, mel)).body).toMatchObject({ name: "Pod 6", about: "Building with AI" });
    expect(await spaceChanges(db.client, space)).toBe(0);
  });

  test("G-03: only the Owner changes the visibility, and only private is accepted: an Admin can't, nor a Member", async () => {
    expect((await visibility(space, olu, "private")).body).toEqual({ status: "already_done" });
    expect(await visibility(space, ada, "private")).toEqual({ status: 403, body: { status: "refused", reason: "not_allowed" } });
    expect(await visibility(space, mel, "private")).toEqual({ status: 403, body: { status: "refused", reason: "not_allowed" } });
    expect((await visibility(space, olu, "public")).status).toBe(400);
    expect((await db.client.query("select visibility from space where id = $1", [space])).rows[0].visibility).toBe("private");
  });
});

describe("inviting by username", () => {
  test("G-04: an Admin or the Owner adds a classmate by username as Admin or Member, whatever capitals or leading @ they typed; they read the space at once", async () => {
    const lin = await addAccount(db.client, ids, "lin", { confirmed: true });
    const name = await usernameOf(lin);
    expect(await read(space, lin)).toEqual(NOT_FOUND);

    expect((await invite(space, ada, `@${name.toUpperCase()}`, "member")).body).toEqual({ status: "done" });
    expect((await read(space, lin)).body).toMatchObject({ role: "member", members: 4 });
    expect((await invite(space, olu, ` ${name} `, "admin")).body).toEqual({ status: "done" });
    expect(await roleIn(space, lin)).toBe("admin");
    expect((await mine(lin)).map((each) => each.id)).toEqual([space]);
  });

  test("G-04: an unknown or deleted username isn't found, and inviting the Owner is refused because the owner keeps that role", async () => {
    const gone = await addAccount(db.client, ids, "gone", { confirmed: true });
    await db.client.query("update account set deleted_at = $2 where id = $1", [gone, NOON]);

    expect(await invite(space, ada, "nobody_here", "member")).toEqual(NOT_FOUND);
    expect(await invite(space, ada, await usernameOf(gone), "member")).toEqual(NOT_FOUND);
    for (const role of ["admin", "member"]) {
      expect(await invite(space, ada, await usernameOf(olu), role)).toEqual({ status: 409, body: OWNER_KEEPS_ROLE });
    }
    expect(await roleIn(space, olu)).toBe("owner");
    expect((await invite(space, ada, await usernameOf(olu), "owner")).status).toBe(400);
  });

  test("G-04: a Member can't invite, and is told so before any username is looked up; a non-member is told the space isn't there", async () => {
    expect(await invite(space, mel, await usernameOf(sam), "member")).toEqual({ status: 403, body: { status: "refused", reason: "not_allowed" } });
    expect(await invite(space, mel, "nobody_here", "member")).toEqual({ status: 403, body: { status: "refused", reason: "not_allowed" } });
    expect(await invite(space, sam, await usernameOf(mel), "admin")).toEqual(NOT_FOUND);
    expect(await roleIn(space, sam)).toBeUndefined();
    expect(await roleIn(space, mel)).toBe("member");
  });

  test("G-04: inviting a member at the role they have is already done; at the other role, their role changes", async () => {
    expect((await invite(space, ada, await usernameOf(mel), "member")).body).toEqual({ status: "already_done" });
    expect((await invite(space, ada, await usernameOf(mel), "admin")).body).toEqual({ status: "done" });
    expect(await roleIn(space, mel)).toBe("admin");
  });

  test("G-04, M-12: invites use the board invites' limit: 20 an hour across boards and spaces, counted even when refused", async () => {
    // Ana owns a board and is an Admin of the space, so she can invite to both.
    const board = await seedBoard(db.client, ids);
    const host = board.ana;
    await addSpaceMember(db.client, space, host, "admin");
    for (let n = 0; n < 5; n++) expect((await api.post(`/api/boards/${board.board}/invites`, { as: host, body: { username: `nobody_${n}`, role: "voter" } })).status).toBe(404);
    for (let n = 0; n < 5; n++) expect((await invite(space, host, `nobody_${n}`, "member")).status).toBe(404);
    expect((await invite(space, host, await usernameOf(olu), "member")).status).toBe(409);
    expect((await invite(space, host, "nobody", "owner")).status).toBe(400);
    for (let n = 0; n < 8; n++) expect((await invite(space, host, await usernameOf(mel), n % 2 ? "admin" : "member")).status).toBe(200);

    const over = await invite(space, host, await usernameOf(sam), "member");

    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ status: "refused", reason: "too_many" });
    expect(await roleIn(space, sam)).toBeUndefined();
    api.clock.advance(HOUR);
    expect((await invite(space, host, await usernameOf(sam), "member")).body).toEqual({ status: "done" });
  });
});

describe("roles", () => {
  test("G-04: an Admin or the Owner switches a role between Admin and Member", async () => {
    expect((await setRole(space, ada, mel, "admin")).body).toEqual({ status: "done" });
    expect((await read(space, mel)).body.role).toBe("admin");
    expect((await setRole(space, olu, mel, "member")).body).toEqual({ status: "done" });
    expect((await setRole(space, mel, ada, "member")).status).toBe(403);
    expect((await setRole(space, ada, ada, "member")).body).toEqual({ status: "done" });
    expect(await roleIn(space, ada)).toBe("member");
    const rows = (await db.client.query("select kind, before, after from space_change where space_id = $1 order by id", [space])).rows;
    expect(rows[0]).toEqual({ kind: "role_changed", before: { account: mel, role: "member" }, after: { account: mel, role: "admin" } });
  });

  test("G-04: an Admin demotes another Admin to Member, and promotes them back", async () => {
    const abe = await addAccount(db.client, ids, "abe", { confirmed: true });
    await addSpaceMember(db.client, space, abe, "admin");

    expect((await setRole(space, ada, abe, "member")).body).toEqual({ status: "done" });
    expect(await roleIn(space, abe)).toBe("member");
    expect((await setRole(space, ada, abe, "admin")).body).toEqual({ status: "done" });
    expect(await roleIn(space, abe)).toBe("admin");
  });

  test("G-04: no one demotes the Owner, the Owner included: the owner keeps that role", async () => {
    for (const as of [ada, olu]) {
      for (const role of ["admin", "member"]) expect(await setRole(space, as, olu, role), `${as} ${role}`).toEqual({ status: 409, body: OWNER_KEEPS_ROLE });
    }
    expect((await setRole(space, olu, olu, "owner")).status).toBe(400);
    expect((await setRole(space, olu, ada, "owner")).status).toBe(400);
    expect(await roleIn(space, olu)).toBe("owner");
    expect(await spaceChanges(db.client, space)).toBe(0);
  });

  test("G-04: a role for someone not in the space isn't found; the role they already have is already done", async () => {
    expect(await setRole(space, ada, sam, "member")).toEqual(NOT_FOUND);
    expect(await setRole(space, ada, ids.itemId(), "member")).toEqual(NOT_FOUND);
    expect((await setRole(space, ada, mel, "member")).body).toEqual({ status: "already_done" });
  });
});

describe("removing and leaving", () => {
  test("G-04: an Admin removes a member, who loses the space at once: it answers as if it never existed", async () => {
    expect((await remove(space, ada, mel)).body).toEqual({ status: "done" });

    expect(await read(space, mel)).toEqual(NOT_FOUND);
    expect(await people(space, mel)).toEqual(NOT_FOUND);
    expect(await mine(mel)).toEqual([]);
    expect(await settings(space, mel, { name: "Back", about: "", canvas: "stone" })).toEqual(NOT_FOUND);
    expect((await read(space, olu)).body.members).toBe(2);
    expect((await db.client.query("select kind, after from space_change where space_id = $1", [space])).rows).toEqual([{ kind: "member_removed", after: { account: mel } }]);
  });

  test("G-04: an Admin or the Owner removes an Admin; a Member removes no one", async () => {
    const abe = await addAccount(db.client, ids, "abe", { confirmed: true });
    await addSpaceMember(db.client, space, abe, "admin");
    expect(await remove(space, mel, abe)).toEqual({ status: 403, body: { status: "refused", reason: "not_allowed" } });
    expect((await remove(space, ada, abe)).body).toEqual({ status: "done" });
    expect((await remove(space, olu, ada)).body).toEqual({ status: "done" });
    expect(await roleIn(space, ada)).toBeUndefined();
  });

  test("G-04: no one removes the Owner, and the Owner can't leave: the owner keeps that role", async () => {
    expect(await remove(space, ada, olu)).toEqual({ status: 409, body: OWNER_KEEPS_ROLE });
    expect(await remove(space, olu, olu)).toEqual({ status: 409, body: OWNER_KEEPS_ROLE });
    expect(await remove(space, mel, olu)).toEqual({ status: 403, body: { status: "refused", reason: "not_allowed" } });
    expect(await roleIn(space, olu)).toBe("owner");
  });

  test("G-04: a Member or an Admin leaves by removing themself", async () => {
    expect((await remove(space, mel, mel)).body).toEqual({ status: "done" });
    expect((await remove(space, ada, ada)).body).toEqual({ status: "done" });

    expect(await read(space, mel)).toEqual(NOT_FOUND);
    expect(await read(space, ada)).toEqual(NOT_FOUND);
    expect((await db.client.query("select actor_id, kind, after from space_change where space_id = $1 order by id", [space])).rows).toEqual([
      { actor_id: mel, kind: "member_left", after: { account: mel } },
      { actor_id: ada, kind: "member_left", after: { account: ada } },
    ]);
  });

  test("G-04: removing someone not in the space is already done; an unknown account isn't found", async () => {
    expect((await remove(space, ada, sam)).body).toEqual({ status: "already_done" });
    expect(await remove(space, ada, ids.itemId())).toEqual(NOT_FOUND);
  });
});

describe("each write sent twice changes nothing the second time", () => {
  test("G-03, G-04: settings, invites, roles, removing, and leaving each answer already done the second time and change nothing", async () => {
    const lin = await addAccount(db.client, ids, "lin", { confirmed: true });
    const writes: [string, () => Promise<{ body: unknown }>][] = [
      ["settings", () => settings(space, ada, { name: "Pod Six", about: "", canvas: "cool" })],
      ["invite", async () => invite(space, ada, await usernameOf(lin), "member")],
      ["role", () => setRole(space, olu, lin, "admin")],
      ["remove", () => remove(space, ada, lin)],
      ["leave", () => remove(space, mel, mel)],
      ["visibility", () => visibility(space, olu, "private")],
    ];
    for (const [name, write] of writes) {
      await write();
      const before = { members: await spaceMembers(db.client, space), changes: await spaceChanges(db.client, space), space: (await db.client.query("select * from space where id = $1", [space])).rows };

      // Someone who has left is no longer a member, so the space answers them as it answers anyone outside it.
      expect((await write()).body, name).toEqual(name === "leave" ? { reason: "not_found" } : { status: "already_done" });

      expect({ members: await spaceMembers(db.client, space), changes: await spaceChanges(db.client, space), space: (await db.client.query("select * from space where id = $1", [space])).rows }, name).toEqual(before);
    }
  });
});

describe("when the Owner deletes their account", () => {
  const later = (hours: number) => new Date(new Date(NOON).getTime() + hours * HOUR).toISOString();

  test("G-04, M-07: the longest-standing Admin becomes Owner, ahead of an older Member and a newer Admin", async () => {
    const abe = await addAccount(db.client, ids, "abe", { confirmed: true });
    const old = await addAccount(db.client, ids, "old", { confirmed: true });
    const pod = await addSpace(db.client, ids, olu, { name: "Pod 9" });
    await addSpaceMember(db.client, pod, old, "member", later(1));
    await addSpaceMember(db.client, pod, ada, "admin", later(3));
    await addSpaceMember(db.client, pod, abe, "admin", later(2));

    expect((await deleteAccount(olu)).status).toBe(200);

    expect(await spaceMembers(db.client, pod)).toEqual(
      [
        { account_id: abe, role: "owner" },
        { account_id: ada, role: "admin" },
        { account_id: old, role: "member" },
      ].sort((x, y) => (x.account_id < y.account_id ? -1 : 1)),
    );
    expect((await read(pod, abe)).body).toMatchObject({ name: "Pod 9", role: "owner", members: 3 });
    expect((await db.client.query("select created_by from space where id = $1", [pod])).rows[0].created_by).toBe(DELETED);
  });

  test("G-04, M-07: a space with only Members passes to the longest-standing Member", async () => {
    const abe = await addAccount(db.client, ids, "abe", { confirmed: true });
    const pod = await addSpace(db.client, ids, olu, { name: "Pod 10" });
    await addSpaceMember(db.client, pod, mel, "member", later(2));
    await addSpaceMember(db.client, pod, abe, "member", later(1));

    await deleteAccount(olu);

    expect(await roleIn(pod, abe)).toBe("owner");
    expect(await roleIn(pod, mel)).toBe("member");
    expect(await roleIn(pod, olu)).toBeUndefined();
  });

  test("G-03, M-07: a space with no one else is deleted with the account: its name and about text are erased and it answers as if it never existed", async () => {
    const alone = await addSpace(db.client, ids, sam, { name: "Sam's pod", about: "Only Sam" });

    await deleteAccount(sam);

    const row = (await db.client.query("select name, about, created_by, deleted_at from space where id = $1", [alone])).rows[0];
    expect(row).toMatchObject({ name: "", about: "", created_by: DELETED });
    expect(row.deleted_at).not.toBeNull();
    expect(await spaceMembers(db.client, alone)).toEqual([]);
    expect(await read(alone, mel)).toEqual(NOT_FOUND);
  });

  test("G-04, M-07: a Member or an Admin who deletes their account leaves each space, which stays with its Owner", async () => {
    await deleteAccount(mel);
    await deleteAccount(ada);

    expect(await spaceMembers(db.client, space)).toEqual([{ account_id: olu, role: "owner" }]);
    expect((await read(space, olu)).body).toMatchObject({ name: "Pod 6", members: 1 });
  });

  test.each([
    ["a member", "member"],
    ["an owner whose space passes on", "handed over"],
    ["an owner whose space is deleted", "space deleted"],
  ] as const)("G-03, G-04, M-07: afterwards %s's ID is nowhere but their own account row, though they changed the space", async (_who, scenario) => {
    const person = scenario === "member" ? mel : olu;
    if (scenario === "space deleted") {
      await remove(space, ada, mel);
      await remove(space, ada, ada);
    }
    await settings(space, person === olu ? olu : ada, { name: "Pod Six", about: "", canvas: "cool" });
    if (person === mel) await remove(space, mel, mel);
    else await setRole(space, olu, mel, "admin").catch(() => undefined);

    await deleteAccount(person);

    const columns = await db.client.query(
      `select table_schema, table_name, column_name from information_schema.columns
       where table_schema in ('public', 'sign_in') and data_type in ('text', 'jsonb')`,
    );
    const found: string[] = [];
    for (const { table_schema, table_name, column_name } of columns.rows) {
      const hits = await db.client.query(`select count(*)::int as n from "${table_schema}"."${table_name}" where "${column_name}"::text like $1`, [`%${person}%`]);
      if (hits.rows[0].n > 0) found.push(`${table_schema}.${table_name}.${column_name}`);
    }
    expect(found).toEqual(["public.account.id"]);
  });
});

describe("Download your data", () => {
  test("G-03, G-04, M-07: the export holds your memberships, with the name and about text only of the spaces you made, and nothing of the other members", async () => {
    const own = await addSpace(db.client, ids, mel, { name: "Mel's pod", about: "Made by Mel" });

    const data = (await api.get("/api/account/data", { as: mel })).body;

    expect(data.spaces).toEqual([
      { space: own, role: "owner", joined: new Date(NOON).toISOString(), name: "Mel's pod", about: "Made by Mel" },
      { space, role: "member", joined: new Date(NOON).toISOString() },
    ].sort((x, y) => (x.space < y.space ? -1 : 1)));
    const text = JSON.stringify(data);
    for (const other of [olu, ada]) expect(text).not.toContain(other);
    for (const other of [await usernameOf(olu), await usernameOf(ada), "Pod 6", "Building with AI"]) expect(text).not.toContain(other);
  });

  test("G-03, M-07: a space you left, or one that was deleted, isn't in your export", async () => {
    await remove(space, mel, mel);
    const gone = await addSpace(db.client, ids, mel, { name: "Gone pod", about: "Deleted" });
    await db.client.query("update space set deleted_at = $2 where id = $1", [gone, NOON]);

    expect((await api.get("/api/account/data", { as: mel })).body.spaces).toEqual([]);
  });
});
