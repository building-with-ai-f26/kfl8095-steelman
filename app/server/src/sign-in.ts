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
  // Google: the browser asks to start, and Google sends it back here.
  "POST /sign-in/social",
  "GET /callback/google",
]);

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

const timestamps = { createdAt: "created_at", updatedAt: "updated_at" };

/** The person a request's session belongs to. */
export interface SignedIn {
  id: string;
  /** Null until they pick one. */
  username: string | null;
}

export function createSignIn({ db, clock, ids, origin, secret, email, google }: SignInDependencies & { db: Db; clock: Clock; ids: IdSource }) {
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
        if (ctx.path !== "/email-otp/send-verification-otp") return;
        const address = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").toLowerCase();
        if (!(await mayEmail(db, clock, address))) {
          throw new APIError("TOO_MANY_REQUESTS", { code: "TOO_MANY_EMAILS", message: "Too many sign-in emails to this address. Try again in an hour." });
        }
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
        },
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

/** Counts this sign-in email against its address's limit, or says the limit is reached. */
async function mayEmail(db: Db, clock: Clock, address: string): Promise<boolean> {
  const addressHash = createHash("sha256").update(address).digest("hex");
  const now = clock.now();
  const { sent } = await db
    .selectFrom("sign_in.sent_email")
    .select((eb) => eb.fn.countAll<string>().as("sent"))
    .where("address_hash", "=", addressHash)
    .where("sent_at", ">", new Date(now.getTime() - HOUR))
    .executeTakeFirstOrThrow();
  if (Number(sent) >= EMAILS_PER_ADDRESS_PER_HOUR) return false;
  await db.insertInto("sign_in.sent_email").values({ address_hash: addressHash, sent_at: now }).execute();
  return true;
}
