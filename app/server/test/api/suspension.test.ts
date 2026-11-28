import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { exportData, releaseHeldUsernames } from "../../src/account.ts";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { parseOperatorArgs, runOperator } from "../../src/jobs/operator.ts";
import { addAccount } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";
import { ORIGIN, useSignIn } from "../support/sign-in.ts";
import { addSpace, addSpaceMember, spaceChanges, spaceMembers } from "../support/space.ts";

// The builder can suspend an account and make a space private (J-06, L-01,
// M3d-36; finding F8 of the public-spaces security review; plans/architecture.md
// §7 "Sign-in and sessions"). A suspended account is signed out everywhere and
// can't sign back in: its sessions end, every route treats a session it still
// holds as signed out, and a code or Google sign-in makes no session and says
// why. Asking for a code still sends one, so asking reveals nothing. What it
// wrote stays. `make-private` turns a public space private under its row lock,
// keeps its members, and credits the change to the `steelman` stand-in. Each
// command says one sentence and changes nothing when run twice.
//
// The operator runs as the job does (jobs/operator.ts), against the same
// database as the service under test. Sessions are real cookies: the
// test-user switch would skip the session check this item adds.

const db = useTestDatabase({ migrated: true });
const api = useSignIn(db, { google: true, seed: 3601 });
const ids = createSeededIds(3602);
const QUESTION = "Should our library open on Sundays?";
const SIGNED_OUT = { status: "refused", reason: "signed_out" };

let operatorDb: Db;
beforeAll(() => {
  operatorDb = createDatabase(db.url);
});
afterAll(async () => {
  await operatorDb.destroy();
});

/** Runs one operator command, as `node server/dist/operator-cli.mjs <args>` does. */
async function operate(...args: string[]) {
  const command = parseOperatorArgs(args);
  if ("error" in command) throw new Error(command.error);
  return runOperator(operatorDb, api.clock, command);
}

let n = 0;
/** A person who signs in by code, with a username, and a board they asked. */
async function signedInPerson() {
  n++;
  const email = `person${n}@school.example.edu`;
  const username = `person_${n}`;
  const cookie = await api.signedIn(email, username);
  const made = await api.request("POST", "/api/boards", { cookie, body: { question: QUESTION, options: ["Yes", "No"] } });
  expect(made.status).toBe(200);
  const id = (await db.client.query("select id from account where email = $1", [email])).rows[0].id as string;
  return { email, username, cookie, id, board: made.body.board as string };
}

const sessionsOf = async (account: string) => Number((await db.client.query("select count(*) from sign_in.session where account_id = $1", [account])).rows[0].count);
const suspendedAt = async (account: string) => (await db.client.query("select suspended_at from account where id = $1", [account])).rows[0].suspended_at as Date | null;
const boardRow = async (board: string) => (await db.client.query("select question, created_by from board where id = $1", [board])).rows[0];

