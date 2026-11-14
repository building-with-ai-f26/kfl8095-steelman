// The only file allowed to read the system's clock or its random numbers
// (a lint rule enforces it; see eslint.config.js). Everything else is handed
// a Clock and an IdSource, so tests can hand in their own.

import { idSourceFrom } from "@steelman/shared";
import type { Clock, IdSource } from "@steelman/shared";

export const systemClock: Clock = {
  now: () => new Date(),
};

export const systemIds: IdSource = idSourceFrom((count) => crypto.getRandomValues(new Uint8Array(count)));

/** A signing key made fresh each start, for `npm run dev` when BETTER_AUTH_SECRET isn't set: sessions then last until the service restarts. */
export function throwawaySecret(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}
