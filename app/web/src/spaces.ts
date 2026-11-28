// Spaces on screen (M3d-19; G-01, G-02, G-05, E-08), as pure functions over
// the list and the spaces the page already holds: which boards are in a
// space, how many each space has for the sidebar's count, and the rail's
// "Needs your help". The list names a board's space by its ID only, and only
// to its members (server/src/list.ts); its name and canvas come from the
// reader's own spaces (GET /api/spaces), so nothing here can name a space
// the reader isn't in.
//
// A space's count is the boards the reader can open there: those shared with
// everyone in it, and their own. Slack's sidebar counts what's new to you,
// not every message (from memory); this counts what's yours to open.

import { can, canInSpace, postingIn } from "@steelman/shared";
import type { BoardListing, FoundSpace, MakePublicCounts, SpaceCanvas, SpaceSummary } from "@steelman/shared";

/** The prototype's names for its canvases (CANVASES in docs/prototype/source/steelman-refined.html). */
const CANVAS_LABELS: Record<SpaceCanvas, string> = { stone: "Warm stone", cool: "Cool gray", sand: "Sand", slate: "Slate", sage: "Sage", lilac: "Lilac" };

/**
 * The spaces New steelman's Space menu offers (M3d-34): every private space you're in, and a public one only when you
 * are one of its Admins or its Owner, as the service allows. GitHub leaves an organization out of a member's Owner menu
 * on "Create a new repository" when only its owners may create them (from memory), so the menu leaves it out too.
 */
export function spacesToPostIn(spaces: readonly SpaceSummary[]): SpaceSummary[] {
  return spaces.filter((each) => canInSpace("reader", each.role, postingIn(each.visibility)) === null);
}

export function canvasLabel(canvas: SpaceCanvas): string {
  return CANVAS_LABELS[canvas];
}

/** The boards in a space, in the list's order; with null, all of them. */
export function boardsIn(boards: readonly BoardListing[], space: string | null): BoardListing[] {
  return space === null ? [...boards] : boards.filter((board) => board.space === space);
}

/** How many boards each space has in the list, by the space's ID. */
export function countsBySpace(boards: readonly BoardListing[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const board of boards) if (board.space) counts.set(board.space, (counts.get(board.space) ?? 0) + 1);
  return counts;
}

/** How few arguments a board's thinnest option has. */
const fewest = (board: BoardListing) => Math.min(...board.options.map((option) => option.arguments));

/**
 * The rail's "Needs your help" (E-08), as the prototype's rail() picks them: the space's boards with an option under
 * two arguments, the thinnest first, at most four. A closed board is left out, since no one may add to it, and so is
 * a board the reader may only vote on or read, since it asks for an argument they can't add.
 */
export function needsYourHelp(boards: readonly BoardListing[], space: string): BoardListing[] {
  return boardsIn(boards, space)
    .filter((board) => !board.closing?.closed && board.options.some((option) => option.arguments < 2))
    .filter((board) => can("reader", board.role, "add", { closed: false }) === null)
    .map((board, at) => ({ board, at }))
    .sort((a, b) => fewest(a.board) - fewest(b.board) || a.at - b.at)
    .slice(0, 4)
    .map(({ board }) => board);
}

/**
 * What Needs your help says when it lists nothing: that every option in the space has two arguments, only when that's
 * so; otherwise, that the thin ones are closed or ask for arguments this reader can't add.
 */
export function helpEmpty(boards: readonly BoardListing[], space: string): string {
  const thin = boardsIn(boards, space).some((board) => board.options.some((option) => option.arguments < 2));
  return thin ? "No steelman here needs an argument from you right now." : "Every option here has at least two arguments.";
}

/**
 * The line under a board in Needs your help, as a full sentence (AGENTS.md rule 13), where the prototype's said
 * "POD 6 · Yes · 1 argument": the one thin option and how many it has, or how many options are thin.
 */
export function helpSentence(board: BoardListing): string {
  const thin = board.options.filter((option) => option.arguments < 2);
  if (thin.length === 1) return thin[0]!.arguments === 1 ? `${thin[0]!.name} has one argument.` : `${thin[0]!.name} has no arguments yet.`;
  return `${thin.length} options have fewer than two arguments.`;
}

/** The member count on the space's card, as the prototype writes it: "1 member", "1,200 members". */
export function membersLabel(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "member" : "members"}`;
}

// Public spaces (M3d-20, G-07): the words for a space's visibility, Find
// spaces' search, Make public's question, and what is read out after a join,
// a leave, or a change of visibility. Each is a full sentence (rule 13).

/** What each visibility lets people do, under its choice in Space settings. */
export const VISIBILITY_SENTENCE = {
  private: "Only members can find and open this space.",
  public: "Anyone with a Steelman account can find this space and join it.",
} as const;

/** The space card's fact: a word the web doesn't know reads as private, which says the least. */
export function visibilityLabel(visibility: string): string {
  return visibility === "public" ? "Public space" : "Private space";
}

/** Whether a public space matches what was typed in Search spaces: by name or about text, capitals aside. */
export function matchesSpace(space: Pick<FoundSpace, "name" | "about">, query: string): boolean {
  const words = query.trim().toLowerCase();
  if (!words) return true;
  return space.name.toLowerCase().includes(words) || space.about.toLowerCase().includes(words);
}

/** What is read out after the search changes. */
export function spaceSearchSentence(found: number): string {
  if (found === 0) return "No spaces match that search.";
  return found === 1 ? "1 space matches that search." : `${found} spaces match that search.`;
}

/** Find spaces with nothing to list. */
export const findSpacesEmpty = "There are no public spaces you haven’t joined yet.";

/** What a Member of a public space reads where the member list would be (security review F6). */
export const peopleHiddenSentence = "Only the space’s Admins and its Owner can see who is in a public space.";

export const joinedSentence = (name: string): string => `You joined ${name}.`;
export const leftSentence = (name: string): string => `You left ${name}.`;

/** What is read out once the visibility is saved. */
export function visibilitySaved(name: string, visibility: "private" | "public"): string {
  return visibility === "public" ? `${name} is now public.` : `${name} is now private, and everyone who joined stays in it.`;
}

/**
 * Make public's question (G-07, M3d-20), as GitHub's Change visibility lists the effects before "Make this repository
 * public" (checked live on Nov 28): who can then join, how many members the space has, which steelmen open, with
 * their history and comments, and, when there are any, which steelmen stop being shared.
 */
export function makePublicQuestion(name: string, counts: MakePublicCounts): string[] {
  const members = `${counts.members.toLocaleString("en-US")} ${counts.members === 1 ? "member" : "members"}`;
  const opens =
    counts.shared === 0
      ? "any steelman you share with everyone in the space, with its history and comments"
      : counts.shared === 1
        ? "its 1 steelman that is shared with everyone in the space, with its history and comments"
        : `its ${counts.shared} steelmen that are shared with everyone in the space, with their history and comments`;
  const sentences = [`Anyone with a Steelman account can then join ${name}, which has ${members}, and open ${opens}.`];
  if (counts.unshared === 1) sentences.push("The 1 steelman that another member owns stops being shared with the space, until its Owner shares it again.");
  if (counts.unshared > 1) sentences.push(`The ${counts.unshared} steelmen that other members own stop being shared with the space, until their Owners share them again.`);
  return sentences;
}
