import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// The role matrix for a board's space and its space access (G-04, G-05,
// H-02, M3d-18; plans/architecture.md §7, points 4 and 5). Putting one of
// your boards in a space you belong to, taking it out, and sharing it with
// everyone in its space or no longer doing so are all Share's, the board
// Owner's alone, as General access is. The seven board personas (Owner,
// Editor, Contributor, Voter, Viewer, signed out, and non-member) and the
// three space personas (the space's Owner, an Admin, and a Member, none of
// them on the board) each ask. A space role gives nothing over a board's
// settings: someone in the space gets in at the board's role for the space,
// at most, and so is refused as that role is. On a closed board, even the
// board's Owner is refused.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1818 });
const ids = createSeededIds(1819);

const BOARD_PERSONAS = ["owner", "editor", "contributor", "voter", "viewer", "signed out", "non-member"] as const;
const SPACE_PERSONAS = ["space owner", "space admin", "space member"] as const;
const PERSONAS = [...BOARD_PERSONAS, ...SPACE_PERSONAS] as const;
type Persona = (typeof PERSONAS)[number];

interface Cast {
  board: string;
  space: string;
  person: Record<Persona, string | undefined>;
}

/**
 * An invited-only board with one of each board persona, its Owner also a Member of a space, Pod 6; and Pod 6's Owner,
 * an Admin, and a Member, none of them on the board. `start` says where the board is to begin with.
 */
async function cast(start: { inSpace: boolean; shared: boolean }): Promise<Cast> {
  const b = await seedBoard(db.client, ids);
  const person = { owner: b.ana, contributor: b.ben, "signed out": undefined } as Cast["person"];
  for (const [persona, name] of [["editor", "eve"], ["voter", "vic"], ["viewer", "val"]] as const) {
    person[persona] = await addAccount(db.client, ids, name, { confirmed: true });
    await addMember(db.client, b.board, person[persona]!, persona);
  }
  person["non-member"] = await addAccount(db.client, ids, "sam", { confirmed: true });
  person["space owner"] = await addAccount(db.client, ids, "olu", { confirmed: true });
  const space = await addSpace(db.client, ids, person["space owner"]);
  for (const [persona, role, name] of [["space admin", "admin", "ada"], ["space member", "member", "mel"]] as const) {
    person[persona] = await addAccount(db.client, ids, name, { confirmed: true });
    await addSpaceMember(db.client, space, person[persona]!, role);
  }
  await addSpaceMember(db.client, space, b.ana, "member");
  await db.client.query("update board set general_access = $2, link_role = 'voter', space_id = $3 where id = $1", [
    b.board,
    start.shared ? "space" : "invited",
    start.inSpace ? space : null,
  ]);
  return { board: b.board, space, person };
}

const signed = (as: string | undefined) => (as === undefined ? {} : { as });
type Call = (c: Cast, as: string | undefined) => Promise<{ status: number; body: unknown }>;

/** Each action, where the board starts, and what the board then says when the Owner's change is saved. */
const ACTIONS: { name: string; start: { inSpace: boolean; shared: boolean }; call: Call; after: (c: Cast) => { general_access: string; link_role: string; space_id: string | null } }[] = [
  {
    name: "share it with everyone in its space",
    start: { inSpace: true, shared: false },
    call: (c, as) => api.put(`/api/boards/${c.board}/access`, { ...signed(as), body: { general: "space", linkRole: "voter" } }),
    after: (c) => ({ general_access: "space", link_role: "voter", space_id: c.space }),
  },
  {
    name: "change the role everyone in its space has",
    start: { inSpace: true, shared: true },
    call: (c, as) => api.put(`/api/boards/${c.board}/access`, { ...signed(as), body: { general: "space", linkRole: "contributor" } }),
    after: (c) => ({ general_access: "space", link_role: "contributor", space_id: c.space }),
  },
  {
    name: "stop sharing it with everyone in its space",
    start: { inSpace: true, shared: true },
    call: (c, as) => api.put(`/api/boards/${c.board}/access`, { ...signed(as), body: { general: "invited", linkRole: "voter" } }),
    after: (c) => ({ general_access: "invited", link_role: "voter", space_id: c.space }),
  },
  {
    name: "put it in a space",
    start: { inSpace: false, shared: false },
    call: (c, as) => api.put(`/api/boards/${c.board}/space`, { ...signed(as), body: { space: c.space } }),
    after: (c) => ({ general_access: "invited", link_role: "voter", space_id: c.space }),
  },
  {
    name: "take it out of its space",
    start: { inSpace: true, shared: true },
    call: (c, as) => api.put(`/api/boards/${c.board}/space`, { ...signed(as), body: { space: null } }),
    // Taken out, it's no longer shared with that space's members: only invited people can open it.
    after: () => ({ general_access: "invited", link_role: "voter", space_id: null }),
  },
];

