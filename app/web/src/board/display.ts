// What each part of the board shows, read from what the reader holds. No
// decisions about order live here: the order on screen is `view.shown`,
// which only the shared rules change.

import { can } from "@steelman/shared";
import type { ArgumentRow, OptionRow, QueuedAction, ReaderView, Role, VersionRow } from "@steelman/shared";

export type Vote = 1 | -1 | null;

/** A control the reader's role can't use: why, in the prototype's words (WHY), and the hidden note that says so to a screen reader. */
export interface Blocked {
  why: string;
  noteId: string;
}

export const WHY = {
  vote: { why: "Voting and assessing evidence need “can vote” access.", noteId: "sm-why-vote" },
  add: { why: "Writing and editing need “can contribute” access.", noteId: "sm-why-write" },
} as const satisfies Record<string, Blocked>;

/** Why the reader's role can't vote (or assess) or write, or null when it can. A closed board or a missing role is the service's to refuse. */
export function whyNot(reader: string | null, role: Role | null, action: "vote" | "add"): Blocked | null {
  return can(reader, role, action, { closed: false }) === "not_allowed" ? WHY[action] : null;
}

/**
 * What marks a control unavailable, as the prototype does (applyAccess): faded
 * by `data-blocked`, its tooltip the reason, and still focusable, so the
 * keyboard reaches it and a screen reader hears why. Its own click does nothing.
 */
export function blockedProps(blocked: Blocked | null) {
  return blocked ? { "aria-disabled": true, "data-blocked": "", "data-tooltip": blocked.why, "aria-describedby": blocked.noteId } : {};
}

/** The options with a column, left to right. */
export function columns(view: ReaderView): OptionRow[] {
  return Object.keys(view.shown.arguments)
    .map((id) => view.rows.options[id])
    .filter((option): option is OptionRow => option !== undefined)
    .sort((a, b) => a.position - b.position);
}

export function isLive(argument: ArgumentRow | undefined): boolean {
  return argument !== undefined && !argument.deleted && argument.mergedInto === null;
}

export function isLiveVersion(version: VersionRow | undefined): boolean {
  return version !== undefined && !version.deleted && !version.hidden;
}

/** The reader's own importance vote and the count with it, counting a choice not yet sent or not yet back. */
export function importanceShown(argument: ArgumentRow, mine: readonly QueuedAction[]): { vote: Vote; score: number } {
  const queued = mine.find((action) => action.kind === "importance" && action.argumentId === argument.id);
  if (!queued || queued.kind !== "importance") return { vote: argument.myVote, score: argument.importance };
  return { vote: queued.value, score: argument.importance - (argument.myVote ?? 0) + (queued.value ?? 0) };
}

export function articulationShown(version: VersionRow, mine: readonly QueuedAction[]): { vote: Vote; score: number } {
  const queued = mine.find((action) => action.kind === "articulation" && action.versionId === version.id);
  if (!queued || queued.kind !== "articulation") return { vote: version.myVote, score: version.articulation };
  return { vote: queued.value, score: version.articulation - (version.myVote ?? 0) + (queued.value ?? 0) };
}

/**
 * The wording's assessment counts and the reader's own, counting one not yet
 * sent or not yet back. One made of an earlier revision doesn't count: the
 * service will refuse it.
 */
export function assessmentShown(version: VersionRow, mine: readonly QueuedAction[]): { yes: number; no: number; mine: boolean | null } {
  const queued = mine.find((action) => action.kind === "assess" && action.versionId === version.id);
  if (!queued || queued.kind !== "assess" || queued.rev !== version.rev) return { yes: version.yes, no: version.no, mine: version.myAssessment };
  const was = version.myAssessment;
  return {
    yes: version.yes - (was === true ? 1 : 0) + (queued.supported === true ? 1 : 0),
    no: version.no - (was === false ? 1 : 0) + (queued.supported === false ? 1 : 0),
    mine: queued.supported,
  };
}

/**
 * The wording with the reader's own edit in it, until the edit is back (A-06):
 * as the next revision, marked edited, its credibility score reset. Votes
 * and sources stay. An assessment made meanwhile names that revision.
 */
export function editShown(version: VersionRow, mine: readonly QueuedAction[]): VersionRow {
  let shown = version;
  // `mine` is newest first; edits made one after another each start from the one before.
  for (const action of [...mine].reverse()) {
    if (action.kind !== "edit" || action.versionId !== version.id || action.baseRev !== shown.rev) continue;
    // The counts from before it are the service's to say (M2-5): none are shown until it has the edit.
    shown = { ...shown, rev: shown.rev + 1, wording: action.wording, context: action.context, previousWording: shown.wording, votesBefore: null, yes: 0, no: 0, myAssessment: null };
  }
  return shown;
}

