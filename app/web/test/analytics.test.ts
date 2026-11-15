import { expect, test } from "vitest";
import { decide, environmentOf, privacySignal } from "../src/analytics.ts";

// The decisions behind analytics on the app (M-08), as plain functions: the
// same rules as the Product Page's docs/analytics.js. The browser tests
// (e2e/analytics.spec.ts) check what they lead to.

const posthog = { key: "phc_test", host: "https://posthog.invalid" };

test("M-08: without a PostHog key from the service, analytics are off whatever the browser says", () => {
  expect(decide({ analytics: null, signal: false, stored: null })).toBe("off");
  expect(decide({ analytics: null, signal: false, stored: "on" })).toBe("off");
});

test("M-08: a privacy signal turns analytics off, even for someone who once said OK", () => {
  expect(decide({ analytics: posthog, signal: true, stored: null })).toBe("off");
  expect(decide({ analytics: posthog, signal: true, stored: "on" })).toBe("off");
});

test("M-08: analytics run until someone turns them off, and a first visit is asked", () => {
  expect(decide({ analytics: posthog, signal: false, stored: null })).toBe("ask");
  expect(decide({ analytics: posthog, signal: false, stored: "on" })).toBe("on");
  expect(decide({ analytics: posthog, signal: false, stored: "off" })).toBe("off");
});

test("M-08: Global Privacy Control and Do Not Track both count as a privacy signal", () => {
  expect(privacySignal({ globalPrivacyControl: true })).toBe(true);
  expect(privacySignal({ doNotTrack: "1" })).toBe(true);
  expect(privacySignal({}, "1")).toBe(true);
  expect(privacySignal({ doNotTrack: "0" })).toBe(false);
  expect(privacySignal({ doNotTrack: null, globalPrivacyControl: false })).toBe(false);
});

test("M-08: events say where the app was running, so a laptop's can be filtered out", () => {
  expect(environmentOf("localhost")).toBe("local");
  expect(environmentOf("127.0.0.1")).toBe("local");
  expect(environmentOf("staging.steelman-argument.com")).toBe("staging");
  expect(environmentOf("app.steelman-argument.com")).toBe("production");
});
