// How the service sends email: sign-in codes, and the emails for changing an
// account's email (M2-8c): a code to the new address, a note to an address
// another account already uses, and a note to the old address afterwards.
//
// Locally (`npm run dev`) codes are printed to the terminal instead of sent
// (plans/architecture.md §6). The tests keep them in memory. Deployed, they
// go through Resend (M1-14a), by its HTTP API: no package needed.

export interface EmailSender {
  sendSignInCode(to: string, code: string): Promise<void>;
  /** The code that makes `to` an account's new email (M2-8c). */
  sendEmailChangeCode(to: string, code: string): Promise<void>;
  /** Sent instead of that code when another account already uses `to`, so the form doesn't say who has an account. */
  sendEmailInUse(to: string): Promise<void>;
  /** To the old address, once an account's email has changed (as Notion). */
  sendEmailChanged(to: string, newEmail: string): Promise<void>;
}

/** For `npm run dev` only: prints the code where the builder can see it. Never for a deployed service, whose output is its logs. */
export const terminalEmail: EmailSender = {
  async sendSignInCode(to, code) {
    console.log(`\n  Sign-in code for ${to}: ${code}\n  (printed, not emailed: this is npm run dev)\n`);
  },
  async sendEmailChangeCode(to, code) {
    console.log(`\n  Code to make ${to} an account's email: ${code}\n  (printed, not emailed: this is npm run dev)\n`);
  },
  async sendEmailInUse(to) {
    console.log(`\n  To ${to}: another account asked to use this email, which already has an account\n  (printed, not emailed: this is npm run dev)\n`);
  },
  async sendEmailChanged(to, newEmail) {
    console.log(`\n  To ${to}: this account's email is now ${newEmail}\n  (printed, not emailed: this is npm run dev)\n`);
  },
};

/** How long a code works, as the email says (sign-in.ts's CODE_LASTS_SECONDS). */
const CODE_LASTS = "10 minutes";

/**
 * Sends Steelman's emails through Resend's API (resend.com/docs/api-reference/emails/send-email).
 * A refusal is an error that names neither the address nor the code, since errors reach the logs.
 */
export function resendEmail({ apiKey, from, fetch: send = fetch }: { apiKey: string; from: string; fetch?: typeof fetch }): EmailSender {
  async function email(to: string, subject: string, text: string, refused: string): Promise<void> {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      // A Resend that doesn't answer mustn't hold the person's sign-in for minutes.
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!response.ok) throw new Error(`${refused}: ${response.status}`);
  }
  return {
    sendSignInCode: (to, code) =>
      email(
        to,
        `Your Steelman sign-in code: ${code}`,
        `Your code to sign in to Steelman is ${code}.\n\nIt works for ${CODE_LASTS}. If you didn’t ask for it, you can ignore this email: nobody can sign in without the code.\n`,
        "Resend refused the sign-in email",
      ),
    sendEmailChangeCode: (to, code) =>
      email(
        to,
        `Your code to confirm your new Steelman email: ${code}`,
        `Enter ${code} on Steelman to make this your account’s email.\n\nIt works for ${CODE_LASTS}. If you didn’t ask for it, you can ignore this email: no account’s email changes without the code.\n`,
        "Resend refused the email",
      ),
    sendEmailInUse: (to) =>
      email(
        to,
        "You already have a Steelman account with this email",
        "Someone asked to change their Steelman account’s email to this one, but this email already has its own Steelman account. If that was you, sign in with this email instead. If it wasn’t, you can ignore this email.\n",
        "Resend refused the email",
      ),
    sendEmailChanged: (to, newEmail) =>
      email(to, "Your Steelman email changed", `The email for your Steelman account is now ${newEmail}. If you didn’t make this change, reply to this email.\n`, "Resend refused the email"),
  };
}