describe("suspending an account", () => {
  test("J-06, L-01: after suspend, the person's existing session answers as a signed-out request does on every route, and what they wrote stays", async () => {
    const lin = await signedInPerson();
    const before = await boardRow(lin.board);
    expect((await api.request("GET", "/api/account", { cookie: lin.cookie })).status).toBe(200);

    const done = await operate("suspend", lin.username);
    expect(done).toEqual({ ok: true, sentence: `${lin.username} is now suspended, and Steelman signed them out of 1 session.` });
    expect(await suspendedAt(lin.id)).toEqual(api.clock.now());
    expect(await sessionsOf(lin.id)).toBe(0);

    expect((await api.request("GET", "/api/auth/get-session", { cookie: lin.cookie })).body).toBeNull();
    const routes: ["GET" | "POST" | "PUT" | "DELETE", string, object?][] = [
      ["GET", "/api/account"],
      ["GET", "/api/account/data"],
      ["GET", "/api/boards"],
      ["GET", "/api/spaces"],
      ["GET", `/api/boards/${lin.board}`],
      ["POST", "/api/boards", { question: QUESTION, options: ["Yes", "No"] }],
      ["PUT", "/api/account/username", { username: "someone_else" }],
    ];
    for (const [method, url, body] of routes) {
      const withCookie = await api.request(method, url, { cookie: lin.cookie, ...(body ? { body } : {}) });
      const signedOut = await api.request(method, url, body ? { body } : {});
      expect({ status: withCookie.status, body: withCookie.body }, `${method} ${url}`).toEqual({ status: signedOut.status, body: signedOut.body });
    }
    expect((await api.request("GET", "/api/account", { cookie: lin.cookie })).body).toEqual(SIGNED_OUT);
    expect(await boardRow(lin.board)).toEqual(before);
  });

  test("J-06, L-01: a session that outlives the suspension (one made while it ran) answers as signed out too, and the first request ends it", async () => {
    const tess = await signedInPerson();
    // As if this session were written just after suspend deleted the others.
    await db.client.query("update account set suspended_at = $1 where id = $2", [api.clock.now(), tess.id]);

    expect(await sessionsOf(tess.id)).toBe(1);
    const answer = await api.request("GET", "/api/account", { cookie: tess.cookie });
    expect({ status: answer.status, body: answer.body }).toEqual({ status: 401, body: SIGNED_OUT });
    expect(await sessionsOf(tess.id)).toBe(0);
    // So the web, which asks get-session who is signed in, shows them signed out rather than signed in with every request refused.
    expect((await api.request("GET", "/api/auth/get-session", { cookie: tess.cookie })).body).toBeNull();
    const write = await api.request("POST", "/api/boards", { cookie: tess.cookie, body: { question: QUESTION, options: ["Yes", "No"] } });
    expect(write.status).toBe(401);
  });

  test("J-06, L-01: when the web first asks who is signed in, a session that outlives the suspension answers signed out", async () => {
    const ravi = await signedInPerson();
    await db.client.query("update account set suspended_at = $1 where id = $2", [api.clock.now(), ravi.id]);

    expect((await api.request("GET", "/api/auth/get-session", { cookie: ravi.cookie })).body).toBeNull();
    expect(await sessionsOf(ravi.id)).toBe(0);
  });

  test("J-06: suspend run again on a suspended account ends a session that outlived the first run", async () => {
    const tess = await signedInPerson();
    await db.client.query("update account set suspended_at = $1 where id = $2", [api.clock.now(), tess.id]);
    expect(await sessionsOf(tess.id)).toBe(1);

    expect(await operate("suspend", tess.username)).toEqual({ ok: true, sentence: `${tess.username} is already suspended, and Steelman signed them out of 1 session.` });
    expect(await sessionsOf(tess.id)).toBe(0);
  });

  test("J-06, L-01: the test-user switch can't act as a suspended account either", async () => {
    const omar = await signedInPerson();
    await operate("suspend", omar.username);
    const response = await api.app.inject({ method: "GET", url: "/api/account", headers: { "x-steelman-test-user": omar.id } });
    expect(response.statusCode).toBe(401);
  });

  test("J-06, L-01: asking for a code still sends one, but signing in with it makes no session and says the account is suspended", async () => {
    const maya = await signedInPerson();
    const before = await boardRow(maya.board);
    await operate("suspend", maya.username);
    const sentBefore = api.outbox.length;

    const asked = await api.requestCode(maya.email);
    const askedForNobody = await api.requestCode("nobody-yet@school.example.edu");
    expect({ status: asked.status, body: asked.body }).toEqual({ status: askedForNobody.status, body: askedForNobody.body });
    expect(api.outbox.length).toBe(sentBefore + 2);

    // A wrong code says only that it's wrong, so a guesser learns nothing.
    const right = api.codeFor(maya.email);
    const wrong = await api.signIn(maya.email, String((Number(right) + 1) % 1_000_000).padStart(6, "0"));
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("INVALID_OTP");

    const refused = await api.signIn(maya.email, right);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("ACCOUNT_SUSPENDED");
    expect(refused.cookie).toBeUndefined();
    expect(await sessionsOf(maya.id)).toBe(0);
    expect(await boardRow(maya.board)).toEqual(before);
  });

  test("J-06, L-01: a Google sign-in for a suspended account makes no session and sends the browser back with the suspended reason", async () => {
    const googler = { sub: "109300000000000003601", email: "googler3601@school.example.edu", emailVerified: true, name: "Pat Example" };
    const first = await api.signInWithGoogle(googler);
    expect(first.cookie).toBeDefined();
    const named = await api.request("POST", "/api/auth/update-user", { cookie: first.cookie, body: { username: "pat_google" } });
    expect(named.status).toBe(200);
    const id = (await db.client.query("select id from account where email = $1", [googler.email])).rows[0].id as string;
    const methods = async () => (await db.client.query("select provider, provider_subject from sign_in.sign_in_method where account_id = $1", [id])).rows;
    const methodsBefore = await methods();
    const made = await api.request("POST", "/api/boards", { cookie: first.cookie, body: { question: QUESTION, options: ["Yes", "No"] } });
    expect(made.status).toBe(200);
    const board = made.body.board as string;
    const boardBefore = await boardRow(board);

    expect((await operate("suspend", "pat_google")).ok).toBe(true);
    const again = await api.signInWithGoogle(googler);

    expect(again.finished?.status).toBe(302);
    expect(again.finished?.location).toMatch(new RegExp(`^${ORIGIN}/.*[?&]error=ACCOUNT_SUSPENDED(&|$)`));
    expect(again.cookie).toBeUndefined();
    expect(await sessionsOf(id)).toBe(0);
    expect(await methods()).toEqual(methodsBefore);
    expect(await boardRow(board)).toEqual(boardBefore);
  });

  test("J-06, L-01: after unsuspend, they sign in again", async () => {
    const ben = await signedInPerson();
    await operate("suspend", ben.username);
    expect(await operate("unsuspend", ben.username)).toEqual({ ok: true, sentence: `${ben.username} is no longer suspended and can sign in again.` });
    expect(await suspendedAt(ben.id)).toBeNull();

    const cookie = await api.signedIn(ben.email);
    expect((await api.request("GET", "/api/account", { cookie })).status).toBe(200);
    expect(await boardRow(ben.board)).toMatchObject({ question: QUESTION, created_by: ben.id });
  });

  test("J-06: suspend and unsuspend change nothing when run twice, and capitals in the username don't count", async () => {
    const cara = await signedInPerson();
    await operate("suspend", cara.username.toUpperCase());
    const first = await suspendedAt(cara.id);
    api.clock.advance(60_000);

    expect(await operate("suspend", cara.username)).toEqual({ ok: true, sentence: `${cara.username} is already suspended.` });
    expect(await suspendedAt(cara.id)).toEqual(first);

    await operate("unsuspend", cara.username);
    expect(await operate("unsuspend", cara.username)).toEqual({ ok: true, sentence: `${cara.username} isn’t suspended.` });
  });

  test("J-06: an unknown or deleted username says so and fails", async () => {
    expect(await operate("suspend", "no_such_person")).toEqual({ ok: false, sentence: "No account has the username no_such_person." });
    expect(await operate("unsuspend", "no_such_person")).toEqual({ ok: false, sentence: "No account has the username no_such_person." });
    const gone = await addAccount(db.client, ids, "gone");
    const name = (await db.client.query("select username from account where id = $1", [gone])).rows[0].username as string;
    await db.client.query("update account set deleted_at = $1 where id = $2", [api.clock.now(), gone]);
    expect((await operate("suspend", name)).ok).toBe(false);
  });

  test("J-06, M-07: Download your data holds when the account was suspended, and null when it isn't", async () => {
    const dana = await signedInPerson();
    expect((await exportData(operatorDb, api.clock, dana.id))?.suspended).toBeNull();
    await operate("suspend", dana.username);
    expect((await exportData(operatorDb, api.clock, dana.id))?.suspended).toBe(api.clock.now().toISOString());
  });
});

