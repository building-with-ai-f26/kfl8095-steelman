import { expect, test } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/database.ts";
import { useTestDatabase } from "../support/database.ts";

// A connection the database ends while it sits idle in the pool, as Cloud
// SQL's maintenance does, or dropping a test's database at the end of a
// browser test. Postgres says "terminating connection due to administrator
// command"; the pool drops that connection and opens another when next
// needed. Without a listener for it, Node would treat it as an uncaught error
// and stop the whole process: in production the service, in CI whichever
// browser test was running (M1-14).

const db = useTestDatabase({ migrated: true });

test("M-01: an idle connection ended by the database doesn't stop the service; the next query opens another", async () => {
  const database = createDatabase(db.url);
  try {
    expect((await sql<{ one: number }>`select 1 as one`.execute(database)).rows).toEqual([{ one: 1 }]);

    const ended = await db.client.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()");
    expect(ended.rowCount).toBeGreaterThan(0);
    // Let the ended connection's notice arrive while it sits idle.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect((await sql<{ one: number }>`select 1 as one`.execute(database)).rows).toEqual([{ one: 1 }]);
  } finally {
    await database.destroy();
  }
});
