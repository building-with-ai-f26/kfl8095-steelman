import { expect, test } from "vitest";
import { withoutProfileNames } from "../src/analytics.ts";

// No name reaches PostHog (L-03, M-08): a profile's address holds a username,
// and PostHog sends the page's address with every event, the page before it,
// and a clicked link's address. The app rewrites each before it's sent.

test("L-03, M-08: every /u/<name> in an event becomes /u/:username, wherever it sits", () => {
  const event = {
    event: "$pageview",
    properties: {
      $current_url: "https://staging.example.test/u/lin.zhao",
      $pathname: "/u/lin.zhao/",
      $referrer: "https://staging.example.test/u/omar_h?x=1#top",
      $elements: [{ tag_name: "a", attr__href: "/u/tess.b" }],
      $elements_chain: 'a.sm-back-button:attr__href="/u/maya.chen"nth-child="1"',
      $snapshot_data: [{ type: 4, data: { href: "http://127.0.0.1:5173/u/jordan_w" } }],
      count: 3,
      on: true,
      none: null,
    },
  };
  const sent = withoutProfileNames(event);
  expect(JSON.stringify(sent)).not.toMatch(/lin\.zhao|omar_h|tess\.b|maya\.chen|jordan_w/);
  expect(sent.properties.$current_url).toBe("https://staging.example.test/u/:username");
  expect(sent.properties.$pathname).toBe("/u/:username/");
  expect(sent.properties.$referrer).toBe("https://staging.example.test/u/:username?x=1#top");
  expect(sent.properties.count).toBe(3);
  expect(sent.properties.on).toBe(true);
  expect(sent.properties.none).toBeNull();
});

test("L-03, M-08: an event with no profile address goes as it was", () => {
  const event = { event: "$pageview", properties: { $current_url: "https://staging.example.test/b/demo-board-1", $pathname: "/b/demo-board-1/v/abc" } };
  expect(withoutProfileNames(event)).toEqual(event);
  expect(withoutProfileNames(null)).toBeNull();
  // The event's timestamp is a Date, which goes as it is.
  const at = new Date("2026-11-26T12:00:00Z");
  expect(withoutProfileNames({ timestamp: at }).timestamp).toBe(at);
});
