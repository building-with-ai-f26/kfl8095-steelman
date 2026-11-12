// Writing in place, as the prototype does: a dashed card at the end of an
// unfolded row opens a draft wording, and one at the foot of each column
// opens a draft argument. Closing a form keeps its draft for later.

import { useEffect, useRef } from "react";
import { LIMITS, contextInput, wordingInput } from "@steelman/shared";
import { Icon } from "../icons.tsx";

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
  return (
    <form
      className="sm-card sm-compose-card"
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
      <div className="sm-card-meta">
        <button type="button" className="sm-icon-button cursor-interaction" aria-label={props.closeLabel} data-tooltip="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
        <button type="submit" className="sm-icon-button sm-primary cursor-interaction" aria-label={props.addLabel} data-tooltip="Add" disabled={!ready}>
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
export function ArgumentSlot({ optionName, open, draft, onOpen, onChange, onClose, onAdd }: SlotProps & { optionName: string }) {
  return (
    <div className="sm-new-idea">
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
        <button type="button" className="sm-add-card sm-add-idea cursor-interaction" aria-label={`Add an argument for ${optionName}`} onClick={onOpen}>
          <Icon name="plus" />
          <span>Add an argument</span>
        </button>
      )}
    </div>
  );
}
