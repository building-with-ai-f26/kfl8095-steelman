import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";
import { ORIGIN, useSignIn } from "../support/sign-in.ts";

// Signing in with a 6-digit code sent by email, sessions, and usernames
// (L-01; plans/architecture.md §7 "Sign-in and sessions", decision 004).
// Emails are kept in memory, never sent.

const db = useTestDatabase({ migrated: true });
const api = useSignIn(db);
const ids = createSeededIds(611);
const MINUTE = 60_000;

let n = 0;
/** A new address for each test, so their codes and limits don't mix. */
const newAddress = () => `person${++n}@school.example.edu`;

const whoIsSignedIn = async (cookie: string | undefined) => (await api.request("GET", "/api/auth/get-session", { cookie })).body;

describe("a sign-in code", () => {
  test("L-01: is six digits, emailed to the address, and signs that person in", async () => {
    const email = newAddress();

    expect((await api.requestCode(email)).status).toBe(200);
    expect(api.codeFor(email)).toMatch(/^\d{6}$/);

    const signedIn = await api.signIn(email);
    expect(signedIn.status).toBe(200);
    expect(signedIn.cookie).toBeDefined();
    expect((await whoIsSignedIn(signedIn.cookie)).user).toMatchObject({ email, emailVerified: true, username: null });
  });

  test("L-01: works only once", async () => {
    const email = newAddress();
    await api.requestCode(email);
    const code = api.codeFor(email);

    expect((await api.signIn(email, code)).status).toBe(200);
    const again = await api.signIn(email, code);
    expect(again.status).toBe(400);
    expect(again.cookie).toBeUndefined();
  });

  test("L-01: stops working ten minutes after it was sent, on the test clock", async () => {
    const early = newAddress();
    await api.requestCode(early);
    api.clock.advance(9 * MINUTE + 59_000);
    expect((await api.signIn(early)).status).toBe(200);

    const late = newAddress();
    await api.requestCode(late);
    api.clock.advance(10 * MINUTE + 1_000);
    const expired = await api.signIn(late);
    expect(expired.status).toBe(400);
    expect(expired.cookie).toBeUndefined();
  });

  test("L-01: is cancelled by five wrong tries, even if the sixth is right", async () => {
    const fourWrong = newAddress();
    await api.requestCode(fourWrong);
    const wrongFor = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    for (let i = 0; i < 4; i++) expect((await api.signIn(fourWrong, wrongFor(api.codeFor(fourWrong)))).status).toBe(400);
    expect((await api.signIn(fourWrong)).status).toBe(200);

    const fiveWrong = newAddress();
    await api.requestCode(fiveWrong);
    for (let i = 0; i < 5; i++) await api.signIn(fiveWrong, wrongFor(api.codeFor(fiveWrong)));
    const right = await api.signIn(fiveWrong);
    expect(right.status).not.toBe(200);
    expect(right.cookie).toBeUndefined();
  });

  test("L-01: is cancelled by asking for a new one", async () => {
    const email = newAddress();
    await api.requestCode(email);
    const first = api.codeFor(email);
    await api.requestCode(email);
    const second = api.codeFor(email);

    expect((await api.signIn(email, first)).status).toBe(400);
    expect((await api.signIn(email, second)).status).toBe(200);
  });

  test("L-01: is stored hashed, never as the digits", async () => {
    const email = newAddress();
    await api.requestCode(email);
    const code = api.codeFor(email);

    const stored = await db.client.query("select value from sign_in.sign_in_code where identifier like $1", [`%${email}%`]);
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].value).not.toContain(code);
  });

  test("L-01: a sixth email to one address within an hour is refused, and allowed again after the hour", async () => {
    const email = newAddress();
    for (let i = 0; i < 5; i++) {
      expect((await api.requestCode(email)).status).toBe(200);
      api.clock.advance(MINUTE);
    }
    const sent = api.outbox.filter((message) => message.to === email).length;

    const sixth = await api.requestCode(email);
    expect(sixth.status).toBe(429);
    expect(api.outbox.filter((message) => message.to === email)).toHaveLength(sent);
    // Another address isn't affected.
    expect((await api.requestCode(newAddress())).status).toBe(200);

    api.clock.advance(60 * MINUTE);
    expect((await api.requestCode(email)).status).toBe(200);
  });

  test("L-01: the same address in other capitals is the same person", async () => {
    const email = newAddress();
    const first = await api.signedIn(email);
    const second = await api.signedIn(email.toUpperCase());

    expect((await whoIsSignedIn(second)).user.id).toBe((await whoIsSignedIn(first)).user.id);
  });
});

