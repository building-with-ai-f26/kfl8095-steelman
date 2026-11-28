// The daily call (M1-14a; plans/architecture.md §7, Retention): deletes what
// the retention table says goes after a while. Cloud Scheduler runs it once a
// day as a Cloud Run job (daily-cli.ts), with the service's own database role.

import { SIGN_IN_EMAILS_KEPT_HOURS } from "@steelman/shared";
import type { Clock } from "@steelman/shared";
import { releaseHeldUsernames } from "../account.ts";
import type { Db } from "../db/database.ts";
import { releaseEndedHolds } from "../username.ts";

/** The record of sign-in emails sent only counts the last hour (sign-in.ts); a day is plenty. The privacy page says it (M3d-37). */
const SENT_EMAILS_KEPT_MS = SIGN_IN_EMAILS_KEPT_HOURS * 60 * 60 * 1000;

export async function dailyCleanUp(db: Db, clock: Pick<Clock, "now">): Promise<{ codes: number; sessions: number; sentEmails: number; usernames: number }> {
  const now = clock.now();
  const codes = await db.deleteFrom("sign_in.sign_in_code").where("expires_at", "<", now).executeTakeFirst();
  const sessions = await db.deleteFrom("sign_in.session").where("expires_at", "<", now).executeTakeFirst();
  const sentEmails = await db
    .deleteFrom("sign_in.sent_email")
    .where("sent_at", "<", new Date(now.getTime() - SENT_EMAILS_KEPT_MS))
    .executeTakeFirst();
  return {
    codes: Number(codes.numDeletedRows),
    sessions: Number(sessions.numDeletedRows),
    sentEmails: Number(sentEmails.numDeletedRows),
    // A deleted account's username after 30 days, and a changed username's old name once its hold ends (L-04).
    usernames: (await releaseHeldUsernames(db, clock)) + (await releaseEndedHolds(db, clock)),
  };
}
