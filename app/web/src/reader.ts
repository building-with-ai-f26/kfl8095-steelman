// Who is reading: the account signed in, or the test account the tab acts
// as. The board uses it to mark what's theirs (a source's "You" tag) and to
// offer what only an author may do. The service decides; this only draws.

import { createContext, useContext } from "react";

export const ReaderContext = createContext<string | null>(null);

/** The reader's account ID, or null outside a signed-in page. */
export function useReader(): string | null {
  return useContext(ReaderContext);
}
