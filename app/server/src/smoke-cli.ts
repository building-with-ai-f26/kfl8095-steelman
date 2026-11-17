// `npx tsx server/src/smoke-cli.ts <address>`: the deploy workflow's smoke test.
// Prints what's wrong and exits 1, or says all is well.

import { smokeTest } from "./smoke.ts";

const base = process.argv[2];
if (!base) {
  console.error("Give the address to test, e.g. https://staging.steelman-argument.com");
  process.exit(1);
}
const failures = await smokeTest(base);
if (failures.length > 0) {
  console.error(`Smoke test failed at ${base}:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`Smoke test passed at ${base}.`);
