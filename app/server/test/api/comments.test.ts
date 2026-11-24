import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Comments on the service (M3b-8, D-01): adding a comment on the question, an
// option, or a wording, and deleting your own. Anyone who can read may
// comment, on a closed board too (architecture §7); only the author deletes,
// and deleting erases the text and keeps the row (invariant 6).

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3801);

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
const add = (as: string | null, body: Target & { id?: string; body?: string } = {}) =>
  api.post(`/api/boards/${b.board}/comments`, { ...(as === null ? {} : { as }), body: { id: body.id ?? ids.itemId(), body: body.body ?? "Which survey is this from?", ...body } });
const remove = (as: string | null, comment: string) => api.delete(`/api/boards/${b.board}/comments/${comment}`, as === null ? {} : { as });
const row = async (id: string) => (await db.client.query("select * from comment where id = $1", [id])).rows[0];
const seqOf = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

describe("who may comment and delete", () => {
  test("D-01, H-03: anyone who can read may comment; signed out and a non-member may not, and a refusal uses no change number", async () => {
    for (const persona of PERSONAS) {
      const before = await seqOf();
      const answer = await add(person[persona], { versionId: b.version });
      const allowed = persona !== "signed out" && persona !== "non-member";
      expect(answer.status, persona).toBe(allowed ? 200 : persona === "signed out" ? 401 : 403);
      if (!allowed) expect(await seqOf(), persona).toBe(before);
    }
  });

  test("D-01, H-03: only the author deletes a comment; an Editor's or the Owner's delete of someone else's is refused", async () => {
    const id = ids.itemId();
    expect((await add(person.viewer, { id, versionId: b.version })).status).toBe(200);
    for (const persona of PERSONAS) {
      if (persona === "viewer") continue;
      const answer = await remove(person[persona], id);
      expect(answer.status, persona).toBe(persona === "signed out" ? 401 : 403);
      expect((await row(id)).body, persona).toBe("Which survey is this from?");
    }
    expect((await remove(person.viewer, id)).body).toMatchObject({ status: "done" });
  });
});

describe("adding a comment", () => {
  test("D-01: a comment on the question, an option, and a wording each keep their target, author, time, and text, line breaks and all", async () => {
    const [question, option, wording] = [ids.itemId(), ids.itemId(), ids.itemId()];
    expect((await add(b.ben, { id: question, body: "  Is this for the main branch only?\n\nOr every branch?  " })).body).toMatchObject({ status: "done" });
    expect((await add(b.ben, { id: option, optionId: b.no })).status).toBe(200);
    expect((await add(b.ben, { id: wording, versionId: b.version })).status).toBe(200);

    expect(await row(question)).toMatchObject({ board_id: b.board, option_id: null, version_id: null, parent_id: null, author_id: b.ben, body: "Is this for the main branch only?\n\nOr every branch?", deleted_at: null, resolved_at: null });
    expect(await row(option)).toMatchObject({ option_id: b.no, version_id: null });
    expect(await row(wording)).toMatchObject({ option_id: null, version_id: b.version });
    expect((await row(wording)).created_at).toBeInstanceOf(Date);
  });

  test("D-01: 1,000 characters are accepted; 1,001, an empty comment, and both targets at once are refused as invalid", async () => {
    expect((await add(b.ben, { body: "x".repeat(1000) })).status).toBe(200);
    expect((await add(b.ben, { body: "x".repeat(1001) })).status).toBe(400);
    expect((await add(b.ben, { body: "  \n " })).status).toBe(400);
    expect((await add(b.ben, { optionId: b.yes, versionId: b.version })).status).toBe(400);
  });

  test("D-01: a target on another board, or none that exists, isn't found", async () => {
    const other = await seedBoard(db.client, ids);
    expect((await add(b.ben, { versionId: other.version })).status).toBe(404);
    expect((await add(b.ben, { optionId: other.yes })).status).toBe(404);
    expect((await add(b.ben, { versionId: ids.itemId() })).status).toBe(404);
  });

  test("D-01: a comment on a deleted wording, a hidden wording, and a deleted option is refused, and nothing is added", async () => {
    const deleted = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Deleted later." }));
    expect((await api.delete(`/api/boards/${b.board}/versions/${deleted.version}`, { as: b.ben })).status).toBe(200);
    expect((await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } })).status).toBe(200);
    const third = ids.itemId();
    expect((await api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: third, name: "Only in summer" } })).status).toBe(200);
    expect((await api.delete(`/api/boards/${b.board}/options/${third}`, { as: b.ana })).status).toBe(200);

    for (const [target, reason] of [[{ versionId: deleted.version }, "version_deleted"], [{ versionId: b.otherVersion }, "version_deleted"], [{ optionId: third }, "option_deleted"]] as const) {
      const answer = await add(b.ben, target);
      expect(answer.status, reason).toBe(409);
      expect(answer.body, reason).toEqual({ status: "refused", reason });
    }
    expect((await db.client.query("select count(*)::int as n from comment where board_id = $1", [b.board])).rows[0].n).toBe(0);
  });

  test("D-01, M-01: sent twice, a comment is already done and changes nothing; the same ID with other text, or from another person, is refused", async () => {
    const id = ids.itemId();
    await add(b.ben, { id, versionId: b.version });
    const before = await seqOf();

    expect((await add(b.ben, { id, versionId: b.version })).body).toEqual({ status: "already_done" });
    expect(await seqOf()).toBe(before);
    expect((await add(b.ben, { id, versionId: b.version, body: "Something else." })).body).toEqual({ status: "refused", reason: "id_taken" });
    expect((await add(b.ana, { id, versionId: b.version })).body).toEqual({ status: "refused", reason: "id_taken" });
    expect((await row(id)).body).toBe("Which survey is this from?");
  });
});

