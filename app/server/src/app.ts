import Fastify, { LogController } from "fastify";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  accessInput,
  reportInput,
  hideInput,
  memberRoleInput,
  assessmentInput,
  can,
  deleteAccountInput,
  posthogAssetsHost,
  changesQuery,
  editInput,
  newArgumentInput,
  newOptionInput,
  renameOptionInput,
  newBoardInput,
  newSourceInput,
  newWordingInput,
  sourceInput,
  voteInput,
  tooManyMessage,
  combineInput,
  itemIdInput,
  separateInput,
} from "@steelman/shared";
import type { Clock, IdSource, PublicConfig, RefusalReason, Role } from "@steelman/shared";
import { createEvents } from "./events.ts";
import type { ServerEvent } from "./events.ts";
import { accessOf, entryTo, joinByLink } from "./access.ts";
import { accountSummary, deleteAccount, exportData, markTourSeen, tourSeen } from "./account.ts";
import { serveWebApp } from "./web.ts";
import { createBoard } from "./boards.ts";
import { LIMITS, createLimiter } from "./limits.ts";
import type { LimitName, Limits } from "./limits.ts";
import type { Db } from "./db/database.ts";
import { SIGN_IN_ROUTES, createSignIn } from "./sign-in.ts";
import type { SignInDependencies } from "./sign-in.ts";
import { publishOrderIfDue } from "./order.ts";
import { listBoards } from "./list.ts";
import { readChanges, readSnapshot } from "./read.ts";
import { listPeople, setAccess, setRole } from "./sharing.ts";
import { setReport, withdrawReport } from "./reports.ts";
import { hideWording, restoreWording } from "./moderation.ts";
import { addOption, deleteOption, renameOption, restoreOption } from "./options.ts";
import { readHistory } from "./history.ts";
import { combinePreview, combineWording, separateWording, undoStructure } from "./structure.ts";
import { addSource, citeSource, clearUnavailable, editSource, reportUnavailable, unciteSource } from "./sources.ts";
import { setArticulation, setAssessment, setImportance } from "./votes.ts";
import { addArgument, addWording, deleteWording, editWording } from "./writing.ts";
import type { WriteResult } from "./write-path.ts";

/**
 * - production: what a deployed service runs as. The test-user switch is off.
 * - development: `npm run dev`. Anyone can act as any account, by picking it.
 * - test: the automated tests; behaves like development.
 *
 * Anything that isn't explicitly development or test is production, so a
 * deployment that forgets to say which can't turn the switch on.
 */
export type Mode = "production" | "development" | "test";

/** What the service is handed when it starts. Tests hand in stand-ins. */
export interface AppDependencies {
  clock: Clock;
  ids: IdSource;
  /** The database. Without one, only the health route exists. */
  database?: Db;
  mode?: Mode;
  /** Signing in (M1). Without it, only the test-user switch says who is asking. */
  signIn?: SignInDependencies;
  /** PostHog's project key and address, for the browser (M-08). Without it, the web app sends no analytics. */
  analytics?: NonNullable<PublicConfig["analytics"]>;
  /** The built web app's folder, to serve it from the same address as the API (M1-14a). Without it, the service serves only the API. */
  webDirectory?: string;
  /** Where to write one JSON line per request, as Cloud Logging reads them (M1-14a). Without it, nothing is logged. */
  logs?: NodeJS.WritableStream;
  /**
   * Behind Cloud Run's front end, which appends the caller's address to
   * X-Forwarded-For: the last entry is the caller's (one proxy hop is trusted).
   * Without it, the connection's own address, and the header is ignored.
   */
  behindProxy?: boolean;
  /** The rate limits (architecture §7); the class trial's unless a test sets its own. */
  limits?: Limits;
  /** Where server events go (M2-12). Only the tests change it; otherwise they're posted to PostHog when there's a key. */
  sendEvent?: (event: ServerEvent) => Promise<void>;
}

/**
 * The Content Security Policy (M-07, architecture §7): the page may load only
 * from its own site, Google Fonts, and, when the service has a key, PostHog.
 * A script from anywhere else is refused, and no other site may frame the app.
 * Inline styles are allowed: React's `style` attributes and the prototype's
 * stylesheet need them; inline scripts are not.
 */
