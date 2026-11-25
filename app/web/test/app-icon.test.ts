/// <reference types="node" />
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// The app's icon (M3d-1, M-05). The built page carries the honeycomb mark
// from docs/design/logo.svg as an inline SVG icon that turns light on a dark
// tab bar, a touch icon that Vite writes under /assets/, and one theme colour
// for a light system theme and one for a dark one, all taken from tokens.css.
// The icon's SVG is read by Playwright's Chromium, the browser the browser
// tests already drive, so a mark that a browser can't parse or draw fails here.

const docs = join(import.meta.dirname, "../../../docs/design");
const tag = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];
const attributes = (element: string) => Object.fromEntries([...element.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
const rels = (element: string) => (attributes(element).rel ?? "").trim().split(/\s+/);
const token = (tokens: string, name: string) => tokens.match(new RegExp(`${name}:\\s*(#[0-9a-f]+)`, "i"))?.[1];

/** True when every tag opens and closes in order and no stray `<` is left in the text. */
function wellFormed(xml: string): boolean {
  const open: string[] = [];
  const rest = xml.replace(/<(\/?)([a-zA-Z][\w-]*)\b[^<>]*?(\/?)>/g, (_whole, closing: string, name: string, selfClosing: string) => {
    if (closing) {
      if (open.pop() !== name) open.push("<mismatch>");
    } else if (!selfClosing) open.push(name);
    return "";
  });
  return open.length === 0 && !rest.includes("<") && !rest.includes(">");
}

/** What a browser makes of the icon: its parse, whether it draws as an image, and its parts. */
type Parsed = {
  parseError: string | null;
  root: string;
  namespace: string | null;
  drawn: boolean;
  width: number;
  polygons: Record<string, string>[];
  styles: string[];
};

describe("the app's icon", () => {
  let outDir = "";
  let html = "";
  let tokens = "";
  let logo = "";
  let browser: Browser | undefined;

  /** Parses the icon with the browser's own XML parser and draws it as an image. */
  async function parse(icon: string): Promise<Parsed> {
    browser ??= await chromium.launch();
    const page = await browser.newPage();
    try {
      return await page.evaluate(async (source) => {
        const doc = new DOMParser().parseFromString(source, "image/svg+xml");
        const image = new Image();
        image.src = `data:image/svg+xml,${encodeURIComponent(source)}`;
        const drawn = await image.decode().then(
          () => true,
          () => false,
        );
        return {
          parseError: doc.querySelector("parsererror")?.textContent ?? null,
          root: doc.documentElement.localName,
          namespace: doc.documentElement.namespaceURI,
          drawn,
          width: image.naturalWidth,
          polygons: [...doc.querySelectorAll("polygon")].map((polygon) => Object.fromEntries([...polygon.attributes].map((attribute) => [attribute.name, attribute.value]))),
          styles: [...doc.querySelectorAll("style")].map((style) => style.textContent ?? ""),
        };
      }, icon);
    } finally {
      await page.close();
    }
  }

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "steelman-icon-web-"));
    await build({ root: join(import.meta.dirname, ".."), mode: "test", logLevel: "warn", build: { outDir, emptyOutDir: true } });
    html = await readFile(join(outDir, "index.html"), "utf8");
    tokens = await readFile(join(docs, "tokens.css"), "utf8");
    logo = await readFile(join(docs, "logo.svg"), "utf8");
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    await rm(outDir, { recursive: true, force: true });
  });

  // Any link whose rel names an icon, "shortcut icon" and "alternate icon" included.
  const icons = () => tag(html, "link").filter((link) => rels(link).includes("icon"));
  const svg = () => {
    const href = attributes(icons()[0] ?? "").href ?? "";
    expect(href.startsWith("data:image/svg+xml,")).toBe(true);
    return decodeURIComponent(href.slice("data:image/svg+xml,".length));
  };

  test("M-05: the page has exactly one icon link, an SVG written into the page", () => {
    expect(icons()).toHaveLength(1);
    expect(attributes(icons()[0] ?? "").type).toBe("image/svg+xml");
  });

  test("M-05: the icon's SVG is well formed and draws every hexagon of the mark in docs/design/logo.svg", async () => {
    const icon = svg();
    expect(icon.startsWith("<svg xmlns='http://www.w3.org/2000/svg'")).toBe(true);
    expect(icon.endsWith("</svg>")).toBe(true);
    expect(wellFormed(icon)).toBe(true);
    // The browser parses it as SVG with no error and draws it as an image.
    const parsed = await parse(icon);
    expect(parsed.parseError).toBeNull();
    expect(parsed.root).toBe("svg");
    expect(parsed.namespace).toBe("http://www.w3.org/2000/svg");
    expect(parsed.drawn).toBe(true);
    expect(parsed.width).toBeGreaterThan(0);
    expect(parsed.polygons).toHaveLength(4);
    // A square box around the mark, so the browser doesn't squash it.
    const [, , width, height] = (icon.match(/viewBox='([^']+)'/)?.[1] ?? "").split(" ").map(Number);
    expect(width).toBeGreaterThan(0);
    expect(width).toBe(height);
    const points = [...logo.matchAll(/points="([^"]+)"/g)].map(([, value]) => value);
    expect(points).toHaveLength(4);
    for (const value of points) expect(icon, value).toContain(`points='${value}'`);
    expect(icon).toContain("stroke-dasharray='.5 .5'");
  }, 60_000);

  test("M-05: the mark is ink on a light tab and turns light on a dark one, both colours from tokens.css", async () => {
    const icon = svg();
    const ink = token(tokens, "--sm-ink");
    const card = token(tokens, "--sm-card");
    expect(ink).toBeDefined();
    expect(card).toBeDefined();
    expect(icon).toContain(`color='${ink}'`);
    const parsed = await parse(icon);
    // Every hexagon draws in currentColor, so the dark rule recolours the whole mark.
    expect(parsed.polygons).toHaveLength(4);
    for (const polygon of parsed.polygons) {
      expect(["currentColor", "none"], polygon.points).toContain(polygon.fill);
      if (polygon.stroke !== undefined) expect(polygon.stroke, polygon.points).toBe("currentColor");
      expect(polygon.fill !== "none" || polygon.stroke !== undefined, polygon.points).toBe(true);
    }
    // The only colours in the icon are the two tokens.
    expect(new Set(icon.match(/#[0-9a-f]{3,8}\b/gi))).toEqual(new Set([ink, card]));
    // The dark rule sits inside the SVG's own <style>.
    expect(parsed.styles).toHaveLength(1);
    const dark = parsed.styles[0]?.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*svg\s*\{\s*color:\s*(#[0-9a-f]+)/i)?.[1];
    expect(dark).toBe(card);
  }, 60_000);

  test("M-05: the page has one touch icon, a 180 px opaque PNG that Vite wrote under /assets/", async () => {
    const touch = tag(html, "link").filter((link) => rels(link).includes("apple-touch-icon"));
    expect(touch).toHaveLength(1);
    const href = attributes(touch[0] ?? "").href ?? "";
    expect(href).toMatch(/^\/assets\/[\w-]+\.png$/);
    const png = await readFile(join(outDir, href));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.toString("ascii", 12, 16)).toBe("IHDR");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
    // Colour type 2 is RGB with no alpha: iOS fills a transparent corner with black.
    expect(png[25]).toBe(2);
  });

  test("M-05: the page has two theme colours, one for a light system theme and one for a dark one, from tokens.css", () => {
    const themes = tag(html, "meta").map(attributes).filter((meta) => meta.name === "theme-color");
    expect(themes).toHaveLength(2);
    expect(themes.map((meta) => [meta.media, meta.content])).toEqual([
      ["(prefers-color-scheme: light)", token(tokens, "--sm-card")],
      ["(prefers-color-scheme: dark)", token(tokens, "--sm-ink")],
    ]);
  });
});
