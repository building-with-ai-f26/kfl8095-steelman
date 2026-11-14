import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { App } from "../src/App.tsx";

// The placeholder home page this checked was replaced by New steelman in M1-6 (the builder approved this change, Nov 14).
test("M0-1: the home page renders, with Steelman's top bar", () => {
  const html = renderToString(<App />);

  expect(html).toContain('class="sm-wordmark"');
  expect(html).toContain("steelman.");
});