/** What a version's ⋯ menu offers (A-12), in order: Copy link first and Delete last, as GitHub's comment menus put them. */
export type MenuItem = "edit" | "suggest" | "copyLink" | "combine" | "separate" | "deleteVersion" | "deleteArgument" | "report" | "withdrawReport" | "hide" | "restore";

/**
 * Only what the service would allow (the shared policy table): the author
 * edits and deletes; anyone else who may write suggests a revised version.
 * Report is reportItem's (M2-3). An Editor or the Owner also combines it with
 * another argument in its option, and separates it when its row has another
 * wording (M3a-7), in the prototype's order. The AI actions come later.
 *
 * @param lastWording Whether it's its row's only live wording, so deleting it deletes the argument.
 * @param place Where it sits, when the menu is drawn on the board: whether its option has another argument it could
 *   be combined with, and whether it's its argument's last wording on the service (the screen may still show one
 *   someone moved). Without it, the menu offers neither combining nor separating.
 */
export function versionMenu(version: VersionRow, reader: string | null, role: Role | null, lastWording: boolean, place?: { others: boolean; last?: boolean }): MenuItem[] {
  const board = { closed: false };
  const items: MenuItem[] = ["copyLink"];
  if (can(reader, role, "edit", board, version.authorId) === null) items.push("edit");
  else if (can(reader, role, "add", board) === null) items.push("suggest");
  if (place && can(reader, role, "structure", board) === null) {
    if (place.others) items.push("combine");
    if (!(place.last ?? lastWording)) items.push("separate");
  }
  if (can(reader, role, "delete", board, version.authorId) === null) items.push(lastWording ? "deleteArgument" : "deleteVersion");
  return items;
}

/**
 * What the menu offers last, below a rule, as the prototype's moderation items
 * (M2-3): Report, to anyone who can read someone else's wording, or Withdraw
 * your report once they have; nothing for their own wording.
 */
export function reportItem(version: VersionRow, reader: string | null, role: Role | null): MenuItem[] {
  if (version.hidden || reader === version.authorId || can(reader, role, "report", { closed: false }) !== null) return [];
  return [version.myReport ? "withdrawReport" : "report"];
}

/**
 * An Editor's and the Owner's (M2-4): Hide on someone else's wording, Restore on one hidden; after Report, below the
 * same rule. Not on their own, as the prototype's modItems: their own they edit or delete.
 */
export function moderationItem(version: VersionRow, reader: string | null, role: Role | null): MenuItem[] {
  if (version.deleted || reader === version.authorId || can(reader, role, "hide", { closed: false }) !== null) return [];
  return [version.hidden ? "restore" : "hide"];
}

/** Where an argument's wordings are now: itself, or the argument it was combined into, followed through later combines. */
export function finalArgument(view: ReaderView, argumentId: string): string {
  let id = argumentId;
  for (let hops = 0; hops < 50; hops++) {
    const next = view.rows.arguments[id]?.mergedInto;
    if (!next) return id;
    id = next;
  }
  return id;
}

/**
 * The wording an argument leads with: first on screen, else its first live wording, leaving out `except` (the wording
 * a sentence already names). Null when it has none to show.
 */
export function leadWording(view: ReaderView, argumentId: string, except?: string): string | null {
  const fits = (v: VersionRow | undefined): v is VersionRow => isLiveVersion(v) && v!.argumentId === argumentId && v!.id !== except;
  const any = (view.shown.versions[argumentId] ?? []).map((id) => view.rows.versions[id]).find(fits) ?? Object.values(view.rows.versions).find(fits);
  return any?.wording ?? null;
}

/**
 * A wording in quotes as a sentence's last words. The sentence's own full stop is left off when the wording ends
 * with one, so it never reads “…to study.”.
 */
export function endQuote(wording: string): string {
  const cut = short(wording);
  return `“${cut}”${endsSentence(cut) ? "" : "."}`;
}

/** Whether text already ends as a sentence does. */
export function endsSentence(text: string): boolean {
  return /[.?!…]$/.test(text);
}

/** As the prototype labels a row: its leading wording, cut at 60 characters. */
export function short(wording: string): string {
  return wording.length > 60 ? `${wording.slice(0, 57)}…` : wording;
}
