import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";

// Changing your email (M2-8c; L-04), as Notion does it and the prototype shows
// (approved Nov 22): a 6-digit code goes to the new address, and the email
// changes only when it's entered, with sign-in's rules for codes (ten minutes,
// five wrong tries, a new code cancels the old). The old address is told.
// Google then signs in only with the new address. No recent sign-in is asked
// for. Emails are kept in memory, never sent.

const db = useTestDatabase({ migrated: true });
const api = useSignIn(db, { google: true });
const MINUTE = 60_000;

let n = 0;
/** A new address for each use, so codes and limits don't mix between tests. */
const newAddress = () => `changer${++n}@school.example.edu`;

const session = async (cookie: string | undefined) => (await api.request("GET", "/api/auth/get-session", { cookie })).body;
const askToChange = (cookie: string | undefined, newEmail: string) => api.request("POST", "/api/auth/email-otp/request-email-change", { cookie, body: { newEmail } });
const change = (cookie: string | undefined, newEmail: string, otp: string) => api.request("POST", "/api/auth/email-otp/change-email", { cookie, body: { newEmail, otp } });
const sentTo = (address: string) => api.outbox.filter((message) => message.to === address);

/** Someone signed in by code, with a username. */
async function someone(): Promise<{ email: string; cookie: string; id: string }> {
  const email = newAddress();
  const cookie = await api.signedIn(email, `user_${n}`);
  return { email, cookie, id: (await session(cookie)).user.id };
}

