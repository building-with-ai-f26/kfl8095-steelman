// `npx tsx scripts/guards/protected-files-cli.ts <base>`: prints what this
// branch changes that needs the builder, and exits 1 if there is anything.

import { execFileSync } from "node:child_process";
import { protectedChanges } from "./protected-files.ts";

const base = process.argv[2];
if (!base) {
  console.error("Usage: tsx scripts/guards/protected-files-cli.ts <base ref>");
  process.exit(2);
}
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const findings = await protectedChanges({ repo, base });
if (findings.length === 0) {
  console.log("No protected files changed.");
} else {
  console.log("This pull request changes protected files, so it needs the builder (plans/architecture.md §8):");
  for (const finding of findings) console.log(`  ${finding.path}: ${finding.why}`);
  process.exit(1);
}
