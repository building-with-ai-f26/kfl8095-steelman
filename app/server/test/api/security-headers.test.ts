import { describe, expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import { contentSecurityPolicy } from "../../src/app.ts";

// The Content Security Policy (M-07, M1-13; plans/architecture.md §7): every
// answer from the service says which sites the page may load from. Its own
// site, Google Fonts, and PostHog when the service has a key; nothing else.
// Nobody may put the app in a frame.

const clock = createFakeClock(new Date("2026-11-16T12:00:00Z"));
const ids = createSeededIds(1301);

const directives = (policy: string) =>
  Object.fromEntries(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .map(([name, ...sources]) => [name, sources]),
  );

describe("the Content Security Policy", () => {
  test("M-07: without analytics, scripts and connections come only from the site itself", () => {
    const policy = directives(contentSecurityPolicy(undefined));

    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["script-src"]).toEqual(["'self'"]);
    expect(policy["connect-src"]).toEqual(["'self'"]);
    expect(policy["style-src"]).toEqual(["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]);
    expect(policy["font-src"]).toEqual(["'self'", "https://fonts.gstatic.com"]);
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'none'"]);
  });

  test("M-08: with analytics, PostHog's script and its address are allowed too", () => {
    const policy = directives(contentSecurityPolicy({ key: "phc_x", host: "https://us.i.posthog.com" }));

    expect(policy["script-src"]).toEqual(["'self'", "https://us-assets.i.posthog.com"]);
    expect(policy["connect-src"]).toEqual(["'self'", "https://us.i.posthog.com", "https://us-assets.i.posthog.com"]);
    expect(policy["worker-src"]).toEqual(["'self'", "blob:"]);
  });

  test("M-07: the service sends it with every answer", async () => {
    const app = buildApp({ clock, ids, mode: "test" });
    await app.ready();
    try {
      for (const url of ["/api/health", "/api/no-such-thing"]) {
        const response = await app.inject({ method: "GET", url });
        expect(response.headers["content-security-policy"], url).toBe(contentSecurityPolicy(undefined));
        expect(response.headers["x-content-type-options"], url).toBe("nosniff");
      }
    } finally {
      await app.close();
    }
  });
});
