// The 6-digit code field, as the prototype draws it (codeBoxes): six boxes
// over one real input, which takes typing, pasting, and the code the phone
// offers from the email. For signing in and for changing your email.

import type { Ref } from "react";

export function CodeBoxes({ value, onChange, inputRef, invalid, describedBy, onKeyDown }: { value: string; onChange(code: string): void; inputRef?: Ref<HTMLInputElement>; invalid: boolean; describedBy: string; onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void }) {
  return (
    <span className="sm-code">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="sm-code-box" aria-hidden="true" data-next={i === Math.min(value.length, 5) ? "" : undefined}>
          {value[i] ?? ""}
        </span>
      ))}
      <input
        ref={inputRef}
        className="sm-code-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={onKeyDown}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
      />
    </span>
  );
}
