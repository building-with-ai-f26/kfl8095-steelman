import { defineConfig } from "vitest/config";

// One test run for all three parts. Only the server's tests get a database,
// started once by its global setup (server/test/support/global-setup.ts).
export default defineConfig({
  test: {
    // A test that fails once has failed: no retries, and no `.only` left
    // behind to hide the rest (plans/architecture.md §8).
    retry: 0,
    allowOnly: false,
    projects: [
      { test: { name: "tooling", include: ["test/**/*.test.ts"] } },
      { test: { name: "shared", include: ["shared/test/**/*.test.ts"] } },
      {
        test: {
          name: "server",
          include: ["server/test/**/*.test.ts"],
          globalSetup: ["server/test/support/global-setup.ts"],
        },
      },
      { test: { name: "web", include: ["web/test/**/*.test.{ts,tsx}"] } },
    ],
  },
});
