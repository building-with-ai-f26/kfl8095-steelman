// The board screen (M0-6): the prototype's markup, drawn from what the
// reader holds (session.ts). Rows sit where `view.shown` puts them; counts
// change in place; the pill counts what Update would change.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ArgumentRow, OptionRow, ReaderView } from "@steelman/shared";
import { Axis, Icon } from "../icons.tsx";
import { browserIds } from "../system.ts";
import { Card } from "./Card.tsx";
import { ArgumentSlot, EMPTY_DRAFT } from "./Forms.tsx";
import type { DraftText } from "./Forms.tsx";
import { Track, TrackAxis } from "./Track.tsx";
import { VoteControl } from "./Vote.tsx";
import { columns, importanceShown, isLive, short } from "./display.ts";
import { BoardSession } from "./session.ts";
import type { SessionState } from "./session.ts";

export function Board({ boardId }: { boardId: string }) {
  const [session] = useState(() => new BoardSession(boardId));
  useEffect(() => {
    void session.start();
    return () => session.stop();
  }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot);

  if (state.phase === "missing") return <p className="sm-meta">There's no board at this link.</p>;
  if (!state.view) return null;
  return <BoardView view={state.view} state={state} session={session} />;
}

function BoardView({ view, state, session }: { view: ReaderView; state: SessionState; session: BoardSession }) {
  const options = columns(view);
  const [side, setSide] = useState(options[0]?.id);
  /** The row unfolded to compare its wordings: one at a time. */
  const [open, setOpen] = useState<string | null>(null);
  const openOption = open ? view.rows.arguments[open]?.optionId : undefined;
  const [writing, setWriting] = useState<Writing>(null);
  /** Drafts kept for later, by where they were started: "w:<argument>" or "a:<option>". */
  const [drafts, setDrafts] = useState<Record<string, DraftText>>({});
  const keep = (key: string, draft: DraftText) => setDrafts((all) => ({ ...all, [key]: draft }));

  const writer: Writer = {
    writing,
    draft: (key) => drafts[key] ?? EMPTY_DRAFT,
    change: keep,
    start: setWriting,
    close() {
      // Closing the draft on a row with one wording folds the row too, as in the prototype.
      if (writing?.kind === "wording" && (view.shown.versions[writing.argumentId]?.length ?? 0) < 2) setOpen(null);
      setWriting(null);
    },
    addWording(argumentId, draft) {
      session.act({ kind: "addWording", argumentId, id: browserIds.itemId(), ...draft });
      keep(`w:${argumentId}`, EMPTY_DRAFT);
      setWriting(null);
    },
    addArgument(optionId, draft) {
      session.act({ kind: "addArgument", id: browserIds.itemId(), optionId, versionId: browserIds.itemId(), ...draft });
      keep(`a:${optionId}`, EMPTY_DRAFT);
      setWriting(null);
    },
  };
  const anchor = useRef<{ id: string; top: number } | null>(null);

  // Update holds the row you're reading still on screen while the others move around it.
  useLayoutEffect(() => {
    const held = anchor.current;
    anchor.current = null;
    if (!held) return;
    const now = document.querySelector(`[data-node="${held.id}"]`)?.getBoundingClientRect().top;
    if (now !== undefined && now !== held.top) window.scrollBy(0, now - held.top);
  }, [view.shown]);

  const update = () => {
    anchor.current = readingAnchor(open);
    const gone = writing?.kind === "wording" ? view.rows.arguments[writing.argumentId] : undefined;
    if (gone && !isLive(gone)) {
      // Drafts follow their argument; when it's gone, the draft becomes a new argument in the same column.
      keep(`a:${gone.optionId}`, drafts[`w:${gone.id}`] ?? EMPTY_DRAFT);
      setWriting({ kind: "argument", optionId: gone.optionId });
      setOpen(null);
      session.update("That argument was deleted. Your draft is now a new argument.");
      return;
    }
    if (open && !isLive(view.rows.arguments[open])) setOpen(null);
    session.update();
  };

  return (
    <div className="sm-surface">
      <div className="sm-scene">
        <section className="sm-head" aria-label="The question">
          <h1>{state.question}</h1>
        </section>
        <main id="sm-content">
          <div className="sm-board" style={{ "--sm-cols": boardColumns(options, openOption) } as React.CSSProperties}>
            <div className="sm-sides" role="tablist" aria-label="Sides">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  className="cursor-interaction"
                  aria-selected={option.id === side}
                  aria-controls={`sm-col-${option.id}`}
                  onClick={() => setSide(option.id)}
                >
                  <span>{option.name}</span>
                  <small>{view.shown.arguments[option.id]?.length ?? 0}</small>
                </button>
              ))}
            </div>
            {options.map((option, index) => (
              <Column
                key={option.id}
                option={option}
                first={index === 0}
                on={option.id === side}
                gap={index > 0}
                open={open}
                onToggle={(id) => {
                  if (writing?.kind === "wording") setWriting(null);
                  setOpen(open === id ? null : id);
                }}
                writer={writer}
                view={view}
                state={state}
                session={session}
              />
            ))}
          </div>
        </main>
      </div>
      <Pill state={state} count={session.pillCount()} onUpdate={update} />
      <div id="sm-status" className="sm-live" role="status" aria-live="polite">
        {state.status}
      </div>
    </div>
  );
}

