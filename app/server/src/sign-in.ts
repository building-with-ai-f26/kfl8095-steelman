// Signing in (L-01; plans/architecture.md §7, decision 004), through Better
// Auth: a 6-digit code emailed to the person and typed into the page that
// asked for it; Google, through OpenID Connect; a session cookie; and a
// username picked once, after the first sign-in.
//
// Everything Better Auth is told lives here, so what it does is in one file:
// which of our tables and columns it uses, the code's rules, the cookie, and
// the limit on sign-in emails. The routes it may answer are listed in
// SIGN_IN_ROUTES; it has many more (passwords, deleting accounts…), and the
// service answers 404 for those.
//
// Two things Better Auth does its own way (architecture §7 and §8, agreed by
// the builder on Nov 13): it reads the system clock, not the Clock the
// service is given, and it keeps session tokens in the database as they are,
// not hashed.

import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, genericOAuth, username } from "better-auth/plugins";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import { isAllowedUsername, USERNAME } from "@steelman/shared";
import type { Clock, IdSource } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import type { EmailSender } from "./email.ts";

export interface SignInDependencies {
  /** Where the site is, such as https://app.steelman-argument.com. Cookies are Secure when it's https, and writes must come from it. */
  origin: string;
  /** Signs the session cookie. From the environment, never from a file (AGENTS.md rule 5). */
  secret: string;
  email: EmailSender;
  /** Google sign-in, when the service has a Google OAuth client. Without one, only email codes work. */
  google?: GoogleClient;
}

export interface GoogleClient {
  clientId: string;
  /** From the environment, never from a file (AGENTS.md rule 5). */
  clientSecret: string;
  /** Where Google describes itself. Only the tests change it, to point at their stand-in. */
  discoveryUrl?: string;
}

/** The Better Auth routes the service passes on, by method and path under /api/auth. */
export const SIGN_IN_ROUTES: ReadonlySet<string> = new Set([
  "POST /email-otp/send-verification-otp",
  "POST /sign-in/email-otp",
  "POST /update-user",
  "GET /get-session",
  "POST /sign-out",
  // Changing your email (M2-8c): a code to the new address, then the code.
  "POST /email-otp/request-email-change",
  "POST /email-otp/change-email",
  // Google: the browser asks to start, and Google sends it back here.
  "POST /sign-in/social",
  "GET /callback/google",
]);

/**
 * The routes that store a code: asking for one, and using a wrong one, which
 * puts the code back with one more try counted. For signing in, and for
 * changing your email.
 */
const CODE_ROUTES: ReadonlySet<string> = new Set(["/email-otp/send-verification-otp", "/sign-in/email-otp", "/email-otp/request-email-change", "/email-otp/change-email"]);

/** What picking a username may carry, and what signing in with a code may carry. */
const USERNAME_FIELDS: ReadonlySet<string> = new Set(["username"]);
const CODE_SIGN_IN_FIELDS: ReadonlySet<string> = new Set(["email", "otp"]);

/** Refuses a request body unless it holds every one of `fields`, each as text, and no other field. */
function onlyText(body: unknown, fields: ReadonlySet<string>, message: string): void {
  const sent = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const keys = Object.keys(sent);
  if (keys.length !== fields.size || keys.some((key) => !fields.has(key) || typeof sent[key] !== "string")) {
    throw new APIError("BAD_REQUEST", { code: "UNEXPECTED_FIELDS", message });
  }
}

/** What a request to start a Google sign-in may carry: which provider, and where to send the browser afterwards. */
const GOOGLE_START_FIELDS: ReadonlySet<string> = new Set(["provider", "callbackURL", "errorCallbackURL", "newUserCallbackURL"]);

/** Where Google publishes its OpenID Connect endpoints and signing keys. */
export const GOOGLE_DISCOVERY = "https://accounts.google.com/.well-known/openid-configuration";

