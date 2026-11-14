// The sign-in screens' page: the blue dotted canvas, and the form in a raised card.

import type { ReactNode } from "react";

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="sm-landing" data-canvas="cool">
      <div className="sm-landing-inner">
        <section className="sm-rail-card sm-landing-auth" aria-label="Sign in">
          {children}
        </section>
      </div>
    </main>
  );
}
