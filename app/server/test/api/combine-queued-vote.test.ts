import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// A queued importance vote on an argument combined away (A-10, M-02;
// architecture §3's stale-write table; the builder, Nov 22). The vote goes to
// the argument it was combined into. When the reader's vote there is the one
// the combine carried from the argument they voted on, and they haven't voted
// there since, their queued vote is their newest choice, so it applies: a
// flip or a withdrawal made offline isn't dropped. When they have voted there
// themselves, that vote stands, as before.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(2212);
let b: SeededBoard;
/** A second and a third argument for Yes: the first is combined into the second, and the second into the third. */
let second: { argument: string; version: string };
let third: { argument: string; version: string };
let eve: string;
let p1: string;
let p2: string;

beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  second = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Weekend hours suit families." }));
  third = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Libraries are for everyone." }));
  eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
  p1 = await addAccount(db.client, ids, "p1", { confirmed: true });
  await addMember(db.client, b.board, p1, "voter");
  p2 = await addAccount(db.client, ids, "p2", { confirmed: true });
  await addMember(db.client, b.board, p2, "voter");
});

const boardSeq = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const importance = (who: string, argument: string, value: 1 | -1 | null) => api.put(`/api/boards/${b.board}/arguments/${argument}/importance`, { as: who, body: { value } });
const combine = (version: string, into: string) => api.post(`/api/boards/${b.board}/versions/${version}/combine`, { as: eve, body: { into } });
const undo = (seq: number) => api.put(`/api/boards/${b.board}/changes/${seq}/undo`, { as: eve });
const votesOn = async (argumentId: string) =>
  Object.fromEntries((await db.client.query("select account_id, value from importance_vote where argument_id = $1", [argumentId])).rows.map((row) => [row.account_id, row.value]));
const row = async (as: string, id: string) => (await api.get(`/api/boards/${b.board}`, { as })).body.arguments.find((a: { id: string }) => a.id === id);
/** The first argument's only wording goes into the second, so the two become one. Answers the combine's change number. */
const combineFirstIntoSecond = async () => (await combine(b.version, second.argument)).body.seq as number;
/** Then everything in the second goes into the third, so those two become one as well. */
const combineSecondIntoThird = async () => {
  await combine(b.version, third.argument);
  await combine(second.version, third.argument);
};
/** Every argument's cached importance and voter count equal a count of its votes. */
const expectCountsMatchVotes = async () => {
  const drifted = await db.client.query(
    `select a.id, a.importance, a.importance_voters, counted.total, counted.voters
     from argument a
     cross join lateral (select coalesce(sum(v.value), 0)::int as total, count(*)::int as voters from importance_vote v where v.argument_id = a.id) counted
     where a.board_id = $1 and (a.importance <> counted.total or a.importance_voters <> counted.voters)`,
    [b.board],
  );
  expect(drifted.rows).toEqual([]);
};

