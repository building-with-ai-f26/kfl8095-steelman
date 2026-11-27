// A name that leads to its person's profile (L-03, M3d-16), as the
// prototype's userLink makes each byline, History name, and person in the
// people list a link, and as GitHub's and Wikipedia's usernames link to the
// person's page. It keeps the look of the text around it, with an underline
// only on hover (app.css), so the board's saved screenshots don't change. A
// missing name and the deleted stand-in have no profile, so they stay text.
//
// ph-no-capture: PostHog's autocapture would send the clicked name and its
// address, and a username is about a person (M-08).

import type { ReactNode } from "react";
import { hasProfile, profilePath } from "./links.ts";

export function UserLink({ name, children }: { name: string | null | undefined; children?: ReactNode }) {
  const shown = children ?? name ?? "";
  if (!hasProfile(name)) return <>{shown}</>;
  return (
    <a className="sm-user-link ph-no-capture" href={profilePath(name)}>
      {shown}
    </a>
  );
}
