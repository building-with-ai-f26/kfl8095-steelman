// What people may send: the length limits and shapes of the things they
// write. The browser uses these for its forms and the server checks every
// request against them, so the two can't disagree (plans/architecture.md §7).
//
// Everything people write is plain text. Nothing here accepts HTML, and the
// server refuses what is too long rather than quietly cutting it.

import { z } from "zod";

/** Most characters allowed in each field. These are the prototype's `maxlength` values. */
export const LIMITS = {
  question: 200,
  optionName: 80,
  wording: 500,
  context: 700,
  sourceName: 120,
  sourceLocator: 200,
  sourceFinding: 500,
  sourceBacksUp: 300,
  sourceLimits: 300,
} as const;

/** A board has between two and four options. */
export const OPTIONS_PER_BOARD = { min: 2, max: 4 } as const;

/** Tidies text the way the prototype does: any run of spaces or line breaks becomes one space, and the ends are trimmed. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Text that must be there: tidied first, then measured. */
const required = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));

/** Text that may be left empty: tidied first, then measured. */
const optional = (max: number) => z.string().transform(cleanText).pipe(z.string().max(max));

export const questionInput = required(LIMITS.question);
export const optionNameInput = required(LIMITS.optionName);
export const wordingInput = required(LIMITS.wording);
export const contextInput = optional(LIMITS.context);

/** A piece of evidence. `strictObject`: a field nobody defined is refused, not ignored. */
export const sourceInput = z.strictObject({
  name: required(LIMITS.sourceName),
  locator: optional(LIMITS.sourceLocator),
  finding: required(LIMITS.sourceFinding),
  backsUp: optional(LIMITS.sourceBacksUp),
  limits: optional(LIMITS.sourceLimits),
});
export type SourceInput = z.infer<typeof sourceInput>;

/**
 * Where a source can be found is free text: a link, or a citation such as
 * "Chapter 3, page 41". It is shown as a link only when the whole of it is an
 * http or https address. Anything else, `javascript:` included, stays plain
 * text, so it can never become something a click runs.
 *
 * @returns The address to link to, or null to show the text as it is.
 */
export function webLink(locator: string): string | null {
  return /^https?:\/\/[^\s/]\S*$/i.test(locator) ? locator : null;
}

// IDs are made by the app (shared/src/ids.ts), but they arrive in links and
// requests, so their shape is checked like any other input.
export const boardIdInput = z.string().regex(/^[A-Za-z0-9_-]{12}$/);
export const itemIdInput = z.string().regex(/^[A-Za-z0-9_-]{20}$/);

/** A username: 3 to 20 letters, digits, or underscores. Capitals are allowed but don't count: names are kept in lower case. */
export const USERNAME = { min: 3, max: 20, pattern: /^[A-Za-z0-9_]+$/ } as const;

/** Names nobody may take, so no one can pose as the system (architecture §2, "Links and IDs"). */
export const RESERVED_USERNAMES: readonly string[] = [
  "deleted_account",
  "steelman",
  "admin",
  "administrator",
  "moderator",
  "mod",
  "staff",
  "support",
  "system",
  "official",
  "root",
];

/** Whether a username may be picked: the right shape, and not reserved. Whether someone already has it is the server's question. */
export function isAllowedUsername(username: string): boolean {
  return username.length >= USERNAME.min && username.length <= USERNAME.max && USERNAME.pattern.test(username) && !RESERVED_USERNAMES.includes(username.toLowerCase());
}
