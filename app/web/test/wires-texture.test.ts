import { describe, expect, test } from "vitest";
import { wireLayout } from "../src/board/wires.ts";
import type { Box } from "../src/board/wires.ts";
import { cellChance, hexTokens, hexagon, importanceLevel, textureCells } from "../src/board/texture.ts";
import type { HexTokens } from "../src/board/texture.ts";

// The board's two decorative layers, as the prototype draws them
// (docs/prototype/source/steelman-refined.html, drawLinks and drawTexture):
// the wires from the question to each option's header and on to each
// argument row (A-01), and the hexagon texture behind each column, its
// density from importance and its tone from articulation (B-07).

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

describe("A-01: the wires", () => {
  const question = box(100, 30, 800, 120);
  const yes = { id: "yes", head: box(40, 220, 400, 58), rows: [{ id: "a", card: box(90, 320, 300, 80) }, { id: "b", card: box(90, 430, 300, 80) }] };
  const no = { id: "no", head: box(480, 220, 400, 58), rows: [{ id: "c", card: box(530, 320, 300, 80) }] };

  test("A-01: one wire from the bottom of the question to the top of each option's header, with a small circle at each end", () => {
    const { paths, ports } = wireLayout(question, [yes, no], false);
    // From the question's bottom centre, down 24 px, across, and down to the header's top centre.
    expect(paths.filter((path) => path.to.startsWith("option:"))).toEqual([
      { to: "option:yes", d: "M500 150V174H240V220" },
      { to: "option:no", d: "M500 150V174H680V220" },
    ]);
    expect(ports[0]).toEqual({ x: 500, y: 150 });
    expect(ports).toContainEqual({ x: 240, y: 220 });
    expect(ports).toContainEqual({ x: 680, y: 220 });
  });

  test("A-01: a spine runs down each column's left lane, and a wire leaves it for each row's leading card, 16 px below its top", () => {
    const { paths, ports } = wireLayout(question, [yes, no], false);
    expect(paths.filter((path) => !path.to.startsWith("option:"))).toEqual([
      { to: "spine:yes", d: "M52 278L52 446" },
      { to: "row:a", d: "M52 336L90 336" },
      { to: "row:b", d: "M52 446L90 446" },
      { to: "spine:no", d: "M492 278L492 336" },
      { to: "row:c", d: "M492 336L530 336" },
    ]);
    // A circle where each row's wire meets its card.
    expect(ports).toContainEqual({ x: 90, y: 336 });
    expect(ports).toContainEqual({ x: 530, y: 336 });
    expect(ports).toHaveLength(1 + 2 + 3);
  });

  test("A-01: a column with no rows has its header's wire and no spine", () => {
    const { paths } = wireLayout(question, [{ ...no, rows: [] }], false);
    expect(paths.map((path) => path.to)).toEqual(["option:no"]);
  });

  test("A-01: an unfolded row scrolled sideways keeps its wire at the row's edge, not at the card off to the left", () => {
    const { paths } = wireLayout(question, [{ ...yes, rows: [{ id: "a", card: box(-120, 320, 300, 80), edge: 90 }] }], false);
    expect(paths.find((path) => path.to === "row:a")?.d).toBe("M52 336L90 336");
  });

  test("A-01 M-03: on a phone, the columns below the first are reached along the board's left edge", () => {
    const stacked = { ...no, head: box(22, 900, 330, 58) };
    const { paths } = wireLayout(box(10, 20, 355, 150), [{ ...yes, head: box(22, 220, 330, 58) }, stacked], true);
    expect(paths.filter((path) => path.to.startsWith("option:"))).toEqual([
      { to: "option:yes", d: "M187.5 170V194H187V220" },
      { to: "option:no", d: "M187.5 170V188H8V883H187V900" },
    ]);
  });

  test("A-01: positions are kept to two decimals", () => {
    const { paths } = wireLayout(box(0.333, 0.333, 10.001, 10.001), [{ id: "x", head: box(1.2345, 40.6789, 3, 3), rows: [] }], false);
    expect(paths[0]!.d).toBe("M5.33 10.33V34.33H2.73V40.68");
  });
});

/** The tokens in docs/design/tokens.css. */
const TOKENS: HexTokens = { cell: 18, fill: 0.04, size: 0.92, sparse: 0.04, floor: 0.15, curve: 1.8, ink: "#242424" };

