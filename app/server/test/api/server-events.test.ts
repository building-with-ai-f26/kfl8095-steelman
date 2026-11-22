import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import type { ServerEvent } from "../../src/events.ts";
import { createDatabase } from "../../src/db/database.ts";
import { NOON, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Server events (M2-12, M-08; plans/architecture.md Q29): the service tells
// PostHog when a vote, an assessment, or a piece of writing is saved, since
// the browser's own events are lost to ad blockers. Anonymous like the
// browser's: the action and the environment, never an account, email, board,
// or text. Only when the browser says its analytics are on (it sends its
// choice with each write), never with Global Privacy Control or Do Not Track,
// and never on a service with no PostHog key.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1203);
const POSTHOG = { key: "phc_test", host: "https://posthog.invalid" };
const sent: ServerEvent[] = [];
let app: FastifyInstance;
let quiet: FastifyInstance;
let b: SeededBoard;

beforeAll(async () => {
  const clock = createFakeClock(new Date(NOON));
  app = buildApp({ clock, ids: createSeededIds(1204), database: createDatabase(db.url), mode: "test", analytics: POSTHOG, sendEvent: async (event) => void sent.push(event) });
  quiet = buildApp({ clock, ids: createSeededIds(1205), database: createDatabase(db.url), mode: "test", sendEvent: async (event) => void sent.push(event) });
  await Promise.all([app.ready(), quiet.ready()]);
});
afterAll(async () => {
  await Promise.all([app.close(), quiet.close()]);
});
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  sent.length = 0;
});

type Headers = Record<string, string>;
const ON: Headers = { "x-steelman-analytics": "on" };

async function send(method: "POST" | "PUT", url: string, as: string, body: unknown, headers: Headers = ON, to: FastifyInstance = app) {
  const response = await to.inject({ method, url, headers: { "x-steelman-test-user": as, ...headers }, payload: body as object });
  return { status: response.statusCode, body: response.json() };
}
const importance = (headers?: Headers, to?: FastifyInstance, value: 1 | -1 = 1) => send("PUT", `/api/boards/${b.board}/arguments/${b.argument}/importance`, b.ben, { value }, headers, to);
/** Lets the service's sends, which don't hold up the answer, finish. (The stand-in for PostHog here records at once; this is a guard.) */
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

test("M2-12, M-08: with the browser's analytics on, each saved vote, assessment, and piece of writing sends one event: the action and the environment", async () => {
  const argument = ids.itemId();
  expect((await importance()).body.status).toBe("done");
  expect((await send("PUT", `/api/boards/${b.board}/versions/${b.version}/articulation`, b.ben, { value: 1 })).body.status).toBe("done");
  expect((await send("PUT", `/api/boards/${b.board}/versions/${b.version}/assessment`, b.ben, { rev: 1, supported: true })).body.status).toBe("done");
  expect((await send("POST", `/api/boards/${b.board}/arguments`, b.ben, { id: argument, optionId: b.no, versionId: ids.itemId(), wording: "Sunday staff cost more.", context: "" })).body.status).toBe("done");
  expect((await send("POST", `/api/boards/${b.board}/arguments/${b.argument}/versions`, b.ben, { id: ids.itemId(), wording: "Sunday is many people's only day off.", context: "" })).body.status).toBe("done");
  expect((await send("PUT", `/api/boards/${b.board}/versions/${b.otherVersion}`, b.ana, { baseRev: 1, wording: "Staff need a fixed day off.", context: "" })).body.status).toBe("done");
  expect(
    (await send("POST", `/api/boards/${b.board}/versions/${b.otherVersion}/sources`, b.ana, { id: ids.itemId(), name: "Staff rota, 2025", locator: "", finding: "Everyone has one fixed day off.", backsUp: "", limits: "" })).body.status,
  ).toBe("done");
  await settled();

  expect(sent.map((event) => event.event)).toEqual(["vote_importance", "vote_articulation", "assess", "write_argument", "write_wording", "edit_wording", "add_source"]);
  for (const event of sent) expect(event.properties).toEqual({ environment: "local", source: "service", $process_person_profile: false, $geoip_disable: true });
});

