// New space and Space settings (M3d-19; G-01, G-02), from the prototype's
// spaceSettingsMarkup() (docs/prototype/source/steelman-refined.html): a
// back link, a hero in the space's canvas that names it as it's typed, then
// cards of grouped rows. Basics holds the name (40 characters) and about
// text (120), from M3d-17's shared limits, the canvas, and Visibility.
// Settings adds
// Members: invite by username, as an Admin or a Member, and everyone with
// their role. The Owner's row shows "Owner" with no menu, and says why.
// Rules, AI, and how new steelmen start wait for later rows.
//
// The layout follows GitHub's organization settings, whose General page
// (from memory) has the profile's name and description fields, then a
// "Danger zone", and whose People page invites by username and gives each
// member a role menu with Owner and Member; and Notion's workspace settings,
// whose Members tab lists each person with a role menu and puts the
// workspace owner's role beyond change (from memory). The invite field is
// Share's (Sharing.tsx's InviteRow), as Google Drive's Add people is.
//
// Changes to a space that exists apply as they're made, as the prototype's
// do: the name and about text when their field is left, the canvas when it's
// chosen, each saved with all three, as the service takes them. Each save
// sends what the page shows, so a save made while another is on its way
// keeps the other's change, and they go one at a time, so a later one never
// lands first. Nothing waits for a connection (architecture §3): when a save
// fails, the text stays in its field and a sentence says so. Everything here can name the space or a person, so
// the whole page sits in ph-no-capture (M-08).
//
// Visibility (M3d-20, G-07) is the Owner's choice alone, as only a board's
// Owner changes General access; its Admins read it. It offers Private and
// Public, each with what it lets people do, as GitHub's new-repository form
// puts a sentence under each of Public and Private, and as the prototype's
// "Who can join" choice draws them (from memory). Choosing Public asks first,
// in place, with Make public and Cancel, as GitHub's Change visibility asks
// before "Make this repository public" and lists its effects (checked live on
// Nov 28): the question counts the members and the steelmen that open, and
// says which stop being shared. Choosing Private saves at once and keeps
// everyone who joined, as Slack keeps a channel's members. In a public space,
// only its Admins and its Owner see the member list (the builder, Nov 28), so
// a Member's Members card says so and doesn't ask for it.

import { useCallback, useEffect, useRef, useState } from "react";
import { PUBLIC_SPACES_MOST, SPACE_CANVASES, SPACE_LIMITS, canInSpace, cleanText, peopleIn, tooManyMessage } from "@steelman/shared";
import type { BoardListing, MakePublicCounts, SpaceCanvas, SpaceMember, SpaceSummary } from "@steelman/shared";
import { createSpace, inviteToSpace, listBoards, listSpaces, readMakePublicCounts, readSpacePeople, removeFromSpace, setSpaceRole, setSpaceVisibility, updateSpace } from "./api.ts";
import type { SpaceAnswer } from "./api.ts";
import { busyButton } from "./busy.ts";
import { Icon } from "./icons.tsx";
import { spacePath, spaceSettingsPath } from "./links.ts";
import { initials } from "./board/Sharing.tsx";
import { useReader } from "./reader.ts";
import { Sidebar, SpaceFacts, spaceOf } from "./Spaces.tsx";
import type { Spaces } from "./Spaces.tsx";
import { VISIBILITY_SENTENCE, canvasLabel, countsBySpace, makePublicQuestion, peopleHiddenSentence, visibilitySaved } from "./spaces.ts";
import { browserIds } from "./system.ts";
import { UserLink } from "./UserLink.tsx";

const ROLE_WORD = { owner: "Owner", admin: "Admin", member: "Member" } as const;
/** "an Admin", "a Member", for the sentences read out. */
const AS_ROLE = { admin: "an Admin", member: "a Member" } as const;

/** What a refused or failed write to a space tells the person. */
function problemOf(answer: SpaceAnswer, fallback: string): string {
  if (answer.status === "unreachable") return "Your browser couldn’t reach Steelman. Try again.";
  if (answer.status === "refused" && answer.reason === "too_many" && answer.retryAfter !== undefined) return tooManyMessage(answer.retryAfter);
  if (answer.status === "refused" && answer.reason === "owner_keeps_role") return "The owner of a space keeps that role.";
  if (answer.status === "refused" && answer.reason === "too_many_public_spaces") return PUBLIC_SPACES_MOST;
  if (answer.status === "refused" && answer.reason === "not_allowed") return "Only the space’s Owner and Admins can change that.";
  if (answer.status === "not_found") return "This space doesn’t exist any more, or you aren’t in it.";
  return fallback;
}

