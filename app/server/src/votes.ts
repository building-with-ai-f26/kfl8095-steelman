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
import type { Services, Trx, WriteResult } from "./write-path.ts";

/**
 * Where an argument's wordings are now: itself, or, if it was combined away,
 * the argument it went into, followed through later combines (architecture
 * §3's stale-write table, M3a-6). `path` is the way there: the argument
 * named, each argument it was combined into in turn, and last the one it is
 * now. Null when it isn't on this board.
 */
export async function argumentNow(trx: Trx, boardId: string, argumentId: string): Promise<{ id: string; deleted_at: Date | null; redirected: boolean; path: string[] } | null> {
  const path = [argumentId];
  // A chain of combines is short; the bound only guards against a loop the schema doesn't allow anyway.
  for (let hops = 0; hops < 50; hops++) {
    const id = path.at(-1)!;
    const argument = await trx.selectFrom("argument").select(["deleted_at", "merged_into"]).where("id", "=", id).where("board_id", "=", boardId).executeTakeFirst();
    if (!argument) return null;
    if (!argument.merged_into) return { id, deleted_at: argument.deleted_at, redirected: id !== argumentId, path };
    path.push(argument.merged_into);
  }
  return null;
}

/**
 * Whether the vote someone has on the argument at the end of `path` came only
 * from the argument at its start, carried by the combines: they had no vote of
 * their own on any argument it went into (`into_value` null), and haven't
 * voted on a combined argument since (`revoted`). Each combine on the way kept
 * a combine_vote row for everyone whose vote it moved or merged (structure.ts).
 * A vote of their own there stands, even one the same as the carried one.
 */
async function carriedAlong(trx: Trx, person: string, path: string[]): Promise<boolean> {
  for (let hop = 0; hop + 1 < path.length; hop++) {
    const kept = await trx
      .selectFrom("combine_vote")
      .select("seq")
      .where("from_id", "=", path[hop]!)
      .where("into_id", "=", path[hop + 1]!)
      .where("account_id", "=", person)
      .where("revoted", "=", false)
      .where("into_value", "is", null)
      .executeTakeFirst();
    if (!kept) return false;
  }
  return true;
}

type Vote = 1 | -1 | null;

export function setImportance({ db, clock }: Services, boardId: string, person: string | null, named: string, value: Vote): Promise<WriteResult> {
  return writeToBoard(db, clock, boardId, person, {
    action: "vote",
    // A vote on an argument combined away applies to the one it went into (M3a-6).
    load: async (trx) => {
      const argument = await argumentNow(trx, boardId, named);
      if (!argument) return null;
      const mine = await trx.selectFrom("importance_vote").select("value").where("argument_id", "=", argument.id).where("account_id", "=", person ?? "").executeTakeFirst();
      return { ...argument, current: mine?.value ?? null };
    },
    stale: async (_trx, argument) => (argument.deleted_at ? { refused: "argument_deleted" } : null),
    change: async (trx, argument, seq) => {
      // The argument the vote lands on: the one named, or where it was combined into.
      const argumentId = argument.id;
      // Sent to an argument since combined away, by someone with a vote where it went (§3; the builder, Nov 22). If that
      // vote is the one the combine carried there from the argument they voted on, the queued vote is their newest
      // choice, so it applies, as Undo lets a newer vote win. If they voted there themselves, their vote there stands.
      if (argument.redirected && argument.current !== null && !(await carriedAlong(trx, person!, argument.path))) return "already_done";
      if ((argument.current ?? null) === value) return "already_done";
      // Voting on it answers any ask to vote again, left by a combine, and is a newer vote that Undo leaves as it is (M3a-6).
      await trx.updateTable("combine_vote").set({ asked_again: false, revoted: true }).where("into_id", "=", argumentId).where("account_id", "=", person!).where("revoted", "=", false).execute();
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
  return writeToBoard(db, clock, boardId, person, {
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
  return writeToBoard(db, clock, boardId, person, {
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
