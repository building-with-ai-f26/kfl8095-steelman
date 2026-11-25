import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Hiding and restoring a comment (M3b-14; D-01, J-02): an Editor or the Owner
// hides someone else's comment with one of the report reasons, through the
// existing `hide` action, and restores it. Its text is kept, and both reads
// send it only to Editors and the Owner; everyone else gets the row, marked
// hidden with its reason, and no text. Each is a change row that holds no
// text, and a closed board refuses both.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3951);

const PERSONAS = ["owner", "editor", "contributor", "voter", "viewer", "signed out", "non-member"] as const;
type Persona = (typeof PERSONAS)[number];

const TEXT = "Which survey is this from?";

let b: SeededBoard;
let person: Record<Persona, string | null>;
let eve: string;
let vic: string;
let val: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  person = { owner: b.ana, contributor: b.ben, "signed out": null } as Record<Persona, string | null>;
  for (const [persona, name] of [["editor", "eve"], ["voter", "vic"], ["viewer", "val"]] as const) {
    person[persona] = await addAccount(db.client, ids, name, { confirmed: true });
    await addMember(db.client, b.board, person[persona]!, persona);
  }
  person["non-member"] = await addAccount(db.client, ids, "sam", { confirmed: true });
  eve = person.editor!;
  vic = person.voter!;
  val = person.viewer!;
});

const as = (who: string | null) => (who === null ? {} : { as: who });
const add = async (who: string, body = TEXT): Promise<string> => {
  const id = ids.itemId();
  expect((await api.post(`/api/boards/${b.board}/comments`, { as: who, body: { id, versionId: b.version, body } })).status).toBe(200);
  return id;
};
const hide = (who: string | null, comment: string, reason: unknown = "spam") => api.put(`/api/boards/${b.board}/comments/${comment}/hidden`, { ...as(who), body: { reason } });
const restore = (who: string | null, comment: string) => api.delete(`/api/boards/${b.board}/comments/${comment}/hidden`, as(who));
const seqOf = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const row = async (id: string) => (await db.client.query("select * from comment where id = $1", [id])).rows[0];
/** The comment as the snapshot sends it to `who`. */
const inSnapshot = async (who: string, id: string) => ((await api.get(`/api/boards/${b.board}`, { as: who })).body.comments ?? []).find((c: { id: string }) => c.id === id);
/** The comment as a changes answer after `after` sends it to `who`, or undefined when it isn't in it. */
const inChanges = async (who: string, after: number, id: string) =>
  ((await api.get(`/api/boards/${b.board}/changes?after=${after}`, { as: who })).body.comments ?? []).find((c: { id: string }) => c.id === id);

