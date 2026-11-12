import { describe, expect, test } from "vitest";
import { credibility, credibilityLabel } from "@steelman/shared";

// The credibility meter, from PRD §4: the share of current assessments that
// say "supported as worded". Four segments; "few" under five assessments; and
// no assessments at all is its own state, not 0%.

describe("the credibility meter", () => {
  test("B-04: with no assessments it is unreviewed, which is not 0%", () => {
    expect(credibility({ yes: 0, no: 0 })).toEqual({ yes: 0, no: 0, total: 0, percent: null, few: false, segments: 0 });
    expect(credibility({ yes: 0, no: 4 }).percent).toBe(0);
  });

  test("B-04: the percentage is yes out of yes plus no, rounded", () => {
    expect(credibility({ yes: 5, no: 3 }).percent).toBe(63);
    expect(credibility({ yes: 2, no: 1 }).percent).toBe(67);
    expect(credibility({ yes: 1, no: 2 }).percent).toBe(33);
    expect(credibility({ yes: 7, no: 0 }).percent).toBe(100);
  });

  test("B-04: fewer than five assessments is 'few'; five is not", () => {
    expect(credibility({ yes: 3, no: 1 }).few).toBe(true);
    expect(credibility({ yes: 3, no: 2 }).few).toBe(false);
  });

  test("B-04: three of three and a hundred of a hundred don't look equally established", () => {
    const three = credibility({ yes: 3, no: 0 });
    const hundred = credibility({ yes: 100, no: 0 });

    expect(three.percent).toBe(hundred.percent);
    expect(three.few).toBe(true);
    expect(hundred.few).toBe(false);
  });

  test("B-04: one segment lights for each quarter supported, to the nearest quarter", () => {
    const segments = (yes: number, no: number) => credibility({ yes, no }).segments;

    expect(segments(0, 10)).toBe(0);
    expect(segments(1, 9)).toBe(0); // 10%
    expect(segments(1, 7)).toBe(1); // 13%
    expect(segments(1, 3)).toBe(1); // 25%
    expect(segments(3, 5)).toBe(2); // 38%
    expect(segments(1, 1)).toBe(2); // 50%
    expect(segments(5, 3)).toBe(3); // 63%
    expect(segments(3, 1)).toBe(3); // 75%
    expect(segments(7, 1)).toBe(4); // 88%
    expect(segments(10, 0)).toBe(4);
  });

  test("B-04: counts that can't be real are a bug, and say so", () => {
    expect(() => credibility({ yes: -1, no: 2 })).toThrow();
    expect(() => credibility({ yes: 1.5, no: 2 })).toThrow();
  });
});

describe("what the meter says to a screen reader", () => {
  test("B-04: unreviewed", () => {
    expect(credibilityLabel(credibility({ yes: 0, no: 0 }))).toBe("Unreviewed; no assessments");
  });

  test("B-04: few assessments", () => {
    expect(credibilityLabel(credibility({ yes: 3, no: 0 }))).toBe("100% supported as worded; 3 of 3 assessments; few assessments");
  });

  test("B-04: enough assessments", () => {
    expect(credibilityLabel(credibility({ yes: 5, no: 3 }))).toBe("63% supported as worded; 5 of 8 assessments");
  });
});
