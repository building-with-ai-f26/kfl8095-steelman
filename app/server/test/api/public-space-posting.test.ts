import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// Who puts a board in a public space (G-05, H-02, M3d-34; security review
// F1, plans/reviews/public-spaces-security-review.md). In a public space,
// only its Admins and its Owner start a board in it or move one of their
// boards into it (the policy's space_post), as GitHub lets an organization
// keep repository creation to its owners and Slack lets a channel keep
// posting to its admins. A Member who tries is refused as
// "space_admins_post", and nothing is written. In a private space, a Member
// still posts, as before. Someone who isn't in the space is still answered
// as if it didn't exist (no_space). No route makes a space public until
// M3d-20, so these tests make it public in the database.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 3434 });
const ids = createSeededIds(3435);

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
 * An invited-only board in no space, with one of each board persona; Pod 6, with its Owner, an Admin, and a Member, none
 * of them on the board; and the board's Owner, ana, in Pod 6 at `ownerRole`. Pod 6 is public unless `visibility` says.
 */
async function cast({ visibility = "public", ownerRole = "member" }: { visibility?: string; ownerRole?: "member" | "admin" } = {}): Promise<Cast> {
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
  await addSpaceMember(db.client, space, b.ana, ownerRole);
  await db.client.query("update board set general_access = 'invited', link_role = 'voter', space_id = null where id = $1", [b.board]);
  await db.client.query("update space set visibility = $2 where id = $1", [space, visibility]);
  return { board: b.board, space, person };
}

const signed = (as: string | undefined) => (as === undefined ? {} : { as });
const REFUSED_AS_MEMBER = { status: 403, body: { status: "refused", reason: "space_admins_post" } };

const newBoard = (space: string) => ({ question: "Should Pod 6 meet on Fridays?", options: ["Fridays", "Mondays"], space, access: { general: "space", linkRole: "voter" } });
const create = (c: Cast, as: string | undefined) => api.post("/api/boards", { ...signed(as), body: newBoard(c.space) });
const moveIn = (c: Cast, as: string | undefined, board = c.board) => api.put(`/api/boards/${board}/space`, { ...signed(as), body: { space: c.space } });

/** Every row a new board writes, counted across the whole database, so a refused one can be shown to write none. */
const everything = async () => (await db.client.query("select (select count(*) from board)::int as boards, (select count(*) from board_member)::int as members, (select count(*) from option)::int as options, (select count(*) from change)::int as changes")).rows[0];

const stateOf = async (board: string) => ({
  board: (await db.client.query("select general_access, link_role, space_id, last_seq from board where id = $1", [board])).rows[0],
  members: (await db.client.query("select account_id, role, joined_via from board_member where board_id = $1 order by account_id", [board])).rows,
  changes: (await db.client.query("select count(*)::int as n from change where board_id = $1", [board])).rows[0].n,
});

/** A new board in a public space: its Owner and Admins make it; a Member, ana among them, is told why not; anyone else isn't told it's there. */
function startVerdict(persona: Persona): { status: number; reason?: string } {
  if (persona === "signed out") return { status: 401, reason: "signed_out" };
  if (persona === "space owner" || persona === "space admin") return { status: 200 };
  if (persona === "space member" || persona === "owner") return { status: 403, reason: "space_admins_post" };
  return { status: 409, reason: "no_space" };
}

/** Moving the board into a public space: only the board's Owner reaches the space check, and as a Member they're told why not. */
function moveVerdict(persona: Persona): { status: number; reason: string } {
  if (persona === "signed out") return { status: 401, reason: "signed_out" };
  if (persona === "owner") return { status: 403, reason: "space_admins_post" };
  if (persona === "non-member" || persona.startsWith("space ")) return { status: 403, reason: "no_access" };
  return { status: 403, reason: "not_allowed" };
}