describe("who may hide and restore a comment", () => {
  test("D-01, J-02, H-03: only an Editor or the Owner may hide someone else's comment; a refusal uses no change number and leaves it as it was", async () => {
    for (const persona of PERSONAS) {
      const comment = await add(b.ben === person[persona] ? eve : b.ben);
      const before = await seqOf();
      const answer = await hide(person[persona], comment);
      const allowed = persona === "owner" || persona === "editor";
      expect(answer.status, persona).toBe(allowed ? 200 : persona === "signed out" ? 401 : 403);
      if (allowed) expect(answer.body, persona).toEqual({ status: "done", seq: before + 1 });
      else {
        expect(await seqOf(), persona).toBe(before);
        expect((await row(comment)).hidden_at, persona).toBeNull();
      }
    }
  });

  test("D-01, J-02, H-03: a Contributor's restore is refused, and so is a Voter's or a Viewer's; an Editor's is taken", async () => {
    const comment = await add(b.ben);
    expect((await hide(b.ana, comment)).status).toBe(200);
    for (const who of [b.ben, vic, val]) {
      const before = await seqOf();
      expect((await restore(who, comment)).body).toEqual({ status: "refused", reason: "not_allowed" });
      expect(await seqOf()).toBe(before);
    }
    expect((await restore(eve, comment)).status).toBe(200);
  });

  test("D-01, J-02: your own comment can't be hidden, even by the Owner, and nor can you restore your own once someone else hid it", async () => {
    const owners = await add(b.ana);
    const before = await seqOf();
    expect(await hide(b.ana, owners)).toEqual({ status: 403, body: { status: "refused", reason: "own_comment" } });
    expect(await seqOf()).toBe(before);
    expect((await row(owners)).hidden_at).toBeNull();

    const editors = await add(eve);
    expect((await hide(b.ana, editors)).status).toBe(200);
    const after = await seqOf();
    expect(await restore(eve, editors)).toEqual({ status: 403, body: { status: "refused", reason: "own_comment" } });
    expect(await seqOf()).toBe(after);
    expect((await row(editors)).hidden_at).not.toBeNull();
  });

  test("D-01, J-02, I-05: a closed board refuses both a hide and a restore, and they're taken again once it's reopened", async () => {
    const hidden = await add(b.ben);
    expect((await hide(eve, hidden)).status).toBe(200);
    const open = await add(b.ben);
    expect((await api.put(`/api/boards/${b.board}/closed`, { as: b.ana })).status).toBe(200);
    const before = await seqOf();

    expect(await hide(eve, open)).toEqual({ status: 409, body: { status: "refused", reason: "board_closed" } });
    expect(await restore(b.ana, hidden)).toEqual({ status: 409, body: { status: "refused", reason: "board_closed" } });
    expect(await seqOf()).toBe(before);

    expect((await api.delete(`/api/boards/${b.board}/closed`, { as: b.ana })).status).toBe(200);
    expect((await hide(eve, open)).status).toBe(200);
    expect((await restore(b.ana, hidden)).status).toBe(200);
  });

  test("D-01, J-02: a deleted comment can't be hidden or restored, an unknown one or one on another board isn't found, and a reason that isn't a report reason is invalid", async () => {
    const deleted = await add(b.ben);
    expect((await api.delete(`/api/boards/${b.board}/comments/${deleted}`, { as: b.ben })).status).toBe(200);
    expect(await hide(eve, deleted)).toEqual({ status: 409, body: { status: "refused", reason: "comment_deleted" } });
    expect(await restore(eve, deleted)).toEqual({ status: 409, body: { status: "refused", reason: "comment_deleted" } });

    expect((await hide(eve, ids.itemId())).status).toBe(404);
    expect((await restore(eve, ids.itemId())).status).toBe(404);
    const other = await seedBoard(db.client, ids);
    const elsewhere = ids.itemId();
    expect((await api.post(`/api/boards/${other.board}/comments`, { as: other.ben, body: { id: elsewhere, versionId: other.version, body: TEXT } })).status).toBe(200);
    expect((await hide(eve, elsewhere)).status).toBe(404);

    const comment = await add(b.ben);
    expect((await hide(eve, comment, "rude")).status).toBe(400);
    expect((await api.put(`/api/boards/${b.board}/comments/${comment}/hidden`, { as: eve })).status).toBe(400);
    expect((await row(comment)).hidden_at).toBeNull();
  });
});

describe("who reads a hidden comment", () => {
  test("D-01, J-02, M-02: a hidden comment's text is left out of the snapshot and the changes for anyone below Editor, who see why it was hidden", async () => {
    const comment = await add(b.ben);
    const after = await seqOf();
    expect((await hide(eve, comment, "abuse")).status).toBe(200);

    for (const who of [b.ben, vic, val]) {
      expect(await inSnapshot(who, comment)).toMatchObject({ id: comment, hidden: true, hiddenReason: "abuse", body: null, deleted: false });
      expect(await inChanges(who, after, comment)).toMatchObject({ id: comment, hidden: true, hiddenReason: "abuse", body: null });
    }
  });

  test("D-01, J-02, M-02: an Editor and the Owner still read a hidden comment's text in both reads, so they can review and restore it", async () => {
    const comment = await add(b.ben);
    const after = await seqOf();
    expect((await hide(b.ana, comment, "offtopic")).status).toBe(200);

    for (const who of [eve, b.ana]) {
      expect(await inSnapshot(who, comment)).toMatchObject({ hidden: true, hiddenReason: "offtopic", body: TEXT });
      expect(await inChanges(who, after, comment)).toMatchObject({ hidden: true, hiddenReason: "offtopic", body: TEXT });
    }
  });

  test("D-01, J-02, M-02: restoring brings the text back for everyone, in the next changes answer, with no reason left on it", async () => {
    const comment = await add(b.ben);
    expect((await hide(eve, comment)).status).toBe(200);
    const after = await seqOf();
    expect((await restore(eve, comment)).status).toBe(200);

    for (const who of [b.ben, vic, val]) {
      const read = await inChanges(who, after, comment);
      expect(read).toMatchObject({ hidden: false, body: TEXT });
      expect(read).not.toHaveProperty("hiddenReason");
      expect(await inSnapshot(who, comment)).not.toHaveProperty("hiddenReason");
    }
    const kept = await row(comment);
    expect([kept.hidden_at, kept.hidden_by, kept.hidden_reason]).toEqual([null, null, null]);
  });

  test("D-01, J-02: a hidden comment keeps its text in the database, with who hid it and why (invariant 6)", async () => {
    const comment = await add(b.ben);
    expect((await hide(eve, comment, "spam")).status).toBe(200);
    expect(await row(comment)).toMatchObject({ body: TEXT, hidden_by: eve, hidden_reason: "spam", changed_seq: String(await seqOf()) });
  });

  test("D-01, J-02, M-06: a hidden comment's link still lands on it, where its sentence shows", async () => {
    const comment = await add(b.ben);
    expect((await hide(eve, comment)).status).toBe(200);
    expect((await api.get(`/api/boards/${b.board}/comments/${comment}`, { as: val })).body).toEqual({ comment: "stands" });
  });
});

