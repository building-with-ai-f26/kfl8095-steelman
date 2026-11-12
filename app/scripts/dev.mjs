// `npm run dev`: runs the service and the web app's dev server side by side,
// and stops both when either stops or you press Ctrl+C.
//
// The service always takes port 3000 here, whatever PORT says, because the
// web app's dev server sends /api requests there (web/vite.config.ts).

import { spawn } from "node:child_process";
import process from "node:process";

const children = [
  spawn("npm", ["run", "dev", "--workspace", "@steelman/server"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "3000" },
  }),
  spawn("npm", ["run", "dev", "--workspace", "@steelman/web"], { stdio: "inherit" }),
];

function stopAll() {
  for (const child of children) child.kill();
}

for (const child of children) child.on("exit", stopAll);
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
