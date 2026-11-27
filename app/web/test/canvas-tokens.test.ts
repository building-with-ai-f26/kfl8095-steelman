/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

// Map contours on the canvas (M3d-21, M-05, G-02). scripts/make-contours.py
// draws the tile in three sets of lines, as topographic maps do: every fifth
// level is an index contour, drawn 1.5 px at about twice the opacity of the
// others, and a finer set halfway between levels is drawn at half the
// opacity. The tile is still a seamless 480 px square, embedded in tokens.css
// as --sm-contours. A light falloff, --sm-canvas-light, comes first in every
// canvas's list of layers, so it reaches each place the canvas shows, and
// every list of layer sizes keeps one size per layer. It is lit at the top
// centre and shades to a little black at its edge, so the edges read darker
// than the plain tint (the builder chose darker edges on Nov 27), and muted and
// quiet text keep 4.6:1 there.

const docs = join(import.meta.dirname, "../../../docs/design");
const prototype = join(import.meta.dirname, "../../../docs/prototype/source/steelman-refined.html");

let tokens = "";
let styles = "";
beforeAll(async () => {
  tokens = await readFile(join(docs, "tokens.css"), "utf8");
  styles = await readFile(prototype, "utf8");
});

/** A custom property's value in a block of CSS, or undefined. */
const property = (css: string, name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
/** Splits a CSS list on its top-level commas, leaving commas inside brackets alone. */
function layers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") depth--;
    else if (value[i] === "," && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out;
}
const attributes = (element: string): Record<string, string | undefined> => Object.fromEntries([...element.matchAll(/([a-zA-Z-]+)='([^']*)'/g)].map(([, name, value]) => [name, value]));

/** The contour tile, decoded from its data URI in tokens.css. */
function tile(): string {
  const uri = tokens.match(/--sm-contours:url\("data:image\/svg\+xml,([^"]*)"\)/)?.[1];
  if (!uri) throw new Error("tokens.css has no --sm-contours data URI");
  return decodeURIComponent(uri);
}

interface Contours {
  opacity: number;
  width: number;
  /** Each polyline's points, in px. */
  lines: [number, number][][];
}

function contourSets(svg: string): Contours[] {
  return [...svg.matchAll(/<path\b[^>]*>/g)].map(([element]) => {
    const a = attributes(element);
    const lines = (a.d ?? "")
      .split("M")
      .filter(Boolean)
      .map((line: string) => line.split("L").map((point: string) => point.trim().split(/\s+/).map(Number) as [number, number]));
    return { opacity: Number(a["stroke-opacity"]), width: Number(a["stroke-width"]), lines };
  });
}

/**
 * Where a set of lines meets one edge of the tile: the other coordinate of each
 * point on it, sorted. The script rounds to 0.1 px, so a crossing beside a corner
 * of its sampling grid can round onto the edge as a second point a few tenths
 * away; points closer than half a pixel are taken as one crossing.
 */
function crossings(set: Contours, axis: 0 | 1, at: number): number[] {
  const along = set.lines
    .flat()
    .filter((point) => Math.abs(point[axis] - at) < 0.001)
    .map((point) => point[1 - axis]!)
    .sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of along) {
    const last = groups.at(-1);
    if (last && value - last.at(-1)! <= 0.5) last.push(value);
    else groups.push([value]);
  }
  return groups.map((group) => group[0]!);
}

describe("the contour tile", () => {
  test("M-05, G-02: the tile is still a 480 px square", () => {
    const svg = attributes(tile().match(/<svg\b[^>]*>/)![0]);
    expect([svg.width, svg.height, svg.viewBox]).toEqual(["480", "480", "0 0 480 480"]);
  });

  test("M-05, G-02: index contours are drawn 1.5 px at about twice the opacity of the others, and fine contours at half", () => {
    const sets = contourSets(tile());
    expect(sets).toHaveLength(3);
    const index = sets.find((set) => set.width === 1.5);
    const others = sets.filter((set) => set !== index).sort((a, b) => b.opacity - a.opacity);
    const [regular, fine] = others;
    expect(index, "an index set at 1.5 px").toBeDefined();
    expect(regular!.width).toBe(1);
    expect(index!.opacity / regular!.opacity).toBeGreaterThanOrEqual(1.8);
    expect(index!.opacity / regular!.opacity).toBeLessThanOrEqual(2.2);
    expect(fine!.opacity).toBeCloseTo(regular!.opacity / 2, 5);
    // Every set draws lines, and index levels (one in five) are fewer than the regular ones.
    for (const set of sets) expect(set.lines.length).toBeGreaterThan(0);
    expect(index!.lines.length).toBeLessThan(regular!.lines.length);
  });

  test("M-05, G-02: every set of lines meets the top edge where it meets the bottom, and the left where it meets the right, so the tile has no seam", () => {
    for (const set of contourSets(tile())) {
      for (const axis of [0, 1] as const) {
        const start = crossings(set, axis, 0);
        const end = crossings(set, axis, 480);
        expect(start.length).toBeGreaterThan(0);
        expect(end).toHaveLength(start.length);
        end.forEach((value, i) => expect(Math.abs(value - start[i]!), `a line meets ${axis === 0 ? "the left and right edges" : "the top and bottom edges"} at ${start[i]} and ${value}`).toBeLessThanOrEqual(0.5));
      }
    }
  });
});

describe("the light falloff", () => {
  test("M-05, G-02: --sm-canvas-image starts with the light layer, and --sm-canvas-size has one size per layer", () => {
    expect(property(tokens, "--sm-canvas-light")).toBeDefined();
    const image = layers(property(tokens, "--sm-canvas-image")!);
    expect(image[0]).toBe("var(--sm-canvas-light)");
    expect(layers(property(tokens, "--sm-canvas-size")!)).toHaveLength(image.length);
  });

  test("M-05, G-02: every space's canvas starts with the light layer, and its board, miniature, and swatch sizes match its layers", () => {
    const rules = [...styles.matchAll(/\[data-canvas(?:="(\w+)")?\]\s*\{([^}]*)\}/g)];
    const all = rules.find(([, name]) => name === undefined)?.[2] ?? "";
    const rootLayers = layers(property(tokens, "--sm-canvas-image")!).length;
    expect(layers(property(all, "--sm-thumb-size")!), "the default miniature sizes").toHaveLength(rootLayers);
    const named = rules.filter(([, name]) => name !== undefined);
    expect(named.map(([, name]) => name).sort()).toEqual(["cool", "lilac", "sage", "sand", "slate", "stone"]);
    for (const [, name, body] of named) {
      const image = property(body!, "--sm-canvas-image");
      if (image === undefined) continue; // stone and slate keep the contours from tokens.css
      const list = layers(image);
      expect(list[0], `${name} starts with the light`).toBe("var(--sm-canvas-light)");
      expect(layers(property(body!, "--sm-canvas-size")!), `${name}'s board sizes`).toHaveLength(list.length);
      expect(layers(property(body!, "--sm-thumb-size")!), `${name}'s miniature sizes`).toHaveLength(list.length);
    }
  });

  test("M-05, G-02: the light is drawn in white and black alone, so it works on every tint, its edge shades to 3-5% black, and muted and quiet text keep 4.6:1 there on every tint", () => {
    const light = property(tokens, "--sm-canvas-light")!;
    expect(light).not.toContain("var(");
    // Its stops are written as eight-digit hex colours: white or black, with an alpha.
    const stops = [...light.matchAll(/#([0-9a-f]+)\b/gi)].map(([, hex]) => hex!.toLowerCase());
    for (const hex of stops) expect(hex).toMatch(/^(ffffff|000000)[0-9a-f]{2}$/);
    const darkest = Math.max(0, ...stops.filter((hex) => hex.startsWith("000000")).map((hex) => parseInt(hex.slice(6), 16) / 255));
    expect(stops.some((hex) => hex.startsWith("ffffff") && hex.slice(6) !== "00"), "the light at the top centre").toBe(true);
    // The first stop is the lit top centre and the last is the shaded edge, a little black.
    expect(stops[0], "the first stop is white").toMatch(/^ffffff/);
    expect(stops.at(-1), "the last stop is black").toMatch(/^000000/);
    expect(darkest, "the edge's black").toBeGreaterThanOrEqual(0.03);
    expect(darkest, "the edge's black stays subtle").toBeLessThanOrEqual(0.05);
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const hexOf = (name: string) => property(tokens, name)!.match(/#([0-9a-f]{6})/i)![1]!;
    for (const canvas of ["stone", "cool", "sand", "slate", "sage", "lilac"]) {
      const edge = luminance(rgb(hexOf(`--sm-canvas-${canvas}`)).map((c) => c * (1 - darkest)));
      for (const text of ["--sm-muted", "--sm-quiet"]) {
        const ratio = (edge + 0.05) / (luminance(rgb(hexOf(text))) + 0.05);
        expect(ratio, `${text} on ${canvas}'s darkest edge`).toBeGreaterThanOrEqual(4.6);
      }
    }
  });
});
