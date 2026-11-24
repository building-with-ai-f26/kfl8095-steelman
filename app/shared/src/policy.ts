// Who may do what (plans/architecture.md §7). The server asks `can()` before
// every read and write; the browser uses the same table only to fade controls.
//
// The roles, least to most: Viewer (reads), Voter (also votes and assesses),
// Contributor (also writes), Editor (also takes a source off anyone's
// wording, hides and restores wordings, M2-4, and adds, renames, and deletes
// options, M3a-2), Owner (also decides
// who can get in, changes the board's settings, and closes and reopens it,
// M3b). Editing and deleting a wording stay its author's, for an
// Editor too (Q28). Anyone who can read may comment, and only a comment's
// author deletes it (M3b-8).

export type Role = "viewer" | "voter" | "contributor" | "editor" | "owner";

/** Each role, least to most. A role may do everything the ones before it may. */
export const ROLES: readonly Role[] = ["viewer", "voter", "contributor", "editor", "owner"];

/** The roles a board's link can give. Editor and Owner never come by the link. */
export const LINK_ROLES = ["viewer", "voter", "contributor"] as const satisfies readonly Role[];

export type Action = "read" | "vote" | "assess" | "add" | "edit" | "delete" | "uncite" | "share" | "report" | "unreport" | "hide" | "structure" | "settings" | "close" | "comment" | "uncomment";

interface Rule {
  /** The least role that may do it. */
  least: Role;
  /** Refused once the board is closed. */
  openBoard: boolean;
  /** Only the author of the item may do it. */
  authorOnly: boolean;
  /** For an author-only action: the least role that may do it to anyone's item. */
  anyoneFrom?: Role;
}

export const POLICY: Record<Action, Rule> = {
  read: { least: "viewer", openBoard: false, authorOnly: false },
  vote: { least: "voter", openBoard: true, authorOnly: false },
  assess: { least: "voter", openBoard: true, authorOnly: false },
  add: { least: "contributor", openBoard: true, authorOnly: false },
  edit: { least: "contributor", openBoard: true, authorOnly: true },
  delete: { least: "contributor", openBoard: true, authorOnly: true },
  /**
   * Taking a source off a wording (C-01): for the person who added the source
   * or the wording's author; an Editor or the Owner may take any off (the
   * builder, Nov 14; the Editor since M2-1).
   */
  uncite: { least: "contributor", openBoard: true, authorOnly: true, anyoneFrom: "editor" },
  /** Reporting a wording, or withdrawing your report (J-01, M2-3), or reporting a source that can't be opened (C-02, M3a-3): anyone who can read. */
  report: { least: "viewer", openBoard: true, authorOnly: false },
  /**
   * Clearing a source's "can't be opened" mark (C-02, M3a-3): the person who
   * reported it withdraws it, as in the prototype; an Editor or the Owner
   * clears anyone's.
   */
  unreport: { least: "viewer", openBoard: true, authorOnly: true, anyoneFrom: "editor" },
  /** Hiding a wording with a reason, and restoring it (J-02, M2-4): an Editor's power, and the Owner's. */
  hide: { least: "editor", openBoard: true, authorOnly: false },
  /**
   * Changing the board's structure: adding, renaming, and deleting options
   * (M3a-2, A-07), and later combining and separating arguments. An Editor's
   * and the Owner's, as permissions.md's matrix has it; a Contributor will
   * suggest instead (A-11).
   */
  structure: { least: "editor", openBoard: true, authorOnly: false },
  /** Changing the board's general access, its link role, and each member's role (Share's people list, M2-2b). */
  share: { least: "owner", openBoard: true, authorOnly: false },
  /** Changing the board's settings, such as renaming its question (I-01, M3b-2): the Owner's, and not once the board is closed. */
  settings: { least: "owner", openBoard: true, authorOnly: false },
  /**
   * Closing the board now or at a set time, and reopening it (I-05, M3b-3): the Owner's. Allowed on a closed board,
   * since reopening acts on one.
   */
  close: { least: "owner", openBoard: false, authorOnly: false },
  /**
   * Adding a comment on the question, an option, or a wording (D-01, M3b-8), and later replying, resolving, and
   * reopening (M3b-9): anyone who can read, as permissions.md's matrix has it. Allowed on a closed board
   * (architecture §7).
   */
  comment: { least: "viewer", openBoard: false, authorOnly: false },
  /** Deleting your own comment (D-01, M3b-8): its author only. Allowed on a closed board, so a person can always take their own words back. */
  uncomment: { least: "viewer", openBoard: false, authorOnly: true },
};

/**
 * - signed_out: nobody is signed in.
 * - no_access: signed in, but with no role on this board.
 * - not_allowed: their role is below the one the action needs.
 */
export type Refusal = "signed_out" | "no_access" | "not_allowed" | "board_closed" | "not_author";

/**
 * @param person The account acting, or null when signed out.
 * @param role Their role on this board, or null when they have none.
 * @param board Whether the board is closed.
 * @param authors Who wrote the item acted on, for actions only its author may take: one person, or each who counts as its author.
 * @returns null when allowed, or why not.
 */
export function can(person: string | null, role: Role | null, action: Action, board: { closed: boolean }, authors?: string | readonly string[]): Refusal | null {
  const rule = POLICY[action];
  if (person === null) return "signed_out";
  if (role === null) return "no_access";
  if (ROLES.indexOf(role) < ROLES.indexOf(rule.least)) return "not_allowed";
  if (rule.openBoard && board.closed) return "board_closed";
  const isAuthor = typeof authors === "string" ? person === authors : (authors ?? []).includes(person);
  const forAnyone = rule.anyoneFrom !== undefined && ROLES.indexOf(role) >= ROLES.indexOf(rule.anyoneFrom);
  if (rule.authorOnly && !isAuthor && !forAnyone) return "not_author";
  return null;
}
