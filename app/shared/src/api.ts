// What the API accepts and returns. The server checks every request body
// against these schemas, and the browser uses the same types, so the two
// can't disagree (plans/architecture.md §8, layer 1).

import { z } from "zod";
import type { BoardOrder } from "./order.ts";

/** A vote: +1, -1, or null to withdraw it. */
export const voteInput = z.strictObject({ value: z.union([z.literal(1), z.literal(-1), z.null()]) });

/** An assessment names the revision the person read; null withdraws it. */
export const assessmentInput = z.strictObject({ rev: z.number().int().min(1), supported: z.boolean().nullable() });

/** "Changes after S": S is a change number the reader holds. */
export const changesQuery = z.strictObject({ after: z.string().regex(/^\d+$/).transform(Number) });

export interface OptionRow {
  id: string;
  name: string;
  position: number;
  deleted: boolean;
  changedSeq: number;
}

export interface ArgumentRow {
  id: string;
  optionId: string;
  /** The change number it was added at: arguments are "in the order they were added" by this. */
  createdSeq: number;
  importance: number;
  importanceVoters: number;
  deleted: boolean;
  mergedInto: string | null;
  changedSeq: number;
  /** The reader's own importance vote. */
  myVote: 1 | -1 | null;
}

export interface VersionRow {
  id: string;
  argumentId: string;
  authorId: string;
  authorName: string;
  createdSeq: number;
  rev: number;
  /** Null once deleted: the text is erased. */
  wording: string | null;
  context: string | null;
  /** The wording before the latest edit, for the "edited" mark; null if never edited. */
  previousWording: string | null;
  sourceIds: string[];
  articulation: number;
  articulationVoters: number;
  /** Assessments of the current revision. */
  yes: number;
  no: number;
  deleted: boolean;
  hidden: boolean;
  changedSeq: number;
  myVote: 1 | -1 | null;
  /** The reader's assessment of the current revision. */
  myAssessment: boolean | null;
}

export interface SourceRow {
  id: string;
  name: string;
  locator: string;
  /** The locator as a link, when it is an http or https address. */
  link: string | null;
  finding: string;
  backsUp: string;
  limits: string;
  unavailable: boolean;
  changedSeq: number;
}

export interface LogRow {
  seq: number;
  at: string;
  actorName: string;
  kind: string;
  subjectKind: string;
  subjectId: string;
  reason: string | null;
}

export interface BoardSnapshot {
  board: { id: string; question: string; closed: boolean; seq: number };
  options: OptionRow[];
  arguments: ArgumentRow[];
  versions: VersionRow[];
  sources: SourceRow[];
  /** The latest published shared order. */
  order: BoardOrder;
}

export interface BoardChanges {
  /** The board's change number now: ask for changes after this next time. */
  seq: number;
  options: OptionRow[];
  arguments: ArgumentRow[];
  versions: VersionRow[];
  sources: SourceRow[];
  /** A newer published order, if there is one. */
  order: BoardOrder | null;
  log: LogRow[];
}

/** Why the server refused a write. */
export type RefusalReason =
  | "signed_out"
  | "board_closed"
  | "not_author"
  | "test_users_off"
  | "argument_deleted"
  | "version_deleted"
  | "revision_changed"
  | "needs_evidence";

export type WriteAnswer =
  | { status: "done"; seq: number }
  | { status: "already_done" }
  | { status: "refused"; reason: RefusalReason; current?: VersionRow };
