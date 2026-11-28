import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// The hard ceilings on spending (M3d-30 in plans/build-plan.md; F12 in
// plans/reviews/public-spaces-security-review.md; plans/architecture.md §6).
// Google's budgets alert and do not stop spending, so the ceilings are what
// the Terraform sets: at most three servers per environment, and a database
// disk that grows to 20 GB and no further. Read from the Terraform as
// written, so a change that removes a ceiling fails here and has to be argued for.

const ROOT = join(import.meta.dirname, "..", "..");
const MODULE = readFileSync(join(ROOT, "infra/modules/steelman/main.tf"), "utf8");
const VARIABLES = readFileSync(join(ROOT, "infra/modules/steelman/variables.tf"), "utf8");
const ENVIRONMENTS = ["staging", "production"].map((name) => ({
  name,
  terraform: readFileSync(join(ROOT, "infra", name, "main.tf"), "utf8"),
}));

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

function resource(type: string, name: string): string {
  return block(MODULE, `resource "${type}" "${name}"`);
}

describe("the hard ceilings on spending", () => {
  test("M3d-30: Cloud Run runs at most three servers in each environment", () => {
    const service = resource("google_cloud_run_v2_service", "app");

    expect(service).toMatch(/^\s*max_instance_count\s*=\s*var\.max_instances\s*$/m);
    expect(block(VARIABLES, 'variable "max_instances"')).toMatch(/^\s*default\s*=\s*3\s*$/m);
    for (const environment of ENVIRONMENTS) {
      expect(environment.terraform, environment.name).toContain('source = "../modules/steelman"');
      expect(environment.terraform, environment.name).not.toMatch(/\bmax_instances\b/);
    }
  });

  test("M3d-30: the database disk grows on its own, and stops at 20 GB", () => {
    const database = resource("google_sql_database_instance", "main");

    expect(database).toMatch(/^\s*disk_autoresize\s*=\s*true\b/m);
    expect(database).toMatch(/^\s*disk_autoresize_limit\s*=\s*20\b/m);
  });
});