describe("changing your email", () => {
  test("M2-8c, L-04: a code goes to the new address, and the email changes only when it's entered", async () => {
    const { email, cookie, id } = await someone();
    const next = newAddress();

    expect((await askToChange(cookie, next)).status).toBe(200);
    expect(sentTo(next).at(-1)).toMatchObject({ kind: "change-email" });
    expect(api.codeFor(next)).toMatch(/^\d{6}$/);
    expect((await session(cookie)).user.email).toBe(email);

    const changed = await change(cookie, next, api.codeFor(next));
    expect(changed.status).toBe(200);
    expect((await session(changed.cookie ?? cookie)).user).toMatchObject({ id, email: next, emailVerified: true });

    // A code to the new address now signs in to the same account.
    await api.requestCode(next);
    const again = await api.signIn(next);
    expect((await session(again.cookie)).user.id).toBe(id);
  });

  test("M2-8c, L-04: the old address is told the email changed, and to what", async () => {
    const { email, cookie } = await someone();
    const next = newAddress();
    await askToChange(cookie, next);
    await change(cookie, next, api.codeFor(next));

    expect(sentTo(email).at(-1)).toEqual({ to: email, code: "", kind: "changed", newEmail: next });
  });

  test("M2-8c, L-04: a wrong code changes nothing, and five wrong tries stop the right code too", async () => {
    const { email, cookie } = await someone();
    const next = newAddress();
    await askToChange(cookie, next);
    const code = api.codeFor(next);
    const wrong = code === "000000" ? "111111" : "000000";

    const first = await change(cookie, next, wrong);
    expect(first.status).toBe(400);
    expect(first.body.code).toBe("INVALID_OTP");
    for (let i = 0; i < 4; i++) await change(cookie, next, wrong);
    const refused = await change(cookie, next, code);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect((await session(cookie)).user.email).toBe(email);
  });

  test("M2-8c, L-04: the code stops working after ten minutes, and a new code cancels the old one", async () => {
    const { email, cookie } = await someone();
    const late = newAddress();
    await askToChange(cookie, late);
    api.clock.advance(10 * MINUTE + 1_000);
    const expired = await change(cookie, late, api.codeFor(late));
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe("OTP_EXPIRED");

    const next = newAddress();
    await askToChange(cookie, next);
    const old = api.codeFor(next);
    await askToChange(cookie, next);
    const fresh = api.codeFor(next);
    if (old !== fresh) expect((await change(cookie, next, old)).status).toBe(400);
    expect((await session(cookie)).user.email).toBe(email);
    expect((await change(cookie, next, fresh)).status).toBe(200);
  });

  test("M2-8c, L-04: an address another account uses gets no code, only a note that it already has an account", async () => {
    const { email: theirs } = await someone();
    const { email, cookie } = await someone();
    const before = sentTo(theirs).length;

    expect((await askToChange(cookie, theirs)).status).toBe(200);
    expect(sentTo(theirs).slice(before)).toEqual([{ to: theirs, code: "", kind: "in-use" }]);
    expect((await session(cookie)).user.email).toBe(email);
  });

  test("M2-8c, L-04: if another account takes the address after the code was sent, the right code is refused", async () => {
    const { email, cookie } = await someone();
    const next = newAddress();
    await askToChange(cookie, next);
    const code = api.codeFor(next);
    await api.signedIn(next);

    const taken = await change(cookie, next, code);
    expect(taken.status).toBe(400);
    expect(taken.body.message).toBe("Email already in use");
    expect((await session(cookie)).user.email).toBe(email);
  });

  test("M2-8c, L-04, architecture §7: asking counts against the new address's five emails an hour", async () => {
    const { cookie } = await someone();
    const next = newAddress();
    for (let i = 0; i < 5; i++) expect((await askToChange(cookie, next)).status).toBe(200);
    const sixth = await askToChange(cookie, next);
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe("TOO_MANY_EMAILS");
  });

  test("M2-8c, L-04: signed out, nothing is sent", async () => {
    const next = newAddress();
    expect((await askToChange(undefined, next)).status).toBe(401);
    expect(sentTo(next)).toEqual([]);
  });

  test("M2-8c, L-04: a change that fails, by a wrong code or a request without one, keeps Google and tells no one", async () => {
    const email = newAddress();
    const google = { sub: "109300000000000000778", email, emailVerified: true, name: "Ren Oda" };
    const first = await api.signInWithGoogle(google);
    await api.request("POST", "/api/auth/update-user", { cookie: first.cookie, body: { username: "ren_oda" } });
    const id = (await session(first.cookie)).user.id;
    const next = newAddress();
    await askToChange(first.cookie, next);
    const wrong = api.codeFor(next) === "000000" ? "111111" : "000000";

    expect((await change(first.cookie, next, wrong)).status).toBe(400);
    expect((await api.request("POST", "/api/auth/email-otp/change-email", { cookie: first.cookie, body: { newEmail: next } })).status).toBe(400);

    const methods = await db.client.query("select provider from sign_in.sign_in_method where account_id = $1", [id]);
    expect(methods.rows.map((row) => row.provider)).toContain("google");
    expect(sentTo(email).filter((message) => message.kind === "changed")).toEqual([]);
    expect((await session(first.cookie)).user.email).toBe(email);
  });

  test("M2-8c, L-04, M-07: deleting the account removes a code waiting for its new email", async () => {
    const { cookie } = await someone();
    const username = (await session(cookie)).user.username;
    await askToChange(cookie, newAddress());
    expect((await api.request("POST", "/api/account/delete", { cookie, body: { username } })).status).toBe(200);
    const left = await db.client.query("select identifier from sign_in.sign_in_code where identifier like 'change-email-otp-%' and identifier like $1", [`%${n}@%`]);
    expect(left.rows).toEqual([]);
  });

  test("M2-8c, L-04: after the change, Google signs in only with the new address", async () => {
    const email = newAddress();
    const google = { sub: "109300000000000000777", email, emailVerified: true, name: "Gale Ito" };
    const first = await api.signInWithGoogle(google);
    await api.request("POST", "/api/auth/update-user", { cookie: first.cookie, body: { username: "gale_ito" } });
    const id = (await session(first.cookie)).user.id;

    const next = newAddress();
    await askToChange(first.cookie, next);
    expect((await change(first.cookie, next, api.codeFor(next))).status).toBe(200);
    const methods = await db.client.query("select provider from sign_in.sign_in_method where account_id = $1", [id]);
    expect(methods.rows.map((row) => row.provider)).not.toContain("google");

    // The same Google account, still with the old address, no longer reaches this account.
    const later = await api.signInWithGoogle(google);
    expect((await session(later.cookie)).user.id).not.toBe(id);
  });
});
