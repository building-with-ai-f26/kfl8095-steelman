// What the API accepts and returns. The server checks every request body
// against these schemas, and the browser uses the same types, so the two
// can't disagree (plans/architecture.md §8, layer 1).

import { z } from "zod";
import { OPTIONS_PER_BOARD, commentBodyInput, contextInput, itemIdInput, optionNameInput, questionInput, sourceInput, spaceAboutInput, spaceNameInput, wordingInput, USERNAME } from "./inputs.ts";
import type { Closing } from "./closing.ts";
import type { BoardOrder } from "./order.ts";
import { LINK_ROLES } from "./policy.ts";
import type { Role, SpaceRole } from "./policy.ts";

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

/** A new option, with the ID the browser made for it, and an option's new name (M3a-2, A-07). */
export const newOptionInput = z.strictObject({ id: itemIdInput, name: optionNameInput });
export const renameOptionInput = z.strictObject({ name: optionNameInput });
/** The board's question, renamed in Settings (M3b-2, I-01), by New steelman's rules. */
export const renameQuestionInput = z.strictObject({ question: questionInput });
/** The moment a board closes (M3b-3, I-05), as an ISO date and time with its offset, or null to clear it. */
export const closingInput = z.strictObject({ closesAt: z.iso.datetime({ offset: true }).nullable() });
/** Combining a wording into another argument (M3a-6): the one it goes into. */
export const combineInput = z.strictObject({ into: itemIdInput });
/**
 * What combining a wording into an argument would do, for the dialog before it (M3a-7): whether the two arguments
 * become one, and if so how many people would be asked to vote again, and whether the reader is one. Never who.
 */
export interface CombinePreview {
  last: boolean;
  asked: number;
  you: boolean;
}
/** Separating a wording (M3a-6): the ID the browser made for its new argument. */
export const separateInput = z.strictObject({ argumentId: itemIdInput });

/** A new wording of an existing argument. */
export const newWordingInput = z.strictObject({ id: itemIdInput, wording: wordingInput, context: contextInput });

/**
 * A new comment (M3b-8, D-01): on an option, a wording, or, with neither, the question; never both. A reply
 * (M3b-9) also names its thread's first comment as `parentId`, and the same target as that thread.
 */
export const newCommentInput = z
  .strictObject({ id: itemIdInput, optionId: itemIdInput.optional(), versionId: itemIdInput.optional(), parentId: itemIdInput.optional(), body: commentBodyInput })
  .refine((comment) => comment.optionId === undefined || comment.versionId === undefined, { message: "A comment has one target or none." });

/** An edit names the revision it started from. */
export const editInput = z.strictObject({ baseRev: z.number().int().min(1), wording: wordingInput, context: contextInput });

/** A new source, added to a wording, with the ID the browser made for it (C-01). Editing one sends `sourceInput`. */
export const newSourceInput = z.strictObject({ id: itemIdInput, ...sourceInput.shape });

/**
 * Who can get in (H-02): only the people named on the board, or also anyone
 * with the link, as the link's role. Both are always sent, so the link role
 * is kept while the link is off. A board in a space (G-05, M3d-18) may
 * instead be shared with everyone in its space, at the same role, as Google
 * Drive offers "Anyone in <organisation>".
 */
export const accessInput = z.strictObject({ general: z.enum(["invited", "link", "space"]), linkRole: z.enum(LINK_ROLES) });
export type Access = z.infer<typeof accessInput>;

/** The space the Owner puts their board in (G-05, M3d-18), one they belong to, or null to take it out of its space. */
export const boardSpaceInput = z.strictObject({ space: itemIdInput.nullable() });

