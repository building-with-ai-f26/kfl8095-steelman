// The tour's examples (L-02), picked from the board as the prototype's
// tourSteps picks them (docs/prototype/source/steelman-refined.html): the
// top argument for importance, the argument with the most wordings for
// articulation, and the leading wording with the most evidence assessments.
// A hidden or deleted wording is never an example.

import { credibility } from "@steelman/shared";
import type { ReaderView } from "@steelman/shared";
import { columns, isLive, isLiveVersion } from "./display.ts";

export type TourStep =
  | { kind: "importance"; argumentId: string; optionId: string; versionId: string; optionName: string }
  | { kind: "articulation"; argumentId: string; optionId: string; versionId: string; nextId: string; wordings: number }
  | { kind: "evidence"; argumentId: string; optionId: string; versionId: string; yes: number; no: number };

interface Example {
  argumentId: string;
  optionId: string;
  /** Its wordings, in the order drawn. */
  versionIds: string[];
}

export function tourSteps(view: ReaderView): TourStep[] {
  const options = columns(view);
  const live = (id: string | undefined) => id !== undefined && isLiveVersion(view.rows.versions[id]);
  // Each option's arguments that lead with a wording someone can read, in the order drawn.
  const rowsOf = (optionId: string): Example[] =>
    (view.shown.arguments[optionId] ?? [])
      .filter((id) => isLive(view.rows.arguments[id]))
      .map((id) => ({ argumentId: id, optionId, versionIds: view.shown.versions[id] ?? [] }))
      .filter((row) => live(row.versionIds[0]));
  const rows = options.flatMap((option) => rowsOf(option.id));
  const steps: TourStep[] = [];

  const top = options.map((option) => rowsOf(option.id)[0]).find((row) => row !== undefined);
  if (top) steps.push({ kind: "importance", argumentId: top.argumentId, optionId: top.optionId, versionId: top.versionIds[0]!, optionName: view.rows.options[top.optionId]!.name });

  // Only a row whose first two wordings can both be read has two to compare.
  const multi = rows.filter((row) => live(row.versionIds[1])).sort((a, b) => b.versionIds.length - a.versionIds.length)[0];
  if (multi) steps.push({ kind: "articulation", argumentId: multi.argumentId, optionId: multi.optionId, versionId: multi.versionIds[0]!, nextId: multi.versionIds[1]!, wordings: multi.versionIds.length });

  const assessed = (row: Example) => credibility(view.rows.versions[row.versionIds[0]!]!).total;
  const evidence = [...rows].sort((a, b) => assessed(b) - assessed(a))[0];
  if (evidence) {
    const { yes, no } = view.rows.versions[evidence.versionIds[0]!]!;
    steps.push({ kind: "evidence", argumentId: evidence.argumentId, optionId: evidence.optionId, versionId: evidence.versionIds[0]!, yes, no });
  }
  return steps;
}

/** The note's heading and line, in the prototype's words. */
export function tourNote(step: TourStep): { icon: "arrow-up-down" | "arrow-left-right" | "file-check"; title: string; line: [string, string?, string?] } {
  if (step.kind === "importance") return { icon: "arrow-up-down", title: "Importance", line: ["How much it matters, if true. This one ranks first in ", step.optionName, "."] };
  if (step.kind === "articulation") return { icon: "arrow-left-right", title: "Articulation", line: ["Which wording puts it best. ", `${step.wordings} wordings`, " of this argument; the best-put leads."] };
  const { percent, total } = credibility(step);
  if (percent === null) return { icon: "file-check", title: "Evidence", line: ["Whether its sources back it. No one has assessed this wording yet."] };
  return { icon: "file-check", title: "Evidence", line: ["Whether its sources back it. ", `${percent}% of ${total}`, total === 1 ? " assessment finds this wording supported." : " assessments find this wording supported."] };
}
