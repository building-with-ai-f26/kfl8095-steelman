import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// The tests the mutation run uses (stryker.config.json): those that exercise
// shared/ and the server, the code it mutates. Left out: the tooling and web
// tests, which never run that code; the planted-bug tests, which run their
// own changed copies of it; and the simulation and soak tests. Those two are
// random, so a break they catch one night they may miss the next, and the
// simulation alone made a run take 15 hours instead of about one. They still
// run in `npm run check`. Same settings as vitest.config.ts otherwise.
//
// Stryker works in a copy of app/ whose node_modules links back to the real
// one, so `@steelman/shared` would load the original, unchanged shared/ and
// the server's tests would never see a break in it. These aliases load the
// copy's own.
const here = import.meta.dirname;
const alias = [
  { find: /^@steelman\/shared\/testing$/, replacement: resolve(here, "shared/src/testing.ts") },
  { find: /^@steelman\/shared$/, replacement: resolve(here, "shared/src/index.ts") },
];

export default defineConfig({
  test: {
    retry: 0,
    allowOnly: false,
    projects: [
      { resolve: { alias }, test: { name: "shared", include: ["shared/test/**/*.test.ts"] } },
      {
        resolve: { alias },
        test: {
          name: "server",
          include: ["server/test/**/*.test.ts"],
          exclude: ["server/test/simulation/**", "server/test/soak/**"],
          globalSetup: ["server/test/support/global-setup.ts"],
        },
      },
    ],
  },
});
