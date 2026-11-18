import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// The deployment trust boundary (M2-13; plans/reviews/deployment-trust-boundary.md):
// which GitHub runs may act as each environment's deploy account, and what that
// account may do. Read from the Terraform and the workflows as written, so a
// change that loosens one fails here and has to be argued for. What Google and
// GitHub actually hold is checked by hand; the review records when.

const ROOT = join(import.meta.dirname, "..", "..");
const MODULE = readFileSync(join(ROOT, "infra/modules/steelman/main.tf"), "utf8");
const VARIABLES = readFileSync(join(ROOT, "infra/modules/steelman/variables.tf"), "utf8");
const ENVIRONMENTS = { staging: readFileSync(join(ROOT, "infra/staging/main.tf"), "utf8"), production: readFileSync(join(ROOT, "infra/production/main.tf"), "utf8") };
const WORKFLOWS = join(ROOT, ".github/workflows");
const workflows = new Map(readdirSync(WORKFLOWS).map((name) => [name, readFileSync(join(WORKFLOWS, name), "utf8")]));
const workflow = (name: string) => workflows.get(name) ?? expect.fail(`No workflow ${name}`);

/** The body of a Terraform resource, from its opening brace to the one that closes it. */
function resource(type: string, name: string): string {
  const start = MODULE.indexOf(`resource "${type}" "${name}" {`);
  if (start < 0) expect.fail(`No resource ${type}.${name}`);
  let depth = 0;
  for (let i = MODULE.indexOf("{", start); i < MODULE.length; i++) {
    if (MODULE[i] === "{") depth++;
    else if (MODULE[i] === "}" && --depth === 0) return MODULE.slice(start, i + 1);
  }
  return expect.fail(`Resource ${type}.${name} never closes`);
}

/** The two conditions GitHub's token must meet, production's first (the provider's `attribute_condition`). */
function conditions(): { production: string; staging: string } {
  const line = /attribute_condition\s*=\s*var\.environment == "production" \? "([^"]*)" : "([^"]*)"/.exec(resource("google_iam_workload_identity_pool_provider", "github"));
  if (!line) expect.fail("The provider's condition isn't one for production and one for staging");
  return { production: line[1]!, staging: line[2]! };
}

/** A workflow's triggers: the keys under its top-level `on:`. */
function triggers(source: string): string[] {
  const block = /^on:\n((?:[ \t]+.*\n|\n)*)/m.exec(source)?.[1] ?? "";
  return [...block.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]!);
}

const REPOSITORY = "assertion.repository == '${var.github_repository}'";
const MAIN = "assertion.ref == 'refs/heads/main'";

describe("who may act as the deploy account", () => {
  test("M2-13: staging's deploy account takes only this repository's runs on main started by a merge, a schedule, or the builder: never a pull request's", () => {
    const { staging } = conditions();

    expect(staging).toContain(REPOSITORY);
    expect(staging).toContain(MAIN);
    expect(staging).toContain("assertion.event_name in ['push', 'schedule', 'workflow_dispatch']");
    expect(staging).not.toMatch(/pull_request|workflow_run|\|\|/);
  });

  test("M2-13: production's deploy account takes only this repository's runs on main in the protected production environment", () => {
    const { production } = conditions();

    expect(production).toContain(REPOSITORY);
    expect(production).toContain(MAIN);
    expect(production).toContain("assertion.environment == 'production'");
    expect(production).not.toContain("||");
  });

  test("M2-13: only the deploy and release workflows may ask GitHub for a token to show Google, and neither runs for a pull request", () => {
    const asking = [...workflows].filter(([, source]) => /^\s*id-token:\s*write\b|\bwrite-all\b/m.test(source)).map(([name]) => name);

    expect(asking.sort()).toEqual(["deploy-staging.yml", "release.yml"]);
    expect(triggers(workflow("deploy-staging.yml")).sort()).toEqual(["push", "workflow_dispatch"]);
    expect(workflow("deploy-staging.yml")).toMatch(/^ {2}push:\n {4}branches: \[main\]\n/m);
    expect(triggers(workflow("release.yml"))).toEqual(["workflow_dispatch"]);
  });

  test("M2-13: a release runs only on main, in the production environment, which waits for the builder's approval", () => {
    const release = workflow("release.yml");

    expect(release).toMatch(/^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
    expect(release).toMatch(/^ {4}environment: production$/m);
  });
});

describe("what the deploy account may do", () => {
  test("M2-13: it deploys and pushes images, and acts only as the service and the migrations; it reads no secret", () => {
    expect(resource("google_project_iam_member", "deploy")).toMatch(/for_each\s*=\s*toset\(concat\(\["roles\/run\.developer"\], var\.stop_database_nightly \? \["roles\/cloudsql\.editor"\] : \[\]\)\)/);
    expect(resource("google_service_account_iam_member", "deploy_acts_as")).toMatch(/for_each\s*=\s*\{ service = google_service_account\.service\.name, migrate = google_service_account\.migrate\.name \}/);
    const readers = /secret_readers = \{([^}]*)\}/.exec(MODULE)?.[1] ?? expect.fail("No secret_readers");
    expect([...readers.matchAll(/^\s*"(\w+)\//gm)].map((match) => match[1])).not.toContain("deploy");

    // Every grant to it, or of it, is one of these four: no other resource names the account, by reference or by address.
    const granting = ["google_service_account_iam_member.deploy_from_github", "google_project_iam_member.deploy", "google_artifact_registry_repository_iam_member.deploy_push", "google_service_account_iam_member.deploy_acts_as"];
    const naming = [...MODULE.matchAll(/^resource "(\w+)" "(\w+)" \{/gm)].map((match) => `${match[1]}.${match[2]}`).filter((name) => /google_service_account\.deploy\b/.test(resource(...(name.split(".") as [string, string]))));
    expect(naming.sort()).toEqual(granting.sort());
    expect(MODULE.match(/steelman-deploy/g)).toHaveLength(1); // its own account_id
    for (const source of Object.values(ENVIRONMENTS)) expect(source).not.toMatch(/^resource /m);
  });

  test("M2-13: only staging's deploy account may change the database's settings, to start it; production's can't, so it can't export the database either", () => {
    const roles = resource("google_project_iam_member", "deploy");

    expect(roles).toMatch(/var\.stop_database_nightly \? \["roles\/cloudsql\.editor"\] : \[\]/);
    expect(roles).not.toMatch(/"roles\/cloudsql\.(admin|client)"/);
    expect(VARIABLES).toMatch(/variable "stop_database_nightly" \{[^}]*default\s*=\s*false/);
    expect(ENVIRONMENTS.staging).toMatch(/^\s*stop_database_nightly\s*=\s*true\b/m);
    expect(ENVIRONMENTS.production).not.toMatch(/stop_database_nightly/);
  });
});
