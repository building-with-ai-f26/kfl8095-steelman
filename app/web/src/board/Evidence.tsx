// An open card's evidence (C-01), in the prototype's markup (evidenceContent
// and sourceForm in docs/prototype/source/steelman-refined.html): each source
// the wording cites, with who added it, opening to its link and description;
// and the form to add a source, or edit your own.
//
// The builder reworked the prototype's form (Nov 14 and 15): a source is a
// link, a title, and an optional description, asked for in that order, as
// Wikipedia's citation tool and Google Docs' Insert link lead with the link.
// The form takes only an http or https link (no uploads yet). "Backs up" and
// "Limits" are gone: the description can say them, and who added a source
// helps a reader more. Older text that isn't a web address stays text, so a
// click can never run it.
//
// Changing a wording's evidence starts its assessments over, so the form warns
// that its credibility score resets ("credibility score resets" is the
// builder's wording, Nov 15). Remove takes a source off at once, with the
// board's ten-second Undo in place of a second click (the builder, Nov 15).
// The service decides who may do what; the board offers Edit only on your own
// source, and Remove to whoever added it, the wording's author, and the Owner.
//
// "Can't open it?" (C-02, M3a-3), as the prototype's source row has it:
// anyone who can read reports that a source can't be opened, and it shows as
// Unavailable on every wording that cites it. As Wikipedia handles a dead
// link, the source stays usable: "Try an archived copy" opens the Wayback
// Machine's copy of the address, and the note says who reported it and when.
// The reporter has "Undo report"; an Editor or the Owner has "Clear report".
//
// Under the sources, the assessment (B-03): "Does the evidence back this
// wording?", Yes or No, as a yes/no question is asked on GOV.UK. Yes needs a
// source that can be opened. An assessment names the revision the reader saw;
// if the wording changed first, it isn't counted, and the card says so.

import { useEffect, useId, useRef, useState } from "react";
import { LIMITS, can, cleanText, webLink } from "@steelman/shared";
import type { QueuedAction, Role, SourceRow, VersionRow } from "@steelman/shared";
import { Icon } from "../icons.tsx";
import { useReader } from "../reader.ts";
import { browserIds } from "../system.ts";
import { shortDate } from "../when.ts";
import { assessmentShown, blockedProps, isLiveVersion, whyNot } from "./display.ts";
import type { Blocked } from "./display.ts";

/** What the evidence needs from the board. */
export interface EvidenceBoard {
  sources: Record<string, SourceRow>;
  versions: Record<string, VersionRow>;
  role: Role | null;
  /** The reader's own actions not yet back from the service. */
  mine: readonly QueuedAction[];
  /** Wordings whose assessment wasn't counted because they changed first. */
  stale: readonly string[];
  /** The source removal held for Undo, if any: already off the card, not yet sent. */
  removing: { versionId: string; sourceId: string } | null;
  /** Takes a source off the wording, held ten seconds for Undo (session.ts). */
  removeSource(version: VersionRow, sourceId: string, assessed: boolean): void;
  /** Reports that a source can't be opened (C-02); answers whether it was taken. */
  reportSource(sourceId: string): Promise<boolean>;
  /** Withdraws the reader's own report (`own`), or clears someone else's. */
  clearSourceReport(sourceId: string, own: boolean): Promise<boolean>;
  act(action: QueuedAction): void;
  announce(text: string): void;
}

interface Draft {
  name: string;
  locator: string;
  finding: string;
}
const EMPTY: Draft = { name: "", locator: "", finding: "" };
type Field = keyof Draft;

/** What saving does to the scores of the assessed wordings it touches: one, or several when a shared source changes. */
const resets = (wordings: number) => (wordings > 1 ? `Credibility scores reset on ${wordings} wordings` : "The credibility score resets");