/** `space` is the space's ID for its settings, or null for New space. */
export function SpaceSettings({ space: id }: { space: string | null }) {
  const [spaces, setSpaces] = useState<Spaces>(null);
  const [boards, setBoards] = useState<BoardListing[] | null>(null);
  /** The space this page is about: the one in the address, or the one just made here. */
  const [made, setMade] = useState<string | null>(id);
  const loadSpaces = useCallback(() => void listSpaces().then((answer) => setSpaces(answer ?? "failed")), []);
  useEffect(() => {
    loadSpaces();
    void listBoards().then((answer) => setBoards(typeof answer === "object" ? answer.boards : []));
  }, [loadSpaces]);
  const space = spaceOf(spaces, made);
  const at = made === null ? ({ kind: "new-space" } as const) : ({ kind: "space", space: made } as const);
  return (
    <div className="sm-home sm-space-page">
      <Sidebar spaces={spaces} counts={boards ? countsBySpace(boards) : null} at={at} />
      {made === null ? (
        <SpaceForm
          onMade={(next) => {
            // The page becomes the new space's settings, with an address that reloads as them.
            window.history.replaceState(null, "", spaceSettingsPath(next));
            setMade(next);
            // Until the new space is read back, the page waits rather than saying it isn't there.
            setSpaces(null);
            loadSpaces();
          }}
        />
      ) : spaces === null ? (
        <main className="sm-profile sm-space-edit" aria-busy="true" aria-label="Space settings" />
      ) : space ? (
        <SpaceForm key={space.id} space={space} justMade={id === null} onSaved={loadSpaces} />
      ) : (
        <main className="sm-profile sm-space-edit">
          <h1 className="sm-sr">Space settings</h1>
          <div className="sm-feed-empty">
            <p>{spaces === "failed" ? "Steelman couldn’t load your spaces. Reload the page to try again." : "This space doesn’t exist, or you aren’t in it."}</p>
            <a className="sm-button cursor-interaction" href="/">
              Go to Your steelmen
            </a>
          </div>
        </main>
      )}
    </div>
  );
}

interface SpaceFormProps {
  /** The space whose settings these are; left out, New space. */
  space?: SpaceSummary;
  justMade?: boolean;
  onMade?(space: string): void;
  onSaved?(): void;
}

