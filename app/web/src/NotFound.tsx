// A link to a board that doesn't exist (M-06), as the prototype draws it
// (notFoundMarkup in docs/prototype/source/steelman-refined.html), except
// that it leads to New steelman, as it did before the list (E-03) came.

import { NEW_PATH } from "./links.ts";
import { AuthCard } from "./signIn/AuthCard.tsx";

export function NotFound() {
  return (
    <AuthCard label="Not found">
      <h1 className="sm-auth-title sm-auth-signin">This steelman doesn’t exist</h1>
      <p className="sm-auth-text">It may have been deleted, or the link is incomplete.</p>
      <a className="sm-button sm-solid cursor-interaction" href={NEW_PATH}>
        New steelman
      </a>
      <a className="sm-link-button cursor-interaction" href="/">
        Go to Your steelmen
      </a>
    </AuthCard>
  );
}
