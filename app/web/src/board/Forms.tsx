// Writing in place, as the prototype does: a dashed card at the end of an
// unfolded row opens a draft wording, and one at the foot of each column
// opens a draft argument. Closing a form keeps its draft for later. The
// author's edit (A-06) uses the same card in the wording's place.

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { LIMITS, contextInput, wordingInput } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { blockedProps } from "./display.ts";
import type { Blocked } from "./display.ts";

export interface DraftText {
  wording: string;
  context: string;
}

export const EMPTY_DRAFT: DraftText = { wording: "", context: "" };

/** The draft as the API takes it, or null while it has no wording yet. */
export function cleanDraft(draft: DraftText): DraftText | null {
  const wording = wordingInput.safeParse(draft.wording);
  const context = contextInput.safeParse(draft.context);
  return wording.success && context.success ? { wording: wording.data, context: context.data } : null;
}

interface DraftCardProps {
  label: string;
  wordingLabel: string;
  wordingPlaceholder?: string;
  contextLabel: string;
  contextPlaceholder: string;
  closeLabel: string;
  addLabel: string;
  closeTooltip?: string;
  addTooltip?: string;
  /** Classes the card adds, as a wording in an unfolded row does. */
  className?: string;
  /** A warning above the buttons. */
  note?: ReactNode;
  draft: DraftText;
  onChange(draft: DraftText): void;
  onClose(): void;
  onAdd(draft: DraftText): void;
}

/** The draft card both forms use (the prototype's sm-compose-card). */
export function DraftCard(props: DraftCardProps) {
  const { draft, onChange, onClose, onAdd } = props;
  const wording = useRef<HTMLTextAreaElement>(null);
  useEffect(() => wording.current?.focus(), []);
  const ready = cleanDraft(draft);
  const noteId = useId();
  return (
    <form
      className={`sm-card sm-compose-card${props.className ? ` ${props.className}` : ""}`}
      aria-label={props.label}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onAdd(ready);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <textarea
        ref={wording}
        className="sm-draft-claim"
        maxLength={LIMITS.wording}
        placeholder={props.wordingPlaceholder}
        aria-label={props.wordingLabel}
        value={draft.wording}
        onChange={(event) => onChange({ ...draft, wording: event.target.value })}
      />
      <textarea
        className="sm-draft-reason"
        maxLength={LIMITS.context}
        placeholder={props.contextPlaceholder}
        aria-label={props.contextLabel}
        value={draft.context}
        onChange={(event) => onChange({ ...draft, context: event.target.value })}
      />
      {props.note ? <div id={noteId}>{props.note}</div> : null}
      <div className="sm-card-meta">
        <button type="button" className="sm-icon-button cursor-interaction" aria-label={props.closeLabel} data-tooltip={props.closeTooltip ?? "Close"} onClick={onClose}>
          <Icon name="x" />
        </button>
        <button type="submit" className="sm-icon-button sm-primary cursor-interaction" aria-label={props.addLabel} data-tooltip={props.addTooltip ?? "Add"} aria-describedby={props.note ? noteId : undefined} disabled={!ready}>
          <Icon name="check" />
        </button>
      </div>
    </form>
  );
}

interface SlotProps {
  open: boolean;
  draft: DraftText;
  onOpen(): void;
  onChange(draft: DraftText): void;
  onClose(): void;
  onAdd(draft: DraftText): void;
}

/** The last place in an unfolded row: a better version of this argument. */
export function WordingSlot({ open, draft, onOpen, onChange, onClose, onAdd }: SlotProps) {
  return (
    <>
      <span aria-hidden="true" />
      {open ? (
        <DraftCard
          label="Suggest a version"
          wordingLabel="Your version"
          wordingPlaceholder="A better version of this argument"
          contextLabel="What your version improves"
          contextPlaceholder="What it improves"
          closeLabel="Close draft"
          addLabel="Add your version"
          draft={draft}
          onChange={onChange}
          onClose={onClose}
          onAdd={onAdd}
        />
      ) : (
        <button type="button" className="sm-add-card cursor-interaction" aria-label="Suggest a better version" data-tooltip="Suggest a version" onClick={onOpen}>
          <Icon name="plus" />
        </button>
      )}
    </>
  );
}

/** The last row of a column: a new argument for this option. */
/** @param dropLabel While a wording is dragged that may become its own argument here (M3a-7), what a drop does. */
export function ArgumentSlot({ optionName, open, draft, onOpen, onChange, onClose, onAdd, blocked, dropLabel }: SlotProps & { optionName: string; blocked: Blocked | null; dropLabel?: string }) {
  return (
    <div className={`sm-new-idea${dropLabel ? " sm-drop-target sm-drop-split" : ""}`} data-drop-label={dropLabel}>
      <span aria-hidden="true" />
      {open ? (
        <DraftCard
          label={`New argument for ${optionName}`}
          wordingLabel="Your argument"
          wordingPlaceholder={`A new argument for “${optionName}”`}
          contextLabel="Context for your argument (optional)"
          contextPlaceholder="Context: why it matters (optional)"
          closeLabel="Close draft"
          addLabel="Add your argument"
          draft={draft}
          onChange={onChange}
          onClose={onClose}
          onAdd={onAdd}
        />
      ) : (
        <button type="button" className="sm-add-card sm-add-idea cursor-interaction" aria-label={`Add an argument for ${optionName}`} {...blockedProps(blocked)} onClick={() => blocked || onOpen()}>
          <Icon name="plus" />
          <span>Add an argument</span>
        </button>
      )}
    </div>
  );
}