describe("a queued importance vote on an argument combined away", () => {
  test("A-10, M-02: a vote flipped offline applies to the argument it was combined into", async () => {
    await importance(p1, b.argument, 1);
    await importance(p2, b.argument, 1);
    await combineFirstIntoSecond();
    expect(await votesOn(second.argument)).toEqual({ [p1]: 1, [p2]: 1 });
    const before = await boardSeq();

    const { status, body } = await importance(p1, b.argument, -1);

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", seq: before + 1 });
    expect(await votesOn(second.argument)).toEqual({ [p1]: -1, [p2]: 1 });
    expect(await votesOn(b.argument)).toEqual({});
    expect(await row(p1, second.argument)).toMatchObject({ myVote: -1, importance: 0, importanceVoters: 2 });
    await expectCountsMatchVotes();
  });

  test("A-10, M-02: a vote withdrawn offline is withdrawn from the argument it was combined into", async () => {
    await importance(p1, b.argument, 1);
    await importance(p2, b.argument, 1);
    await combineFirstIntoSecond();

    expect((await importance(p1, b.argument, null)).body).toMatchObject({ status: "done" });

    expect(await votesOn(second.argument)).toEqual({ [p2]: 1 });
    expect(await row(p1, second.argument)).toMatchObject({ myVote: null, importance: 1, importanceVoters: 1 });
    await expectCountsMatchVotes();
  });

  test("A-10, M-02: someone who voted on the combined argument after the combine keeps that vote", async () => {
    await importance(p1, b.argument, 1);
    await combineFirstIntoSecond();
    await importance(p1, second.argument, -1);
    const before = await boardSeq();

    expect((await importance(p1, b.argument, 1)).body).toEqual({ status: "already_done" });
    expect((await importance(p1, b.argument, null)).body).toEqual({ status: "already_done" });

    expect(await boardSeq()).toBe(before);
    expect(await votesOn(second.argument)).toEqual({ [p1]: -1 });
    await expectCountsMatchVotes();
  });

  test("A-10, M-02: someone who had voted only on the argument it went into keeps that vote", async () => {
    await importance(p1, second.argument, -1);
    await combineFirstIntoSecond();

    expect((await importance(p1, b.argument, 1)).body).toEqual({ status: "already_done" });

    expect(await votesOn(second.argument)).toEqual({ [p1]: -1 });
  });

  test("A-10, M-02, invariant 10: the same queued vote sent twice is once", async () => {
    await importance(p1, b.argument, 1);
    await importance(p2, b.argument, 1);
    await combineFirstIntoSecond();

    expect((await importance(p1, b.argument, -1)).body).toMatchObject({ status: "done" });
    const before = await boardSeq();
    expect((await importance(p1, b.argument, -1)).body).toEqual({ status: "already_done" });

    expect(await boardSeq()).toBe(before);
    expect(await votesOn(second.argument)).toEqual({ [p1]: -1, [p2]: 1 });

    // A withdrawal sent twice is once as well.
    expect((await importance(p2, b.argument, null)).body).toMatchObject({ status: "done" });
    const then = await boardSeq();
    expect((await importance(p2, b.argument, null)).body).toEqual({ status: "already_done" });
    expect(await boardSeq()).toBe(then);
    expect(await votesOn(second.argument)).toEqual({ [p1]: -1 });
    await expectCountsMatchVotes();
  });

  test("A-10, M-02: the vote they already have there, sent again to the argument combined away, changes nothing", async () => {
    await importance(p1, b.argument, 1);
    await combineFirstIntoSecond();
    const before = await boardSeq();

    expect((await importance(p1, b.argument, 1)).body).toEqual({ status: "already_done" });

    expect(await boardSeq()).toBe(before);
    // It wasn't a newer vote, so a flip that follows still applies.
    expect((await importance(p1, b.argument, -1)).body).toMatchObject({ status: "done" });
    expect(await votesOn(second.argument)).toEqual({ [p1]: -1 });
  });

  test("A-10, M-02, PRD §5: with the same vote on both arguments, the vote they cast on the second stands; a flip or withdrawal queued for the first doesn't change it", async () => {
    await importance(p1, b.argument, 1);
    await importance(p1, second.argument, 1);
    await combineFirstIntoSecond();

    expect((await importance(p1, b.argument, -1)).body).toEqual({ status: "already_done" });
    expect((await importance(p1, b.argument, null)).body).toEqual({ status: "already_done" });

    expect(await votesOn(second.argument)).toEqual({ [p1]: 1 });
    await expectCountsMatchVotes();
  });

  test("A-10, M-02, PRD §5: with votes that disagreed, the combine removed both, and the queued vote applies and ends the ask to vote again", async () => {
    await importance(p1, b.argument, 1);
    await importance(p1, second.argument, -1);
    await combineFirstIntoSecond();
    expect(await row(p1, second.argument)).toMatchObject({ myVote: null, askedAgain: true });

    expect((await importance(p1, b.argument, -1)).body).toMatchObject({ status: "done" });

    expect(await votesOn(second.argument)).toEqual({ [p1]: -1 });
    expect((await row(p1, second.argument)).askedAgain).toBeUndefined();
    await expectCountsMatchVotes();
  });

  test("A-10, M-02: through two combines in a row, a flipped vote applies to where its argument ended up", async () => {
    await importance(p1, b.argument, 1);
    await importance(p2, third.argument, 1);
    await combineFirstIntoSecond();
    await combineSecondIntoThird();
    expect(await votesOn(third.argument)).toEqual({ [p1]: 1, [p2]: 1 });

    expect((await importance(p1, b.argument, -1)).body).toMatchObject({ status: "done" });

    expect(await votesOn(third.argument)).toEqual({ [p1]: -1, [p2]: 1 });
    expect(await votesOn(second.argument)).toEqual({});
    expect(await votesOn(b.argument)).toEqual({});
    expect(await row(p1, third.argument)).toMatchObject({ myVote: -1, importance: 0, importanceVoters: 2 });
    expect((await importance(p1, b.argument, -1)).body).toEqual({ status: "already_done" });
    await expectCountsMatchVotes();
  });

  test("A-10, M-02: through two combines, someone who voted between them keeps that vote", async () => {
    await importance(p1, b.argument, 1);
    await combineFirstIntoSecond();
    await importance(p1, second.argument, -1);
    await combineSecondIntoThird();
    expect(await votesOn(third.argument)).toEqual({ [p1]: -1 });

    expect((await importance(p1, b.argument, 1)).body).toEqual({ status: "already_done" });

    expect(await votesOn(third.argument)).toEqual({ [p1]: -1 });
  });

  test("A-10, M-02: through two combines, a vote carried from another argument isn't theirs on the first, so it stands", async () => {
    // p1 never voted on the first argument: their vote on the second is carried to the third.
    await importance(p1, second.argument, -1);
    await combineFirstIntoSecond();
    await combineSecondIntoThird();
    expect(await votesOn(third.argument)).toEqual({ [p1]: -1 });

    expect((await importance(p1, b.argument, 1)).body).toEqual({ status: "already_done" });
    // Sent to the second argument, where the vote came from, a flip is their newest choice.
    expect((await importance(p1, second.argument, 1)).body).toMatchObject({ status: "done" });

    expect(await votesOn(third.argument)).toEqual({ [p1]: 1 });
    await expectCountsMatchVotes();
  });

  test("A-10, J-04: a queued vote that applied is a newer vote, and Undo leaves it as it is", async () => {
    await importance(p1, b.argument, 1);
    await importance(p2, b.argument, 1);
    const combined = await combineFirstIntoSecond();
    await importance(p1, b.argument, -1);

    expect((await undo(combined)).body).toMatchObject({ status: "done" });

    expect(await votesOn(second.argument)).toEqual({ [p1]: -1 });
    expect(await votesOn(b.argument)).toEqual({ [p2]: 1 });
    await expectCountsMatchVotes();
  });
});
