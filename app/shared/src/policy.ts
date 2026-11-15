// Who may do what (plans/architecture.md §7). The server asks `can()` before
// every read and write; the browser uses the same table only to fade controls.
//
// M1's roles, least to most: Voter (votes and assesses), Contributor (also
// writes), Owner (also decides who can get in). M2 adds Viewer below Voter
// and Editor between Contributor and Owner, and their rows in the matrix test.

export type Role = "voter" | "contributor" | "owner";

/** Each role, least to most. A role may do everything the ones before it may. */
export const ROLES: readonly Role[] = ["voter", "contributor", "owner"];

/** The roles a board's link can give. Owner never comes by the link. */
export const LINK_ROLES = ["voter", "contributor"] as const satisfies readonly Role[];

export type Action = "read" | "vote" | "assess" | "add" | "edit" | "delete" | "uncite" | "share";

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
  read: { least: "voter", openBoard: false, authorOnly: false },
  vote: { least: "voter", openBoard: true, authorOnly: false },
  assess: { least: "voter", openBoard: true, authorOnly: false },
  add: { least: "contributor", openBoard: true, authorOnly: false },
  edit: { least: "contributor", openBoard: true, authorOnly: true },
  delete: { least: "contributor", openBoard: true, authorOnly: true },
  /**
   * Taking a source off a wording (C-01): for the person who added the source
   * or the wording's author; the Owner may take any off (the builder, Nov 14).
   * The Editor, when M2 adds it, takes the Owner's place here.
   */
  uncite: { least: "contributor", openBoard: true, authorOnly: true, anyoneFrom: "owner" },
  /** Changing the board's general access and its link role. */
  share: { least: "owner", openBoard: true, authorOnly: false },
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
