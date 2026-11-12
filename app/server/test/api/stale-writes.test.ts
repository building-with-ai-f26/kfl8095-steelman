import { beforeEach, describe, expect, test } from "vitest";
import { NOON, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { createSeededIds } from "@steelman/shared/testing";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The stale-write table (plans/architecture.md §3, "Offline queue and
// conflicts"): what the server does with an action that went stale while
// its sender was away. One test per row M0 can reach: those caused by
// deleting and editing. Rows caused by hiding, combining, separating, and
// changing sources wait for those features.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(407);
let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const deleteWording = (who: string, versionId: string) => api.delete(`/api/boards/${b.board}/versions/${versionId}`, { as: who });
const edit = (who: string, versionId: string, baseRev: number, wording: string) =>
  api.put(`/api/boards/${b.board}/versions/${versionId}`, { as: who, body: { baseRev, wording, context: "" } });

describe("stale writes", () => {
  test("M-02, B-01: an importance vote on an argument that was deleted is dropped: 'that argument was deleted'", async () => {
    await deleteWording(b.ana, b.version); // its only wording, so the argument goes too

    const { status, body } = await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });

    expect(status).toBe(409);
    expect(body).toEqual({ status: "refused", reason: "argument_deleted" });
  });

  test("M-02, B-02: an articulation vote on a wording that was deleted is dropped", async () => {
    await deleteWording(b.ana, b.version);

    const { body } = await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: b.ben, body: { value: 1 } });

    expect(body).toEqual({ status: "refused", reason: "version_deleted" });
  });

  test("M-02, B-03: an assessment of a wording that changed is refused: 'This wording changed while you were away'", async () => {
    await edit(b.ana, b.version, 1, "Sunday is the only free day for most shift workers.");

    const { status, body } = await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { rev: 1, supported: false } });

    expect(status).toBe(409);
    expect(body).toMatchObject({ status: "refused", reason: "revision_changed", current: { id: b.version, rev: 2, wording: "Sunday is the only free day for most shift workers." } });
  });

  test("M-02, A-05: a new wording on an argument that was deleted is refused, so the browser can return it as a draft", async () => {
    await deleteWording(b.ana, b.version);

    const { status, body } = await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id: ids.itemId(), wording: "My sharper wording", context: "" } });

    expect(status).toBe(409);
    expect(body).toEqual({ status: "refused", reason: "argument_deleted" });
  });

  test("M-02, A-06: an edit of your own wording applies when nothing came before it", async () => {
    expect((await edit(b.ana, b.version, 1, "First edit.")).body.status).toBe("done");
    expect((await edit(b.ana, b.version, 2, "Second edit, queued after the first.")).body.status).toBe("done");
  });

  test("M-02, A-06: an edit queued after an earlier edit that failed is refused, so its text comes back in the edit form", async () => {
    // The browser queued two edits; the first never landed, so the second names a revision that doesn't exist.
    const { status, body } = await edit(b.ana, b.version, 2, "Second edit, queued after a first that failed.");

    expect(status).toBe(409);
    expect(body).toMatchObject({ status: "refused", reason: "revision_changed", current: { rev: 1 } });
  });

  test("M-02, A-06: an edit of a wording you deleted is refused", async () => {
    await deleteWording(b.ana, b.version);

    expect((await edit(b.ana, b.version, 1, "Too late.")).body).toEqual({ status: "refused", reason: "version_deleted" });
  });

  test("M-02: anything sent to a board that closed meanwhile is refused: 'This board closed while you were away'", async () => {
    await db.client.query("update board set closed_at = $2 where id = $1", [b.board, NOON]);

    const answers = [
      await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } }),
      await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: b.ben, body: { value: 1 } }),
      await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { rev: 1, supported: false } }),
      await api.post(`/api/boards/${b.board}/arguments`, { as: b.ben, body: { id: ids.itemId(), optionId: b.no, versionId: ids.itemId(), wording: "Late.", context: "" } }),
      await api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ben, body: { id: ids.itemId(), wording: "Late.", context: "" } }),
      await edit(b.ana, b.version, 1, "Late."),
      await deleteWording(b.ana, b.version),
    ];

    for (const answer of answers) expect(answer.body).toEqual({ status: "refused", reason: "board_closed" });
  });
});
