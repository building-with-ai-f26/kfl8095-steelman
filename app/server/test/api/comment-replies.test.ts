import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Replies, resolving, and reopening on the service (M3b-9, D-01). A reply goes
// one level deep, under a thread's first comment, and names the same target
// as its thread. Resolve and reopen set a flag on the first comment. Anyone
// who can comment may do all three to any thread, on a closed board too, as
// in the prototype and Google Docs. None of them adds a row to the change log.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3901);

const PERSONAS = ["owner", "editor", "contributor", "voter", "viewer", "signed out", "non-member"] as const;
type Persona = (typeof PERSONAS)[number];

let b: SeededBoard;
let person: Record<Persona, string | null>;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  person = { owner: b.ana, contributor: b.ben, "signed out": null } as Record<Persona, string | null>;
  for (const [persona, name] of [["editor", "eve"], ["voter", "vic"], ["viewer", "val"]] as const) {
    person[persona] = await addAccount(db.client, ids, name, { confirmed: true });
    await addMember(db.client, b.board, person[persona]!, persona);
  }
  person["non-member"] = await addAccount(db.client, ids, "sam", { confirmed: true });
});

type Target = { versionId?: string; optionId?: string };
const as = (who: string | null) => (who === null ? {} : { as: who });
const add = (who: string | null, body: Target & { id?: string; body?: string; parentId?: string } = {}) =>
  api.post(`/api/boards/${b.board}/comments`, { ...as(who), body: { id: body.id ?? ids.itemId(), body: body.body ?? "Which survey is this from?", ...body } });
const reply = (who: string | null, parentId: string, body: Target & { id?: string; body?: string } = { versionId: b.version }) =>
  api.post(`/api/boards/${b.board}/comments`, { ...as(who), body: { id: body.id ?? ids.itemId(), body: body.body ?? "The 2024 visitor survey.", parentId, ...body } });
const resolve = (who: string | null, comment: string) => api.put(`/api/boards/${b.board}/comments/${comment}/resolved`, as(who));
const reopen = (who: string | null, comment: string) => api.delete(`/api/boards/${b.board}/comments/${comment}/resolved`, as(who));
const remove = (who: string | null, comment: string) => api.delete(`/api/boards/${b.board}/comments/${comment}`, as(who));
const row = async (id: string) => (await db.client.query("select * from comment where id = $1", [id])).rows[0];
const hide = (comment: string) =>
  write(db.client, b.board, (seq) => db.client.query("update comment set hidden_at = now(), hidden_by = $2, changed_seq = $3 where id = $1", [comment, b.ana, seq]));
const seqOf = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

/** A thread on the seeded wording, started by Ben. */
async function thread(target: Target = { versionId: b.version }): Promise<string> {
  const id = ids.itemId();
  expect((await add(b.ben, { id, ...target })).status).toBe(200);
  return id;
}

describe("who may reply, resolve, and reopen", () => {
  test("D-01, H-03: anyone who can read may reply to any thread; signed out and a non-member may not, and a refusal uses no change number", async () => {
    const first = await thread();
    for (const persona of PERSONAS) {
      const before = await seqOf();
      const answer = await reply(person[persona], first);
      const allowed = persona !== "signed out" && persona !== "non-member";
      expect(answer.status, persona).toBe(allowed ? 200 : persona === "signed out" ? 401 : 403);
      if (!allowed) expect(await seqOf(), persona).toBe(before);
    }
  });

  test("D-01, H-03: anyone who can read may resolve and reopen someone else's thread; signed out and a non-member may not, and a refusal uses no change number", async () => {
    for (const persona of PERSONAS) {
      const first = await thread();
      const allowed = persona !== "signed out" && persona !== "non-member";
      const status = allowed ? 200 : persona === "signed out" ? 401 : 403;

      let before = await seqOf();
      expect((await resolve(person[persona], first)).status, `${persona} resolves`).toBe(status);
      if (!allowed) {
        expect(await seqOf(), persona).toBe(before);
        expect((await row(first)).resolved_at, persona).toBeNull();
        expect((await resolve(b.ben, first)).status).toBe(200);
      }
      before = await seqOf();
      expect((await reopen(person[persona], first)).status, `${persona} reopens`).toBe(status);
      if (!allowed) {
        expect(await seqOf(), persona).toBe(before);
        expect((await row(first)).resolved_at, persona).toBeInstanceOf(Date);
      }
    }
  });

  test("D-01, I-05: a board closed by its route accepts a reply, a resolve, and a reopen from a Viewer", async () => {
    const first = await thread();
    expect((await api.put(`/api/boards/${b.board}/closed`, { as: b.ana })).status).toBe(200);

    expect((await reply(person.viewer, first)).body).toMatchObject({ status: "done" });
    expect((await resolve(person.viewer, first)).body).toMatchObject({ status: "done" });
    expect((await reopen(person.viewer, first)).body).toMatchObject({ status: "done" });
  });
});

