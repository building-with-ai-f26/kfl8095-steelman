// The list (E-03, M2-7): the home page, from the prototype's feed (renderHome
// and post in docs/prototype/source/steelman-refined.html). It lists the
// boards you're on, the most recently changed first; each shows who owns it,
// how long ago it changed, its question (a link to the board), its options
// with how many arguments each has, and a miniature of the board's shape.
// Spaces, sorting, the activity score, comments, and who's here come with
// spaces and comments (T3, T4), so they don't appear.
//
// A plain click on a question opens its board inside the page, from the rect
// of the post's miniature, or of the post on a phone, where no miniature is
// drawn (M3d-9, E-07). Coming back by Back or the wordmark, Home draws the
// list it already holds at once, with any board the reader wrote to at the
// top, scrolled as it was left, and the board's copy shrinks into its post.
// The cursor goes back to that post's question. The list is then read again.
// When the post is off screen or isn't drawn, nothing shrinks: the board's
// copy fades and the list rises, the ordinary page transition (M3d-11).
//
// While the list's first read is on its way, skeleton posts stand in the
// list's own layout (M3d-11, E-03), as the board's skeleton does (M3d-10,
// board/Skeleton.tsx). GitHub's repository list, read live on Nov 25, draws
// five skeleton rows in a row's own shape (a name, a description, and a
// metadata line) while a filter reads; Google Docs' home draws grey rows too
// (from memory, since it needs a sign-in). A list post lifts a pixel under the
// pointer, as a card on the board does (app.css); GitHub only tints the row.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BoardList, BoardListing } from "@steelman/shared";
import { listBoards } from "./api.ts";
import { Icon } from "./icons.tsx";
import { NEW_PATH, boardPath } from "./links.ts";
import { ago, fullDate } from "./when.ts";
import { HOME_PLACE, rememberPlace } from "./places.ts";
import { heldList, listScroll, noteOpening, plainClick, rememberList, takeReturn } from "./opening.ts";
import { shrinkInto } from "./board/zoom.ts";
import { play } from "./board/motion.ts";

