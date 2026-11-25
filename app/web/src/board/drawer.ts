// The drawer History, Settings, and Comments share (M3b-11): fixed to the
// window at every width, as Figma's and Notion's comment sidebars are, so a
// panel opened far down the board opens in view. Two small pieces of motion
// and placement the prototype leaves out, because its frame can't pin a panel.

import { useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";
import { duration, reducedMotion } from "./motion.ts";

/**
 * Lets a drawer fade out as it closes, rather than vanish, as it fades in when it opens. React takes the drawer away
 * at once, so a copy of it stays for the fade: hidden from screen readers and from the cursor, with no IDs, so nothing
 * finds it twice. With reduced motion there is no copy.
 */
export function useDrawerExit(drawer: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const node = drawer.current;
    const parent = node?.parentElement;
    return () => {
      if (!node || !parent || reducedMotion()) return;
      const scroll = [...node.querySelectorAll<HTMLElement>("*")].map((element) => element.scrollTop);
      const ghost = node.cloneNode(true) as HTMLElement;
      for (const element of [ghost, ...ghost.querySelectorAll("[id]")]) element.removeAttribute("id");
      for (const name of ["role", "aria-modal", "aria-labelledby"]) ghost.removeAttribute(name);
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.classList.add("sm-leaving");
      const top = node.scrollTop;
      // Once React has taken the drawer away. A drawer still on the page wasn't closed: development's StrictMode only
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
        // How long a closing drawer takes to fade out: --sm-leave, a little less than --sm-medium, so a new one isn't kept
        // waiting.
        window.setTimeout(remove, duration("leave", parent) + 40);
      });
    };
  }, [drawer]);
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
