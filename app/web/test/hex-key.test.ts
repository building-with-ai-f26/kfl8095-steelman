import { describe, expect, test } from "vitest";
import { KEY_ART_R, KEY_PIN, KEY_X, articulationKey, articulationShares, articulationTone, importanceKey, importanceLevel, keyRadius, textureCells } from "../src/board/texture.ts";
import type { HexTokens } from "../src/board/texture.ts";

// The hex keys (M3d-27) that replace the axis captions at widths above
// 640 px: down the first column, an outlined hexagon level with each row's
// vote, sized by its importance (B-06); above an unfolded row, a filled
// hexagon over the start of each wording, toned by its articulation (B-07).
// The keys take their sizes and tones from the same functions in
// board/texture.ts that draw the texture, so a key always matches it. The
// approved specimen is docs/design/index.html, section "Hex keys".

/** The tokens in docs/design/tokens.css. */
const TOKENS: HexTokens = { cell: 18, fill: 0.04, size: 0.92, sparse: 0.04, floor: 0.15, curve: 1.8, ink: "#242424" };
const FULL = TOKENS.cell * TOKENS.size;

describe("B-06: the importance key", () => {
  test("B-06: the key's sizes for a column's importances are the texture's levels, from a pinpoint for the least important row to a full cell for the most important", () => {
    // The board's scores, across every column, as Texture.tsx scales them; this column holds 3, 2, and -1.
    const level = importanceLevel([3, 2, 1, 3, -1], TOKENS.curve);
    const key = importanceKey([{ y: 100, imp: level(3) }, { y: 200, imp: level(2) }, { y: 300, imp: level(-1) }], TOKENS, 90)!;
    expect(key.hexes.map((hex) => hex.r)).toEqual([level(3), level(2), level(-1)].map((imp) => keyRadius(TOKENS, imp)));
    expect(key.hexes[0]!.r).toBeCloseTo(FULL);
    expect(key.hexes[2]!.r).toBeCloseTo(FULL * KEY_PIN);
    expect(key.hexes[1]!.r).toBeCloseTo(FULL * (KEY_PIN + (1 - KEY_PIN) * Math.pow(3 / 4, 1.8)));
    // Each hexagon is level with its row's vote, down one line in the gutter.
    expect(key.hexes.map((hex) => [hex.x, hex.y])).toEqual([[KEY_X, 100], [KEY_X, 200], [KEY_X, 300]]);
  });

  test("B-06: a board whose only argument is this one gives one full hexagon with its caption, and no arguments give no key", () => {
    const level = importanceLevel([2], TOKENS.curve);
    const key = importanceKey([{ y: 120, imp: level(2) }], TOKENS, 90)!;
    expect(key.hexes).toEqual([{ x: KEY_X, y: 120, r: FULL }]);
    expect(key.lines).toEqual([]);
    expect(key.caption).not.toBeNull();
    expect(importanceKey([], TOKENS, 90)).toBeNull();
  });

  test("B-06: the hairline joins each pair of hexagons 3 px clear of each, and leaves out a pair too close to join", () => {
    const key = importanceKey([{ y: 100, imp: 1 }, { y: 200, imp: 0 }, { y: 205, imp: 0 }], TOKENS, 90)!;
    const [a, b] = key.hexes;
    expect(key.lines).toEqual([{ y1: a!.y + a!.r + 3, y2: b!.y - b!.r - 3 }]);
  });

  test("B-06: the caption sits 8 px above the first hexagon, and is left out when there is no room above it", () => {
    const key = importanceKey([{ y: 200, imp: 1 }], TOKENS, 90)!;
    expect(key.caption).toBeCloseTo(200 - FULL - 8 - 90);
    expect(importanceKey([{ y: 60, imp: 1 }], TOKENS, 90)!.caption).toBeNull();
  });
});

