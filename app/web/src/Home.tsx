// The list (E-03, M2-7): the home page, from the prototype's feed (renderHome
// and post in docs/prototype/source/steelman-refined.html). It lists the
// boards you're on, the most recently changed first; each shows who owns it,
// how long ago it changed, its question (a link to the board), its options
// with how many arguments each has, its open comment count, and a miniature
// of the board's shape. Spaces, the activity score, and who's here come with
// spaces (T3, T4), so they don't appear.
//
// Search and Sort (M3d-13; E-03, E-04, E-05) sit above the list, as GitHub's
// repository list has them: a wide "Find a repository…" field (from memory),
// then Filters and a Sort button whose "Select order" menu offers Last
// updated, Name, and Stars (checked live on Nov 25). The menu marks the
// chosen order with a check, as Google Drive's sort menu does (from memory,
// since Drive needs a sign-in; its help page, read live on Nov 25, says only
// that columns and a sorting options menu sort the list). The
// field's label and placeholder are the prototype's "Search steelmen", and
// the way out of an empty search is Gmail's "Clear search" (from memory). The
// prototype put the field in the site header, but only Home has a list to
// search, so it sits on the page. Typing filters the list in the browser
// (listSearch.ts), so the search text reaches neither the service nor
// PostHog: the field carries ph-no-capture, nothing echoes the text on the
// page, and it's held in this page's memory only, so it's there after Back
// but never stored. Posts a filter or a sort keeps slide to their new places
// with flip(), posts it drops fade out from where they stood, and posts it
// brings back fade in. A post's comment count is the board's own (list.ts).
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
import type { RefObject } from "react";
import type { BoardList, BoardListing } from "@steelman/shared";
import { listBoards } from "./api.ts";
import { Icon } from "./icons.tsx";
import { NEW_PATH, boardPath } from "./links.ts";
import { ago, fullDate } from "./when.ts";
import { HOME_PLACE, rememberPlace } from "./places.ts";
import { heldList, listScroll, noteOpening, plainClick, rememberList, takeReturn } from "./opening.ts";
import { shrinkInto } from "./board/zoom.ts";
import { captureRects, duration, flip, play, reducedMotion } from "./board/motion.ts";
import type { Rects } from "./board/motion.ts";
import { useExit } from "./board/drawer.ts";
import { SORTS, matches, readSort, saveSort, searchSentence, sortBoards, sortSentence } from "./listSearch.ts";
import type { ListSort } from "./listSearch.ts";

/** The posts flip() moves when a search or a sort changes the list. */
const POSTS = ".sm-feed-list > .sm-post";

/** What the reader last searched for, in this page's memory only: there again after Back, and never stored or sent. */
let heldQuery = "";

/** A post that a change drops, copied as it was drawn, and where it stood among the list's results. */
interface Dropped {
  copy: HTMLElement;
  x: number;
  y: number;
}

