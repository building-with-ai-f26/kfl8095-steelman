import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Importance votes (B-01) and articulation votes (B-02) through the API.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(402);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const importance = (who: string, value: 1 | -1 | null, argument = b.argument) =>
  api.put(`/api/boards/${b.board}/arguments/${argument}/importance`, { as: who, body: { value } });
const articulation = (who: string, value: 1 | -1 | null, version = b.version) =>
  api.put(`/api/boards/${b.board}/versions/${version}/articulation`, { as: who, body: { value } });

const argumentRow = async (id = b.argument) =>
  (await db.client.query("select importance, importance_voters, changed_seq::int as seq from argument where id = $1", [id])).rows[0];
const versionRow = async (id = b.version) =>
  (await db.client.query("select articulation, articulation_voters, changed_seq::int as seq from version where id = $1", [id])).rows[0];
const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

describe("importance votes", () => {
  test("B-01: a vote counts on the argument, and the argument is stamped with the write's change number", async () => {
    const { status, body } = await importance(b.ben, 1);

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", seq: await boardSeq() });
    expect(await argumentRow()).toEqual({ importance: 1, importance_voters: 1, seq: body.seq });
  });

  test("B-01: changing a vote replaces it", async () => {
    await importance(b.ben, 1);
    await importance(b.ana, 1);
    await importance(b.ben, -1);

    expect(await argumentRow()).toMatchObject({ importance: 0, importance_voters: 2 });
  });

  test("B-01: withdrawing a vote removes it", async () => {
    await importance(b.ben, 1);
    await importance(b.ben, null);

    expect(await argumentRow()).toMatchObject({ importance: 0, importance_voters: 0 });
    const votes = await db.client.query("select count(*)::int as n from importance_vote where argument_id = $1", [b.argument]);
    expect(votes.rows[0].n).toBe(0);
  });

  test("B-01: the same vote sent twice is the same as once, and takes no second change number", async () => {
    const first = await importance(b.ben, 1);
    const seq = await boardSeq();
    const second = await importance(b.ben, 1);

    expect(first.body.status).toBe("done");
    expect(second).toEqual({ status: 200, body: { status: "already_done" } });
    expect(await boardSeq()).toBe(seq);
    expect(await argumentRow()).toMatchObject({ importance: 1, importance_voters: 1 });
  });

  test("B-01: withdrawing a vote that isn't there is already done", async () => {
    expect((await importance(b.ben, null)).body).toEqual({ status: "already_done" });
  });

  test("B-01: a vote is +1, −1, or none", async () => {
    for (const value of [2, 0, "1", true]) {
      const response = await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value } });
      expect(response.status).toBe(400);
    }
  });

  test("B-01: a vote on an argument that isn't on this board is not found", async () => {
    const other = await seedBoard(db.client, ids);

    expect((await importance(b.ben, 1, other.argument)).status).toBe(404);
  });

  test("B-01: a vote on a deleted argument is refused: the argument was deleted", async () => {
    await write(db.client, b.board, (seq) => db.client.query("update argument set deleted_at = $2, changed_seq = $3 where id = $1", [b.argument, NOON, seq]));

    const { status, body } = await importance(b.ben, 1);

    expect(status).toBe(409);
    expect(body).toEqual({ status: "refused", reason: "argument_deleted" });
    expect(await argumentRow()).toMatchObject({ importance: 0, importance_voters: 0 });
  });

  test("B-01: a vote on a closed board is refused", async () => {
    await db.client.query("update board set closed_at = $2 where id = $1", [b.board, NOON]);

    const { status, body } = await importance(b.ben, 1);

    expect(status).toBe(409);
    expect(body).toEqual({ status: "refused", reason: "board_closed" });
  });

  test("B-01: a vote sent signed out is refused", async () => {
    const response = await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { body: { value: 1 } });

    expect(response.status).toBe(401);
  });
});

describe("articulation votes", () => {
  test("B-02: a vote counts on the wording, and the wording is stamped", async () => {
    const { body } = await articulation(b.ben, -1);

    expect(body.status).toBe("done");
    expect(await versionRow()).toEqual({ articulation: -1, articulation_voters: 1, seq: body.seq });
  });

  test("B-02: changing and withdrawing work as for importance", async () => {
    await articulation(b.ben, 1);
    await articulation(b.ana, 1);
    await articulation(b.ben, -1);
    expect(await versionRow()).toMatchObject({ articulation: 0, articulation_voters: 2 });

    await articulation(b.ana, null);
    expect(await versionRow()).toMatchObject({ articulation: -1, articulation_voters: 1 });
  });

  test("B-02: the same vote sent twice is the same as once", async () => {
    await articulation(b.ben, 1);
    const seq = await boardSeq();

    expect((await articulation(b.ben, 1)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(seq);
  });

  test("B-02: a vote on a deleted wording is refused: the wording was deleted", async () => {
    await write(db.client, b.board, async (seq) => {
      await db.client.query("update version_revision set wording = null, context = null where version_id = $1", [b.version]);
      await db.client.query("update version set deleted_at = $2, changed_seq = $3 where id = $1", [b.version, NOON, seq]);
    });

    const { status, body } = await articulation(b.ben, 1);

    expect(status).toBe(409);
    expect(body).toEqual({ status: "refused", reason: "version_deleted" });
  });
});
