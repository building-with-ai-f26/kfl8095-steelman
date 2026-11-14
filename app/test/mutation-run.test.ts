import { execFile } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { readReport } from "../scripts/mutation/survivors.ts";

// The mutation run end to end, on a tiny planted project
// (test/fixtures/mutation/): a function whose test never checks the boundary,
// so the break `>=` → `>` goes unnoticed. If Stryker, its Vitest runner, or
// the report stop working together, this fails on the pull request rather
// than silently at night.

const run = promisify(execFile);
const FIXTURE = join(import.meta.dirname, "fixtures", "mutation");
const STRYKER = join(import.meta.dirname, "..", "node_modules", ".bin", "stryker");

describe("the mutation run", () => {
  test(
    "M1-1: a planted break that the tests miss is reported",
    async () => {
      rmSync(join(FIXTURE, "reports"), { recursive: true, force: true });
      await run(STRYKER, ["run"], { cwd: FIXTURE, maxBuffer: 16 * 1024 * 1024 });

      const report = readReport(JSON.parse(readFileSync(join(FIXTURE, "reports", "mutation.json"), "utf8")));
      expect(report.survivors).toContainEqual(expect.objectContaining({ file: "planted.ts", original: "age >= 18", replacement: "age > 18", status: "Survived" }));
      // And the breaks its test does notice are caught, so it isn't reporting everything.
      expect(report.score).toBeGreaterThan(0);
    },
    120_000,
  );
});
