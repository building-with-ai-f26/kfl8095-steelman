// How long ago something happened, in the prototype's short form (ago in
// docs/prototype/source/steelman-refined.html): "5m ago", "3h ago", "2d ago",
// and "just now" under a minute. `now` is the service's, so a reader's wrong
// clock can't make a board look older or newer than it is (E-03).

const MINUTE = 60_000;

export function ago(then: string, now: string): string {
  const minutes = Math.round((Date.parse(now) - Date.parse(then)) / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (24 * 60))}d ago`;
}

/** The day, as "Nov 22, 2026", in the reader's own time zone. With the year, a report from another year can't look recent. */
export function shortDate(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The full date and time, for the tooltip, in the reader's own time zone. */
export function fullDate(at: string): string {
  return new Date(at).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
