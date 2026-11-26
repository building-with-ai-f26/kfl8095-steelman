// Analytics on the app (M-08): page views, clicks, and session replays,
// through PostHog's US cloud, under the same rules as the Product Page
// (docs/analytics.js and docs/privacy.html):
//
// - Nothing is sent unless the service was given a PostHog key (/api/config).
// - A browser sending Global Privacy Control or Do Not Track sends nothing,
//   and PostHog's script is never loaded.
// - Otherwise analytics run until the person turns them off: the first visit
//   shows a notice (AnalyticsNotice.tsx) with OK and Turn off. The choice is
//   kept in this browser; once it is off, PostHog's script is never loaded.
// - Typed text is masked in replays, and no one is identified: PostHog sees
//   an anonymous visitor, never an email or username.
// - A profile's address holds a username (/u/<name>, M3d-16), and PostHog
//   sends the page's address with every event, the page before it, and a
//   clicked link's address. Each is rewritten to /u/:username before it's
//   sent (withoutProfileNames), and names on the page sit in ph-no-capture.

import type { PublicConfig } from "@steelman/shared";
import { posthogAssetsHost } from "@steelman/shared";
import { setAnalyticsOn } from "./analyticsChoice.ts";
import { readConfig } from "./api.ts";

/** The choice, as docs/analytics.js keeps it: "on", "off", or nothing yet. Same name, so a choice made there holds here on the same site. */
const STORE = "steelman-analytics";

type Analytics = PublicConfig["analytics"];
export type Decision = "on" | "off" | "ask";

/** Whether to load PostHog, and whether to ask. */
export function decide({ analytics, signal, stored }: { analytics: Analytics; signal: boolean; stored: string | null }): Decision {
  if (!analytics || signal) return "off";
  if (stored === "off") return "off";
  return stored === "on" ? "on" : "ask";
}

/** Global Privacy Control, or Do Not Track (on the navigator, or on the window in older browsers). */
export function privacySignal(navigator: { globalPrivacyControl?: boolean; doNotTrack?: string | null }, windowDoNotTrack?: string | null): boolean {
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || windowDoNotTrack === "1";
}

const PROFILE_ADDRESS = /\/u\/[^/?#"'\s\\]+/g;

/**
 * The event with every profile address in it, wherever it sits, made /u/:username, so no name reaches PostHog
 * (L-03, M-08). PostHog hands each event to before_send just before sending it.
 */
export function withoutProfileNames<T>(value: T): T {
  if (typeof value === "string") return value.replace(PROFILE_ADDRESS, "/u/:username") as T;
  if (Array.isArray(value)) return value.map(withoutProfileNames) as T;
  // Only plain objects: anything else, such as the event's timestamp, a Date, goes as it is.
  if (value !== null && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value)))
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, withoutProfileNames(each)])) as T;
  return value;
}

/** Where the app is running, sent with every event so a laptop's and staging's can be filtered out. */
export function environmentOf(hostname: string): "local" | "staging" | "production" {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)) return "local";
  return hostname.startsWith("staging.") ? "staging" : "production";
}

// PostHog's own stub, written out: until its script arrives, calls are queued in an array that the script
// replays when it loads. Only the calls the app makes are stubbed.
type Call = [string, ...unknown[]];
interface PostHogStub extends Array<Call> {
  _i: unknown[][];
  __SV?: number;
  [method: string]: unknown;
}
declare global {
  interface Window {
    posthog?: PostHogStub;
  }
}
const METHODS = ["init", "register", "capture", "opt_in_capturing", "opt_out_capturing", "startSessionRecording", "stopSessionRecording"] as const;

function posthog(method: (typeof METHODS)[number], ...args: unknown[]): void {
  const target = window.posthog?.[method];
  if (typeof target === "function") (target as (...a: unknown[]) => void).apply(window.posthog, args);
}

function load(analytics: NonNullable<Analytics>): void {
  if (window.posthog) return;
  const stub = [] as unknown as PostHogStub;
  stub._i = [];
  stub.init = (key: string, options: unknown) => void stub._i.push([key, options, "posthog"]);
  for (const method of METHODS.slice(1)) stub[method] = (...args: unknown[]) => void stub.push([method, ...args]);
  stub.__SV = 1;
  window.posthog = stub;

  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `${posthogAssetsHost(analytics.host)}/static/array.js`;
  document.head.appendChild(script);

  posthog("init", analytics.key, {
    api_host: analytics.host,
    person_profiles: "identified_only", // anonymous visitors only; nobody is identified
    respect_dnt: true,
    capture_pageview: "history_change", // also counts a link followed inside the app, once there are some (M1-7)
    autocapture: true,
    session_recording: { maskAllInputs: true }, // typed text never leaves the browser
    before_send: (event: unknown) => withoutProfileNames(event), // no username from a profile's address (M3d-16)
  });
  posthog("register", { environment: environmentOf(location.hostname), page: "app" });
}

/** The choice made on this page, for when the browser blocks storage. */
let chosenHere: "on" | "off" | null = null;

function stored(): string | null {
  try {
    return localStorage.getItem(STORE) ?? chosenHere;
  } catch {
    return chosenHere;
  }
}

let started: Promise<Decision> | null = null;
let config: Promise<PublicConfig> | null = null;
const askedConfig = () => (config ??= readConfig());
const signalled = () => privacySignal(navigator as Navigator & { globalPrivacyControl?: boolean }, (window as Window & { doNotTrack?: string | null }).doNotTrack);

/** Asks the service once, decides, and loads PostHog unless analytics are off. Answers whether to ask. */
export function startAnalytics(): Promise<Decision> {
  started ??= askedConfig().then(({ analytics }) => {
    const signal = signalled();
    const decision = decide({ analytics, signal, stored: stored() });
    if (decision !== "off" && analytics) load(analytics);
    // Asking counts as on, as for the browser's own events: they run until the person turns them off.
    setAnalyticsOn(decision !== "off");
    return decision;
  });
  return started;
}

/** Told when the choice changes, so the notice goes once the privacy page has chosen. */
export const CHOSEN = "steelman-analytics-chosen";

/** OK or Turn off, from the notice or the privacy page. Turning off stops PostHog at once; from the next page on, it isn't loaded. */
export function chooseAnalytics(on: boolean): void {
  chosenHere = on ? "on" : "off";
  try {
    localStorage.setItem(STORE, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice holds for this page only.
  }
  if (!on) {
    setAnalyticsOn(false);
    posthog("stopSessionRecording");
    posthog("opt_out_capturing");
  }
  window.dispatchEvent(new Event(CHOSEN));
}

/** What the privacy page says: no PostHog key here, a browser signal, or this browser's choice. */
export type AnalyticsStatus = "none" | "signal" | "on" | "off";

export async function analyticsStatus(): Promise<AnalyticsStatus> {
  const { analytics } = await askedConfig();
  if (!analytics) return "none";
  if (signalled()) return "signal";
  return stored() === "off" ? "off" : "on";
}

/** Turn on, from the privacy page: PostHog starts again now, loading it if this page never did. */
export async function turnOnAnalytics(): Promise<void> {
  chooseAnalytics(true);
  const { analytics } = await askedConfig();
  if (!analytics || signalled()) return;
  setAnalyticsOn(true);
  // PostHog remembers an opt-out in its own storage, so it is told to opt in again even when it's only now loading.
  if (!window.posthog) load(analytics);
  posthog("opt_in_capturing");
  posthog("startSessionRecording");
}
