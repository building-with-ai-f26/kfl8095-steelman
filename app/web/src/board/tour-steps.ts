// The tour's examples (L-02), picked from the board as the prototype's
// tourSteps picks them (docs/prototype/source/steelman-refined.html): the
// top argument for importance, the argument with the most wordings for
// articulation, and the leading wording with the most evidence assessments.
// A hidden or deleted wording is never an example, and neither is anything in
// a column the reader has hidden (M3d-6, A-08), as the prototype's tourSteps
// skips it.

import { credibility } from "@steelman/shared";
import type { ReaderView } from "@steelman/shared";
import { columns, isLive, isLiveVersion } from "./display.ts";

export type TourStep =
  | { kind: "importance"; argumentId: string; optionId: string; versionId: string }
  | { kind: "articulation"; argumentId: string; optionId: string; versionId: string; nextId: string }
  | { kind: "evidence"; argumentId: string; optionId: string; versionId: string };

interface Example {
  argumentId: string;
  optionId: string;
  /** Its wordings, in the order drawn. */
  versionIds: string[];
}

export function tourSteps(view: ReaderView, hidden: ReadonlySet<string> = new Set()): TourStep[] {
  const options = columns(view).filter((option) => !hidden.has(option.id));
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
  if (top) steps.push({ kind: "importance", argumentId: top.argumentId, optionId: top.optionId, versionId: top.versionIds[0]! });

  // Only a row whose first two wordings can both be read has two to compare.
  const multi = rows.filter((row) => live(row.versionIds[1])).sort((a, b) => b.versionIds.length - a.versionIds.length)[0];
  if (multi) steps.push({ kind: "articulation", argumentId: multi.argumentId, optionId: multi.optionId, versionId: multi.versionIds[0]!, nextId: multi.versionIds[1]! });

  const assessed = (row: Example) => credibility(view.rows.versions[row.versionIds[0]!]!).total;
  const evidence = [...rows].sort((a, b) => assessed(b) - assessed(a))[0];
  if (evidence) steps.push({ kind: "evidence", argumentId: evidence.argumentId, optionId: evidence.optionId, versionId: evidence.versionIds[0]! });
  return steps;
}

/** The note's heading, and what the vote it points at asks. */
export function tourNote(step: TourStep): { icon: "arrow-up-down" | "arrow-left-right" | "file-check"; title: string; line: string } {
  if (step.kind === "importance") return { icon: "arrow-up-down", title: "Importance", line: "Vote on how much this argument matters, assuming it's true." };
  if (step.kind === "articulation") return { icon: "arrow-left-right", title: "Articulation", line: "Vote on which wording states this argument best." };
  return { icon: "file-check", title: "Evidence", line: "Vote on whether the linked sources support this specific wording." };
}
