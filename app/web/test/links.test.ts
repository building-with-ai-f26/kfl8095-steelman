import { expect, test } from "vitest";
import { boardPath, readLink, versionPath } from "../src/links.ts";

test("M-06: a board's address names the board", () => {
  expect(readLink("/b/demo-board-1")).toEqual({ kind: "board", board: "demo-board-1", version: null });
  expect(readLink("/b/demo-board-1/")).toEqual({ kind: "board", board: "demo-board-1", version: null });
});

test("M-06: a version's address names its board and the version", () => {
  expect(readLink("/b/demo-board-1/v/AbC_-0123456789xyzQW")).toEqual({ kind: "board", board: "demo-board-1", version: "AbC_-0123456789xyzQW" });
});

test("M-06: the home page is anything outside /b/", () => {
  expect(readLink("/")).toEqual({ kind: "home" });
  expect(readLink("/somewhere")).toEqual({ kind: "home" });
});

test("M-06: an address under /b/ that can't be a board is a board that doesn't exist", () => {
  for (const path of ["/b/", "/b/no such board", "/b/x/y/z", "/b/x/v/", "/b/x/v/a/b"]) expect(readLink(path), path).toEqual({ kind: "unknown" });
});

test("M-06: the addresses the app writes read back as what they name", () => {
  expect(readLink(boardPath("demo-board-1"))).toEqual({ kind: "board", board: "demo-board-1", version: null });
  expect(readLink(versionPath("demo-board-1", "v1"))).toEqual({ kind: "board", board: "demo-board-1", version: "v1" });
});