export function contentSecurityPolicy(analytics: PublicConfig["analytics"] | undefined): string {
  const posthog = analytics ? [...new Set([analytics.host, posthogAssetsHost(analytics.host)])] : [];
  const scripts = analytics ? [posthogAssetsHost(analytics.host)] : [];
  return [
    "default-src 'self'",
    `script-src ${["'self'", ...scripts].join(" ")}`,
    `connect-src ${["'self'", ...posthog].join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

/** Fastify's logger, writing what Cloud Logging reads: a JSON line with `severity` and `message`, and no host or process ID. */
function cloudLogging(stream: NodeJS.WritableStream, clock: Clock) {
  return {
    stream,
    level: "info",
    messageKey: "message",
    base: undefined,
    timestamp: () => `,"time":"${clock.now().toISOString()}"`,
    formatters: { level: (label: string) => ({ severity: label.toUpperCase() }) },
  };
}

/** The header the browser uses to say which test account it is acting as, while there is no sign-in (M0). */
const TEST_USER_HEADER = "x-steelman-test-user";

const STATUS_FOR: Record<RefusalReason, number> = {
  signed_out: 401,
  no_access: 403,
  not_allowed: 403,
  test_users_off: 403,
  not_author: 403,
  board_closed: 409,
  argument_deleted: 409,
  not_same_option: 409,
  only_wording: 409,
  combined_since: 409,
  cant_undo: 409,
  option_deleted: 409,
  option_not_empty: 409,
  too_few_options: 409,
  too_many_options: 409,
  option_name_taken: 409,
  version_deleted: 409,
  revision_changed: 409,
  needs_evidence: 409,
  id_taken: 409,
  needs_username: 403,
  wrong_origin: 403,
  too_many: 429,
};

/** The most bytes a request to sign-in's routes may send. */
const SIGN_IN_BODY_MOST = 16 * 1024;

/** Requests that only read. Anything else is a write, and must come from our own site. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

declare module "fastify" {
  interface FastifyRequest {
    /** The account acting, or null when signed out. */
    person: string | null;
  }
  interface FastifyContextConfig {
    /** The rate limit a signed-in person's request to this route counts against (architecture §7). */
    limit?: LimitName;
  }
}

/**
 * Builds the Steelman service without starting it, so tests can call its
 * routes directly and main.ts can listen on a port.
 */
export function buildApp({ clock, ids, database, mode = "production", signIn: signInDependencies, analytics, webDirectory, logs, behindProxy = false, limits = LIMITS, sendEvent }: AppDependencies): FastifyInstance {
  // Fastify's own per-request lines are off (they hold the address and the IP); ours are below.
  const app = Fastify({ logger: logs ? cloudLogging(logs, clock) : false, logController: new LogController({ disableRequestLogging: true }) });
  if (logs) {
    // One line per request: its route (the pattern, so no board or version ID: a board's link is what lets
    // people in), how it ended, how long it took. Never the address itself, a query string, or a body, which can
    // hold an email or a sign-in token: logs aren't reached by account deletion (architecture §6).
    const routeOf = (request: FastifyRequest) => request.routeOptions.url ?? "unmatched";
    app.addHook("onResponse", async (request, reply) => {
      request.log.info({ method: request.method, route: routeOf(request), status: reply.statusCode, durationMs: Math.round(reply.elapsedTime) }, "request");
    });
    // A failure is logged with its stack as the message, which is how Error Reporting groups them, and nothing
    // else of the error: a database error's details can quote a value, such as an email. The answer is Fastify's own.
    app.setErrorHandler(async (error: FastifyError, request, reply) => {
      if ((error.statusCode ?? 500) >= 500) request.log.error({ method: request.method, route: routeOf(request) }, error.stack ?? String(error));
      return reply.send(error);
    });
  }
  const policy = contentSecurityPolicy(analytics);
  const saved = createEvents(analytics, sendEvent);
  app.addHook("onSend", async (_request, reply) => {
    reply.header("content-security-policy", policy);
    reply.header("x-content-type-options", "nosniff");
  });

  app.get("/api/health", () => ({ status: "ok", time: clock.now().toISOString() }));

  // What the web app needs to know before it draws anything. The PostHog key is public (it can only send events),
  // but it comes from the service's settings so one build of the web app runs anywhere, with analytics or without.
  app.get("/api/config", (): PublicConfig => ({ analytics: analytics ?? null }));

  if (webDirectory) serveWebApp(app, webDirectory);

  if (!database) return app;
  const db = database;
  const services = { db, clock };
  const testUsersOn = mode === "development" || mode === "test";
  app.addHook("onClose", () => db.destroy());

  const signIn = signInDependencies && createSignIn({ ...signInDependencies, db, clock, ids });

  // Who is asking: the test-user switch (development and tests only), or the
  // session cookie. Sign-in's own routes answer that for themselves.
  app.decorateRequest("person", null);
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/api/auth/")) return;
    const named = request.headers[TEST_USER_HEADER];
    if (named !== undefined) {
      if (!testUsersOn) return reply.code(403).send({ status: "refused", reason: "test_users_off" });
      const account = typeof named === "string" ? await db.selectFrom("account").select("id").where("id", "=", named).executeTakeFirst() : undefined;
      request.person = account?.id ?? null;
      return;
    }
    if (!signIn) return;
    const person = await signIn.personFor(headersOf(request.headers));
    if (!person) return;
    if (!READS.has(request.method)) {
      // A browser sends the cookie with a request from any site; only our own site may write with it (architecture §7).
      if (request.headers.origin !== signInDependencies.origin) return reply.code(403).send({ status: "refused", reason: "wrong_origin" });
      if (person.username === null) return reply.code(403).send({ status: "refused", reason: "needs_username" });
    }
    request.person = person.id;
  });

  // Rate limits (M2-6, architecture §7): a signed-in person's request to a route that names a limit counts
  // against it; over it, nothing is done. It's counted on arriving, so requests sent together can't all slip
  // under, and given back if it saved nothing (invalid, or refused). A signed-out request is refused by the
  // route itself, uncounted.
  const limiter = createLimiter(clock, limits);
  app.addHook("preHandler", async (request, reply) => {
    const limit = request.routeOptions.config.limit;
    if (!limit || request.person === null) return;
    const wait = limiter.take(limit, request.person);
    if (wait !== null) return reply.code(429).header("retry-after", String(wait)).send({ status: "refused", reason: "too_many", retryAfter: wait });
    counted.add(request);
  });
  const counted = new WeakSet<FastifyRequest>();
  app.addHook("onResponse", async (request, reply) => {
    const limit = request.routeOptions.config.limit;
    if (limit && request.person !== null && counted.has(request) && reply.statusCode !== 200) limiter.giveBack(limit, request.person);
  });

  if (signIn) {
    app.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      // A sign-in request is an address, a code, a username, or where to go next. The default, a megabyte, only
      // gives a stranger room to send something slow to handle (SECURITY.md).
      bodyLimit: SIGN_IN_BODY_MOST,
      async handler(request, reply) {
        const url = new URL(request.url, signInDependencies.origin);
        const route = `${request.method} ${url.pathname.slice("/api/auth".length)}`;
        if (!SIGN_IN_ROUTES.has(route)) return reply.code(404).send({ reason: "not_found" });
        // Codes to any address from one network address (architecture §7), for signing in and for a new email;
        // the per-address limit is sign-in's own.
        if (route === "POST /email-otp/send-verification-otp" || route === "POST /email-otp/request-email-change") {
          const wait = limiter.take("signInCode", callerNetwork(request, behindProxy));
          if (wait !== null) {
            return reply.code(429).header("retry-after", String(wait)).send({ code: "TOO_MANY_REQUESTS", message: tooManyMessage(wait), retryAfter: wait });
          }
        }
        const response = await signIn.handle(
          new Request(url, {
            method: request.method,
            headers: headersOf(request.headers),
            ...(request.method === "GET" ? {} : { body: JSON.stringify(request.body ?? {}) }),
          }),
        );
        reply.code(response.status);
        response.headers.forEach((value, name) => {
          if (name !== "set-cookie") reply.header(name, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) reply.header("set-cookie", cookies);
        return reply.send(await response.text());
      },
    });
  }

  if (testUsersOn) {
    app.get("/api/test-users", async () => ({
      users: await db.selectFrom("account").select(["id", "username"]).where("deleted_at", "is", null).orderBy("username").execute(),
    }));
  }

  // Your account (M-07): who you are, Download your data, and Delete account.
  app.get("/api/account", async (request, reply) => {
    const summary = request.person === null ? null : await accountSummary(db, request.person);
    return summary ?? reply.code(401).send({ status: "refused", reason: "signed_out" });
  });

  app.get("/api/account/data", async (request, reply) => {
    const data = request.person === null ? null : await exportData(db, clock, request.person);
    if (!data) return reply.code(401).send({ status: "refused", reason: "signed_out" });
    return reply.header("content-disposition", 'attachment; filename="steelman-data.json"').send(data);
  });

  // The tour (L-02): whether this account has been shown it, and, when the board shows it, saying so.
  app.get("/api/account/tour", async (request, reply) => {
    const seen = request.person === null ? null : await tourSeen(db, request.person);
    return seen === null ? reply.code(401).send({ status: "refused", reason: "signed_out" }) : { seen };
  });

  app.put("/api/account/tour", async (request, reply) => {
    if (request.person === null || !(await markTourSeen(db, clock, request.person))) return reply.code(401).send({ status: "refused", reason: "signed_out" });
    return { status: "done" };
  });

  app.post("/api/account/delete", async (request, reply) => {
    if (request.person === null) return reply.code(401).send({ status: "refused", reason: "signed_out" });
    const body = deleteAccountInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    const outcome = await deleteAccount(db, clock, request.person, body.data.username);
    if (outcome === "wrong_username") return reply.code(400).send({ status: "refused", reason: "wrong_username" });
    if (outcome === "not_found") return reply.code(401).send({ status: "refused", reason: "signed_out" });
    return { status: "done" };
  });

  // The list (E-03): the boards you're a member of, most recently changed first.
  app.get("/api/boards", async (request, reply) => {
    if (request.person === null) return reply.code(401).send({ status: "refused", reason: "signed_out" });
    return listBoards(db, clock, request.person);
  });

  // A new board (F-01). Anyone signed in may make one; they become its Owner.
  app.post("/api/boards", { config: { limit: "board" } }, async (request, reply) => {
    if (request.person === null) return reply.code(401).send({ status: "refused", reason: "signed_out" });
    const body = newBoardInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return { status: "done", board: await createBoard(db, clock, ids, request.person, body.data) };
  });

  /**
   * Lets a reader in and returns their role, or answers why not and returns
   * null. Someone getting in by the link for the first time is recorded as a
   * member (Q7).
   */
  async function letIn(boardId: string, person: string | null, reply: FastifyReply): Promise<Role | null> {
    const board = await db.selectFrom("board").select("closed_at").where("id", "=", boardId).where("deleted_at", "is", null).executeTakeFirst();
    if (!board) {
      void reply.code(404).send({ reason: "not_found" });
      return null;
    }
    const entry = await entryTo(db, boardId, person);
    // Someone coming by the link is recorded as they open it, which checks the link again (joinByLink).
    const role = entry.joiningByLink ? await joinByLink(db, clock, boardId, person!) : entry.role;
    const reason = can(person, role, "read", { closed: board.closed_at !== null });
    if (reason) {
      void reply.code(STATUS_FOR[reason]).send({ status: "refused", reason });
      return null;
    }
    return role;
  }

  app.get<{ Params: { board: string } }>("/api/boards/:board", async (request, reply) => {
    const role = await letIn(request.params.board, request.person, reply);
    if (!role) return reply;
    await publishOrderIfDue(db, clock, request.params.board);
    const snapshot = await readSnapshot(db, request.params.board, request.person, moderates(role));
    const access = await accessOf(db, request.params.board);
    return snapshot && access ? { ...snapshot, access, role } : reply.code(404).send({ reason: "not_found" });
  });

  app.get<{ Params: { board: string } }>("/api/boards/:board/changes", async (request, reply) => {
    const query = changesQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ reason: "invalid", issues: query.error.issues });
    const role = await letIn(request.params.board, request.person, reply);
    if (!role) return reply;
    await publishOrderIfDue(db, clock, request.params.board);
    const changes = await readChanges(db, request.params.board, request.person, query.data.after, moderates(role));
    const access = await accessOf(db, request.params.board);
    return changes && access ? { ...changes, access, role } : reply.code(404).send({ reason: "not_found" });
  });

  app.put<{ Params: { board: string } }>("/api/boards/:board/access", async (request, reply) => {
    const body = accessInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setAccess(services, request.params.board, request.person, body.data));
  });

  // Report (M2-3): anyone who can read reports a wording, or withdraws their report.
  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/report", { config: { limit: "report" } }, async (request, reply) => {
    const body = reportInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setReport(services, request.params.board, request.person, request.params.id, body.data));
  });

  app.delete<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/report", async (request, reply) =>
    answer(reply, await withdrawReport(services, request.params.board, request.person, request.params.id)),
  );

  // Hide and restore (M2-4): an Editor or the Owner.
  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/hidden", async (request, reply) => {
    const body = hideInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await hideWording(services, request.params.board, request.person, request.params.id, body.data.reason));
  });

  app.delete<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/hidden", async (request, reply) =>
    answer(reply, await restoreWording(services, request.params.board, request.person, request.params.id)),
  );

  // Share's people list (M2-2b): anyone who can read sees it; only the owner sets roles.
  app.get<{ Params: { board: string } }>("/api/boards/:board/people", async (request, reply) => {
    const role = await letIn(request.params.board, request.person, reply);
    if (!role) return reply;
    return { people: await listPeople(db, request.params.board) };
  });

  app.put<{ Params: { board: string; account: string } }>("/api/boards/:board/people/:account", async (request, reply) => {
    const body = memberRoleInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setRole(services, request.params.board, request.person, request.params.account, body.data.role));
  });

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/arguments/:id/importance", { config: { limit: "voting" } }, async (request, reply) => {
    const body = voteInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setImportance(services, request.params.board, request.person, request.params.id, body.data.value), () => saved(request, "vote_importance"));
  });

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/articulation", { config: { limit: "voting" } }, async (request, reply) => {
    const body = voteInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setArticulation(services, request.params.board, request.person, request.params.id, body.data.value), () => saved(request, "vote_articulation"));
  });

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/assessment", { config: { limit: "voting" } }, async (request, reply) => {
    const body = assessmentInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setAssessment(services, request.params.board, request.person, request.params.id, body.data), () => saved(request, "assess"));
  });

  // "Can't open it?" (M3a-3, C-02): anyone who can read reports a source; the reporter, an Editor, or the Owner clears it.
  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/sources/:id/unavailable", { config: { limit: "writing" } }, async (request, reply) =>
    answer(reply, await reportUnavailable(services, request.params.board, request.person, request.params.id)),
  );

  app.delete<{ Params: { board: string; id: string } }>("/api/boards/:board/sources/:id/unavailable", async (request, reply) =>
    answer(reply, await clearUnavailable(services, request.params.board, request.person, request.params.id)),
  );

  // Options (M3a-2, A-07): add one at the end, rename one, or delete an empty one. An Editor's and the Owner's.
  app.post<{ Params: { board: string } }>("/api/boards/:board/options", { config: { limit: "writing" } }, async (request, reply) => {
    const body = newOptionInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await addOption(services, request.params.board, request.person, body.data));
  });

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/options/:id", { config: { limit: "writing" } }, async (request, reply) => {
    const body = renameOptionInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await renameOption(services, request.params.board, request.person, request.params.id, body.data.name));
  });

  app.delete<{ Params: { board: string; id: string } }>("/api/boards/:board/options/:id", async (request, reply) =>
    answer(reply, await deleteOption(services, request.params.board, request.person, request.params.id)),
  );

  // Restoring undoes a delete, so like Undo it isn't counted toward the writing limit (architecture §7).
  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/options/:id/restore", async (request, reply) =>
    answer(reply, await restoreOption(services, request.params.board, request.person, request.params.id)),
  );

  // Combine and separate (M3a-6, A-10), and undoing either by its change number: an Editor's and the Owner's.
  app.post<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/combine", { config: { limit: "writing" } }, async (request, reply) => {
    const body = combineInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await combineWording(services, request.params.board, request.person, request.params.id, body.data.into));
  });

  // What a combine would do, for the dialog before it (M3a-7): read by whoever may combine.
  app.get<{ Params: { board: string; id: string }; Querystring: { into?: string } }>("/api/boards/:board/versions/:id/combine", async (request, reply) => {
    const role = await letIn(request.params.board, request.person, reply);
    if (!role) return reply;
    const refused = can(request.person, role, "structure", { closed: false });
    if (refused) return reply.code(STATUS_FOR[refused]).send({ status: "refused", reason: refused });
    const into = itemIdInput.safeParse(request.query.into);
    if (!into.success) return reply.code(400).send({ reason: "invalid" });
    const preview = await combinePreview(db, request.params.board, request.person, request.params.id, into.data);
    return preview ?? reply.code(404).send({ reason: "not_found" });
  });

  app.post<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/separate", { config: { limit: "writing" } }, async (request, reply) => {
    const body = separateInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await separateWording(services, request.params.board, request.person, request.params.id, body.data.argumentId));
  });

  // Not counted toward the writing limit: undoing never is (architecture §7), so a way back is always there.
  app.put<{ Params: { board: string; seq: string } }>("/api/boards/:board/changes/:seq/undo", async (request, reply) => {
    const seq = Number(request.params.seq);
    if (!Number.isSafeInteger(seq) || seq < 1) return reply.code(400).send({ reason: "invalid" });
    return answer(reply, await undoStructure(services, request.params.board, request.person, seq));
  });

  // History (M3a-4, J-03): the change log read back, for anyone who can read the board.
  app.get<{ Params: { board: string } }>("/api/boards/:board/history", async (request, reply) => {
    const role = await letIn(request.params.board, request.person, reply);
    if (!role) return reply;
    return { entries: await readHistory(db, request.params.board) };
  });

  app.post<{ Params: { board: string } }>("/api/boards/:board/arguments", { config: { limit: "writing" } }, async (request, reply) => {
    const body = newArgumentInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await addArgument(services, request.params.board, request.person, body.data), () => saved(request, "write_argument"));
  });

  app.post<{ Params: { board: string; id: string } }>("/api/boards/:board/arguments/:id/versions", { config: { limit: "writing" } }, async (request, reply) => {
    const body = newWordingInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await addWording(services, request.params.board, request.person, request.params.id, body.data), () => saved(request, "write_wording"));
  });

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id", { config: { limit: "writing" } }, async (request, reply) => {
    const body = editInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await editWording(services, request.params.board, request.person, request.params.id, body.data), () => saved(request, "edit_wording"));
  });

  app.delete<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id", async (request, reply) =>
    answer(reply, await deleteWording(services, request.params.board, request.person, request.params.id)),
  );

  // Sources (C-01): add a new one to a wording, cite one already on the board, take one off, or edit one.
  app.post<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/sources", { config: { limit: "writing" } }, async (request, reply) => {
    const body = newSourceInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await addSource(services, request.params.board, request.person, request.params.id, body.data), () => saved(request, "add_source"));
  });

  app.put<{ Params: { board: string; id: string; source: string } }>("/api/boards/:board/versions/:id/sources/:source", { config: { limit: "writing" } }, async (request, reply) =>
    answer(reply, await citeSource(services, request.params.board, request.person, request.params.id, request.params.source)),
  );

  app.delete<{ Params: { board: string; id: string; source: string } }>("/api/boards/:board/versions/:id/sources/:source", async (request, reply) =>
    answer(reply, await unciteSource(services, request.params.board, request.person, request.params.id, request.params.source)),
  );

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/sources/:id", { config: { limit: "writing" } }, async (request, reply) => {
    const body = sourceInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await editSource(services, request.params.board, request.person, request.params.id, body.data));
  });

  return app;
}

/** Whether a role sees a wording's open reports: an Editor's and the Owner's (M2-3). */
function moderates(role: Role): boolean {
  return role === "editor" || role === "owner";
}

/** A Fastify request's headers, as the web's Headers that Better Auth takes. */
function headersOf(headers: Record<string, string | string[] | undefined>): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) result.append(name, one);
  }
  return result;
}

/**
 * The caller's network, used only to count sign-in code requests, in memory (architecture §7). Behind Cloud Run,
 * the last X-Forwarded-For entry: Cloud Run appends the address it saw, and anything the caller sent goes in front of
 * it. Node joins repeated headers into one, in order. Otherwise, the connection's own address. An IPv6 address counts
 * by its first 64 bits, the block one home or school line is given, so a caller can't take a new address each time.
 */
export function callerNetwork(request: FastifyRequest, behindProxy: boolean): string {
  const forwarded = request.headers["x-forwarded-for"];
  const last = behindProxy && typeof forwarded === "string" ? forwarded.split(",").at(-1)?.trim() : undefined;
  return networkOf(last || request.socket.remoteAddress || "unknown");
}

/** An IPv4 address as it is; an IPv6 address as its first four groups, written out in full. */
export function networkOf(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (!address.includes(":")) return address;
  const [head, tail] = address.split("%")[0]!.split("::") as [string, string | undefined];
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = tail === undefined ? front : [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return `${groups.slice(0, 4).map((group) => (parseInt(group, 16) || 0).toString(16)).join(":")}::/64`;
}

/** Sends a write's answer with the matching HTTP status. */

/** @param onSaved Told when the write was saved, not when it was already done or refused (server events, M2-12). */
function answer(reply: FastifyReply, result: WriteResult, onSaved?: () => void): FastifyReply {
  if (result.status === "not_found") return reply.code(404).send({ reason: "not_found" });
  if (result.status === "refused") return reply.code(STATUS_FOR[result.reason]).send(result);
  if (result.status === "done") onSaved?.();
  return reply.code(200).send(result);
}