describe("replying", () => {
  test("D-01: a reply sits under its thread's first comment and keeps the thread's target, its author, time, and text", async () => {
    const first = await thread();
    const id = ids.itemId();
    expect((await reply(person.viewer, first, { id, versionId: b.version })).body).toMatchObject({ status: "done" });

    expect(await row(id)).toMatchObject({ board_id: b.board, parent_id: first, version_id: b.version, option_id: null, author_id: person.viewer, body: "The 2024 visitor survey.", resolved_at: null });
    expect((await row(id)).created_at).toBeInstanceOf(Date);

    const onQuestion = await thread({});
    const onOption = await thread({ optionId: b.no });
    const [toQuestion, toOption] = [ids.itemId(), ids.itemId()];
    expect((await reply(b.ana, onQuestion, { id: toQuestion })).status).toBe(200);
    expect((await reply(b.ana, onOption, { id: toOption, optionId: b.no })).status).toBe(200);
    expect(await row(toQuestion)).toMatchObject({ parent_id: onQuestion, option_id: null, version_id: null });
    expect(await row(toOption)).toMatchObject({ parent_id: onOption, option_id: b.no, version_id: null });
  });

  test("D-01: a reply to a reply is refused, and nothing is added", async () => {
    const first = await thread();
    const second = ids.itemId();
    await reply(b.ana, first, { id: second, versionId: b.version });
    const before = await seqOf();

    const answer = await reply(b.ben, second);
    expect(answer.status).toBe(409);
    expect(answer.body).toEqual({ status: "refused", reason: "not_a_thread" });
    expect(await seqOf()).toBe(before);
    expect((await db.client.query("select count(*)::int as n from comment where board_id = $1", [b.board])).rows[0].n).toBe(2);
  });

  test("D-01: a reply naming another target than its thread's is refused, and nothing is added", async () => {
    const first = await thread();
    const before = await seqOf();

    for (const target of [{}, { optionId: b.yes }, { versionId: b.otherVersion }]) {
      const answer = await reply(b.ben, first, target);
      expect(answer.status, JSON.stringify(target)).toBe(409);
      expect(answer.body, JSON.stringify(target)).toEqual({ status: "refused", reason: "not_same_thread" });
    }
    expect(await seqOf()).toBe(before);
    expect((await db.client.query("select count(*)::int as n from comment where parent_id = $1", [first])).rows[0].n).toBe(0);
  });

  test("D-01, M-01: a reply to a thread resolved meanwhile is refused, and nothing is added (architecture §3)", async () => {
    const first = await thread();
    // Val opens the reply box; Eve resolves the thread before Val sends.
    expect((await resolve(person.editor, first)).status).toBe(200);
    const before = await seqOf();

    const answer = await reply(person.viewer, first);
    expect(answer.status).toBe(409);
    expect(answer.body).toEqual({ status: "refused", reason: "thread_resolved" });
    expect(await seqOf()).toBe(before);

    expect((await reopen(person.editor, first)).status).toBe(200);
    expect((await reply(person.viewer, first)).body).toMatchObject({ status: "done" });
  });

  test("D-01: a reply to a thread on a deleted wording is refused, as a comment on it is", async () => {
    const deleted = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Deleted later." }));
    const first = await thread({ versionId: deleted.version });
    expect((await api.delete(`/api/boards/${b.board}/versions/${deleted.version}`, { as: b.ben })).status).toBe(200);

    expect((await reply(b.ana, first, { versionId: deleted.version })).body).toEqual({ status: "refused", reason: "version_deleted" });
  });

  test("D-01: a reply to a first comment its author deleted, or a moderator hid, is refused, as the prototype draws no Reply on one", async () => {
    const deleted = await thread();
    expect((await remove(b.ben, deleted)).status).toBe(200);
    const hidden = await thread();
    await hide(hidden);
    const before = await seqOf();

    for (const first of [deleted, hidden]) {
      const answer = await reply(b.ana, first);
      expect(answer.status).toBe(409);
      expect(answer.body).toEqual({ status: "refused", reason: "thread_deleted" });
    }
    expect(await seqOf()).toBe(before);
    expect((await db.client.query("select count(*)::int as n from comment where parent_id = any($1)", [[deleted, hidden]])).rows[0].n).toBe(0);
  });

  test("D-01, M-01: a reply saved before its first comment was deleted, sent again afterwards, is already done, not refused", async () => {
    const first = await thread();
    const id = ids.itemId();
    expect((await reply(b.ana, first, { id, versionId: b.version })).body).toMatchObject({ status: "done" });
    expect((await remove(b.ben, first)).body).toMatchObject({ status: "done" });

    expect((await reply(b.ana, first, { id, versionId: b.version })).body).toEqual({ status: "already_done" });
  });

  test("D-01: a parent on another board, or one that doesn't exist, isn't found", async () => {
    const other = await seedBoard(db.client, ids);
    const there = ids.itemId();
    expect((await api.post(`/api/boards/${other.board}/comments`, { as: other.ben, body: { id: there, body: "Elsewhere." } })).status).toBe(200);

    for (const answer of [await reply(b.ben, there, {}), await reply(b.ben, ids.itemId())]) {
      expect(answer.status).toBe(404);
      expect(answer.body).toEqual({ reason: "not_found" });
    }
  });
});

