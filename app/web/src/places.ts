// Where "Back to …" goes (M3a-1, M-13). The screens worth going back to (the
// list, a board, Your account) note themselves as this tab's last place as
// they're left. A screen with a back link takes the last place when it
// opens, and keeps it for itself, so a reload still knows the way. Kept in
// sessionStorage: one tab's trail, gone when the tab closes; opened anew, the
// way back is Your steelmen.

export interface Place {
  path: string;
  name: string;
}

export const HOME_PLACE: Place = { path: "/", name: "Your steelmen" };
const LAST = "steelman-place";
const backKey = (here: string) => `steelman-back:${here}`;

function read(key: string): Place | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (value && typeof value === "object" && typeof (value as Place).path === "string" && typeof (value as Place).name === "string") {
      // Only a path on this site. Parsed as the browser would follow it, so "//elsewhere", "/\\elsewhere", or a
      // scheme can't lead off the site.
      const url = new URL((value as Place).path, window.location.origin);
      if (url.origin === window.location.origin) return { path: url.pathname, name: (value as Place).name };
    }
  } catch {
    // Storage blocked or unreadable: no trail.
  }
  return null;
}

function write(key: string, place: Place): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(place));
  } catch {
    // Storage blocked: the way back is Your steelmen.
  }
}

/** Forgets this tab's trail, when the person in it changes: signing out, deleting the account, or switching test account. */
export function forgetPlaces(): void {
  try {
    for (const key of Object.keys(sessionStorage)) if (key === LAST || key.startsWith("steelman-back:")) sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: there's no trail to forget.
  }
}

/** Notes this screen as the tab's last place. `place()` is asked as the page is left, so a board gives the version then open. */
export function rememberPlace(place: () => Place): () => void {
  const note = () => write(LAST, place());
  note();
  window.addEventListener("pagehide", note);
  return () => {
    note();
    window.removeEventListener("pagehide", note);
  };
}

/** Where this screen's back link goes: the last place before it, kept for it across reloads; else Your steelmen. */
export function placeBefore(here: string): Place {
  const last = read(LAST);
  if (last && last.path !== here) write(backKey(here), last);
  return read(backKey(here)) ?? HOME_PLACE;
}
