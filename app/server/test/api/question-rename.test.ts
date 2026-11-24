import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Board settings: renaming the question (M3b-2, I-01). Only the Owner may,
// through the write path, counted under the writing limit. The change row
// says only that the question was renamed, never what to (invariant 7), and
// another reader's next changes answer carries the new question.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3201);

const PERSONAS = ["owner", "editor", "contributor", "voter", "viewer", "signed out", "non-member"] as const;
type Persona = (typeof PERSONAS)[number];

let b: SeededBoard;
let person: Record<Persona, string | undefined>;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  person = { owner: b.ana, contributor: b.ben, "signed out": undefined } as Record<Persona, string | undefined>;
  for (const [persona, name] of [["editor", "eve"], ["voter", "vic"], ["viewer", "val"]] as const) {
    person[persona] = await addAccount(db.client, ids, name, { confirmed: true });
    await addMember(db.client, b.board, person[persona]!, persona);
  }
  person["non-member"] = await addAccount(db.client, ids, "sam", { confirmed: true });
});

/** Renames as the Owner, or as someone else; `null` calls signed out. */
const rename = (question: unknown, as: string | null = b.ana) => api.put(`/api/boards/${b.board}/question`, { ...(as === null ? {} : { as }), body: { question } });
const snapshot = async (as = b.ana) => (await api.get(`/api/boards/${b.board}`, { as })).body;
const seqOf = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

describe("renaming the question", () => {
  test("I-01: only the Owner may rename the question; a refused rename uses no change number", async () => {
    const expected: Record<Persona, { status: number; reason?: string }> = {
      owner: { status: 200 },
      editor: { status: 403, reason: "not_allowed" },
      contributor: { status: 403, reason: "not_allowed" },
      voter: { status: 403, reason: "not_allowed" },
      viewer: { status: 403, reason: "not_allowed" },
      "signed out": { status: 401, reason: "signed_out" },
      "non-member": { status: 403, reason: "no_access" },
    };
    for (const persona of PERSONAS) {
      if (persona === "owner") continue;
      const before = await seqOf();
      const answer = await rename(`Renamed by the ${persona}?`, person[persona] ?? null);
      expect({ status: answer.status, reason: answer.body?.reason }, persona).toEqual(expected[persona]);
      expect(await seqOf(), persona).toBe(before);
    }
    const answer = await rename("Renamed by the owner?");
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ status: "done" });
  });

  test("I-01: the snapshot and the list hold the tidied text", async () => {
    expect((await rename("  Should the library   open\non Sundays? ")).body).toMatchObject({ status: "done" });

    expect((await snapshot()).board.question).toBe("Should the library open on Sundays?");
    const list = (await api.get("/api/boards", { as: b.ana })).body;
    expect(list.boards.find((board: { id: string }) => board.id === b.board).question).toBe("Should the library open on Sundays?");
  });

  test("I-01: the same text sent again is already done and changes nothing", async () => {
    await rename("Should the library open on Sundays?");
    const before = await seqOf();

    expect((await rename("Should the library open on Sundays? ")).body).toEqual({ status: "already_done" });
    expect(await seqOf()).toBe(before);
  });

  test("I-01: an empty question and one of 201 characters are refused, and one of 200 is taken", async () => {
    const before = (await snapshot()).board.question;

    expect((await rename("   ")).status).toBe(400);
    expect((await rename("x".repeat(201))).status).toBe(400);
    expect((await rename(42)).status).toBe(400);
    expect((await snapshot()).board.question).toBe(before);
    expect((await rename("x".repeat(200))).body).toMatchObject({ status: "done" });
  });

  test("I-01: a closed board refuses a rename", async () => {
    await db.client.query("update board set closed_at = now() where id = $1", [b.board]);

    expect((await rename("Closed, but renamed?")).body).toEqual({ status: "refused", reason: "board_closed" });
  });

  test("I-01: the change row says the question was renamed and holds no text", async () => {
    await rename("Should the library open on Sundays?");

    const { rows } = await db.client.query("select kind, subject_kind, subject_id, before, after, reason from change where board_id = $1 and kind = 'question_renamed'", [b.board]);
    expect(rows).toEqual([{ kind: "question_renamed", subject_kind: "board", subject_id: b.board, before: {}, after: {}, reason: null }]);
  });

  test("I-01: History says who renamed the question", async () => {
    await rename("Should the library open on Sundays?");

    const history = (await api.get(`/api/boards/${b.board}/history`, { as: b.ben })).body.entries as { kind: string; actorName: string }[];
    expect(history.find((entry) => entry.kind === "question_renamed")?.actorName).toMatch(/^ana_/);
  });

  test("I-01: another reader's next changes answer carries the new question, and one with nothing new has no question key", async () => {
    const seq = (await snapshot(b.ben)).board.seq;
    await rename("Should the library open on Sundays?");

    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: b.ben })).body;
    expect(changes.question).toBe("Should the library open on Sundays?");

    const later = (await api.get(`/api/boards/${b.board}/changes?after=${changes.seq}`, { as: b.ben })).body;
    expect(later).toEqual({ seq: changes.seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [], access: changes.access, role: "contributor" });
  });

  test("I-01: a changes answer after a vote, with no rename since, has no question key", async () => {
    await rename("Should the library open on Sundays?");
    const seq = (await snapshot(b.ben)).board.seq;
    await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });

    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: b.ben })).body;
    expect(changes.seq).toBeGreaterThan(seq);
    expect(changes).not.toHaveProperty("question");
  });
});
