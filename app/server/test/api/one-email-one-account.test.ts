import { describe, expect, test } from "vitest";
import { emailAddress } from "@steelman/shared";
import { FIRST, SECOND } from "../support/colliding-emails.ts";
import { useTestDatabase } from "../support/database.ts";
import type { TestDatabase } from "../support/database.ts";
import type { GoogleAccount } from "../support/fake-google.ts";
import { useSignIn } from "../support/sign-in.ts";
import type { SignInApi } from "../support/sign-in.ts";
import { acceptGoogleIdentity } from "../../src/sign-in.ts";

// One email address, one account (L-01, L-04; build plan M3d-32, finding F7;
// the builder's decision on Nov 28). An address is one account however it's
// written: in other capitals, with spaces at its ends, with a composed or a
// decomposed "é", or with full-width letters. Signing in with a code or with
// Google, in either order, reaches that one account, and changing your email
// to an address another account has is refused with the sentence it always
// had. A deleted account's address is erased, so it can make a new, empty
// account later. Gmail's dotted and plus-tagged forms stay separate.

const session = async (api: SignInApi, cookie: string | undefined) => (await api.request("GET", "/api/auth/get-session", { cookie })).body;
const accountsWithAddress = async (db: TestDatabase, address: string) =>
  (await db.client.query("select id, email, username from account where lower(normalize(email, NFKC)) = $1", [emailAddress(address)])).rows;
const waysIn = async (db: TestDatabase, accountId: string) =>
  (await db.client.query("select provider from sign_in.sign_in_method where account_id = $1 order by provider", [accountId])).rows.map((row) => row.provider);
const askToChange = (api: SignInApi, cookie: string, newEmail: string) => api.request("POST", "/api/auth/email-otp/request-email-change", { cookie, body: { newEmail } });
const change = (api: SignInApi, cookie: string, newEmail: string, otp: string) => api.request("POST", "/api/auth/email-otp/change-email", { cookie, body: { newEmail, otp } });

/**
 * Signs in with a code for an address written any way. The code goes to the address's one form, so it's read from
 * there (support/sign-in.ts's signedIn looks only in lower case).
 */
async function byCode(api: SignInApi, written: string, username?: string): Promise<string> {
  const asked = await api.requestCode(written);
  expect(asked.status, "asking for a code").toBe(200);
  const signedIn = await api.signIn(written, api.codeFor(emailAddress(written)));
  expect(signedIn.status, "signing in with the code").toBe(200);
  expect(signedIn.cookie).toBeDefined();
  if (username !== undefined) {
    const named = await api.request("POST", "/api/auth/update-user", { cookie: signedIn.cookie, body: { username } });
    expect(named.status, "picking a username").toBe(200);
  }
  return signedIn.cookie!;
}

