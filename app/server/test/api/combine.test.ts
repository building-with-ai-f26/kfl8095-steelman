import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Combine and separate on the service (M3a-6; A-10, J-05), as architecture
// §2 and §3 have them and M3a-5 designed them, with the prototype's drag
// (the builder's choice, Nov 22): an Editor or the Owner combines one
// wording into another argument in the same option. It moves (its ID never
// changes, so its articulation votes and assessments go with it). When it
// was its argument's last wording, the two arguments become one: the empty
// one keeps its row, pointing where it went, and importance votes merge per
// person (PRD §5): two identical votes become one; two that disagree are
// both removed, and the person is asked to vote again; a vote on only one
// moves. Separating makes one wording its own
// argument, with no importance votes. Undoing either puts it back, keeping
// wordings added since where they were added, and a newer vote over a
// restored one.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(1212);
let b: SeededBoard;
/** A second argument for Yes, so there are two to combine; and a third wording on the first. */
let second: { argument: string; version: string };
let eve: string;
let voters: string[];

beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  second = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Weekend hours suit families." }));
  eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
  voters = [];
  for (const name of ["p1", "p2", "p3", "p4"]) {
    const id = await addAccount(db.client, ids, name, { confirmed: true });
    await addMember(db.client, b.board, id, "voter");
    voters.push(id);
  }
});

const importance = (who: string, argument: string, value: 1 | -1 | null) => api.put(`/api/boards/${b.board}/arguments/${argument}/importance`, { as: who, body: { value } });
const combine = (version: string, into: string, as = eve) => api.post(`/api/boards/${b.board}/versions/${version}/combine`, { as, body: { into } });
const addWording = async (argumentId: string, wording: string) => {
  const id = ids.itemId();
  await api.post(`/api/boards/${b.board}/arguments/${argumentId}/versions`, { as: b.ben, body: { id, wording, context: "" } });
  return id;
};
const lastLog = async () => (await db.client.query("select kind, subject_id, after from change where board_id = $1 order by seq desc limit 1", [b.board])).rows[0];
const separate = (version: string, argumentId: string, as = eve) => api.post(`/api/boards/${b.board}/versions/${version}/separate`, { as, body: { argumentId } });
const undo = (seq: number, as = eve) => api.put(`/api/boards/${b.board}/changes/${seq}/undo`, { as });
const argument = async (id: string) => (await db.client.query("select merged_into, deleted_at, importance, importance_voters from argument where id = $1", [id])).rows[0];
const argumentOf = async (version: string) => (await db.client.query("select argument_id from version where id = $1", [version])).rows[0].argument_id;
const votesOn = async (argumentId: string) =>
  Object.fromEntries((await db.client.query("select account_id, value from importance_vote where argument_id = $1", [argumentId])).rows.map((row) => [row.account_id, row.value]));
const row = async (as: string, id: string) => (await api.get(`/api/boards/${b.board}`, { as })).body.arguments.find((a: { id: string }) => a.id === id);

/** p1 agrees on both, p2 disagrees, p3 voted only on the first, p4 only on the second. */
async function castVotes(): Promise<void> {
  const [p1, p2, p3, p4] = voters as [string, string, string, string];
  await importance(p1, b.argument, 1);
  await importance(p1, second.argument, 1);
  await importance(p2, b.argument, 1);
  await importance(p2, second.argument, -1);
  await importance(p3, b.argument, -1);
  await importance(p4, second.argument, 1);
}

