import { describe, expect, test } from "vitest";
import { networkOf } from "../../src/app.ts";
import { LIMITS } from "../../src/limits.ts";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";

// Asking for sign-in codes is limited per network address as well as per
// email address, so one machine can't cycle through addresses (M2-6,
// architecture §7 "Rate limits and abuse"). Deployed, the address is the last
// X-Forwarded-For entry, the one Cloud Run appends; run locally, it's the
// connection's own. Emails are kept in memory, never sent.

const db = useTestDatabase({ migrated: true });
const deployed = useSignIn(db, { seed: 1, behindProxy: true });
const local = useSignIn(db, { seed: 2 });
const HOUR = 60 * 60 * 1000;
const MOST = LIMITS.signInCode.most;

let n = 0;
const newAddress = () => `visitor${++n}@school.example.edu`;
/** Both copies' clocks move together, as real ones would. */
const later = (milliseconds: number) => {
  deployed.clock.advance(milliseconds);
  local.clock.advance(milliseconds);
};

describe("asking for sign-in codes from one network", () => {
  test("M-12 L-01: codes to many different addresses stop at the limit, with how long to wait; another network isn't affected; an hour later it's allowed", async () => {
    const network = "203.0.113.7";
    for (let i = 0; i < MOST; i++) expect((await deployed.requestCode(newAddress(), { forwardedFor: network })).status, `request ${i + 1}`).toBe(200);
    const sent = deployed.outbox.length;

    const over = await deployed.requestCode(newAddress(), { forwardedFor: network });

    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(over.body.retryAfter).toBeGreaterThan(0);
    expect(deployed.outbox).toHaveLength(sent);
    expect((await deployed.requestCode(newAddress(), { forwardedFor: "198.51.100.9" })).status).toBe(200);
    later(HOUR);
    expect((await deployed.requestCode(newAddress(), { forwardedFor: network })).status).toBe(200);
  });

  test("M-12: a made-up X-Forwarded-For can't dodge the limit: only the entry Cloud Run adds counts", async () => {
    const network = "203.0.113.20";
    for (let i = 0; i < MOST; i++) {
      expect((await deployed.requestCode(newAddress(), { forwardedFor: `10.0.${i}.1, ${network}` })).status).toBe(200);
    }

    expect((await deployed.requestCode(newAddress(), { forwardedFor: `10.9.9.9, ${network}` })).status).toBe(429);
    expect((await deployed.requestCode(newAddress(), { forwardedFor: network })).status).toBe(429);
  });

  test("M-12: addresses in one IPv6 /64, the block one line is given, count as one network; the next block is another", async () => {
    for (let i = 0; i < MOST; i++) expect((await deployed.requestCode(newAddress(), { forwardedFor: `2001:db8:5:6::${(i + 1).toString(16)}` })).status).toBe(200);

    expect((await deployed.requestCode(newAddress(), { forwardedFor: "2001:db8:5:6:ffff:1:2:3" })).status).toBe(429);
    expect((await deployed.requestCode(newAddress(), { forwardedFor: "2001:db8:5:7::1" })).status).toBe(200);
  });

  test("M-12: how a network is written: IPv4 as it is, IPv6 by its first 64 bits however it's written", () => {
    expect(networkOf("203.0.113.7")).toBe("203.0.113.7");
    expect(networkOf("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(networkOf("2001:db8:5:6::1")).toBe("2001:db8:5:6::/64");
    expect(networkOf("2001:0DB8:0005:0006:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:5:6::/64");
    expect(networkOf("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(networkOf("::1")).toBe("0:0:0:0::/64");
    expect(networkOf("fe80::1%en0")).toBe("fe80:0:0:0::/64");
  });

  test("M-12: run locally, the service ignores X-Forwarded-For and counts the connection", async () => {
    for (let i = 0; i < MOST; i++) expect((await local.requestCode(newAddress(), { forwardedFor: `203.0.113.${i + 100}` })).status).toBe(200);

    expect((await local.requestCode(newAddress(), { forwardedFor: "198.51.100.200" })).status).toBe(429);
  });

  test("M-12 L-01: a class of 25 on one school network can all sign in, with five asking for a second code", async () => {
    const network = "192.0.2.50";
    const classmates = Array.from({ length: 25 }, newAddress);
    for (const email of classmates) expect((await deployed.requestCode(email, { forwardedFor: network })).status).toBe(200);
    for (const email of classmates.slice(0, 5)) expect((await deployed.requestCode(email, { forwardedFor: network })).status).toBe(200);

    for (const email of classmates) expect((await deployed.signIn(email)).cookie, email).toBeDefined();
  });
});
