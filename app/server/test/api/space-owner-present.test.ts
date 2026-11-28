import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// A board leaves its space with its Owner (G-04, G-05, H-02, M3d-34;
// security review F1 and the first half of F4,
// plans/reviews/public-spaces-security-review.md). A board shared with
// everyone in its space opens through the space only while its Owner is
// still a member of that space. When an Admin removes the Owner, or the
// Owner leaves, the board stops opening for the space's other members at
// once, and leaves their lists, the profiles they read, and their
// statistics. Nothing is written to the board: it is read that way each
// time. People invited to it by name keep their own roles, and the Owner
// keeps theirs.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 3436 });
const ids = createSeededIds(3437);

const username = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;
const listed = async (as: string) => ((await api.get("/api/boards", { as })).body.boards as { id: string; role: string }[]).map(({ id, role }) => ({ id, role }));
const boardRow = async (board: string) => (await db.client.query("select general_access, link_role, space_id, last_seq from board where id = $1", [board])).rows[0];

interface World {
  board: string;
  argument: string;
  space: string;
  /** The board's Owner, a Member of Pod 6. */
  joe: string;
  /** Pod 6's Owner and an Admin; neither is on the board. */
  olu: string;
  ada: string;
  /** A Member of Pod 6, not on the board, who has written on it through the space. */
  mel: string;
  /** A Member of Pod 6 whom joe also invited to the board by name, as Contributor. */
  ivy: string;
  /** Invited to the board by name, as Viewer, and in no space. */
  val: string;
}

/** Joe's board, put in Pod 6 by joe and shared with everyone in it as Contributor, with an argument by mel on it. */
async function world(): Promise<World> {
  const b = await seedBoard(db.client, ids);
  const joe = b.ana;
  const olu = await addAccount(db.client, ids, "olu", { confirmed: true });
  const space = await addSpace(db.client, ids, olu, { name: "POD 6", about: "Building with AI" });
  const ada = await addAccount(db.client, ids, "ada", { confirmed: true });
  const mel = await addAccount(db.client, ids, "mel", { confirmed: true });
  const ivy = await addAccount(db.client, ids, "ivy", { confirmed: true });
  const val = await addAccount(db.client, ids, "val", { confirmed: true });
  await addSpaceMember(db.client, space, ada, "admin", "2026-11-16T12:01:00Z");
  await addSpaceMember(db.client, space, mel, "member", "2026-11-16T12:02:00Z");
  await addSpaceMember(db.client, space, joe, "member", "2026-11-16T12:03:00Z");
  await addSpaceMember(db.client, space, ivy, "member", "2026-11-16T12:04:00Z");
  await addMember(db.client, b.board, ivy, "contributor");
  await addMember(db.client, b.board, val, "viewer");
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  expect((await api.put(`/api/boards/${b.board}/space`, { as: joe, body: { space } })).status).toBe(200);
  expect((await api.put(`/api/boards/${b.board}/access`, { as: joe, body: { general: "space", linkRole: "contributor" } })).status).toBe(200);
  await write(db.client, b.board, async (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: mel, seq, wording: "Mel's own argument holds here." }));
  return { board: b.board, argument: b.argument, space, joe, olu, ada, mel, ivy, val };
}

const HOW = [
  ["an Admin removes the board's Owner", (w: World) => api.delete(`/api/spaces/${w.space}/people/${w.joe}`, { as: w.ada })],
  ["the board's Owner leaves", (w: World) => api.delete(`/api/spaces/${w.space}/people/${w.joe}`, { as: w.joe })],
] as const;

