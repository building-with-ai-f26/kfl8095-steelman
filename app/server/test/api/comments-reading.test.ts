import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Comments reach every reader (D-01, M3b-10): in the snapshot and in "changes
// after S", as rows like any other, with the key left out when there are none,
// so today's answers keep their shape. Comments are sent only while their
// subject stands: a deleted or hidden wording and a deleted option take theirs
// out, and History's Restore brings them back on the next poll.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3810);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

type Target = { versionId?: string; optionId?: string; parentId?: string };
const snapshot = async (as: string = b.ana) => (await api.get(`/api/boards/${b.board}`, { as })).body;
const changes = async (after: number, as: string = b.ana) => (await api.get(`/api/boards/${b.board}/changes?after=${after}`, { as })).body;
const add = async (as: string, target: Target = {}, body = "Which survey is this from?") => {
  const id = ids.itemId();
  const answer = await api.post(`/api/boards/${b.board}/comments`, { as, body: { id, body, ...target } });
  expect(answer.body, "the comment was added").toMatchObject({ status: "done" });
  return id;
};
const username = async (id: string) => (await db.client.query("select username from account where id = $1", [id])).rows[0].username as string;
const ok = (answer: { body: { status: string } }) => expect(answer.body.status).toBe("done");

describe("a comment in another reader's next answer", () => {
  test("D-01, M-02: a comment one person adds is in another reader's next changes answer, once, with its author's username and time", async () => {
    const { seq } = (await snapshot()).board;
    api.clock.advance(60_000);
    const at = api.clock.now().toISOString();
    const id = await add(b.ben, { versionId: b.version });

    const next = await changes(seq);

    expect(next.comments).toEqual([
      {
        id,
        optionId: null,
        versionId: b.version,
        parentId: null,
        authorId: b.ben,
        authorName: await username(b.ben),
        body: "Which survey is this from?",
        createdAt: at,
        resolved: false,
        deleted: false,
        hidden: false,
        changedSeq: next.seq,
      },
    ]);
    // Once: the answer after that one doesn't send it again.
    const after = await changes(next.seq);
    expect(after.comments).toBeUndefined();
  });

  test("D-01, M-02: a reply arrives with its thread's first comment as its parent and the thread's target", async () => {
    const thread = await add(b.ana, { optionId: b.yes });
    const { seq } = (await snapshot()).board;

    const reply = await add(b.ben, { optionId: b.yes, parentId: thread }, "It's from the 2025 survey.");

    expect((await changes(seq)).comments).toEqual([expect.objectContaining({ id: reply, parentId: thread, optionId: b.yes, versionId: null, body: "It's from the 2025 survey." })]);
  });

  test("D-01, M-02: a resolve, a reopen, and a delete each arrive as the same row changed, and a deleted comment arrives with no body", async () => {
    const id = await add(b.ben);
    let { seq } = (await snapshot()).board;
    const row = async () => {
      const answer = await changes(seq);
      seq = answer.seq;
      return answer.comments;
    };

    ok(await api.put(`/api/boards/${b.board}/comments/${id}/resolved`, { as: b.ana }));
    expect(await row()).toEqual([expect.objectContaining({ id, resolved: true, deleted: false, body: "Which survey is this from?", changedSeq: seq })]);

    ok(await api.delete(`/api/boards/${b.board}/comments/${id}/resolved`, { as: b.ana }));
    expect(await row()).toEqual([expect.objectContaining({ id, resolved: false, changedSeq: seq })]);

    ok(await api.delete(`/api/boards/${b.board}/comments/${id}`, { as: b.ben }));
    expect(await row()).toEqual([expect.objectContaining({ id, deleted: true, body: null, changedSeq: seq })]);
  });

  test("D-01, M-02: the answer with nothing new is what it was, with no comments key, on a board that has comments", async () => {
    await add(b.ben);
    const { seq } = (await snapshot()).board;

    expect(await changes(seq)).toEqual({ seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [], access: { general: "link", linkRole: "contributor" }, role: "owner" });
  });

  test("D-01, M-02: an answer with other changes and no new comment leaves the comments key out", async () => {
    await add(b.ben);
    const { seq } = (await snapshot()).board;
    ok(await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } }));

    const answer = await changes(seq);

    expect(answer.arguments).toHaveLength(1);
    expect(answer).not.toHaveProperty("comments");
  });
});

