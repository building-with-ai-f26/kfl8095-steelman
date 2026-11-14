import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { NOON, addAccount, asRole } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// The tables sign-in needs (L-01): sessions, codes, sign-in methods, and the
// count of sign-in emails. They live in their own schema, `sign_in`, apart
// from the board's tables in `public`; the person is still `public.account`.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(612);

describe("sign-in's tables", () => {
  test("L-01: are in the sign_in schema", async () => {
    const tables = await db.client.query("select tablename from pg_tables where schemaname = 'sign_in' order by tablename");
    expect(tables.rows.map((row) => row.tablename)).toEqual(["sent_email", "session", "sign_in_code", "sign_in_method"]);
  });

  test("L-01: the service may add and remove sessions and codes, which unlike board content are really deleted", async () => {
    const person = await addAccount(db.client, ids, "session_owner");

    await asRole(db.client, "steelman_app", async () => {
      await db.client.query(
        "insert into sign_in.session (id, account_id, token, expires_at, created_at, updated_at) values ($1, $2, $3, $4, $4, $4)",
        [ids.itemId(), person, ids.itemId(), NOON],
      );
      await db.client.query("insert into sign_in.sign_in_code (id, identifier, value, expires_at, created_at, updated_at) values ($1, 'x', 'y', $2, $2, $2)", [ids.itemId(), NOON]);
      await db.client.query("delete from sign_in.session where account_id = $1", [person]);
      await db.client.query("delete from sign_in.sign_in_code where identifier = 'x'");
    });
  });

  test("L-01: a session belongs to an account that exists", async () => {
    await expect(
      db.client.query("insert into sign_in.session (id, account_id, token, expires_at, created_at, updated_at) values ($1, 'nobody', $2, $3, $3, $3)", [ids.itemId(), ids.itemId(), NOON]),
    ).rejects.toThrow(/foreign key/);
  });

  test("L-01: an account can exist before it has a username or an email (a new sign-in, or a test user)", async () => {
    await db.client.query("insert into account (id, created_at) values ($1, $2)", [ids.itemId(), NOON]);
    await db.client.query("insert into account (id, username, created_at) values ($1, 'no_email', $2)", [ids.itemId(), NOON]);
  });

  test("L-01: an email address belongs to one account, whatever its capitals", async () => {
    await db.client.query("insert into account (id, email, created_at) values ($1, 'Pat@School.example.edu', $2)", [ids.itemId(), NOON]);

    await expect(db.client.query("insert into account (id, email, created_at) values ($1, 'pat@school.example.edu', $2)", [ids.itemId(), NOON])).rejects.toThrow(/duplicate key/);
  });
});
