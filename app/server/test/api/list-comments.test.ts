import { beforeEach, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The list's "last change" counts comments (D-01, E-03, M3b-10): adding one,
// replying, resolving one, and deleting one each move the board up and set
// its time. Comments add nothing to the change log, so the list reads their
// own times.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3811);
const MINUTE = 60_000;

let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const list = async () => (await api.get("/api/boards", { as: b.ana })).body.boards as { id: string; changedAt: string }[];
const create = async (question: string) => (await api.post("/api/boards", { as: b.ana, body: { question, options: ["Yes", "No"] } })).body.board as string;
const done = (answer: { body: { status: string } }) => expect(answer.body.status).toBe("done");

test("D-01, E-03: a comment, a reply, a resolve, and a delete each count as the board's last change", async () => {
  const thread = ids.itemId();
  const steps: [string, () => Promise<{ body: { status: string } }>][] = [
    ["a comment", () => api.post(`/api/boards/${b.board}/comments`, { as: b.ben, body: { id: thread, versionId: b.version, body: "Which survey is this from?" } })],
    ["a reply", () => api.post(`/api/boards/${b.board}/comments`, { as: b.ana, body: { id: ids.itemId(), versionId: b.version, parentId: thread, body: "The 2025 one." } })],
    ["a resolve", () => api.put(`/api/boards/${b.board}/comments/${thread}/resolved`, { as: b.ana })],
    ["a delete", () => api.delete(`/api/boards/${b.board}/comments/${thread}`, { as: b.ben })],
  ];
  for (const [what, step] of steps) {
    api.clock.advance(MINUTE);
    const other = await create(`Should the café stay open late, after ${what}?`);
    expect((await list())[0]?.id, `before ${what}`).toBe(other);

    api.clock.advance(MINUTE);
    done(await step());

    const boards = await list();
    expect(boards[0]?.id, what).toBe(b.board);
    expect(boards[0]?.changedAt, what).toBe(api.clock.now().toISOString());
  }
});
