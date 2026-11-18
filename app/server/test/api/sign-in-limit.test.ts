import { describe, expect, test } from "vitest";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";
import type { Answer, SignInApi } from "../support/sign-in.ts";

// The limit of five sign-in emails per address an hour holds when many
// requests arrive at once, at one copy of the service or at several sharing
// the database (L-01; plans/architecture.md §7 "Rate limits and abuse";
// build plan M2-6a). Emails are kept in memory, never sent. An address has
// one code at a time, so of the codes sent together, one signs in.

const db = useTestDatabase({ migrated: true });
// Two copies of the service on one database, as Cloud Run runs up to three.
const one = useSignIn(db, { seed: 1 });
const two = useSignIn(db, { seed: 2 });
const MINUTE = 60_000;
const LIMIT = 5;
const CROWD = 12;

let n = 0;
/** A new address for each test, so their limits don't mix. */
const newAddress = () => `crowd${++n}@school.example.edu`;

/** Emails sent to an address, by both copies. */
const sentTo = (email: string) => [...one.outbox, ...two.outbox].filter((message) => message.to === email.toLowerCase()).length;
const refused = (answers: Answer[]) => answers.filter((answer) => answer.status === 429).length;

/** Both copies' clocks move together, as real ones would. */
const later = (milliseconds: number) => {
  one.clock.advance(milliseconds);
  two.clock.advance(milliseconds);
};

/** Sends CROWD requests for a code at once, alternating between the copies and between capitals and none. */
const crowd = (email: string, copies: SignInApi[]): Promise<Answer[]> =>
  Promise.all(Array.from({ length: CROWD }, (_, i) => copies[i % copies.length]!.requestCode(i % 3 === 0 ? email.toUpperCase() : email)));

describe("the sign-in email limit, with requests arriving together", () => {
  test("L-01: twelve requests at once for one address, in any capitals, let five past the limit and refuse the rest", async () => {
    const email = newAddress();

    const answers = await crowd(email, [one]);

    expect(refused(answers)).toBe(CROWD - LIMIT);
    expect(sentTo(email)).toBeGreaterThanOrEqual(1);
    expect(sentTo(email)).toBeLessThanOrEqual(LIMIT);
  });

  test("L-01: two copies of the service share one address's limit", async () => {
    const email = newAddress();

    const answers = await crowd(email, [one, two]);

    expect(refused(answers)).toBe(CROWD - LIMIT);
    expect(sentTo(email)).toBeLessThanOrEqual(LIMIT);
    // And once the limit is reached, neither copy sends another.
    expect((await one.requestCode(email)).status).toBe(429);
    expect((await two.requestCode(email)).status).toBe(429);
  });

  test("L-01: another address asking at the same moment has its own five", async () => {
    const [crowded, other] = [newAddress(), newAddress()];

    const crowding = crowd(crowded, [one, two]);
    const others: number[] = [];
    for (let i = 0; i < LIMIT; i++) others.push((await (i % 2 ? one : two).requestCode(other)).status);
    await crowding;

    expect(others).toEqual(Array(LIMIT).fill(200));
    expect(sentTo(other)).toBe(LIMIT);
  });

  test("L-01: after the hour, the address can be sent codes again", async () => {
    const email = newAddress();
    await crowd(email, [one, two]);
    expect((await one.requestCode(email)).status).toBe(429);

    later(60 * MINUTE + 1_000);

    expect((await two.requestCode(email)).status).toBe(200);
    expect((await one.requestCode(email)).status).toBe(200);
  });

  test("L-01: requests let past the limit together are each answered and emailed, never a server error, and one of their codes signs in", async () => {
    const email = newAddress();

    const answers = await crowd(email, [one, two]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([...Array(LIMIT).fill(200), ...Array(CROWD - LIMIT).fill(429)]);
    const codes = [...one.outbox, ...two.outbox].filter((message) => message.to === email).map((message) => message.code);
    expect(codes).toHaveLength(LIMIT);
    const signedIn: number[] = [];
    for (const code of codes) signedIn.push((await one.signIn(email, code)).status);
    expect(signedIn.filter((status) => status === 200)).toHaveLength(1);
  });
});
