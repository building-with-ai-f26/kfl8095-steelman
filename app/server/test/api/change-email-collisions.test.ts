import { describe, expect, test } from "vitest";
import { FIRST, SECOND } from "../support/colliding-emails.ts";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";
import type { SignInApi } from "../support/sign-in.ts";
import type { TestDatabase } from "../support/database.ts";

// A code to change one account's email confirms only that change (L-04; build
// plan M3d-28, finding F25). Before Better Auth 1.7.16 (GHSA-2f9c-7xj7-gh55),
// the code key joined the current email and the new one with "-", so the
// account x@a.bb-c.com could use the code that x@a.bb asked for to change to
// c.com-v@target.com, and become v@target.com. Each direction runs against its
// own database, because the addresses are fixed and a username is chosen once.

const session = async (api: SignInApi, cookie: string) => (await api.request("GET", "/api/auth/get-session", { cookie })).body;
const askToChange = (api: SignInApi, cookie: string, newEmail: string) => api.request("POST", "/api/auth/email-otp/request-email-change", { cookie, body: { newEmail } });
const change = (api: SignInApi, cookie: string, newEmail: string, otp: string) => api.request("POST", "/api/auth/email-otp/change-email", { cookie, body: { newEmail, otp } });

/** Both accounts of the colliding pairs, signed in by code. */
async function bothSignedIn(api: SignInApi) {
  const first = await api.signedIn(FIRST.email, "first_x");
  const second = await api.signedIn(SECOND.email, "second_x");
  return { first, second };
}

/** The emails of both accounts, read from the database. */
async function emailsOf(db: TestDatabase) {
  const rows = await db.client.query<{ email: string | null; username: string | null }>("select email, username from account where username in ('first_x', 'second_x') order by username");
  return rows.rows.map((row) => row.email);
}

describe("a code asked for by the first account", () => {
  const db = useTestDatabase({ migrated: true });
  const api = useSignIn(db);

  test("L-04, L-01: a code sent to change x@a.bb to c.com-v@target.com never changes x@a.bb-c.com to v@target.com", async () => {
    const { first, second } = await bothSignedIn(api);
    expect((await askToChange(api, first, FIRST.wants)).status).toBe(200);
    const code = api.codeFor(FIRST.wants);

    const stolen = await change(api, second, SECOND.wants, code);
    expect(stolen.status).toBe(400);
    expect(stolen.body?.code).toBe("INVALID_OTP");

    expect((await session(api, second)).user.email).toBe(SECOND.email);
    expect((await session(api, first)).user.email).toBe(FIRST.email);
    expect(await emailsOf(db)).toEqual([FIRST.email, SECOND.email]);
    expect(api.outbox.filter((message) => message.kind === "changed")).toEqual([]);

    // The first account's own code still makes its own change.
    const own = await change(api, first, FIRST.wants, code);
    expect(own.status).toBe(200);
    expect((await session(api, own.cookie ?? first)).user.email).toBe(FIRST.wants);
    expect(await emailsOf(db)).toEqual([FIRST.wants, SECOND.email]);
  });
});

describe("a code asked for by the second account", () => {
  const db = useTestDatabase({ migrated: true });
  const api = useSignIn(db);

  test("L-04, L-01: a code sent to change x@a.bb-c.com to v@target.com never changes x@a.bb to c.com-v@target.com", async () => {
    const { first, second } = await bothSignedIn(api);
    expect((await askToChange(api, second, SECOND.wants)).status).toBe(200);
    const code = api.codeFor(SECOND.wants);

    const stolen = await change(api, first, FIRST.wants, code);
    expect(stolen.status).toBe(400);
    expect(stolen.body?.code).toBe("INVALID_OTP");

    expect((await session(api, first)).user.email).toBe(FIRST.email);
    expect((await session(api, second)).user.email).toBe(SECOND.email);
    expect(await emailsOf(db)).toEqual([FIRST.email, SECOND.email]);
    expect(api.outbox.filter((message) => message.kind === "changed")).toEqual([]);

    // The second account's own code still makes its own change.
    const own = await change(api, second, SECOND.wants, code);
    expect(own.status).toBe(200);
    expect((await session(api, own.cookie ?? second)).user.email).toBe(SECOND.wants);
    expect(await emailsOf(db)).toEqual([FIRST.email, SECOND.wants]);
  });
});

