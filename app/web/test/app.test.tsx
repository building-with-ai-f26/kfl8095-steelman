import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { App } from "../src/App.tsx";

test("M0-1: the placeholder page renders", () => {
  const html = renderToString(<App />);

  expect(html).toContain("<h1>Steelman</h1>");
});
