// Who may do what (plans/architecture.md §7). The server asks `can()` before
// every write; the browser uses the same table only to fade controls.
//
// M0 has no sign-in and no roles yet, only the conditions it can express:
// whether someone is signed in (a test user, for now), whether the board is
// open, and whether they wrote the thing. M1 adds the roles (Owner, Voter,
// Contributor…) and their matrix test.

export type Action = "read" | "vote" | "assess" | "add" | "edit" | "delete";

interface Rule {
  signedIn: boolean;
  openBoard: boolean;
  authorOnly: boolean;
}

export const POLICY: Record<Action, Rule> = {
  read: { signedIn: false, openBoard: false, authorOnly: false },
  vote: { signedIn: true, openBoard: true, authorOnly: false },
  assess: { signedIn: true, openBoard: true, authorOnly: false },
  add: { signedIn: true, openBoard: true, authorOnly: false },
  edit: { signedIn: true, openBoard: true, authorOnly: true },
  delete: { signedIn: true, openBoard: true, authorOnly: true },
};

export type Refusal = "signed_out" | "board_closed" | "not_author";

/**
 * @param person The account acting, or null when signed out.
 * @param board Whether the board is closed.
 * @param authorId Who wrote the item acted on, for actions only its author may take.
 * @returns null when allowed, or why not.
 */
export function can(person: string | null, action: Action, board: { closed: boolean }, authorId?: string): Refusal | null {
  const rule = POLICY[action];
  if (rule.signedIn && person === null) return "signed_out";
  if (rule.openBoard && board.closed) return "board_closed";
  if (rule.authorOnly && person !== authorId) return "not_author";
  return null;
}
