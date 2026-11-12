import { defineConfig, devices } from "@playwright/test";

// The browser tests (plans/architecture.md §8, layer 6). `npm run test:browser`
// runs them; `npm run check` includes them. Each test gets its own database
// and service (e2e/support/board.ts), so they can run side by side.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  // A test that fails once has failed, as in the other tests.
  retries: 0,
  forbidOnly: true,
  fullyParallel: true,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]] : "list",
  outputDir: "e2e/results",
  // Fonts render differently on each system, so each keeps its own saved screenshots.
  snapshotPathTemplate: "e2e/screenshots/{arg}-{platform}{ext}",
  // A run never replaces a saved screenshot (AGENTS.md rule 9). Locally, a missing one fails the test until it is
  // made on purpose with --update-snapshots=missing; in CI, a missing one is written and kept with the run's results.
  updateSnapshots: process.env.CI ? "missing" : "none",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
});
