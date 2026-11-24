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

/** The day a board closed (M3b-5): by hand, or at its time, whichever came first, as "Nov 7". */
export function closedDay(closing: { closedAt: string | null; closesAt: string | null }): string {
  const at = closing.closedAt && (!closing.closesAt || closing.closedAt <= closing.closesAt) ? closing.closedAt : closing.closesAt!;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The short name of the reader's time zone at a moment, as "EST" or "EDT". */
export function zoneName(at: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? "";
}

/**
 * A moment, as "Nov 30 at 5 PM EST" (or "5:30 PM"), in the reader's own time zone, named, as Google Calendar names
 * an event's: for a board's closing time (M3b-3). The year shows only when it isn't the year of `from`, such as
 * when the time was set.
 */
export function momentWithZone(at: string, from: string): string {
  const when = new Date(at);
  const day = when.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(when.getFullYear() === new Date(from).getFullYear() ? {} : { year: "numeric" }) });
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", ...(when.getMinutes() === 0 ? {} : { minute: "2-digit" }), timeZoneName: "short" });
  return `${day} at ${time}`;
}
