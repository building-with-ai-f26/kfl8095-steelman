// Changing who can get in to a board (H-02): its general access and its link
// role. Only the owner may (the policy's "share"). People who came by the
// link follow it: a new link role becomes theirs, and turning the link off
// removes them (server/src/access.ts).

import type { Access } from "@steelman/shared";
import { asAccess } from "./access.ts";
import { writeToBoard } from "./write-path.ts";
import type { Services, WriteResult } from "./write-path.ts";

/** The owner changes who can get in. Setting what's already set is "already done". */
export async function setAccess({ db, clock }: Services, boardId: string, person: string | null, next: Access): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "share",
    load: async (trx) => {
      const board = await trx.selectFrom("board").select(["general_access", "link_role"]).where("id", "=", boardId).executeTakeFirst();
      return board ? asAccess(board) : null;
    },
    async change(trx, now, seq) {
      if (now.general === next.general && now.linkRole === next.linkRole) return "already_done";
      await trx.updateTable("board").set({ general_access: next.general, link_role: next.linkRole }).where("id", "=", boardId).execute();
      if (next.general === "invited") {
        await trx.deleteFrom("board_member").where("board_id", "=", boardId).where("joined_via", "=", "link").execute();
      } else if (next.linkRole !== now.linkRole) {
        await trx.updateTable("board_member").set({ role: next.linkRole }).where("board_id", "=", boardId).where("joined_via", "=", "link").execute();
      }
      await trx
        .insertInto("change")
        .values({
          board_id: boardId,
          seq,
          at: clock.now(),
          actor_id: person!,
          kind: "access_changed",
          subject_kind: "board",
          subject_id: boardId,
          before: JSON.stringify(now),
          after: JSON.stringify(next),
        })
        .execute();
      return "done";
    },
  });
}
