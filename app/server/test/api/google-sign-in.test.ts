import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import type { GoogleAccount, IdTokenFault } from "../support/fake-google.ts";
import { useTestDatabase } from "../support/database.ts";
import { ORIGIN, useSignIn } from "../support/sign-in.ts";
import { acceptGoogleIdentity } from "../../src/sign-in.ts";

// Signing in with Google (L-01; plans/architecture.md §7 "Sign-in and
// sessions"), through OpenID Connect, against a stand-in for Google that runs
// inside the test (support/fake-google.ts). No test calls Google.

// Every request the service makes leaves through fetch, so each address it
// fetches is noted, from before the service starts. (A plain wrapper, not a
// Vitest spy: Vitest clears a spy's calls before each test.)
const fetchedFrom: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  fetchedFrom.push(new URL(input instanceof Request ? input.url : String(input)).origin);
  return realFetch(input, init);
};
afterAll(() => {
  globalThis.fetch = realFetch;
});

const db = useTestDatabase({ migrated: true });
const api = useSignIn(db, { google: true });
const MINUTE = 60_000;

let n = 0;
/** A new Google account for each test, so they don't mix. */
const newGoogler = (account: Partial<GoogleAccount> = {}): GoogleAccount => {
  n++;
  return { sub: `1093${String(n).padStart(17, "0")}`, email: `googler${n}@school.example.edu`, emailVerified: true, name: `Pat Example ${n}`, picture: `https://lh3.example/${n}.jpg`, ...account };
};

const whoIsSignedIn = async (cookie: string | undefined) => (await api.request("GET", "/api/auth/get-session", { cookie })).body;
const accountsWithEmail = async (email: string) => (await db.client.query("select * from account where lower(email) = lower($1)", [email])).rows;
const googleMethodsOf = async (accountId: string) =>
  (await db.client.query("select provider, provider_subject from sign_in.sign_in_method where account_id = $1", [accountId])).rows;
const sessionCount = async () => Number((await db.client.query("select count(*) from sign_in.session")).rows[0].count);

/** Google sign-in got as far as Google and back, and was then refused: back on our own site with an error, and no session. */
const expectRefused = (signIn: Awaited<ReturnType<typeof api.signInWithGoogle>>) => {
  expect(signIn.started.status, "the sign-in started").toBe(200);
  expect(signIn.finished?.status).toBe(302);
  expect(signIn.finished?.location).toMatch(new RegExp(`^${ORIGIN}/.*[?&]error=`));
  expect(signIn.cookie).toBeUndefined();
};