/** Which draft form is open: one at a time. */
type Writing = { kind: "wording"; argumentId: string } | { kind: "argument"; optionId: string } | null;

/** What the rows and columns need to write in place. */
export interface Writer {
  writing: Writing;
  draft(key: string): DraftText;
  change(key: string, draft: DraftText): void;
  start(writing: Writing): void;
  close(): void;
  addWording(argumentId: string, draft: DraftText): void;
  addArgument(optionId: string, draft: DraftText): void;
}

/** While a row is unfolded, its column takes most of the width, and the others keep a readable one. */
function boardColumns(options: OptionRow[], wide: string | undefined): string {
  const rest = wide ? `minmax(${options.length === 2 ? 260 : 200}px,1fr)` : "minmax(0,1fr)";
  return options.map((option) => (option.id === wide ? "minmax(0,2.6fr)" : rest)).join(" 32px ");
}

/** The row Update keeps in place: the unfolded one, else the first at least partly in view. */
function readingAnchor(open: string | null): { id: string; top: number } | null {
  const unfolded = open ? document.querySelector(`[data-node="${open}"]`) : null;
  if (unfolded) return { id: open!, top: unfolded.getBoundingClientRect().top };
  for (const row of document.querySelectorAll<HTMLElement>("[data-node]")) {
    const box = row.getBoundingClientRect();
    if (box.bottom > 60) return { id: row.dataset.node!, top: box.top };
  }
  return null;
}

/** "Offline · 1 waiting to send", "Back online · 1 sent", or "3 changes · Update". */
function Pill({ state, count, onUpdate }: { state: SessionState; count: number; onUpdate(): void }) {
  let content: React.ReactNode = null;
  if (state.offline) {
    content = (
      <span>
        <Icon name="wifi-off" size={15} />
        {`Offline${state.waiting > 0 ? ` · ${state.waiting} waiting to send` : ""}`}
      </span>
    );
  } else if (state.backOnline !== null) {
    content = (
      <span>
        <Icon name="wifi" size={15} />
        {`Back online${state.backOnline > 0 ? ` · ${state.backOnline} sent` : ""}`}
      </span>
    );
  } else if (count > 0) {
    content = (
      <>
        <span>
          <Icon name="refresh-cw" size={15} />
          {`${count} ${count === 1 ? "change" : "changes"}`}
        </span>
        <button type="button" className="cursor-interaction" onClick={onUpdate}>
          Update
        </button>
      </>
    );
  }
  const quiet = state.offline || state.backOnline !== null;
  return (
    <div className={`sm-fresh${quiet ? " sm-quiet" : ""}`} role="status" hidden={content === null}>
      {content}
    </div>
  );
}

interface ColumnProps {
  option: OptionRow;
  first: boolean;
  on: boolean;
  gap: boolean;
  open: string | null;
  onToggle(argumentId: string): void;
  writer: Writer;
  view: ReaderView;
  state: SessionState;
  session: BoardSession;
}

