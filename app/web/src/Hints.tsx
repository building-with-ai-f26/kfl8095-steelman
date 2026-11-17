// The hint box: what a control's `data-tooltip` says, in a small dark box
// above it, as the prototype's page shows it (docs/prototype/index.html).
// GitHub's Primer and the W3C's tooltip pattern behave the same way:
//
// - hover: opens after a moment; once one has just closed, the next opens at once;
// - keyboard focus: opens at once;
// - closes when the pointer or focus leaves, on Escape, and when its control leaves the
//   page or, scrolled, the window; while the page scrolls, it follows its control;
// - a touch: a tap shows the hint until the next tap.
//
// It never takes focus or the pointer. It's hidden from screen readers:
// everything it says is already the control's name (aria-label) or its
// description (aria-describedby), so reading it again would only repeat it.
// Mounted once, for the whole app, listening on the document.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const HOVER_MS = 700;
/** After a hint closes, how long the next opens without waiting. */
const SKIP_MS = 300;
/** Space between the box, its control, and the window's edges. */
const GAP = 5;

interface Shown {
  trigger: HTMLElement;
  text: string;
}

function triggerOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;
}

function textOf(trigger: HTMLElement): string {
  return trigger.getAttribute("data-tooltip")?.trim() ?? "";
}

export function Hints() {
  const [shown, setShown] = useState<Shown | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let shownText = "";
    let waiting: number | null = null;
    /** Set for a moment after a hint closes, so the next opens without waiting. */
    let skipping: number | null = null;
    let pinnedByTouch = false;
    let lastPointerWasTouch = false;

    const stopWaiting = () => {
      if (waiting !== null) window.clearTimeout(waiting);
      waiting = null;
    };
    const open = (trigger: HTMLElement) => {
      stopWaiting();
      const text = textOf(trigger);
      if (text === "" || !trigger.isConnected) return;
      current = trigger;
      shownText = text;
      setShown({ trigger, text });
    };
    const close = () => {
      stopWaiting();
      pinnedByTouch = false;
      if (current === null) return;
      current = null;
      if (skipping !== null) window.clearTimeout(skipping);
      skipping = window.setTimeout(() => (skipping = null), SKIP_MS);
      setShown(null);
    };
    const ask = (trigger: HTMLElement, now: boolean) => {
      if (trigger === current || textOf(trigger) === "") return;
      stopWaiting();
      if (now || current !== null || skipping !== null) open(trigger);
      else waiting = window.setTimeout(() => open(trigger), HOVER_MS);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const trigger = triggerOf(event.target);
      if (trigger && !trigger.contains(event.relatedTarget as Node | null)) ask(trigger, false);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (pinnedByTouch) return;
      const trigger = triggerOf(event.target);
      if (trigger && !trigger.contains(event.relatedTarget as Node | null)) close();
    };
    const onPointerDown = (event: PointerEvent) => {
      lastPointerWasTouch = event.pointerType === "touch";
    };
    // A touch that turns into a scroll is no tap.
    const onPointerCancel = () => {
      lastPointerWasTouch = false;
    };
    // A tap shows the hint and keeps it until the next tap, anywhere.
    const onClick = (event: MouseEvent) => {
      const touch = lastPointerWasTouch;
      lastPointerWasTouch = false;
      // detail is 0 for a click made with the keyboard.
      if (!touch || event.detail === 0) return;
      const trigger = triggerOf(event.target);
      if (pinnedByTouch || trigger === null) {
        close();
        if (trigger === null || trigger === current) return;
      }
      open(trigger);
      pinnedByTouch = current === trigger;
    };
    const onFocusIn = (event: FocusEvent) => {
      const trigger = triggerOf(event.target);
      if (trigger?.matches(":focus-visible")) ask(trigger, true);
    };
    const onFocusOut = (event: FocusEvent) => {
      const trigger = triggerOf(event.target);
      if (trigger && trigger === current) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // Scrolling moves the control, so the box follows it, and goes once the control has left the window.
    // Moving to a control, by pointer or by Tab, often scrolls the page just after it arrives.
    const onScroll = () => {
      if (current === null) return;
      const near = current.getBoundingClientRect();
      if (near.bottom < 0 || near.top > window.innerHeight) close();
      else setShown((shown) => (shown ? { ...shown } : shown));
    };
    // A control can leave the page (a draft replaces its button) without the pointer or focus leaving it
    // first, and a control's hint can change while it shows (a role changes, a count goes up).
    const watch = new MutationObserver(() => {
      if (current === null) return;
      if (!current.isConnected || textOf(current) === "") close();
      else if (textOf(current) !== shownText) {
        shownText = textOf(current);
        setShown({ trigger: current, text: shownText });
      }
    });
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tooltip"] });

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      stopWaiting();
      if (skipping !== null) window.clearTimeout(skipping);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      watch.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  // Above the control, centred; below it if there's no room above; never past the window's sides.
  useLayoutEffect(() => {
    const element = box.current;
    if (!shown || !element) return;
    const near = shown.trigger.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const above = near.top - GAP - height;
    const top = above >= GAP ? above : near.bottom + GAP;
    const left = Math.min(Math.max(GAP, near.left + near.width / 2 - width / 2), window.innerWidth - GAP - width);
    element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    element.style.visibility = "visible";
  }, [shown]);

  if (!shown) return null;
  return createPortal(
    <div ref={box} className="sm-hint" aria-hidden="true" style={{ visibility: "hidden" }}>
      {shown.text}
    </div>,
    document.body,
  );
}
