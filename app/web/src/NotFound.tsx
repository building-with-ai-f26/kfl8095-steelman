// A link to a board that doesn't exist (M-06), as the prototype draws it
// (notFoundMarkup in docs/prototype/source/steelman-refined.html). M1 has no
// list of your steelmen to go back to, so it leads to New steelman instead.

import { AuthCard } from "./signIn/AuthCard.tsx";

export function NotFound() {
  return (
    <AuthCard label="Not found">
      <h1 className="sm-auth-title sm-auth-signin">This steelman doesn’t exist</h1>
      <p className="sm-auth-text">It may have been deleted, or the link is incomplete.</p>
      <a className="sm-button sm-solid cursor-interaction" href="/">
        New steelman
      </a>
    </AuthCard>
  );
}
