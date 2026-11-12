// The only file allowed to read the system's clock or its random numbers
// (a lint rule enforces it; see eslint.config.js). Everything else is handed
// a Clock and an IdSource, so tests can hand in their own.

import { idSourceFrom } from "@steelman/shared";
import type { Clock, IdSource } from "@steelman/shared";

export const systemClock: Clock = {
  now: () => new Date(),
};

export const systemIds: IdSource = idSourceFrom((count) => crypto.getRandomValues(new Uint8Array(count)));
