// How the service sends email. Only sign-in codes, for now.
//
// Locally (`npm run dev`) codes are printed to the terminal instead of sent
// (plans/architecture.md §6). The tests keep them in memory. Deployed, they
// go through Resend (M1-14a), by its HTTP API: no package needed.

export interface EmailSender {
  sendSignInCode(to: string, code: string): Promise<void>;
}

/** For `npm run dev` only: prints the code where the builder can see it. Never for a deployed service, whose output is its logs. */
export const terminalEmail: EmailSender = {
  async sendSignInCode(to, code) {
    console.log(`\n  Sign-in code for ${to}: ${code}\n  (printed, not emailed: this is npm run dev)\n`);
  },
};

/** How long a code works, as the email says (sign-in.ts's CODE_LASTS_SECONDS). */
const CODE_LASTS = "10 minutes";

/**
 * Sends sign-in codes through Resend's API (resend.com/docs/api-reference/emails/send-email).
 * A refusal is an error that names neither the address nor the code, since errors reach the logs.
 */
export function resendEmail({ apiKey, from, fetch: send = fetch }: { apiKey: string; from: string; fetch?: typeof fetch }): EmailSender {
  return {
    async sendSignInCode(to, code) {
      const response = await send("https://api.resend.com/emails", {
        method: "POST",
        // A Resend that doesn't answer mustn't hold the person's sign-in for minutes.
        signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `Your Steelman sign-in code: ${code}`,
          text: `Your code to sign in to Steelman is ${code}.\n\nIt works for ${CODE_LASTS}. If you didn’t ask for it, you can ignore this email: nobody can sign in without the code.\n`,
        }),
      });
      if (!response.ok) throw new Error(`Resend refused the sign-in email: ${response.status}`);
    },
  };
}
