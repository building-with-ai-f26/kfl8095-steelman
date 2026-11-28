import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// The steelman-operator Cloud Run job (M3d-36 in plans/build-plan.md; J-06;
// finding F8 of plans/reviews/public-spaces-security-review.md). The builder
// runs it by hand to suspend an account or make a space private, so it has no
// schedule and no one else may run it. It runs as the service, on the
// service's image, which every deploy and release gives it beside the daily
// job's. Read from the Terraform, the workflows, and the build as written.

const ROOT = join(import.meta.dirname, "..", "..");
const MODULE = readFileSync(join(ROOT, "infra/modules/steelman/main.tf"), "utf8");
const STAGING = readFileSync(join(ROOT, ".github/workflows/deploy-staging.yml"), "utf8");
const RELEASE = readFileSync(join(ROOT, ".github/workflows/release.yml"), "utf8");
const BUILD = readFileSync(join(ROOT, "app/scripts/build.mjs"), "utf8");
const README = readFileSync(join(ROOT, "infra/README.md"), "utf8");

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

/** Every Terraform resource, by type and name, with its body. */
function resources(source: string): { type: string; name: string; body: string }[] {
  return [...source.matchAll(/^resource "(\w+)" "(\w+)" \{/gm)].map((match) => ({ type: match[1]!, name: match[2]!, body: block(source, `resource "${match[1]}" "${match[2]}"`) }));
}

const updateLine = (job: string) => `gcloud run jobs update ${job} --project "$PROJECT" --region "$REGION" --image "$DIGEST" --quiet`;

describe("the operator job", () => {
  const job = () => block(MODULE, 'resource "google_cloud_run_v2_job" "operator"');

  test("M3d-36: the Terraform job exists, runs the operator command as the service account, and isn't retried", () => {
    const body = job();
    expect(body).toMatch(/name\s*=\s*"\$\{local\.name\}-operator"/);
    expect(body).toMatch(/service_account\s*=\s*google_service_account\.service\.email/);
    expect(body).toMatch(/command\s*=\s*\["node", "server\/dist\/operator-cli\.mjs"\]/);
    expect(body).toMatch(/max_retries\s*=\s*0\b/);
    expect(body).toMatch(/image\s*=\s*local\.placeholder/);
    expect(body).toContain('google_secret_manager_secret.made["database-url"].secret_id');
    expect(body).toMatch(/ignore_changes\s*=\s*\[template\[0\]\.template\[0\]\.containers\[0\]\.image/);
  });

  test("M3d-36: nothing schedules the operator job or lets anyone new run it", () => {
    const naming = resources(MODULE).filter((r) => r.type !== "google_cloud_run_v2_job" && /google_cloud_run_v2_job\.operator\b|-operator\b/.test(r.body));
    expect(naming.map((r) => `${r.type}.${r.name}`)).toEqual([]);
    expect(resources(MODULE).filter((r) => r.type === "google_cloud_scheduler_job" && /operator/.test(r.name + r.body)).map((r) => r.name)).toEqual([]);
  });

  test("M3d-36: the staging deploy and the production release give the operator job its image, right after the daily job's", () => {
    for (const [name, workflow] of [
      ["deploy-staging.yml", STAGING],
      ["release.yml", RELEASE],
    ] as const) {
      const daily = workflow.indexOf(updateLine("steelman-daily"));
      const operator = workflow.indexOf(updateLine("steelman-operator"));
      expect(operator, `${name} updates the operator job's image`).toBeGreaterThan(-1);
      expect(workflow.slice(daily, operator).split("\n"), `${name}: the next line after the daily job's update`).toHaveLength(2);
      expect(workflow, `${name} never runs the operator job`).not.toMatch(/gcloud run jobs execute steelman-operator/);
    }
  });

  test("M3d-36: the build bundles the operator command into the image", () => {
    expect(BUILD).toMatch(/"operator-cli": "server\/src\/jobs\/operator-cli\.ts"/);
  });

  test("M3d-36: infra/README.md says how to take something down, with the exact commands and why deleting sessions isn't enough", () => {
    const start = README.indexOf("## Taking something down");
    expect(start).toBeGreaterThan(-1);
    const next = README.indexOf("\n## ", start + 1);
    const section = README.slice(start, next < 0 ? undefined : next);
    expect(section).toContain("gcloud run jobs execute steelman-operator --project steelman-staging --region us-central1 --args=suspend,lin_zhao --wait");
    expect(section).toContain("--args=unsuspend,lin_zhao");
    expect(section).toContain("--args=make-private,");
    expect(section).toMatch(/F8/);
  });
});
