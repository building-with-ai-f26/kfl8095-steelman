// Server events (M2-12, M-08; plans/architecture.md Q29): when a vote, an
// assessment, or a piece of writing is saved, the service tells PostHog, as
// the browser's events can be lost to ad blockers. They're anonymous like the
// browser's: the action and the environment, and nothing else. No account,
// email, board, or text, and a new anonymous ID for each event, so PostHog
// can't join one person's events together.
//
// Sent only when the browser says its analytics are on (it sends its choice
// with each write, so the choice stays in the browser and nothing new is kept
// about the person), never with Global Privacy Control or Do Not Track, and
// never from a service with no PostHog key. A send never holds up or fails
// the write: it isn't waited for, and a failure is dropped.

import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { PublicConfig } from "@steelman/shared";

/** The saved writes that send an event, by name. */
export type Action = "vote_importance" | "vote_articulation" | "assess" | "write_argument" | "write_wording" | "edit_wording" | "add_source";

/** What PostHog's capture address is sent: its own fields, and these properties only. */
export interface ServerEvent {
  api_key: string;
  event: Action;
  distinct_id: string;
  properties: {
    environment: "local" | "staging" | "production";
    source: "service";
    /** PostHog makes no person profile for it. */
    $process_person_profile: false;
    /** PostHog doesn't look up where the service's address is. */
    $geoip_disable: true;
  };
}

/** The header the browser's writes carry when its analytics are on. */
export const ANALYTICS_HEADER = "x-steelman-analytics";
/** How long a send to PostHog may take before it's given up. */
const SEND_TIMEOUT_MS = 2_000;

/** Where the service is running, as the browser tells it (web/src/analytics.ts environmentOf). */
export function environmentOf(hostname: string): ServerEvent["properties"]["environment"] {
  const host = hostname.replace(/:\d+$/, "");
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) return "local";
  return host.startsWith("staging.") ? "staging" : "production";
}

/** Whether this request's browser allows an event: its analytics on, and no privacy signal. */
export function allowed(request: FastifyRequest): boolean {
  const { headers } = request;
  return headers[ANALYTICS_HEADER] === "on" && headers["sec-gpc"] !== "1" && headers.dnt !== "1";
}

/** Posts an event to PostHog's capture address. */
export function postToPostHog(host: string): (event: ServerEvent) => Promise<void> {
  return async (event) => {
    const response = await fetch(`${host}/i/v0/e/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    // Nothing in PostHog's answer is needed; reading none of it would hold the connection until it's collected.
    await response.body?.cancel();
  };
}

/** What the app calls when a write is saved: sends the event if the request allows one. */
export function createEvents(analytics: PublicConfig["analytics"] | undefined, send?: (event: ServerEvent) => Promise<void>) {
  const deliver = analytics ? (send ?? postToPostHog(analytics.host)) : null;
  return (request: FastifyRequest, action: Action): void => {
    if (!analytics || !deliver || !allowed(request)) return;
    const event: ServerEvent = {
      api_key: analytics.key,
      event: action,
      distinct_id: randomUUID(),
      properties: { environment: environmentOf(request.hostname), source: "service", $process_person_profile: false, $geoip_disable: true },
    };
    deliver(event).catch(() => {
      // Analytics never get in the way of the write.
    });
  };
}
