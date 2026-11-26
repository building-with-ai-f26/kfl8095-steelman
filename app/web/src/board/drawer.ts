// The drawer History, Settings, and Comments share (M3b-11): fixed to the
// window at every width, as Figma's and Notion's comment sidebars are, so a
// panel opened far down the board opens in view. Two small pieces of motion
// and placement the prototype leaves out, because its frame can't pin a panel.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { duration, reducedMotion } from "./motion.ts";

/**
 * Lets a panel fade out as it closes, rather than vanish, as it fades in when it opens: the drawers, Share, and the
 * menus share this exit (M3d-10, M-15), the prototype's entrance played back on --sm-leave. React takes the panel away
 * at once, so a copy of it stays for the fade: hidden from screen readers and from the cursor, and with no IDs or
 * keys left in it and no role on itself, so nothing finds it or presses it twice. With reduced motion there is no copy. `shown` is for a
 * panel its component draws only while it's open (Share); a component that is the panel (a drawer, a menu) leaves it
 * true. `mark` is the copy's class: the drawers' copies keep `sm-leaving` as well, as their tests know them.
 */
export function useExit(panel: RefObject<HTMLElement | null>, shown = true, mark = "sm-exit"): void {
  useLayoutEffect(() => {
    if (!shown) return;
    const node = panel.current;
    const parent = node?.parentElement;
    return () => {
      if (!node || !parent || reducedMotion()) return;
      const scroll = [...node.querySelectorAll<HTMLElement>("*")].map((element) => element.scrollTop);
      const ghost = node.cloneNode(true) as HTMLElement;
      // Only what could be found twice goes from inside it, so the copy keeps every look its rules give the panel
      // (a menu's red Delete, Share's narrow general-access row); the copy is inert and hidden from screen readers, so
      // nothing in it can be pressed or read out. The copy itself is no longer a dialog or a menu.
      for (const element of [ghost, ...ghost.querySelectorAll("*")]) {
        for (const name of ["id", "for", "name", "data-key"]) element.removeAttribute(name);
      }
      for (const name of ["role", "aria-modal", "aria-labelledby", "data-action"]) ghost.removeAttribute(name);
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.classList.add("sm-exit", mark);
      const top = node.scrollTop;
      // Once React has taken the panel away. A panel still on the page wasn't closed: development's StrictMode only
      // tries its effects twice.
      queueMicrotask(() => {
        if (node.isConnected) return;
        parent.appendChild(ghost);
        ghost.scrollTop = top;
        ghost.querySelectorAll<HTMLElement>("*").forEach((element, at) => {
          if (scroll[at]) element.scrollTop = scroll[at]!;
        });
        const remove = () => ghost.remove();
        ghost.addEventListener("animationend", remove, { once: true });
        ghost.addEventListener("animationcancel", remove, { once: true });
        // How long a closing panel takes to fade out: --sm-leave, a little less than --sm-medium, so a new one isn't
        // kept waiting.
        window.setTimeout(remove, duration("leave", parent) + 40);
      });
    };
  }, [panel, shown, mark]);
}

/** The drawers' exit (M3b-11): History, Settings, and Comments. */
export function useDrawerExit(drawer: RefObject<HTMLElement | null>): void {
  useExit(drawer, true, "sm-leaving");
}

/**
 * Keeps a bar that is going away (the problem bar, the Update pill) on screen while it fades out, with what it last
 * said, rather than through a copy: each is found by its own class, and is one element. Returns what to draw, whether
 * it's leaving, and what to call when its exit ends. With reduced motion it goes at once.
 */
export function useLinger<T>(value: T | null, same: (a: T, b: T) => boolean = Object.is): { shown: T | null; leaving: boolean; left(): void } {
  const [kept, setKept] = useState<T | null>(value);
  const [leaving, setLeaving] = useState(false);
  // Set while drawing, as React's guide on keeping what an earlier render had asks, so the bar never draws a frame
  // without it.
  if (value !== null && (kept === null || !same(value, kept) || leaving)) {
    setKept(value);
    setLeaving(false);
  } else if (value === null && kept !== null && !leaving) {
    if (reducedMotion()) setKept(null);
    else setLeaving(true);
  }
  const left = useCallback(() => {
    setLeaving(false);
    setKept(null);
  }, []);
  // In case its animation never ends (it was taken off the page first): --sm-leave and a little more.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(left, duration("leave") + 40);
    return () => window.clearTimeout(timer);
  }, [leaving, left]);
  return { shown: value ?? kept, leaving: value === null && leaving, left };
}

/**
 * Keeps an open drawer's top just below the site's header while that header is on screen, and 12 px from the window's
 * top once it has scrolled away, by setting --sm-drawer-top on the board's scene.
 */
export function useDrawerTop(scene: RefObject<HTMLElement | null>, open: boolean): void {
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const header = document.querySelector(".sm-site")?.getBoundingClientRect().bottom ?? 0;
      scene.current?.style.setProperty("--sm-drawer-top", `${Math.max(12, Math.round(header) + 12)}px`);
    };
    const later = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
    };
  }, [scene, open]);
}
