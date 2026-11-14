import { describe, expect, test } from "vitest";
import { asMarkdown, readReport } from "../scripts/mutation/survivors.ts";

// Turning Stryker's report into what the nightly run prints and puts in an
// issue: the score, and each break the tests didn't notice, with its place
// and what it changed (plans/architecture.md §8, guard 4).

const SOURCE = "export function isAdult(age: number) {\n  return age >= 18;\n}\n";

function mutant(id: string, status: string, replacement: string, start: [number, number], end: [number, number]) {
  return { id, mutatorName: "EqualityOperator", replacement, status, location: { start: { line: start[0], column: start[1] }, end: { line: end[0], column: end[1] } } };
}

const REPORT = {
  schemaVersion: "2",
  thresholds: { high: 80, low: 60 },
  files: {
    "shared/src/age.ts": {
      language: "typescript",
      source: SOURCE,
      mutants: [
        mutant("1", "Killed", "age < 18", [2, 10], [2, 19]),
        mutant("2", "Survived", "age > 18", [2, 10], [2, 19]),
        mutant("3", "Timeout", "true", [2, 10], [2, 19]),
        mutant("4", "NoCoverage", "false", [2, 10], [2, 19]),
        mutant("5", "CompileError", "age >= ", [2, 10], [2, 19]),
      ],
    },
  },
};

describe("the mutation report", () => {
  test("M1-1: lists each break the tests missed, with its place and change, and nothing they caught", () => {
    const { survivors } = readReport(REPORT);

    expect(survivors).toEqual([
      { file: "shared/src/age.ts", line: 2, column: 10, mutator: "EqualityOperator", original: "age >= 18", replacement: "age > 18", status: "Survived" },
      { file: "shared/src/age.ts", line: 2, column: 10, mutator: "EqualityOperator", original: "age >= 18", replacement: "false", status: "NoCoverage" },
    ]);
  });

  test("M1-1: the score counts breaks caught (killed or timed out) out of breaks that ran; ones that didn't compile don't count", () => {
    expect(readReport(REPORT).score).toBe(50);
  });

  test("M1-1: an empty report has no score rather than a perfect one", () => {
    expect(readReport({ schemaVersion: "2", thresholds: { high: 80, low: 60 }, files: {} }).score).toBeNull();
  });

  test("M1-1: the issue text names the score, each missed break, and where it is", () => {
    const text = asMarkdown(readReport(REPORT));

    expect(text).toContain("50.0%");
    expect(text).toContain("`shared/src/age.ts:2:10`");
    expect(text).toContain("`age >= 18` → `age > 18`");
    expect(text).toContain("no test runs this line");
  });

  test("M1-1: with nothing missed, it says so", () => {
    const text = asMarkdown(readReport({ ...REPORT, files: { "shared/src/age.ts": { ...REPORT.files["shared/src/age.ts"], mutants: [mutant("1", "Killed", "age < 18", [2, 10], [2, 19])] } } }));

    expect(text).toContain("100.0%");
    expect(text).toContain("Every break was caught");
  });
});
