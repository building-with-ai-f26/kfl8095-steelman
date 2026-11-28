import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Staging deletes what it promises to delete (M3d-31 in plans/build-plan.md;
// F29 in plans/reviews/public-spaces-security-review.md; plans/architecture.md
// §7 Retention). Staging has no Cloud Scheduler job for the daily clean-up,
// because its database is stopped every night, so the staging deploy runs the
// job itself once the new version serves and the job has the new image.
// Production keeps its schedule and runs nothing extra. Read from the workflows
// and the Terraform as written, so a change that drops the step fails here.

const ROOT = join(import.meta.dirname, "..", "..");
const STAGING = readFileSync(join(ROOT, ".github/workflows/deploy-staging.yml"), "utf8");
const RELEASE = readFileSync(join(ROOT, ".github/workflows/release.yml"), "utf8");
const MODULE = readFileSync(join(ROOT, "infra/modules/steelman/main.tf"), "utf8");

const EXECUTE_DAILY = 'gcloud run jobs execute steelman-daily --project "$PROJECT" --region "$REGION" --wait';

/** Where a line first appears in a workflow, failing with a sentence when it is missing. */
function position(source: string, text: string): number {
  const at = source.indexOf(text);
  if (at < 0) expect.fail(`The workflow has no line containing ${text}.`);
  return at;
}

/** A workflow step's YAML, from its `- name:` line up to the next step or the end of the file. */
function step(source: string, name: string): string {
  const start = position(source, `- name: ${name}`);
  const next = source.indexOf("- name:", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

/** The jobs a workflow executes, in order. */
function executed(source: string): string[] {
  return [...source.matchAll(/gcloud run jobs execute (\S+)/g)].map((match) => match[1]!);
}

/** Each gcloud command a workflow runs, as its words before the first flag or argument in quotes. */
function commands(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .flatMap((line) => [...line.matchAll(/\bgcloud((?: [a-z][\w-]*)+)/g)].map((match) => `gcloud${match[1]!}`));
}

/** The body of a Terraform block, from its opening brace to the one that closes it. */
function block(source: string, opening: string): string {
  const start = source.indexOf(`${opening} {`);
  if (start < 0) expect.fail(`No block ${opening}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return expect.fail(`Block ${opening} never closes`);
}

describe("staging runs the daily clean-up after each deploy", () => {
  test("M3d-31, M-07: the staging deploy executes steelman-daily with --wait after the traffic switch and the job's image update, every time", () => {
    const execute = position(STAGING, EXECUTE_DAILY);
    const cleanUp = step(STAGING, "Run the daily clean-up");

    expect(cleanUp.split("\n").map((line) => line.trim())).toContain(`run: ${EXECUTE_DAILY}`);
    expect(cleanUp, "The clean-up step runs on every deploy and fails the run when it fails").not.toMatch(/^\s*(if|continue-on-error):/m);

    expect(execute).toBeGreaterThan(position(STAGING, "gcloud sql instances patch steelman-staging"));
    expect(execute).toBeGreaterThan(position(STAGING, "gcloud run services update-traffic steelman "));
    expect(execute).toBeGreaterThan(position(STAGING, 'gcloud run jobs update steelman-daily --project "$PROJECT" --region "$REGION" --image "$DIGEST"'));
  });

  test("M3d-31, M-07: the staging deploy executes only the migrations and then the daily job", () => {
    expect(executed(STAGING)).toEqual(["steelman-migrate", "steelman-daily"]);
  });

  test("M3d-31, M-07: the staging deploy runs no gcloud command it didn't run before, other than the daily job", () => {
    expect(commands(STAGING)).toEqual([
      "gcloud auth configure-docker",
      "gcloud artifacts docker images describe",
      "gcloud sql instances patch steelman-staging",
      "gcloud run jobs update steelman-migrate",
      "gcloud run jobs execute steelman-migrate",
      "gcloud run deploy steelman",
      "gcloud run services describe steelman",
      "gcloud run services update-traffic steelman",
      "gcloud run jobs update steelman-daily",
      "gcloud run jobs execute steelman-daily",
    ]);
  });

  test("M3d-31, M-07: the production release executes only the migrations, because production's daily job runs on its schedule", () => {
    expect(executed(RELEASE)).toEqual(["steelman-migrate"]);
  });

  test("M3d-31, M-07: staging still has no schedule for the daily job, and the Terraform says the deploy runs it instead", () => {
    const opening = 'resource "google_cloud_scheduler_job" "daily"';
    const scheduler = block(MODULE, opening);
    const comment = MODULE.slice(0, MODULE.indexOf(opening)).trimEnd().split("\n").reverse();
    const above = comment.slice(0, comment.findIndex((line) => !line.startsWith("#"))).reverse().join(" ");

    expect(scheduler).toMatch(/^\s*count\s*=\s*var\.stop_database_nightly \? 0 : 1\s*$/m);
    expect(above, "The comment above the daily schedule").not.toMatch(/wiped/);
    expect(above, "The comment above the daily schedule").toMatch(/deploy-staging\.yml/);
    expect(above, "The comment above the daily schedule").toMatch(/after each deploy/);
  });
});
