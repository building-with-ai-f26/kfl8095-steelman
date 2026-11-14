// Starts the real service with sign-in turned on, against a test database:
// emails are kept in memory instead of sent, and the test acts like a browser
// on our own site (it keeps the session cookie and sends our Origin).
//
// Better Auth reads the system clock itself, and can't be handed ours
// (plans/architecture.md §8). So while these tests run, the system's Date is
// Vitest's fake one, and moving the test clock moves both together: "ten
// minutes later" still takes no time at all.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, vi } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import type { FakeClock } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import type { Mode } from "../../src/app.ts";
import { createDatabase } from "../../src/db/database.ts";
import { NOON } from "./board.ts";
import type { TestDatabase } from "./database.ts";
import { startFakeGoogle } from "./fake-google.ts";
import type { FakeGoogle, GoogleAccount } from "./fake-google.ts";

/** The site the tests pretend to be. https, so cookies are marked Secure as they are when deployed. */
export const ORIGIN = "https://steelman.test";

export interface Sent {
  to: string;
  code: string;
}

export interface Request {
  /** The session cookie to send, as `name=value`. */
  cookie?: string;
  /** The Origin header to send; our own unless a test says otherwise, or null for none. */
  origin?: string | null;
  body?: unknown;
}

export interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  /** Every Set-Cookie header in the answer. */
  setCookies: string[];
  /** The session cookie the answer set, as `name=value`, if it set one. */
  cookie: string | undefined;
  /** Where a redirect sends the browser. */
  location: string | undefined;
}

/** A Google sign-in, step by step, as a browser goes through it. */
export interface GoogleSignIn {
  /** The answer to asking the service to start signing in with Google. */
  started: Answer;
  /** Every cookie the browser holds by the end, as one Cookie header. */
  cookies: string;
  /** Where Google sent the browser back to (path and query), and the cookies the browser sent with it. */
  back: { url: string; cookies: string } | undefined;
  /** The service's answer when Google sends the browser back, if it got that far. */
  finished: Answer | undefined;
  /** The session cookie it ended with, if any. */
  cookie: string | undefined;
}

export interface SignInApi {
  readonly clock: FakeClock;
  readonly app: FastifyInstance;
  /** Every email the service has sent, oldest first. */
  readonly outbox: Sent[];
  request(method: "GET" | "POST" | "PUT" | "DELETE", url: string, request?: Request): Promise<Answer>;
  /** Asks for a sign-in code to be emailed. */
  requestCode(email: string, request?: Request): Promise<Answer>;
  /** The latest code emailed to an address. */
  codeFor(email: string): string;
  /** Signs in with a code (by default the latest one sent). */
  signIn(email: string, code?: string): Promise<Answer>;
  /** Asks for a code, signs in, and picks a username if given. Returns the session cookie. */
  signedIn(email: string, username?: string): Promise<string>;
  /** The stand-in for Google, when the file asked for one. */
  readonly google: FakeGoogle;
  /**
   * Signs in with Google as a browser would: asks the service to start, follows
   * it to the stand-in (signed in there as `account`), and follows the stand-in
   * back. `finishWith` replaces the cookies the browser sends on the way back.
   */
  signInWithGoogle(account: GoogleAccount, options?: { callbackURL?: string; cookie?: string; finishWith?: (cookies: string) => string }): Promise<GoogleSignIn>;
}

/** Joins the `name=value` parts of Set-Cookie headers onto a Cookie header, the later winning. */
export function withCookies(cookie: string | undefined, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of (cookie ?? "").split(/;\s*/).filter(Boolean)) jar.set(part.split("=")[0]!, part);
  for (const header of setCookies) {
    const part = header.split(";")[0]!;
    const [name, value] = [part.split("=")[0]!, part.slice(part.indexOf("=") + 1)];
    if (value === "" || /Max-Age=0\b/i.test(header)) jar.delete(name);
    else jar.set(name, part);
  }
  return [...jar.values()].join("; ");
}

