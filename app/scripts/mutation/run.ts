// `npm run test:mutation`: starts one Postgres, runs Stryker with every test
// runner pointed at it (TEST_DATABASE_URL), then stops it.
//
// Stryker kills a test runner whose tests hang on a mutant, which skips the
// runner's own cleanup. If each runner started its own Postgres, every such
// kill would leak one (on macOS, after about 30 leaks, Postgres can't start
// at all). Started here, it outlives the runners and is stopped once.

import { spawn } from "node:child_process";
import process from "node:process";
import { startPostgres } from "../../server/test/support/postgres.ts";

const postgres = await startPostgres();
let exitCode: number;
try {
  exitCode = await new Promise<number>((resolve, reject) => {
    const stryker = spawn("npx", ["stryker", "run", ...process.argv.slice(2)], {
      stdio: "inherit",
      env: { ...process.env, TEST_DATABASE_URL: postgres.url, TEST_DATABASE: postgres.kind },
    });
    stryker.on("error", reject);
    stryker.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await postgres.stop();
}
process.exitCode = exitCode;
