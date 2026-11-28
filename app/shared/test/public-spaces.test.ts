import { expect, test } from "vitest";
import { NEW_SPACE_VISIBILITIES, PUBLIC_SPACES, PUBLIC_SPACES_MOST, SPACE_VISIBILITIES, canInSpace, newSpaceInput, peopleIn, spaceVisibilityInput } from "../src/index.ts";
import type { SpaceRole } from "../src/index.ts";

// What M3d-20 adds to the shared rules (G-07, G-04): a space is private or
// public, a new one still starts private, and in a public space only its
// Admins and its Owner read its member list (the builder, Nov 28; security
// review F6). A visibility word the service doesn't know counts as public, so
// it grants nothing more. One account owns at most 3 public spaces, and Find
// spaces answers at most 100 (F9).

const ID = "a".repeat(20);
const ROLES: SpaceRole[] = ["member", "admin", "owner"];

test("G-07: a space's visibility is private or public, and a new space starts private", () => {
  expect(SPACE_VISIBILITIES).toEqual(["private", "public"]);
  expect(NEW_SPACE_VISIBILITIES).toEqual(["private"]);
  for (const visibility of ["private", "public"]) expect(spaceVisibilityInput.safeParse({ visibility }).success).toBe(true);
  for (const visibility of ["PUBLIC", "Private", "secret", "", null]) expect(spaceVisibilityInput.safeParse({ visibility }).success).toBe(false);
  expect(newSpaceInput.safeParse({ id: ID, name: "Pod 6", visibility: "private" }).success).toBe(true);
  expect(newSpaceInput.safeParse({ id: ID, name: "Pod 6", visibility: "public" }).success).toBe(false);
});

test("G-07, G-04: every member of a private space reads its member list, and only the Admins and the Owner of a public one do", () => {
  const reads = (visibility: string) => ROLES.filter((role) => canInSpace("someone", role, peopleIn(visibility)) === null);
  expect(reads("private")).toEqual(["member", "admin", "owner"]);
  expect(reads("public")).toEqual(["admin", "owner"]);
  // A word the service doesn't know grants no more than public does.
  expect(reads("open")).toEqual(["admin", "owner"]);
  expect(reads("")).toEqual(["admin", "owner"]);
  // No one outside the space reads it, and signed out is told to sign in.
  expect(canInSpace("someone", null, peopleIn("public"))).toBe("no_access");
  expect(canInSpace(null, "owner", peopleIn("private"))).toBe("signed_out");
});

test("G-07: one account owns at most 3 public spaces, Find spaces answers at most 100, and the refusal is a full sentence", () => {
  expect(PUBLIC_SPACES).toEqual({ perOwner: 3, found: 100 });
  expect(PUBLIC_SPACES_MOST).toBe("You already own 3 public spaces. Make one of them private first.");
});
