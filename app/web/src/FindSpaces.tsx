// Find spaces (M3d-20; G-07, G-01): the public spaces you haven't joined,
// most members first, as the service ranks them (at most PUBLIC_SPACES.found;
// security review F9), each as the prototype's space card with Join. Slack's
// Channels directory, read live on Nov 28, lists public channels to "browse
// the list or search by name or description", each with Join Channel;
// GitHub's organization list does the same with a "Find a repository" field
// (from memory). The "Search spaces" field is Home's "Search steelmen", and
// filters this answer in the browser by name and about text, so the search
// text reaches neither the service nor PostHog: the field carries
// ph-no-capture and nothing echoes it. Joining makes you a Member at once,
// with no request; the card then leads to the space, and the sidebar lists
// it under Your spaces. Every space's name sits in ph-no-capture (M-08).

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardListing, FoundSpace } from "@steelman/shared";
import { findSpaces, joinSpace, listBoards, listSpaces } from "./api.ts";
import { Icon } from "./icons.tsx";
import { FoundSpaceCard, Sidebar } from "./Spaces.tsx";
import type { Spaces } from "./Spaces.tsx";
import { countsBySpace, findSpacesEmpty, joinedSentence, matchesSpace, spaceSearchSentence } from "./spaces.ts";

export function FindSpaces() {
  const [spaces, setSpaces] = useState<Spaces>(null);
  const [boards, setBoards] = useState<BoardListing[] | null>(null);
  const [found, setFound] = useState<FoundSpace[] | "failed" | null>(null);
  const [query, setQuery] = useState("");
  const [joined, setJoined] = useState<ReadonlySet<string>>(new Set());
  const [joining, setJoining] = useState<string | null>(null);
  /** The space whose Join was just pressed, whose Open link then takes the focus. */
  const [justJoined, setJustJoined] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const field = useRef<HTMLInputElement>(null);

  const loadYours = useCallback(() => {
    void listSpaces().then((answer) => setSpaces(answer ?? "failed"));
    void listBoards().then((answer) => setBoards(typeof answer === "object" ? answer.boards : []));
  }, []);
  const loadFound = useCallback(() => void findSpaces().then((answer) => setFound(answer ?? "failed")), []);
  useEffect(() => {
    loadYours();
    loadFound();
  }, [loadYours, loadFound]);

  async function join(space: FoundSpace) {
    if (joining) return;
    setJoining(space.id);
    const answer = await joinSpace(space.id);
    setJoining(null);
    setAttempt((n) => n + 1);
    if (answer.status === "done" || answer.status === "already_done") {
      setProblem(null);
      setJoined((now) => new Set(now).add(space.id));
      setJustJoined(space.id);
      setSaid(joinedSentence(space.name));
      // The space and its boards shared with everyone in it are yours now.
      loadYours();
      return;
    }
    setProblem(answer.status === "unreachable" ? "Your browser couldn’t reach Steelman. Try again." : "This space isn’t public any more, or you can’t join it.");
  }

  const shown = Array.isArray(found) ? found.filter((space) => matchesSpace(space, query)) : [];
  return (
    <div className="sm-home sm-home-alone">
      <Sidebar spaces={spaces} counts={boards ? countsBySpace(boards) : null} at={{ kind: "find-spaces" }} />
      <main className="sm-feed sm-find" aria-labelledby="sm-find-title" aria-busy={found === null ? "true" : undefined}>
        <h1 id="sm-find-title">Find spaces</h1>
        {found === null ? null : found === "failed" ? (
          <div className="sm-feed-empty" role="alert">
            <p>Steelman couldn’t load the public spaces.</p>
            <button type="button" className="sm-button cursor-interaction" onClick={() => (setFound(null), loadFound())}>
              Try again
            </button>
          </div>
        ) : found.length === 0 ? (
          <div className="sm-feed-empty">
            <p>{findSpacesEmpty}</p>
          </div>
        ) : (
          <>
            <div className="sm-feed-tools">
              <div className="sm-feed-search" role="search">
                <label className="sm-search">
                  <Icon name="search" size={15} />
                  <input
                    ref={field}
                    type="search"
                    className="ph-no-capture"
                    placeholder="Search spaces"
                    aria-label="Search spaces"
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    value={query}
                    onChange={(event) => {
                      const next = event.target.value;
                      setQuery(next);
                      setSaid(next.trim() ? spaceSearchSentence(found.filter((space) => matchesSpace(space, next)).length) : "");
                    }}
                  />
                </label>
              </div>
            </div>
            {shown.length ? (
              <ul className="sm-find-list" aria-label="Public spaces">
                {shown.map((space) => (
                  <FoundSpaceCard key={space.id} space={space} joined={joined.has(space.id)} justJoined={justJoined === space.id} busy={joining === space.id} onJoin={() => void join(space)} />
                ))}
              </ul>
            ) : (
              <div className="sm-feed-nomatch">
                <p>No spaces match that search.</p>
                <button
                  type="button"
                  className="sm-button cursor-interaction"
                  onClick={() => {
                    setQuery("");
                    setSaid("");
                    field.current?.focus();
                  }}
                >
                  Clear search
                </button>
              </div>
            )}
          </>
        )}
        {problem ? (
          <p key={attempt} className="sm-field-error" role="alert">
            {problem}
          </p>
        ) : null}
        {/* What's read out can name a space, so screen replays don't record it (M-08). */}
        <p className="sm-live ph-no-capture" role="status">
          {said}
        </p>
      </main>
    </div>
  );
}
