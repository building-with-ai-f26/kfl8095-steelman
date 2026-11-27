// The pages change with a short crossfade and rise (M3d-11, M-15). Home, New
// steelman, Your account, the privacy page, a profile (M3d-16), and a space's
// page, its settings, and New space (M3d-19) still
// reach one another by loading the page, as before, so the way back (M-13),
// the leave prompt (Q20), and analytics' page views work as they did. The
// browser's own view transition between the two pages draws the new page
// rising over a picture of the old one (app.css): a picture, so nothing of
// the old page stays in the document to be found, read, or pressed twice.
// The header stands still.
//
// A link to or from a board plays no page transition: a board opens from the
// list inside the page (M3d-9), and a deep link, a reload, or a board's own
// links play nothing, as before. Typing an address, a reload, and a link with
// a modifier key play nothing either, as the browser decides. Under reduced
// motion nothing plays. Browsers without cross-document view transitions
// (Firefox, for now) change the page at once, as before.
//
// The transition copies how Material Design 3 describes a fade through
// between pages that aren't related, and how Chrome's guide to view
// transitions draws a crossfade between pages (from memory).

import { readLink } from "./links.ts";
import { reducedMotion } from "./board/motion.ts";

/** The pages that change with the page transition: every page but a board's and the not-found page. */
export function changesWithTransition(path: string): boolean {
  const kind = readLink(path).kind;
  return kind === "home" || kind === "new" || kind === "account" || kind === "privacy" || kind === "profile" || kind === "space-settings" || kind === "new-space";
}

/**
 * Lets the browser's view transition play only between two of those pages. The page being left decides, as the
 * browser asks it just before it takes the picture of it (`pageswap`), because the page arriving may not have run any
 * script before it is drawn.
 */
export function watchPageChanges(): () => void {
  const leaving = (event: PageSwapEvent) => {
    if (!event.viewTransition) return;
    const to = event.activation?.entry?.url ?? null;
    const between = to !== null && changesWithTransition(window.location.pathname) && changesWithTransition(new URL(to).pathname);
    if (!between || reducedMotion()) event.viewTransition.skipTransition();
  };
  window.addEventListener("pageswap", leaving);
  return () => window.removeEventListener("pageswap", leaving);
}

/**
 * Whether this page is arriving through the page transition now, so that a panel drawn with it (New steelman's sheet)
 * leaves its own entrance out and the page arrives once. Asked once, as the panel is first drawn: a panel drawn after
 * the transition has ended plays its entrance as before.
 */
export function arrivingWithTransition(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.documentElement.matches(":active-view-transition");
  } catch {
    // A browser that doesn't know the selector has no view transitions either.
    return false;
  }
}
