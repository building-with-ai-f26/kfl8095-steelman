// Links (M-06). A board's address is /b/<board>; a version's is
// /b/<board>/v/<version>. Anything else under /b/ can't be a board, so it is
// one that doesn't exist; anything outside /b/ is the home page.
//
// Addresses are paths rather than the prototype's #b=…&v=…, so Google sends
// a person back to the very version they were sent (SignIn passes the path).

const ID = "[A-Za-z0-9_-]+";
const BOARD = new RegExp(`^/b/(${ID})(?:/v/(${ID}))?/?$`);

export type Link = { kind: "home" } | { kind: "account" } | { kind: "board"; board: string; version: string | null } | { kind: "unknown" };

export function readLink(path: string): Link {
  if (/^\/account\/?$/.test(path)) return { kind: "account" };
  if (!path.startsWith("/b/")) return { kind: "home" };
  const match = BOARD.exec(path);
  return match ? { kind: "board", board: match[1]!, version: match[2] ?? null } : { kind: "unknown" };
}

export function boardPath(board: string): string {
  return `/b/${board}`;
}

export function versionPath(board: string, version: string): string {
  return `/b/${board}/v/${version}`;
}