describe("resolving and reopening", () => {
  test("D-01: resolve sets the flag on the first comment and reopen clears it; the thread's replies aren't touched", async () => {
    const first = await thread();
    const second = ids.itemId();
    await reply(b.ana, first, { id: second, versionId: b.version });

    expect((await resolve(person.viewer, first)).body).toMatchObject({ status: "done" });
    expect((await row(first)).resolved_at).toBeInstanceOf(Date);
    expect((await row(second)).resolved_at).toBeNull();

    expect((await reopen(person.viewer, first)).body).toMatchObject({ status: "done" });
    expect((await row(first)).resolved_at).toBeNull();
  });

  test("D-01: resolving or reopening a reply is refused, since only a first comment starts a thread", async () => {
    const first = await thread();
    const second = ids.itemId();
    await reply(b.ana, first, { id: second, versionId: b.version });
    const before = await seqOf();

    for (const send of [resolve, reopen]) {
      const answer = await send(b.ben, second);
      expect(answer.status).toBe(409);
      expect(answer.body).toEqual({ status: "refused", reason: "not_a_thread" });
    }
    expect(await seqOf()).toBe(before);
    expect((await row(second)).resolved_at).toBeNull();
  });

  test("D-01: resolving or reopening a thread whose first comment its author deleted, or a moderator hid, is refused, as the prototype draws neither on one", async () => {
    const [deleted, hidden] = [await thread(), await thread()];
    const [deletedResolved, hiddenResolved] = [await thread(), await thread()];
    for (const first of [deletedResolved, hiddenResolved]) expect((await resolve(b.ana, first)).body).toMatchObject({ status: "done" });
    for (const first of [deleted, deletedResolved]) expect((await remove(b.ben, first)).body).toMatchObject({ status: "done" });
    for (const first of [hidden, hiddenResolved]) await hide(first);
    const before = await seqOf();

    for (const first of [deleted, hidden]) {
      const answer = await resolve(b.ana, first);
      expect(answer.status).toBe(409);
      expect(answer.body).toEqual({ status: "refused", reason: "thread_deleted" });
      expect((await row(first)).resolved_at).toBeNull();
    }
    for (const first of [deletedResolved, hiddenResolved]) {
      const answer = await reopen(b.ana, first);
      expect(answer.status).toBe(409);
      expect(answer.body).toEqual({ status: "refused", reason: "thread_deleted" });
      expect((await row(first)).resolved_at).toBeInstanceOf(Date);
    }
    expect(await seqOf()).toBe(before);

    // Sent again, a resolve or reopen that already took effect is still already done.
    expect((await resolve(b.ana, deletedResolved)).body).toEqual({ status: "already_done" });
    expect((await reopen(b.ana, deleted)).body).toEqual({ status: "already_done" });
  });

  test("D-01: a comment on another board, or one that doesn't exist, isn't found", async () => {
    const other = await seedBoard(db.client, ids);
    const there = ids.itemId();
    expect((await api.post(`/api/boards/${other.board}/comments`, { as: other.ben, body: { id: there, body: "Elsewhere." } })).status).toBe(200);

    for (const send of [resolve, reopen]) {
      for (const comment of [there, ids.itemId()]) {
        const answer = await send(b.ben, comment);
        expect(answer.status).toBe(404);
        expect(answer.body).toEqual({ reason: "not_found" });
      }
    }
  });
});

