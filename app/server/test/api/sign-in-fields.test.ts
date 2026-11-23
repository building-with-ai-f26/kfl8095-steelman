import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";

// What sign-in's routes take from a request (L-01, L-04; the security audit
// of Nov 22, SECURITY.md). Better Auth's own routes accept more than
// Steelman's pages send: a username that isn't text skipped its "picked once"
// and shape checks, and a name or picture of any length was stored. Each
// route now takes only the fields our pages send, as text.

const db = useTestDatabase({ migrated: true });
const api = useSignIn(db);

let n = 0;
/** A new address for each test, so their codes and limits don't mix. */
const newAddress = () => `fields${++n}@school.example.edu`;

const whoIsSignedIn = async (cookie: string | undefined) => (await api.request("GET", "/api/auth/get-session", { cookie })).body;
const update = (cookie: string, body: unknown) => api.request("POST", "/api/auth/update-user", { cookie, body });

describe("picking a username", () => {
  test("L-01: a picked username can't be cleared and picked again", async () => {
    const cookie = await api.signedIn(newAddress(), "lee_f");

    expect((await update(cookie, { username: null })).status).toBe(400);
    expect((await update(cookie, { username: "lee_second" })).status).toBe(400);
    expect((await whoIsSignedIn(cookie)).user.username).toBe("lee_f");
  });

  test.each([[0], [12], [true], [["admin"]], [{ admin: 1 }], [null]])("L-01: a username that isn't text (%j) is refused, not stored and not a server error", async (username) => {
    const cookie = (await api.signIn(await requested())).cookie!;

    expect((await update(cookie, { username })).status).toBe(400);
    expect((await whoIsSignedIn(cookie)).user.username).toBeNull();
  });

  test("L-01, L-04: a name or a picture is refused, and nothing is stored", async () => {
    const email = newAddress();
    const cookie = await api.signedIn(email, "lee_g");

    expect((await update(cookie, { name: "N".repeat(200_000) })).status).toBe(400);
    expect((await update(cookie, { image: "javascript:alert(1)" })).status).toBe(400);
    expect((await update(cookie, { username: "lee_h", name: "Lee" })).status).toBe(400);

    const account = (await db.client.query("select username, name, image from account where email = $1", [email])).rows[0];
    expect(account).toEqual({ username: "lee_g", name: "", image: null });
  });

  test("L-01: a username as text is still picked", async () => {
    const cookie = (await api.signIn(await requested())).cookie!;

    expect((await update(cookie, { username: "lee_k" })).status).toBe(200);
    expect((await whoIsSignedIn(cookie)).user.username).toBe("lee_k");
  });
});

describe("signing in with a code", () => {
  test("L-01: anything besides the address and the code is refused", async () => {
    const email = await requested();

    const refused = await api.request("POST", "/api/auth/sign-in/email-otp", { body: { email, otp: api.codeFor(email), name: "N".repeat(200_000), image: "https://example.com/x.png" } });

    expect(refused.status).toBe(400);
    expect(refused.cookie).toBeUndefined();
    expect((await db.client.query("select id from account where email = $1", [email])).rows).toEqual([]);
  });

  test("L-01: the address and the code still sign in", async () => {
    const email = await requested();

    expect((await api.signIn(email)).status).toBe(200);
  });
});

/** A new address that has asked for a code. */
async function requested(): Promise<string> {
  const email = newAddress();
  await api.requestCode(email);
  return email;
}
