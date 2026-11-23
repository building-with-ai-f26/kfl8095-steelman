import { beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { LIMITS } from "../../src/limits.ts";
import { useApi } from "../support/api.ts";
import { addArgument, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// Undoing isn't counted toward the writing limit (architecture §7, "Rate
// limits and abuse": "Deleting, undoing, Share settings, and reading aren't
// counted"), so a way back is there even for someone who has written as much
// as an hour allows. Found by the M3a audit (Nov 22): undoing a combine and
// restoring an option from History were counted as writing.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(8128);

let b: SeededBoard;
beforeAll(async () => {
  b = await seedBoard(db.client, ids);
});

const newArgument = () => ({ id: ids.itemId(), optionId: b.yes, versionId: ids.itemId(), wording: `An argument, ${ids.itemId()}.`, context: "" });

describe("at the writing limit", () => {
  test("M-12, J-04, J-03: a combine can still be undone, and a deleted option restored", async () => {
    const second = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Weekend hours suit families." }));
    const combined = (await api.post(`/api/boards/${b.board}/versions/${b.version}/combine`, { as: b.ana, body: { into: second.argument } })).body;
    const option = ids.itemId();
    await api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: option, name: "Only in winter" } });
    await api.delete(`/api/boards/${b.board}/options/${option}`, { as: b.ana });
    // The two writes above count; these use up the rest of the hour's allowance.
    for (let n = 0; n < LIMITS.writing.most - 2; n++) expect((await api.post(`/api/boards/${b.board}/arguments`, { as: b.ana, body: newArgument() })).status).toBe(200);
    expect((await api.post(`/api/boards/${b.board}/arguments`, { as: b.ana, body: newArgument() })).status).toBe(429);

    expect((await api.put(`/api/boards/${b.board}/changes/${combined.seq}/undo`, { as: b.ana })).body).toMatchObject({ status: "done" });
    expect((await api.put(`/api/boards/${b.board}/options/${option}/restore`, { as: b.ana })).body).toMatchObject({ status: "done" });
  });
});