describe("sessions", () => {
  test("L-01: the cookie is HttpOnly, Secure, SameSite=Lax, and lasts 30 days", async () => {
    await api.requestCode(newAddress());
    const signedIn = await api.signIn(api.outbox.at(-1)!.to);
    const header = signedIn.setCookies.find((cookie) => cookie.includes("session_token="))!;

    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(new RegExp(`Max-Age=${30 * 24 * 60 * 60}\\b`));
  });

  test("L-01: a session left unused for 30 days ends; one in use is extended", async () => {
    const cookie = await api.signedIn(newAddress());
    api.clock.advance(29 * 24 * 60 * MINUTE);
    // Used on day 29, so it now lasts 30 days from here (Better Auth refreshes a session used a day or more after its last refresh).
    expect(await whoIsSignedIn(cookie)).not.toBeNull();
    api.clock.advance(29 * 24 * 60 * MINUTE);
    expect(await whoIsSignedIn(cookie)).not.toBeNull();

    api.clock.advance(31 * 24 * 60 * MINUTE);
    expect(await whoIsSignedIn(cookie)).toBeNull();
  });

  test("L-01: signing out ends the session, and the cookie no longer works", async () => {
    const cookie = await api.signedIn(newAddress());
    const sessionsBefore = Number((await db.client.query("select count(*) from sign_in.session")).rows[0].count);

    expect((await api.request("POST", "/api/auth/sign-out", { cookie, body: {} })).status).toBe(200);

    expect(await whoIsSignedIn(cookie)).toBeNull();
    expect(Number((await db.client.query("select count(*) from sign_in.session")).rows[0].count)).toBe(sessionsBefore - 1);
  });
});

describe("usernames", () => {
  test("L-01: a new account has none until its person picks one, which then names them", async () => {
    const cookie = await api.signedIn(newAddress());
    expect((await whoIsSignedIn(cookie)).user.username).toBeNull();

    expect((await api.request("POST", "/api/auth/update-user", { cookie, body: { username: "Sam_Reyes" } })).status).toBe(200);
    expect((await whoIsSignedIn(cookie)).user.username).toBe("sam_reyes");
  });

  test("L-01: a username taken in other capitals is refused", async () => {
    await api.signedIn(newAddress(), "dana_k");
    const cookie = await api.signedIn(newAddress());

    const taken = await api.request("POST", "/api/auth/update-user", { cookie, body: { username: "Dana_K" } });
    expect(taken.status).toBe(400);
    expect(taken.body.code).toBe("USERNAME_IS_ALREADY_TAKEN");
  });

  test.each([
    ["too short", "ab"],
    ["too long", "a".repeat(31)],
    ["a space", "sam reyes"],
    ["a symbol", "sam-reyes!"],
  ])("L-01: a username with %s is refused", async (_why, username) => {
    const cookie = await api.signedIn(newAddress());
    expect((await api.request("POST", "/api/auth/update-user", { cookie, body: { username } })).status).toBe(400);
  });

  test.each(["deleted_account", "Steelman", "admin", "moderator"])("L-01: the reserved username %s is refused", async (username) => {
    const cookie = await api.signedIn(newAddress());
    expect((await api.request("POST", "/api/auth/update-user", { cookie, body: { username } })).status).toBe(400);
  });

  test("L-01: once picked, a username doesn't change", async () => {
    const cookie = await api.signedIn(newAddress(), "lee_m");

    expect((await api.request("POST", "/api/auth/update-user", { cookie, body: { username: "lee_other" } })).status).toBe(400);
    expect((await whoIsSignedIn(cookie)).user.username).toBe("lee_m");
  });
});