describe("signing in with a code and with Google", () => {
  const db = useTestDatabase({ migrated: true });
  const api = useSignIn(db, { google: true });
  let n = 0;
  const googler = (email: string): GoogleAccount => ({ sub: `2093${String(++n).padStart(17, "0")}`, email, emailVerified: true, name: "", picture: "" });
  const HOUR = 60 * 60_000;

  test("L-01, L-04: a code first, then Google in other capitals and with a full-width letter, is one account with two ways in", async () => {
    const coder = await session(api, await byCode(api, "Rene.Ortiz@School.example.edu", "rene_o"));
    expect(coder.user.email).toBe("rene.ortiz@school.example.edu");

    const google = await api.signInWithGoogle(googler("\uff32ENE.ORTIZ@school.EXAMPLE.edu"));
    expect(google.finished?.status).toBe(302);
    expect(google.finished?.location).not.toMatch(/[?&]error=/);
    const byGoogle = await session(api, google.cookie);

    expect(byGoogle.user.id).toBe(coder.user.id);
    expect(byGoogle.user.username).toBe("rene_o");
    expect(await accountsWithAddress(db, "rene.ortiz@school.example.edu")).toHaveLength(1);
    expect(await waysIn(db, coder.user.id)).toEqual(["google"]);
    expect((await api.request("GET", "/api/account", { cookie: google.cookie })).body.signIn).toEqual(["Email code", "Google"]);
  });

  test("L-01: Google with a decomposed é keeps the address with the composed é, its one form", async () => {
    // A sign-in code can't reach this address: Better Auth accepts only ASCII addresses for codes.
    const google = await api.signInWithGoogle(googler("Andre\u0301@school.example.edu"));
    const byGoogle = await session(api, google.cookie);

    expect(byGoogle.user.email).toBe("andr\u00e9@school.example.edu");
    expect(await accountsWithAddress(db, "andr\u00e9@school.example.edu")).toHaveLength(1);
  });

  test("L-01, L-04: Google first, then a code with full-width letters and spaces at its ends, is one account", async () => {
    const google = await api.signInWithGoogle(googler("mira.k@school.example.edu"));
    const byGoogle = await session(api, google.cookie);
    expect(byGoogle.user.email).toBe("mira.k@school.example.edu");

    const coder = await session(api, await byCode(api, "  Ｍira.K@School.Example.edu "));

    expect(coder.user.id).toBe(byGoogle.user.id);
    expect(await accountsWithAddress(db, "mira.k@school.example.edu")).toHaveLength(1);
    expect(await waysIn(db, byGoogle.user.id)).toEqual(["google"]);
    expect((await api.request("GET", "/api/account", { cookie: google.cookie })).body.signIn).toEqual(["Email code", "Google"]);
  });

  test("L-01: a code asked for in one form signs in when the address is typed in another", async () => {
    const asked = await api.requestCode("Lin.Zhao@school.example.edu");
    expect(asked.status).toBe(200);
    const code = api.codeFor("lin.zhao@school.example.edu");

    const signedIn = await api.signIn(" ｌin.zhao@SCHOOL.example.edu", code);

    expect(signedIn.status).toBe(200);
    expect((await session(api, signedIn.cookie)).user.email).toBe("lin.zhao@school.example.edu");
    expect(await accountsWithAddress(db, "lin.zhao@school.example.edu")).toHaveLength(1);
  });

  test("L-01: the code goes to the address's one form, and every form counts against its five emails an hour", async () => {
    const forms = ["Kai@school.example.edu", " kai@school.example.edu", "Ｋai@school.example.edu", "KAI@SCHOOL.EXAMPLE.EDU", "kai@school.example.edu"];
    for (const form of forms) expect((await api.requestCode(form)).status).toBe(200);
    expect(api.outbox.filter((message) => message.to.toLowerCase().includes("kai@")).map((message) => message.to)).toEqual(Array(5).fill("kai@school.example.edu"));

    const sixth = await api.requestCode("Kａi@school.example.edu");
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe("TOO_MANY_EMAILS");
    api.clock.advance(HOUR + 1_000);
  });

  test("L-01: two code sign-ins for one new address at the same moment make one account", async () => {
    expect((await api.requestCode("New.Person@school.example.edu")).status).toBe(200);
    const code = api.codeFor("new.person@school.example.edu");

    const answers = await Promise.all([api.signIn("New.Person@school.example.edu", code), api.signIn("new.person@school.example.edu", code)]);

    // One uses the code and signs in. The other finds it used, and is refused, never answered with a server error.
    expect(answers.filter((answer) => answer.status === 200)).toHaveLength(1);
    expect(answers.every((answer) => answer.status < 500)).toBe(true);
    expect(answers.filter((answer) => answer.cookie)).toHaveLength(1);
    expect(await accountsWithAddress(db, "new.person@school.example.edu")).toHaveLength(1);
  });

  test("L-01: Gmail's dotted and plus-tagged forms of one mailbox are separate accounts", async () => {
    const dotted = await session(api, await byCode(api, "jane.doe@gmail.com"));
    const tagged = await session(api, await byCode(api, "janedoe+steelman@gmail.com"));
    expect(tagged.user.id).not.toBe(dotted.user.id);
  });
});

describe("changing your email to an address another account has", () => {
  const db = useTestDatabase({ migrated: true });
  const api = useSignIn(db);

  test("L-01, L-04: asking for it in another form sends no code, only the note to the address's one form", async () => {
    await byCode(api, "taken.one@school.example.edu", "taken_one");
    const cookie = await byCode(api, "asker.one@school.example.edu", "asker_one");
    const before = api.outbox.length;

    const asked = await askToChange(api, cookie, " TAKEN.ＯNE@School.example.edu");

    expect(asked.status).toBe(200);
    expect(api.outbox.slice(before)).toEqual([{ to: "taken.one@school.example.edu", code: "", kind: "in-use" }]);
    expect((await session(api, cookie)).user.email).toBe("asker.one@school.example.edu");
  });

  test("L-01, L-04: a code for a free address is refused with the existing sentence once another account takes it in another form", async () => {
    const cookie = await byCode(api, "asker.two@school.example.edu", "asker_two");
    expect((await askToChange(api, cookie, "free.two@school.example.edu")).status).toBe(200);
    const code = api.codeFor("free.two@school.example.edu");
    await byCode(api, "\uff26REE.TWO@School.Example.edu");

    // A full-width letter and spaces at its ends: Better Auth only lowers the case, so without the one form it would
    // refuse this as not an address, with another sentence.
    const taken = await change(api, cookie, " \uff26ree.Two@school.example.edu ", code);

    expect(taken.status).toBe(400);
    expect(taken.body.message).toBe("Email already in use");
    expect((await session(api, cookie)).user.email).toBe("asker.two@school.example.edu");
    expect(await accountsWithAddress(db, "free.two@school.example.edu")).toHaveLength(1);
  });

  test("L-01, L-04: a code asked for in one form changes the email when the address is typed in another", async () => {
    const cookie = await byCode(api, "asker.three@school.example.edu", "asker_three");
    expect((await askToChange(api, cookie, "Moved.Three@School.example.edu")).status).toBe(200);
    const code = api.codeFor("moved.three@school.example.edu");

    const moved = await change(api, cookie, " ｍoved.three@school.example.edu", code);

    expect(moved.status).toBe(200);
    expect((await session(api, moved.cookie ?? cookie)).user.email).toBe("moved.three@school.example.edu");
  });

  test("L-01, L-04: asking for your own address in another form sends nothing", async () => {
    const cookie = await byCode(api, "asker.four@school.example.edu", "asker_four");
    const before = api.outbox.length;

    await askToChange(api, cookie, "ASKER.ＦOUR@school.example.edu");

    expect(api.outbox.slice(before)).toEqual([]);
    expect((await session(api, cookie)).user.email).toBe("asker.four@school.example.edu");
  });
});