function SpaceForm({ space, justMade = false, onMade, onSaved }: SpaceFormProps) {
  const [name, setName] = useState(space?.name ?? "");
  const [about, setAbout] = useState(space?.about ?? "");
  const [canvas, setCanvas] = useState<SpaceCanvas>(space?.canvas ?? "stone");
  /** What the service holds now, so leaving a field unchanged sends nothing. */
  const saved = useRef({ name: space?.name ?? "", about: space?.about ?? "", canvas: space?.canvas ?? "stone" });
  /** The settings as the page shows them, which each save sends, and the save on its way, which the next one follows. */
  const wanted = useRef(saved.current);
  const sending = useRef<Promise<void>>(Promise.resolve());
  const [nameError, setNameError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(justMade && space ? `You made ${space.name}. Invite people next.` : "");
  /** New space's ID, made once, so sending it again after a failure makes one space. */
  const newId = useRef<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const editable = !space || canInSpace("reader", space.role, "space_edit") === null;

  // The cursor starts once: on the name for New space, and on the invite field for a space just made. A save reads
  // the space back, which gives a new copy of it, so this follows its ID, not the copy.
  const spaceId = space?.id;
  useEffect(() => {
    if (!spaceId) nameField.current?.focus();
    else if (justMade) document.getElementById("sm-space-invite")?.focus();
  }, [spaceId, justMade]);

  const fail = (message: string) => {
    setProblem(message);
    setAttempt((n) => n + 1);
  };

  function save(change: Partial<{ name: string; about: string; canvas: SpaceCanvas }>, sentence: string) {
    if (!space) return;
    wanted.current = { ...wanted.current, ...change };
    sending.current = sending.current.then(async () => {
      const next = wanted.current;
      const answer = await updateSpace(space.id, next);
      if (answer.status !== "done" && answer.status !== "already_done") return fail(problemOf(answer, "Steelman couldn’t save that. Try again."));
      saved.current = next;
      setProblem(null);
      setSaid(sentence);
      onSaved?.();
    });
  }

  /** The name, tidied, or null after saying what's wrong with it. */
  const checkedName = (): string | null => {
    const clean = cleanText(name);
    if (!clean) {
      setNameError("Name the space.");
      setAttempt((n) => n + 1);
      nameField.current?.focus();
      return null;
    }
    return clean;
  };

  async function create() {
    const clean = checkedName();
    if (clean === null || busy) return;
    setBusy(true);
    newId.current ??= browserIds.itemId();
    const answer = await createSpace({ id: newId.current, name: clean, about: cleanText(about), canvas });
    setBusy(false);
    if (answer.status === "done" || answer.status === "already_done") return onMade?.(newId.current);
    fail(problemOf(answer, "Steelman couldn’t make the space. Try again."));
  }

  const shownName = cleanText(name);
  const backTo = space ? { path: spacePath(space.id), name: saved.current.name } : { path: "/", name: "Home" };
  return (
    <main className="sm-profile sm-space-edit ph-no-capture" aria-label={space ? `Settings for ${saved.current.name}` : "New space"}>
      <a className="sm-text-button sm-profile-back cursor-interaction" href={backTo.path}>
        <Icon name="arrow-left" />
        <span>{backTo.name}</span>
      </a>
      <header className="sm-space-hero">
        <div className="sm-space-banner" data-canvas={canvas} />
        <div className="sm-space-hero-body">
          <span className="sm-space-hero-label">{space ? "Space settings" : "New space"}</span>
          <h1 id="sm-space-hero-name" data-empty={shownName ? undefined : ""}>
            {shownName || "Untitled space"}
          </h1>
          <SpaceFacts members={space?.members ?? 1} visibility={space?.visibility ?? "private"} />
        </div>
      </header>
      <div className="sm-profile-main">
        {editable ? (
          <section className="sm-rail-card" aria-labelledby="sm-basics-title">
            <h2 id="sm-basics-title">Basics</h2>
            <label className="sm-field">
              <span>Name</span>
              <input
                ref={nameField}
                id="sm-space-name"
                type="text"
                maxLength={SPACE_LIMITS.name}
                autoComplete="off"
                value={name}
                {...(nameError ? { "aria-invalid": true, "aria-describedby": "sm-space-error" } : {})}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                onBlur={() => {
                  if (!space) return;
                  const clean = checkedName();
                  if (clean !== null && clean !== saved.current.name) save({ name: clean }, `The space is now called ${clean}.`);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing && !space) {
                    event.preventDefault();
                    void create();
                  }
                }}
              />
            </label>
            {nameError ? (
              <p key={attempt} className="sm-field-error" id="sm-space-error" role="alert">
                {nameError}
              </p>
            ) : null}
            <label className="sm-field">
              <span>About</span>
              <textarea
                id="sm-space-about"
                rows={2}
                maxLength={SPACE_LIMITS.about}
                value={about}
                onChange={(event) => setAbout(event.target.value)}
                onBlur={() => {
                  const clean = cleanText(about);
                  if (space && clean !== saved.current.about) save({ about: clean }, "The about text is saved.");
                }}
              />
            </label>
            <section className="sm-rgroup">
              <h3>Canvas</h3>
              <CanvasPicker
                canvas={canvas}
                onPick={(next) => {
                  setCanvas(next);
                  if (space && next !== saved.current.canvas) save({ canvas: next }, `The canvas is now ${canvasLabel(next)}.`);
                }}
              />
            </section>
            {space && canInSpace("reader", space.role, "space_visibility") === null ? (
              <VisibilityChoice space={space} onSaid={setSaid} onSaved={onSaved} />
            ) : (
              // New space starts private, and an Admin reads the Owner's choice.
              <div className="sm-rrow">
                <span className="sm-rrow-label">
                  Visibility
                  <small>{space?.visibility === "public" ? VISIBILITY_SENTENCE.public : VISIBILITY_SENTENCE.private}</small>
                </span>
                <span className="sm-rrow-control">
                  <span className="sm-rrow-value">{space?.visibility === "public" ? "Public" : "Private"}</span>
                </span>
              </div>
            )}
            {!space ? (
              <div className="sm-space-foot">
                <a className="sm-link-button cursor-interaction" href="/">
                  Cancel
                </a>
                <button type="button" className="sm-button sm-solid cursor-interaction" {...busyButton(busy)} onClick={() => void create()}>
                  Create space
                </button>
              </div>
            ) : null}
            {problem ? (
              <p key={attempt} className="sm-field-error" role="alert">
                {problem}
              </p>
            ) : null}
          </section>
        ) : (
          <section className="sm-rail-card" aria-labelledby="sm-basics-title">
            <h2 id="sm-basics-title">Basics</h2>
            <p className="sm-rail-empty">Only the space’s Owner and Admins can change its settings.</p>
          </section>
        )}
        {space ? <Members space={space} onSaid={setSaid} onChanged={onSaved} /> : null}
      </div>
      <p className="sm-live" role="status">
        {said}
      </p>
    </main>
  );
}