describe("sent twice", () => {
  test("D-01, M-01: a reply sent twice is already done and changes nothing; the same ID with other text, under another thread, or from another person, is refused", async () => {
    const first = await thread();
    const id = ids.itemId();
    await reply(b.ana, first, { id, versionId: b.version });
    const before = await seqOf();

    expect((await reply(b.ana, first, { id, versionId: b.version })).body).toEqual({ status: "already_done" });
    expect(await seqOf()).toBe(before);
    const elsewhere = await thread();
    expect((await reply(b.ana, first, { id, versionId: b.version, body: "Something else." })).body).toEqual({ status: "refused", reason: "id_taken" });
    expect((await reply(b.ana, elsewhere, { id, versionId: b.version })).body).toEqual({ status: "refused", reason: "id_taken" });
    expect((await reply(b.ben, first, { id, versionId: b.version })).body).toEqual({ status: "refused", reason: "id_taken" });
    // A first comment sent again with the reply's ID isn't the reply either.
    expect((await add(b.ana, { id, versionId: b.version, body: "The 2024 visitor survey." })).body).toEqual({ status: "refused", reason: "id_taken" });
    expect(await row(id)).toMatchObject({ parent_id: first, body: "The 2024 visitor survey." });
  });

  test("D-01, M-01: a reply saved before its thread was resolved, sent again afterwards, is already done, not refused", async () => {
    const first = await thread();
    const id = ids.itemId();
    await reply(b.ana, first, { id, versionId: b.version });
    expect((await resolve(b.ben, first)).body).toMatchObject({ status: "done" });
    expect((await row(first)).resolved_at).toBeInstanceOf(Date);
    const before = await seqOf();

    expect((await reply(b.ana, first, { id, versionId: b.version })).body).toEqual({ status: "already_done" });
    expect(await seqOf()).toBe(before);
  });

  test("D-01, M-01: resolve sent twice is already done and keeps the first time; reopen sent twice is already done", async () => {
    const first = await thread();
    await resolve(b.ana, first);
    const resolvedAt = (await row(first)).resolved_at;
    api.clock.advance(60_000);
    let before = await seqOf();

    expect((await resolve(person.viewer, first)).body).toEqual({ status: "already_done" });
    expect(await seqOf()).toBe(before);
    expect((await row(first)).resolved_at).toEqual(resolvedAt);

    await reopen(b.ana, first);
    before = await seqOf();
    expect((await reopen(person.viewer, first)).body).toEqual({ status: "already_done" });
    expect(await seqOf()).toBe(before);
    expect((await row(first)).resolved_at).toBeNull();
  });
});

describe("deleting and the change log", () => {
  test("D-01: deleting a first comment keeps its replies' rows, text and all", async () => {
    const first = await thread();
    const [one, two] = [ids.itemId(), ids.itemId()];
    await reply(b.ana, first, { id: one, versionId: b.version, body: "The 2024 visitor survey." });
    await reply(person.viewer, first, { id: two, versionId: b.version, body: "It asked 400 people." });

    expect((await remove(b.ben, first)).body).toMatchObject({ status: "done" });

    expect((await row(first)).body).toBeNull();
    expect(await row(one)).toMatchObject({ parent_id: first, body: "The 2024 visitor survey.", deleted_at: null });
    expect(await row(two)).toMatchObject({ parent_id: first, body: "It asked 400 people.", deleted_at: null });
  });

  test("D-01: an author deletes their own reply, and only they may", async () => {
    const first = await thread();
    const id = ids.itemId();
    await reply(person.viewer, first, { id, versionId: b.version });

    expect((await remove(b.ben, id)).status).toBe(403);
    expect((await remove(person.viewer, id)).body).toMatchObject({ status: "done" });
    expect((await row(id)).body).toBeNull();
  });

  test("D-01: replying, resolving, and reopening add no row to the change log", async () => {
    const first = await thread();
    expect((await reply(b.ana, first)).body).toMatchObject({ status: "done" });
    expect((await resolve(b.ana, first)).body).toMatchObject({ status: "done" });
    expect((await reopen(b.ana, first)).body).toMatchObject({ status: "done" });

    expect((await db.client.query("select count(*)::int as n from change where board_id = $1", [b.board])).rows[0].n).toBe(0);
  });
});
