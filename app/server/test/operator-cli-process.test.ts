import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount } from "./support/board.ts";
import { useTestDatabase } from "./support/database.ts";

// The operator's command line as a process (J-06, M3d-36): the
// steelman-operator job's exit code is what `gcloud run jobs execute --wait`
// reports, so a takedown that matched nothing must exit with an error and say
// why on stderr, and one that worked must exit cleanly with its sentence on
// stdout. operator-cli.test.ts checks the sentences; this checks the exits.

const run = promisify(execFile);
const APP = join(import.meta.dirname, "..", "..");
const TSX = join(APP, "node_modules", ".bin", "tsx");
const CLI = join(APP, "server", "src", "jobs", "operator-cli.ts");
const USAGE = "Run one command: suspend <username>, unsuspend <username>, or make-private <space ID>.";

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(3603);

/** Runs the command line with these arguments, and answers its exit code and what it printed. */
async function cli(args: string[], env: Record<string, string | undefined> = { DATABASE_URL: db.url }) {
  // Only the address given here, never one from the shell that runs the tests.
  const inherited = { ...process.env };
  delete inherited.DATABASE_URL;
  try {
    const { stdout, stderr } = await run(TSX, [CLI, ...args], { cwd: APP, env: { ...inherited, ...env } });
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout.trim(), stderr: failed.stderr.trim() };
  }
}

describe("the operator's command line", () => {
  test("J-06: an unknown username prints its sentence to stderr and exits with an error", async () => {
    expect(await cli(["suspend", "no_such_person"])).toEqual({ code: 1, stdout: "", stderr: "No account has the username no_such_person." });
  }, 30_000);

  test("J-06: no command prints how to run it and exits with an error", async () => {
    expect(await cli([])).toEqual({ code: 1, stdout: "", stderr: USAGE });
  }, 30_000);

  test("J-06: with no DATABASE_URL it says to set one and exits with an error", async () => {
    expect(await cli(["suspend", "no_such_person"], {})).toEqual({ code: 1, stdout: "", stderr: "Set DATABASE_URL first (see app/.env.example)." });
  }, 30_000);

  test("J-06: a real username prints its sentence to stdout and exits cleanly", async () => {
    const id = await addAccount(db.client, ids, "lin");
    const username = (await db.client.query("select username from account where id = $1", [id])).rows[0].username as string;
    expect(await cli(["suspend", username])).toEqual({ code: 0, stdout: `${username} is now suspended, and they had no sessions to end.`, stderr: "" });
  }, 30_000);
});
