// The first-visit notice (M-08), as on the Product Page: bottom left, until
// the person chooses OK or Turn off. Shown only when analytics are running and
// no choice has been made (analytics.ts).

import { useEffect, useState } from "react";
import { chooseAnalytics, startAnalytics } from "./analytics.ts";

export function AnalyticsNotice() {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    let live = true;
    void startAnalytics().then((decision) => live && setAsking(decision === "ask"));
    return () => {
      live = false;
    };
  }, []);
  if (!asking) return null;

  const choose = (on: boolean) => {
    chooseAnalytics(on);
    setAsking(false);
  };
  return (
    <div className="sm-analytics-notice" role="region" aria-label="Analytics">
      <p>Steelman records anonymous usage and screen replays to improve it. Typed text is hidden.</p>
      <div className="sm-analytics-choices">
        <button type="button" className="sm-analytics-off cursor-interaction" onClick={() => choose(false)}>
          Turn off
        </button>
        <button type="button" className="sm-analytics-ok cursor-interaction" onClick={() => choose(true)}>
          OK
        </button>
      </div>
    </div>
  );
}
