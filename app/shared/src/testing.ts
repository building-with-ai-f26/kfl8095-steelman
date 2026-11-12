// Stand-ins for tests: a clock the test moves, and IDs that repeat from a seed.
// Imported as "@steelman/shared/testing"; never used by the running app.

import type { Clock } from "./clock.ts";
import { idSourceFrom } from "./ids.ts";
import type { IdSource } from "./ids.ts";

export interface FakeClock extends Clock {
  /** Move the clock forward by this many milliseconds. */
  advance(milliseconds: number): void;
  /** Jump the clock forward to this time. */
  set(time: Date): void;
}

/** A clock that stands still until a test moves it, and never goes backwards. */
export function createFakeClock(start: Date): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance(milliseconds) {
      if (!(milliseconds >= 0)) throw new Error(`The fake clock can't go backwards (asked for ${milliseconds} ms)`);
      current += milliseconds;
    },
    set(time) {
      if (!(time.getTime() >= current)) throw new Error("The fake clock can't go backwards");
      current = time.getTime();
    },
  };
}

/** IDs that are the same every time for the same seed. Not secret: tests only. */
export function createSeededIds(seed: number): IdSource {
  const random = mulberry32(seed);
  return idSourceFrom((count) => {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) bytes[i] = Math.floor(random() * 256);
    return bytes;
  });
}

/**
 * A small, well-known seeded random number generator (mulberry32). Returns a
 * function giving numbers from 0 up to, not including, 1.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
