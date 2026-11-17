import { afterAll, beforeAll, describe, expect, test } from "vitest";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import { createDatabase } from "../../src/db/database.ts";
import { provisionServiceLogin } from "../../src/db/service-login.ts";
import { seedDemoBoard } from "../../src/demo-board.ts";
import { useTestDatabase } from "../support/database.ts";

// The service's own database login (M1-14b; plans/architecture.md §2,
// "Invariants", and migration 0001): deployed, the service signs in as a login
// that has steelman_app's rights and nothing more, so the database itself
// enforces the invariants: content rows can't be removed, the change log only
// grows. It may switch to steelman_account_deletion for account deletion, and
// has none of that role's rights otherwise. The migration job creates it.
//
// Every other test runs as the database's superuser, so this is the one that
// proves the whole service works with only the rights the migrations grant.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1403);
const clock = createFakeClock(new Date("2026-11-17T12:00:00Z"));
// Logins belong to the whole database server, not one test database, so this one is named apart from the
// roles schema-shape.test.ts lists (steelman_*), and removed afterwards.
const LOGIN = `test_service_login_${ids.itemId().slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
const PASSWORD = "a-password-for-this-test-only";

/** The test database's address, signing in as the service's login. */
function asServiceLogin(): string {
  const url = new URL(db.url);
  url.username = LOGIN;
  url.password = PASSWORD;
  return url.href;
}

describe("the service's database login", () => {
  let app: FastifyInstance;
  let demo: Awaited<ReturnType<typeof seedDemoBoard>>;
  beforeAll(async () => {
    await provisionServiceLogin(db.url, { name: LOGIN, password: PASSWORD });
    const seeding = createDatabase(db.url);
    demo = await seedDemoBoard(seeding, clock, ids);
    await seeding.destroy();
    app = buildApp({ clock, ids, mode: "test", database: createDatabase(asServiceLogin()) });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await db.client.query(`drop role if exists ${LOGIN}`);
  });

  const as = (person: keyof typeof demo.people) => ({ "x-steelman-test-user": demo.people[person] });
  const call = async (person: keyof typeof demo.people, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) => {
    const response = await app.inject({ method, url, headers: as(person), ...(payload ? { payload } : {}) });
    return { status: response.statusCode, body: response.body ? response.json() : undefined };
  };

  test("M-01: creating it again changes nothing but its password", async () => {
    await provisionServiceLogin(db.url, { name: LOGIN, password: PASSWORD });
    const roles = await db.client.query(
      `select r.rolname, m.inherit_option as inherits, m.set_option as can_switch
       from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member
       where u.rolname = $1 order by r.rolname`,
      [LOGIN],
    );
    expect(roles.rows).toEqual([
      { rolname: "steelman_account_deletion", inherits: false, can_switch: true },
      { rolname: "steelman_app", inherits: true, can_switch: true },
    ]);
  });

  test("M-01: the whole service works with only those rights: a board from start to deleting an account", async () => {
    const board = await call("maya.chen", "POST", "/api/boards", { question: "Should the library lend tools?", options: ["Yes", "No"] });
    expect(board.status).toBe(200);
    const boardId = board.body.board as string;
    const read = await call("maya.chen", "GET", `/api/boards/${boardId}`);
    expect(read.status).toBe(200);
    const yes = read.body.options[0].id as string;

    const argument = ids.itemId();
    const version = ids.itemId();
    expect((await call("maya.chen", "POST", `/api/boards/${boardId}/arguments`, { id: argument, optionId: yes, versionId: version, wording: "Tools sit unused most of the year.", context: "" })).status).toBe(200);
    expect((await call("maya.chen", "PUT", `/api/boards/${boardId}/access`, { general: "link", linkRole: "contributor" })).status).toBe(200);
    expect((await call("maya.chen", "PUT", `/api/boards/${boardId}/arguments/${argument}/importance`, { value: 1 })).status).toBe(200);
    expect((await call("maya.chen", "PUT", `/api/boards/${boardId}/versions/${version}/articulation`, { value: 1 })).status).toBe(200);
    const source = ids.itemId();
    expect((await call("maya.chen", "POST", `/api/boards/${boardId}/versions/${version}/sources`, { id: source, name: "Library survey", locator: "", finding: "", backsUp: "", limits: "" })).status).toBe(200);
    expect((await call("maya.chen", "PUT", `/api/boards/${boardId}/versions/${version}/assessment`, { rev: 2, supported: true })).status).toBe(200);
    expect((await call("maya.chen", "PUT", `/api/boards/${boardId}/versions/${version}`, { baseRev: 2, wording: "Most tools sit unused most of the year.", context: "" })).status).toBe(200);
    expect((await call("maya.chen", "GET", `/api/boards/${boardId}/changes?after=0`)).status).toBe(200);
    expect((await call("maya.chen", "GET", "/api/account/data")).status).toBe(200);

    // Account deletion switches to its own role inside its transaction.
    expect((await call("maya.chen", "POST", "/api/account/delete", { username: "maya.chen" })).body).toEqual({ status: "done" });
    expect((await call("tess.b", "GET", `/api/boards/${boardId}`)).status).toBe(404);
  });

  test("M-01: signed in as it, content can't be removed and the change log can't be rewritten", async () => {
    const client = new pg.Client({ connectionString: asServiceLogin() });
    await client.connect();
    try {
      await expect(client.query("delete from version")).rejects.toThrow(/permission denied/);
      await expect(client.query("update change set kind = 'x'")).rejects.toThrow(/permission denied/);
      // The deletion role's rights come only by switching to it, which only the deletion job does.
      await expect(client.query("update change set actor_id = actor_id")).rejects.toThrow(/permission denied/);
    } finally {
      await client.end();
    }
  });
});
