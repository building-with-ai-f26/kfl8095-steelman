// The only file in the web app allowed to make random numbers or read the
// clock (a lint rule enforces it; see eslint.config.js): the IDs the browser
// gives what it writes, so a thing written offline keeps one ID from the start
// (plans/architecture.md §2, "Links and IDs"); and the time now, where only
// the reader's own clock will do, such as a closing time a week ahead to
// start (M3b-6).

import { idSourceFrom } from "@steelman/shared";
import type { IdSource } from "@steelman/shared";

export const browserIds: IdSource = idSourceFrom((count) => crypto.getRandomValues(new Uint8Array(count)));

/** The reader's own time now. The service decides what has passed; this only picks a starting value. */
export const browserNow = (): Date => new Date();