/** The rules for codes and sessions (architecture §7). */
const CODE_DIGITS = 6;
const CODE_LASTS_SECONDS = 10 * 60;
const WRONG_TRIES_ALLOWED = 5;
const SESSION_LASTS_SECONDS = 30 * 24 * 60 * 60;
const EMAILS_PER_ADDRESS_PER_HOUR = 5;
const HOUR = 60 * 60 * 1000;
/**
 * The first half of the Postgres lock that lets one request at a time count an
 * address's emails; the second half comes from the address's hash. Any number
 * no other lock in the app uses.
 */
const SENT_EMAIL_LOCK = 7001;

const timestamps = { createdAt: "created_at", updatedAt: "updated_at" };

/** The person a request's session belongs to. */
export interface SignedIn {
  id: string;
  /** Null until they pick one. */
  username: string | null;
}

export function createSignIn({ db, clock, ids, origin, secret, email, google }: SignInDependencies & { db: Db; clock: Clock; ids: IdSource }) {
  /** Who is changing their email, by request, from before the change to after it. */
  const changing = new WeakMap<Request, { id: string; email: string }>();
  /** The account a request's session signs in, read before Better Auth answers it. */
  const sessionOf = async (headers: Headers | undefined) => (headers ? await auth.api.getSession({ headers }) : null)?.user ?? null;

  const auth = betterAuth({
    appName: "Steelman",
    baseURL: origin,
    basePath: "/api/auth",
    secret,
    trustedOrigins: [origin],
    // Our Kysely, so Better Auth uses the same pool and our tables.
    database: { db: db as unknown as Kysely<Record<string, never>>, type: "postgres" },
    telemetry: { enabled: false },
    // Without a log of its own, Better Auth would print what went wrong, which can include an address.
    logger: { level: "error", log: (level, message) => console.error(`sign-in ${level}: ${message.replace(/\S+@\S+/g, "<email>")}`) },
    // Our own limit is below, counted per address in Postgres. Better Auth's is per IP, in memory.
    rateLimit: { enabled: false },
    user: { modelName: "account", fields: { emailVerified: "email_verified", ...timestamps } },
    session: {
      modelName: "sign_in.session",
      fields: { userId: "account_id", expiresAt: "expires_at", ...timestamps },
      expiresIn: SESSION_LASTS_SECONDS,
    },
    account: {
      modelName: "sign_in.sign_in_method",
      fields: { userId: "account_id", providerId: "provider", accountId: "provider_subject", ...timestamps },
      // A Google account joins the account with the same email, when both
      // emails are verified (architecture §7): Better Auth's defaults, spelled out.
      accountLinking: { enabled: true, requireLocalEmailVerified: true, updateUserInfoOnLink: false },
      // Google's tokens aren't kept (see the hooks below), so there's nothing to refresh on each sign-in.
      updateAccountOnSignIn: false,
    },
    verification: { modelName: "sign_in.sign_in_code", fields: { expiresAt: "expires_at", ...timestamps } },
    advanced: {
      database: {
        generateId: () => ids.itemId(),
        // Better Auth checks at start that every column it knows of exists, the
        // optional ones included. Ours leave out what Steelman doesn't keep: a
        // session's IP address and browser, and a sign-in method's password and
        // the tokens Google hands out. The tests check the columns it does use.
        validateSchema: false,
      },
      // Not kept: the session table has no place for them (architecture §7, "What we collect").
      ipAddress: { disableIpTracking: true },
      useSecureCookies: origin.startsWith("https://"),
      // Better Auth's own check that a request, and any address it should send
      // the browser to afterwards, is from our site. Better Auth turns it off
      // when NODE_ENV is "test"; on here, so the tests run what's deployed.
      disableOriginCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    databaseHooks: {
      // Better Auth would record the browser's user agent with each session. Steelman doesn't keep it.
      session: {
        create: {
          // Better Auth merges what this returns over the session, so the two are blanked rather than left out.
          before: async (session) => ({ data: { ...session, userAgent: undefined, ipAddress: undefined } }),
        },
      },
      // Better Auth would keep Google's tokens with the sign-in method. Steelman
      // only needs to know who the person is at Google, so it keeps none.
      account: {
        create: { before: async (method) => ({ data: { ...method, ...NO_TOKENS } }) },
        update: { before: async (method) => ({ data: { ...method, ...NO_TOKENS } }) },
      },
      // An address has one sign-in code at a time. Better Auth replaces the old
      // one by trying to add the new one, and on failing, deleting the old and
      // adding again: requests that arrive together can fail twice, and answer
      // with a server error. So on the routes that store a code, it's stored
      // here, in one statement that can't collide, and Better Auth adds nothing.
      verification: {
        create: {
          before: async (code, context) => {
            if (!CODE_ROUTES.has(context?.path ?? "")) return;
            await storeCode(db, ids.itemId(), code);
            return false;
          },
        },
      },
    },
    // Where a Google sign-in that fails sends the browser, with ?error=… added,
    // unless the sign-in page asked for somewhere else.
    onAPIError: { errorURL: `${origin}/` },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Starting a Google sign-in takes only what Steelman's page sends.
        // Better Auth would also take a Google ID token posted by the page
        // (skipping the redirect, whose ID token is bound to this sign-in by
        // its nonce), more Google scopes, and data of the page's own to keep
        // in the database until Google answers.
        if (ctx.path === "/sign-in/social") {
          const fields = Object.keys((ctx.body as Record<string, unknown> | undefined) ?? {});
          if (fields.some((field) => !GOOGLE_START_FIELDS.has(field))) {
            throw new APIError("BAD_REQUEST", { code: "GOOGLE_START_FIELDS", message: "Start a Google sign-in with the provider and where to go afterwards, nothing else." });
          }
        }
        // These two take only what Steelman's pages send, as text (SECURITY.md). Better Auth would also store a
        // name and a picture of any length, and its "picked once" and shape checks skip a username that isn't
        // text: null cleared a picked username, so it could be picked again.
        if (ctx.path === "/update-user") onlyText(ctx.body, USERNAME_FIELDS, "Send the username you picked, as text, and nothing else.");
        if (ctx.path === "/sign-in/email-otp") onlyText(ctx.body, CODE_SIGN_IN_FIELDS, "Send the email address and the code, as text, and nothing else.");
        if (ctx.path === "/email-otp/request-email-change") return beforeEmailChangeCode(ctx.headers, (ctx.body as { newEmail?: unknown } | undefined)?.newEmail);
        if (ctx.path === "/email-otp/change-email") {
          const person = await sessionOf(ctx.headers);
          if (person && ctx.request) changing.set(ctx.request, { id: person.id, email: person.email });
          return;
        }
        if (ctx.path !== "/email-otp/send-verification-otp") return;
        const address = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").toLowerCase();
        if (!(await mayEmail(db, clock, address))) {
          throw new APIError("TOO_MANY_REQUESTS", { code: "TOO_MANY_EMAILS", message: "Too many sign-in emails to this address. Try again in an hour." });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/email-otp/change-email") return;
        const before = ctx.request ? changing.get(ctx.request) : undefined;
        // Only a change that happened: Better Auth answers { success: true }, and the account now has the new email.
        // (A request it refuses before it starts, such as one with no code, isn't one of its own APIErrors.)
        if (!before || (ctx.context.returned as { success?: unknown } | undefined)?.success !== true) return;
        const now = await db.selectFrom("account").select("email").where("id", "=", before.id).executeTakeFirst();
        if (!now?.email || now.email.toLowerCase() === before.email.toLowerCase()) return;
        await afterEmailChanged(before, now.email.toLowerCase());
      }),
    },
    plugins: [
      emailOTP({
        otpLength: CODE_DIGITS,
        expiresIn: CODE_LASTS_SECONDS,
        allowedAttempts: WRONG_TRIES_ALLOWED,
        storeOTP: "hashed",
        // Asking again makes a new code and cancels the old one.
        resendStrategy: "rotate",
        async sendVerificationOTP({ email: to, otp, type }) {
          if (type === "sign-in") await email.sendSignInCode(to, otp);
          if (type === "change-email") await email.sendEmailChangeCode(to, otp);
        },
        // A code to the new address is the check; no recent sign-in is asked for (as Notion, the builder's decision Nov 22).
        changeEmail: { enabled: true, verifyCurrentEmail: false },
      }),
      username({
        minUsernameLength: USERNAME.min,
        maxUsernameLength: USERNAME.max,
        usernameValidator: isAllowedUsername,
        // Kept in lower case, so "Dana_K" and "dana_k" are one name.
        usernameNormalization: (name) => name.toLowerCase(),
        displayUsername: false,
        immutableUsername: true,
      }),
      ...(google ? [googleSignIn(google)] : []),
    ],
  });

  /**
   * Before a code for a new email is sent: the new address's limit of five
   * emails an hour, as for signing in. If another account already uses the
   * address, Better Auth sends no code and still answers that it did, so the
   * form can't be used to find out who has an account; the address is told
   * instead, so its owner isn't left waiting for a code.
   */
  async function beforeEmailChangeCode(headers: Headers | undefined, newEmail: unknown): Promise<void> {
    const person = await sessionOf(headers);
    const address = typeof newEmail === "string" ? newEmail.trim().toLowerCase() : "";
    // Better Auth refuses these itself: signed out, not an address, or the same email.
    if (!person || !address.includes("@") || address === person.email.toLowerCase()) return;
    if (!(await mayEmail(db, clock, address))) {
      throw new APIError("TOO_MANY_REQUESTS", { code: "TOO_MANY_EMAILS", message: "Too many emails to this address. Try again in an hour." });
    }
    // As Better Auth and the unique index compare them, in lower case. A deleted account's email is erased, so it doesn't count.
    const other = await db.selectFrom("account").select("id").where(sql<string>`lower(email)`, "=", address).executeTakeFirst();
    if (other) await email.sendEmailInUse(address);
  }

  /**
   * Once the email has changed: Google signs in only with the new address, so
   * a Google account joined through the old one is let go (it joins again if
   * its email is the new one); and the old address is told, as Notion does.
   */
  async function afterEmailChanged(before: { id: string; email: string }, newEmail: string): Promise<void> {
    // The email has changed either way, so neither failing turns the answer into an error. No address in the log.
    try {
      await db.deleteFrom("sign_in.sign_in_method").where("account_id", "=", before.id).where("provider", "=", "google").execute();
    } catch {
      console.error("sign-in error: couldn't let go of Google after an email change");
    }
    try {
      await email.sendEmailChanged(before.email, newEmail);
    } catch {
      console.error("sign-in error: couldn't send the note to the old address after an email change");
    }
  }

  return {
    /** Answers a request to /api/auth/…, if it is one of SIGN_IN_ROUTES. */
    handle(request: Request): Promise<Response> {
      return auth.handler(request);
    },
    /** Who a request's session cookie signs in, or null. */
    async personFor(headers: Headers): Promise<SignedIn | null> {
      const session = await auth.api.getSession({ headers });
      if (!session) return null;
      return { id: session.user.id, username: (session.user as { username?: string | null }).username ?? null };
    },
  };
}