describe("B-07: the hexagon texture", () => {
  test("B-07: the tokens come from the design tokens, with the prototype's fallbacks when one is missing", () => {
    const css: Record<string, string> = { "--sm-hex-cell": "18px", "--sm-hex-fill": ".04", "--sm-hex-size": ".92", "--sm-hex-sparse": ".04", "--sm-hex-art-floor": ".15", "--sm-hex-curve": "1.8", "--sm-hex-ink": "#242424" };
    expect(hexTokens((name) => css[name] ?? "")).toEqual(TOKENS);
    expect(hexTokens(() => "")).toEqual({ cell: 9, fill: 0.06, size: 0.82, sparse: 0.04, floor: 0, curve: 1.8, ink: "#242424" });
  });

  test("B-07: importance is scaled across the whole board and then curved, so the most important row is 1 and the least 0", () => {
    const level = importanceLevel([3, 2, 1, -1], 1.8);
    expect(level(3)).toBe(1);
    expect(level(-1)).toBe(0);
    expect(level(1)).toBeCloseTo(Math.pow(0.5, 1.8));
    // When every row has the same importance, every row is as important as the most important one.
    expect(importanceLevel([2, 2], 1.8)(2)).toBe(1);
    expect(importanceLevel([], 1.8)(0)).toBe(1);
  });

  test("B-07: each cell is in or out by its place in the lattice alone, so a redraw never flickers", () => {
    expect(cellChance(3, 7)).toBe(cellChance(3, 7));
    const chances = Array.from({ length: 400 }, (_, k) => cellChance(k % 20, Math.floor(k / 20)));
    expect(Math.min(...chances)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...chances)).toBeLessThan(1);
    expect(new Set(chances).size).toBeGreaterThan(390);
  });

  test("B-07: the most important row is a full honeycomb, and the least important keeps only a scattering", () => {
    const lattice = (imp: number) => textureCells(400, 600, [{ mid: 300, imp, versions: [] }], TOKENS);
    const full = lattice(1);
    const sparse = lattice(0);
    // Rows of cells 1.5 radii apart; in each, cells √3 radii apart, from one cell left of the edge.
    const expected = Math.ceil((600 + 18) / 27) * Math.ceil((400 + 18) / (18 * Math.sqrt(3)) + 1);
    expect(full).toHaveLength(expected);
    expect(sparse.length).toBeGreaterThan(0);
    expect(sparse.length / full.length).toBeLessThan(0.1);
    // The ones kept are the same cells, at every importance.
    const at = (cells: { x: number; y: number }[]) => new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    for (const cell of at(sparse)) expect(at(lattice(0.5)).has(cell)).toBe(true);
    expect(lattice(0.5).length).toBeGreaterThan(sparse.length);
    expect(lattice(0.5).length).toBeLessThan(full.length);
  });

  test("B-07: each cell takes the density of the row nearest it", () => {
    const cells = textureCells(400, 600, [{ mid: 100, imp: 1, versions: [] }, { mid: 500, imp: 0, versions: [] }], TOKENS);
    const top = cells.filter((cell) => cell.y < 280).length;
    const bottom = cells.filter((cell) => cell.y > 320).length;
    expect(top).toBeGreaterThan(bottom * 5);
  });

  test("B-07: across an unfolded row, each cell takes the tone of the wording nearest it, the best-articulated darkest", () => {
    const versions = [
      { l: 0, r: 190, art: 4 },
      { l: 210, r: 400, art: 1 },
    ];
    const cells = textureCells(400, 200, [{ mid: 100, imp: 1, versions }], TOKENS);
    const alphaAt = (x: number) => cells.find((cell) => Math.abs(cell.x - x) < 16)!.alpha;
    expect(alphaAt(60)).toBeCloseTo(0.04);
    expect(alphaAt(340)).toBeCloseTo(0.04 * (0.15 + 0.85 * 0.25));
  });

  test("B-07: a wording with no or negative articulation votes keeps the floor's share of the tone; a folded row has full tone", () => {
    const versions = [
      { l: 0, r: 190, art: -2 },
      { l: 210, r: 400, art: 0 },
    ];
    const cells = textureCells(400, 200, [{ mid: 100, imp: 1, versions }], TOKENS);
    // The best is counted as at least 1, so neither of these has any tone beyond the floor.
    for (const cell of cells) expect(cell.alpha).toBeCloseTo(0.04 * 0.15);
    const folded = textureCells(400, 200, [{ mid: 100, imp: 1, versions: [{ l: 0, r: 400, art: -2 }] }], TOKENS);
    for (const cell of folded) expect(cell.alpha).toBeCloseTo(0.04);
  });

  test("B-07: nothing is drawn without rows or room", () => {
    expect(textureCells(400, 600, [], TOKENS)).toEqual([]);
    expect(textureCells(0, 600, [{ mid: 0, imp: 1, versions: [] }], TOKENS)).toEqual([]);
  });

  test("B-07: a cell is a pointy-topped hexagon at the lattice's radius times its size", () => {
    const corners = hexagon(0, 0, 10);
    expect(corners).toHaveLength(6);
    expect(corners[0]![0]).toBeCloseTo(10 * Math.cos(Math.PI / 6));
    expect(corners[0]![1]).toBeCloseTo(5);
    for (const [x, y] of corners) expect(Math.hypot(x, y)).toBeCloseTo(10);
  });
});
