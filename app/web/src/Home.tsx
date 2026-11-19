// The list (E-03, M2-7): the home page, from the prototype's feed (renderHome
// and post in docs/prototype/source/steelman-refined.html). It lists the
// boards you're on, the most recently changed first; each shows your role,
// how long ago it changed, its question (a link to the board), its options
// with how many arguments each has, and a miniature of the board's shape.
// Spaces, sorting, the activity score, comments, and who's here come with
// spaces and comments (T3, T4), so they don't appear.

import { useCallback, useEffect, useState } from "react";
import type { BoardList, BoardListing, Role } from "@steelman/shared";
import { listBoards } from "./api.ts";
import { Icon } from "./icons.tsx";
import { NEW_PATH, boardPath } from "./links.ts";
import { ago, fullDate } from "./when.ts";

/** Each role in Share's words. */
const ROLE: Record<Role, string> = { owner: "Owner", editor: "can edit", contributor: "can contribute", voter: "can vote", viewer: "can view" };

export function Home() {
  const [list, setList] = useState<BoardList | "signed_out" | "failed" | null>(null);
  const load = useCallback(() => {
    void listBoards().then(setList);
  }, []);
  useEffect(load, [load]);
  // Back from a board can bring this page back as it was left (the browser's back/forward cache), so ask again.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) load();
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, [load]);

  if (list === null) return null;
  if (list === "signed_out") return <p className="sm-meta">You’ve been signed out. Reload the page to sign in.</p>;
  return (
    <div className="sm-home sm-home-alone">
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
              <Post key={board.id} board={board} now={list.now} />
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}

function Post({ board, now }: { board: BoardListing; now: string }) {
  return (
    <li className="sm-post">
      <div className="sm-post-body">
        <div className="sm-post-meta">
          <span className="sm-tag">{ROLE[board.role]}</span>
          <time dateTime={board.changedAt} title={fullDate(board.changedAt)}>
            Updated {ago(board.changedAt, now)}
          </time>
        </div>
        <h2>
          <a className="cursor-interaction" href={boardPath(board.id)}>
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
