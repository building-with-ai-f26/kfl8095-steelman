import { describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { createDatabase } from "../../src/db/database.ts";
import { dailyCleanUp } from "../../src/jobs/daily.ts";
import { NOON, addAccount } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// The daily call (M1-14a; plans/architecture.md §7, Retention): what the
// retention table says goes after a while, goes. Sign-in codes once expired,
// sessions once expired, the record of sign-in emails sent once a day old (it
// only counts the last hour), and a deleted account's username after 30 days.

const db = useTestDatabase({ migrated: true });
const ids = createSeededIds(1402);
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(Date.parse(NOON) + offsetMs);

describe("the daily clean-up", () => {
  test("M-07: deletes expired codes and sessions, day-old sign-in email records, and releases usernames held 30 days", async () => {
    const person = await addAccount(db.client, ids, "dee", { confirmed: true });
    const insertCode = (id: string, expires: Date) =>
      db.client.query("insert into sign_in.sign_in_code (id, identifier, value, expires_at, created_at, updated_at) values ($1, $1, 'x', $2, $2, $2)", [id, expires]);
    await insertCode("code-expired", at(-HOUR));
    await insertCode("code-live", at(HOUR));
    const insertSession = (id: string, expires: Date) =>
      db.client.query("insert into sign_in.session (id, account_id, token, expires_at, created_at, updated_at) values ($1, $2, $1, $3, $3, $3)", [id, person, expires]);
    await insertSession("session-expired", at(-HOUR));
    await insertSession("session-live", at(HOUR));
    await db.client.query("insert into sign_in.sent_email (address_hash, sent_at) values ('old', $1), ('recent', $2)", [at(-25 * HOUR), at(-HOUR)]);
    const held = await addAccount(db.client, ids, "gone");
    await db.client.query("update account set deleted_at = $2, email = null where id = $1", [held, at(-30 * 24 * HOUR)]);

    const database = createDatabase(db.url);
    try {
      const done = await dailyCleanUp(database, { now: () => new Date(NOON) });
      expect(done).toEqual({ codes: 1, sessions: 1, sentEmails: 1, usernames: 1 });
    } finally {
      await database.destroy();
    }

    expect((await db.client.query("select id from sign_in.sign_in_code where id like 'code-%' order by id")).rows).toEqual([{ id: "code-live" }]);
    expect((await db.client.query("select id from sign_in.session where id like 'session-%' order by id")).rows).toEqual([{ id: "session-live" }]);
    expect((await db.client.query("select address_hash from sign_in.sent_email where address_hash in ('old', 'recent')")).rows).toEqual([{ address_hash: "recent" }]);
    expect((await db.client.query("select username from account where id = $1", [held])).rows[0].username).toBeNull();
  });
});
