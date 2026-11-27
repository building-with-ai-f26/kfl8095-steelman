import { expect, test } from "vitest";
import {
  SPACE_CANVASES,
  SPACE_LIMITS,
  SPACE_POLICY,
  SPACE_ROLES,
  canInSpace,
  newSpaceInput,
  spaceInviteInput,
  spaceRoleInput,
  spaceSettingsInput,
  spaceVisibilityInput,
} from "../src/index.ts";
import type { SpaceAction, SpaceRole } from "../src/index.ts";

// What M3d-17 adds to the policy and the inputs (G-03, G-04): a space's own
// three roles, Member, Admin, and Owner, beside a board's, and the shapes a
// space's name, about text, canvas, and visibility may take. An Admin or the
// Owner changes the space and its members; only the Owner changes who can
// find it, and this item accepts only "private".

const ID = "a".repeat(20);

/** The least role each action needs, as the row says. */
const LEAST: Record<SpaceAction, SpaceRole> = {
  space_read: "member",
  space_leave: "member",
  space_edit: "admin",
  space_invite: "admin",
  space_remove: "admin",
  space_role: "admin",
  space_visibility: "owner",
};

test("G-04: a space's roles are Member, Admin, and Owner, least to most, with no Moderator", () => {
  expect(SPACE_ROLES).toEqual(["member", "admin", "owner"]);
});

test("G-03, G-04: each space action needs the least role the row names", () => {
  expect(Object.fromEntries(Object.entries(SPACE_POLICY).map(([action, rule]) => [action, rule.least]))).toEqual(LEAST);
});

test("G-03, G-04: every space role may do exactly the actions at or below it, and anyone without a role or signed out may do none", () => {
  for (const action of Object.keys(LEAST) as SpaceAction[]) {
    for (const role of SPACE_ROLES) {
      const allowed = SPACE_ROLES.indexOf(role) >= SPACE_ROLES.indexOf(LEAST[action]);
      expect(canInSpace("someone", role, action), `${role}, ${action}`).toBe(allowed ? null : "not_allowed");
    }
    expect(canInSpace(null, null, action), action).toBe("signed_out");
    expect(canInSpace(null, "owner", action), action).toBe("signed_out");
    expect(canInSpace("someone", null, action), action).toBe("no_access");
  }
});

test("G-03: a space's name allows 40 characters and its about text 120, after tidying spaces", () => {
  expect(SPACE_LIMITS).toEqual({ name: 40, about: 120 });
  const make = (name: string, about = "") => newSpaceInput.safeParse({ id: ID, name, about }).success;
  expect(make("n".repeat(40))).toBe(true);
  expect(make("n".repeat(41))).toBe(false);
  expect(make("Pod", "a".repeat(120))).toBe(true);
  expect(make("Pod", "a".repeat(121))).toBe(false);
  expect(make("   ")).toBe(false);
  expect(make(`  ${"n".repeat(40)}  `)).toBe(true);
  expect(newSpaceInput.parse({ id: ID, name: "  POD   6 ", about: " Building  with AI " })).toMatchObject({ name: "POD 6", about: "Building with AI" });
  for (const settings of [{ name: "n".repeat(41), about: "", canvas: "stone" }, { name: "Pod", about: "a".repeat(121), canvas: "stone" }]) {
    expect(spaceSettingsInput.safeParse(settings).success).toBe(false);
  }
  expect(spaceSettingsInput.safeParse({ name: "n".repeat(40), about: "a".repeat(120), canvas: "stone" }).success).toBe(true);
});

test("G-03: a new space needs its browser-made ID, and its about text, canvas, and visibility may be left out", () => {
  expect(newSpaceInput.safeParse({ id: ID, name: "Pod" }).success).toBe(true);
  expect(newSpaceInput.safeParse({ name: "Pod" }).success).toBe(false);
  expect(newSpaceInput.safeParse({ id: "short", name: "Pod" }).success).toBe(false);
  expect(newSpaceInput.safeParse({ id: ID, name: "Pod", members: 3 }).success).toBe(false);
});

test("G-03: a space's canvas is one of the prototype's six", () => {
  expect(SPACE_CANVASES).toEqual(["stone", "cool", "sand", "slate", "sage", "lilac"]);
  for (const canvas of SPACE_CANVASES) expect(spaceSettingsInput.safeParse({ name: "Pod", about: "", canvas }).success, canvas).toBe(true);
  expect(spaceSettingsInput.safeParse({ name: "Pod", about: "", canvas: "plaid" }).success).toBe(false);
  expect(newSpaceInput.safeParse({ id: ID, name: "Pod", canvas: "plaid" }).success).toBe(false);
});

test("G-03: only \"private\" is accepted as a space's visibility until public spaces come (M3d-20)", () => {
  expect(spaceVisibilityInput.safeParse({ visibility: "private" }).success).toBe(true);
  for (const visibility of ["public", "PRIVATE", "", null]) expect(spaceVisibilityInput.safeParse({ visibility }).success, String(visibility)).toBe(false);
  expect(newSpaceInput.safeParse({ id: ID, name: "Pod", visibility: "private" }).success).toBe(true);
  expect(newSpaceInput.safeParse({ id: ID, name: "Pod", visibility: "public" }).success).toBe(false);
});

test("G-04: an invite or a role change gives Admin or Member, never Owner, and the username is tidied as a board invite's is", () => {
  expect(spaceInviteInput.parse({ username: " @Lin_Zhao ", role: "admin" })).toEqual({ username: "lin_zhao", role: "admin" });
  expect(spaceInviteInput.safeParse({ username: "lin", role: "member" }).success).toBe(true);
  for (const role of ["owner", "moderator", "editor"]) {
    expect(spaceInviteInput.safeParse({ username: "lin", role }).success, role).toBe(false);
    expect(spaceRoleInput.safeParse({ role }).success, role).toBe(false);
  }
  expect(spaceInviteInput.safeParse({ username: "", role: "member" }).success).toBe(false);
  expect(spaceInviteInput.safeParse({ username: "u".repeat(21), role: "member" }).success).toBe(false);
  expect(spaceRoleInput.safeParse({ role: "member" }).success).toBe(true);
  expect(spaceRoleInput.safeParse({ role: "admin" }).success).toBe(true);
});
