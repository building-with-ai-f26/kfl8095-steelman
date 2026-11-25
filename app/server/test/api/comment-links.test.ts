import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// A link to a comment (M3b-13, D-01, M-06). The snapshot leaves out comments
// whose subject is gone (M3b-10), so a browser opening /b/<board>/c/<comment>
// can't tell a comment on a deleted wording from one that never was. It asks
// this read, which answers only the comment's state, never its text or its
// author, and always 200 for someone who may read the board, so the browser
// logs no failed request: "stands", "deleted" (an unknown ID, or one from
// another board, reads the same), or "subject_removed".

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3813);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

type Target = { versionId?: string; optionId?: string; parentId?: string };
const add = async (as: string, target: Target = {}, body = "Which survey is this from?") => {
  const id = ids.itemId();
  const answer = await api.post(`/api/boards/${b.board}/comments`, { as, body: { id, body, ...target } });
  expect(answer.body, "the comment was added").toMatchObject({ status: "done" });
  return id;
};
const ok = (answer: { body: { status: string } }) => expect(answer.body.status).toBe("done");
/** Follows a comment's link as this person, or signed out with null. */
const link = (id: string, as: string | null = b.ben, board = b.board) => api.get(`/api/boards/${board}/comments/${id}`, as === null ? {} : { as });

describe("what a comment's link finds", () => {
  test("D-01, M-06: a comment on the question, an option, or a standing wording, and a reply, stand", async () => {
    const onQuestion = await add(b.ben);
    const onOption = await add(b.ben, { optionId: b.yes });
    const onWording = await add(b.ben, { versionId: b.version });
    const reply = await add(b.ana, { versionId: b.version, parentId: onWording }, "The city's, from last spring.");

    for (const id of [onQuestion, onOption, onWording, reply]) {
      const answer = await link(id);
      expect(answer.status, id).toBe(200);
      expect(answer.body, id).toEqual({ comment: "stands" });
    }
  });

  test("D-01, M-06: a resolved thread's comment stands", async () => {
    const id = await add(b.ben);
    ok(await api.put(`/api/boards/${b.board}/comments/${id}/resolved`, { as: b.ana }));

    expect((await link(id)).body).toEqual({ comment: "stands" });
  });

  test("D-01, M-06: a deleted comment, an unknown ID, a malformed one, and one from another board all read as deleted, with 200", async () => {
    const mine = await add(b.ben);
    ok(await api.delete(`/api/boards/${b.board}/comments/${mine}`, { as: b.ben }));
    // A second board, with a comment of its own, which this board's link must not confirm.
    const other = await seedBoard(db.client, ids);
    const elsewhere = ids.itemId();
    ok(await api.post(`/api/boards/${other.board}/comments`, { as: other.ben, body: { id: elsewhere, body: "Another board's comment." } }));

    for (const id of [mine, ids.itemId(), "not-a-comment-id", elsewhere]) {
      const answer = await link(id);
      expect(answer.status, id).toBe(200);
      expect(answer.body, id).toEqual({ comment: "deleted" });
    }
  });

  test("D-01, M-06: a comment on a deleted wording, a hidden wording, or a deleted option reads as subject_removed, for a moderator too", async () => {
    // A third option, empty, so it can be deleted.
    const third = ids.itemId();
    ok(await api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: third, name: "Only in summer" } }));
    // A second wording on the first argument, so deleting the seeded one leaves the argument a wording.
    ok(await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id: ids.itemId(), wording: "Weekends are when families visit.", context: "" } }));
    const onDeleted = await add(b.ben, { versionId: b.version });
    const replyOnDeleted = await add(b.ana, { versionId: b.version, parentId: onDeleted }, "The city's, from last spring.");
    const onHidden = await add(b.ben, { versionId: b.otherVersion });
    const onOption = await add(b.ben, { optionId: third });

    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }));
    ok(await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana }));
    ok(await api.delete(`/api/boards/${b.board}/options/${third}`, { as: b.ana }));

    for (const reader of [b.ben, b.ana]) {
      for (const id of [onDeleted, replyOnDeleted, onHidden, onOption]) expect((await link(id, reader)).body, `${reader} ${id}`).toEqual({ comment: "subject_removed" });
    }
  });

  test("D-01, M-06: a comment deleted before its wording was deleted reads as deleted, which comes first", async () => {
    ok(await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id: ids.itemId(), wording: "Weekends are when families visit.", context: "" } }));
    const id = await add(b.ben, { versionId: b.version });
    ok(await api.delete(`/api/boards/${b.board}/comments/${id}`, { as: b.ben }));
    ok(await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana }));

    expect((await link(id)).body).toEqual({ comment: "deleted" });
  });

  test("D-01, M-06: a wording that History restores brings its comment's link back to standing", async () => {
    const id = await add(b.ben, { versionId: b.otherVersion });
    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }));
    expect((await link(id)).body).toEqual({ comment: "subject_removed" });

    ok(await api.delete(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana }));

    expect((await link(id)).body).toEqual({ comment: "stands" });
  });
});

describe("who may follow a comment's link", () => {
  test("D-01, M-06, H-02: someone not on an invited-only board is refused as the board itself refuses them, and someone signed out is asked to sign in", async () => {
    const id = await add(b.ben);
    const stranger = await addAccount(db.client, ids, "sam", { confirmed: true });
    await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);

    expect((await link(id, stranger)).status).toBe(403);
    expect((await link(id, stranger)).body).toEqual({ status: "refused", reason: "no_access" });
    expect((await link(id, null)).status).toBe(401);
    expect((await link(id, b.ben)).body).toEqual({ comment: "stands" });
  });

  test("D-01, M-06: a board that doesn't exist answers 404, as the board's own read does", async () => {
    expect((await link(ids.itemId(), b.ben, ids.boardId())).status).toBe(404);
  });

  test("D-01, M-06, invariant 6: the answer never carries a comment's text or its author, even a hidden wording's", async () => {
    const id = await add(b.ben, { versionId: b.otherVersion }, "Hidden subject, private words.");
    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }));

    const answer = JSON.stringify((await link(id, b.ana)).body);

    expect(answer).not.toContain("private words");
    expect(answer).not.toContain(b.ben);
  });
});
