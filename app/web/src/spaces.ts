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
import type { BoardListing, SpaceCanvas, SpaceSummary } from "@steelman/shared";

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
