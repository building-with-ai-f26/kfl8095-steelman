import Fastify from "fastify";
import type { FastifyInstance, FastifyReply } from "fastify";
import { assessmentInput, changesQuery, voteInput } from "@steelman/shared";
import type { Clock, IdSource, RefusalReason } from "@steelman/shared";
import type { Db } from "./db/database.ts";
import { publishOrderIfDue } from "./order.ts";
import { readChanges, readSnapshot } from "./read.ts";
import { setArticulation, setAssessment, setImportance } from "./votes.ts";
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
}

/** The header the browser uses to say which test account it is acting as, while there is no sign-in (M0). */
const TEST_USER_HEADER = "x-steelman-test-user";

const STATUS_FOR: Record<RefusalReason, number> = {
  signed_out: 401,
  test_users_off: 403,
  not_author: 403,
  board_closed: 409,
  argument_deleted: 409,
  version_deleted: 409,
  revision_changed: 409,
  needs_evidence: 409,
};

declare module "fastify" {
  interface FastifyRequest {
    /** The account acting, or null when signed out. */
    person: string | null;
  }
}

/**
 * Builds the Steelman service without starting it, so tests can call its
 * routes directly and main.ts can listen on a port.
 */
export function buildApp({ clock, database, mode = "production" }: AppDependencies): FastifyInstance {
  const app = Fastify();

  app.get("/api/health", () => ({ status: "ok", time: clock.now().toISOString() }));

  if (!database) return app;
  const db = database;
  const services = { db, clock };
  const testUsersOn = mode === "development" || mode === "test";
  app.addHook("onClose", () => db.destroy());

  // Who is asking. Until sign-in exists (M1), only the test-user switch can say.
  app.decorateRequest("person", null);
  app.addHook("preHandler", async (request, reply) => {
    const named = request.headers[TEST_USER_HEADER];
    if (named === undefined) return;
    if (!testUsersOn) return reply.code(403).send({ status: "refused", reason: "test_users_off" });
    const account = typeof named === "string" ? await db.selectFrom("account").select("id").where("id", "=", named).executeTakeFirst() : undefined;
    request.person = account?.id ?? null;
  });

  if (testUsersOn) {
    app.get("/api/test-users", async () => ({
      users: await db.selectFrom("account").select(["id", "username"]).where("deleted_at", "is", null).orderBy("username").execute(),
    }));
  }

  app.get<{ Params: { board: string } }>("/api/boards/:board", async (request, reply) => {
    await publishOrderIfDue(db, clock, request.params.board);
    const snapshot = await readSnapshot(db, request.params.board, request.person);
    return snapshot ?? reply.code(404).send({ reason: "not_found" });
  });

  app.get<{ Params: { board: string } }>("/api/boards/:board/changes", async (request, reply) => {
    const query = changesQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ reason: "invalid", issues: query.error.issues });
    await publishOrderIfDue(db, clock, request.params.board);
    const changes = await readChanges(db, request.params.board, request.person, query.data.after);
    return changes ?? reply.code(404).send({ reason: "not_found" });
  });

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/arguments/:id/importance", async (request, reply) => {
    const body = voteInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setImportance(services, request.params.board, request.person, request.params.id, body.data.value));
  });

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/articulation", async (request, reply) => {
    const body = voteInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setArticulation(services, request.params.board, request.person, request.params.id, body.data.value));
  });

  app.put<{ Params: { board: string; id: string } }>("/api/boards/:board/versions/:id/assessment", async (request, reply) => {
    const body = assessmentInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ reason: "invalid", issues: body.error.issues });
    return answer(reply, await setAssessment(services, request.params.board, request.person, request.params.id, body.data));
  });

  return app;
}

/** Sends a write's answer with the matching HTTP status. */
function answer(reply: FastifyReply, result: WriteResult): FastifyReply {
  if (result.status === "not_found") return reply.code(404).send({ reason: "not_found" });
  if (result.status === "refused") return reply.code(STATUS_FOR[result.reason]).send(result);
  return reply.code(200).send(result);
}
