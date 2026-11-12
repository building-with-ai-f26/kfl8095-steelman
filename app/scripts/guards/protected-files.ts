// The protected-files check (plans/architecture.md §8, "Tests an agent can't
// quietly weaken"). Lists what a pull request changes that only the builder
// may agree to: an existing test edited, moved, deleted, or skipped; a saved
// screenshot replaced; the policy table; a merged migration; a CI workflow;
// a plan. Adding tests, screenshots, and migrations is free.
//
//   npx tsx scripts/guards/protected-files-cli.ts <base>      (from app/)
//
// Exits 1 and prints the list when there is anything on it. In CI the
// builder's `builder-approved` label lets such a pull request pass
// (.github/workflows/guards.yml).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface Finding {
  path: string;
  why: string;
}

const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs)$/;
const SKIP = /\b(test|it|describe)\.(skip|fixme|todo|skipIf)\b|\bxit\(|\bxdescribe\(/;
const DONE_MARK = /^\| (M\d+[a-z]?-\d+[a-z]?) \|/;

/** What the pull request (HEAD) changes since it branched from `base` that needs the builder. */
export async function protectedChanges({ repo, base }: { repo: string; base: string }): Promise<Finding[]> {
  const git = async (...args: string[]) => (await run("git", args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })).stdout;
  const range = `${base}...HEAD`;
  const findings: Finding[] = [];
  const add = (path: string, why: string) => {
    if (!findings.some((finding) => finding.path === path && finding.why === why)) findings.push({ path, why });
  };

  for (const line of (await git("diff", "--name-status", "-M", range)).split("\n").filter(Boolean)) {
    const [status, path, renamedTo] = line.split("\t") as [string, string, string | undefined];
    const kind = status[0];
    const existed = kind !== "A";

    if (TEST_FILE.test(path) && existed) add(path, kind === "D" ? "deletes an existing test" : kind === "R" ? "moves an existing test" : "edits an existing test");
    if (path.startsWith("app/e2e/screenshots/") && existed) add(path, "replaces a saved screenshot");
    if (path === "app/shared/src/policy.ts") add(path, "changes the policy table");
    if (/^app\/server\/migrations\/.+\.sql$/.test(path) && existed) add(path, "changes a merged migration");
    if (path.startsWith(".github/workflows/") || renamedTo?.startsWith(".github/workflows/")) add(path, "changes a CI workflow");
    if (path.startsWith("plans/") && !isRecordKeeping(path) && !(path === "plans/build-plan.md" && (await onlyMarksItemsDone(git, range)))) add(path, "changes a plan");
  }

  // A skip is protected wherever it appears, new files included (§8, guard 3).
  let current = "";
  for (const line of (await git("diff", "-U0", range)).split("\n")) {
    if (line.startsWith("+++ ")) current = line.slice("+++ b/".length);
    else if (line.startsWith("+") && TEST_FILE.test(current) && SKIP.test(line)) add(current, "skips a test");
  }
  return findings;
}

/**
 * The feature audit is kept current by every pull request (AGENTS.md rule 6),
 * so changing it is not a change to the plan.
 */
function isRecordKeeping(path: string): boolean {
  return path === "plans/features.csv" || path === "plans/feature-audit.xlsx";
}

/** Marking a backlog item done is part of every item's pull request (§8, "How an agent works", step 7). */
async function onlyMarksItemsDone(git: (...args: string[]) => Promise<string>, range: string): Promise<boolean> {
  const lines = (await git("diff", "-U0", range, "--", "plans/build-plan.md"))
    .split("\n")
    .filter((line) => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++ ") && !line.startsWith("--- "));
  const removed = lines.filter((line) => line.startsWith("-")).map((line) => line.slice(1));
  const added = lines.filter((line) => line.startsWith("+")).map((line) => line.slice(1));
  return removed.length === added.length && removed.every((line, index) => line.replace(DONE_MARK, "| $1 ✅ done |") === added[index]);
}