export function Home({ onOpen }: { onOpen?(path: string): void }) {
  const [list, setList] = useState<BoardList | "signed_out" | "failed" | null>(() => heldList());
  const [query, setQuery] = useState(() => heldQuery);
  const [sort, setSort] = useState<ListSort>(readSort);
  const [said, setSaid] = useState("");
  const results = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  /** Where the posts stood before the reader's change, and copies of those it drops, for the layout effect below. */
  const moving = useRef<{ rects: Rects; dropped: Dropped[] } | null>(null);
  const boards = typeof list === "object" && list !== null ? list.boards : [];

  // A search or a sort the reader makes. The posts' places are taken first, so they can slide from there.
  const change = (next: { query?: string; sort?: ListSort }) => {
    const root = results.current;
    if (root && !reducedMotion()) {
      const kept = new Set(boards.filter((board) => matches(board, next.query ?? query)).map((board) => boardPath(board.id)));
      const origin = root.getBoundingClientRect();
      const dropped = [...root.querySelectorAll<HTMLElement>(POSTS)].flatMap((post) => {
        const path = post.querySelector("h2 a")?.getAttribute("href");
        if (!path || kept.has(path)) return [];
        const box = post.getBoundingClientRect();
        return [{ copy: copyOfPost(post), x: box.left - origin.left, y: box.top - origin.top }];
      });
      moving.current = { rects: captureRects(root, POSTS), dropped };
    }
    if (next.query !== undefined) {
      heldQuery = next.query;
      setQuery(next.query);
      setSaid(next.query.trim() ? searchSentence(boards.filter((board) => matches(board, next.query!)).length) : "");
    }
    if (next.sort !== undefined) {
      saveSort(next.sort);
      setSort(next.sort);
      setSaid(sortSentence(next.sort));
    }
  };
  // Only after a change the reader made: the first drawing, Back, and a fresh read of the list move nothing.
  useLayoutEffect(() => {
    const was = moving.current;
    moving.current = null;
    const root = results.current;
    if (!was || !root) return;
    const { arrivals } = flip(was.rects, root, { selector: POSTS });
    for (const post of arrivals) play(post, [{ opacity: 0 }, { opacity: 1 }]);
    const layer = root.querySelector(":scope > .sm-feed-leaving");
    for (const { copy, x, y } of was.dropped) {
      if (!layer) break;
      layer.appendChild(copy);
      const at = `translate(${Math.round(x * 100) / 100}px, ${Math.round(y * 100) / 100}px)`;
      const fade = play(copy, [{ transform: at, opacity: 1 }, { transform: at, opacity: 0 }], { duration: duration("leave", root), fill: "forwards" });
      if (!fade) copy.remove();
      else void fade.finished.then(() => copy.remove(), () => copy.remove());
    }
  }, [query, sort]);
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
            <p>Steelman couldn’t load your steelmen.</p>
            <button type="button" className="sm-button cursor-interaction" onClick={() => (setList(null), load())}>
              Try again
            </button>
          </div>
        ) : list.boards.length === 0 ? (
          <div className="sm-feed-empty">
            <p>You have no steelmen yet.</p>
            <a className="sm-button sm-solid cursor-interaction" href={NEW_PATH}>
              <Icon name="plus" size={14} />
              New steelman
            </a>
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
                    placeholder="Search steelmen"
                    aria-label="Search steelmen"
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    value={query}
                    onChange={(event) => change({ query: event.target.value })}
                  />
                </label>
              </div>
              <SortMenu sort={sort} onSort={(next) => change({ sort: next })} />
            </div>
            <div ref={results} className="sm-feed-results">
              {/* Copies of the posts a change drops fade out here, under the posts, hidden from screen readers and the cursor. */}
              <div className="sm-feed-leaving ph-no-capture" aria-hidden="true" inert />
              {shown(list.boards, sort, query).length ? (
                <ol className="sm-feed-list" aria-labelledby="sm-feed-title">
                  {shown(list.boards, sort, query).map((board) => (
                    <Post key={board.id} board={board} now={list.now} onOpen={onOpen} />
                  ))}
                </ol>
              ) : (
                <div className="sm-feed-nomatch">
                  <p>No steelmen match that search.</p>
                  <button
                    type="button"
                    className="sm-button cursor-interaction"
                    onClick={() => {
                      change({ query: "" });
                      field.current?.focus();
                    }}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
            <p className="sm-live" role="status">
              {said}
            </p>
          </>
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
        {/* The board's open comment count, with the speech bubble its cards use (D-01), where the prototype's post foot has it. */}
        <div className="sm-post-foot">
          <span className="sm-post-comments" title={commentsLabel(board.comments)}>
            <Icon name="message-square" />
            {board.comments}
            <span className="sm-sr"> {board.comments === 1 ? "comment" : "comments"}</span>
          </span>
        </div>
      </div>
      <Thumb options={board.options} />
    </li>
  );
}

/** The posts to draw: the list in the chosen sort, without those the search doesn't match. */
function shown(boards: readonly BoardListing[], sort: ListSort, query: string): BoardListing[] {
  return sortBoards(boards, sort).filter((board) => matches(board, query));
}

function commentsLabel(count: number): string {
  return `${count} ${count === 1 ? "comment" : "comments"}`;
}

/**
 * A copy of a post that a search drops, for its fade. It keeps the post's look and drops every id, link, title, and
 * data or ARIA attribute, so nothing that finds a post's question or a link to a board finds it. It isn't a list
 * item, since it stands outside the list.
 */
function copyOfPost(post: HTMLElement): HTMLElement {
  const copy = document.createElement("div");
  copy.className = `${post.className} sm-post-leaving`;
  copy.append(...[...post.cloneNode(true).childNodes]);
  for (const element of copy.querySelectorAll("*")) {
    for (const { name } of [...element.attributes]) {
      if (name === "id" || name === "href" || name === "title" || name === "tabindex" || name.startsWith("data-") || name.startsWith("aria-")) element.removeAttribute(name);
    }
  }
  return copy;
}

/**
 * The Sort button and its menu (M3d-13, E-04), as GitHub's repository list's Sort and Google Drive's Sort by have
 * them: the button shows the chosen sort after the word Sort, the choices are radio items, the chosen one has a
 * check, and choosing one closes the menu. It opens on the
 * chosen sort, and it moves and closes as an option's ⋯ menu does (OptionMenu.tsx): the arrow keys, Home, and End move
 * between items, Escape closes it and puts the cursor back on Sort, and Tab or a click elsewhere closes it. The down
 * and up arrows open it from the button, as the ARIA menu button pattern has it.
 */
function SortMenu({ sort, onSort }: { sort: ListSort; onSort(next: ListSort): void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="sm-feed-sort">
      <button
        ref={button}
        type="button"
        className="sm-button sm-feed-sort-button cursor-interaction"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          // The menu's own keys listen on the document from the moment it opens, so this press goes no further, or it
          // would move the cursor on from the chosen sort at once.
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name="arrow-up-down" size={14} />
        {/* The chosen sort follows the word, as GitHub's Sort button shows its value, so a reader who comes back sees why the order changed. On a phone the word is said but not drawn, so the field keeps room for its placeholder. */}
        <span className="sm-feed-sort-word">Sort</span>
        <span className="sm-feed-sort-value">{SORTS.find((each) => each.value === sort)?.label}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open ? (
        <SortItems
          sort={sort}
          trigger={button}
          onClose={close}
          onChoose={(next) => {
            close();
            button.current?.focus();
            if (next !== sort) onSort(next);
          }}
        />
      ) : null}
    </div>
  );
}

