// Options (M3a-2, A-07): an Editor or the Owner adds one at the end, renames
// one, or deletes an empty one, as the prototype's option header ⋯ menu and
// dashed + Option have it. A board keeps two to four options
// (OPTIONS_PER_BOARD). Each is one write through the write path, safe to send
// twice (invariant 10): a new option arrives with the ID the browser made, a
// rename to the name it already has changes nothing, and a delete sets a flag
// that's already set. Each is a change row, so History can say who.

import { sql } from "kysely";
import { OPTIONS_PER_BOARD } from "@steelman/shared";
import { writeToBoard } from "./write-path.ts";
import type { Services, Trx, WriteResult } from "./write-path.ts";

const liveOptions = async (trx: Trx, boardId: string) =>
  Number((await trx.selectFrom("option").select((eb) => eb.fn.countAll<string>().as("n")).where("board_id", "=", boardId).where("deleted_at", "is", null).executeTakeFirstOrThrow()).n);

const loadOption = (boardId: string, optionId: string) => async (trx: Trx) =>
  (await trx.selectFrom("option").select(["name", "deleted_at"]).where("id", "=", optionId).where("board_id", "=", boardId).executeTakeFirst()) ?? null;

export function addOption({ db, clock }: Services, boardId: string, person: string | null, input: { id: string; name: string }): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "structure",
    load: async () => ({}),
    async change(trx, _loaded, seq) {
      const existing = await trx.selectFrom("option").select(["board_id", "name"]).where("id", "=", input.id).executeTakeFirst();
      if (existing) return existing.board_id === boardId && existing.name === input.name ? "already_done" : { refused: "id_taken" };
      if (await idUsed(trx, input.id)) return { refused: "id_taken" };
      if ((await liveOptions(trx, boardId)) >= OPTIONS_PER_BOARD.max) return { refused: "too_many_options" };
      const last = await trx.selectFrom("option").select((eb) => eb.fn.max("position").as("position")).where("board_id", "=", boardId).executeTakeFirst();
      const now = clock.now();
      await trx
        .insertInto("option")
        .values({ id: input.id, board_id: boardId, name: input.name, position: Number(last?.position ?? 0) + 1, created_at: now, changed_seq: seq })
        .execute();
      await trx.insertInto("change").values({ board_id: boardId, seq, at: now, actor_id: person!, kind: "option_added", subject_kind: "option", subject_id: input.id }).execute();
      return "done";
    },
  });
}

export function renameOption({ db, clock }: Services, boardId: string, person: string | null, optionId: string, name: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "structure",
    load: loadOption(boardId, optionId),
    stale: async (_trx, option) => (option.deleted_at ? { refused: "option_deleted" } : null),
    async change(trx, option, seq) {
      if (option.name === name) return "already_done";
      await trx.updateTable("option").set({ name, changed_seq: seq }).where("id", "=", optionId).execute();
      await trx.insertInto("change").values({ board_id: boardId, seq, at: clock.now(), actor_id: person!, kind: "option_renamed", subject_kind: "option", subject_id: optionId }).execute();
      return "done";
    },
  });
}

export function deleteOption({ db, clock }: Services, boardId: string, person: string | null, optionId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "structure",
    load: loadOption(boardId, optionId),
    async change(trx, option, seq) {
      if (option.deleted_at) return "already_done";
      // Its arguments would have nowhere to go: any not deleted or combined away counts, held ones too.
      const argument = await trx
        .selectFrom("argument")
        .select("id")
        .where("option_id", "=", optionId)
        .where("deleted_at", "is", null)
        .where("merged_into", "is", null)
        .executeTakeFirst();
      if (argument) return { refused: "option_not_empty" };
      if ((await liveOptions(trx, boardId)) <= OPTIONS_PER_BOARD.min) return { refused: "too_few_options" };
      const now = clock.now();
      await trx.updateTable("option").set({ deleted_at: now, changed_seq: seq }).where("id", "=", optionId).execute();
      await trx.insertInto("change").values({ board_id: boardId, seq, at: now, actor_id: person!, kind: "option_deleted", subject_kind: "option", subject_id: optionId }).execute();
      return "done";
    },
  });
}

/**
 * Restores a deleted option from History (M3a-4, J-03), where it was, so the
 * ten-second Undo isn't the only way back. It's empty, as it was when it was
 * deleted. Never past four; restoring one that's there is already done.
 */
export function restoreOption({ db, clock }: Services, boardId: string, person: string | null, optionId: string): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "structure",
    load: loadOption(boardId, optionId),
    async change(trx, option, seq) {
      if (!option.deleted_at) return "already_done";
      if ((await liveOptions(trx, boardId)) >= OPTIONS_PER_BOARD.max) return { refused: "too_many_options" };
      await trx.updateTable("option").set({ deleted_at: null, changed_seq: seq }).where("id", "=", optionId).execute();
      await trx.insertInto("change").values({ board_id: boardId, seq, at: clock.now(), actor_id: person!, kind: "option_restored", subject_kind: "option", subject_id: optionId }).execute();
      return "done";
    },
  });
}

/** Whether an ID is already some other item's: an argument, a wording, or a source. */
async function idUsed(trx: Trx, id: string): Promise<boolean> {
  const { rows } = await sql<{ used: boolean }>`
    select exists (select 1 from argument where id = ${id})
        or exists (select 1 from version where id = ${id})
        or exists (select 1 from source where id = ${id}) as used`.execute(trx);
  return rows[0]?.used === true;
}