describe("a board leaves its space with its Owner", () => {
  for (const [how, call] of HOW) {
    test(`G-05, H-02, G-04: when ${how}, the space's other members are refused the board and its reads and writes at once`, async () => {
      const w = await world();
      const { body: opened } = await api.get(`/api/boards/${w.board}`, { as: w.mel });
      expect(opened.role).toBe("contributor");
      const row = await boardRow(w.board);

      expect((await call(w)).status).toBe(200);

      for (const person of [w.mel, w.olu, w.ada]) {
        for (const url of [`/api/boards/${w.board}`, `/api/boards/${w.board}/changes?after=${opened.board.seq}`, `/api/boards/${w.board}/history`, `/api/boards/${w.board}/people`]) {
          expect(await api.get(url, { as: person }), url).toEqual({ status: 403, body: { status: "refused", reason: "no_access" } });
        }
      }
      expect((await api.put(`/api/boards/${w.board}/arguments/${w.argument}/importance`, { as: w.mel, body: { value: 1 } })).body).toEqual({ status: "refused", reason: "no_access" });
      // It's read that way each time: nothing was written to the board.
      expect(await boardRow(w.board)).toEqual(row);
    });

    test(`G-05, H-02, G-04: when ${how}, the board leaves the other members' lists, the profiles they read, and their statistics`, async () => {
      const w = await world();
      const joeName = await username(w.joe);
      const profileCount = async (as: string) => (await api.get(`/api/people/${joeName}`, { as })).body.arguments.length as number;
      const statistics = async (as: string) => (await api.get("/api/account/statistics", { as })).body;
      expect(await listed(w.mel)).toEqual([{ id: w.board, role: "contributor" }]);
      expect(await profileCount(w.mel)).toBeGreaterThan(0);
      expect(await statistics(w.mel)).toMatchObject({ arguments: 1, boards: 1 });

      expect((await call(w)).status).toBe(200);

      for (const person of [w.mel, w.olu, w.ada]) {
        expect(await listed(person)).toEqual([]);
        expect(await profileCount(person)).toBe(0);
      }
      expect(await statistics(w.mel)).toMatchObject({ arguments: 0, boards: 0 });
    });

    test(`G-05, H-02, G-04: when ${how}, people invited to the board by name keep their roles, and the Owner keeps the board`, async () => {
      const w = await world();

      expect((await call(w)).status).toBe(200);

      expect((await api.get(`/api/boards/${w.board}`, { as: w.ivy })).body.role).toBe("contributor");
      expect(await listed(w.ivy)).toEqual([{ id: w.board, role: "contributor" }]);
      expect((await api.get(`/api/boards/${w.board}`, { as: w.val })).body.role).toBe("viewer");
      expect(await listed(w.val)).toEqual([{ id: w.board, role: "viewer" }]);
      expect((await api.get(`/api/boards/${w.board}`, { as: w.joe })).body.role).toBe("owner");
      expect(await listed(w.joe)).toEqual([{ id: w.board, role: "owner" }]);
      expect((await api.put(`/api/boards/${w.board}/arguments/${w.argument}/importance`, { as: w.ivy, body: { value: 1 } })).body).toMatchObject({ status: "done" });
    });

    test(`G-05, H-02, G-04: when ${how}, Share reads the board as open only to invited people, and it reopens to the space when the Owner rejoins`, async () => {
      const w = await world();
      const { body: before } = await api.get(`/api/boards/${w.board}`, { as: w.joe });
      expect(before.access).toEqual({ general: "space", linkRole: "contributor" });
      const row = await boardRow(w.board);

      expect((await call(w)).status).toBe(200);

      for (const person of [w.joe, w.ivy]) {
        expect((await api.get(`/api/boards/${w.board}`, { as: person })).body.access).toEqual({ general: "invited", linkRole: "contributor" });
        expect((await api.get(`/api/boards/${w.board}/changes?after=${before.board.seq}`, { as: person })).body.access).toEqual({ general: "invited", linkRole: "contributor" });
      }
      expect(await boardRow(w.board)).toEqual(row);

      await addSpaceMember(db.client, w.space, w.joe, "member", "2026-11-16T12:10:00Z");
      expect((await api.get(`/api/boards/${w.board}`, { as: w.joe })).body.access).toEqual({ general: "space", linkRole: "contributor" });
      expect((await api.get(`/api/boards/${w.board}`, { as: w.mel })).body.role).toBe("contributor");
    });
  }

  test("G-05, H-02: someone else leaving the space doesn't close the board to the members who stay", async () => {
    const w = await world();

    expect((await api.delete(`/api/spaces/${w.space}/people/${w.mel}`, { as: w.ada })).status).toBe(200);

    for (const person of [w.olu, w.ada]) {
      expect((await api.get(`/api/boards/${w.board}`, { as: person })).body.role).toBe("contributor");
      expect(await listed(person)).toEqual([{ id: w.board, role: "contributor" }]);
    }
  });
});