describe("deleting your own", () => {
  test("D-01: delete erases the text and keeps the row, and sent twice it is already done", async () => {
    const id = ids.itemId();
    await add(b.ben, { id, versionId: b.version });

    expect((await remove(b.ben, id)).body).toMatchObject({ status: "done" });
    const kept = await row(id);
    expect(kept.body).toBeNull();
    expect(kept.deleted_at).toBeInstanceOf(Date);
    expect(kept.author_id).toBe(b.ben);

    const before = await seqOf();
    expect((await remove(b.ben, id)).body).toEqual({ status: "already_done" });
    // The add sent again after the delete doesn't bring it back.
    expect((await add(b.ben, { id, versionId: b.version })).body).toEqual({ status: "already_done" });
    expect(await seqOf()).toBe(before);
    expect((await row(id)).body).toBeNull();
  });

  test("D-01: a comment that doesn't exist, or is on another board, isn't found", async () => {
    const other = await seedBoard(db.client, ids);
    const there = ids.itemId();
    await api.post(`/api/boards/${other.board}/comments`, { as: other.ben, body: { id: there, body: "Elsewhere." } });
    expect((await remove(b.ben, ids.itemId())).status).toBe(404);
    expect((await remove(b.ben, there)).status).toBe(404);
  });

  test("D-01: neither write adds a row to the change log", async () => {
    const id = ids.itemId();
    await add(b.ben, { id, versionId: b.version });
    await remove(b.ben, id);

    expect((await db.client.query("select count(*)::int as n from change where board_id = $1", [b.board])).rows[0].n).toBe(0);
  });
});

describe("a closed board", () => {
  test("D-01, I-05: a board closed by its route accepts a comment and a delete of your own, and still refuses a vote", async () => {
    const id = ids.itemId();
    await add(b.ben, { id, versionId: b.version });
    expect((await api.put(`/api/boards/${b.board}/closed`, { as: b.ana })).status).toBe(200);

    expect((await add(person.viewer, { versionId: b.version })).body).toMatchObject({ status: "done" });
    expect((await remove(b.ben, id)).body).toMatchObject({ status: "done" });
    const vote = await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });
    expect(vote.body).toEqual({ status: "refused", reason: "board_closed" });
  });
});

describe("combine and separate", () => {
  test("D-01, A-10: a comment follows its wording when it's combined into another argument and separated again", async () => {
    const second = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Weekend hours suit families." }));
    const id = ids.itemId();
    await add(b.ben, { id, versionId: second.version });

    expect((await api.post(`/api/boards/${b.board}/versions/${second.version}/combine`, { as: b.ana, body: { into: b.argument } })).status).toBe(200);
    expect((await row(id)).version_id).toBe(second.version);
    const argumentOf = async () => (await db.client.query("select argument_id from version where id = $1", [second.version])).rows[0].argument_id;
    expect(await argumentOf()).toBe(b.argument);

    expect((await api.post(`/api/boards/${b.board}/versions/${second.version}/separate`, { as: b.ana, body: { argumentId: ids.itemId() } })).status).toBe(200);
    expect((await row(id)).version_id).toBe(second.version);
    expect(await argumentOf()).not.toBe(b.argument);
  });
});