export type SignIn = ReturnType<typeof createSignIn>;

/** Every token field Better Auth has for a sign-in method, emptied. */
const NO_TOKENS = {
  accessToken: undefined,
  refreshToken: undefined,
  idToken: undefined,
  accessTokenExpiresAt: undefined,
  refreshTokenExpiresAt: undefined,
  scope: undefined,
  password: undefined,
};

/**
 * Google through standard OpenID Connect: its endpoints and keys come from its
 * discovery document, so the tests can point the same code at their stand-in.
 * Better Auth checks the ID token before `getUserInfo` sees it: Google's
 * signature, issuer, our client ID as its audience, its expiry, and the nonce
 * that ties it to this sign-in.
 */
function googleSignIn({ clientId, clientSecret, discoveryUrl = GOOGLE_DISCOVERY }: GoogleClient) {
  return genericOAuth({
    config: [
      {
        providerId: "google",
        name: "Google",
        discoveryUrl,
        clientId,
        clientSecret,
        // Who the person is and their email; not their Google profile.
        scopes: ["openid", "email"],
        pkce: true,
        // Refuse to start if Google's keys can't be found to check the ID token.
        requireIdTokenVerification: true,
        accountSubject: ({ profile }) => String(profile.id),
        async getUserInfo(tokens) {
          const claims = tokens.idToken ? claimsOf(tokens.idToken) : {};
          const identity = acceptGoogleIdentity(claims);
          if (!identity) return null;
          // Steelman keeps no name or picture from Google (architecture §7, "What we collect").
          // emailVerified is Google's own claim, so Better Auth's check before
          // joining accounts stays a second line behind acceptGoogleIdentity.
          return { id: identity.sub, email: identity.email, emailVerified: claims.email_verified === true, name: "", image: undefined };
        },
      },
    ],
  });
}