describe("signing in with Google", () => {
  test("L-01: makes an account for a Google-verified email, signs it in, and goes back to the page that asked", async () => {
    const googler = newGoogler();

    const signIn = await api.signInWithGoogle(googler, { callbackURL: `${ORIGIN}/b/some-board` });

    expect(signIn.finished?.status).toBe(302);
    expect(signIn.finished?.location).toBe(`${ORIGIN}/b/some-board`);
    expect(signIn.cookie).toBeDefined();
    const { user } = await whoIsSignedIn(signIn.cookie);
    expect(user).toMatchObject({ email: googler.email, emailVerified: true, username: null });
    expect(await googleMethodsOf(user.id)).toEqual([{ provider: "google", provider_subject: googler.sub }]);
  });

  test("L-01: asks Google only for who the person is and their email", async () => {
    const signIn = await api.signInWithGoogle(newGoogler());
    const asked = new URL(signIn.started.body.url as string);
    expect(asked.origin).toBe(api.google.issuer);
    expect(asked.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid"]);
  });

  test("L-01: signing in with Google again is the same account", async () => {
    const googler = newGoogler();
    const first = await whoIsSignedIn((await api.signInWithGoogle(googler)).cookie);
    const again = await whoIsSignedIn((await api.signInWithGoogle(googler)).cookie);

    expect(again.user.id).toBe(first.user.id);
    expect(await googleMethodsOf(first.user.id)).toHaveLength(1);
  });

  test("L-01: an email-code account and a Google account with the same email are one person, who can sign in either way", async () => {
    const googler = newGoogler();
    const byCode = await whoIsSignedIn(await api.signedIn(googler.email, `coder_${n}`));

    // Google reports the address in other capitals; it's still the same address.
    const byGoogle = await whoIsSignedIn((await api.signInWithGoogle({ ...googler, email: googler.email.toUpperCase() })).cookie);

    expect(byGoogle.user.id).toBe(byCode.user.id);
    expect(byGoogle.user.username).toBe(`coder_${n}`);
    expect(await accountsWithEmail(googler.email)).toHaveLength(1);
    expect(await googleMethodsOf(byCode.user.id)).toEqual([{ provider: "google", provider_subject: googler.sub }]);
    api.clock.advance(61 * MINUTE);
    expect((await whoIsSignedIn(await api.signedIn(googler.email))).user.id).toBe(byCode.user.id);
  });

  test("L-01: a Google account first, then a code to the same email, is one person", async () => {
    const googler = newGoogler();
    const byGoogle = await whoIsSignedIn((await api.signInWithGoogle(googler)).cookie);
    const byCode = await whoIsSignedIn(await api.signedIn(googler.email.toUpperCase()));

    expect(byCode.user.id).toBe(byGoogle.user.id);
    expect(await accountsWithEmail(googler.email)).toHaveLength(1);
  });

  test("L-01: keeps who the person is at Google, but not their Google name, picture, or Google's tokens", async () => {
    const googler = newGoogler();
    const { user } = await whoIsSignedIn((await api.signInWithGoogle(googler)).cookie);

    const [account] = await accountsWithEmail(googler.email);
    expect(account).toMatchObject({ name: "", image: null });
    const methods = await db.client.query("select * from sign_in.sign_in_method where account_id = $1", [user.id]);
    const kept = JSON.stringify(methods.rows);
    expect(kept).not.toContain(googler.name);
    expect(kept).not.toContain("fake-access-token");
    expect(kept).not.toMatch(/eyJ/); // the start of any JWT, such as Google's ID token
  });

  test("L-01: leaves nothing of the sign-in behind once it's done", async () => {
    const before = Number((await db.client.query("select count(*) from sign_in.sign_in_code")).rows[0].count);
    await api.signInWithGoogle(newGoogler());
    expect(Number((await db.client.query("select count(*) from sign_in.sign_in_code")).rows[0].count)).toBe(before);
  });
});

describe("what Google sign-in refuses", () => {
  test("L-01: an email Google hasn't verified: no account, no session", async () => {
    const googler = newGoogler({ emailVerified: false });
    const sessions = await sessionCount();

    expectRefused(await api.signInWithGoogle(googler));
    expect(await accountsWithEmail(googler.email)).toHaveLength(0);
    expect(await sessionCount()).toBe(sessions);
  });

  test("L-01: an email Google hasn't verified isn't joined to the account that has that email", async () => {
    const googler = newGoogler({ emailVerified: false });
    const owner = await whoIsSignedIn(await api.signedIn(googler.email, `owner_${n}`));

    expectRefused(await api.signInWithGoogle(googler));
    expect(await googleMethodsOf(owner.user.id)).toEqual([]);
  });

  test.each<[string, IdTokenFault]>([
    ["signed by a key that isn't Google's", "other-key"],
    ["made for another site", "other-audience"],
    ["from another issuer", "other-issuer"],
    ["from another sign-in (its nonce doesn't match)", "other-nonce"],
    ["expired", "expired"],
  ])("L-01: an ID token %s", async (_why, fault) => {
    const googler = newGoogler();
    api.google.spoilNextIdToken(fault);

    expectRefused(await api.signInWithGoogle(googler));
    expect(await accountsWithEmail(googler.email)).toHaveLength(0);
  });

  test("L-01: finishing in a browser that didn't start the sign-in (login forgery)", async () => {
    // Someone starts a sign-in as themselves, then tricks another browser into
    // following Google's answer, which would sign that browser in as them.
    const googler = newGoogler();
    expectRefused(await api.signInWithGoogle(googler, { finishWith: () => "" }));
    expect(await accountsWithEmail(googler.email)).toHaveLength(0);
  });

  test("L-01: Google's answer used a second time", async () => {
    const signIn = await api.signInWithGoogle(newGoogler());
    expect(signIn.cookie).toBeDefined();

    // The same callback address, code, state, and cookies, sent again.
    const replayed = await api.request("GET", signIn.back!.url, { cookie: signIn.back!.cookies, origin: null });
    expect(replayed.cookie).toBeUndefined();
    expect(replayed.status).toBe(302);
    expect(replayed.location).toMatch(new RegExp(`^${ORIGIN}/.*[?&]error=`));
  });

  test("L-01: being sent anywhere but our own site afterwards", async () => {
    const signIn = await api.signInWithGoogle(newGoogler(), { callbackURL: "https://evil.example/" });
    expect(signIn.started.status).toBe(403);
    expect(signIn.finished).toBeUndefined();
  });

  test.each<[string, Record<string, unknown>]>([
    ["more of the person's Google account", { scopes: ["profile", "https://www.googleapis.com/auth/drive"] }],
    ["data of its own to keep until Google answers", { additionalData: { note: "x".repeat(10_000) } }],
    ["something Steelman doesn't send", { loginHint: "someone@school.example.edu" }],
  ])("L-01: a start that asks for %s", async (_why, extra) => {
    const sessionsBefore = await sessionCount();
    const kept = Number((await db.client.query("select count(*) from sign_in.sign_in_code")).rows[0].count);

    const started = await api.request("POST", "/api/auth/sign-in/social", { body: { provider: "google", callbackURL: `${ORIGIN}/`, ...extra } });

    expect(started.status).toBe(400);
    expect(started.body?.url).toBeUndefined();
    expect(Number((await db.client.query("select count(*) from sign_in.sign_in_code")).rows[0].count)).toBe(kept);
    expect(await sessionCount()).toBe(sessionsBefore);
  });

  test("L-01: an ID token posted straight to the service, skipping the redirect", async () => {
    const posted = await api.request("POST", "/api/auth/sign-in/social", { body: { provider: "google", idToken: { token: "eyJhbGciOiJSUzI1NiJ9.e30.c2ln" } } });
    expect(posted.status).toBe(400);
    expect(posted.cookie).toBeUndefined();
  });

  test("L-01: the library's other routes for outside sign-in, such as linking another provider, don't answer", async () => {
    const cookie = await api.signedIn(newGoogler().email, `linker_${n}`);
    for (const [method, path] of [
      ["POST", "/api/auth/link-social"],
      ["POST", "/api/auth/unlink-account"],
      ["GET", "/api/auth/list-accounts"],
      ["POST", "/api/auth/callback/google"],
      ["POST", "/api/auth/get-access-token"],
    ] as const) {
      expect((await api.request(method, path, { cookie, body: method === "POST" ? {} : undefined })).status, `${method} ${path}`).toBe(404);
    }
  });
});

describe("which Google identities are accepted, from the ID token's claims", () => {
  const sub = "109300000000000000001";
  const email = "sam@school.example.edu";

  test("L-01: a verified email with Google's ID for the person is accepted, as just those two", () => {
    expect(acceptGoogleIdentity({ sub, email, email_verified: true, name: "Sam Reyes", picture: "https://lh3.example/s.jpg" })).toEqual({ sub, email });
  });

  test.each<[string, Record<string, unknown>]>([
    ["email_verified false", { sub, email, email_verified: false }],
    ["email_verified missing", { sub, email }],
    ["email_verified as the string \"true\"", { sub, email, email_verified: "true" }],
    ["no sub", { email, email_verified: true }],
    ["an empty sub", { sub: "", email, email_verified: true }],
    ["a sub that isn't a string", { sub: 1093, email, email_verified: true }],
    ["no email", { sub, email_verified: true }],
    ["an email that isn't an address", { sub, email: "sam", email_verified: true }],
    ["no claims at all (an ID token that couldn't be read)", {}],
  ])("L-01: refused with %s", (_why, claims) => {
    expect(acceptGoogleIdentity(claims)).toBeNull();
  });
});

describe("what Google sign-in leaves alone", () => {
  test("L-01: no test calls Google: every request the service made went to the stand-in", () => {
    expect(fetchedFrom.length).toBeGreaterThan(0);
    expect(new Set(fetchedFrom)).toEqual(new Set([api.google.issuer]));
  });

  test("L-01: emails never appear in what the service logs, even when Google sign-in is refused", async () => {
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
    const emails: string[] = [];
    try {
      const fine = newGoogler();
      const unverified = newGoogler({ emailVerified: false });
      const spoiled = newGoogler();
      emails.push(fine.email, unverified.email, spoiled.email);
      await api.signInWithGoogle(fine);
      await api.signInWithGoogle(unverified);
      api.google.spoilNextIdToken("other-key");
      await api.signInWithGoogle(spoiled);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    for (const email of emails) expect(printed.join("\n")).not.toContain(email);
  });
});

afterEach(() => {
  // Each test starts an hour on from the last, so no sign-in email limit carries over.
  api.clock.advance(61 * MINUTE);
});
