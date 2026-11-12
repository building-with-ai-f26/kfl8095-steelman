import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkRepository, featuresOfStartedMilestones, missingTests, testTitles } from "../scripts/guards/feature-tests.ts";

// The feature-to-test check (plans/architecture.md §8, "Every feature points
// at its tests"): every feature of a milestone that has started has at least
// one test whose name carries its ID.

const root = join(import.meta.dirname, "../..");

describe("reading the build plan", () => {
  test("M0-7: a milestone has started once one of its backlog items is done, and its features are the ones it lists", () => {
    const plan = [
      "| Milestone | Ships | Features | Size | Hosting cost |",
      "|---|---|---|---|---|",
      "| **M0. The risky slice** (Build 2) | Two browsers | B-01, B-02, M-02; first part of M-01 | 7 PRs | $0 |",
      "| **M1. One group, for real** | Pod 6 | All of T1 | ~12 PRs | ~$15 |",
      "",
      "## M0. The risky slice",
      "| # | Item | Builds | Acceptance tests (machine) |",
      "|---|---|---|---|",
      "| M0-1 ✅ done | **Toolchain** | … | … |",
      "| M0-2 | **The rules** | … | … |",
      "",
      "## M1. One group, for real",
    ].join("\n");

    expect(featuresOfStartedMilestones(plan)).toEqual(new Map([["M0", ["B-01", "B-02", "M-02", "M-01"]]]));
  });
});

describe("finding tests by feature", () => {
  test("M0-7: a test names the features it covers anywhere in its title", () => {
    const titles = testTitles('test("B-01, B-05: a vote", () => {});\nit(`M-02: queued`, () => {});\ndescribe("the pill", () => {});\n');
    expect(titles).toEqual(["B-01, B-05: a vote", "M-02: queued", "the pill"]);
  });

  test("M0-7: a feature with no test named after it is reported", () => {
    expect(missingTests(["B-01", "B-03"], ["B-01: a vote counts", "the pill"])).toEqual(["B-03"]);
  });
});

describe("the repository as it is", () => {
  test("M0-7: every feature M0 covers has a test named with its ID", () => {
    const plan = readFileSync(join(root, "plans/build-plan.md"), "utf8");
    const features = featuresOfStartedMilestones(plan).get("M0");
    expect(features).toEqual(expect.arrayContaining(["B-01", "B-02", "B-03", "B-05", "M-02", "M-01"]));
    expect(checkRepository(root)).toEqual([]);
  });
});
