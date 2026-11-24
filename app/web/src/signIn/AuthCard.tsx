// The sign-in screens' page: the blue dotted canvas, and the form in a raised
// card. A link to a board that doesn't exist uses it too (NotFound.tsx), and
// so does one to a board this account may not open (NoAccess.tsx).

import type { ReactNode } from "react";

export function AuthCard({ children, label = "Sign in" }: { children: ReactNode; label?: string }) {
  return (
    <main className="sm-landing" data-canvas="cool">
      <div className="sm-landing-inner">
        <section className="sm-rail-card sm-landing-auth" aria-label={label}>
          {children}
        </section>
      </div>
    </main>
  );
}