/** What each persona is answered: the Owner's change is saved; anyone else is refused as their way in says. */
function expected(persona: Persona, start: { shared: boolean }): { status: number; reason?: string } {
  if (persona === "signed out") return { status: 401, reason: "signed_out" };
  if (persona === "owner") return { status: 200 };
  if (persona === "non-member") return { status: 403, reason: "no_access" };
  // Someone in the space but not on the board gets in only while the board is shared with the space, as a Voter.
  if (persona.startsWith("space ")) return { status: 403, reason: start.shared ? "not_allowed" : "no_access" };
  return { status: 403, reason: "not_allowed" };
}

const stateOf = async (board: string) => ({
  board: (await db.client.query("select general_access, link_role, space_id, last_seq from board where id = $1", [board])).rows[0],
  members: (await db.client.query("select account_id, role, joined_via from board_member where board_id = $1 order by account_id", [board])).rows,
  changes: (await db.client.query("select count(*)::int as n from change where board_id = $1", [board])).rows[0].n,
});

describe("the role matrix for a board's space and space access", () => {
  for (const action of ACTIONS) {
    test.each(PERSONAS.map((persona) => [persona, expected(persona, action.start)] as const))(`G-04, G-05, H-02: %s asks to ${action.name}`, async (persona, verdict) => {
      const c = await cast(action.start);
      const before = await stateOf(c.board);

      const answer = await action.call(c, c.person[persona]);

      expect(answer.status).toBe(verdict.status);
      if (verdict.status === 200) {
        expect(answer.body).toEqual({ status: "done", seq: Number(before.board.last_seq) + 1 });
        expect((await stateOf(c.board)).board).toEqual({ ...action.after(c), last_seq: String(Number(before.board.last_seq) + 1) });
        expect((await stateOf(c.board)).changes).toBe(before.changes + 1);
      } else {
        expect(answer.body).toEqual({ status: "refused", reason: verdict.reason });
        // A refused write leaves the board, its members, and its change log as they were.
        expect(await stateOf(c.board)).toEqual(before);
      }
    });
  }

  test("G-04, G-05, H-02: on a closed board, the Owner is refused each of them too, and nothing changes", async () => {
    for (const action of ACTIONS) {
      const c = await cast(action.start);
      await db.client.query("update board set closed_at = $2 where id = $1", [c.board, "2026-11-16T11:00:00Z"]);
      const before = await stateOf(c.board);

      const answer = await action.call(c, c.person.owner);

      expect(answer, action.name).toEqual({ status: 409, body: { status: "refused", reason: "board_closed" } });
      expect(await stateOf(c.board), action.name).toEqual(before);
    }
  });

  test("G-04, G-05, H-02: each one sent twice changes the board once, and the second answer is 'already done'", async () => {
    for (const action of ACTIONS) {
      const c = await cast(action.start);
      expect((await action.call(c, c.person.owner)).status, action.name).toBe(200);
      const once = await stateOf(c.board);

      expect((await action.call(c, c.person.owner)).body, action.name).toEqual({ status: "already_done" });
      expect(await stateOf(c.board), action.name).toEqual(once);
    }
  });
});
