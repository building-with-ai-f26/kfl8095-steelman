import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, addArgument, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The shared order recalculates lazily (plans/architecture.md §3): when a
// browser asks, and only if votes have changed it and the last published
// order is older than the board's tick (60 s for the class trial). No timer.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(405);
let b: SeededBoard;
let third: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  // A second argument under "Yes", so votes can reorder that option.
  third = await write(db.client, b.board, async (seq) => (await addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ana, seq, wording: "Weekend hours help students." })).argument);
});

const TICK = 60_000;
const snapshot = () => api.get(`/api/boards/${b.board}`);
const changes = (after: number) => api.get(`/api/boards/${b.board}/changes?after=${after}`);
const upvote = (who: string, argument: string) => api.put(`/api/boards/${b.board}/arguments/${argument}/importance`, { as: who, body: { value: 1 } });
const savedOrder = async () => (await db.client.query("select arguments, changed_seq::int as seq from published_order where board_id = $1", [b.board])).rows[0];

describe("the lazy order tick", () => {
  test("B-05: the first time a board is read, its order is published", async () => {
    expect(await savedOrder()).toBeUndefined();

    const { body } = await snapshot();

    expect(body.order.arguments[b.yes]).toEqual([b.argument, third]);
    expect((await savedOrder()).arguments[b.yes]).toEqual([b.argument, third]);
  });

  test("B-05: votes don't change the order before the tick has passed", async () => {
    const { seq } = (await snapshot()).body.board;
    await upvote(b.ben, third);
    api.clock.advance(TICK - 1);

    const { body } = await changes(seq);

    expect(body.order).toBeNull();
    expect((await savedOrder()).arguments[b.yes]).toEqual([b.argument, third]);
  });

  test("B-05: once the clock passes the tick, the next request publishes the new order", async () => {
    const { seq } = (await snapshot()).body.board;
    await upvote(b.ben, third);
    api.clock.advance(TICK);

    const { body } = await changes(seq);

    expect(body.order.arguments[b.yes]).toEqual([third, b.argument]);
    expect(await savedOrder()).toMatchObject({ arguments: { [b.yes]: [third, b.argument] }, seq: body.seq });
  });

  test("B-05: with the tick passed but no change to the order, nothing new is published", async () => {
    const { seq } = (await snapshot()).body.board;
    const before = await savedOrder();
    api.clock.advance(TICK * 5);

    expect((await changes(seq)).body).toMatchObject({ seq, order: null });
    expect(await savedOrder()).toEqual(before);
  });

  test("B-05: a published order counts from when it was made: the next waits a full tick again", async () => {
    const { seq } = (await snapshot()).body.board;
    await upvote(b.ben, third);
    api.clock.advance(TICK);
    const published = (await changes(seq)).body;

    await upvote(b.ana, b.argument);
    await upvote(b.ben, b.argument);
    api.clock.advance(TICK - 1);
    expect((await changes(published.seq)).body.order).toBeNull();

    api.clock.advance(1);
    expect((await changes(published.seq)).body.order.arguments[b.yes]).toEqual([b.argument, third]);
  });

  test("B-05: ties keep the published order", async () => {
    const { seq } = (await snapshot()).body.board;
    await upvote(b.ben, third);
    await upvote(b.ben, b.argument);
    api.clock.advance(TICK);

    expect((await changes(seq)).body.order).toBeNull();
  });

  test("B-05: two readers asking at once publish one order between them", async () => {
    const { seq } = (await snapshot()).body.board;
    await upvote(b.ben, third);
    api.clock.advance(TICK);

    const [one, two] = await Promise.all([changes(seq), changes(seq)]);

    expect(one.body.seq).toBe(two.body.seq);
    expect(one.body.order).toEqual(two.body.order);
  });

  test("B-05: a deleted argument leaves the order", async () => {
    await snapshot();
    await write(db.client, b.board, (seq) => db.client.query("update argument set deleted_at = $2, changed_seq = $3 where id = $1", [b.argument, NOON, seq]));
    api.clock.advance(TICK);

    expect((await snapshot()).body.order.arguments[b.yes]).toEqual([third]);
  });
});