describe("sending twice, and the change log", () => {
  test("D-01, J-02: a hide or a restore sent twice changes nothing the second time, even with another reason", async () => {
    const comment = await add(b.ben);
    expect((await hide(eve, comment, "spam")).status).toBe(200);
    const once = await seqOf();
    expect(await hide(b.ana, comment, "abuse")).toEqual({ status: 200, body: { status: "already_done" } });
    expect(await seqOf()).toBe(once);
    expect(await row(comment)).toMatchObject({ hidden_by: eve, hidden_reason: "spam" });

    expect((await restore(eve, comment)).status).toBe(200);
    const restored = await seqOf();
    expect(await restore(eve, comment)).toEqual({ status: 200, body: { status: "already_done" } });
    expect(await seqOf()).toBe(restored);
  });

  test("D-01, J-02: a hide's change row carries its reason and a restore's carries none, and neither holds any text", async () => {
    const comment = await add(b.ben);
    expect((await hide(eve, comment, "offtopic")).status).toBe(200);
    expect((await restore(b.ana, comment)).status).toBe(200);

    const rows = (await db.client.query("select kind, subject_kind, subject_id, actor_id, reason, before, after from change where board_id = $1 and subject_kind = 'comment' order by seq", [b.board])).rows;
    expect(rows).toEqual([
      { kind: "comment_hidden", subject_kind: "comment", subject_id: comment, actor_id: eve, reason: "offtopic", before: {}, after: {} },
      { kind: "comment_restored", subject_kind: "comment", subject_id: comment, actor_id: b.ana, reason: null, before: {}, after: {} },
    ]);
    const log = (await api.get(`/api/boards/${b.board}/changes?after=0`, { as: val })).body.log as { kind: string }[];
    const mine = log.filter((entry) => entry.kind.startsWith("comment_"));
    expect(mine.map((entry) => entry.kind)).toEqual(["comment_hidden", "comment_restored"]);
    expect(mine.map((entry) => JSON.stringify(entry)).join("")).not.toContain(TEXT);
  });

  test("D-01, J-02, J-03: History says who hid a comment and why, and who restored it, naming the comment only by its ID", async () => {
    const comment = await add(b.ben);
    expect((await hide(eve, comment, "spam")).status).toBe(200);
    expect((await restore(b.ana, comment)).status).toBe(200);

    const entries = (await api.get(`/api/boards/${b.board}/history`, { as: val })).body.entries as { kind: string; actorName: string; subjectKind: string; subjectId: string; reason: string | null }[];
    const names = (await db.client.query("select id, username from account where id = any($1)", [[eve, b.ana]])).rows;
    const name = (id: string) => names.find((n: { id: string }) => n.id === id).username;
    expect(entries.filter((entry) => entry.subjectKind === "comment")).toMatchObject([
      { kind: "comment_restored", actorName: name(b.ana), subjectId: comment, reason: null },
      { kind: "comment_hidden", actorName: name(eve), subjectId: comment, reason: "spam" },
    ]);
    expect(JSON.stringify(entries)).not.toContain(TEXT);
  });
});
