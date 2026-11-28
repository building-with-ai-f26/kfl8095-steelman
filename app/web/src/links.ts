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
//
// A person's profile (M3d-16, L-03) is /u/<username>, as GitHub's is
// github.com/<username> and Wikipedia's is User:<username>. Its name can have
// a dot or a hyphen, as the demo's and the tests' people do; anything else
// under /u/ names no one.
//
// A space's page (M3d-19, G-01, G-05) is /s/<space ID>: Home's list,
// showing only that space's boards under its card, so it reads as home with
// the space named. Its settings are /s/<space ID>/settings, and New space is
// /spaces/new, as GitHub's organization page is github.com/<organization>
// and its settings sit under it, and Slack's channel links carry the
// channel's ID, not its name (from memory). An address carries a space's ID,
// never its name, so no name reaches analytics' page views. Anything else
// under /s/ names no space.
//
// Find spaces (M3d-20, G-07) is /spaces/find, beside New space; /spaces
// itself stays Home, as it always read.

const ID = "[A-Za-z0-9_-]+";
const BOARD = new RegExp(`^/b/(${ID})(?:/v/(${ID})|/c/(${ID}))?/?$`);
const PROFILE = /^\/u\/([A-Za-z0-9_.-]{1,40})\/?$/;
/** A space's ID is an item ID: 20 characters (shared/src/ids.ts). */
const SPACE = /^\/s\/([A-Za-z0-9_-]{20})(\/settings)?\/?$/;
/** The name credited with what a deleted account wrote (M-07), which has no profile. */
const DELETED_ACCOUNT = "deleted_account";

export type Link =
  /** `space` when the list shows only one space's boards (M3d-19). */
  | { kind: "home"; space?: string }
  | { kind: "space-settings"; space: string }
  | { kind: "new-space" }
  | { kind: "find-spaces" }
  | { kind: "new" }
  | { kind: "account" }
  | { kind: "privacy" }
  | { kind: "board"; board: string; version: string | null; comment?: string }
  /** `username` is null when the address can't name anyone. */
  | { kind: "profile"; username: string | null }
  | { kind: "unknown" };

export function readLink(path: string): Link {
  if (/^\/account\/?$/.test(path)) return { kind: "account" };
  if (/^\/new\/?$/.test(path)) return { kind: "new" };
  if (/^\/privacy\/?$/.test(path)) return { kind: "privacy" };
  if (path === "/u" || path.startsWith("/u/")) return { kind: "profile", username: PROFILE.exec(path)?.[1] ?? null };
  if (/^\/spaces\/new\/?$/.test(path)) return { kind: "new-space" };
  if (/^\/spaces\/find\/?$/.test(path)) return { kind: "find-spaces" };
  if (path === "/s" || path.startsWith("/s/")) {
    const space = SPACE.exec(path);
    if (!space) return { kind: "unknown" };
    return space[2] ? { kind: "space-settings", space: space[1]! } : { kind: "home", space: space[1]! };
  }
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

/** A person's profile (M3d-16, L-03). */
export function profilePath(username: string): string {
  return `/u/${encodeURIComponent(username)}`;
}

/** Whether a name shown on a board links to a profile: not a missing name, and not the deleted stand-in. */
export function hasProfile(name: string | null | undefined): name is string {
  return typeof name === "string" && name !== "" && name !== DELETED_ACCOUNT;
}

/** A space's page: Home's list, showing only its boards (M3d-19, G-01). */
export function spacePath(space: string): string {
  return `/s/${space}`;
}

/** A space's settings, for its Owner and Admins (M3d-19, G-02). */
export function spaceSettingsPath(space: string): string {
  return `/s/${space}/settings`;
}

export const NEW_SPACE_PATH = "/spaces/new";

/** Find spaces: the public spaces you haven't joined (M3d-20, G-07). */
export const FIND_SPACES_PATH = "/spaces/find";
