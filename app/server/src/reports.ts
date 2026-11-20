// Report (J-01, M2-3): anyone who can read a board reports a wording, with a
// reason, and can withdraw it. One report per person per wording (migration
// 0010), so a write says what the report should be and is safe to send
// twice (invariant 10). Each report or withdrawal stamps the report itself,
// not the wording, so only an Editor's or the owner's poll picks it up: for
// anyone else, nothing about the wording changed (read.ts). Reports
// aren't in the change log: like votes, the report table is the only place
// that links a person to one.

import type { ReportReason } from "@steelman/shared";
import { writeToBoard } from "./write-path.ts";
import type { Services, Trx, WriteResult } from "./write-path.ts";

/** The wording reported, if it's on this board. */
const loadVersion = (boardId: string, versionId: string) => async (trx: Trx) =>
  (await trx.selectFrom("version").select(["deleted_at", "hidden_at"]).where("id", "=", versionId).where("board_id", "=", boardId).executeTakeFirst()) ?? null;

/** Reports a wording, or changes the reason of the person's report on it. */
export function setReport({ db, clock }: Services, boardId: string, person: string | null, versionId: string, input: { reason: ReportReason; note: string }): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "report",
    load: loadVersion(boardId, versionId),
    // A hidden wording is gone for anyone who could report it, as votes on it are (M2-4).
    stale: async (_trx, version) => (version.deleted_at || version.hidden_at ? { refused: "version_deleted" } : null),
    async change(trx, _version, seq) {
      const mine = await trx
        .selectFrom("report")
        .select(["reason", "note", "withdrawn_at", "resolved_at"])
        .where("version_id", "=", versionId)
        .where("reporter_id", "=", person!)
        .executeTakeFirst();
      const open = mine && mine.withdrawn_at === null && mine.resolved_at === null;
      if (open && mine.reason === input.reason && mine.note === input.note) return "already_done";
      const report = { reason: input.reason, note: input.note, reported_at: clock.now(), withdrawn_at: null, resolved_at: null, resolved_by: null, resolved_how: null, changed_seq: seq };
      await trx
        .insertInto("report")
        .values({ board_id: boardId, version_id: versionId, reporter_id: person!, ...report })
        .onConflict((conflict) => conflict.columns(["version_id", "reporter_id"]).doUpdateSet(report))
        .execute();
      return "done";
    },
  });
}

/** Withdraws the person's report on a wording. Withdrawing one that isn't open is "already done". */
export function withdrawReport({ db, clock }: Services, boardId: string, person: string | null, versionId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "report",
    // A wording deleted since can still have its report withdrawn.
    load: loadVersion(boardId, versionId),
    async change(trx, _version, seq) {
      const withdrawn = await trx
        .updateTable("report")
        .set({ withdrawn_at: clock.now(), changed_seq: seq })
        .where("version_id", "=", versionId)
        .where("reporter_id", "=", person!)
        .where("withdrawn_at", "is", null)
        .where("resolved_at", "is", null)
        .executeTakeFirst();
      return withdrawn.numUpdatedRows === 0n ? "already_done" : "done";
    },
  });
}
