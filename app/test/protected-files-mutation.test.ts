import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { protectedChanges } from "../scripts/guards/protected-files.ts";

// Two ways to quiet the nightly mutation run without writing a test:
// telling Stryker to leave some code alone, and narrowing what it mutates.
// Each is as much a decision as skipping a test, so each needs the builder
// (plans/architecture.md §8, guards 2 and 4).

let repo: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const commit = (message: string) => {
  git("add", ".");
  git("commit", "--quiet", "-m", message);
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "steelman-protected-mutation-"));
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  write("app/stryker.config.json", '{ "mutate": ["shared/src/**/*.ts"] }\n');
  write("app/shared/src/order.ts", "export const order = 1;\n");
  commit("main");
  git("switch", "--quiet", "-c", "pull-request");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("quieting mutation testing", () => {
  test("M1-1: a comment telling Stryker to skip code is flagged, in code or in a new file", async () => {
    write("app/shared/src/order.ts", "// Stryker disable next-line all: the same either way\nexport const order = 1;\n");
    write("app/server/src/votes.ts", "export function f() {\n  /* Stryker disable EqualityOperator */\n  return 1;\n}\n");
    commit("pull request");

    expect(await protectedChanges({ repo, base: "main" })).toEqual(
      expect.arrayContaining([
        { path: "app/shared/src/order.ts", why: "tells mutation testing to skip code" },
        { path: "app/server/src/votes.ts", why: "tells mutation testing to skip code" },
      ]),
    );
  });

  test("M1-1: changing what mutation testing covers is flagged", async () => {
    write("app/stryker.config.json", '{ "mutate": ["shared/src/order.ts"] }\n');
    commit("pull request");

    expect(await protectedChanges({ repo, base: "main" })).toEqual([{ path: "app/stryker.config.json", why: "changes what mutation testing covers" }]);
  });

  test("M1-1: the words quoted in a test, or a comment that turns Stryker back on, are not flagged", async () => {
    write("app/test/new.test.ts", 'write("a.ts", "// Stryker disable next-line all\\n");\n');
    write("app/shared/src/order.ts", "// Stryker restore all\nexport const order = 1;\n");
    commit("pull request");

    expect(await protectedChanges({ repo, base: "main" })).toEqual([]);
  });
});
