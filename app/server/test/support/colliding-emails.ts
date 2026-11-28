// Two pairs of addresses that Better Auth before 1.7.16 gave the same
// change-email code key (GHSA-2f9c-7xj7-gh55; build plan M3d-28). It joined the
// current email and the new one with "-", so x@a.bb changing to
// c.com-v@target.com and x@a.bb-c.com changing to v@target.com were both
// stored as change-email-otp-x@a.bb-c.com-v@target.com.

/** The first account's email, and the new email it asks for. */
export const FIRST = { email: "x@a.bb", wants: "c.com-v@target.com" } as const;

/** The second account's email, and the new email that collides with the first account's request. */
export const SECOND = { email: "x@a.bb-c.com", wants: "v@target.com" } as const;
