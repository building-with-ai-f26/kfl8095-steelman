import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Download your data and Delete account (M-07, M1-12; plans/architecture.md
// §2 "Account deletion and anonymization" and §7 "Export and deletion").
//
// One test per row of the deletion table. The builder's decisions, Nov 15:
// a board its owner leaves passes to its longest-standing editor (M2), else
// contributor; with neither (only voters, or nobody), it is deleted with the
// account. (A community
// admin would take it first once communities exist.) The username is held
// for 30 days. Analytics are anonymous, so PostHog isn't asked to delete
// anything yet.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(1201);
const DELETED = "deleted_account";

let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const usernameOf = async (account: string): Promise<string> => (await db.client.query("select username from account where id = $1", [account])).rows[0].username;
const deleteAccount = async (account: string, typed?: string) => api.post("/api/account/delete", { as: account, body: { username: typed ?? (await usernameOf(account)) } });
const boardSeq = async (board: string) => Number((await db.client.query("select last_seq from board where id = $1", [board])).rows[0].last_seq);
const roleOn = async (board: string, account: string) => (await db.client.query("select role from board_member where board_id = $1 and account_id = $2", [board, account])).rows[0]?.role;

/** A confirmed account that wrote a wording on the board, cited a source, and voted on and assessed Ana's. */
async function contributor(name = "cara"): Promise<{ id: string; version: string; source: string }> {
  const id = await addAccount(db.client, ids, name, { confirmed: true });
  await addMember(db.client, b.board, id, "contributor");
  const argument = ids.itemId();
  const version = ids.itemId();
  expect(
    (await api.post(`/api/boards/${b.board}/arguments`, { as: id, body: { id: argument, optionId: b.no, versionId: version, wording: `${name}'s own argument.`, context: `${name}'s context.` } }))
      .status,
  ).toBe(200);
  const source = ids.itemId();
  const added = await api.post(`/api/boards/${b.board}/versions/${version}/sources`, {
    as: id,
    body: { id: source, name: `${name}'s source`, locator: "https://example.test/report", finding: `${name}'s finding.`, backsUp: "", limits: "" },
  });
  expect(added.status).toBe(200);
  expect((await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: id, body: { value: 1 } })).status).toBe(200);
  expect((await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: id, body: { value: -1 } })).status).toBe(200);
  expect((await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: id, body: { rev: 1, supported: true } })).status).toBe(200);
  return { id, version, source };
}

describe("Download your data", () => {
  test("M-07: holds the account, its ways of signing in, every vote and assessment, and everything they wrote", async () => {
    const cara = await contributor();
    await db.client.query("insert into sign_in.sign_in_method (id, account_id, provider, provider_subject, created_at, updated_at) values ($1, $2, 'google', 'g-1', $3, $3)", [
      ids.itemId(),
      cara.id,
      NOON,
    ]);

    const { status, body } = await api.get("/api/account/data", { as: cara.id });

    expect(status).toBe(200);
    expect(body.exported).toBe(NOON.replace("Z", ".000Z"));
    expect(body.account).toEqual({ username: await usernameOf(cara.id), email: `${await usernameOf(cara.id)}@example.test`, signIn: ["Email code", "Google"], joined: NOON.replace("Z", ".000Z") });
    expect(body.votes.importance).toEqual([{ board: b.board, argument: b.argument, value: 1, at: expect.any(String) }]);
    expect(body.votes.articulation).toEqual([{ board: b.board, version: b.version, value: -1, at: expect.any(String) }]);
    expect(body.votes.evidence).toEqual([{ board: b.board, version: b.version, rev: 1, supported: true, at: expect.any(String) }]);
    expect(body.boards).toEqual([
      {
        board: b.board,
        link: `/b/${b.board}`,
        role: "contributor",
        wrote: [{ argument: expect.any(String), version: cara.version, rev: 1, wording: "cara's own argument.", context: "cara's context.", at: expect.any(String) }],
        sources: [{ source: cara.source, name: "cara's source", link: "https://example.test/report", finding: "cara's finding.", backsUp: "", limits: "", at: expect.any(String) }],
      },
    ]);
  });

  test("M-07: holds nothing of anyone else: not their wordings, sources, names, or the question someone else asked", async () => {
    const cara = await contributor();
    const text = JSON.stringify((await api.get("/api/account/data", { as: cara.id })).body);

    for (const other of ["Sunday is the only free day", "Staff need a guaranteed day off.", "City library survey", "Should our library open on Sundays?", "Yes", await usernameOf(b.ana)]) {
      expect(text).not.toContain(other);
    }
  });

  test("M-07: the owner's export holds the question they asked and the options they named", async () => {
    const { body } = await api.get("/api/account/data", { as: b.ana });

    expect(body.boards[0]).toMatchObject({ board: b.board, role: "owner", asked: { question: "Should our library open on Sundays?", options: ["Yes", "No"] } });
    expect(body.boards[0].wrote.map((w: { wording: string }) => w.wording)).toEqual(["Sunday is the only free day for many people.", "Staff need a guaranteed day off."]);
  });

  test("M-07: is a download named steelman-data.json, and only for someone signed in", async () => {
    const response = await api.app.inject({ method: "GET", url: "/api/account/data", headers: { "x-steelman-test-user": b.ben } });
    expect(response.headers["content-disposition"]).toBe('attachment; filename="steelman-data.json"');

    expect((await api.get("/api/account/data")).status).toBe(401);
  });
});

