// The sign-in screens' page: M3d-21's contour map on stone, and the form in a
// raised card. With `tour`, as the sign-in steps and Choose a username have
// it, the map moves through the six spaces' tints and pans slowly (M3d-25,
// tintTour.ts), so a new person sees what spaces look like before they sign
// in. Choose a username takes up the tour where the code step left it. A problem page uses the card too and stays still on stone, because a
// problem page shouldn't feel decorative: a link to a board that doesn't exist
// (NotFound.tsx), one to a board this account may not open (NoAccess.tsx), a
// profile that can't be shown, and Steelman being out of reach.

import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { SpaceCanvas } from "@steelman/shared";
import { TINT_TOUR, startTintTour } from "./tintTour.ts";

export function AuthCard({ children, label = "Sign in", tour = false }: { children: ReactNode; label?: string; tour?: boolean }) {
  return (
    <main className="sm-landing" data-canvas="stone" data-tour={tour ? "" : undefined}>
      {tour ? <TintMap /> : null}
      <div className="sm-landing-inner">
        <section className="sm-rail-card sm-landing-auth" aria-label={label}>
          {children}
        </section>
      </div>
    </main>
  );
}

/** The touring map behind the card: a layer for each tint, the contours that pan above them, and the still light on top. */
function TintMap() {
  const map = useRef<HTMLDivElement>(null);
  const texture = useRef<HTMLDivElement>(null);
  const layers = useRef(new Map<SpaceCanvas, HTMLDivElement>());
  // Before the browser paints, so a map that replaces another (Choose a username after the code step) takes up the old
  // one's place in the tour without a frame of stone between them (tintTour.ts).
  useLayoutEffect(() => {
    if (!map.current || !texture.current) return;
    return startTintTour({ map: map.current, texture: texture.current, layers: layers.current });
  }, []);
  return (
    <div className="sm-tint-map" aria-hidden="true" ref={map}>
      <div className="sm-tint-layers">
        {TINT_TOUR.map((name) => (
          <div
            key={name}
            className="sm-tint-layer"
            data-tint-layer={name}
            ref={(element) => {
              if (element) layers.current.set(name, element);
              else layers.current.delete(name);
            }}
          />
        ))}
      </div>
      <div className="sm-tint-texture" ref={texture} />
      <div className="sm-tint-light" />
    </div>
  );
}
