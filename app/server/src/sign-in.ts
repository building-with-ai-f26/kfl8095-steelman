// Signing in (L-01; plans/architecture.md §7, decision 004), through Better
// Auth: a 6-digit code emailed to the person and typed into the page that
// asked for it; a session cookie; and a username picked once, after the first
// sign-in. Google joins in M1-3.
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
import { emailOTP, username } from "better-auth/plugins";
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
}

/** The Better Auth routes the service passes on, by method and path under /api/auth. */
export const SIGN_IN_ROUTES: ReadonlySet<string> = new Set([
  "POST /email-otp/send-verification-otp",
  "POST /sign-in/email-otp",
  "POST /update-user",
  "GET /get-session",
  "POST /sign-out",
]);

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

export function createSignIn({ db, clock, ids, origin, secret, email }: SignInDependencies & { db: Db; clock: Clock; ids: IdSource }) {
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
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
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
