import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember, spaceChanges, spaceMembers } from "../support/space.ts";

// The space role matrix (G-03, G-04, M3d-17; plans/architecture.md §7, point
// 5): every space action × the seven board personas (Owner, Editor,
// Contributor, Voter, Viewer, signed out, and non-member) and the three space
// roles (Owner, Admin, Member). A board role gives nothing in a space, so the
// seven board personas, none of them in the space, are told it isn't there;
// signed out is told to sign in. A Member reads the space and its members and
// may leave. An Admin also changes its settings and members. Only the Owner
// changes its visibility, and the Owner can't leave.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1720 });
const ids = createSeededIds(1721);

const BOARD_PERSONAS = ["owner", "editor", "contributor", "voter", "viewer", "signed out", "non-member"] as const;
const SPACE_PERSONAS = ["space owner", "space admin", "space member"] as const;
const PERSONAS = [...BOARD_PERSONAS, ...SPACE_PERSONAS] as const;
type Persona = (typeof PERSONAS)[number];

interface Cast {
  space: string;
  person: Record<Persona, string | undefined>;
  /** A Member who isn't one of the personas, for role changes and removal. */
  mo: string;
  /** An account outside the space, to invite. */
  lin: string;
}

/** A board with one of each board persona, none of them in the space; and a space with its Owner, an Admin, a Member, and Mo. */
async function cast(): Promise<Cast> {
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
  const mo = await addAccount(db.client, ids, "mo", { confirmed: true });
  await addSpaceMember(db.client, space, mo, "member");
  const lin = await addAccount(db.client, ids, "lin", { confirmed: true });
  return { space, person, mo, lin };
}

const username = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;

type Call = (c: Cast, as: string | undefined) => Promise<{ status: number; body: unknown }>;
const signed = (as: string | undefined) => (as === undefined ? {} : { as });

/** Each space action, and the least space role that may take it. */
const ACTIONS: [string, "member" | "admin" | "owner", Call][] = [
  ["read the space", "member", (c, as) => api.get(`/api/spaces/${c.space}`, signed(as))],
  ["read its members", "member", (c, as) => api.get(`/api/spaces/${c.space}/people`, signed(as))],
  ["change its settings", "admin", (c, as) => api.put(`/api/spaces/${c.space}`, { ...signed(as), body: { name: "Renamed pod", about: "New about", canvas: "sage" } })],
  ["invite by username", "admin", async (c, as) => api.post(`/api/spaces/${c.space}/invites`, { ...signed(as), body: { username: await username(c.lin), role: "member" } })],
  ["change a role", "admin", (c, as) => api.put(`/api/spaces/${c.space}/people/${c.mo}`, { ...signed(as), body: { role: "admin" } })],
  ["remove a member", "admin", (c, as) => api.delete(`/api/spaces/${c.space}/people/${c.mo}`, signed(as))],
  ["set the visibility", "owner", (c, as) => api.put(`/api/spaces/${c.space}/visibility`, { ...signed(as), body: { visibility: "private" } })],
  ["leave", "member", (c, as) => api.delete(`/api/spaces/${c.space}/people/${as ?? "nobody-at-all-000000"}`, signed(as))],
];

const RANK = { member: 1, admin: 2, owner: 3 } as const;

/** What each persona is answered. */
function expected(persona: Persona, action: string, least: keyof typeof RANK): number {
  if (persona === "signed out") return 401;
  if (!persona.startsWith("space ")) return 404;
  const role = persona.slice("space ".length) as keyof typeof RANK;
  if (RANK[role] < RANK[least]) return 403;
  // The Owner keeps that role, so the Owner can't leave.
  if (action === "leave" && role === "owner") return 409;
  return 200;
}

const stateOf = async (space: string) => ({
  space: (await db.client.query("select * from space where id = $1", [space])).rows,
  members: await spaceMembers(db.client, space),
  changes: await spaceChanges(db.client, space),
});

describe("the space role matrix", () => {
  for (const [action, least, call] of ACTIONS) {
    test.each(PERSONAS.map((persona) => [persona, expected(persona, action, least)] as const))(`G-03, G-04: %s asks to ${action}: answered %i`, async (persona, status) => {
      const c = await cast();
      const before = await stateOf(c.space);

      const answer = await call(c, c.person[persona]);

      expect(answer.status).toBe(status);
      if (status === 404) expect(answer.body).toEqual({ reason: "not_found" });
      if (status === 403) expect(answer.body).toEqual({ status: "refused", reason: "not_allowed" });
      if (status === 409) expect(answer.body).toEqual({ status: "refused", reason: "owner_keeps_role" });
      // A refused write, or a read, leaves the space, its members, and its change rows as they were.
      if (status !== 200 || action.startsWith("read") || action === "set the visibility") expect(await stateOf(c.space)).toEqual(before);
    });
  }
});
