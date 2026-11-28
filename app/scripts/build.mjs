// `npm run build`: what the container runs (app/Dockerfile, M1-14a).
//
// - web/dist: the web app, built by Vite for production (with the web fonts).
// - server/dist: the service, its migration runner, the daily job, and the
//   builder's operator job (M3d-36), each bundled by esbuild (which comes
//   with Vite) into one JavaScript file with the shared rules inside it. Packages from npm stay outside the bundle and
//   are installed in the container as usual. Bundling means production runs
//   plain JavaScript: no TypeScript runner is needed at run time.

import { join } from "node:path";
import process from "node:process";
import { build as buildServer } from "esbuild";
import { build as buildWeb } from "vite";

const app = join(import.meta.dirname, "..");

await buildWeb({ root: join(app, "web"), mode: "production", logLevel: "warn", build: { outDir: "dist", emptyOutDir: true } });

await buildServer({
  entryPoints: { main: "server/src/main.ts", "migrate-cli": "server/src/db/migrate-cli.ts", "daily-cli": "server/src/jobs/daily-cli.ts", "operator-cli": "server/src/jobs/operator-cli.ts" },
  absWorkingDir: app,
  outdir: "server/dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // The server's own packages (server/package.json), installed in the container. @steelman/shared and the
  // zod it uses are bundled in, since the server doesn't install zod itself.
  external: ["better-auth", "fastify", "kysely", "pg"],
  logLevel: "warning",
});
process.stdout.write("Built web/dist and server/dist.\n");
