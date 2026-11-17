// The service's own database login (M1-14b; plans/architecture.md §2 and
// migration 0001). Deployed, the service signs in as this login, which has
// steelman_app's rights and nothing more, so the database itself enforces the
// invariants. It may switch to steelman_account_deletion, which account
// deletion does inside its transaction (account.ts), but doesn't inherit that
// role's rights. The migration job creates it, signed in as the database's
// owner, after the migrations that create the two roles.
//
// Running it again changes nothing but the password.

import pg from "pg";

export async function provisionServiceLogin(ownerUrl: string, login: { name: string; password: string }): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const name = client.escapeIdentifier(login.name);
    const exists = await client.query("select 1 from pg_roles where rolname = $1", [login.name]);
    // Role statements take no parameters, so the password goes in as a quoted literal.
    await client.query(`${exists.rowCount ? "alter" : "create"} role ${name} with login password ${client.escapeLiteral(login.password)}`);
    await client.query(`grant steelman_app to ${name} with inherit true`);
    await client.query(`grant steelman_account_deletion to ${name} with inherit false, set true`);
  } finally {
    await client.end();
  }
}
