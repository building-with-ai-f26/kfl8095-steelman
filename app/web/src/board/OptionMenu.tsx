// An option header's ⋯ menu (M3a-2, A-07), as the prototype's: Rename, and
// Delete, which says why only when it can't be used ("Only an empty option
// can be deleted."). The menu hangs from the option's own header, so its
// items don't repeat "option", as Notion's and Trello's column menus don't.
// It hangs from the board's main region and moves and closes like a version's
// ⋯ menu (Card.tsx): the arrow keys, Home, and End move between items; Escape
// closes it and puts the cursor back on ⋯; Tab, a click elsewhere, or a scroll
// of something holding ⋯ closes it.
//
// Hiding a column (M3d-6, A-08) adds the prototype's "Hide this column" and
// "Show only this column" after Rename and Delete, so the menu still opens on
// Rename. A role below Editor gets the two items alone, in the same menu
// named "Column view", from a button of its own. Neither is offered at 640 px
// and narrower, where the board shows one side at a time.

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { useExit } from "./drawer.ts";
import { createPortal } from "react-dom";
import { Icon } from "../icons.tsx";

/** Rename and Delete, for an Editor or the Owner (M3a-2). */
export interface StructureItems {
  /** Why Delete can't be used, or null when it can. */
  deleteBlocked: string | null;
  onRename(): void;
  onDelete(): void;
}

/** Hide this column and Show only this column (M3d-6), for every role wider than 640 px. */
export interface ColumnViewItems {
  /** Whether this is the only column showing: then Hide says why it can't be used, and Show only isn't offered. */
  onlyOne: boolean;
  onHide(): void;
  onSolo(): void;
}

interface OptionMenuProps {
  trigger: RefObject<HTMLButtonElement | null>;
  /** Rename and Delete; without them the menu is Column view. */
  structure: StructureItems | null;
  columnView: ColumnViewItems | null;
  onClose(): void;
}

export function OptionMenu({ trigger, structure, columnView, onClose }: OptionMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  // It fades out as it closes, as every panel and menu does (M3d-10).
  useExit(menu);
  const root = document.getElementById("sm-content");

  useLayoutEffect(() => {
    const element = menu.current;
    const button = trigger.current;
    if (!element || !button) return;
    const rootBox = (element.offsetParent ?? document.body).getBoundingClientRect();
    const box = button.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.round(box.right - rootBox.left - element.offsetWidth))}px`;
    element.style.top = `${Math.round(box.bottom - rootBox.top + 4)}px`;
    element.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [trigger]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const here = document.activeElement;
      if (!menu.current?.contains(here) && trigger.current !== here) return;
      if (event.key === "Escape" || event.key === "Tab") {
        onClose();
        trigger.current?.focus();
        return;
      }
      const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const at = all.indexOf(here as HTMLElement);
      const to = at < 0 ? undefined : { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[event.key];
      if (to !== undefined) {
        event.preventDefault();
        all[(to + all.length) % all.length]?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) onClose();
    };
    // A scroll of anything holding ⋯, other than the page itself, moves ⋯ out from under the menu.
    const onScroll = (event: Event) => {
      const scrolled = event.target;
      if (scrolled instanceof Element && scrolled.contains(trigger.current)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [trigger, onClose]);

  if (!root) return null;
  return createPortal(
    <div ref={menu} className="sm-menu" role="menu" aria-label={structure ? "Option settings" : "Column view"}>
      {structure ? (
        <>
          <button type="button" role="menuitem" className="sm-menu-item cursor-interaction" onClick={structure.onRename}>
            <Icon name="pencil" />
            <span>Rename</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="sm-menu-item cursor-interaction"
            data-action="delete-card"
            aria-disabled={structure.deleteBlocked ? true : undefined}
            onClick={() => {
              if (!structure.deleteBlocked) structure.onDelete();
            }}
          >
            <Icon name="trash-2" />
            <span>
              Delete
              {structure.deleteBlocked ? <small>{structure.deleteBlocked}</small> : null}
            </span>
          </button>
        </>
      ) : null}
      {/* Which columns a reader hides stays in this browser, so PostHog's autocapture leaves these two out. */}
      {columnView ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="sm-menu-item cursor-interaction ph-no-capture"
            data-action="hide-col"
            aria-disabled={columnView.onlyOne ? true : undefined}
            onClick={() => {
              if (!columnView.onlyOne) columnView.onHide();
            }}
          >
            <Icon name="eye-off" />
            <span>
              Hide this column
              <small>{columnView.onlyOne ? "At least one column stays visible." : "It folds to a strip. Click the strip to bring it back."}</small>
            </span>
          </button>
          {columnView.onlyOne ? null : (
            <button type="button" role="menuitem" className="sm-menu-item cursor-interaction ph-no-capture" data-action="solo-col" onClick={columnView.onSolo}>
              <Icon name="maximize-2" />
              <span>
                Show only this column
                <small>This hides the other columns.</small>
              </span>
            </button>
          )}
        </>
      ) : null}
    </div>,
    root,
  );
}
