import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Reading a board (plans/architecture.md §3): one snapshot when it opens,
// then "what has changed since change S?", answered from the row stamps.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(404);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const snapshot = (as?: string) => api.get(`/api/boards/${b.board}`, { as });
const changes = (after: number, as?: string) => api.get(`/api/boards/${b.board}/changes?after=${after}`, { as });
const vote = (who: string, value: 1 | -1) => api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: who, body: { value } });

describe("the snapshot", () => {
  test("M-01, A-01: holds the question, the options, the arguments, the wordings, and the sources", async () => {
    const { status, body } = await snapshot();

    expect(status).toBe(200);
    expect(body.board).toMatchObject({ id: b.board, question: "Should our library open on Sundays?", closed: false });
    expect(body.options.map((o: { name: string }) => o.name)).toEqual(["Yes", "No"]);
    expect(body.arguments.map((a: { id: string }) => a.id).sort()).toEqual([b.argument, b.otherArgument].sort());
    expect(body.versions.find((v: { id: string }) => v.id === b.version)).toMatchObject({
      argumentId: b.argument,
      rev: 1,
      wording: "Sunday is the only free day for many people.",
      sourceIds: [b.source],
      deleted: false,
    });
    expect(body.sources).toEqual([expect.objectContaining({ id: b.source, name: "City library survey, 2025" })]);
  });

  test("M-02: is as of a change number, the board's latest", async () => {
    const seq = Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);

    expect((await snapshot()).body.board.seq).toBeGreaterThanOrEqual(seq);
  });

  test("B-01: shows each reader their own votes, and nobody else's", async () => {
    await vote(b.ben, -1);

    const asBen = (await snapshot(b.ben)).body.arguments.find((a: { id: string }) => a.id === b.argument);
    const asAna = (await snapshot(b.ana)).body.arguments.find((a: { id: string }) => a.id === b.argument);

    expect(asBen).toMatchObject({ importance: -1, importanceVoters: 1, myVote: -1 });
    expect(asAna).toMatchObject({ importance: -1, importanceVoters: 1, myVote: null });
  });

  test("M-06: a board that doesn't exist is not found", async () => {
    expect((await api.get("/api/boards/nosuchboard1")).status).toBe(404);
  });
});

describe("changes after S", () => {
  test("M-02: with nothing new, the answer is empty and S stays", async () => {
    const { seq } = (await snapshot()).body.board;

    const { status, body } = await changes(seq);

    expect(status).toBe(200);
    expect(body).toEqual({ seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [] });
  });

  test("M-02: after a vote, only the row it changed comes back, as it is now", async () => {
    const { seq } = (await snapshot()).body.board;
    const voted = await vote(b.ben, 1);

    const { body } = await changes(seq);

    expect(body.seq).toBe(voted.body.seq);
    expect(body.arguments).toEqual([expect.objectContaining({ id: b.argument, importance: 1, importanceVoters: 1 })]);
    expect(body.versions).toEqual([]);
    expect(body.options).toEqual([]);
    expect(body.sources).toEqual([]);
  });

  test("M-02: a row stamped at exactly S is not sent again", async () => {
    const wordingVote = await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: b.ben, body: { value: 1 } });
    await vote(b.ben, 1);

    const { body } = await changes(wordingVote.body.seq);

    expect(body.versions).toEqual([]);
    expect(body.arguments).toEqual([expect.objectContaining({ id: b.argument })]);
  });

  test("M-02: many votes on one argument come back as one row", async () => {
    const { seq } = (await snapshot()).body.board;
    await vote(b.ben, 1);
    await vote(b.ana, 1);
    await vote(b.ben, -1);

    const { body } = await changes(seq);

    expect(body.arguments).toEqual([expect.objectContaining({ id: b.argument, importance: 0, importanceVoters: 2 })]);
  });

  test("M-02: a reader is never handed a change number at or below the one they hold", async () => {
    const { seq } = (await snapshot()).body.board;
    await vote(b.ben, 1);
    const first = (await changes(seq)).body;
    await vote(b.ana, -1);
    const second = (await changes(first.seq)).body;

    expect(first.seq).toBeGreaterThan(seq);
    expect(second.seq).toBeGreaterThan(first.seq);
    for (const row of [...first.arguments, ...first.versions]) expect(row.changedSeq).toBeGreaterThan(seq);
    for (const row of [...second.arguments, ...second.versions]) expect(row.changedSeq).toBeGreaterThan(first.seq);
  });

  test("M-02: asking twice gives the same answer", async () => {
    const { seq } = (await snapshot()).body.board;
    await vote(b.ben, 1);

    expect((await changes(seq)).body).toEqual((await changes(seq)).body);
  });

  test("M-02: S must be a whole number from zero up", async () => {
    for (const after of ["-1", "x", "1.5", ""]) {
      expect((await api.get(`/api/boards/${b.board}/changes?after=${after}`)).status).toBe(400);
    }
  });
});