const VISIBILITY_CHOICES = [
  { value: "private", icon: "lock", label: "Private" },
  { value: "public", icon: "globe", label: "Public" },
] as const;

/**
 * The Owner's Visibility choice (G-07, M3d-20): Private and Public as a radio group, each with what it lets people do.
 * Public asks first, in place, with its counts, and is saved only by Make public; Private is saved at once. The arrow
 * keys only move between the two, and Space or Enter chooses, so hearing an option's description changes nothing.
 * Focus moves to the question when it opens, and back to the chosen option when it closes.
 */
function VisibilityChoice({ space, onSaid, onSaved }: { space: SpaceSummary; onSaid(sentence: string): void; onSaved: (() => void) | undefined }) {
  /** The question's counts once Public is chosen: being read, read, or couldn't be read. */
  const [asking, setAsking] = useState<MakePublicCounts | "reading" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** What was saved, shown at once, before the space is read again. */
  const [saved, setSaved] = useState(space.visibility);
  useEffect(() => setSaved(space.visibility), [space.visibility]);
  /** The option the arrow keys are on, which takes Tab; the chosen one until they move. */
  const [focused, setFocused] = useState<"private" | "public" | null>(null);
  const group = useRef<HTMLDivElement>(null);
  const question = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const chosen = asking !== null ? "public" : saved;
  const tabStop = focused ?? chosen;
  const focusOption = (visibility: "private" | "public") => group.current?.querySelector<HTMLElement>(`[data-visibility="${visibility}"]`)?.focus();
  const isOpen = asking !== null;
  useEffect(() => {
    if (isOpen && !opened.current) question.current?.focus();
    opened.current = isOpen;
  }, [isOpen]);

  const fail = (message: string) => {
    setProblem(message);
    setAttempt((n) => n + 1);
  };
  async function save(visibility: "private" | "public") {
    if (busy) return;
    setBusy(true);
    const answer = await setSpaceVisibility(space.id, visibility);
    setBusy(false);
    if (answer.status === "done" || answer.status === "already_done") {
      setSaved(visibility);
      setAsking(null);
      setProblem(null);
      setFocused(null);
      // Make public's button goes with its question, so focus returns to the option now chosen.
      if (visibility === "public") focusOption("public");
      onSaid(visibilitySaved(space.name, visibility));
      onSaved?.();
      return;
    }
    fail(problemOf(answer, "Steelman couldn’t change who can find the space. Try again."));
  }
  function choose(visibility: "private" | "public") {
    setProblem(null);
    if (visibility === saved) return setAsking(null);
    if (visibility === "private") return void save("private");
    setAsking("reading");
    void readMakePublicCounts(space.id).then((counts) => setAsking((now) => (now === null ? null : (counts ?? "failed"))));
  }

  return (
    <section className="sm-rgroup sm-visibility">
      <h3 id="sm-visibility-title">Visibility</h3>
      <div
        ref={group}
        className="sm-modes sm-kinds"
        role="radiogroup"
        aria-labelledby="sm-visibility-title"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null);
        }}
        onKeyDown={(event) => {
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
          if (step === undefined) return;
          event.preventDefault();
          const next = tabStop === "public" ? "private" : "public";
          setFocused(next);
          focusOption(next);
        }}
      >
        {VISIBILITY_CHOICES.map((each) => (
          <button
            key={each.value}
            type="button"
            role="radio"
            className="sm-mode cursor-interaction"
            data-visibility={each.value}
            aria-checked={each.value === chosen}
            aria-label={each.label}
            aria-describedby={`sm-visibility-${each.value}`}
            tabIndex={each.value === tabStop ? 0 : -1}
            onFocus={() => setFocused(each.value)}
            onClick={() => choose(each.value)}
          >
            <Icon name={each.icon} />
            <span>{each.label}</span>
            <small id={`sm-visibility-${each.value}`}>{VISIBILITY_SENTENCE[each.value]}</small>
          </button>
        ))}
      </div>
      {asking !== null ? (
        <div ref={question} className="sm-space-ask" role="group" aria-label="Make the space public" tabIndex={-1}>
          {/* Read out when the counts arrive, as focus is already on the question. */}
          <div role="status">
            {asking === "reading" ? (
              <p>Steelman is counting the members and the steelmen that would open.</p>
            ) : asking === "failed" ? (
              <p>Steelman couldn’t count what would open, so the space stays private. Choose Cancel, then Public, to try again.</p>
            ) : (
              makePublicQuestion(space.name, asking).map((sentence) => <p key={sentence}>{sentence}</p>)
            )}
          </div>
          <div className="sm-space-actions">
            <button
              type="button"
              className="sm-button cursor-interaction"
              onClick={() => {
                setAsking(null);
                setProblem(null);
                setFocused(null);
                focusOption(saved);
              }}
            >
              Cancel
            </button>
            <button type="button" className="sm-button sm-solid cursor-interaction" {...busyButton(busy || asking === "reading")} disabled={busy || typeof asking !== "object"} onClick={() => void save("public")}>
              Make public
            </button>
          </div>
        </div>
      ) : null}
      {problem ? (
        <p key={attempt} className="sm-field-error" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

/** The six canvases as radio buttons, as the prototype draws them; the arrow keys move between them, as a radio group's do. */
function CanvasPicker({ canvas, onPick }: { canvas: SpaceCanvas; onPick(canvas: SpaceCanvas): void }) {
  const group = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={group}
      className="sm-canvases"
      role="radiogroup"
      aria-label="Canvas"
      onKeyDown={(event) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (step === undefined) return;
        event.preventDefault();
        const next = SPACE_CANVASES[(SPACE_CANVASES.indexOf(canvas) + step + SPACE_CANVASES.length) % SPACE_CANVASES.length]!;
        onPick(next);
        group.current?.querySelector<HTMLElement>(`[data-canvas="${next}"]`)?.focus();
      }}
    >
      {SPACE_CANVASES.map((each) => (
        <button
          key={each}
          type="button"
          role="radio"
          className="sm-canvas-pick cursor-interaction"
          data-canvas={each}
          aria-checked={each === canvas}
          aria-label={canvasLabel(each)}
          data-tooltip={canvasLabel(each)}
          tabIndex={each === canvas ? 0 : -1}
          onClick={() => onPick(each)}
        />
      ))}
    </div>
  );
}

