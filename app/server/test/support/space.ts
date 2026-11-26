// Spaces for tests (M3d-17, G-03, G-04): a space with its Owner, and members
// added straight to the database, each a little later than the last unless a
// test says when, so "longest-standing" has an order to follow.

import type pg from "pg";
import type { IdSource } from "@steelman/shared";
import { NOON } from "./board.ts";

export type SpaceRoleName = "owner" | "admin" | "member";

/** A private space owned by `owner`, made at noon. */
export async function addSpace(client: pg.Client, ids: IdSource, owner: string, { name = "Pod 6", about = "Building with AI" } = {}): Promise<string> {
  const id = ids.itemId();
  await client.query("insert into space (id, name, about, canvas, visibility, created_by, created_at) values ($1, $2, $3, 'stone', 'private', $4, $5)", [id, name, about, owner, NOON]);
  await client.query("insert into space_member (space_id, account_id, role, joined_at) values ($1, $2, 'owner', $3)", [id, owner, NOON]);
  return id;
}

/** Makes someone a member of a space, at `joinedAt` (by default noon). */
export async function addSpaceMember(client: pg.Client, space: string, account: string, role: SpaceRoleName, joinedAt: string = NOON): Promise<void> {
  await client.query("insert into space_member (space_id, account_id, role, joined_at) values ($1, $2, $3, $4)", [space, account, role, joinedAt]);
}

/** A space's members by account, with their roles. */
export async function spaceMembers(client: pg.Client, space: string): Promise<{ account_id: string; role: string }[]> {
  return (await client.query("select account_id, role from space_member where space_id = $1 order by account_id", [space])).rows;
}

/** How many change rows a space has. */
export async function spaceChanges(client: pg.Client, space: string): Promise<number> {
  return (await client.query("select count(*)::int as n from space_change where space_id = $1", [space])).rows[0].n;
}
