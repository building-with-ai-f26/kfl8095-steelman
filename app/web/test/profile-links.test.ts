import { expect, test } from "vitest";
import { hasProfile, profilePath, readLink } from "../src/links.ts";
import { changesWithTransition } from "../src/paging.ts";

// Profiles (L-03, M3d-16): /u/<username> joins the links. This file is new so
// that links.test.ts stays as it was (AGENTS.md rule 9).

test("L-03: a profile's address names the person", () => {
  expect(readLink("/u/lin.zhao")).toEqual({ kind: "profile", username: "lin.zhao" });
  expect(readLink("/u/omar_h/")).toEqual({ kind: "profile", username: "omar_h" });
  expect(readLink("/u/Pia_New")).toEqual({ kind: "profile", username: "Pia_New" });
});

test("L-03: an address under /u/ that can't be a username names no one", () => {
  for (const path of ["/u/", "/u", "/u/a/b", "/u/no%20one", `/u/${"x".repeat(41)}`]) expect(readLink(path), path).toEqual({ kind: "profile", username: null });
});

test("L-03: the other addresses read as they did", () => {
  expect(readLink("/")).toEqual({ kind: "home" });
  expect(readLink("/somewhere")).toEqual({ kind: "home" });
  expect(readLink("/users/lin.zhao")).toEqual({ kind: "home" });
  expect(readLink("/b/demo-board-1")).toEqual({ kind: "board", board: "demo-board-1", version: null });
  expect(readLink("/account")).toEqual({ kind: "account" });
});

test("L-03: a profile's link is built from the name, and the profile changes with the page transition", () => {
  expect(profilePath("lin.zhao")).toBe("/u/lin.zhao");
  expect(readLink(profilePath("tess.b"))).toEqual({ kind: "profile", username: "tess.b" });
  expect(changesWithTransition("/u/lin.zhao")).toBe(true);
});

test("L-03: only a name someone has links to a profile, never the deleted stand-in or a missing name", () => {
  expect(hasProfile("lin.zhao")).toBe(true);
  for (const name of ["deleted_account", "", null, undefined]) expect(hasProfile(name), String(name)).toBe(false);
});