describe("Your account", () => {
  test("M-07: says who you are and how you sign in", async () => {
    const cara = await contributor();
    expect((await api.get("/api/account", { as: cara.id })).body).toEqual({ username: await usernameOf(cara.id), email: `${await usernameOf(cara.id)}@example.test`, signIn: ["Email code"] });
    expect((await api.get("/api/account")).status).toBe(401);
  });
});

describe("Delete account: the deletion table", () => {
  test("M-07: refused unless they type their username; nothing changes", async () => {
    const cara = await contributor();
    const before = await boardSeq(b.board);

    const refused = await deleteAccount(cara.id, "someone-else");

    expect(refused).toMatchObject({ status: 400, body: { reason: "wrong_username" } });
    expect(await boardSeq(b.board)).toBe(before);
    expect((await db.client.query("select deleted_at from account where id = $1", [cara.id])).rows[0].deleted_at).toBeNull();
  });

  test("M-07: the username can be typed in any capitals", async () => {
    const cara = await contributor();
    expect((await deleteAccount(cara.id, (await usernameOf(cara.id)).toUpperCase())).status).toBe(200);
  });

  test("M-07 row 1: email, sign-in methods, sessions, and codes waiting for their address are erased; they are signed out", async () => {
    const cara = await contributor();
    const email = `${await usernameOf(cara.id)}@example.test`;
    await db.client.query("insert into sign_in.sign_in_method (id, account_id, provider, provider_subject, created_at, updated_at) values ($1, $2, 'google', 'g-2', $3, $3)", [
      ids.itemId(),
      cara.id,
      NOON,
    ]);
    await db.client.query("insert into sign_in.session (id, account_id, token, expires_at, created_at, updated_at) values ($1, $2, 'token-1', $3, $3, $3)", [ids.itemId(), cara.id, NOON]);
    await db.client.query("insert into sign_in.sign_in_code (id, identifier, value, expires_at, created_at, updated_at) values ($1, $2, 'x', $3, $3, $3)", [
      ids.itemId(),
      `sign-in-otp-${email}`,
      NOON,
    ]);
    // Someone else's address that ends the same way keeps its code.
    await db.client.query("insert into sign_in.sign_in_code (id, identifier, value, expires_at, created_at, updated_at) values ($1, $2, 'x', $3, $3, $3)", [
      ids.itemId(),
      `sign-in-otp-h${email}`,
      NOON,
    ]);

    expect((await deleteAccount(cara.id)).body).toEqual({ status: "done" });

    const account = (await db.client.query("select email, email_verified, deleted_at from account where id = $1", [cara.id])).rows[0];
    expect(account).toEqual({ email: null, email_verified: false, deleted_at: new Date(NOON) });
    for (const table of ["sign_in.session", "sign_in.sign_in_method"]) {
      expect((await db.client.query(`select count(*)::int as n from ${table} where account_id = $1`, [cara.id])).rows[0].n).toBe(0);
    }
    expect((await db.client.query("select identifier from sign_in.sign_in_code where identifier like $1", [`%${email}`])).rows).toEqual([{ identifier: `sign-in-otp-h${email}` }]);
    expect((await api.get("/api/account", { as: cara.id })).status).toBe(401);
  });

  test("M-07 row 2: votes and assessments are deleted, the counts change, and open boards are told (rows stamped)", async () => {
    const cara = await contributor();
    const counts = async () =>
      (
        await db.client.query("select a.importance, a.importance_voters, v.articulation, v.articulation_voters, v.yes from argument a join version v on v.argument_id = a.id where v.id = $1", [
          b.version,
        ])
      ).rows[0];
    expect(await counts()).toEqual({ importance: 1, importance_voters: 1, articulation: -1, articulation_voters: 1, yes: 1 });
    const before = await boardSeq(b.board);

    await deleteAccount(cara.id);

    expect(await counts()).toEqual({ importance: 0, importance_voters: 0, articulation: 0, articulation_voters: 0, yes: 0 });
    for (const table of ["importance_vote", "articulation_vote", "assessment"]) {
      expect((await db.client.query(`select count(*)::int as n from ${table} where account_id = $1`, [cara.id])).rows[0].n).toBe(0);
    }
    const seq = await boardSeq(b.board);
    expect(seq).toBe(before + 1);
    const changes = await api.get(`/api/boards/${b.board}/changes?after=${before}`, { as: b.ben });
    expect(changes.body.arguments.find((a: { id: string }) => a.id === b.argument)).toMatchObject({ importance: 0, importanceVoters: 0 });
    expect(changes.body.versions.find((v: { id: string }) => v.id === b.version)).toMatchObject({ articulation: 0, yes: 0 });
  });

  test("M-07 row 3: arguments, wordings, revisions, and sources stay, credited to deleted_account", async () => {
    const cara = await contributor();

    await deleteAccount(cara.id);

    const snapshot = (await api.get(`/api/boards/${b.board}`, { as: b.ben })).body;
    expect(snapshot.versions.find((v: { id: string }) => v.id === cara.version)).toMatchObject({ authorId: DELETED, authorName: DELETED, wording: "cara's own argument.", context: "cara's context." });
    expect(snapshot.sources.find((s: { id: string }) => s.id === cara.source)).toMatchObject({ name: "cara's source", finding: "cara's finding." });
    const credited = await db.client.query(
      `select (select created_by from argument where id = (select argument_id from version where id = $1)) as argument,
              (select created_by from version_revision where version_id = $1 and rev = 1) as revision,
              (select added_by from source where id = $2) as source`,
      [cara.version, cara.source],
    );
    expect(credited.rows[0]).toEqual({ argument: DELETED, revision: DELETED, source: DELETED });
  });

  test("M-07 row 4: the change log keeps what they did, by deleted_account, with their ID scrubbed from it", async () => {
    const cara = await contributor();
    await db.client.query("begin");
    const seq = (await db.client.query("select take_change_number($1) as seq", [b.board])).rows[0].seq;
    await db.client.query("insert into change (board_id, seq, at, actor_id, kind, subject_kind, subject_id, before, after) values ($1, $2, $3, $4, 'version_moved', 'version', $5, $6, $7)", [
      b.board,
      seq,
      NOON,
      cara.id,
      cara.version,
      JSON.stringify({ member: cara.id, role: "voter" }),
      JSON.stringify({ member: cara.id, role: "contributor" }),
    ]);
    await db.client.query("commit");

    await deleteAccount(cara.id);

    const log = await db.client.query("select actor_id, subject_id, before, after from change where board_id = $1 and seq = $2", [b.board, seq]);
    expect(log.rows[0]).toEqual({ actor_id: DELETED, subject_id: cara.version, before: { member: DELETED, role: "voter" }, after: { member: DELETED, role: "contributor" } });
  });

  test("M-07 row 5: the username is held for 30 days, then released", async () => {
    const cara = await contributor();
    const name = await usernameOf(cara.id);

    await deleteAccount(cara.id);
    expect(await usernameOf(cara.id)).toBe(name);
    await expect(db.client.query("insert into account (id, username, created_at) values ($1, $2, $3)", [ids.itemId(), name, NOON])).rejects.toThrow(/duplicate key/);

    const { releaseHeldUsernames } = await import("../../src/account.ts");
    const database = (await import("../../src/db/database.ts")).createDatabase(db.url);
    try {
      // Other tests in this file deleted accounts at the same time, so count only this one.
      await releaseHeldUsernames(database, { now: () => new Date(Date.parse(NOON) + 29 * 86_400_000) });
      expect(await usernameOf(cara.id)).toBe(name);
      expect(await releaseHeldUsernames(database, { now: () => new Date(Date.parse(NOON) + 30 * 86_400_000) })).toBeGreaterThan(0);
    } finally {
      await database.destroy();
    }
    expect(await usernameOf(cara.id)).toBeNull();
    expect(await usernameOf(DELETED)).toBe(DELETED);
  });

  test("M-07 row 6, Q11: a board they own passes to its longest-standing contributor, not an earlier voter", async () => {
    const voter = await addAccount(db.client, ids, "vic", { confirmed: true });
    const later = await addAccount(db.client, ids, "lou", { confirmed: true });
    await db.client.query(
      "insert into board_member (board_id, account_id, role, joined_via, joined_at) values ($1, $2, 'voter', 'link', '2026-11-01T00:00:00Z'), ($1, $3, 'contributor', 'link', '2026-11-20T00:00:00Z')",
      [b.board, voter, later],
    );
    // Ben joined at NOON on the 16th: before Lou, after Vic.

    await deleteAccount(b.ana);

    expect(await roleOn(b.board, b.ben)).toBe("owner");
    expect(await roleOn(b.board, later)).toBe("contributor");
    expect(await roleOn(b.board, voter)).toBe("voter");
    expect(await roleOn(b.board, b.ana)).toBeUndefined();
    expect((await db.client.query("select created_by, deleted_at from board where id = $1", [b.board])).rows[0]).toEqual({ created_by: DELETED, deleted_at: null });
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ben })).body).toMatchObject({ role: "owner", board: { question: "Should our library open on Sundays?" } });
  });

  test("M-07 row 6, Q11: a board whose only other members are voters is deleted with the account: its text erased, its link gone", async () => {
    await db.client.query("update board_member set role = 'voter' where board_id = $1 and account_id = $2", [b.board, b.ben]);

    await deleteAccount(b.ana);

    expect((await api.get(`/api/boards/${b.board}`, { as: b.ben })).status).toBe(404);
    const left = await db.client.query(
      `select (select question from board where id = $1) as question,
              (select deleted_at is not null from board where id = $1) as deleted,
              (select array_agg(name order by position) from option where board_id = $1) as options,
              (select count(*)::int from version_revision where board_id = $1 and (wording is not null or context is not null)) as wordings,
              (select count(*)::int from source where board_id = $1 and (name <> '' or locator <> '' or finding <> '' or backs_up <> '' or limits <> '')) as sources,
              (select count(*)::int from board_member where board_id = $1) as members`,
      [b.board],
    );
    expect(left.rows[0]).toEqual({ question: "", deleted: true, options: ["", ""], wordings: 0, sources: 0, members: 0 });
  });

  test("M-07 row 6, Q11: a board nobody else can open is deleted with the account", async () => {
    await db.client.query("delete from board_member where board_id = $1 and account_id = $2", [b.board, b.ben]);

    await deleteAccount(b.ana);

    expect((await db.client.query("select deleted_at is not null as deleted from board where id = $1", [b.board])).rows[0].deleted).toBe(true);
  });

  test("M-07: on a board they don't own, their membership ends and the board is untouched", async () => {
    await deleteAccount(b.ben);

    expect(await roleOn(b.board, b.ben)).toBeUndefined();
    expect(await roleOn(b.board, b.ana)).toBe("owner");
    expect((await db.client.query("select deleted_at from board where id = $1", [b.board])).rows[0].deleted_at).toBeNull();
  });

  test.each([
    ["a contributor", "contributor"],
    ["an owner whose board passes on", "handed over"],
    ["an owner whose board is deleted", "board deleted"],
  ] as const)("M-07: afterwards nothing links two of %s's contributions: their ID is nowhere but their own account row", async (_who, scenario) => {
    const cara = await contributor();
    let person = cara.id;
    if (scenario !== "contributor") {
      person = b.ana;
      if (scenario === "board deleted") await db.client.query("update board_member set role = 'voter' where board_id = $1 and account_id <> $2", [b.board, b.ana]);
    }
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

  test("M-07: only someone signed in can delete an account (always their own: the request names no account)", async () => {
    expect((await api.post("/api/account/delete", { body: { username: "ana" } })).status).toBe(401);
  });
});