function Column({ option, first, on, gap, open, onToggle, writer, view, state, session }: ColumnProps) {
  const key = `a:${option.id}`;
  const argumentIds = view.shown.arguments[option.id] ?? [];
  return (
    <>
      {gap && <div className="sm-col-gap" aria-hidden="true" />}
      <section className={`sm-column${first ? " sm-first" : ""}${on ? " sm-side-on" : ""}`} id={`sm-col-${option.id}`} data-option={option.id} aria-label={option.name}>
        {first && (
          <div className="sm-col-vaxis">
            <Axis kind="v" start="more important" end="less important" />
          </div>
        )}
        <div className="sm-column-head">
          <h2>{option.name}</h2>
        </div>
        <div className="sm-col-axis" aria-hidden="true">
          <Icon name="arrow-down" />
          Most important first
        </div>
        {argumentIds.map((id) => {
          const argument = view.rows.arguments[id];
          return argument ? <Row key={id} argument={argument} open={open === id} onToggle={() => onToggle(id)} writer={writer} view={view} state={state} session={session} /> : null;
        })}
        <ArgumentSlot
          optionName={option.name}
          open={writer.writing?.kind === "argument" && writer.writing.optionId === option.id}
          draft={writer.draft(key)}
          onOpen={() => writer.start({ kind: "argument", optionId: option.id })}
          onChange={(draft) => writer.change(key, draft)}
          onClose={writer.close}
          onAdd={(draft) => writer.addArgument(option.id, draft)}
        />
      </section>
    </>
  );
}

interface RowProps {
  argument: ArgumentRow;
  open: boolean;
  onToggle(): void;
  writer: Writer;
  view: ReaderView;
  state: SessionState;
  session: BoardSession;
}

function Row({ argument, open, onToggle, writer, view, state, session }: RowProps) {
  const versionIds = view.shown.versions[argument.id] ?? [];
  const versions = versionIds.map((id) => view.rows.versions[id]).filter((version) => version !== undefined);
  const lead = versions[0];
  if (!lead) return null;
  const label = short(lead.wording ?? `Deleted by ${lead.authorName}`);
  const { vote, score } = importanceShown(argument, state.mine);
  const count = versionIds.length;
  const [at, setAt] = useState(0);
  return (
    <section className={`sm-idea${open ? " sm-open" : ""}${count < 2 ? " sm-single" : ""}`} data-node={argument.id} aria-label={label}>
      {open && <TrackAxis count={count} at={at} onFold={onToggle} />}
      <VoteControl
        axis="v"
        group={`Importance: ${label}`}
        value={vote}
        score={score}
        forward="More important if true"
        back="Less important if true"
        onVote={(value) => session.act({ kind: "importance", argumentId: argument.id, value })}
      />
      <div className="sm-card-wrap">
        {open ? (
          <Track versions={versions} argumentId={argument.id} writer={writer} state={state} session={session} onAt={setAt} />
        ) : (
          <>
            <Stack count={count} onUnfold={onToggle} />
            <Card version={lead} />
          </>
        )}
      </div>
    </section>
  );
}

/** The stack beside a card: how many wordings it has, or ≫ when there's no other yet. */
function Stack({ count, onUnfold }: { count: number; onUnfold(): void }) {
  const hidden = count - 1;
  const empty = hidden === 0;
  const edges = empty ? [1] : Array.from({ length: Math.min(hidden, 3) }, (_, k) => Math.min(hidden, 3) - k);
  return (
    <button
      type="button"
      className={`sm-stack-button${empty ? " sm-empty" : ""} cursor-interaction`}
      aria-label={empty ? "Write another wording of this argument" : `Compare ${count} wordings of this argument`}
      data-tooltip={empty ? "Write another wording" : `${count} wordings`}
      onClick={onUnfold}
    >
      {edges.map((i) => (
        <span key={i} aria-hidden="true" style={{ right: `${24 - 7 * i}px`, top: `${3 * i}px`, bottom: `${3 * i}px` }} />
      ))}
      <b className="sm-stack-count" aria-hidden="true">
        {empty ? <Icon name="chevrons-right" /> : count}
      </b>
    </button>
  );
}