/** Call once at the top of a test file, after `useTestDatabase`. */
export function useSignIn(db: TestDatabase, options: { mode?: Mode; seed?: number; google?: boolean } = {}): SignInApi {
  const clock = createFakeClock(new Date(NOON));
  const move = { advance: clock.advance, set: clock.set };
  clock.advance = (milliseconds) => {
    move.advance(milliseconds);
    vi.setSystemTime(clock.now());
  };
  clock.set = (time) => {
    move.set(time);
    vi.setSystemTime(clock.now());
  };

  const outbox: Sent[] = [];
  let app: FastifyInstance | undefined;
  let google: FakeGoogle | undefined;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: clock.now() });
    if (options.google) google = await startFakeGoogle({ now: () => clock.now() });
    app = buildApp({
      clock,
      ids: createSeededIds(options.seed ?? 1),
      database: createDatabase(db.url),
      mode: options.mode ?? "test",
      signIn: {
        origin: ORIGIN,
        // Not a secret: it signs cookies in a throwaway test database only.
        secret: "test-only-signing-key-not-a-secret-0000000000",
        email: { sendSignInCode: async (to, code) => void outbox.push({ to, code }) },
        ...(google ? { google: { clientId: google.clientId, clientSecret: google.clientSecret, discoveryUrl: google.discoveryUrl } } : {}),
      },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await google?.close();
    vi.useRealTimers();
  });

  const running = () => {
    if (!app) throw new Error("The app exists only while the file's tests are running");
    return app;
  };

  const request: SignInApi["request"] = async (method, url, { cookie, origin = ORIGIN, body } = {}) => {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (origin !== null) headers.origin = origin;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await running().inject({ method, url, headers, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) });
    const raw = response.headers["set-cookie"];
    const setCookies = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    const session = setCookies.find((header) => /session_token=[^;]+/.test(header));
    let parsed: unknown;
    try {
      parsed = response.body ? response.json() : undefined;
    } catch {
      parsed = response.body;
    }
    const location = response.headers.location;
    return { status: response.statusCode, body: parsed, setCookies, cookie: session?.split(";")[0], location: typeof location === "string" ? location : undefined };
  };

  const codeFor = (email: string) => {
    const sent = outbox.filter((message) => message.to === email.toLowerCase()).at(-1);
    if (!sent) throw new Error(`No code was emailed to ${email}`);
    return sent.code;
  };

  const requestCode: SignInApi["requestCode"] = (email, extra) => request("POST", "/api/auth/email-otp/send-verification-otp", { ...extra, body: { email, type: "sign-in" } });
  const signIn: SignInApi["signIn"] = (email, code) => request("POST", "/api/auth/sign-in/email-otp", { body: { email, otp: code ?? codeFor(email) } });

  const signInWithGoogle: SignInApi["signInWithGoogle"] = async (account, { callbackURL = `${ORIGIN}/`, cookie, finishWith = (cookies: string) => cookies } = {}) => {
    const fake = google;
    if (!fake) throw new Error("Pass { google: true } to useSignIn to sign in with the stand-in for Google");
    const started = await request("POST", "/api/auth/sign-in/social", { cookie, body: { provider: "google", callbackURL } });
    let cookies = withCookies(cookie, started.setCookies);
    const url = typeof started.body?.url === "string" ? started.body.url : undefined;
    if (started.status !== 200 || !url) return { started, cookies, back: undefined, finished: undefined, cookie: undefined };

    // The browser goes to Google, where this person is signed in and agrees.
    fake.signedInAs(account);
    const atGoogle = await fetch(url, { redirect: "manual" });
    const back = atGoogle.headers.get("location");
    if (atGoogle.status !== 302 || !back) throw new Error(`The stand-in for Google refused: ${atGoogle.status} ${await atGoogle.text()}`);

    // And comes back to us: a top-level navigation from Google's site, so no Origin header.
    const backTo = new URL(back);
    const sent = { url: `${backTo.pathname}${backTo.search}`, cookies: finishWith(cookies) };
    const finished = await request("GET", sent.url, { cookie: sent.cookies, origin: null });
    cookies = withCookies(sent.cookies, finished.setCookies);
    return { started, cookies, back: sent, finished, cookie: finished.cookie };
  };

  return {
    clock,
    get app() {
      return running();
    },
    get google() {
      if (!google) throw new Error("Pass { google: true } to useSignIn to get the stand-in for Google");
      return google;
    },
    signInWithGoogle,
    outbox,
    request,
    requestCode,
    codeFor,
    signIn,
    async signedIn(email, username) {
      const asked = await requestCode(email);
      if (asked.status !== 200) throw new Error(`Asking for a code failed: ${asked.status} ${JSON.stringify(asked.body)}`);
      const signedIn = await signIn(email);
      if (!signedIn.cookie) throw new Error(`Signing in failed: ${signedIn.status} ${JSON.stringify(signedIn.body)}`);
      if (username !== undefined) {
        const named = await request("POST", "/api/auth/update-user", { cookie: signedIn.cookie, body: { username } });
        if (named.status !== 200) throw new Error(`Choosing a username failed: ${named.status} ${JSON.stringify(named.body)}`);
      }
      return signedIn.cookie;
    },
  };
}