test("M2-12, M-08: an event names no one and nothing on the board: no account, username, email, board, or text, and a new anonymous ID each time", async () => {
  await importance();
  await send("POST", `/api/boards/${b.board}/arguments`, b.ben, { id: ids.itemId(), optionId: b.no, versionId: ids.itemId(), wording: "Sunday staff cost more.", context: "Overtime rates." });
  await settled();

  expect(sent).toHaveLength(2);
  const everything = JSON.stringify(sent);
  for (const secret of [b.ben, "ben", b.board, b.argument, b.no, "Sunday staff cost more.", "Overtime rates."]) expect(everything).not.toContain(secret);
  expect(sent[0]!.api_key).toBe(POSTHOG.key);
  expect(sent[0]!.distinct_id).not.toBe(sent[1]!.distinct_id);
});

test("M2-12, M-08: without the browser's say-so, with analytics turned off, or with Global Privacy Control or Do Not Track, nothing is sent", async () => {
  const cases: Headers[] = [{}, { "x-steelman-analytics": "off" }, { ...ON, "sec-gpc": "1" }, { ...ON, dnt: "1" }];
  for (const [index, headers] of cases.entries()) {
    // Each a change from the one before, so each is saved.
    expect((await importance(headers, app, index % 2 === 0 ? 1 : -1)).body.status).toBe("done");
  }
  await settled();

  expect(sent).toEqual([]);
});

test("M2-12, M-08: a service with no PostHog key sends nothing", async () => {
  expect((await importance(ON, quiet)).body.status).toBe("done");
  await settled();

  expect(sent).toEqual([]);
});

test("M2-12, M-08: a write that changes nothing, or is refused, sends nothing", async () => {
  await importance();
  await settled();
  sent.length = 0;

  expect((await importance()).body.status).toBe("already_done");
  // Ben may not edit Ana's wording.
  expect((await send("PUT", `/api/boards/${b.board}/versions/${b.version}`, b.ben, { baseRev: 1, wording: "Not his to change.", context: "" })).body.status).toBe("refused");
  await settled();

  expect(sent).toEqual([]);
});

test("M2-12, M-08: the service posts the event to PostHog's capture address, and a PostHog that's down, or never answers, doesn't hold up or fail the write", async () => {
  const received: { url: string | undefined; body: unknown }[] = [];
  const standIn = createServer((request: IncomingMessage, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      received.push({ url: request.url, body: JSON.parse(text) });
      response.end("{}");
    });
  });
  // A PostHog that takes the request and never answers.
  const silent = createServer(() => undefined);
  await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  const host = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  const real = buildApp({ clock: createFakeClock(new Date(NOON)), ids: createSeededIds(1206), database: createDatabase(db.url), mode: "test", analytics: { key: "phc_test", host } });
  const down = buildApp({ clock: createFakeClock(new Date(NOON)), ids: createSeededIds(1207), database: createDatabase(db.url), mode: "test", analytics: { key: "phc_test", host: "http://127.0.0.1:9" } });
  const hung = buildApp({
    clock: createFakeClock(new Date(NOON)),
    ids: createSeededIds(1208),
    database: createDatabase(db.url),
    mode: "test",
    analytics: { key: "phc_test", host: `http://127.0.0.1:${(silent.address() as AddressInfo).port}` },
  });
  try {
    expect((await importance(ON, real)).body.status).toBe("done");
    await expect.poll(() => received.length).toBe(1);
    expect(received[0]).toMatchObject({ url: "/i/v0/e/", body: { api_key: "phc_test", event: "vote_importance", properties: { environment: "local" } } });

    expect((await send("PUT", `/api/boards/${b.board}/versions/${b.version}/articulation`, b.ben, { value: 1 }, ON, down)).body.status).toBe("done");

    // The send gives up after 2 seconds; the write doesn't wait for it.
    const started = performance.now();
    expect((await send("PUT", `/api/boards/${b.board}/versions/${b.version}/articulation`, b.ben, { value: -1 }, ON, hung)).body.status).toBe("done");
    expect(performance.now() - started).toBeLessThan(1_000);
  } finally {
    await Promise.all([real.close(), down.close(), hung.close()]);
    standIn.close();
    silent.closeAllConnections();
    silent.close();
  }
});
