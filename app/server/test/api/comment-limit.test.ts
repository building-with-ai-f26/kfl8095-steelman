import { beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { LIMITS } from "../../src/limits.ts";
import { useApi } from "../support/api.ts";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// The comment limit (M3b-9, D-01, M-12; architecture §7 "Rate limits and
// abuse"): comments and replies share one limit of their own, per account.
// Resolving, reopening, and deleting aren't counted, as deletes aren't
// elsewhere. The limiter lives in this file's one app, so each test counts
// with an account of its own.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3902);
const HOUR = 60 * 60_000;

let b: SeededBoard;
beforeAll(async () => {
  b = await seedBoard(db.client, ids);
});

/** A new Viewer on the seeded board, so its counts start at nothing. */
async function addViewer(name: string): Promise<string> {
  const id = await addAccount(db.client, ids, name, { confirmed: true });
  await addMember(db.client, b.board, id, "viewer");
  return id;
}

const comment = (as: string, extra: { id?: string; parentId?: string } = {}) =>
  api.post(`/api/boards/${b.board}/comments`, { as, body: { id: extra.id ?? ids.itemId(), versionId: b.version, body: "Which survey is this from?", ...extra } });

describe("the comment limit", () => {
  test("D-01, M-12: comments and replies share one limit; the next past it is refused with how long to wait and saves nothing; an hour later it's allowed", async () => {
    const val = await addViewer("val");
    const first = ids.itemId();
    expect((await comment(val, { id: first })).status).toBe(200);
    for (let n = 1; n < LIMITS.comment.most; n++) {
      const answer = n % 2 ? await comment(val, { parentId: first }) : await comment(val);
      expect(answer.status, `comment ${n + 1}`).toBe(200);
    }

    const late = ids.itemId();
    const over = await comment(val, { id: late, parentId: first });
    const overComment = await comment(val);

    expect([over.status, overComment.status]).toEqual([429, 429]);
    expect(over.body).toMatchObject({ status: "refused", reason: "too_many" });
    expect(over.body.retryAfter).toBeGreaterThan(0);
    expect(over.body.retryAfter).toBeLessThanOrEqual(HOUR / 1000);
    expect((await db.client.query("select count(*)::int as n from comment where id = $1", [late])).rows[0].n).toBe(0);
    // Another person isn't affected.
    expect((await comment(b.ben)).status).toBe(200);

    api.clock.advance(HOUR);
    expect((await comment(val, { id: late, parentId: first })).body).toMatchObject({ status: "done" });
  });

  test("D-01, M-12: past the limit, resolving, reopening, and deleting still go through", async () => {
    const vic = await addViewer("vic");
    const first = ids.itemId();
    expect((await comment(vic, { id: first })).status).toBe(200);
    for (let n = 1; n < LIMITS.comment.most; n++) expect((await comment(vic)).status).toBe(200);
    expect((await comment(vic)).status).toBe(429);

    for (let n = 0; n < 3; n++) {
      expect((await api.put(`/api/boards/${b.board}/comments/${first}/resolved`, { as: vic })).status).toBe(200);
      expect((await api.delete(`/api/boards/${b.board}/comments/${first}/resolved`, { as: vic })).status).toBe(200);
    }
    expect((await api.delete(`/api/boards/${b.board}/comments/${first}`, { as: vic })).status).toBe(200);
  });

  test("D-01, M-12: comments don't use up the writing limit", async () => {
    const cal = await addAccount(db.client, ids, "cal", { confirmed: true });
    await addMember(db.client, b.board, cal, "contributor");
    for (let n = 0; n < LIMITS.comment.most; n++) expect((await comment(cal)).status).toBe(200);

    const argument = { id: ids.itemId(), optionId: b.yes, versionId: ids.itemId(), wording: "Evening hours suit people who work days.", context: "" };
    expect((await api.post(`/api/boards/${b.board}/arguments`, { as: cal, body: argument })).status).toBe(200);
  });
});
