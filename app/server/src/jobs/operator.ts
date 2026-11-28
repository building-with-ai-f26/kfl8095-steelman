// The builder's operator commands (J-06, L-01, M3d-36; finding F8 of
// plans/reviews/public-spaces-security-review.md; plans/architecture.md §7,
// "Sign-in and sessions"), which the steelman-operator Cloud Run job runs by
// hand (operator-cli.ts; infra/README.md, "Taking something down"):
//
//   suspend <username>       sets account.suspended_at and ends the account's
//                            sessions, in one transaction, so the person is
//                            signed out everywhere and can't sign back in;
//   unsuspend <username>     clears it, so they can sign in again;
//   make-private <space id>  makes a public space private (spaces.ts).
//
// Each says one plain sentence and changes nothing when run twice. Only a name
// or ID that matches nothing fails. What a suspended person wrote stays, and
// Editors hide it with the tools they already have. The output names a
// username or a space ID, never an email address.
//
// Here, apart from the command line, so the tests can run each command.

import { sql } from "kysely";
import type { Clock } from "@steelman/shared";
import type { Db } from "../db/database.ts";
import { makeSpacePrivate } from "../spaces.ts";

export type OperatorCommand = { command: "suspend" | "unsuspend"; username: string } | { command: "make-private"; space: string };

/** What a command did, before it's put in a sentence. `ended` is how many sessions a suspend deleted. */
export type OperatorOutcome =
  | { command: "suspend"; result: "done" | "already"; username: string; ended: number }
  | { command: "unsuspend"; result: "done" | "already"; username: string }
  | { command: "suspend" | "unsuspend"; result: "unknown"; username: string }
  | { command: "make-private"; result: "done" | "already" | "unknown"; space: string };

const USAGE = "Run one command: suspend <username>, unsuspend <username>, or make-private <space ID>.";

/** The job's arguments, such as `--args=suspend,lin_zhao`, as a command. */
export function parseOperatorArgs(args: readonly string[]): OperatorCommand | { error: string } {
  const words = args.map((word) => word.trim());
  const [command, target] = words;
  if (words.length !== 2 || !target) return { error: USAGE };
  if (command === "suspend" || command === "unsuspend") return { command, username: target };
  if (command === "make-private") return { command, space: target };
  return { error: USAGE };
}

const sessions = (n: number) => `${n} ${n === 1 ? "session" : "sessions"}`;

/** The one sentence a command prints, and whether the job succeeded. */
export function report(outcome: OperatorOutcome): { ok: boolean; sentence: string } {
  if (outcome.command === "make-private") {
    if (outcome.result === "unknown") return { ok: false, sentence: `No space has the ID ${outcome.space}.` };
    return { ok: true, sentence: outcome.result === "done" ? `Space ${outcome.space} is now private, and its members stay in it.` : `Space ${outcome.space} is already private.` };
  }
  const name = outcome.username;
  if (outcome.result === "unknown") return { ok: false, sentence: `No account has the username ${name}.` };
  if (outcome.command === "unsuspend") return { ok: true, sentence: outcome.result === "done" ? `${name} is no longer suspended and can sign in again.` : `${name} isn’t suspended.` };
  if (outcome.result === "done") return { ok: true, sentence: outcome.ended > 0 ? `${name} is now suspended, and Steelman signed them out of ${sessions(outcome.ended)}.` : `${name} is now suspended, and they had no sessions to end.` };
  return { ok: true, sentence: outcome.ended > 0 ? `${name} is already suspended, and Steelman signed them out of ${sessions(outcome.ended)}.` : `${name} is already suspended.` };
}

/** Runs one command against the database, at the clock's time. */
export async function runOperator(db: Db, clock: Clock, command: OperatorCommand): Promise<{ ok: boolean; sentence: string }> {
  if (command.command === "make-private") {
    const result = await makeSpacePrivate(db, clock, command.space);
    return report({ command: "make-private", result: result === "done" ? "done" : result === "already_private" ? "already" : "unknown", space: command.space });
  }
  const { command: which, username: typed } = command;
  return report(
    await db.transaction().execute(async (trx): Promise<OperatorOutcome> => {
      // Capitals don't count, as they don't when a username is picked. Locked, as a deletion locks it, so a deletion
      // or a second command waits.
      const account = await trx
        .selectFrom("account")
        .select(["id", "username", "suspended_at"])
        .where(sql<string>`lower(username)`, "=", typed.toLowerCase())
        .where("deleted_at", "is", null)
        .forUpdate()
        .executeTakeFirst();
      if (!account) return { command: which, result: "unknown", username: typed };
      const username = account.username ?? typed;
      if (which === "unsuspend") {
        if (account.suspended_at === null) return { command: which, result: "already", username };
        await trx.updateTable("account").set({ suspended_at: null }).where("id", "=", account.id).execute();
        return { command: which, result: "done", username };
      }
      if (account.suspended_at === null) await trx.updateTable("account").set({ suspended_at: clock.now() }).where("id", "=", account.id).execute();
      // Every time, so a session written as an earlier suspend ran ends too.
      const ended = await trx.deleteFrom("sign_in.session").where("account_id", "=", account.id).executeTakeFirst();
      return { command: which, result: account.suspended_at === null ? "done" : "already", username, ended: Number(ended.numDeletedRows) };
    }),
  );
}
