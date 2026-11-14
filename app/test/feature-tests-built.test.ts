import { describe, expect, test } from "vitest";
import { featuresSaidToBeBuilt } from "../scripts/guards/feature-tests.ts";

// Which features the build plan says are built, so must have a test
// (plans/architecture.md §8): all of a finished milestone's features, and,
// while a milestone is under way, the features named in its done items. A
// milestone's whole list can't be required from its first item, or the
// check would fail until the last one.

const plan = (m1Rows: string[]) =>
  [
    "| Milestone | Ships | Features | Size | Hosting cost |",
    "|---|---|---|---|---|",
    "| **M0. The risky slice** (Build 2) | Two browsers | B-01, M-02 | 7 PRs | $0 |",
    "| **M1. One group, for real** | Pod 6 | All of T1, plus M-07 and M-08 | 14 PRs | ~$15 |",
    "",
    "## M0. The risky slice",
    "| # | Item | Builds | Acceptance tests (machine) |",
    "|---|---|---|---|",
    "| M0-1 ✅ done | **Toolchain** | … | … |",
    "| M0-2 ✅ done | **The rules** | … | … |",
    "",
    "## M1. One group, for real",
    "| # | Item | Builds | Acceptance tests (machine) | Needs the builder |",
    "|---|---|---|---|---|",
    ...m1Rows,
  ].join("\n");

describe("what the build plan says is built", () => {
  test("M1-1: a finished milestone's features all count", () => {
    expect(featuresSaidToBeBuilt(plan(["| M1-1 | **Mutation testing** | … | … | — |"]))).toEqual(new Map([["M0", ["B-01", "M-02"]]]));
  });

  test("M1-1: while a milestone is under way, only the features named in its done items count", () => {
    const rows = [
      "| M1-1 ✅ done | **Mutation testing** | mentions B-03 in passing | … | — |",
      "| M1-2 ✅ done | **Sign-in by email code** (L-01) | … | … | — |",
      "| M1-3 | **Google sign-in** (L-01, H-02) | … | … | — |",
      "| M1-12 | **Delete account** (M-07) | … | … | — |",
    ];

    expect(featuresSaidToBeBuilt(plan(rows)).get("M1")).toEqual(["L-01"]);
  });

  test("M1-1: once every item is done, the milestone's own list counts too", () => {
    const rows = ["| M1-1 ✅ done | **Mutation testing** | … | … | — |", "| M1-2 ✅ done | **Sign-in** (L-01) | … | … | — |"];

    expect(featuresSaidToBeBuilt(plan(rows)).get("M1")).toEqual(["M-07", "M-08", "L-01"]);
  });
});