describe("the role matrix for putting a board in a public space", () => {
  test.each(PERSONAS.map((persona) => [persona, startVerdict(persona)] as const))("G-05, H-02: %s asks to start a board in a public space", async (persona, verdict) => {
    const c = await cast();
    const before = await everything();

    const answer = await create(c, c.person[persona]);

    expect(answer.status).toBe(verdict.status);
    if (verdict.status === 200) {
      expect(answer.body).toEqual({ status: "done", board: expect.any(String) });
      const made = (await db.client.query("select space_id, general_access from board where id = $1", [answer.body.board])).rows[0];
      expect(made).toEqual({ space_id: c.space, general_access: "space" });
      expect((await db.client.query("select account_id from board_member where board_id = $1 and role = 'owner'", [answer.body.board])).rows).toEqual([{ account_id: c.person[persona] }]);
    } else {
      expect(answer.body).toEqual({ status: "refused", reason: verdict.reason });
      // Refused, it makes no board, no member, no option, and no change row.
      expect(await everything()).toEqual(before);
    }
  });

  test.each(PERSONAS.map((persona) => [persona, moveVerdict(persona)] as const))("G-05, H-02: %s asks to move the board into a public space its Owner is a Member of", async (persona, verdict) => {
    const c = await cast();
    const before = await stateOf(c.board);

    const answer = await moveIn(c, c.person[persona]);

    expect(answer).toEqual({ status: verdict.status, body: { status: "refused", reason: verdict.reason } });
    // A refused move leaves the board, its members, and its change log as they were, and uses no change number.
    expect(await stateOf(c.board)).toEqual(before);
  });

  test("G-05, H-02: a board Owner who is an Admin of the public space moves the board into it", async () => {
    const c = await cast({ ownerRole: "admin" });
    const before = await stateOf(c.board);

    const answer = await moveIn(c, c.person.owner);

    expect(answer).toEqual({ status: 200, body: { status: "done", seq: Number(before.board.last_seq) + 1 } });
    expect((await stateOf(c.board)).board).toEqual({ general_access: "invited", link_role: "voter", space_id: c.space, last_seq: String(Number(before.board.last_seq) + 1) });
  });

  test("G-05, H-02: a board Owner who owns the public space moves their board into it", async () => {
    const c = await cast();
    const theirs = await addSpace(db.client, ids, c.person.owner!, { name: "Ana's pod" });
    await db.client.query("update space set visibility = 'public' where id = $1", [theirs]);

    const answer = await api.put(`/api/boards/${c.board}/space`, { as: c.person.owner!, body: { space: theirs } });

    expect(answer.body).toMatchObject({ status: "done" });
    expect((await db.client.query("select space_id from board where id = $1", [c.board])).rows[0].space_id).toBe(theirs);
  });

  test("G-05, H-02: a board already in the public space is 'already done' for its Owner, and taking it out is still theirs", async () => {
    const c = await cast();
    await db.client.query("update board set space_id = $2 where id = $1", [c.board, c.space]);

    expect((await moveIn(c, c.person.owner)).body).toEqual({ status: "already_done" });
    expect((await api.put(`/api/boards/${c.board}/space`, { as: c.person.owner!, body: { space: null } })).body).toMatchObject({ status: "done" });
  });

  test("G-05, H-02: a visibility the service doesn't know counts as public, so a Member is refused there too", async () => {
    const c = await cast({ visibility: "community" });

    expect(await create(c, c.person["space member"])).toEqual(REFUSED_AS_MEMBER);
    expect(await moveIn(c, c.person.owner)).toEqual(REFUSED_AS_MEMBER);
  });
});

describe("a private space", () => {
  test("G-05, H-02: a Member still starts a board in it, and still moves one of their boards into it", async () => {
    const c = await cast({ visibility: "private" });

    const made = await create(c, c.person["space member"]);
    expect(made.body).toEqual({ status: "done", board: expect.any(String) });
    expect((await db.client.query("select space_id from board where id = $1", [made.body.board])).rows[0].space_id).toBe(c.space);
    expect((await moveIn(c, c.person.owner)).body).toMatchObject({ status: "done" });
    expect((await db.client.query("select space_id from board where id = $1", [c.board])).rows[0].space_id).toBe(c.space);
  });

  test("G-05, H-02: once the space is public, the same Member is refused, and once it's private again, they post", async () => {
    const c = await cast({ visibility: "private" });
    await db.client.query("update space set visibility = 'public' where id = $1", [c.space]);
    expect(await create(c, c.person["space member"])).toEqual(REFUSED_AS_MEMBER);

    await db.client.query("update space set visibility = 'private' where id = $1", [c.space]);
    expect((await create(c, c.person["space member"])).body).toMatchObject({ status: "done" });
  });
});