/**
 * The Members card: invite by username, then everyone in the space, Owner first, each with their role. A change to
 * who's in it reads the space back too, so the hero's member count follows.
 */
function Members({ space, onSaid, onChanged }: { space: SpaceSummary; onSaid(sentence: string): void; onChanged: (() => void) | undefined }) {
  const me = useReader();
  const [people, setPeople] = useState<SpaceMember[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // In a public space only its Admins and its Owner read the list (M3d-20), so no one else asks for it.
  const mayList = canInSpace("reader", space.role, peopleIn(space.visibility)) === null;
  const load = useCallback(() => {
    if (mayList) void readSpacePeople(space.id).then(setPeople);
  }, [space.id, mayList]);
  useEffect(load, [load]);
  const mayRole = canInSpace("reader", space.role, "space_role") === null;
  const mayRemove = canInSpace("reader", space.role, "space_remove") === null;
  const after = (answer: SpaceAnswer, sentence: string, fallback: string) => {
    load();
    if (answer.status === "done" || answer.status === "already_done") {
      setProblem(null);
      onSaid(sentence);
      onChanged?.();
    } else {
      setProblem(problemOf(answer, fallback));
    }
  };
  return (
    <section className="sm-rail-card" aria-labelledby="sm-members-title">
      <h2 id="sm-members-title">
        Members<span>{people ? people.length : space.members}</span>
      </h2>
      {canInSpace("reader", space.role, "space_invite") === null ? (
        <InviteRow
          space={space}
          onAdded={(name, role) => {
            load();
            onChanged?.();
            onSaid(`${name} is now ${AS_ROLE[role]} of ${space.name}.`);
          }}
        />
      ) : null}
      {!mayList ? (
        <p className="sm-rail-empty">{peopleHiddenSentence}</p>
      ) : people === null ? null : (
        <ul className="sm-people">
          {people.map((person) => {
            const name = person.name ?? "someone without a username";
            const you = person.id === me;
            return (
              <li key={person.id} className="sm-person">
                <span className={`sm-avatar${you ? " sm-you" : ""}`} aria-hidden="true">
                  {person.name ? initials(person.name) : "?"}
                </span>
                <span>
                  <UserLink name={person.name}>{person.name ?? "No username yet"}</UserLink>
                  {you ? <small> (you)</small> : null}
                  {person.role === "owner" ? <small className="sm-person-note">The owner of a space keeps that role.</small> : null}
                </span>
                {person.role !== "owner" && mayRole && !you ? (
                  <select
                    className="sm-rselect"
                    aria-label={`Role for ${name}`}
                    value={person.role}
                    onChange={(event) => {
                      const role = event.target.value as "admin" | "member";
                      void setSpaceRole(space.id, person.id, role).then((answer) => after(answer, `${name} is now ${AS_ROLE[role]}.`, "Steelman couldn’t change that role. Try again."));
                    }}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span className="sm-person-role">{ROLE_WORD[person.role]}</span>
                )}
                {person.role !== "owner" && mayRemove && !you ? (
                  <button
                    type="button"
                    className="sm-person-remove cursor-interaction"
                    aria-label={`Remove ${name}`}
                    data-tooltip="Remove"
                    onClick={() => void removeFromSpace(space.id, person.id).then((answer) => after(answer, `${name} is no longer in the space.`, "Steelman couldn’t remove them. Try again."))}
                  >
                    <Icon name="x" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {problem ? (
        <p className="sm-field-error" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

/** Invite by username, as an Admin or a Member, as Share's invite row does it. Enter invites too. */
function InviteRow({ space, onAdded }: { space: SpaceSummary; onAdded(name: string, role: "admin" | "member"): void }) {
  const [typed, setTyped] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  async function send() {
    if (busy) return;
    setAttempt((n) => n + 1);
    const name = typed.trim().replace(/^@/, "").toLowerCase();
    if (!name) {
      setProblem("Type who you want to add.");
      return field.current?.focus();
    }
    setBusy(true);
    const answer = await inviteToSpace(space.id, name, role);
    setBusy(false);
    field.current?.focus();
    if (answer.status === "done") {
      setProblem(null);
      setTyped("");
      return onAdded(name, role);
    }
    if (answer.status === "already_done") return setProblem(`${name} is already ${AS_ROLE[role]} of the space.`);
    // An unknown username, as Share says it. The service answers the same for a space you've just left.
    if (answer.status === "not_found" || answer.status === "invalid") return setProblem(`No one is called ${name}. Check the username.`);
    setProblem(problemOf(answer, "Steelman couldn’t add them. Try again."));
  }

  return (
    <div className="sm-share-invite sm-space-invite">
      <div className="sm-share-field" data-invalid={problem ? "" : undefined}>
        <input
          ref={field}
          id="sm-space-invite"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Username"
          aria-label="Invite by username"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? "sm-space-invite-error" : undefined}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value as "admin" | "member")}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button type="button" className="sm-button sm-solid cursor-interaction" {...busyButton(busy)} onClick={() => void send()}>
        Invite
      </button>
      {problem ? (
        <p key={attempt} className="sm-field-error" id="sm-space-invite-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
