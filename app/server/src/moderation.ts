// Hide and restore (J-02, M2-4): an Editor or the Owner hides a wording with
// a reason, one of the report reasons, and can restore it. The text is kept
// (invariant 6), so it can be reviewed and restored, and read.ts sends it
// only to Editors and the Owner; everyone else sees "Removed by a moderator
// · Spam" in its place. Each is a flag change, safe to send twice, and a
// change row with who, and for a hide, why. Hiding resolves the open
// reports on the wording.

import type { ReportReason } from "@steelman/shared";
import { writeToBoard } from "./write-path.ts";
import type { Services, Trx, WriteResult } from "./write-path.ts";

const loadVersion = (boardId: string, versionId: string) => async (trx: Trx) =>
  (await trx.selectFrom("version").select(["deleted_at", "hidden_at"]).where("id", "=", versionId).where("board_id", "=", boardId).executeTakeFirst()) ?? null;

export function hideWording({ db, clock }: Services, boardId: string, person: string | null, versionId: string, reason: ReportReason): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "hide",
    load: loadVersion(boardId, versionId),
    stale: async (_trx, version) => (version.deleted_at ? { refused: "version_deleted" } : null),
    async change(trx, version, seq) {
      // A flag: setting it again, for whatever reason, is the same as once.
      if (version.hidden_at) return "already_done";
      const now = clock.now();
      await trx.updateTable("version").set({ hidden_at: now, hidden_by: person!, hidden_reason: reason, changed_seq: seq }).where("id", "=", versionId).execute();
      await trx
        .updateTable("report")
        .set({ resolved_at: now, resolved_by: person!, resolved_how: "hidden", changed_seq: seq })
        .where("version_id", "=", versionId)
        .where("withdrawn_at", "is", null)
        .where("resolved_at", "is", null)
        .execute();
      await trx
        .insertInto("change")
        .values({ board_id: boardId, seq, at: now, actor_id: person!, kind: "version_hidden", subject_kind: "version", subject_id: versionId, reason })
        .execute();
      return "done";
    },
  });
}

export function restoreWording({ db, clock }: Services, boardId: string, person: string | null, versionId: string): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "hide",
    load: loadVersion(boardId, versionId),
    stale: async (_trx, version) => (version.deleted_at ? { refused: "version_deleted" } : null),
    async change(trx, version, seq) {
      if (!version.hidden_at) return "already_done";
      const now = clock.now();
      await trx.updateTable("version").set({ hidden_at: null, hidden_by: null, hidden_reason: null, changed_seq: seq }).where("id", "=", versionId).execute();
      await trx
        .insertInto("change")
        .values({ board_id: boardId, seq, at: now, actor_id: person!, kind: "version_restored", subject_kind: "version", subject_id: versionId })
        .execute();
      return "done";
    },
  });
}
