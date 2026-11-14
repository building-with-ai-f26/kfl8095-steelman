// The feature-to-test check (plans/architecture.md §8, "Every feature points
// at its tests"). A test's name carries the IDs of the features it covers
// ("B-03: an assessment of an old revision is refused"). Every feature the
// build plan says is built must have at least one such test: all of a
// finished milestone's features, as the overview in plans/build-plan.md
// lists them, and those named in the done items of one under way.
//
// test/feature-tests.test.ts runs it on the repository as part of
// `npm run check`.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FEATURE_ID = /\b[A-Z]-\d{2}\b/g;

/**
 * The features of each milestone that has started: one with at least one
 * backlog item marked done. Keyed by milestone ("M0").
 */
export function featuresOfStartedMilestones(plan: string): Map<string, string[]> {
  const started = new Set([...plan.matchAll(/^\| (M\d+[a-z]?)-\d+[a-z]? ✅ done \|/gm)].map((match) => match[1]!));
  const features = new Map<string, string[]>();
  for (const line of plan.split("\n")) {
    const milestone = /^\| \*\*(M\d+[a-z]?)\./.exec(line)?.[1];
    if (!milestone || !started.has(milestone)) continue;
    const column = line.split("|")[3] ?? "";
    features.set(milestone, [...new Set(column.match(FEATURE_ID) ?? [])]);
  }
  return features;
}

/** The names of the tests and groups in one test file. */
export function testTitles(source: string): string[] {
  return [...source.matchAll(/\b(?:test|it|describe)(?:\.\w+)*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((match) => match[2]!);
}

/** The features that no test name mentions. */
export function missingTests(features: readonly string[], titles: readonly string[]): string[] {
  const named = new Set(titles.flatMap((title) => title.match(FEATURE_ID) ?? []));
  return features.filter((feature) => !named.has(feature));
}

/**
 * The features the plan says are built, keyed by milestone: all of a
 * finished milestone's features (every backlog item done), and the features
 * named in the Item cell of each done item, as in "**Sign-in** (L-01)".
 * A milestone's whole list only counts once it's finished, so the check
 * doesn't fail from its first item until its last.
 */
export function featuresSaidToBeBuilt(plan: string): Map<string, string[]> {
  const items = [...plan.matchAll(/^\| (M\d+[a-z]?)-\d+[a-z]?( ✅ done)? \|(.*)$/gm)].map((match) => ({
    milestone: match[1]!,
    done: match[2] !== undefined,
    features: (match[3]!.split("|")[0] ?? "").match(FEATURE_ID) ?? [],
  }));
  const built = new Map<string, string[]>();
  for (const [milestone, listed] of featuresOfStartedMilestones(plan)) {
    const own = items.filter((item) => item.milestone === milestone);
    const finished = own.length > 0 && own.every((item) => item.done);
    const fromItems = own.filter((item) => item.done).flatMap((item) => item.features);
    built.set(milestone, [...new Set([...(finished ? listed : []), ...fromItems])]);
  }
  return built;
}

/** "M0: B-03" for each feature the plan says is built that has no test named after it. */
export function checkRepository(root: string): string[] {
  const plan = readFileSync(join(root, "plans/build-plan.md"), "utf8");
  const titles = testFiles(join(root, "app")).flatMap((file) => testTitles(readFileSync(file, "utf8")));
  return [...featuresSaidToBeBuilt(plan)].flatMap(([milestone, features]) => missingTests(features, titles).map((feature) => `${milestone}: ${feature}`));
}

/**
 * The product's tests. Not the tooling's (app/test/): they test the checks
 * themselves, and some hold sample test names that would otherwise count.
 */
function testFiles(app: string): string[] {
  return ["shared/test", "server/test", "web/test", "e2e"].flatMap((part) =>
    readdirSync(join(app, part), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && /\.(test|spec)\.tsx?$/.test(entry.name))
      .map((entry) => join(entry.parentPath, entry.name))
      .filter((file) => !file.includes("/.planted/")),
  );
}
