import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { protectedChanges } from "../scripts/guards/protected-files.ts";

// The protected-files check (plans/architecture.md §8, "Tests an agent can't
// quietly weaken"), run against a small throwaway repository: a main branch
// with one of each kind of protected file, and a pull request branch that
// changes them.

let repo: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "steelman-protected-"));
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  write("app/server/test/votes.test.ts", 'test("B-01: a vote counts", () => {});\n');
  write("app/server/test/old.test.ts", 'test("B-01: an old test", () => {});\n');
  write("app/server/test/moved.test.ts", 'test("B-01: a test that moves", () => {});\n');
  write("app/e2e/board.spec.ts", 'test("B-05: the board", () => {});\n');
  write("app/e2e/screenshots/board-desktop-darwin.png", "old picture");
  write("app/shared/src/policy.ts", "export const POLICY = {};\n");
  write("app/server/migrations/0001_first.sql", "create table a ();\n");
  write(".github/workflows/check.yml", "name: check\n");
  write("plans/architecture.md", "# Architecture\n");
  write("plans/build-plan.md", "| # | Item |\n|---|---|\n| M0-6 | **The board screen** |\n| M0-7 | **Soak** |\n");
  write("plans/features.csv", "id,status\nB-01,Built\n");
  write("app/server/src/votes.ts", "export const votes = 1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "main");
  git("switch", "--quiet", "-c", "pull-request");
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("what a pull request may change freely", () => {
  test("M0-7: code, new tests, new screenshots, new migrations, marking an item done, and the feature audit are not flagged", async () => {
    write("app/server/src/votes.ts", "export const votes = 2;\n");
    write("app/server/test/new.test.ts", 'test("B-01: a new test", () => {});\n');
    write("app/e2e/screenshots/board-desktop-linux.png", "new picture");
    write("app/server/migrations/0002_second.sql", "create table b ();\n");
    // Every item's pull request marks it done and keeps the feature audit current.
    write("plans/build-plan.md", "| # | Item |\n|---|---|\n| M0-6 ✅ done | **The board screen** |\n| M0-7 | **Soak** |\n");
    write("plans/features.csv", "id,status\nB-01,Partly built\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "free changes");

    expect(await protectedChanges({ repo, base: "main" })).toEqual([]);
  });
});

describe("what a pull request may not change without the builder", () => {
  test("M0-7: editing, deleting, or renaming an existing test is flagged", async () => {
    write("app/server/test/votes.test.ts", 'test("B-01: a vote counts", () => { /* weaker */ });\n');
    rmSync(join(repo, "app/server/test/old.test.ts"));
    renameSync(join(repo, "app/server/test/moved.test.ts"), join(repo, "app/server/test/elsewhere.test.ts"));
    write("app/e2e/board.spec.ts", 'test("B-05: the board, changed", () => {});\n');
    git("add", "-A");
    git("commit", "--quiet", "-m", "tests");

    const found = await protectedChanges({ repo, base: "main" });
    expect(found).toEqual(
      expect.arrayContaining([
        { path: "app/server/test/votes.test.ts", why: "edits an existing test" },
        { path: "app/server/test/old.test.ts", why: "deletes an existing test" },
        { path: "app/server/test/moved.test.ts", why: "moves an existing test" },
        { path: "app/e2e/board.spec.ts", why: "edits an existing test" },
      ]),
    );
  });

  test("M0-7: skipping a test is flagged, even in a new file", async () => {
    write("app/server/test/skipped.test.ts", 'test.skip("B-01: not run", () => {});\n');
    git("add", ".");
    git("commit", "--quiet", "-m", "skip");

    expect(await protectedChanges({ repo, base: "main" })).toContainEqual({ path: "app/server/test/skipped.test.ts", why: "skips a test" });
  });

  test("M0-7: replacing a saved screenshot, the policy table, a merged migration, a workflow, or a plan is flagged", async () => {
    write("app/e2e/screenshots/board-desktop-darwin.png", "replaced picture");
    write("app/shared/src/policy.ts", "export const POLICY = { more: true };\n");
    write("app/server/migrations/0001_first.sql", "create table a (b int);\n");
    write(".github/workflows/check.yml", "name: check, changed\n");
    write("plans/architecture.md", "# Architecture, changed\n");
    write("plans/build-plan.md", "| # | Item |\n|---|---|\n| M0-6 ✅ done | **The board screen, smaller** |\n| M0-7 | **Soak** |\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "protected");

    expect(await protectedChanges({ repo, base: "main" })).toEqual(
      expect.arrayContaining([
        { path: "app/e2e/screenshots/board-desktop-darwin.png", why: "replaces a saved screenshot" },
        { path: "app/shared/src/policy.ts", why: "changes the policy table" },
        { path: "app/server/migrations/0001_first.sql", why: "changes a merged migration" },
        { path: ".github/workflows/check.yml", why: "changes a CI workflow" },
        { path: "plans/architecture.md", why: "changes a plan" },
        { path: "plans/build-plan.md", why: "changes a plan" },
      ]),
    );
  });

  test("M0-7: only what the pull request changed counts, not what main changed since it branched", async () => {
    git("switch", "--quiet", "main");
    write("app/server/test/votes.test.ts", 'test("B-01: changed on main", () => {});\n');
    git("commit", "--quiet", "-am", "main moves on");
    git("switch", "--quiet", "pull-request");

    const paths = (await protectedChanges({ repo, base: "main" })).map((finding) => finding.path);
    expect(paths.filter((path) => path === "app/server/test/votes.test.ts")).toHaveLength(1);
    expect(paths).not.toContain("app/server/test/new.test.ts");
  });
});