describe("combining", () => {
  test("A-10: an Editor combines one wording into another argument; the argument it left stays, with its other wordings and votes", async () => {
    const extra = await addWording(b.argument, "Sunday suits people who work weekdays.");
    await castVotes();
    const before = { from: await votesOn(b.argument), into: await votesOn(second.argument) };

    const { status, body } = await combine(b.version, second.argument);

    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "done" });
    expect(await argumentOf(b.version)).toBe(second.argument);
    expect(await argumentOf(extra)).toBe(b.argument);
    expect(await argument(b.argument)).toMatchObject({ merged_into: null, deleted_at: null });
    expect({ from: await votesOn(b.argument), into: await votesOn(second.argument) }).toEqual(before);
    expect(await lastLog()).toMatchObject({ kind: "wording_combined", subject_id: b.version, after: { from: b.argument, into: second.argument } });
    expect((await lastLog()).after.merged).toBeUndefined();
  });

  test("A-10: combining an argument's last wording makes the two one; the empty argument keeps its row, pointing where it went", async () => {
    const { body } = await combine(b.version, second.argument);

    expect(await argumentOf(b.version)).toBe(second.argument);
    expect(await argument(b.argument)).toMatchObject({ merged_into: second.argument, deleted_at: null });
    expect(await lastLog()).toMatchObject({ kind: "wording_combined", subject_id: b.version, after: { from: b.argument, into: second.argument, merged: true } });
    // Another reader's poll brings both.
    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${body.seq - 1}`, { as: b.ben })).body;
    expect(changes.arguments.find((a: { id: string }) => a.id === b.argument)).toMatchObject({ mergedInto: second.argument });
    expect(changes.versions.find((v: { id: string }) => v.id === b.version)).toMatchObject({ argumentId: second.argument });
  });

  test("A-10, PRD §5: when the arguments become one, importance votes merge per person: identical become one, disagreeing are removed and asked again, one-sided move", async () => {
    await castVotes();
    const [p1, p2, p3, p4] = voters as [string, string, string, string];

    await combine(b.version, second.argument);

    expect(await votesOn(second.argument)).toEqual({ [p1]: 1, [p3]: -1, [p4]: 1 });
    expect(await votesOn(b.argument)).toEqual({});
    expect(await argument(second.argument)).toMatchObject({ importance: 1, importance_voters: 3 });
    expect(await row(p2, second.argument)).toMatchObject({ myVote: null, askedAgain: true });
    expect((await row(p1, second.argument)).askedAgain).toBeUndefined();
    // Voting again ends the ask.
    await importance(p2, second.argument, 1);
    expect((await row(p2, second.argument)).askedAgain).toBeUndefined();
  });

  test("A-10, Q8: a wording's articulation votes and assessments go with it", async () => {
    await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: voters[0], body: { value: 1 } });
    await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: voters[0], body: { rev: 1, supported: false } });

    await combine(b.version, second.argument);

    const version = (await api.get(`/api/boards/${b.board}`, { as: voters[0] })).body.versions.find((v: { id: string }) => v.id === b.version);
    expect(version).toMatchObject({ argumentId: second.argument, articulation: 1, no: 1, myVote: 1, myAssessment: false });
  });

  test("A-10: only into an argument in the same option, and not into one that's gone", async () => {
    expect((await combine(b.version, b.otherArgument)).body).toEqual({ status: "refused", reason: "not_same_option" });
    await combine(second.version, b.argument);
    const late = await addWording(b.argument, "Libraries are for everyone.");
    expect((await combine(late, second.argument)).body).toEqual({ status: "refused", reason: "argument_deleted" });
  });

  test("A-10, invariant 10: sent twice is once, and into the argument it's already in is already done", async () => {
    await combine(b.version, second.argument);
    const seq = Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

    expect((await combine(b.version, second.argument)).body).toEqual({ status: "already_done" });
    expect((await combine(second.version, second.argument)).body).toEqual({ status: "already_done" });
    expect(Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq)).toBe(seq);
  });

  test("A-10, H-03: a Contributor can't combine", async () => {
    expect((await combine(b.version, second.argument, b.ben)).body).toEqual({ status: "refused", reason: "not_allowed" });
  });
});

describe("separating", () => {
  test("A-10: one wording becomes its own argument, at the end of its option, with no importance votes", async () => {
    await combine(b.version, second.argument);
    await importance(voters[0]!, second.argument, 1);
    const fresh = ids.itemId();

    expect((await separate(b.version, fresh)).body).toMatchObject({ status: "done" });

    expect(await argumentOf(b.version)).toBe(fresh);
    expect(await argument(fresh)).toMatchObject({ merged_into: null, importance: 0, importance_voters: 0 });
    expect(await votesOn(fresh)).toEqual({});
    const option = (await db.client.query("select option_id from argument where id = $1", [fresh])).rows[0].option_id;
    expect(option).toBe(b.yes);
    expect((await separate(b.version, fresh)).body).toEqual({ status: "already_done" });
  });

  test("A-10: an argument's only wording can't be separated from it", async () => {
    expect((await separate(second.version, ids.itemId())).body).toEqual({ status: "refused", reason: "only_wording" });
  });
});

describe("undo", () => {
  test("A-10, J-04: undoing a combine that made one argument puts the wording and votes back; a wording added since stays where it was added", async () => {
    await castVotes();
    const [p1, p2, p3, p4] = voters as [string, string, string, string];
    const { body } = await combine(b.version, second.argument);
    const added = await addWording(second.argument, "Sunday is family day.");

    expect((await undo(body.seq)).body).toMatchObject({ status: "done" });

    expect(await argumentOf(b.version)).toBe(b.argument);
    expect(await argumentOf(added)).toBe(second.argument);
    expect(await argument(b.argument)).toMatchObject({ merged_into: null });
    expect(await votesOn(b.argument)).toEqual({ [p1]: 1, [p2]: 1, [p3]: -1 });
    expect(await votesOn(second.argument)).toEqual({ [p1]: 1, [p2]: -1, [p4]: 1 });
    expect(await argument(second.argument)).toMatchObject({ importance: 1, importance_voters: 3 });
    expect((await row(p2, second.argument)).askedAgain).toBeUndefined();
    expect(await lastLog()).toMatchObject({ kind: "wording_uncombined", subject_id: b.version, after: { from: b.argument, into: second.argument, undoes: body.seq } });
    expect((await undo(body.seq)).body).toEqual({ status: "already_done" });
  });

  test("A-10, J-04: undoing a combine of one of several wordings moves just that wording back", async () => {
    const extra = await addWording(b.argument, "Sunday suits people who work weekdays.");
    const { body } = await combine(extra, second.argument);

    expect((await undo(body.seq)).body).toMatchObject({ status: "done" });

    expect(await argumentOf(extra)).toBe(b.argument);
    expect(await argumentOf(b.version)).toBe(b.argument);
    expect(await argumentOf(second.version)).toBe(second.argument);
  });

  test("J-04: a newer vote on the combined argument wins over a restored one", async () => {
    await castVotes();
    const [p1] = voters as [string];
    const { body } = await combine(b.version, second.argument);
    await importance(p1, second.argument, -1);

    await undo(body.seq);

    expect((await votesOn(second.argument))[p1]).toBe(-1);
    expect((await votesOn(b.argument))[p1]).toBeUndefined();
  });

  test("J-04: a combine isn't undone once the wording moved again, and says why", async () => {
    const third = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Libraries are for everyone." }));
    const first = (await combine(b.version, second.argument)).body.seq;
    await combine(b.version, third.argument);
    expect((await undo(first)).body).toEqual({ status: "refused", reason: "combined_since" });
  });

  test("J-04: undos of two combines into one argument go newest first, so each person's votes come back as they were", async () => {
    const third = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Libraries are for everyone." }));
    const [p1] = voters as [string];
    await importance(p1, b.argument, 1);
    await importance(p1, third.argument, -1);
    const first = (await combine(b.version, second.argument)).body.seq;
    const later = (await combine(third.version, second.argument)).body.seq;

    expect((await undo(first)).body).toEqual({ status: "refused", reason: "combined_since" });
    expect((await undo(later)).body).toMatchObject({ status: "done" });
    expect((await undo(first)).body).toMatchObject({ status: "done" });

    expect(await votesOn(b.argument)).toEqual({ [p1]: 1 });
    expect(await votesOn(second.argument)).toEqual({});
    expect(await votesOn(third.argument)).toEqual({ [p1]: -1 });
  });

  test("J-04: a vote withdrawn after a combine is a newer vote, and Undo leaves it withdrawn", async () => {
    const [p1] = voters as [string];
    await importance(p1, b.argument, 1);
    const { body } = await combine(b.version, second.argument);
    await importance(p1, second.argument, null);

    await undo(body.seq);

    expect(await votesOn(b.argument)).toEqual({});
    expect(await votesOn(second.argument)).toEqual({});
  });

  test("A-10, PRD §5: someone asked to vote again is still asked when that argument is combined into another", async () => {
    const third = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Libraries are for everyone." }));
    const [, p2] = voters as [string, string];
    await importance(p2, b.argument, 1);
    await importance(p2, second.argument, -1);
    await combine(b.version, second.argument);
    expect(await row(p2, second.argument)).toMatchObject({ askedAgain: true });

    const moved = (await combine(b.version, third.argument)).body.seq;
    await combine(second.version, third.argument);

    expect(await row(p2, third.argument)).toMatchObject({ askedAgain: true });
    await importance(p2, third.argument, 1);
    expect((await row(p2, third.argument)).askedAgain).toBeUndefined();
    expect(moved).toBeGreaterThan(0);
  });

  test("J-04: an undo can't itself be undone this way, and a combine whose wording was deleted since isn't undone", async () => {
    const extra = await addWording(b.argument, "Sunday suits people who work weekdays.");
    const { body } = await combine(extra, second.argument);
    const undone = (await undo(body.seq)).body.seq;
    expect((await undo(undone)).body).toEqual({ status: "refused", reason: "cant_undo" });

    const again = (await combine(extra, second.argument)).body.seq;
    await api.delete(`/api/boards/${b.board}/versions/${extra}`, { as: b.ben });
    expect((await undo(again)).body).toEqual({ status: "refused", reason: "version_deleted" });
  });

  test("A-10, J-04: undoing a separation leaves the new argument open when someone added a wording to it since", async () => {
    await combine(b.version, second.argument);
    const fresh = ids.itemId();
    const { body } = await separate(b.version, fresh);
    const added = await addWording(fresh, "Sunday is when families are free.");

    await undo(body.seq);

    expect(await argumentOf(b.version)).toBe(second.argument);
    expect(await argumentOf(added)).toBe(fresh);
    expect((await argument(fresh)).deleted_at).toBeNull();
  });

  test("A-10: separating with an ID already used is refused, and a wording combined in can be separated again", async () => {
    const extra = await addWording(b.argument, "Sunday suits people who work weekdays.");
    expect((await separate(extra, b.argument)).body).toEqual({ status: "refused", reason: "id_taken" });
    await combine(b.version, second.argument);
    await combine(extra, second.argument);
    expect((await separate(extra, ids.itemId())).body).toMatchObject({ status: "done" });
  });

  test("M-02, A-10: a vote and a new wording follow two combines in a row", async () => {
    const third = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Libraries are for everyone." }));
    const [p1] = voters as [string];
    await combine(b.version, second.argument);
    await combine(b.version, third.argument);
    await combine(second.version, third.argument);

    expect((await importance(p1, b.argument, 1)).body).toMatchObject({ status: "done" });
    expect(await votesOn(third.argument)).toEqual({ [p1]: 1 });
    const id = await addWording(b.argument, "Late but welcome.");
    expect(await argumentOf(id)).toBe(third.argument);
  });

  test("A-10, J-04: undoing a separation moves the wording back and closes the new argument", async () => {
    await combine(b.version, second.argument);
    const fresh = ids.itemId();
    const { body } = await separate(b.version, fresh);

    expect((await undo(body.seq)).body).toMatchObject({ status: "done" });

    expect(await argumentOf(b.version)).toBe(second.argument);
    expect((await argument(fresh)).deleted_at).not.toBeNull();
  });

  test("J-04: only a combine or a separation can be undone this way", async () => {
    const { body } = await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: eve, body: { reason: "spam" } });

    expect((await undo(body.seq)).body).toEqual({ status: "refused", reason: "cant_undo" });
  });
});

describe("stale writes after a combine (architecture §3)", () => {
  test("M-02, A-10: an importance vote on a combined argument applies to the one it went into, unless you'd voted there", async () => {
    const [p1, p2] = voters as [string, string];
    await importance(p2, second.argument, -1);
    await combine(b.version, second.argument);

    expect((await importance(p1, b.argument, 1)).body).toMatchObject({ status: "done" });
    expect((await importance(p2, b.argument, 1)).body).toEqual({ status: "already_done" });

    expect(await votesOn(second.argument)).toEqual({ [p1]: 1, [p2]: -1 });
  });

  test("M-02, A-10: a new wording on a combined argument is added to the one it went into", async () => {
    await combine(b.version, second.argument);
    const id = ids.itemId();

    expect((await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id, wording: "Late but welcome.", context: "" } })).body).toMatchObject({ status: "done" });

    expect(await argumentOf(id)).toBe(second.argument);
  });

  test("M-02, A-10: an articulation vote on a wording that moved applies (its ID never changes)", async () => {
    await combine(b.version, second.argument);

    expect((await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: voters[0], body: { value: -1 } })).body).toMatchObject({ status: "done" });
  });
});

describe("the dialog's preview (M3a-7)", () => {
  const preview = (as: string, version = b.version) => api.get(`/api/boards/${b.board}/versions/${version}/combine?into=${second.argument}`, { as });

  test("A-10: says whether the arguments become one, and how many would be asked to vote again, never who", async () => {
    await castVotes();
    expect((await preview(eve)).body).toEqual({ last: true, asked: 1, you: false });
    await importance(eve, b.argument, 1);
    await importance(eve, second.argument, -1);
    expect((await preview(eve)).body).toEqual({ last: true, asked: 2, you: true });
    const extra = await addWording(b.argument, "Sunday suits people who work weekdays.");
    expect((await preview(eve, extra)).body).toEqual({ last: false, asked: 0, you: false });
  });

  test("A-10, H-03: only someone who may combine reads it", async () => {
    expect((await preview(b.ben)).status).toBe(403);
  });
});

describe("account deletion", () => {
  test("A-10, M-07: votes a combine set aside go with a deleted account, even when that was their only mark on the board", async () => {
    const [, p2] = voters as [string, string];
    await importance(p2, b.argument, 1);
    await importance(p2, second.argument, -1);
    const { body } = await combine(b.version, second.argument);
    await db.client.query("delete from board_member where board_id = $1 and account_id = $2", [b.board, p2]);
    const username = (await db.client.query("select username from account where id = $1", [p2])).rows[0].username;

    expect((await api.post("/api/account/delete", { as: p2, body: { username } })).status).toBe(200);

    expect((await db.client.query("select count(*)::int as n from combine_vote where account_id = $1", [p2])).rows[0].n).toBe(0);
    await undo(body.seq);
    expect(await votesOn(b.argument)).toEqual({});
    expect(await votesOn(second.argument)).toEqual({});
  });

  test("A-10, M-07: Download your data includes votes a combine set aside", async () => {
    const [, p2] = voters as [string, string];
    await importance(p2, b.argument, 1);
    await importance(p2, second.argument, -1);
    await combine(b.version, second.argument);

    const data = (await api.get("/api/account/data", { as: p2 })).body;

    expect(data.votes.setAsideByCombine).toEqual([{ board: b.board, combine: expect.any(Number), from: b.argument, into: second.argument, fromValue: 1, intoValue: -1, askedAgain: true }]);
  });

  test("A-10, M-07: a deleted account's votes set aside by a combine go with it", async () => {
    await castVotes();
    const [p1] = voters as [string];
    await combine(b.version, second.argument);
    const username = (await db.client.query("select username from account where id = $1", [p1])).rows[0].username;

    expect((await api.post("/api/account/delete", { as: p1, body: { username } })).status).toBe(200);

    expect((await db.client.query("select count(*)::int as n from combine_vote where account_id = $1", [p1])).rows[0].n).toBe(0);
  });
});