export function Evidence({ version, board }: { version: VersionRow; board: EvidenceBoard }) {
  const reader = useReader();
  const cited = version.sourceIds.map((id) => board.sources[id]).filter((source) => source !== undefined);
  /** The form, when open: adding a source, or editing one by its ID. */
  const [form, setForm] = useState<{ editing: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [invalid, setInvalid] = useState<Field[]>([]);
  /** What's wrong with the form, shown in it; empty when nothing is. */
  const [problem, setProblem] = useState("");
  /** Which sources are open, by ID. */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  /** A source just added, to open and put the cursor on when the service has it. */
  const [added, setAdded] = useState<string | null>(null);
  /** Where the cursor goes next, by data-key. */
  const [focus, setFocus] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const { announce } = board;

  useEffect(() => {
    if (!focus) return;
    section.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(focus)}"]`)?.focus();
    setFocus(null);
  }, [focus]);

  // A source form closes when the owner lowers the reader's role below writing (M2-2b), as Board.tsx's drafts do.
  const mayWrite = can(reader, board.role, "add", { closed: false }) !== "not_allowed";
  useEffect(() => {
    if (!mayWrite) setForm(null);
  }, [mayWrite]);

  useEffect(() => {
    if (!added || !version.sourceIds.includes(added)) return;
    setOpened((all) => ({ ...all, [added]: true }));
    setFocus(`src-${added}`);
    announce("Source added. It is open below so you can check it.");
    setAdded(null);
  }, [added, version.sourceIds, announce]);

  const assessed = version.yes + version.no > 0;
  /** The assessed wordings citing this source, whose scores an edit of its evidence resets, counting the reader's own pending assessments. */
  const assessedCiting = (sourceId: string) =>
    Object.values(board.versions).filter((v) => {
      const counts = assessmentShown(v, board.mine);
      return isLiveVersion(v) && v.sourceIds.includes(sourceId) && counts.yes + counts.no > 0;
    }).length;
  /** The source being edited, as it is now. */
  const editing = form?.editing ? board.sources[form.editing] : undefined;
  /** Whether saving the draft changes a source's evidence: its link or description, which is what resets scores. */
  const evidenceChanges = !editing || cleanText(draft.locator) !== cleanText(editing.locator) || cleanText(draft.finding) !== cleanText(editing.finding);

  const openForm = (editing: SourceRow | null) => {
    setForm({ editing: editing?.id ?? null });
    setDraft(editing ? { name: editing.name, locator: editing.locator, finding: editing.finding } : EMPTY);
    setInvalid([]);
    setProblem("");
    setFocus("src-locator");
  };
  const closeForm = () => {
    setFocus(form?.editing ? `src-${form.editing}` : "add-source");
    setForm(null);
  };
  const save = () => {
    const clean = { name: cleanText(draft.name), locator: cleanText(draft.locator), finding: cleanText(draft.finding) };
    const wrong = problemsWith(clean, editing);
    if (wrong.fields.length > 0) {
      setInvalid(wrong.fields);
      setProblem(wrong.message);
      setFocus(`src-${wrong.fields[0]}`);
      return;
    }
    if (editing) {
      board.act({ kind: "editSource", sourceId: editing.id, ...clean, backsUp: editing.backsUp, limits: editing.limits });
      setOpened((all) => ({ ...all, [editing.id]: true }));
      setFocus(`src-${editing.id}`);
      announce("Source updated.");
    } else {
      const id = browserIds.itemId();
      board.act({ kind: "addSource", versionId: version.id, id, ...clean });
      setAdded(id);
      setFocus("add-source");
    }
    setForm(null);
  };
  /** Takes it off at once, with Undo for ten seconds in place of asking first (the builder, Nov 15). */
  const remove = (source: SourceRow) => {
    setForm(null);
    board.removeSource(version, source.id, assessed);
  };
  /** Sources whose report, or its withdrawal, is on its way: a second press meanwhile does nothing. */
  const reporting = useRef(new Set<string>());
  /** Reports it, or takes the report back; the cursor stays on the source, as in the prototype. */
  const markUnavailable = async (source: SourceRow, unavailable: boolean) => {
    if (reporting.current.has(source.id)) return;
    reporting.current.add(source.id);
    try {
      if (unavailable) await board.reportSource(source.id);
      else await board.clearSourceReport(source.id, source.report?.by === reader);
    } finally {
      reporting.current.delete(source.id);
    }
    setFocus(`src-${source.id}`);
  };
  /** Yes, No, or withdrawn (null). Pressing your answer again withdraws it, as Undo does. */
  const assess = (supported: boolean | null) => {
    const was = version.myAssessment;
    const now = supported === was ? null : supported;
    board.act({ kind: "assess", versionId: version.id, rev: version.rev, supported: now });
    announce(now === null ? "Assessment withdrawn." : "Assessment saved.");
    if (now === null && was !== null) setFocus(was ? "assess-yes" : "assess-no");
  };
  /** "Yes" needs evidence someone can open. */
  const canBackUp = cited.some((source) => !source.unavailable);
  // What the reader's role can't do here: faded, saying why (display.ts). A role reason comes before any other.
  const voteBlocked = whyNot(reader, board.role, "vote");
  const addBlocked = whyNot(reader, board.role, "add");
  /**
   * The reader's own change to this wording's sources, held for Undo or still
   * on its way. It makes a new revision, so an assessment now would judge the
   * one it replaces and be refused: the buttons wait for it.
   */
  const sourcesChanging =
    board.removing?.versionId === version.id ||
    board.mine.some(
      (action) =>
        ((action.kind === "addSource" || action.kind === "uncite") && action.versionId === version.id) || (action.kind === "editSource" && version.sourceIds.includes(action.sourceId)),
    );

  const warning = !form || !evidenceChanges ? 0 : editing ? assessedCiting(editing.id) : assessed ? 1 : 0;
  return (
    <section ref={section} className="sm-evidence-group" aria-label="Evidence and its assessment">
      <h3>Evidence</h3>
      {cited.length > 0 ? (
        <div className="sm-source-list">
          {cited.map((source) => (
            <Source
              key={source.id}
              source={source}
              open={opened[source.id] ?? false}
              onToggle={(open) => setOpened((all) => (all[source.id] === open ? all : { ...all, [source.id]: open }))}
              mine={source.addedBy === reader}
              editBlocked={addBlocked}
              mayRemove={mayUncite(reader, board.role, source.addedBy, version.authorId)}
              mayReport={can(reader, board.role, "report", { closed: false }) === null}
              mayClear={source.report !== undefined && can(reader, board.role, "unreport", { closed: false }, source.report.by) === null}
              reportedByReader={source.report?.by === reader}
              onEdit={() => openForm(source)}
              onRemove={() => remove(source)}
              onReport={(unavailable) => void markUnavailable(source, unavailable)}
            />
          ))}
        </div>
      ) : (
        <p className="sm-meta">No sources yet.</p>
      )}
      {form ? (
        <SourceForm editing={form.editing !== null} draft={draft} invalid={invalid} problem={problem} warning={warning} onChange={setDraft} onCancel={closeForm} onSave={save} />
      ) : (
        <button type="button" className="sm-text-button sm-add-source cursor-interaction" data-key="add-source" {...blockedProps(addBlocked)} onClick={() => addBlocked || openForm(null)}>
          <Icon name="plus" />
          Add a source
        </button>
      )}
      <div className="sm-evidence-vote">
        {board.stale.includes(version.id) ? (
          <p className="sm-evidence-changed" role="note">
            <Icon name="info" />
            This wording changed; take another look.
          </p>
        ) : null}
        <h4 id={`${version.id}-assess`}>Does the evidence back this wording?</h4>
        <div className="sm-assess-actions" role="group" aria-labelledby={`${version.id}-assess`}>
          <button type="button" className="sm-button cursor-interaction" data-key="assess-yes" aria-pressed={version.myAssessment === true} disabled={!voteBlocked && (!canBackUp || sourcesChanging)} {...blockedProps(voteBlocked)} onClick={() => voteBlocked || assess(true)}>
            <Icon name="check" />
            Yes
          </button>
          <button type="button" className="sm-button cursor-interaction" data-key="assess-no" aria-pressed={version.myAssessment === false} disabled={!voteBlocked && sourcesChanging} {...blockedProps(voteBlocked)} onClick={() => voteBlocked || assess(false)}>
            <Icon name="x" />
            No
          </button>
          {version.myAssessment !== null ? (
            <button type="button" className="sm-text-button cursor-interaction" disabled={sourcesChanging} onClick={() => assess(null)}>
              Undo
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

interface SourceProps {
  source: SourceRow;
  open: boolean;
  onToggle(open: boolean): void;
  mine: boolean;
  /** Set when the reader added it but their role can no longer write. */
  editBlocked: Blocked | null;
  mayRemove: boolean;
  /** Whether the reader may report it can't be opened, and may clear the report on it (C-02). */
  mayReport: boolean;
  mayClear: boolean;
  reportedByReader: boolean;
  onEdit(): void;
  onRemove(): void;
  /** Reports it (true), or takes the report back (false). */
  onReport(unavailable: boolean): void;
}

/**
 * The Wayback Machine's copy of a web address, as Wikipedia offers for a dead link (M3a-3). The address is put in its
 * standard form first, so "../" in it can't lead anywhere else on the archive's site; null when it isn't an address.
 */
function archived(link: string): string | null {
  try {
    return `https://web.archive.org/web/${new URL(link).href}`;
  } catch {
    return null;
  }
}

function Source({ source, open, onToggle, mine, editBlocked, mayRemove, mayReport, mayClear, reportedByReader, onEdit, onRemove, onReport }: SourceProps) {
  const report = source.unavailable ? (mayClear ? "clear" : null) : mayReport ? "report" : null;
  const archive = source.report && source.link ? archived(source.link) : null;
  return (
    // ph-no-capture: PostHog's autocapture sends a clicked element's text and link, and a source's title, link, and adder are what people wrote.
    <details className="sm-source-row ph-no-capture" open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
      <summary className="cursor-interaction" data-key={`src-${source.id}`}>
        <Icon name="file-text" />
        <span>
          {source.name}
          {mine ? <span className="sm-you-tag">You</span> : <span className="sm-source-note sm-source-by">{source.addedByName}</span>}
        </span>
        {source.unavailable ? <span className="sm-source-note">Unavailable</span> : null}
        <Icon name="chevron-right" className="sm-chevron" />
      </summary>
      <div className="sm-source-packet">
        {source.link ? (
          <a className="sm-source-link" href={source.link} target="_blank" rel="noopener noreferrer nofollow ugc">
            <Icon name="link" size={13} />
            <span>{source.locator}</span>
          </a>
        ) : source.locator ? (
          <span className="sm-source-note">{source.locator}</span>
        ) : null}
        {source.finding ? <p>{source.finding}</p> : null}
        {source.report ? (
          <p className="sm-source-note">
            {/* The row's Unavailable tag says what was reported; this says who and when. */}
            {`${reportedByReader ? "You" : source.report.byName} reported it on ${shortDate(source.report.at)}.`}
            {archive ? (
              <>
                {" "}
                <a className="sm-source-link" href={archive} target="_blank" rel="noopener noreferrer nofollow ugc">
                  Try an archived copy
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {mine || mayRemove || report ? (
          <div className="sm-source-actions">
            {mine ? (
              <button type="button" className="sm-link-button cursor-interaction" {...blockedProps(editBlocked)} onClick={() => editBlocked || onEdit()}>
                Edit
              </button>
            ) : null}
            {mayRemove ? (
              <button type="button" className="sm-link-button cursor-interaction" aria-label="Remove from this version" onClick={onRemove}>
                Remove
              </button>
            ) : null}
            {report === "report" ? (
              <button type="button" className="sm-link-button cursor-interaction" onClick={() => onReport(true)}>
                Can’t open it?
              </button>
            ) : report === "clear" ? (
              <button type="button" className="sm-link-button cursor-interaction" onClick={() => onReport(false)}>
                {reportedByReader ? "Undo report" : "Clear report"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

interface SourceFormProps {
  editing: boolean;
  draft: Draft;
  invalid: Field[];
  problem: string;
  /** How many assessed wordings saving resets the score of. */
  warning: number;
  onChange(draft: Draft): void;
  onCancel(): void;
  onSave(): void;
}

const FIELDS: { field: Field; label: string; placeholder: string; optional?: true; max: number }[] = [
  { field: "locator", label: "Link", placeholder: "Paste a link", max: LIMITS.sourceLocator },
  { field: "name", label: "Title", placeholder: "e.g. American Time Use Survey 2024, Bureau of Labor Statistics", max: LIMITS.sourceName },
  { field: "finding", label: "Description", placeholder: "e.g. Table 4: 41% of shift workers have Sunday as their only day off.", optional: true, max: LIMITS.sourceFinding },
];

/**
 * Which fields are wrong, first one first, and what to say. A source kept
 * from before the form asked for links may keep its text where the link
 * goes, so its title can be fixed without adding one.
 */
function problemsWith(clean: Draft, editing: SourceRow | undefined): { fields: Field[]; message: string } {
  const kept = editing !== undefined && clean.locator === cleanText(editing.locator);
  const noLink = !clean.locator && !kept;
  const badLink = !noLink && !kept && webLink(clean.locator) === null;
  const noTitle = !clean.name;
  const fields: Field[] = [...(noLink || badLink ? (["locator"] as const) : []), ...(noTitle ? (["name"] as const) : [])];
  const missing = [noLink ? "a link" : "", noTitle ? "a title" : ""].filter(Boolean);
  const message = [badLink ? "Links start with http:// or https://." : "", missing.length ? `Add ${missing.join(" and ")}.` : ""].filter(Boolean).join(" ");
  return { fields, message };
}

function SourceForm({ editing, draft, invalid, problem, warning, onChange, onCancel, onSave }: SourceFormProps) {
  const id = useId();
  const title = editing ? "Edit source" : "Add a source";
  return (
    <form
      className="sm-source-form"
      aria-label={title}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <h4>{title}</h4>
      {FIELDS.map(({ field, label, placeholder, optional, max }) => {
        const props = {
          id: `${id}-${field}`,
          "data-key": `src-${field}`,
          maxLength: max,
          placeholder,
          value: draft[field],
          "aria-invalid": invalid.includes(field) || undefined,
          "aria-describedby": invalid.includes(field) ? `${id}-problem` : undefined,
        };
        return (
          <div key={field} className="sm-source-field">
            <label htmlFor={props.id}>
              {label}
              {optional ? <span> (optional)</span> : null}
            </label>
            {field === "finding" ? (
              <textarea {...props} rows={2} onChange={(event) => onChange({ ...draft, [field]: event.target.value })} />
            ) : field === "locator" ? (
              <span className="sm-source-link-field">
                <Icon name="link" size={14} />
                <input {...props} type="url" inputMode="url" autoComplete="off" onChange={(event) => onChange({ ...draft, [field]: event.target.value })} />
              </span>
            ) : (
              <input {...props} type="text" onChange={(event) => onChange({ ...draft, [field]: event.target.value })} />
            )}
          </div>
        );
      })}
      {problem ? (
        <p className="sm-source-problem" id={`${id}-problem`} role="alert">
          {problem}
        </p>
      ) : null}
      {warning > 0 ? (
        <p className="sm-source-warn" role="note">
          <Icon name="triangle-alert" />
          {`${resets(warning)} when you save.`}
        </p>
      ) : null}
      <div className="sm-source-form-actions">
        <button type="button" className="sm-text-button cursor-interaction" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="sm-button sm-solid cursor-interaction">
          {editing ? "Save source" : "Add source"}
        </button>
      </div>
    </form>
  );
}

/** The count on a card's face: "1 source", "2 sources". None when it cites nothing. */
export function SourceCount({ count }: { count: number }) {
  if (count === 0) return null;
  const label = `${count} ${count === 1 ? "source" : "sources"}`;
  return (
    <span className="sm-source-button" role="img" aria-label={label} title={label}>
      <Icon name="paperclip" />
      {` ${count}`}
    </span>
  );
}

/** The policy's uncite rule (shared/src/policy.ts): the source's adder, the wording's author, or an Editor or the Owner. A closed board is the service's to refuse. */
function mayUncite(reader: string | null, role: Role | null, addedBy: string, authorId: string): boolean {
  return can(reader, role, "uncite", { closed: false }, [addedBy, authorId]) === null;
}