describe("writing to a board while signed in", () => {
  let b: SeededBoard;
  beforeEach(async () => {
    b = await seedBoard(db.client, ids);
  });
  const vote = (cookie: string, origin?: string | null) =>
    api.request("PUT", `/api/boards/${b.board}/arguments/${b.argument}/importance`, { cookie, body: { value: 1 }, ...(origin === undefined ? {} : { origin }) });

  test("L-01, B-01: a vote is made as the signed-in person", async () => {
    const cookie = await api.signedIn(newAddress(), "vote_tester");
    const me = (await whoIsSignedIn(cookie)).user.id;

    expect((await vote(cookie)).status).toBe(200);
    const stored = await db.client.query("select account_id from importance_vote where argument_id = $1", [b.argument]);
    expect(stored.rows).toEqual([{ account_id: me }]);
  });

  test("L-01: before picking a username, a person can read but not write", async () => {
    const cookie = await api.signedIn(newAddress());

    expect((await api.request("GET", `/api/boards/${b.board}`, { cookie })).status).toBe(200);
    const refused = await vote(cookie);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ status: "refused", reason: "needs_username" });
  });

  test("L-01: a write from another site, or with no Origin, is refused (cross-site request forgery)", async () => {
    const cookie = await api.signedIn(newAddress(), "origin_tester");

    for (const origin of ["https://evil.example", "http://steelman.test", null]) {
      const refused = await vote(cookie, origin);
      expect(refused.status, String(origin)).toBe(403);
      expect(refused.body).toMatchObject({ status: "refused", reason: "wrong_origin" });
    }
    expect((await vote(cookie, ORIGIN)).status).toBe(200);
  });
});

describe("what sign-in leaves alone", () => {
  test("L-01: only the sign-in routes Steelman uses answer; the library's others, such as passwords and deleting an account, don't", async () => {
    const cookie = await api.signedIn(newAddress(), "route_tester");
    for (const path of ["/api/auth/sign-up/email", "/api/auth/sign-in/email", "/api/auth/sign-in/username", "/api/auth/delete-user", "/api/auth/change-email", "/api/auth/forget-password/email-otp", "/api/auth/list-sessions"]) {
      expect((await api.request("POST", path, { cookie, body: {} })).status, path).toBe(404);
    }
  });

  test("L-01: codes and email addresses never appear in what the service logs", async () => {
    const printed: string[] = [];
    const keep = (...parts: unknown[]) => void printed.push(parts.map(String).join(" "));
    const spies = [
      vi.spyOn(console, "log").mockImplementation(keep),
      vi.spyOn(console, "info").mockImplementation(keep),
      vi.spyOn(console, "warn").mockImplementation(keep),
      vi.spyOn(console, "error").mockImplementation(keep),
      vi.spyOn(console, "debug").mockImplementation(keep),
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (keep(chunk), true)),
      vi.spyOn(process.stderr, "write").mockImplementation((chunk) => (keep(chunk), true)),
    ];
    try {
      const email = newAddress();
      await api.requestCode(email);
      const code = api.codeFor(email);
      await api.signIn(email, "000000");
      await api.signIn(email, code);
      for (let i = 0; i < 6; i++) await api.requestCode(email);

      expect(printed.join("\n")).not.toContain(email);
      expect(printed.join("\n")).not.toContain(code);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

afterEach(() => {
  // Each test starts an hour on from the last, so no sign-in email limit carries over.
  api.clock.advance(61 * MINUTE);
});
