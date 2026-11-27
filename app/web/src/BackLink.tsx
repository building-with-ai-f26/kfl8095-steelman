// The way back from a screen that's a detour (M3a-1, M-13): Material 3's top
// app bar navigation icon, as Google Account's own screens show it, an
// arrow-left icon button at the left of the screen's title (the builder, Nov
// 22: "Follow behavior of like Google screens"). Its name says where it goes,
// as GOV.UK's Back link advises when there's more than one way in, and so does
// its tooltip. A real link, so it works as links do (a new tab, without the
// page's script), in a Back landmark.

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
  const name = `Back to ${place.name}`;
  // A way back to a profile has a person's username in its address, so screen replays don't record it (M-08).
  const named = place.path.startsWith("/u/");
  // The name is the link's own text, kept for screen readers; what's drawn is the arrow.
  return (
    <nav className={named ? "sm-back ph-no-capture" : "sm-back"} aria-label="Back">
      <a className="sm-back-button cursor-interaction" href={place.path} data-tooltip={name}>
        <Icon name="arrow-left" size={20} />
        <span className="sm-sr">{name}</span>
      </a>
    </nav>
  );
}

/** A screen's title with its way back at its left, as Material's top app bar sets them. */
export function TitleBar({ here, place, children }: { here: string; place?: Place; children: React.ReactNode }) {
  return (
    <div className="sm-titlebar">
      <BackLink here={here} place={place} />
      {children}
    </div>
  );
}
