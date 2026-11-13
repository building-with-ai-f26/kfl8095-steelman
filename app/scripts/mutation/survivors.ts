// Reads Stryker's JSON report (reports/mutation/mutation.json) and says what
// matters: the mutation score, and every break the tests didn't notice
// (plans/architecture.md §8, guard 4). The nightly run prints this and puts
// it in an issue.

export interface Survivor {
  file: string;
  line: number;
  column: number;
  mutator: string;
  /** The code as written. */
  original: string;
  /** What Stryker changed it to. */
  replacement: string;
  /** Survived: tests ran and still passed. NoCoverage: no test runs this code at all. */
  status: "Survived" | "NoCoverage";
}

export interface Summary {
  /** Breaks caught, as a percentage of breaks that ran; null when nothing ran. */
  score: number | null;
  survivors: Survivor[];
}

interface Position {
  line: number;
  column: number;
}

interface Mutant {
  mutatorName: string;
  replacement?: string;
  status: string;
  location: { start: Position; end: Position };
}

/** The parts of Stryker's report (mutation-testing-report-schema) used here. */
interface Report {
  schemaVersion?: string;
  thresholds?: { high: number; low: number };
  files: Record<string, { source: string; mutants: Mutant[] }>;
}

const CAUGHT = new Set(["Killed", "Timeout"]);
const MISSED = new Set(["Survived", "NoCoverage"]);

export function readReport(report: Report): Summary {
  let caught = 0;
  let missed = 0;
  const survivors: Survivor[] = [];
  for (const [file, { source, mutants }] of Object.entries(report.files)) {
    for (const mutant of mutants) {
      if (CAUGHT.has(mutant.status)) caught += 1;
      if (!MISSED.has(mutant.status)) continue;
      missed += 1;
      const { start, end } = mutant.location;
      survivors.push({
        file,
        line: start.line,
        column: start.column,
        mutator: mutant.mutatorName,
        original: textBetween(source, start, end),
        replacement: mutant.replacement ?? "",
        status: mutant.status as Survivor["status"],
      });
    }
  }
  const ran = caught + missed;
  return { score: ran === 0 ? null : (caught / ran) * 100, survivors };
}

/** Stryker's lines start at 1 and its columns at 1. */
function textBetween(source: string, start: Position, end: Position): string {
  const lines = source.split("\n");
  const offset = (position: Position) => lines.slice(0, position.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + position.column - 1;
  return source.slice(offset(start), offset(end));
}

export function asMarkdown({ score, survivors }: Summary): string {
  const scoreText = score === null ? "no score (nothing was mutated)" : `${score.toFixed(1)}%`;
  if (survivors.length === 0) return `Mutation score: ${scoreText}. Every break was caught.\n`;

  const rows = survivors.map((survivor) => {
    const why = survivor.status === "NoCoverage" ? "no test runs this line" : "tests ran and still passed";
    return `- \`${survivor.file}:${survivor.line}:${survivor.column}\` ${survivor.mutator}: \`${oneLine(survivor.original)}\` → \`${oneLine(survivor.replacement)}\` (${why})`;
  });
  return [
    `Mutation score: ${scoreText}. ${survivors.length} ${survivors.length === 1 ? "break" : "breaks"} went unnoticed:`,
    "",
    ...rows,
    "",
    "Each is a hole in the tests: write a test that fails with the change and passes without it. If a change makes no difference to behaviour, mark it with a `// Stryker disable next-line <mutator>: <why>` comment; the protected-files check sends that to the builder.",
    "",
  ].join("\n");
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat;
}
