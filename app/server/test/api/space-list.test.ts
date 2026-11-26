import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// The list names each board's space (G-01, G-05, E-08, M3d-19), so the
// sidebar counts a space's boards, choosing a space filters the list to it,
// and its miniature takes the space's canvas. It names the space by its ID
// only, and only to a reader who is in that space, as the board's own answer
// names it (access.ts's spaceShownTo; plans/architecture.md §7, "Who sees
// what about people"): someone invited to the board from outside the space
// never learns which space it's in. A board in no space keeps the listing's
// shape, which list.test.ts pins.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1910 });
const ids = createSeededIds(1911);

const listing = async (as: string, board: string) => ((await api.get("/api/boards", { as })).body.boards as Record<string, unknown>[]).find((each) => each.id === board);

interface World {
  b: SeededBoard;
  space: string;
  /** Pod 6's Owner; and a Member who isn't on the board. */
  olu: string;
  mel: string;
  /** Invited to the board, and in no space. */
  sam: string;
}

/** Ana's board, put in Pod 6 and shared with everyone in it as Voter. */
async function world(): Promise<World> {
  const b = await seedBoard(db.client, ids);
  const olu = await addAccount(db.client, ids, "olu", { confirmed: true });
  const space = await addSpace(db.client, ids, olu, { name: "POD 6", about: "Building with AI" });
  const mel = await addAccount(db.client, ids, "mel", { confirmed: true });
  await addSpaceMember(db.client, space, mel, "member", "2026-11-16T12:02:00Z");
  await addSpaceMember(db.client, space, b.ana, "member", "2026-11-16T12:03:00Z");
  const sam = await addAccount(db.client, ids, "sam", { confirmed: true });
  await addMember(db.client, b.board, sam, "contributor");
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  expect((await api.put(`/api/boards/${b.board}/space`, { as: b.ana, body: { space } })).status).toBe(200);
  expect((await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "space", linkRole: "voter" } })).status).toBe(200);
  return { b, space, olu, mel, sam };
}

describe("a board in a space", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  test("G-05, E-08: a member who finds it through the space sees which space it's in, by its ID alone", async () => {
    for (const person of [w.mel, w.olu]) {
      const listed = await listing(person, w.b.board);
      expect(listed).toMatchObject({ id: w.b.board, role: "voter", space: w.space });
      expect(JSON.stringify(listed)).not.toContain("POD 6");
    }
  });

  test("G-05, E-08: a member who has a board role of their own sees its space too", async () => {
    expect(await listing(w.b.ana, w.b.board)).toMatchObject({ role: "owner", space: w.space });
    await addMember(db.client, w.b.board, w.mel, "editor");
    expect(await listing(w.mel, w.b.board)).toMatchObject({ role: "editor", space: w.space });
  });

  test("G-05, E-08: someone invited to the board from outside the space isn't told which space it's in", async () => {
    const listed = await listing(w.sam, w.b.board);
    expect(listed).toMatchObject({ id: w.b.board, role: "contributor" });
    expect(listed).not.toHaveProperty("space");
  });

  test("G-05, E-08: after leaving the space, a member with a board role still lists the board, without its space", async () => {
    await addMember(db.client, w.b.board, w.mel, "viewer");
    expect((await api.delete(`/api/spaces/${w.space}/people/${w.mel}`, { as: w.mel })).status).toBe(200);

    const listed = await listing(w.mel, w.b.board);
    expect(listed).toMatchObject({ role: "viewer" });
    expect(listed).not.toHaveProperty("space");
  });

  test("G-05, E-08: a board in a deleted space is listed for its Owner without a space", async () => {
    await db.client.query("update space set deleted_at = $2, name = '', about = '' where id = $1", [w.space, "2026-11-16T13:00:00Z"]);

    const listed = await listing(w.b.ana, w.b.board);
    expect(listed).toMatchObject({ role: "owner" });
    expect(listed).not.toHaveProperty("space");
  });
});

test("G-01: a board in no space is listed without a space key, as before", async () => {
  const b = await seedBoard(db.client, ids);
  expect(Object.keys((await listing(b.ana, b.board))!).sort()).toEqual(["changedAt", "comments", "createdAt", "id", "options", "owner", "question", "role"]);
});
