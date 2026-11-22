// "Back to …" at the top of a screen that's a detour (M3a-1, M-13): the
// prototype's back link (sm-profile-back), worded as GOV.UK's Back link
// advises when there's more than one way in: say where it goes. A real link,
// so it works as links do (a new tab, without the page's script), in a Back
// landmark.

import { useState } from "react";
import { Icon } from "./icons.tsx";
import { placeBefore } from "./places.ts";
import type { Place } from "./places.ts";

/**
 * Where a screen's back link goes, read on the screen's first render, before
 * the screen notes itself as the last place (Your account does, for the
 * privacy page).
 */
export function usePlaceBefore(here: string): Place {
  return useState(() => placeBefore(here))[0];
}

export function BackLink({ here, place: given }: { here: string; place?: Place }) {
  const read = usePlaceBefore(here);
  const place = given ?? read;
  // A long name runs to "…" on one line (app.css), so what's seen is the start of what's read (WCAG 2.5.3).
  return (
    <nav className="sm-back" aria-label="Back">
      <a className="sm-text-button sm-profile-back cursor-interaction" href={place.path}>
        <Icon name="arrow-left" size={14} />
        <span>Back to {place.name}</span>
      </a>
    </nav>
  );
}
