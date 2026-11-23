import { beforeEach, describe, expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import { useApi } from "../support/api.ts";
import { NOON, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Requests the service can't act on (M-12; the security audit of Nov 22,
// SECURITY.md). A write to a board that doesn't exist, and a zero byte in an
// address or in text, used to reach Postgres and come back as a 500 with the
// database's own message. Each is now refused before it gets there, and a 500
// never says what went wrong inside.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(2211);

let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const ACCESS = { general: "link", linkRole: "viewer" };
const ZERO = "\u0000";

describe("a write to a board that doesn't exist", () => {
  test("M-12: answers not found, signed in", async () => {
    const answer = await api.put("/api/boards/nosuchboard1/access", { as: b.ana, body: ACCESS });

    expect(answer).toEqual({ status: 404, body: { reason: "not_found" } });
  });

  test("M-12: answers not found, signed out", async () => {
    const answer = await api.put("/api/boards/nosuchboard1/access", { body: ACCESS });

    expect(answer).toEqual({ status: 404, body: { reason: "not_found" } });
  });

  test("M-12: answers not found when the board's ID isn't the shape of one", async () => {
    expect((await api.put("/api/boards/x/access", { as: b.ana, body: ACCESS })).status).toBe(404);
    expect((await api.get(`/api/boards/${"x".repeat(50)}`, { as: b.ana })).status).toBe(404);
  });
});

describe("a zero byte", () => {
  test("M-12: in a board's address is refused", async () => {
    expect((await api.get("/api/boards/abc%00def", { as: b.ana })).status).toBe(400);
    expect((await api.get("/api/boards/abc%00def")).status).toBe(400);
  });

  test("M-12: in an item's address is refused", async () => {
    const answer = await api.put(`/api/boards/${b.board}/arguments/abc%00def/importance`, { as: b.ana, body: { value: 1 } });

    expect(answer.status).toBe(400);
  });

  test("M-12: in a wording is refused, and nothing is saved", async () => {
    const [id, versionId] = [ids.itemId(), ids.itemId()];
    const before = await api.get(`/api/boards/${b.board}`, { as: b.ana });

    const answer = await api.post(`/api/boards/${b.board}/arguments`, { as: b.ana, body: { id, optionId: b.yes, versionId, wording: `a${ZERO}b`, context: "" } });

    expect(answer.status).toBe(400);
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ana })).body.seq).toBe(before.body.seq);
  });
});

describe("a failure inside the service", () => {
  test("M-12: answers 500 without saying what failed", async () => {
    // A database that fails on every question, with a message that mustn't reach the caller.
    const broken = new Proxy({}, { get: (_target, name) => (name === "destroy" ? async () => {} : () => { throw new Error("relation secret_table does not exist"); }) });
    const app = buildApp({ clock: createFakeClock(new Date(NOON)), ids, database: broken as never, mode: "test" });

    const response = await app.inject({ method: "GET", url: "/api/boards", headers: { "x-steelman-test-user": b.ana } });
    await app.close();

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ reason: "server_error" });
    expect(response.body).not.toContain("secret_table");
  });
});
