// The dialog before combining or separating (M3a-7; A-10), as M3a-5 designed
// it in the prototype (previewMarkup in docs/prototype/source/
// steelman-refined.html): only the question, the wordings, and the buttons,
// as the builder asked (Nov 22). Zendesk confirms before merging tickets and
// Canny before merging posts; GOV.UK's guidance names the button for what it
// does. When the arguments become one, a line says who'll be asked to vote
// again, and only then. Cancel, Escape, or a click outside changes nothing;
// Tab stays inside it, as a modal dialog's does (WAI-ARIA's dialog pattern).

import { useEffect, useRef, useState } from "react";
import type { CombinePreview } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { short } from "./display.ts";

/** What the dialog asks about: a wording joining another argument, or becoming its own. */
export type Asking =
  | { kind: "combine"; versionId: string; wording: string; intoId: string; intoWording: string; last: boolean }
  | { kind: "separate"; versionId: string; wording: string };

interface RestructureDialogProps {
  asking: Asking;
  /** Who'd be asked to vote again, from the service, when the arguments become one. */
  loadPreview(): Promise<CombinePreview | null>;
  onConfirm(): void;
  onCancel(): void;
}

export function RestructureDialog({ asking, loadPreview, onConfirm, onCancel }: RestructureDialogProps) {
  const [preview, setPreview] = useState<CombinePreview | null>(null);
  const box = useRef<HTMLElement>(null);
  // The board draws again on every poll; the dialog keeps its cursor where it is.
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    if (asking.kind !== "combine") return;
    let current = true;
    void loadPreview().then((read) => current && setPreview(read));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[data-confirm]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel.current();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = [...(box.current?.querySelectorAll<HTMLElement>("button") ?? [])];
      const [first, last] = [buttons[0], buttons.at(-1)];
      const here = document.activeElement;
      if (event.shiftKey ? here === first || !box.current?.contains(here) : here === last || !box.current?.contains(here)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    // Capture, so Escape closes the dialog before anything behind it hears it.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // The service has the last word on whether the arguments become one: once it says, the title follows it.
  const becomesOne = asking.kind === "combine" && (preview?.last ?? asking.last);
  const title = asking.kind === "separate" ? "Make this wording its own argument?" : becomesOne ? "Combine these arguments?" : "Combine this wording with that argument?";
  const note = preview?.last ? askedAgain(preview) : null;
  return (
    <>
      <div className="sm-preview-scrim" onClick={onCancel} />
      <section ref={box} className="sm-preview" role="dialog" aria-modal="true" aria-labelledby="sm-preview-title" aria-describedby="sm-preview-what">
        <h2 id="sm-preview-title">{title}</h2>
        <div className="sm-preview-pair" id="sm-preview-what">
          <blockquote className="ph-no-capture">{short(asking.wording)}</blockquote>
          {asking.kind === "combine" ? (
            <>
              <span className="sm-preview-into">
                <Icon name="merge" />
                joins
              </span>
              <blockquote className="ph-no-capture">{short(asking.intoWording)}</blockquote>
            </>
          ) : null}
        </div>
        {/* A live region, since it can arrive after the cursor is on Combine. */}
        <p className={note ? "sm-field-hint" : "sm-sr"} role="status">
          {note}
        </p>
        <div className="sm-preview-actions">
          <button type="button" className="sm-button cursor-interaction" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="sm-button sm-solid cursor-interaction" data-confirm="" onClick={onConfirm}>
            {asking.kind === "separate" ? "Separate" : "Combine"}
          </button>
        </div>
      </section>
    </>
  );
}

/** "You and 2 others will be asked to vote again.", as the prototype says it; nothing when no one will be. */
function askedAgain({ asked, you }: CombinePreview): string | null {
  if (asked === 0) return null;
  if (you) return asked === 1 ? "You’ll be asked to vote again." : `You and ${asked - 1} ${asked === 2 ? "other" : "others"} will be asked to vote again.`;
  return `${asked === 1 ? "One person" : `${asked} people`} will be asked to vote again.`;
}
