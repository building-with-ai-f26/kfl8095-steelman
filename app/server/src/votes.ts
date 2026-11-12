// The three kinds of judgment, each as one write through the write path:
// an importance vote on an argument (B-01), an articulation vote on a wording
// (B-02), and an assessment of a wording's evidence (B-03).
//
// Each says what the result should be ("my vote is +1", "my vote is none"),
// so sending it twice changes nothing (invariant 10). The cached counts are
// recounted from the vote table in the same transaction, so they can't drift.

import { sql } from "kysely";
import { versionRows } from "./read.ts";
import { writeToBoard } from "./write-path.ts";
import type { Services, WriteResult } from "./write-path.ts";

type Vote = 1 | -1 | null;

export function setImportance({ db, clock }: Services, boardId: string, person: string | null, argumentId: string, value: Vote): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "vote",
    load: async (trx) =>
      (await trx
        .selectFrom("argument as a")
        .leftJoin("importance_vote as mine", (join) => join.onRef("mine.argument_id", "=", "a.id").on("mine.account_id", "=", person ?? ""))
        .select(["a.deleted_at", "mine.value as current"])
        .where("a.id", "=", argumentId)
        .where("a.board_id", "=", boardId)
        .executeTakeFirst()) ?? null,
    stale: async (_trx, argument) => (argument.deleted_at ? { refused: "argument_deleted" } : null),
    change: async (trx, argument, seq) => {
      if ((argument.current ?? null) === value) return "already_done";
      if (value === null) {
        await trx.deleteFrom("importance_vote").where("argument_id", "=", argumentId).where("account_id", "=", person!).execute();
      } else {
        const row = { argument_id: argumentId, account_id: person!, board_id: boardId, value, voted_at: clock.now() };
        await trx
          .insertInto("importance_vote")
          .values(row)
          .onConflict((conflict) => conflict.columns(["argument_id", "account_id"]).doUpdateSet({ value, voted_at: row.voted_at }))
          .execute();
      }
      await trx
        .updateTable("argument")
        .set({
          importance: sql<number>`(select coalesce(sum(value), 0) from importance_vote where argument_id = ${argumentId})`,
          importance_voters: sql<number>`(select count(*) from importance_vote where argument_id = ${argumentId})`,
          changed_seq: seq,
        })
        .where("id", "=", argumentId)
        .execute();
      return "done";
    },
  });
}

export function setArticulation({ db, clock }: Services, boardId: string, person: string | null, versionId: string, value: Vote): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "vote",
    load: async (trx) =>
      (await trx
        .selectFrom("version as v")
        .leftJoin("articulation_vote as mine", (join) => join.onRef("mine.version_id", "=", "v.id").on("mine.account_id", "=", person ?? ""))
        .select(["v.deleted_at", "v.hidden_at", "mine.value as current"])
        .where("v.id", "=", versionId)
        .where("v.board_id", "=", boardId)
        .executeTakeFirst()) ?? null,
    stale: async (_trx, version) => (version.deleted_at || version.hidden_at ? { refused: "version_deleted" } : null),
    change: async (trx, version, seq) => {
      if ((version.current ?? null) === value) return "already_done";
      if (value === null) {
        await trx.deleteFrom("articulation_vote").where("version_id", "=", versionId).where("account_id", "=", person!).execute();
      } else {
        const row = { version_id: versionId, account_id: person!, board_id: boardId, value, voted_at: clock.now() };
        await trx
          .insertInto("articulation_vote")
          .values(row)
          .onConflict((conflict) => conflict.columns(["version_id", "account_id"]).doUpdateSet({ value, voted_at: row.voted_at }))
          .execute();
      }
      await trx
        .updateTable("version")
        .set({
          articulation: sql<number>`(select coalesce(sum(value), 0) from articulation_vote where version_id = ${versionId})`,
          articulation_voters: sql<number>`(select count(*) from articulation_vote where version_id = ${versionId})`,
          changed_seq: seq,
        })
        .where("id", "=", versionId)
        .execute();
      return "done";
    },
  });
}

/**
 * An assessment names the revision the person read. If the wording has
 * changed since, it is refused with the wording as it is now (invariant 3).
 * "Yes" needs at least one cited source that isn't marked unavailable
 * (invariant 5).
 */
export function setAssessment(
  { db, clock }: Services,
  boardId: string,
  person: string | null,
  versionId: string,
  input: { rev: number; supported: boolean | null },
): Promise<WriteResult> {
  return writeToBoard(db, boardId, person, {
    action: "assess",
    load: async (trx) =>
      (await trx
        .selectFrom("version as v")
        .leftJoin("assessment as mine", (join) =>
          join.onRef("mine.version_id", "=", "v.id").onRef("mine.rev", "=", "v.current_rev").on("mine.account_id", "=", person ?? ""),
        )
        .select(["v.current_rev", "v.deleted_at", "v.hidden_at", "mine.supported as current"])
        .where("v.id", "=", versionId)
        .where("v.board_id", "=", boardId)
        .executeTakeFirst()) ?? null,
    stale: async (trx, version) => {
      if (version.deleted_at || version.hidden_at) return { refused: "version_deleted" };
      if (input.rev !== version.current_rev) {
        const [current] = await versionRows(trx, boardId, person, { ids: [versionId] });
        return current ? { refused: "revision_changed", current } : { refused: "revision_changed" };
      }
      return null;
    },
    change: async (trx, version, seq) => {
      const rev = version.current_rev;
      if ((version.current ?? null) === input.supported) return "already_done";
      if (input.supported === true) {
        const evidence = await trx
          .selectFrom("revision_source as cited")
          .innerJoin("source", "source.id", "cited.source_id")
          .select("source.id")
          .where("cited.version_id", "=", versionId)
          .where("cited.rev", "=", rev)
          .where("source.unavailable_at", "is", null)
          .executeTakeFirst();
        if (!evidence) return { refused: "needs_evidence" };
      }
      if (input.supported === null) {
        await trx.deleteFrom("assessment").where("version_id", "=", versionId).where("rev", "=", rev).where("account_id", "=", person!).execute();
      } else {
        const row = { version_id: versionId, rev, account_id: person!, board_id: boardId, supported: input.supported, assessed_at: clock.now() };
        await trx
          .insertInto("assessment")
          .values(row)
          .onConflict((conflict) => conflict.columns(["version_id", "rev", "account_id"]).doUpdateSet({ supported: row.supported, assessed_at: row.assessed_at }))
          .execute();
      }
      await trx
        .updateTable("version")
        .set({
          yes: sql<number>`(select count(*) from assessment where version_id = ${versionId} and rev = ${rev} and supported)`,
          no: sql<number>`(select count(*) from assessment where version_id = ${versionId} and rev = ${rev} and not supported)`,
          changed_seq: seq,
        })
        .where("id", "=", versionId)
        .execute();
      return "done";
    },
  });
}
