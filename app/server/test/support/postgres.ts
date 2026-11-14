// Starts the Postgres the tests run against: a real Postgres 17, in Docker
// when Docker is running, otherwise from the binaries `npm install` put in
// node_modules (the embedded-postgres package). Either way it is new, empty,
// and thrown away afterwards (plans/architecture.md §8, "One command").

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const run = promisify(execFile);

export type DatabaseKind = "docker" | "embedded";

export interface RunningPostgres {
  kind: DatabaseKind;
  /** Connection address for the server's built-in `postgres` database, as its superuser. */
  url: string;
  stop(): Promise<void>;
}

/**
 * Decides where the test database runs. `requested` is the TEST_DATABASE
 * environment variable: unset means "Docker if it's running, else embedded".
 */
export function chooseDatabase(options: { requested: string | undefined; dockerRunning: boolean }): DatabaseKind {
  const { requested, dockerRunning } = options;
  if (requested === undefined || requested === "") return dockerRunning ? "docker" : "embedded";
  if (requested === "embedded") return "embedded";
  if (requested === "docker") {
    if (!dockerRunning) throw new Error("TEST_DATABASE=docker, but Docker isn't running");
    return "docker";
  }
  throw new Error(`TEST_DATABASE must be "docker" or "embedded", not "${requested}"`);
}

export async function startPostgres(): Promise<RunningPostgres> {
  const requested = process.env.TEST_DATABASE;
  // One Postgres already started for a whole run (the mutation run,
  // scripts/mutation/run.ts): use it, and leave stopping it to whoever
  // started it.
  const existing = process.env.TEST_DATABASE_URL;
  if (existing) return { kind: requested === "docker" ? "docker" : "embedded", url: existing, stop: async () => {} };
  const kind = chooseDatabase({ requested, dockerRunning: await isDockerRunning() });
  if (kind === "embedded") return startEmbedded();
  try {
    return await startInDocker();
  } catch (error) {
    // Docker is running but couldn't give us Postgres (most often: the image
    // isn't downloaded and there's no network). Unless Docker was asked for
    // by name, carry on with the embedded one rather than fail the run.
    if (requested === "docker") throw error;
    console.warn(`Test database: Docker couldn't start Postgres, using the embedded one instead.\n${String(error)}`);
    return startEmbedded();
  }
}

// Both kinds are set up the same way, so a test can't pass on one and fail on
// the other: UTF-8, the plain "C" sort order (always installed, unlike named
// locales), and UTC. `fsync=off` trades crash safety, which a throwaway
// database doesn't need, for speed.
const INITDB_FLAGS = ["--encoding=UTF8", "--locale=C"];
const SERVER_SETTINGS = ["-c", "fsync=off", "-c", "timezone=UTC"];

async function isDockerRunning(): Promise<boolean> {
  try {
    await run("docker", ["info"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function startInDocker(): Promise<RunningPostgres> {
  // A new password every run: nothing to keep secret, and nothing to commit.
  const password = randomBytes(18).toString("hex");
  const { stdout: started } = await run("docker", [
    "run",
    "--detach",
    "--rm",
    "--label", "steelman=test-database",
    "--tmpfs", "/var/lib/postgresql/data",
    "--env", `POSTGRES_PASSWORD=${password}`,
    "--env", `POSTGRES_INITDB_ARGS=${INITDB_FLAGS.join(" ")}`,
    "--publish", "127.0.0.1::5432",
    "postgres:17",
    ...SERVER_SETTINGS,
  ]);
  const container = started.trim();
  const stop = async () => {
    await run("docker", ["rm", "--force", "--volumes", container]);
  };
  try {
    const { stdout: published } = await run("docker", ["port", container, "5432/tcp"]);
    const port = published.trim().split("\n")[0]?.split(":").pop();
    if (!port) throw new Error(`Couldn't read the test database's port from "${published}"`);
    const url = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
    await waitUntilReady(url);
    return { kind: "docker", url, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function startEmbedded(): Promise<RunningPostgres> {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const password = randomBytes(18).toString("hex");
  const port = await freePort();
  const directory = await mkdtemp(join(tmpdir(), "steelman-test-db-"));
  const output: string[] = [];
  const server = new EmbeddedPostgres({
    databaseDir: directory,
    port,
    user: "postgres",
    password,
    persistent: false,
    initdbFlags: INITDB_FLAGS,
    postgresFlags: SERVER_SETTINGS,
    // Postgres is chatty. Keep what it says, and show it only if it fails.
    onLog: (message) => output.push(String(message)),
    onError: (message) => output.push(String(message)),
  });
  try {
    await server.initialise();
    await server.start();
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw new Error(`The embedded test database didn't start.\n${output.join("\n")}`, { cause: error });
  }
  return {
    kind: "embedded",
    url: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
    async stop() {
      await server.stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

/** Asks the system for a port nobody is using. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("No free port"))));
    });
  });
}

/** Tries to connect until Postgres answers, for up to 60 seconds. */
async function waitUntilReady(url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 240; attempt++) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("select 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      await client.end().catch(() => {});
    }
  }
  throw new Error("The test database didn't become ready in 60 seconds", { cause: lastError });
}
