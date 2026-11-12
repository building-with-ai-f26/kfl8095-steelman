import { beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// No sign-in in M0. A local-only "pick a test user" switch stands in: the
// browser says who it is with a header. It must refuse to work when the
// service runs in production mode (plans/build-plan.md, M0-4).

const db = useTestDatabase({ migrated: true });
const dev = useApi(db, { mode: "development" });
const production = useApi(db, { mode: "production" });
let b: SeededBoard;
beforeAll(async () => {
  b = await seedBoard(db.client, createSeededIds(401));
});

describe("in development", () => {
  test("M0-4: the switch lists the accounts to pick from", async () => {
    const { status, body } = await dev.get("/api/test-users");

    expect(status).toBe(200);
    expect(body.users.map((user: { id: string }) => user.id)).toEqual(expect.arrayContaining([b.ana, b.ben]));
  });

  test("B-01: a test user can vote", async () => {
    const { status } = await dev.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });

    expect(status).toBe(200);
  });

  test("M0-4: an account that doesn't exist is treated as signed out", async () => {
    const { status, body } = await dev.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: "nobody0000000000000x", body: { value: 1 } });

    expect(status).toBe(401);
    expect(body.reason).toBe("signed_out");
  });
});

describe("in production mode", () => {
  test("M0-4: the switch's list doesn't exist", async () => {
    expect((await production.get("/api/test-users")).status).toBe(404);
  });

  test("M0-4: a request that names a test user is refused", async () => {
    const vote = await production.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: -1 } });
    const read = await production.get(`/api/boards/${b.board}`, { as: b.ben });

    expect(vote.status).toBe(403);
    expect(vote.body.reason).toBe("test_users_off");
    expect(read.status).toBe(403);
  });

  test("M0-4: and nothing it asked for happened", async () => {
    const votes = await db.client.query("select value from importance_vote where argument_id = $1 and account_id = $2", [b.argument, b.ben]);

    expect(votes.rows).toEqual([{ value: 1 }]);
  });

  test("M0-4: without a test user, nobody can write", async () => {
    const { status, body } = await production.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { body: { value: 1 } });

    expect(status).toBe(401);
    expect(body.reason).toBe("signed_out");
  });
});