describe("M3d-28's colliding pairs", () => {
  const db = useTestDatabase({ migrated: true });
  const api = useSignIn(db);

  test("L-01, L-04: x@a.bb and x@a.bb-c.com are separate accounts, and neither takes the other's address", async () => {
    const first = await session(api, await byCode(api, FIRST.email, "first_x"));
    const second = await session(api, await byCode(api, SECOND.email, "second_x"));
    expect(second.user.id).not.toBe(first.user.id);

    const firstCookie = await byCode(api, FIRST.email.toUpperCase());
    const before = api.outbox.length;
    expect((await askToChange(api, firstCookie, SECOND.email.toUpperCase())).status).toBe(200);
    expect(api.outbox.slice(before)).toEqual([{ to: SECOND.email, code: "", kind: "in-use" }]);

    const rows = await db.client.query("select email from account where username in ('first_x', 'second_x') order by username");
    expect(rows.rows.map((row) => row.email)).toEqual([FIRST.email, SECOND.email]);
  });
});

describe("a deleted account's address", () => {
  const db = useTestDatabase({ migrated: true });
  const api = useSignIn(db);

  test("L-01, L-04: deleting an account stored in another form erases the code waiting for its one form", async () => {
    // An account made before M3d-32 can hold its address in another form, here with a full-width letter.
    const cookie = await byCode(api, "older@school.example.edu", "older_o");
    const { user } = await session(api, cookie);
    await db.client.query("update account set email = $1 where id = $2", ["\uff4flder@school.example.edu", user.id]);
    expect((await api.requestCode("older@school.example.edu")).status).toBe(200);
    const waiting = async () => (await db.client.query("select identifier from sign_in.sign_in_code where identifier = $1", ["sign-in-otp-older@school.example.edu"])).rows;
    expect(await waiting()).toHaveLength(1);

    expect((await api.request("POST", "/api/account/delete", { cookie, body: { username: "older_o" } })).status).toBe(200);

    expect(await waiting()).toEqual([]);
  });

  test("L-01, L-04: makes a new account that holds nothing of the old one", async () => {
    const cookie = await byCode(api, "Leaving@school.example.edu", "leaving_l");
    const old = await session(api, cookie);
    expect((await api.request("POST", "/api/account/delete", { cookie, body: { username: "leaving_l" } })).status).toBe(200);
    expect(await accountsWithAddress(db, "leaving@school.example.edu")).toEqual([]);

    const fresh = await session(api, await byCode(api, "LEAVING@school.example.edu"));

    expect(fresh.user.id).not.toBe(old.user.id);
    expect(fresh.user).toMatchObject({ email: "leaving@school.example.edu", username: null });
    expect(await accountsWithAddress(db, "leaving@school.example.edu")).toEqual([{ id: fresh.user.id, email: "leaving@school.example.edu", username: null }]);
    expect((await db.client.query("select username, email, deleted_at is not null as deleted from account where id = $1", [old.user.id])).rows).toEqual([
      { username: "leaving_l", email: null, deleted: true },
    ]);
  });
});

describe("which Google identities are accepted, in their one form", () => {
  test("L-01: a Google email with a full-width @ and spaces at its ends is kept in its one form", () => {
    expect(acceptGoogleIdentity({ sub: "1", email: " Sam\uff20X.edu ", email_verified: true })).toEqual({ sub: "1", email: "sam@x.edu" });
  });

  test("L-01: a Google email with no @ in its one form is refused", () => {
    expect(acceptGoogleIdentity({ sub: "1", email: " Sam.X.edu ", email_verified: true })).toBeNull();
  });
});