function SortItems({ sort, trigger, onClose, onChoose }: { sort: ListSort; trigger: RefObject<HTMLButtonElement | null>; onClose(): void; onChoose(next: ListSort): void }) {
  const menu = useRef<HTMLDivElement>(null);
  // It fades out as it closes, as every menu does (M3d-10).
  useExit(menu);
  useLayoutEffect(() => {
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const here = document.activeElement;
      if (!menu.current?.contains(here) && trigger.current !== here) return;
      if (event.key === "Escape" || event.key === "Tab") {
        onClose();
        // Escape stays on Sort. Tab goes on from Sort to what follows it, as the ARIA menu button pattern has it.
        trigger.current?.focus();
        return;
      }
      const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
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
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onClose);
    };
  }, [trigger, onClose]);
  return (
    <div ref={menu} className="sm-menu sm-feed-sort-menu" role="menu" aria-label="Sort steelmen">
      {SORTS.map((each) => (
        <button key={each.value} type="button" role="menuitemradio" aria-checked={each.value === sort} className="sm-menu-item cursor-interaction" onClick={() => onChoose(each.value)}>
          <span>
            {each.label}
            <small>{each.hint}</small>
          </span>
          {each.value === sort ? <Icon name="check" /> : null}
        </button>
      ))}
    </div>
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
 * Skeleton posts while the list's first read is on its way, in the list's own layout: the search field and Sort, then
 * each post's owner and age, question, options, comment count, and miniature, as grey blocks. One status sentence says it to a screen reader, and the blocks are
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
        {/* The search field and Sort, as blocks of their size, so the posts stand where their placeholders stood. */}
        <div className="sm-feed-skeleton-tools" aria-hidden="true">
          <span className="sm-feed-skeleton-search" />
          <span className="sm-feed-skeleton-sort" />
        </div>
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
                <span className="sm-feed-skeleton-bar sm-feed-skeleton-foot" />
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
