// Starts the real service against a test database, with a fake clock and
// seeded IDs, and gives tests a short way to call it as a test user.

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import type { FakeClock } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import type { Mode } from "../../src/app.ts";
import { createDatabase } from "../../src/db/database.ts";
import { NOON } from "./board.ts";
import type { TestDatabase } from "./database.ts";

export interface Call {
  /** The test user to act as; leave out to call signed out. */
  as?: string;
  body?: unknown;
}

/** A response body. Loosely typed on purpose: tests check its shape with expect(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

export interface TestApi {
  readonly clock: FakeClock;
  readonly app: FastifyInstance;
  get(url: string, call?: Call): Promise<{ status: number; body: Body }>;
  post(url: string, call?: Call): Promise<{ status: number; body: Body }>;
  put(url: string, call?: Call): Promise<{ status: number; body: Body }>;
  delete(url: string, call?: Call): Promise<{ status: number; body: Body }>;
}

/** Call once at the top of a test file, after `useTestDatabase`. */
export function useApi(db: TestDatabase, options: { mode?: Mode; seed?: number } = {}): TestApi {
  const clock = createFakeClock(new Date(NOON));
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    app = buildApp({ clock, ids: createSeededIds(options.seed ?? 1), database: createDatabase(db.url), mode: options.mode ?? "test" });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
  });

  const call = (method: "GET" | "POST" | "PUT" | "DELETE") => async (url: string, { as, body }: Call = {}) => {
    if (!app) throw new Error("The app exists only while the file's tests are running");
    const response = await app.inject({
      method,
      url,
      headers: as ? { "x-steelman-test-user": as } : {},
      ...(body === undefined ? {} : { payload: body as object }),
    });
    return { status: response.statusCode, body: response.body ? response.json() : undefined };
  };

  return {
    clock,
    get app() {
      if (!app) throw new Error("The app exists only while the file's tests are running");
      return app;
    },
    get: call("GET"),
    post: call("POST"),
    put: call("PUT"),
    delete: call("DELETE"),
  };
}
