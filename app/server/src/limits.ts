// The class-trial rate limits (M2-6; plans/architecture.md §7 "Rate limits
// and abuse"). Each counts requests in a fixed window that starts with the
// first one counted; past the most, a request is refused until the window ends.
//
// Counts live in this instance's memory, so a vote costs no database write.
// With up to three instances a limit can be up to three times too generous,
// and a restart or deploy starts every count again: fine for limits this
// loose. The one limit that must hold exactly, sign-in emails to an address,
// is counted in Postgres instead (sign-in.ts).

import { SIGN_IN_CODES_COUNTED_HOURS } from "@steelman/shared";
import type { Clock } from "@steelman/shared";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface Limit {
  /** How many a window allows. */
  most: number;
  windowMs: number;
}

export const LIMITS = {
  /** Asking for a sign-in code, to any address, counted by network address. The privacy page says how long it counts (M3d-37). */
  signInCode: { most: 30, windowMs: SIGN_IN_CODES_COUNTED_HOURS * HOUR },
  /** New boards, by account. */
  board: { most: 20, windowMs: HOUR },
  /** New arguments, new wordings, edits, and sources added or cited, by account. */
  writing: { most: 60, windowMs: HOUR },
  /** Importance, articulation, and assessments, by account. */
  voting: { most: 300, windowMs: MINUTE },
  /** Reports, by account, once reports exist (M2-3). */
  report: { most: 20, windowMs: HOUR },
  /** Invitations, by account (M3b-7), counted whatever the answer, so usernames can't be tried one after another. */
  invite: { most: 20, windowMs: HOUR },
  /** Comments and replies, by account (M3b-9). Resolving, reopening, and deleting aren't counted. */
  comment: { most: 60, windowMs: HOUR },
} satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;
export type Limits = Record<LimitName, Limit>;

export interface Limiter {
  /**
   * Counts one request by `who` (an account, or a network address) against a
   * limit. Answers null when it's allowed, or how many seconds until it would be.
   * A refused request isn't counted.
   */
  take(limit: LimitName, who: string): number | null;
  /** Uncounts a request `take` allowed that turned out to save nothing (refused, or invalid). */
  giveBack(limit: LimitName, who: string): void;
}

export function createLimiter(clock: Clock, limits: Limits = LIMITS): Limiter {
  /** By limit and who: when the window ends, and how many it has counted. */
  const windows = new Map<string, { ends: number; count: number }>();
  let swept = clock.now().getTime();

  return {
    take(limit, who) {
      const now = clock.now().getTime();
      // At most once a minute, while requests come in, forget the windows that have ended: what's kept is about an
      // hour's worth of accounts and networks that asked.
      if (now - swept >= MINUTE) {
        for (const [key, window] of windows) if (window.ends <= now) windows.delete(key);
        swept = now;
      }
      const { most, windowMs } = limits[limit];
      const key = `${limit} ${who}`;
      let window = windows.get(key);
      if (!window || window.ends <= now) {
        window = { ends: now + windowMs, count: 0 };
        windows.set(key, window);
      }
      if (window.count >= most) return Math.ceil((window.ends - now) / 1000);
      window.count++;
      return null;
    },
    giveBack(limit, who) {
      const window = windows.get(`${limit} ${who}`);
      if (window && window.count > 0) window.count--;
    },
  };
}
