// What the API accepts and returns. The server checks every request body
// against these schemas, and the browser uses the same types, so the two
// can't disagree (plans/architecture.md §8, layer 1).

import { z } from "zod";
import { OPTIONS_PER_BOARD, contextInput, itemIdInput, optionNameInput, questionInput, sourceInput, wordingInput } from "./inputs.ts";
import type { BoardOrder } from "./order.ts";
import { LINK_ROLES } from "./policy.ts";
import type { Role } from "./policy.ts";

/** A vote: +1, -1, or null to withdraw it. */
export const voteInput = z.strictObject({ value: z.union([z.literal(1), z.literal(-1), z.null()]) });

/** An assessment names the revision the person read; null withdraws it. */
export const assessmentInput = z.strictObject({ rev: z.number().int().min(1), supported: z.boolean().nullable() });

/** A new argument arrives with its first wording, each with the ID the browser made for it. */
export const newArgumentInput = z.strictObject({
  id: itemIdInput,
  optionId: itemIdInput,
  versionId: itemIdInput,
  wording: wordingInput,
  context: contextInput,
});

/** A new wording of an existing argument. */
export const newWordingInput = z.strictObject({ id: itemIdInput, wording: wordingInput, context: contextInput });

/** An edit names the revision it started from. */
export const editInput = z.strictObject({ baseRev: z.number().int().min(1), wording: wordingInput, context: contextInput });

/** A new source, added to a wording, with the ID the browser made for it (C-01). Editing one sends `sourceInput`. */
export const newSourceInput = z.strictObject({ id: itemIdInput, ...sourceInput.shape });

/**
 * Who can get in (H-02): only the people named on the board, or also anyone
 * with the link, as the link's role. Both are always sent, so the link role
 * is kept while the link is off.
 */
export const accessInput = z.strictObject({ general: z.enum(["invited", "link"]), linkRole: z.enum(LINK_ROLES) });
export type Access = z.infer<typeof accessInput>;

/** The roles the owner may give someone on Share's people list (M2-2b, Q27): any but Owner. */
export const MEMBER_ROLES = ["viewer", "voter", "contributor", "editor"] as const satisfies readonly Role[];

/** The owner sets someone's role on the board. */
export const memberRoleInput = z.strictObject({ role: z.enum(MEMBER_ROLES) });

/** Someone on the board, as Share's people list shows them: by username, never by email. */
export interface Person {
  id: string;
  /** Null until they've chosen a username. */
  name: string | null;
  role: Role;
}

/** Delete account (M-07): the username they typed to confirm. */
export const deleteAccountInput = z.strictObject({ username: z.string().max(100) });

/**
 * A new board (F-01): its question and two to four options, each named
 * differently, ignoring capitals. The service chooses the board's ID: it is
 * the board's link, so it must be unguessable.
 */
export const newBoardInput = z
  .strictObject({
    question: questionInput,
    options: z.array(optionNameInput).min(OPTIONS_PER_BOARD.min).max(OPTIONS_PER_BOARD.max),
    /** Who can get in from the start; left out, anyone with the link, as Contributor. */
    access: accessInput.optional(),
  })
  .refine(({ options }) => new Set(options.map((name) => name.toLowerCase())).size === options.length, {
    message: "Each option needs a different name.",
    path: ["options"],
  });
export type NewBoard = z.infer<typeof newBoardInput>;

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
  /** Kept, but no longer asked for or shown (the builder, Nov 14): the finding can say it. */
  backsUp: string;
  limits: string;
  /** Who added it, by ID and username: only they may edit it. */
  addedBy: string;
  addedByName: string;
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

/**
 * Sent with the snapshot and with every answer about changes: who can get in
 * now, and the reader's own role now, since the owner can change either at
 * any moment.
 */
export interface Standing {
  access: Access;
  role: Role;
}

/**
 * What the web app asks the service when it starts. `analytics` is the
 * PostHog project key and address, or null when the service was given none,
 * and then the browser sends nothing (M-08).
 */
/** Where PostHog's scripts come from, for its address: us.i.posthog.com's are at us-assets.i.posthog.com. */
export function posthogAssetsHost(host: string): string {
  return host.replace(".i.posthog.com", "-assets.i.posthog.com");
}

export interface PublicConfig {
  analytics: { key: string; host: string } | null;
}

/** Why the server refused a write. */
export type RefusalReason =
  | "signed_out"
  /** Signed in, but with no role on this board. */
  | "no_access"
  /** Their role on this board doesn't allow it. */
  | "not_allowed"
  | "board_closed"
  | "not_author"
  | "test_users_off"
  | "argument_deleted"
  | "version_deleted"
  | "revision_changed"
  | "needs_evidence"
  /** A new item's ID is already used by something else. */
  | "id_taken"
  /** Signed in, but hasn't picked a username yet, so there is nothing to credit a write to. */
  | "needs_username"
  /** A write carrying a session cookie came from another site, or didn't say where from (cross-site request forgery). */
  | "wrong_origin"
  /** Over a rate limit (architecture §7): nothing was saved; `retryAfter` says how many seconds until it would be. */
  | "too_many";

export type WriteAnswer =
  | { status: "done"; seq: number }
  | { status: "already_done" }
  | { status: "refused"; reason: RefusalReason; current?: VersionRow; retryAfter?: number };

/** What a person over a rate limit is told: "a minute" for a wait of a minute or less, else the minutes, rounded up. */
export function tooManyMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `Too many in a row. Try again in ${minutes <= 1 ? "a minute" : `${minutes} minutes`}.`;
}
