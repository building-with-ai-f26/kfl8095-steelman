import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Combine and separate on the service (M3a-6; A-10, J-05), as architecture
// §2 and §3 have them and M3a-5 designed them. An Editor or the Owner
// combines one argument into another in the same option: every wording
// moves (its ID never changes, so its articulation votes and assessments
// go with it), and the argument combined away keeps its row, pointing where
// they went. Importance votes merge per person (PRD §5): two identical votes
// become one; two that disagree are both removed, and the person is asked to
// vote again; a vote on only one moves. Separating makes one wording its own
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
const combine = (from: string, into: string, as = eve) => api.post(`/api/boards/${b.board}/arguments/${from}/combine`, { as, body: { into } });
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
  test("A-10: an Editor combines one argument into another: its wordings move, and it keeps its row, pointing where they went", async () => {
    const { status, body } = await combine(b.argument, second.argument);

    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "done" });
    expect(await argumentOf(b.version)).toBe(second.argument);
    expect(await argument(b.argument)).toMatchObject({ merged_into: second.argument, deleted_at: null });
    const log = (await db.client.query("select kind, subject_id, after from change where board_id = $1 order by seq desc limit 1", [b.board])).rows[0];
    expect(log).toMatchObject({ kind: "arguments_combined", subject_id: b.argument, after: { into: second.argument, versions: [b.version] } });
    // Another reader's poll brings both.
    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${body.seq - 1}`, { as: b.ben })).body;
    expect(changes.arguments.find((a: { id: string }) => a.id === b.argument)).toMatchObject({ mergedInto: second.argument });
    expect(changes.versions.find((v: { id: string }) => v.id === b.version)).toMatchObject({ argumentId: second.argument });
  });

  test("A-10, PRD §5: importance votes merge per person: identical become one, disagreeing are removed and asked again, one-sided move", async () => {
    await castVotes();
    const [p1, p2, p3, p4] = voters as [string, string, string, string];

    await combine(b.argument, second.argument);

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

    await combine(b.argument, second.argument);

    const version = (await api.get(`/api/boards/${b.board}`, { as: voters[0] })).body.versions.find((v: { id: string }) => v.id === b.version);
    expect(version).toMatchObject({ argumentId: second.argument, articulation: 1, no: 1, myVote: 1, myAssessment: false });
  });

  test("A-10: only arguments in the same option, not one into itself, and not into one that's gone", async () => {
    expect((await combine(b.argument, b.otherArgument)).body).toEqual({ status: "refused", reason: "not_same_option" });
    expect((await combine(b.argument, b.argument)).body).toEqual({ status: "refused", reason: "not_same_option" });
    await combine(second.argument, b.argument);
    expect((await combine(b.argument, second.argument)).body).toEqual({ status: "refused", reason: "argument_deleted" });
  });

  test("A-10, invariant 10: sent twice is once", async () => {
    await combine(b.argument, second.argument);
    const seq = Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

    expect((await combine(b.argument, second.argument)).body).toEqual({ status: "already_done" });
    expect(Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq)).toBe(seq);
  });

  test("A-10, H-03: a Contributor can't combine", async () => {
    expect((await combine(b.argument, second.argument, b.ben)).body).toEqual({ status: "refused", reason: "not_allowed" });
  });
});

describe("separating", () => {
  test("A-10: one wording becomes its own argument, at the end of its option, with no importance votes", async () => {
    await combine(b.argument, second.argument);
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
  test("A-10, J-04: undoing a combine puts the wordings and votes back; a wording added since stays where it was added", async () => {
    await castVotes();
    const [p1, p2, p3, p4] = voters as [string, string, string, string];
    const { body } = await combine(b.argument, second.argument);
    const added = ids.itemId();
    await api.post(`/api/boards/${b.board}/arguments/${second.argument}/versions`, { as: b.ben, body: { id: added, wording: "Sunday is family day.", context: "" } });

    expect((await undo(body.seq)).body).toMatchObject({ status: "done" });

    expect(await argumentOf(b.version)).toBe(b.argument);
    expect(await argumentOf(added)).toBe(second.argument);
    expect(await argument(b.argument)).toMatchObject({ merged_into: null });
    expect(await votesOn(b.argument)).toEqual({ [p1]: 1, [p2]: 1, [p3]: -1 });
    expect(await votesOn(second.argument)).toEqual({ [p1]: 1, [p2]: -1, [p4]: 1 });
    expect(await argument(second.argument)).toMatchObject({ importance: 1, importance_voters: 3 });
    expect((await row(p2, second.argument)).askedAgain).toBeUndefined();
    expect((await db.client.query("select kind from change where board_id = $1 order by seq desc limit 1", [b.board])).rows[0].kind).toBe("arguments_uncombined");
    expect((await undo(body.seq)).body).toEqual({ status: "already_done" });
  });

  test("J-04: a newer vote on the combined argument wins over a restored one", async () => {
    await castVotes();
    const [p1] = voters as [string];
    const { body } = await combine(b.argument, second.argument);
    await importance(p1, second.argument, -1);

    await undo(body.seq);

    expect((await votesOn(second.argument))[p1]).toBe(-1);
    expect((await votesOn(b.argument))[p1]).toBeUndefined();
  });

  test("J-04: a combine that a later combine built on isn't undone, and says why", async () => {
    const third = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Libraries are for everyone." }));
    const { body } = await combine(b.argument, second.argument);
    await combine(second.argument, third.argument);

    expect((await undo(body.seq)).body).toEqual({ status: "refused", reason: "combined_since" });
  });

  test("A-10, J-04: undoing a separation moves the wording back and closes the new argument", async () => {
    await combine(b.argument, second.argument);
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
    await combine(b.argument, second.argument);

    expect((await importance(p1, b.argument, 1)).body).toMatchObject({ status: "done" });
    expect((await importance(p2, b.argument, 1)).body).toEqual({ status: "already_done" });

    expect(await votesOn(second.argument)).toEqual({ [p1]: 1, [p2]: -1 });
  });

  test("M-02, A-10: a new wording on a combined argument is added to the one it went into", async () => {
    await combine(b.argument, second.argument);
    const id = ids.itemId();

    expect((await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id, wording: "Late but welcome.", context: "" } })).body).toMatchObject({ status: "done" });

    expect(await argumentOf(id)).toBe(second.argument);
  });

  test("M-02, A-10: an articulation vote on a wording that moved applies (its ID never changes)", async () => {
    await combine(b.argument, second.argument);

    expect((await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: voters[0], body: { value: -1 } })).body).toMatchObject({ status: "done" });
  });
});

describe("account deletion", () => {
  test("A-10, M-07: a deleted account's votes set aside by a combine go with it", async () => {
    await castVotes();
    const [p1] = voters as [string];
    await combine(b.argument, second.argument);
    const username = (await db.client.query("select username from account where id = $1", [p1])).rows[0].username;

    expect((await api.post("/api/account/delete", { as: p1, body: { username } })).status).toBe(200);

    expect((await db.client.query("select count(*)::int as n from combine_vote where account_id = $1", [p1])).rows[0].n).toBe(0);
  });
});