/** Why someone reports a wording (J-01), as the prototype's REASONS. */
export const REPORT_REASONS = ["spam", "abuse", "offtopic", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** A report: its reason, and a note, which Something else needs. */
export const reportInput = z
  .strictObject({ reason: z.enum(REPORT_REASONS), note: z.string().trim().max(500) })
  .refine(({ reason, note }) => reason !== "other" || note.length > 0, { message: "Say what's wrong with it.", path: ["note"] });

/** A moderator hides a wording (J-02, M2-4), giving one of the report reasons. */
export const hideInput = z.strictObject({ reason: z.enum(REPORT_REASONS) });

/** The roles the owner may give someone on Share's people list (M2-2b, Q27): any but Owner. */
export const MEMBER_ROLES = ["viewer", "voter", "contributor", "editor"] as const satisfies readonly Role[];

/** The owner sets someone's role on the board. */
export const memberRoleInput = z.strictObject({ role: z.enum(MEMBER_ROLES) });
/**
 * Adding someone to a board by their username, at a role (M3b-7, H-01). Usernames are kept in lower case, so the
 * capitals and a leading @ someone types don't count.
 */
export const inviteInput = z.strictObject({
  username: z
    .string()
    .transform((typed) => typed.trim().replace(/^@/, "").toLowerCase())
    .pipe(z.string().min(1).max(USERNAME.max)),
  role: z.enum(MEMBER_ROLES),
});

/** Someone on the board, as Share's people list shows them: by username, never by email. */
export interface Person {
  id: string;
  /** Null until they've chosen a username. */
  name: string | null;
  role: Role;
}

/** A space's canvases (G-03), the prototype's CANVAS_IDS. A new space starts on stone. */
export const SPACE_CANVASES = ["stone", "cool", "sand", "slate", "sage", "lilac"] as const;
export type SpaceCanvas = (typeof SPACE_CANVASES)[number];

/** Who can find a space (G-03): only its members, for now. M3d-20 adds "public", after the security re-review. */
export const SPACE_VISIBILITIES = ["private"] as const;

/** The roles an Admin or the Owner may give someone in a space (G-04): any but Owner. */
export const SPACE_MEMBER_ROLES = ["admin", "member"] as const satisfies readonly SpaceRole[];

/**
 * A new space (G-03, M3d-17), with the ID the browser made for it, so sending it twice makes one space. Its about text
 * and canvas may be left out (empty, and stone), and it can only start private.
 */
export const newSpaceInput = z.strictObject({
  id: itemIdInput,
  name: spaceNameInput,
  about: spaceAboutInput.optional(),
  canvas: z.enum(SPACE_CANVASES).optional(),
  visibility: z.enum(SPACE_VISIBILITIES).optional(),
});

/** A space's settings (G-03): all three are always sent, as Share sends both its settings. */
export const spaceSettingsInput = z.strictObject({ name: spaceNameInput, about: spaceAboutInput, canvas: z.enum(SPACE_CANVASES) });

/** A space's visibility, which only its Owner sets (G-03). */
export const spaceVisibilityInput = z.strictObject({ visibility: z.enum(SPACE_VISIBILITIES) });

/** Adding someone to a space by their username (G-04), tidied as a board invite's is. */
export const spaceInviteInput = z.strictObject({ username: inviteInput.shape.username, role: z.enum(SPACE_MEMBER_ROLES) });

/** Switching someone's role in a space between Admin and Member (G-04). */
export const spaceRoleInput = z.strictObject({ role: z.enum(SPACE_MEMBER_ROLES) });

/** A space as its members see it (G-03): its settings, the reader's role, and how many members it has. */
export interface SpaceSummary {
  id: string;
  name: string;
  about: string;
  canvas: SpaceCanvas;
  visibility: (typeof SPACE_VISIBILITIES)[number];
  role: SpaceRole;
  members: number;
}

/** Your spaces: the ones you belong to, by name. */
export interface SpaceList {
  spaces: SpaceSummary[];
}

/** Someone in a space, as its members see them (G-04): by username, never by email. */
export interface SpaceMember {
  id: string;
  /** Null until they've chosen a username. */
  name: string | null;
  role: SpaceRole;
}

/**
 * What a write to a space answers. A space has no change number for readers to follow (it isn't synced live, as a
 * board is), so "done" carries none.
 */
export type SpaceWriteAnswer = { status: "done" } | { status: "already_done" } | { status: "refused"; reason: RefusalReason; retryAfter?: number };

/** Delete account (M-07): the username they typed to confirm. */
export const deleteAccountInput = z.strictObject({ username: z.string().max(100) });

/** Changing your username (L-04): the new name. Its shape and whether it's reserved are judged by isAllowedUsername, as at first sign-in. */
export const usernameChangeInput = z.strictObject({ username: z.string().max(100) });

/**
 * What PUT /api/account/username answers (L-04). `again` is when a second change in 30 days is allowed, as an ISO
 * date and time, for the browser to say in the reader's own time zone.
 */
export type UsernameChangeAnswer =
  | { status: "done"; username: string }
  | { status: "already_done" }
  | { status: "refused"; reason: "taken" | "invalid" | "reserved" | "signed_out" | "wrong_origin" | "needs_username" }
  | { status: "refused"; reason: "too_soon"; again: string };

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
  })
  // A new board is in no space until its Owner puts it in one (M3d-18), so it can't start shared with a space's members.
  .refine(({ access }) => access?.general !== "space", {
    message: "A new steelman isn’t in a space yet, so it can’t be shared with everyone in one.",
    path: ["access", "general"],
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
  /** Present when the reader's two votes disagreed as this argument was combined, so they're asked to vote again (M3a-6, PRD §5). */
  askedAgain?: true;
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
  /** How many importance and articulation votes it had just before its latest edit, for the "edited" mark (Q22); null if never edited. */
  votesBefore: { importance: number; articulation: number } | null;
  sourceIds: string[];
  articulation: number;
  articulationVoters: number;
  /** Assessments of the current revision. */
  yes: number;
  no: number;
  deleted: boolean;
  /** Hidden by a moderator (M2-4): its text then reaches only Editors and the Owner. */
  hidden: boolean;
  /** Why, for everyone: "Removed by a moderator · Spam". Null unless hidden. */
  hiddenReason: ReportReason | null;
  changedSeq: number;
  myVote: 1 | -1 | null;
  /** The reader's assessment of the current revision. */
  myAssessment: boolean | null;
  /** The reader's own open report on it (M2-3), so they can withdraw it. */
  myReport: ReportReason | null;
  /** Its open reports, by reason: only for an Editor or the Owner, and null when there are none. Never who made them. */
  reports: { count: number; reasons: Partial<Record<ReportReason, number>>; notes: string[] } | null;
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
  /** Reported as one that can't be opened (C-02). */
  unavailable: boolean;
  /** Who reported it, by ID and username, and when; left out when it isn't reported (M3a-3). */
  report?: { by: string; byName: string; at: string };
  changedSeq: number;
}

/**
 * A comment on the question, an option, or a wording (D-01, M3b-10), or a reply to one. A reply names its thread's
 * first comment as its parent and has the thread's target.
 */
export interface CommentRow {
  id: string;
  /** The target: an option, a wording, or neither for the question, never both. */
  optionId: string | null;
  versionId: string | null;
  /** For a reply: its thread's first comment. Null on a first comment. */
  parentId: string | null;
  /** Who wrote it, by ID and username: "deleted_account" once they have deleted their account. */
  authorId: string;
  authorName: string;
  /** Null once deleted, since the text is erased; while hidden, null for anyone below Editor (M3b-14). */
  body: string | null;
  createdAt: string;
  /** Set on a thread's first comment while the thread is resolved. */
  resolved: boolean;
  deleted: boolean;
  /** Hidden by an Editor or the Owner (M3b-14), who still read its text; nobody else does. */
  hidden: boolean;
  /** Why it was hidden, one of the report reasons; left out when it isn't hidden, or was hidden without one. */
  hiddenReason?: ReportReason;
  changedSeq: number;
}

/**
 * Where a link to a comment leads (M3b-13, D-01, M-06), as GET /api/boards/:board/comments/:id answers it: the
 * comment stands, it was deleted (or never was on this board), or its wording or option is gone. Only the state, never
 * the comment's text or author.
 */
export type CommentLinkState = "stands" | "deleted" | "subject_removed";

/**
 * One entry in a board's History (M3a-4, J-03): who did what, when, to what, and why; never what anyone wrote. Most
 * are rows of the change log. A new argument or wording has no such row, so its entry is built from the wording's
 * own row (`argument_added`, `wording_added`; the subject is the wording).
 */
export interface HistoryEntry {
  /** The change number of the write. An addition's is the write that added it, which can be one a change-log row has too. */
  seq: number;
  at: string;
  actorName: string;
  kind: string;
  subjectKind: string;
  subjectId: string;
  /** A moderator's stated reason, where the action has one. */
  reason: string | null;
  /** What the entry needs beyond its subject: the wording and source a source change was on, the person and role of a role change, the access set. */
  detail: {
    version?: string;
    source?: string;
    argumentDeleted?: true;
    accountName?: string;
    role?: Role;
    general?: Access["general"];
    linkRole?: Role;
    /**
     * A board shared with everyone in a space, or put in one (G-05, M3d-18): the space's name, sent only to a reader who
     * is in that space, so no one else learns it.
     */
    spaceName?: string;
    /** A board taken out of its space (M3d-18). */
    outOfSpace?: true;
    /** A combine or separation (M3a-8): the argument the wording left, the one it joined or became, and whether two arguments became one. */
    from?: string;
    into?: string;
    argument?: string;
    merged?: true;
    /** An undo: the change it undid. */
    undoes?: number;
    /** An edit of a source that cleared its "can't be opened" report (C-02). */
    cleared?: true;
    /** A closing time that was set (M3b-3): the moment, as an ISO date and time. */
    closesAt?: string;
  };
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
  /** Comments whose subject stands (M3b-10), only when there are some, so a board without them answers as before. */
  comments?: CommentRow[];
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
  /** The board's question, only when it was renamed after S (M3b-2), so an ordinary answer keeps its shape. */
  question?: string;
  /**
   * Comments stamped after S whose subject stands, and every comment on a subject History's Restore brought back after
   * S (M3b-10). Only when there are some, so an ordinary answer keeps its shape.
   */
  comments?: CommentRow[];
}

/**
 * One board in the list (E-03): its question, its options with how many arguments each has, the reader's role, its
 * owner, when it last changed, when it was made, and its open comment count.
 */
export interface BoardListing {
  id: string;
  question: string;
  options: { name: string; arguments: number }[];
  role: Role;
  /** The owner's username, as Google Drive's list shows each file's owner. */
  owner: string;
  /** The last write of any kind: a new argument or wording, an edit, a vote, an assessment, a change of sources or access. */
  changedAt: string;
  /** When the board was made, which Newest sorts by (M3d-13). No later write changes it. */
  createdAt: string;
  /**
   * How many open comments the board has, by its speech bubbles' rule (openCount, M3d-13): replies count, and deleted
   * comments, resolved threads, and comments on a deleted or hidden wording or a deleted option don't.
   */
  comments: number;
  /** Only when the board is closed or has a closing time (M3b-3). */
  closing?: Closing;
}

/**
 * Your statistics (L-09, M3d-14): counts of what you wrote, worked out on each request from the boards where you still
 * have a role, leaving out deleted, hidden, and merged items. Only you are sent them. Nothing counts a vote or an
 * assessment, so nothing here says how anyone voted.
 */
export interface AccountStatistics {
  /** Arguments you wrote that stand: not deleted, not combined into another, with a wording still shown. */
  arguments: number;
  /** How many of those are in their option's top three, by the board's Strongest case rule (CASE_SIZE). */
  argumentsInTopThree: number;
  /** Wordings you wrote that are neither deleted nor hidden, on arguments that stand. */
  wordings: number;
  /** How many of those lead their argument's row, by the same rule. */
  wordingsLeading: number;
  /** Sources you added. */
  sources: number;
  /** Comments and replies you wrote that are neither deleted nor hidden, on a subject that's still there. */
  comments: number;
  /** The boards where you wrote at least one of the above. */
  boards: number;
}

/**
 * One thing a person wrote, on a profile (L-03, M3d-16): an argument, a wording, or a source, on a board where the
 * viewer has a role.
 */
export interface ProfileItem {
  /** The argument's, the wording's, or the source's ID. */
  id: string;
  board: string;
  /** The board's question, sent only for a board where the viewer has a role. */
  question: string;
  /** The wording whose card the item opens: an argument's earliest wording shown, or the earliest shown one citing a source. */
  version: string;
  /** The wording as it reads now, or the source's name. */
  text: string;
  /** When it was added. */
  at: string;
}

/**
 * A person's profile (L-03, M3d-16): their username, and what they wrote on the boards where the viewer has a role,
 * newest first, with the service's time now for each item's age. The username is the account's current one, so a
 * name held after a change answers with the new name. Nothing here counts a vote, an assessment, or points.
 */
export interface Profile {
  username: string;
  /** Whether this is the viewer's own profile. */
  you: boolean;
  now: string;
  /** Arguments the person started that stand. */
  arguments: ProfileItem[];
  /** The person's other wordings that are shown, on arguments that stand. */
  wordings: ProfileItem[];
  /** Sources the person added that a shown wording cites. */
  sources: ProfileItem[];
}

/** The list, most recently changed first, with the service's time now, so "3h ago" doesn't depend on the reader's clock. */
export interface BoardList {
  now: string;
  boards: BoardListing[];
}

/**
 * Sent with the snapshot and with every answer about changes: who can get in
 * now, and the reader's own role now, since the owner can change either at
 * any moment.
 */
export interface Standing {
  access: Access;
  role: Role;
  /**
   * The board's space (G-05, M3d-18), only for a reader who is in it, so an ordinary answer keeps its shape and no one
   * outside a space learns its name.
   */
  space?: { id: string; name: string };
  /** Only when the board is closed or has a closing time (M3b-3), so an open board's answers keep their shape. */
  closing?: Closing;
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
  /** A wording is combined only into another argument in its option (M3a-6). */
  | "not_same_option"
  /** An argument's only wording can't be separated from it (M3a-6). */
  | "only_wording"
  /** A combine or separation that something moved again since can't be undone (M3a-6, as Canny won't unmerge a post merged again). */
  | "combined_since"
  /** Only a combine or a separation can be undone this way (M3a-6). */
  | "cant_undo"
  /** The option was deleted (M3a-2). */
  | "option_deleted"
  /** An option with arguments can't be deleted; they'd have nowhere to go (M3a-2). */
  | "option_not_empty"
  /** A board keeps at least two options, and at most four (OPTIONS_PER_BOARD). */
  | "too_few_options"
  | "too_many_options"
  /** Another option on the board already has that name, capitals aside (A-07). */
  | "option_name_taken"
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
  | "too_many"
  /** The person invited is the board's Owner, who has access already (M3b-7). */
  | "already_member"
  /** A reply, resolve, or reopen named a reply: only a thread's first comment can be replied to, resolved, or reopened (M3b-9). */
  | "not_a_thread"
  /** A reply named another target than its thread's (M3b-9). */
  | "not_same_thread"
  /** The thread was resolved, so a reply to it isn't added (M3b-9, architecture §3). */
  | "thread_resolved"
  /** The thread's first comment was deleted by its author or hidden by a moderator, so it takes no reply, resolve, or reopen (M3b-9). */
  | "thread_deleted"
  /** An Editor or the Owner doesn't hide, or restore, a comment of their own (M3b-14). */
  | "own_comment"
  /** A comment its author deleted can't be hidden or restored: its text is erased already (M3b-14). */
  | "comment_deleted"
  /** No one demotes or removes a space's Owner, and the Owner can't leave (M3d-17). The screen says "The owner of a space keeps that role." */
  | "owner_keeps_role"
  /**
   * The board isn't in a space, or the space named isn't one the Owner is in (G-05, M3d-18). A space the Owner isn't in
   * answers as one that doesn't exist does, so no one learns that it exists.
   */
  | "no_space";

export type WriteAnswer =
  | { status: "done"; seq: number }
  | { status: "already_done" }
  | { status: "refused"; reason: RefusalReason; current?: VersionRow; retryAfter?: number };

/** What a person over a rate limit is told: "a minute" for a wait of a minute or less, else the minutes, rounded up. */
export function tooManyMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `You’ve done that too many times in a row. Try again in ${minutes <= 1 ? "a minute" : `${minutes} minutes`}.`;
}
