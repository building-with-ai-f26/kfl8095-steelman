// The only file in the web app allowed to make random numbers (a lint rule
// enforces it; see eslint.config.js): the IDs the browser gives what it
// writes, so a thing written offline keeps one ID from the start
// (plans/architecture.md §2, "Links and IDs").

import { idSourceFrom } from "@steelman/shared";
import type { IdSource } from "@steelman/shared";

export const browserIds: IdSource = idSourceFrom((count) => crypto.getRandomValues(new Uint8Array(count)));
