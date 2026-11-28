// The periods the privacy page states (M-07, M3d-37; plans/architecture.md §7,
// Retention). The server derives its own values from these, and
// web/test/privacy-periods.test.ts checks that the page says the same, so the
// page can't drift from the code. They live in shared because the web app may
// not import the server (test/boundaries.test.ts). Plain numbers, so the server
// does the arithmetic.

/** How long a code for signing in or for a new email works, in minutes. */
export const CODE_LASTS_MINUTES = 10;

/** How long a session lasts after it was last refreshed, in days. */
export const SESSION_LASTS_DAYS = 30;

/** How long the record of a sign-in email sent (sign_in.sent_email) is kept, in hours. It only counts the last hour. */
export const SIGN_IN_EMAILS_KEPT_HOURS = 24;

/** How long the count of code requests from one network address lasts (server/src/limits.ts, signInCode), in hours. */
export const SIGN_IN_CODES_COUNTED_HOURS = 1;

/** How long a deleted account's username stays unavailable to others, in days. */
export const USERNAME_HELD_DAYS = 30;

/** How long a changed username's old name stays held for its owner, in days, and how often a username may change. */
export const USERNAME_HOLD_DAYS = 30;
