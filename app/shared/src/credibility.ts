// The credibility meter (B-04): what share of the people who assessed a
// wording said its evidence supports it as worded. From PRD §4:
//
//   Supported ÷ (Supported + Not supported as worded)
//
// It reports people's judgments, not the chance that the claim is true.

/** Fewer assessments than this is shown as "few" (PRD §4: a display choice, not a tested threshold). */
export const FEW_ASSESSMENTS_BELOW = 5;

/** The meter is drawn as this many segments. */
export const METER_SEGMENTS = 4;

export interface Credibility {
  yes: number;
  no: number;
  total: number;
  /** Whole-number percentage supported, or null when nobody has assessed it: "unreviewed" is not 0%. */
  percent: number | null;
  /** True when there are some assessments, but fewer than five. */
  few: boolean;
  /** How many of the meter's four segments are filled. */
  segments: number;
}

/**
 * @param counts Assessments of the wording's current revision only. Ones made
 *   of an earlier revision don't count (plans/architecture.md §2, invariant 2).
 */
export function credibility(counts: { yes: number; no: number }): Credibility {
  const { yes, no } = counts;
  for (const count of [yes, no]) {
    if (!Number.isInteger(count) || count < 0) throw new Error(`An assessment count must be a whole number from zero up, got ${count}`);
  }
  const total = yes + no;
  if (total === 0) return { yes, no, total, percent: null, few: false, segments: 0 };

  const percent = Math.round((100 * yes) / total);
  return {
    yes,
    no,
    total,
    percent,
    few: total < FEW_ASSESSMENTS_BELOW,
    // From the rounded percentage, so the meter never disagrees with the number beside it.
    segments: Math.round((percent / 100) * METER_SEGMENTS),
  };
}

/** The meter in words, for screen readers and the hover text. The prototype's wording. */
export function credibilityLabel(c: Credibility): string {
  if (c.percent === null) return "Unreviewed; no assessments";
  return `${c.percent}% supported as worded; ${c.yes} of ${c.total} assessments${c.few ? "; few assessments" : ""}`;
}
