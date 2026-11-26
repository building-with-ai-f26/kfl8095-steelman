import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import { createDatabase } from "../../src/db/database.ts";
import { provisionServiceLogin } from "../../src/db/service-login.ts";
import { seedDemoBoard } from "../../src/demo-board.ts";
import { useTestDatabase } from "../support/database.ts";

// Spaces under the service's own database login (G-03, G-04, M3d-17; see
// service-login.test.ts): every space route, Download your data, and account
// deletion with spaces to hand over and to delete, using only the rights
// migration 0016 grants. Every other test runs as the database's superuser,
// which would hide a missing grant.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1722);
const clock = createFakeClock(new Date("2026-11-26T12:00:00Z"));
const LOGIN = `test_service_login_${ids.itemId().slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
const PASSWORD = "a-password-for-this-test-only";

function asServiceLogin(): string {
  const url = new URL(db.url);
  url.username = LOGIN;
  url.password = PASSWORD;
  return url.href;
}

describe("spaces under the service's database login", () => {
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

  const call = async (person: keyof typeof demo.people, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) => {
    const response = await app.inject({ method, url, headers: { "x-steelman-test-user": demo.people[person] }, ...(payload ? { payload } : {}) });
    return { status: response.statusCode, body: response.body ? response.json() : undefined };
  };

  test("G-03, G-04, M-01, M-07: a space from making it to its Owner's account deletion works with only the service's rights", async () => {
    const pod = ids.itemId();
    const alone = ids.itemId();
    expect((await call("maya.chen", "POST", "/api/spaces", { id: pod, name: "Pod 6" })).body).toEqual({ status: "done" });
    expect((await call("maya.chen", "POST", "/api/spaces", { id: alone, name: "Maya's own" })).body).toEqual({ status: "done" });
    expect((await call("maya.chen", "PUT", `/api/spaces/${pod}`, { name: "Pod Six", about: "Fall 2026", canvas: "sage" })).body).toEqual({ status: "done" });
    expect((await call("maya.chen", "PUT", `/api/spaces/${pod}/visibility`, { visibility: "private" })).body).toEqual({ status: "already_done" });
    expect((await call("maya.chen", "POST", `/api/spaces/${pod}/invites`, { username: "tess.b", role: "member" })).body).toEqual({ status: "done" });
    expect((await call("maya.chen", "POST", `/api/spaces/${pod}/invites`, { username: "omar_h", role: "member" })).body).toEqual({ status: "done" });
    expect((await call("maya.chen", "PUT", `/api/spaces/${pod}/people/${demo.people["tess.b"]}`, { role: "admin" })).body).toEqual({ status: "done" });
    expect((await call("tess.b", "DELETE", `/api/spaces/${pod}/people/${demo.people["omar_h"]}`)).body).toEqual({ status: "done" });
    expect((await call("tess.b", "GET", `/api/spaces/${pod}`)).status).toBe(200);
    expect((await call("tess.b", "GET", `/api/spaces/${pod}/people`)).status).toBe(200);
    expect((await call("tess.b", "GET", "/api/spaces")).status).toBe(200);
    expect((await call("maya.chen", "GET", "/api/account/data")).body.spaces).toHaveLength(2);

    expect((await call("maya.chen", "POST", "/api/account/delete", { username: "maya.chen" })).body).toEqual({ status: "done" });

    expect((await call("tess.b", "GET", `/api/spaces/${pod}`)).body).toMatchObject({ role: "owner", members: 1 });
    // Maya's own space had no one else in it, so it went with her account, its text erased.
    const gone = (await db.client.query("select name, about, deleted_at from space where id = $1", [alone])).rows[0];
    expect(gone).toMatchObject({ name: "", about: "" });
    expect(gone.deleted_at).not.toBeNull();
  });
});
