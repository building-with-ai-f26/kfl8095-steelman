import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { provisionServiceLogin } from "../../src/db/service-login.ts";
import { parseOperatorArgs, runOperator } from "../../src/jobs/operator.ts";
import { addAccount } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace } from "../support/space.ts";

// The operator's commands under the service's own database login (J-06,
// M3d-36; see service-login.test.ts). The steelman-operator Cloud Run job runs
// as the service, so suspend, unsuspend, and make-private must work with only
// the rights the service has, and need no new grant. Every other test runs as
// the database's superuser, which would hide a missing grant.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(3611);
const clock = createFakeClock(new Date("2026-11-28T12:00:00Z"));
const LOGIN = `test_service_login_${ids.itemId().slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
const PASSWORD = "a-password-for-this-test-only";

function asServiceLogin(): string {
  const url = new URL(db.url);
  url.username = LOGIN;
  url.password = PASSWORD;
  return url.href;
}

describe("the operator under the service's database login", () => {
  let service: Db;
  beforeAll(async () => {
    await provisionServiceLogin(db.url, { name: LOGIN, password: PASSWORD });
    service = createDatabase(asServiceLogin());
  });
  afterAll(async () => {
    await service?.destroy();
    await db.client.query(`drop role if exists ${LOGIN}`);
  });

  const operate = async (...args: string[]) => {
    const command = parseOperatorArgs(args);
    if ("error" in command) throw new Error(command.error);
    return runOperator(service, clock, command);
  };

  test("M3d-36, J-06, M-01: suspend, unsuspend, and make-private work with only the service's rights", async () => {
    const person = await addAccount(db.client, ids, "lin");
    const username = (await db.client.query("select username from account where id = $1", [person])).rows[0].username as string;
    await db.client.query("insert into sign_in.session (id, account_id, token, expires_at, created_at, updated_at) values ($1, $2, $3, $4, $4, $4)", [ids.itemId(), person, ids.itemId(), new Date("2026-12-28T12:00:00Z")]);
    const space = await addSpace(db.client, ids, person);
    await db.client.query("update space set visibility = 'public' where id = $1", [space]);

    expect(await operate("suspend", username)).toMatchObject({ ok: true });
    expect((await db.client.query("select count(*)::int as n from sign_in.session where account_id = $1", [person])).rows[0].n).toBe(0);
    expect(await operate("unsuspend", username)).toMatchObject({ ok: true });
    expect(await operate("make-private", space)).toMatchObject({ ok: true });
    expect((await db.client.query("select visibility from space where id = $1", [space])).rows[0].visibility).toBe("private");
  });
});
