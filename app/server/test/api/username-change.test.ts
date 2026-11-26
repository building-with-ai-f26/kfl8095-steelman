import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { createDatabase } from "../../src/db/database.ts";
import { dailyCleanUp } from "../../src/jobs/daily.ts";
import { NOON, seedBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";

// Changing your username (L-04, M3d-15; plans/architecture.md §2, "Entities"
// and "Account deletion and anonymization"). Your account's Username row saves
// a new name through PUT /api/account/username. The old one is held for 30 days
// in username_hold, so no one else takes it, by a change or at first sign-in
// (Better Auth's /update-user). Both claims check account and username_hold in
// one transaction under pg_advisory_xact_lock(hashtext(lower(name))). Taking
// your own held name back ends its hold and doesn't count; otherwise a person
// changes their name once in 30 days. The daily job deletes ended holds.
//
// The row's example name, lin.zhao, has a dot, which the username rule refuses
// (shared/src/inputs.ts), so these tests use names such as lin_zhao.

const db = useTestDatabase({ migrated: true });
const api = useSignIn(db, { seed: 1515 });
const ids = createSeededIds(1517);
const DAY = 86_400_000;
// The clock only moves forward, so each test counts from where it starts.
let start = Date.parse(NOON);
beforeEach(() => {
  start = api.clock.now().getTime();
});
const at = (offsetMs: number) => new Date(start + offsetMs);

let addresses = 0;
const newAddress = () => `person${++addresses}@school.example.edu`;

/** An account with this username, which the test-user header can act as. */
async function person(username: string): Promise<string> {
  const id = ids.itemId();
  await db.client.query("insert into account (id, username, created_at) values ($1, $2, $3)", [id, username, NOON]);
  return id;
}

/** Calls the service as a test user, through the header (mode "test"). */
async function as(account: string, method: "GET" | "POST" | "PUT", url: string, body?: unknown) {
  const response = await api.app.inject({ method, url, headers: { "x-steelman-test-user": account }, ...(body === undefined ? {} : { payload: body as object }) });
  return { status: response.statusCode, body: response.body ? response.json() : undefined };
}

const change = (account: string, username: unknown) => as(account, "PUT", "/api/account/username", { username });
const usernameOf = async (account: string): Promise<string | null> => (await db.client.query("select username from account where id = $1", [account])).rows[0].username;
const idOf = async (email: string): Promise<string> => (await db.client.query("select id from account where email = $1", [email])).rows[0].id;
const holdsOf = async (account: string) =>
  (await db.client.query("select old_name, ends_at from username_hold where account_id = $1 order by ends_at", [account])).rows as { old_name: string; ends_at: Date }[];
const ownersOf = async (name: string) => (await db.client.query("select id from account where lower(username) = lower($1)", [name])).rows.map((row) => row.id as string);
const pickAtFirstSignIn = (cookie: string, username: string) => api.request("POST", "/api/auth/update-user", { cookie, body: { username } });

async function runDailyJob(now: Date) {
  const database = createDatabase(db.url);
  try {
    return await dailyCleanUp(database, { now: () => now });
  } finally {
    await database.destroy();
  }
}

/** Holds the name's lock from the test's own connection, so claims sent meanwhile wait at the same lock, then lets them go together. */
async function race<T>(name: string, claims: () => Promise<T>[]): Promise<T[]> {
  await db.client.query("select pg_advisory_lock(hashtext(lower($1)))", [name]);
  let sent: Promise<T[]>;
  try {
    sent = Promise.all(claims());
    // Both claims wait at the lock before it's let go, so neither is first by arriving first.
    for (let tries = 0; ; tries++) {
      // Only this database's one-key lock on this name counts, not other test files' sign-in locks on the same server.
      const waiting = await db.client.query(
        `select count(*)::int as n from pg_locks
          where locktype = 'advisory' and not granted and objsubid = 1
            and database = (select oid from pg_database where datname = current_database())
            and ((classid::bigint << 32) | objid::bigint) = hashtext(lower($1))::bigint`,
        [name],
      );
      if (waiting.rows[0].n >= 2) break;
      if (tries > 200) throw new Error("The claims never waited at the name's lock");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    await db.client.query("select pg_advisory_unlock(hashtext(lower($1)))", [name]);
  }
  return sent;
}

describe("changing your username", () => {
  test("L-04: a change saves, and the snapshot, History, and comments show the new name", async () => {
    const b = await seedBoard(db.client, ids);
    const commentId = ids.itemId();
    expect((await as(b.ana, "POST", `/api/boards/${b.board}/comments`, { id: commentId, body: "A note from Ana." })).status).toBe(200);
    const before = await usernameOf(b.ana);

    const changed = await change(b.ana, "Ana_Renamed");

    expect(changed).toEqual({ status: 200, body: { status: "done", username: "ana_renamed" } });
    expect(await usernameOf(b.ana)).toBe("ana_renamed");
    const snapshot = (await as(b.ben, "GET", `/api/boards/${b.board}`)).body;
    expect(snapshot.versions.filter((v: { authorId: string }) => v.authorId === b.ana).map((v: { authorName: string }) => v.authorName)).toEqual(["ana_renamed", "ana_renamed"]);
    expect(snapshot.comments.find((c: { id: string }) => c.id === commentId).authorName).toBe("ana_renamed");
    const history = (await as(b.ben, "GET", `/api/boards/${b.board}/history`)).body.entries as { actorName: string }[];
    expect(history.length).toBeGreaterThan(0);
    expect(history.map((entry) => entry.actorName)).toContain("ana_renamed");
    expect(history.map((entry) => entry.actorName)).not.toContain(before);
    expect(await holdsOf(b.ana)).toEqual([{ old_name: before, ends_at: at(30 * DAY) }]);
  });

  test("L-04: the old name is refused to someone else for 30 days, by a change and at first sign-in, and is free after the daily job runs past the hold", async () => {
    const rhea = await person("rhea_k");
    const other = await person("other_one");
    expect((await change(rhea, "rhea_new")).status).toBe(200);
    const newcomer = await api.signedIn(newAddress());

    expect(await change(other, "Rhea_K")).toEqual({ status: 409, body: { status: "refused", reason: "taken" } });
    const refused = await pickAtFirstSignIn(newcomer, "rhea_k");
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("USERNAME_IS_ALREADY_TAKEN");

    api.clock.advance(29 * DAY);
    expect((await change(other, "rhea_k")).body).toEqual({ status: "refused", reason: "taken" });
    await runDailyJob(api.clock.now());
    expect(await holdsOf(rhea)).toHaveLength(1);

    api.clock.advance(DAY + 1_000);
    await runDailyJob(api.clock.now());
    expect(await holdsOf(rhea)).toEqual([]);
    // Sessions last 30 days, so the newcomer signs in again.
    const email = newAddress();
    const later = await api.signedIn(email);
    expect((await pickAtFirstSignIn(later, "rhea_k")).status).toBe(200);
    expect(await ownersOf("rhea_k")).toEqual([await idOf(email)]);
    expect(await usernameOf(other)).toBe("other_one");
  });

  test("L-04: a hold that has ended still keeps the old name from others, by a change and at first sign-in, until the daily job deletes it", async () => {
    const noa = await person("noa_old");
    const other = await person("other_two");
    expect((await change(noa, "noa_new")).status).toBe(200);

    api.clock.advance(30 * DAY + 1_000);
    expect(await change(other, "noa_old")).toEqual({ status: 409, body: { status: "refused", reason: "taken" } });
    const refused = await pickAtFirstSignIn(await api.signedIn(newAddress()), "noa_old");
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("USERNAME_IS_ALREADY_TAKEN");
    expect(await holdsOf(noa)).toHaveLength(1);

    await runDailyJob(api.clock.now());
    expect(await holdsOf(noa)).toEqual([]);
    expect(await change(other, "Noa_Old")).toEqual({ status: 200, body: { status: "done", username: "noa_old" } });
    expect(await ownersOf("noa_old")).toEqual([other]);
  });

  test("L-04: its owner takes an ended hold's name back before the daily job deletes it", async () => {
    const ora = await person("ora_old");
    expect((await change(ora, "ora_new")).status).toBe(200);
    api.clock.advance(30 * DAY + 1_000);

    expect(await change(ora, "ora_old")).toEqual({ status: 200, body: { status: "done", username: "ora_old" } });
    expect(await holdsOf(ora)).toEqual([]);
  });

  test("L-04: two changes to one name at the same moment leave exactly one owner", async () => {
    const first = await person("racer_one");
    const second = await person("racer_two");

    const answers = await race("lin_zhao", () => [change(first, "lin_zhao"), change(second, "Lin_Zhao")]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect(await ownersOf("lin_zhao")).toHaveLength(1);
    const loser = answers[0]!.status === 200 ? second : first;
    expect(await holdsOf(loser)).toEqual([]);
    expect(await usernameOf(loser)).toMatch(/^racer_/);
  });

  test("L-04: a change and a first sign-in claiming one name at the same moment leave exactly one owner", async () => {
    const changer = await person("racer_three");
    const cookie = await api.signedIn(newAddress());

    const [changed, picked] = await race("lin_zhao_2", () => [change(changer, "lin_zhao_2"), pickAtFirstSignIn(cookie, "lin_zhao_2")]);

    expect([changed!.status, picked!.status].filter((status) => status === 200)).toHaveLength(1);
    if (changed!.status !== 200) expect(changed!.body).toEqual({ status: "refused", reason: "taken" });
    if (picked!.status !== 200) expect(picked!.body.code).toBe("USERNAME_IS_ALREADY_TAKEN");
    expect(await ownersOf("lin_zhao_2")).toHaveLength(1);
  });

  test("L-04: its owner takes the held name back during the hold, the hold ends, and a later change in the same 30 days is still allowed once", async () => {
    const tia = await person("tia_one");
    expect((await change(tia, "tia_two")).status).toBe(200);
    api.clock.advance(5 * DAY);

    expect(await change(tia, "Tia_One")).toEqual({ status: 200, body: { status: "done", username: "tia_one" } });
    expect(await holdsOf(tia)).toEqual([]);
    // Taking a name back holds nothing for the name left, so it's free at once.
    const someone = await person("someone_else");
    expect((await change(someone, "tia_two")).status).toBe(200);

    api.clock.advance(DAY);
    expect(await change(tia, "tia_three")).toEqual({ status: 200, body: { status: "done", username: "tia_three" } });
    expect(await holdsOf(tia)).toEqual([{ old_name: "tia_one", ends_at: at(36 * DAY) }]);
    expect(await change(tia, "tia_four")).toEqual({ status: 409, body: { status: "refused", reason: "too_soon", again: at(36 * DAY).toISOString() } });
  });

  test("L-04: a name taken in other capitals, an invalid one, and a reserved one are refused, and nothing changes", async () => {
    await person("dana_k");
    const sam = await person("sam_r");

    expect(await change(sam, "Dana_K")).toEqual({ status: 409, body: { status: "refused", reason: "taken" } });
    for (const invalid of ["ab", "a".repeat(21), "sam reyes", "sam-reyes!", "lin.zhao", ""]) {
      expect(await change(sam, invalid), invalid).toEqual({ status: 400, body: { status: "refused", reason: "invalid" } });
    }
    for (const reserved of ["Admin", "steelman", "deleted_account", "moderator"]) {
      expect(await change(sam, reserved), reserved).toEqual({ status: 400, body: { status: "refused", reason: "reserved" } });
    }
    expect((await change(sam, 42)).status).toBe(400);
    expect((await as(sam, "PUT", "/api/account/username", { username: "sam_new", extra: true })).status).toBe(400);
    expect(await usernameOf(sam)).toBe("sam_r");
    expect(await holdsOf(sam)).toEqual([]);
  });

  test("L-04: a second change within 30 days is refused with the date it's allowed again", async () => {
    const vic = await person("vic_one");
    expect((await change(vic, "vic_two")).status).toBe(200);
    api.clock.advance(10 * DAY);

    expect(await change(vic, "vic_three")).toEqual({ status: 409, body: { status: "refused", reason: "too_soon", again: at(30 * DAY).toISOString() } });
    expect(await usernameOf(vic)).toBe("vic_two");

    // Once the hold has ended, a change is allowed, even before the daily job has deleted it, and it holds one old name.
    api.clock.advance(20 * DAY);
    expect((await change(vic, "vic_three")).status).toBe(200);
    expect(await holdsOf(vic)).toEqual([{ old_name: "vic_two", ends_at: at(60 * DAY) }]);
  });

  test("L-04: the same name sent twice changes nothing the second time", async () => {
    const uma = await person("uma_one");

    expect(await change(uma, "uma_two")).toEqual({ status: 200, body: { status: "done", username: "uma_two" } });
    expect(await change(uma, "Uma_Two")).toEqual({ status: 200, body: { status: "already_done" } });
    expect(await holdsOf(uma)).toEqual([{ old_name: "uma_one", ends_at: at(30 * DAY) }]);

    // Your current name, sent with no change before it, holds nothing and uses up no change.
    const wes = await person("wes_one");
    expect(await change(wes, "wes_one")).toEqual({ status: 200, body: { status: "already_done" } });
    expect(await holdsOf(wes)).toEqual([]);
    expect((await change(wes, "wes_two")).status).toBe(200);
  });

  test("L-04: an invitation by a held old name is refused as unknown", async () => {
    const b = await seedBoard(db.client, ids);
    const lin = await person("lin_old");
    expect((await change(lin, "lin_new")).status).toBe(200);

    expect(await as(b.ana, "POST", `/api/boards/${b.board}/invites`, { username: "lin_old", role: "voter" })).toEqual({ status: 404, body: { reason: "not_found" } });
    expect((await as(b.ana, "POST", `/api/boards/${b.board}/invites`, { username: "lin_new", role: "voter" })).status).toBe(200);
  });

  test("L-04: after the daily job releases the hold, /api/people/<old name> answers 404", async () => {
    // Profiles (M3d-16) don't exist yet, so this route answers 404 for every name; the test keeps the row's promise for when they do.
    const pia = await person("pia_old");
    expect((await change(pia, "pia_new")).status).toBe(200);
    api.clock.advance(30 * DAY);
    await runDailyJob(api.clock.now());

    expect((await as(pia, "GET", "/api/people/pia_old")).status).toBe(404);
    expect(await ownersOf("pia_old")).toEqual([]);
  });

  test("L-04: signed out is 401, and a PUT from another origin is refused", async () => {
    const cookie = await api.signedIn(newAddress(), "kim_one");

    expect(await api.request("PUT", "/api/account/username", { body: { username: "kim_two" } })).toMatchObject({ status: 401, body: { status: "refused", reason: "signed_out" } });
    expect(await api.request("PUT", "/api/account/username", { cookie, origin: "https://elsewhere.example", body: { username: "kim_two" } })).toMatchObject({
      status: 403,
      body: { status: "refused", reason: "wrong_origin" },
    });
    expect(await api.request("PUT", "/api/account/username", { cookie, body: { username: "kim_two" } })).toMatchObject({ status: 200, body: { status: "done", username: "kim_two" } });
    expect((await api.request("GET", "/api/auth/get-session", { cookie })).body.user.username).toBe("kim_two");
  });

  test("L-04: an account that hasn't picked a username yet picks one at first sign-in, not here", async () => {
    const cookie = await api.signedIn(newAddress());

    expect(await api.request("PUT", "/api/account/username", { cookie, body: { username: "new_pick" } })).toMatchObject({ status: 403, body: { reason: "needs_username" } });
  });
});

describe("the hold, in your data and after deletion", () => {
  test("L-04, M-07: Download your data lists a held old name", async () => {
    const xia = await person("xia_one");
    expect((await as(xia, "GET", "/api/account/data")).body.heldUsername).toBeNull();

    expect((await change(xia, "xia_two")).status).toBe(200);

    const data = (await as(xia, "GET", "/api/account/data")).body;
    expect(data.account.username).toBe("xia_two");
    expect(data.heldUsername).toEqual({ username: "xia_one", until: at(30 * DAY).toISOString() });
  });

  test("L-04, M-07: deleting the account keeps the hold until it ends", async () => {
    const yan = await person("yan_one");
    const other = await person("yan_other");
    expect((await change(yan, "yan_two")).status).toBe(200);

    expect((await as(yan, "POST", "/api/account/delete", { username: "yan_two" })).status).toBe(200);

    expect(await holdsOf(yan)).toEqual([{ old_name: "yan_one", ends_at: at(30 * DAY) }]);
    expect((await change(other, "yan_one")).body).toEqual({ status: "refused", reason: "taken" });
    expect((await change(other, "yan_two")).body).toEqual({ status: "refused", reason: "taken" });
    api.clock.advance(30 * DAY);
    await runDailyJob(api.clock.now());
    expect(await holdsOf(yan)).toEqual([]);
    expect((await change(other, "yan_one")).status).toBe(200);
  });
});
