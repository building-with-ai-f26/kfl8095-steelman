// How the service sends email. Only sign-in codes, for now.
//
// Locally (`npm run dev`) codes are printed to the terminal instead of sent
// (plans/architecture.md §6). The tests keep them in memory. The real sender,
// Resend, comes with deployment (M1-14).

export interface EmailSender {
  sendSignInCode(to: string, code: string): Promise<void>;
}

/** For `npm run dev` only: prints the code where the builder can see it. Never for a deployed service, whose output is its logs. */
export const terminalEmail: EmailSender = {
  async sendSignInCode(to, code) {
    console.log(`\n  Sign-in code for ${to}: ${code}\n  (printed, not emailed: this is npm run dev)\n`);
  },
};
