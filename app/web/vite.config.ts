import { readFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const docs = join(import.meta.dirname, "../../docs");
const PROTOTYPE = join(docs, "prototype/source/steelman-refined.html");
const TOKENS = join(docs, "design/tokens.css");
const TOKENS_MARKER = "/* @tokens: docs/design/tokens.css is inserted here by scripts/sync-prototype.py */";
const FONTS = /^\s*@import url\('https:\/\/fonts\.googleapis\.com[^\n]*\n/m;

/**
 * `import "virtual:prototype.css"` gives the prototype's own stylesheet, with
 * the design tokens put in where scripts/sync-prototype.py puts them. So the
 * board screen reuses the prototype's look as it is, from one source, and a
 * change to the prototype's CSS reaches the app (plans/architecture.md §4).
 *
 * The browser tests build without the web fonts, so they need no network and
 * their screenshots don't depend on whether the fonts arrived.
 */
function prototypeStyles(mode: string): Plugin {
  const id = join(import.meta.dirname, "src/prototype.generated.css");
  return {
    name: "steelman-prototype-styles",
    resolveId: (source) => (source === "virtual:prototype.css" ? id : null),
    load(loading) {
      if (loading !== id) return null;
      this.addWatchFile(PROTOTYPE);
      this.addWatchFile(TOKENS);
      const html = readFileSync(PROTOTYPE, "utf8");
      const css = html.slice(html.indexOf("<style>") + "<style>".length, html.indexOf("</style>"));
      if (!css.includes(TOKENS_MARKER)) throw new Error("The prototype's stylesheet has lost its design-tokens marker");
      const withTokens = css.replace(TOKENS_MARKER, readFileSync(TOKENS, "utf8"));
      return mode === "test" ? withTokens.replace(FONTS, "") : withTokens;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), prototypeStyles(mode)],
  server: {
    port: 5173,
    strictPort: true,
    // In development the page comes from Vite and the API from the service,
    // so the browser still sees one address, as it will in production.
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
}));