describe("making a space private", () => {
  async function publicSpace() {
    const owner = await addAccount(db.client, ids, "owner");
    const admin = await addAccount(db.client, ids, "admin");
    const member = await addAccount(db.client, ids, "member");
    const space = await addSpace(db.client, ids, owner);
    await addSpaceMember(db.client, space, admin, "admin");
    await addSpaceMember(db.client, space, member, "member");
    // No route makes a space public until M3d-20, so the test does.
    await db.client.query("update space set visibility = 'public' where id = $1", [space]);
    return space;
  }
  const visibilityOf = async (space: string) => (await db.client.query("select visibility from space where id = $1", [space])).rows[0].visibility as string;

  test("J-06: make-private makes a public space private, keeps its members, and writes a change row with no text, credited to steelman", async () => {
    const space = await publicSpace();
    const members = await spaceMembers(db.client, space);
    const changes = await spaceChanges(db.client, space);

    expect(await operate("make-private", space)).toEqual({ ok: true, sentence: `Space ${space} is now private, and its members stay in it.` });

    expect(await visibilityOf(space)).toBe("private");
    expect(await spaceMembers(db.client, space)).toEqual(members);
    expect(await spaceChanges(db.client, space)).toBe(changes + 1);
    const row = (await db.client.query("select actor_id, kind, before, after, at from space_change where space_id = $1 order by at desc, id desc limit 1", [space])).rows[0];
    expect(row).toEqual({ actor_id: "steelman", kind: "visibility_changed", before: { visibility: "public" }, after: { visibility: "private" }, at: api.clock.now() });
    // The stand-in is made the first time, as deleted_account is: it can't sign in, and no one can find or invite it.
    expect((await db.client.query("select username, email, deleted_at is not null as gone from account where id = 'steelman'")).rows).toEqual([{ username: "steelman", email: null, gone: true }]);
  });

  test("J-06: make-private changes nothing when run twice, and the stand-in is made once", async () => {
    const space = await publicSpace();
    await operate("make-private", space);
    const changes = await spaceChanges(db.client, space);

    expect(await operate("make-private", space)).toEqual({ ok: true, sentence: `Space ${space} is already private.` });
    expect(await spaceChanges(db.client, space)).toBe(changes);

    await operate("make-private", await publicSpace());
    expect(Number((await db.client.query("select count(*) from account where id = 'steelman'")).rows[0].count)).toBe(1);
  });

  test("J-06: an unknown, malformed, or deleted space ID says so and fails", async () => {
    const unknown = ids.itemId();
    expect(await operate("make-private", unknown)).toEqual({ ok: false, sentence: `No space has the ID ${unknown}.` });
    expect(await operate("make-private", "not-an-id")).toEqual({ ok: false, sentence: "No space has the ID not-an-id." });
    const deleted = await publicSpace();
    await db.client.query("update space set deleted_at = $1 where id = $2", [api.clock.now(), deleted]);
    expect((await operate("make-private", deleted)).ok).toBe(false);
    expect(await visibilityOf(deleted)).toBe("public");
  });

  test("J-06, M-07: the daily clean-up never takes the steelman stand-in's username", async () => {
    await operate("make-private", await publicSpace());
    await releaseHeldUsernames(operatorDb, { now: () => new Date(api.clock.now().getTime() + 365 * 86_400_000) });
    expect((await db.client.query("select username from account where id = 'steelman'")).rows[0].username).toBe("steelman");
  });
});