describe("deleting one account of the pair", () => {
  const db = useTestDatabase({ migrated: true });
  const api = useSignIn(db);

  test("L-04, M-07: deleting x@a.bb erases its own waiting code and leaves the code x@a.bb-c.com is waiting on", async () => {
    const { first, second } = await bothSignedIn(api);
    expect((await askToChange(api, first, FIRST.wants)).status).toBe(200);
    expect((await askToChange(api, second, SECOND.wants)).status).toBe(200);
    const secondCode = api.codeFor(SECOND.wants);
    const firstId: string = (await session(api, first)).user.id;
    const secondId: string = (await session(api, second)).user.id;

    // Better Auth 1.7.16 names a change-email code by the account's ID, then ":", then the new address.
    const codesOf = async (id: string) =>
      (await db.client.query<{ n: number }>("select count(*)::int as n from sign_in.sign_in_code where starts_with(identifier, $1)", [`change-email-otp-${id}:`])).rows[0]?.n;
    expect(await codesOf(firstId)).toBe(1);
    expect(await codesOf(secondId)).toBe(1);
    const waiting = await db.client.query<{ identifier: string }>("select identifier from sign_in.sign_in_code where starts_with(identifier, 'change-email-otp-') order by identifier");
    expect(waiting.rows.map((row) => row.identifier).sort()).toEqual([`change-email-otp-${firstId}:${FIRST.wants}`, `change-email-otp-${secondId}:${SECOND.wants}`].sort());

    expect((await api.request("POST", "/api/account/delete", { cookie: first, body: { username: "first_x" } })).status).toBe(200);
    expect(await codesOf(firstId)).toBe(0);
    expect(await codesOf(secondId)).toBe(1);
    const left = await db.client.query<{ identifier: string }>("select identifier from sign_in.sign_in_code where starts_with(identifier, 'change-email-otp-')");
    expect(left.rows.some((row) => row.identifier.includes(FIRST.wants))).toBe(false);

    // The second account's code survives the first account's deletion and still works.
    const own = await change(api, second, SECOND.wants, secondCode);
    expect(own.status).toBe(200);
    expect((await session(api, own.cookie ?? second)).user.email).toBe(SECOND.wants);
  });
});

describe("a change-email code stored before the upgrade", () => {
  const db = useTestDatabase({ migrated: true });
  const api = useSignIn(db);

  test("M2-8c, L-04, M-07: deleting the account erases a change-email code stored in the pre-1.7.16 form", async () => {
    const first = await api.signedIn(FIRST.email, "first_x");
    // Before 1.7.16, Better Auth named the code by the current address, then "-", then the new address.
    const oldKey = `change-email-otp-${FIRST.email}-${FIRST.wants}`;
    const now = new Date();
    await db.client.query("insert into sign_in.sign_in_code (id, identifier, value, expires_at, created_at, updated_at) values ($1, $2, 'x', $3, $4, $4)", [
      "old-change-email-code",
      oldKey,
      new Date(now.getTime() + 10 * 60 * 1000),
      now,
    ]);
    const countOf = async (identifier: string) => (await db.client.query<{ n: number }>("select count(*)::int as n from sign_in.sign_in_code where identifier = $1", [identifier])).rows[0]?.n;
    expect(await countOf(oldKey)).toBe(1);

    expect((await api.request("POST", "/api/account/delete", { cookie: first, body: { username: "first_x" } })).status).toBe(200);
    expect(await countOf(oldKey)).toBe(0);
  });
});
