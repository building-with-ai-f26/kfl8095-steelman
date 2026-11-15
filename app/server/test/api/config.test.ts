import { expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";

// What the web app asks the service when it starts: where analytics go, if
// anywhere. The PostHog key reaches the browser only this way, so a service
// that was given none (every test, and a laptop without one) sends nothing.

const clock = () => createFakeClock(new Date("2026-11-16T09:00:00Z"));

test("M-08: a service given a PostHog key tells the web app the key and where to send", async () => {
  const app = buildApp({ clock: clock(), ids: createSeededIds(1), analytics: { key: "phc_test", host: "https://posthog.invalid" } });

  const response = await app.inject({ method: "GET", url: "/api/config" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ analytics: { key: "phc_test", host: "https://posthog.invalid" } });
  await app.close();
});

test("M-08: a service given no PostHog key says analytics are off", async () => {
  const app = buildApp({ clock: clock(), ids: createSeededIds(1) });

  const response = await app.inject({ method: "GET", url: "/api/config" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ analytics: null });
  await app.close();
});
