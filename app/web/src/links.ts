// Links (M-06). A board's address is /b/<board>; a version's is
// /b/<board>/v/<version>. Anything else under /b/ can't be a board, so it is
// one that doesn't exist; anything outside /b/ is the home page, the list of
// your steelmen (E-03), except New steelman's sheet, at /new.
//
// Addresses are paths rather than the prototype's #b=…&v=…, so Google sends
// a person back to the very version they were sent (SignIn passes the path).
//
// A comment's address (M3b-13, D-01) is /b/<board>/c/<comment>, beside the
// version's, as GitHub and Google Docs put a comment in theirs. A board link
// has a `comment` key only when it is a comment's, so the board's and the
// version's links read as they always have.

const ID = "[A-Za-z0-9_-]+";
const BOARD = new RegExp(`^/b/(${ID})(?:/v/(${ID})|/c/(${ID}))?/?$`);

export type Link =
  | { kind: "home" }
  | { kind: "new" }
  | { kind: "account" }
  | { kind: "privacy" }
  | { kind: "board"; board: string; version: string | null; comment?: string }
  | { kind: "unknown" };

export function readLink(path: string): Link {
  if (/^\/account\/?$/.test(path)) return { kind: "account" };
  if (/^\/new\/?$/.test(path)) return { kind: "new" };
  if (/^\/privacy\/?$/.test(path)) return { kind: "privacy" };
  if (!path.startsWith("/b/")) return { kind: "home" };
  const match = BOARD.exec(path);
  if (!match) return { kind: "unknown" };
  return { kind: "board", board: match[1]!, version: match[2] ?? null, ...(match[3] ? { comment: match[3] } : {}) };
}

export const NEW_PATH = "/new";

export function boardPath(board: string): string {
  return `/b/${board}`;
}

export function versionPath(board: string, version: string): string {
  return `/b/${board}/v/${version}`;
}

/** A comment's address (M3b-13, D-01, M-06). */
export function commentPath(board: string, comment: string): string {
  return `/b/${board}/c/${comment}`;
}
