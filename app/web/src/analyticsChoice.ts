// Whether this browser's usage analytics are on right now (M-08), for the
// service's events (M2-12): each write carries it (api.ts), so the service
// sends an event only when this browser allows one. Kept here, apart from
// analytics.ts, which itself calls the API, so the two don't import each other.

let on = false;

/** True once analytics have started and while they stay on; false before the service has said there's a key, and with a privacy signal. */
export function analyticsOn(): boolean {
  return on;
}

export function setAnalyticsOn(value: boolean): void {
  on = value;
}