/** The claims in an ID token. Only after Better Auth has checked its signature. */
function claimsOf(idToken: string): Record<string, unknown> {
  try {
    const claims: unknown = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Whether Steelman accepts the person Google's ID token describes, and if so
 * who they are: Google's ID for them (`sub`) and their email. Null refuses the
 * sign-in, and Better Auth sends the browser back with an error.
 */
export function acceptGoogleIdentity(claims: Record<string, unknown>): { sub: string; email: string } | null {
  const { sub, email, email_verified: verified } = claims;
  // Only an email Google has verified (architecture §7). Strictly `true`: a
  // claim that is missing, false, or anything else refuses.
  if (verified !== true) return null;
  // `sub` is who the person is at Google, for good; the email can change.
  if (typeof sub !== "string" || sub === "" || typeof email !== "string" || !email.includes("@")) return null;
  return { sub, email };
}

/**
 * Counts this sign-in email against its address's limit, or says the limit is reached.
 *
 * Counting and adding happen while holding a lock on the address, so requests
 * that arrive together, at any copy of the service, take their turns: without
 * it, each could count four and all be sent (M2-6a). The lock is Postgres's,
 * held until the transaction ends, so it's shared by every copy and can't be
 * left behind. Other addresses almost always take other locks, so they rarely wait.
 */
async function mayEmail(db: Db, clock: Clock, address: string): Promise<boolean> {
  const addressHash = createHash("sha256").update(address).digest("hex");
  const now = clock.now();
  return db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(${SENT_EMAIL_LOCK}, hashtext(${addressHash}))`.execute(trx);
    const { sent } = await trx
      .selectFrom("sign_in.sent_email")
      .select((eb) => eb.fn.countAll<string>().as("sent"))
      .where("address_hash", "=", addressHash)
      .where("sent_at", ">", new Date(now.getTime() - HOUR))
      .executeTakeFirstOrThrow();
    if (Number(sent) >= EMAILS_PER_ADDRESS_PER_HOUR) return false;
    await trx.insertInto("sign_in.sent_email").values({ address_hash: addressHash, sent_at: now }).execute();
    return true;
  });
}

/**
 * Stores a sign-in code in place of the address's old one, if any, in one
 * statement, so codes stored at the same moment can't collide. Of two codes,
 * the one that expires later stays: a new code replaces the old, and a code put
 * back after a wrong try doesn't replace a newer one sent meanwhile. Two that
 * expire at the same millisecond (only codes sent at the same moment) go to the
 * last stored.
 */
async function storeCode(db: Db, id: string, code: { identifier: string; value: string; expiresAt: Date; createdAt: Date; updatedAt: Date }): Promise<void> {
  await db
    .insertInto("sign_in.sign_in_code")
    .values({ id, identifier: code.identifier, value: code.value, expires_at: code.expiresAt, created_at: code.createdAt, updated_at: code.updatedAt })
    .onConflict((conflict) =>
      conflict
        .column("identifier")
        .doUpdateSet((eb) => ({
          id: eb.ref("excluded.id"),
          value: eb.ref("excluded.value"),
          expires_at: eb.ref("excluded.expires_at"),
          created_at: eb.ref("excluded.created_at"),
          updated_at: eb.ref("excluded.updated_at"),
        }))
        .where(sql<boolean>`excluded.expires_at >= sign_in_code.expires_at`),
    )
    .execute();
}
