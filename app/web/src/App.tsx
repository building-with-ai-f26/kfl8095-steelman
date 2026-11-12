import { useEffect, useState } from "react";
import { Board } from "./board/Board.tsx";
import { Logo } from "./icons.tsx";
import { chooseTestUser, chosenTestUser, listTestUsers } from "./testUser.ts";
import type { TestUser } from "./testUser.ts";

/** Links look like /b/<board ID>. Anything else is the home page, which for now only points to the demo board. */
export function App({ path = typeof window === "undefined" ? "/" : window.location.pathname }: { path?: string }) {
  const board = /^\/b\/([A-Za-z0-9_-]{12})\/?$/.exec(path)?.[1];
  if (!board) {
    return (
      <main>
        <h1>Steelman</h1>
        <p>
          <a href="/b/demo-board-1">Open the demo board</a>
        </p>
      </main>
    );
  }
  return (
    <div id="steelman-study" data-indicator="dossier" data-density="comfortable" data-zoom="read">
      <header className="sm-site">
        <div className="sm-wordmark">
          <Logo />
          steelman.
        </div>
        <TestUserSwitch />
      </header>
      <WhenChosen>
        <Board boardId={board} />
      </WhenChosen>
    </div>
  );
}

/** Draws the board only once the tab is acting as someone, picking the first test account if it isn't yet. */
function WhenChosen({ children }: { children: React.ReactNode }) {
  const [chosen, setChosen] = useState(() => chosenTestUser() !== null);
  useEffect(() => {
    if (chosen) return;
    void listTestUsers().then((users) => {
      if (users[0]) chooseTestUser(users[0].id);
      setChosen(true);
    });
  }, [chosen]);
  return chosen ? children : null;
}

/** No sign-in in M0: each tab picks which test account it acts as (development and tests only). */
function TestUserSwitch() {
  const [users, setUsers] = useState<TestUser[]>([]);
  useEffect(() => {
    void listTestUsers().then(setUsers);
  }, []);
  if (users.length === 0) return null;
  return (
    <label className="sm-test-user">
      <span>Acting as</span>
      <select
        value={chosenTestUser() ?? ""}
        onChange={(event) => {
          chooseTestUser(event.target.value);
          window.location.reload();
        }}
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.username}
          </option>
        ))}
      </select>
    </label>
  );
}