describe("comments in the snapshot", () => {
  test("D-01, M-01: the snapshot holds every comment on the question, an option, and a wording, oldest first, deleted ones with no body", async () => {
    const question = await add(b.ben);
    api.clock.advance(1000);
    const option = await add(b.ben, { optionId: b.no });
    api.clock.advance(1000);
    const wording = await add(b.ana, { versionId: b.otherVersion });
    ok(await api.delete(`/api/boards/${b.board}/comments/${option}`, { as: b.ben }));

    const { comments } = await snapshot(b.ben);

    expect(comments.map((c: { id: string }) => c.id)).toEqual([question, option, wording]);
    expect(comments[1]).toMatchObject({ optionId: b.no, deleted: true, body: null });
    expect(comments[2]).toMatchObject({ versionId: b.otherVersion, authorName: await username(b.ana), body: "Which survey is this from?" });
  });

  test("D-01, M-01: a board with no comments has no comments key in its snapshot", async () => {
    expect(await snapshot()).not.toHaveProperty("comments");
  });

  test("D-01, M-01: a wording deleted, a wording hidden, and an option deleted take their comments out of the snapshot, for a moderator too", async () => {
    // A third option, empty, so it can be deleted.
    const third = ids.itemId();
    ok(await api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: third, name: "Only in summer" } }));
    const onQuestion = await add(b.ben);
    await add(b.ben, { versionId: b.version });
    await add(b.ben, { versionId: b.otherVersion });
    await add(b.ben, { optionId: third });
    // A fourth wording, on the first argument, so deleting the seeded one leaves the argument a wording.
    const kept = ids.itemId();
    ok(await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id: kept, wording: "Weekends are when families visit.", context: "" } }));
    const onKept = await add(b.ben, { versionId: kept });

    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }));
    ok(await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana }));
    ok(await api.delete(`/api/boards/${b.board}/options/${third}`, { as: b.ana }));

    for (const reader of [b.ben, b.ana]) {
      expect((await snapshot(reader)).comments.map((c: { id: string }) => c.id).sort(), reader === b.ana ? "the owner" : "a contributor").toEqual([onQuestion, onKept].sort());
    }
  });
});

describe("comments while their subject is gone", () => {
  test("D-01, M-02: a changes answer leaves out a comment changed on a wording hidden or deleted, or on an option deleted", async () => {
    const third = ids.itemId();
    ok(await api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: third, name: "Only in summer" } }));
    const onHidden = await add(b.ben, { versionId: b.otherVersion });
    const onOption = await add(b.ben, { optionId: third });
    const kept = ids.itemId();
    ok(await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id: kept, wording: "Weekends are when families visit.", context: "" } }));
    const onDeleted = await add(b.ben, { versionId: b.version });
    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }));
    ok(await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana }));
    ok(await api.delete(`/api/boards/${b.board}/options/${third}`, { as: b.ana }));
    const { seq } = (await snapshot()).board;

    // Resolving tidies what's there even while its subject is gone (M3b-9), so each comment changes after S.
    for (const id of [onHidden, onOption, onDeleted]) ok(await api.put(`/api/boards/${b.board}/comments/${id}/resolved`, { as: b.ben }));

    for (const reader of [b.ben, b.ana]) expect(await changes(seq, reader), reader).not.toHaveProperty("comments");
  });

  test("D-01, M-02: a reader who arrived while a wording was hidden gets its comments on the poll after Restore, as they are now", async () => {
    const thread = await add(b.ben, { versionId: b.otherVersion });
    const reply = await add(b.ana, { versionId: b.otherVersion, parentId: thread }, "It's from the 2025 survey.");
    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }));
    ok(await api.put(`/api/boards/${b.board}/comments/${thread}/resolved`, { as: b.ana }));
    const arrived = await snapshot(b.ben);
    expect(arrived).not.toHaveProperty("comments");

    ok(await api.delete(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana }));
    const next = await changes(arrived.board.seq, b.ben);

    expect(next.comments).toEqual([
      expect.objectContaining({ id: thread, resolved: true, body: "Which survey is this from?" }),
      expect.objectContaining({ id: reply, parentId: thread, body: "It's from the 2025 survey." }),
    ]);
    // Only once: the poll after that sends them no more.
    expect(await changes(next.seq, b.ben)).not.toHaveProperty("comments");
  });

  test("D-01, M-02: a reader who arrived while an option was deleted gets its comments on the poll after Restore", async () => {
    const third = ids.itemId();
    ok(await api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: third, name: "Only in summer" } }));
    const id = await add(b.ben, { optionId: third });
    ok(await api.delete(`/api/boards/${b.board}/options/${third}`, { as: b.ana }));
    const arrived = await snapshot(b.ben);
    expect(arrived).not.toHaveProperty("comments");

    ok(await api.put(`/api/boards/${b.board}/options/${third}/restore`, { as: b.ana }));

    expect((await changes(arrived.board.seq, b.ben)).comments).toEqual([expect.objectContaining({ id, optionId: third })]);
  });

  test("D-01, M-02: a wording restored and then hidden again after S keeps its comments out", async () => {
    await add(b.ben, { versionId: b.otherVersion });
    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }));
    const { seq } = (await snapshot(b.ben)).board;

    ok(await api.delete(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana }));
    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "offtopic" } }));

    expect(await changes(seq, b.ben)).not.toHaveProperty("comments");
  });

  test("D-01, M-02: a Restore sends again only the restored subject's comments, not every comment on the board", async () => {
    const onQuestion = await add(b.ben);
    const onHidden = await add(b.ben, { versionId: b.otherVersion });
    ok(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }));
    const { seq } = (await snapshot(b.ben)).board;

    ok(await api.delete(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana }));
    const sent = (await changes(seq, b.ben)).comments.map((c: { id: string }) => c.id);

    expect(sent).toEqual([onHidden]);
    expect(sent).not.toContain(onQuestion);
  });
});
