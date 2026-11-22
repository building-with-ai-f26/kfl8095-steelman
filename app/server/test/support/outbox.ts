// The emails the service would send, kept in memory instead (no vitest here,
// so the browser tests can use it too).

import type { EmailSender } from "../../src/email.ts";

export interface Sent {
  to: string;
  /** The code it carries; "" for a note with none. */
  code: string;
  /** Which email it is (server/src/email.ts): a sign-in code, a code for a new email, or a note about changing email. */
  kind?: "change-email" | "in-use" | "changed";
  /** In the "changed" note to the old address: the new one. */
  newEmail?: string;
}

/** Keeps every email in `outbox` instead of sending it. */
export function outboxEmail(outbox: Sent[]): EmailSender {
  return {
    sendSignInCode: async (to, code) => void outbox.push({ to, code }),
    sendEmailChangeCode: async (to, code) => void outbox.push({ to, code, kind: "change-email" }),
    sendEmailInUse: async (to) => void outbox.push({ to, code: "", kind: "in-use" }),
    sendEmailChanged: async (to, newEmail) => void outbox.push({ to, code: "", kind: "changed", newEmail }),
  };
}