export function Home({ onOpen }: { onOpen?(path: string): void }) {
  const [list, setList] = useState<BoardList | "signed_out" | "failed" | null>(() => heldList());
  const load = useCallback(() => {
    void listBoards().then((answer) => {
      if (typeof answer === "object") rememberList(answer);
      setList(answer);
    });
  }, []);
  useEffect(load, [load]);
  const page = useRef<HTMLDivElement>(null);
  // Back from a board opened here: the list as it was scrolled, the board shrinking into its post, and the cursor on it.
  // When there's no post on screen to shrink into, the list rises into place instead, as the other pages arrive.
  useLayoutEffect(() => {
    const back = takeReturn();
    if (!back) return;
    const question = document.querySelector<HTMLElement>(`.sm-post h2 a[href="${boardPath(back.board)}"]`);
    if (question) window.scrollTo(0, listScroll());
    const shrink = back.closing ? shrinkInto(back.closing, question ? miniatureOf(question) : null) : null;
    if (!shrink && page.current) play(page.current, [{ translate: "0 4px" }, { translate: "0 0" }]);
    question?.focus({ preventScroll: true });
  }, []);
  // Back from a board can bring this page back as it was left (the browser's back/forward cache), so ask again.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) load();
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, [load]);

  // The list is where detours lead back to when there's nowhere else (M3a-1).
  useEffect(() => rememberPlace(() => HOME_PLACE), []);
  if (list === null) return <HomeSkeleton />;
  if (list === "signed_out") return <p className="sm-meta">You’ve been signed out. Reload the page to sign in.</p>;
  return (
    <div ref={page} className="sm-home sm-home-alone">
      <main className="sm-feed">
        <h1 id="sm-feed-title" className="sm-sr">
          Your steelmen
        </h1>
        {list === "failed" ? (
          <div className="sm-feed-empty" role="alert">
            <p>Couldn’t load your steelmen.</p>
            <button type="button" className="sm-button cursor-interaction" onClick={() => (setList(null), load())}>
              Try again
            </button>
          </div>
        ) : list.boards.length === 0 ? (
          <div className="sm-feed-empty">
            <p>No steelmen yet.</p>
            <a className="sm-button sm-solid cursor-interaction" href={NEW_PATH}>
              <Icon name="plus" size={14} />
              New steelman
            </a>
          </div>
        ) : (
          <ol className="sm-feed-list" aria-labelledby="sm-feed-title">
            {list.boards.map((board) => (
              <Post key={board.id} board={board} now={list.now} onOpen={onOpen} />
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}

function Post({ board, now, onOpen }: { board: BoardListing; now: string; onOpen: ((path: string) => void) | undefined }) {
  return (
    <li className="sm-post">
      <div className="sm-post-body">
        <div className="sm-post-meta">
          {/* Who owns it, as Google Drive's list shows ("me" there, "You" here); the prototype's author goes here. */}
          <span className="sm-post-owner ph-no-capture">{board.role === "owner" ? "You" : board.owner}</span>
          <span className="sm-dot" />
          <time dateTime={board.changedAt} title={fullDate(board.changedAt)}>
            Updated {ago(board.changedAt, now)}
          </time>
          {/* The prototype's small pill for a closed board (M3b-5, I-05). */}
          {board.closing?.closed ? (
            <span className="sm-post-closed">
              <Icon name="lock" />
              Closed
            </span>
          ) : null}
        </div>
        <h2>
          <a
            className="cursor-interaction"
            href={boardPath(board.id)}
            onClick={(event) => {
              if (!onOpen || !plainClick(event)) return;
              event.preventDefault();
              noteOpening(board.id, miniatureOf(event.currentTarget));
              onOpen(boardPath(board.id));
            }}
          >
            {board.question}
          </a>
        </h2>
        <ul className="sm-post-options" aria-label="Options and how many arguments each has">
          {board.options.map((option, i) => (
            <li key={i} className={option.arguments < 2 ? "sm-thin" : undefined}>
              {option.name}
              <b title={`${option.arguments} ${option.arguments === 1 ? "argument" : "arguments"}`}>{option.arguments}</b>
            </li>
          ))}
        </ul>
      </div>
      <Thumb options={board.options} />
    </li>
  );
}

/** Where a post's miniature is drawn in the window, or the post itself where the miniature isn't drawn (on a phone). */
function miniatureOf(question: Element): { left: number; top: number; width: number; height: number } {
  const post = question.closest(".sm-post") ?? question;
  const thumb = post.querySelector(".sm-thumb")?.getBoundingClientRect();
  const { left, top, width, height } = thumb?.width ? thumb : post.getBoundingClientRect();
  return { left, top, width, height };
}

/** A miniature of the board: the question, then a column per option with a card for each argument, up to three. */
function Thumb({ options }: { options: BoardListing["options"] }) {
  return (
    <span className="sm-thumb" data-canvas="stone" aria-hidden="true">
      <span className="sm-thumb-q" />
      <span className="sm-thumb-cols">
        {options.map((option, i) => (
          <span key={i} className="sm-thumb-col">
            <i />
            {option.arguments === 0 ? <b className="sm-thumb-empty" /> : Array.from({ length: Math.min(option.arguments, 3) }, (_, n) => <b key={n} />)}
          </span>
        ))}
      </span>
    </span>
  );
}

/** How many placeholder posts the skeleton shows, and how many options each has. */
const PLACEHOLDERS = [3, 2, 2] as const;

/**
 * Skeleton posts while the list's first read is on its way, in the list's own layout: the owner and age, the question,
 * the options, and the miniature, as grey blocks. One status sentence says it to a screen reader, and the blocks are
 * hidden from it and marked busy, as the board's skeleton does (M3d-10). They fade in after twice --sm-slow, so a
 * quick read shows nothing, and then pulse gently; under reduced motion they are drawn at once and stay still. The page
 * and its column are the list's own, so the posts stand where their placeholders stood, but nothing here is the list,
 * a post, or a question, so nothing that finds those finds these.
 */
function HomeSkeleton() {
  const [said, setSaid] = useState(false);
  useEffect(() => setSaid(true), []);
  return (
    <div className="sm-home sm-home-alone">
      <main className="sm-feed sm-feed-skeleton">
        <h1 className="sm-sr">Your steelmen</h1>
        <div className="sm-feed-skeleton-posts" aria-hidden="true" aria-busy="true">
          {PLACEHOLDERS.map((options, at) => (
            <div key={at} className="sm-feed-skeleton-post">
              <div className="sm-feed-skeleton-body">
                <span className="sm-feed-skeleton-bar sm-feed-skeleton-meta" />
                <span className="sm-feed-skeleton-bar sm-feed-skeleton-question" />
                <span className="sm-feed-skeleton-options">
                  {Array.from({ length: options }, (_, n) => (
                    <span key={n} className="sm-feed-skeleton-bar sm-feed-skeleton-option" />
                  ))}
                </span>
              </div>
              <span className="sm-feed-skeleton-thumb" />
            </div>
          ))}
        </div>
        <p className="sm-live" role="status">
          {said ? "Your steelmen are loading." : ""}
        </p>
      </main>
    </div>
  );
}