describe("B-07: the articulation key", () => {
  test("B-07: its tones run from full for the best wording to the floor for the weakest, the shares the texture shades the row with", () => {
    const arts = [12, 5, -2];
    expect(articulationShares(arts)).toEqual([1, 5 / 12, 0]);
    const key = articulationKey([{ x: 6, art: 12 }, { x: 300, art: 5 }, { x: 600, art: -2 }], TOKENS, 800, 110)!;
    expect(key.hexes.map((hex) => hex.tone)).toEqual([1, TOKENS.floor + (1 - TOKENS.floor) * (5 / 12), TOKENS.floor]);
    // The texture over each wording has the same tone, at the texture's own opacity.
    const versions = [
      { l: 0, r: 280, art: 12 },
      { l: 300, r: 580, art: 5 },
      { l: 600, r: 880, art: -2 },
    ];
    const cells = textureCells(880, 200, [{ mid: 100, imp: 1, versions }], TOKENS);
    const alphaAt = (x: number) => cells.find((cell) => Math.abs(cell.x - x) < 16)!.alpha;
    expect(alphaAt(140)).toBeCloseTo(TOKENS.fill * key.hexes[0]!.tone);
    expect(alphaAt(440)).toBeCloseTo(TOKENS.fill * key.hexes[1]!.tone);
    expect(alphaAt(740)).toBeCloseTo(TOKENS.fill * key.hexes[2]!.tone);
    expect(articulationTone(TOKENS, 1)).toBe(1);
    expect(articulationTone(TOKENS, 0)).toBe(TOKENS.floor);
  });

  test("B-07: equal votes give every wording full tone, a row of new wordings at zero included, in the key and in the texture", () => {
    expect(articulationShares([3, 3, 3])).toEqual([1, 1, 1]);
    expect(articulationShares([0, 0, 0])).toEqual([1, 1, 1]);
    const key = articulationKey([{ x: 6, art: 0 }, { x: 300, art: 0 }], TOKENS, 600, 110)!;
    expect(key.hexes.map((hex) => hex.tone)).toEqual([1, 1]);
    const versions = [
      { l: 0, r: 280, art: 0 },
      { l: 300, r: 580, art: 0 },
    ];
    for (const cell of textureCells(580, 200, [{ mid: 100, imp: 1, versions }], TOKENS)) expect(cell.alpha).toBeCloseTo(TOKENS.fill);
    // A tie for best keeps the others below it.
    expect(articulationShares([7, 7, 2])).toEqual([1, 1, 2 / 7]);
  });

  test("B-07: one wording gives no articulation key", () => {
    expect(articulationKey([{ x: 6, art: 4 }], TOKENS, 600, 110)).toBeNull();
    expect(articulationKey([], TOKENS, 600, 110)).toBeNull();
  });

  test("B-07: a hexagon sits over the start of each wording, and the caption follows the first one", () => {
    // Marks are each wording's first letter, in the key's own coordinates.
    const key = articulationKey([{ x: 20, art: 3 }, { x: 320, art: 1 }], TOKENS, 600, 110)!;
    expect(key.hexes.map((hex) => hex.x)).toEqual([20 + KEY_ART_R, 320 + KEY_ART_R]);
    expect(key.caption).toBe(20 + KEY_ART_R + KEY_ART_R + 8);
  });

  test("B-07: the caption is left out, not cut off, when it has scrolled away, runs past the key's end, or reaches the second hexagon", () => {
    // Scrolled toward the last wording: the first wording's start has gone past the strip's left end.
    expect(articulationKey([{ x: -200, art: 3 }, { x: 100, art: 1 }], TOKENS, 600, 110)!.caption).toBeNull();
    // A narrow column: the caption would run under the fold button.
    expect(articulationKey([{ x: 20, art: 3 }, { x: 320, art: 1 }], TOKENS, 120, 110)!.caption).toBeNull();
    // The second wording starts too soon after the first.
    expect(articulationKey([{ x: 20, art: 3 }, { x: 140, art: 1 }], TOKENS, 600, 110)!.caption).toBeNull();
  });

  test("B-07: the hairline fades between each pair of hexagons from one's tone to the other's, starting after the caption when it shows", () => {
    const key = articulationKey([{ x: 20, art: 12 }, { x: 320, art: 5 }, { x: 620, art: -2 }], TOKENS, 900, 110)!;
    const [a, b, c] = key.hexes;
    expect(key.segments).toEqual([
      { from: key.caption! + 110 + 8, to: b!.x - KEY_ART_R - 3, x1: a!.x, x2: b!.x, tone1: a!.tone, tone2: b!.tone },
      { from: b!.x + KEY_ART_R + 3, to: c!.x - KEY_ART_R - 3, x1: b!.x, x2: c!.x, tone1: b!.tone, tone2: c!.tone },
    ]);
    // Without the caption, the first segment starts 3 px after the first hexagon.
    const scrolled = articulationKey([{ x: -30, art: 12 }, { x: 280, art: 5 }], TOKENS, 900, 110)!;
    expect(scrolled.caption).toBeNull();
    expect(scrolled.segments[0]!.from).toBe(-30 + KEY_ART_R + KEY_ART_R + 3);
  });
});
