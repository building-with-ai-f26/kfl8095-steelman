// The hexagon texture behind each column (B-07), as the prototype's
// drawTexture draws it (docs/prototype/source/steelman-refined.html): a
// lattice of filled hexagons of one size. Importance sets density: the most
// important row on the board is a full honeycomb, the least important keeps
// only a scattering. Articulation sets tone across an unfolded row: each cell
// takes the tone of the wording nearest it, the best-articulated darkest.
// One departure: a row whose wordings all have equal votes, zeros included,
// draws at full tone here, while the prototype draws new wordings at the
// floor (the builder's decision 2, Nov 27, M3d-27).
// The hex keys (M3d-27, B-06 and B-07) show the same values beside the
// texture, from the same functions, so a key always matches its column.
// Pure: it takes rows measured on screen and gives the cells and the keys'
// marks; Texture.tsx measures and paints.

/** The texture's design tokens (docs/design/tokens.css, --sm-hex-*). */
export interface HexTokens {
  /** The lattice's radius, in px. */
  cell: number;
  /** Each filled cell's opacity at full tone. */
  fill: number;
  /** A filled cell's size as a share of the lattice, leaving a gap. */
  size: number;
  /** The share of cells kept for the least important row. */
  sparse: number;
  /** The share of the row's tone the weakest wording keeps. */
  floor: number;
  /** The importance curve: above 1 exaggerates strong rows against weak ones. */
  curve: number;
  ink: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Reads the tokens, with the prototype's own fallbacks for any that are missing (its `parseFloat(token) || fallback`). */
export function hexTokens(read: (name: string) => string): HexTokens {
  const number = (name: string, fallback: number) => parseFloat(read(name)) || fallback;
  return {
    cell: number("--sm-hex-cell", 9),
    fill: number("--sm-hex-fill", 0.06),
    size: number("--sm-hex-size", 0.82),
    sparse: clamp01(number("--sm-hex-sparse", 0.04)),
    floor: clamp01(number("--sm-hex-art-floor", 0)),
    curve: Math.max(0.5, number("--sm-hex-curve", 1.8)),
    ink: read("--sm-hex-ink").trim() || "#242424",
  };
}

/**
 * How important a row is for the texture, from 0 to 1: its importance scaled between the least and most important
 * rows on the whole board, then curved. When every row has the same importance, each counts as the most important.
 */
export function importanceLevel(scores: readonly number[], curve: number): (score: number) => number {
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  return (score) => Math.pow(Math.max(0, hi === lo || scores.length === 0 ? 1 : (score - lo) / (hi - lo)), curve);
}

/** A number from 0 to 1 for each place in the lattice, the same every time, so a redraw keeps the same cells and never flickers. */
export function cellChance(i: number, j: number): number {
  let h = Math.imul(i + 4096, 374761393) + Math.imul(j + 4096, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A wording in an unfolded row: its left and right edges, relative to the canvas, and its net articulation votes. */
export interface TextureVersion {
  l: number;
  r: number;
  art: number;
}

export interface TextureRow {
  /** The row's middle, relative to the canvas's top. */
  mid: number;
  /** Its importance level, from importanceLevel. */
  imp: number;
  /** Its wordings side by side, when it's unfolded; otherwise none. */
  versions: TextureVersion[];
}

export interface Cell {
  x: number;
  y: number;
  alpha: number;
}

/**
 * Each wording's share of its row's tone, from 0 to 1, in the order given: its net articulation votes over the best
 * wording's, where the best counts as at least 1, so a wording with no or negative votes keeps none of it. When every
 * wording has the same votes, new wordings at zero included, each has the whole tone, as importanceLevel counts equal
 * rows as the most important.
 */
export function articulationShares(arts: readonly number[]): number[] {
  if (arts.every((art) => art === arts[0])) return arts.map(() => 1);
  const best = Math.max(1, ...arts);
  return arts.map((art) => Math.max(0, art / best));
}

/** A wording's tone, from a share of its row's tone: the floor for the weakest, up to 1 for the best. */
export function articulationTone(tokens: HexTokens, share: number): number {
  return tokens.floor + (1 - tokens.floor) * share;
}

/**
 * The cells to fill on a canvas of this size, for its column's rows, top to bottom. Lines of cells run 1.5 radii
 * apart, every other one shifted by half a cell, so they make a honeycomb; each line takes its density from the row
 * whose middle is nearest it.
 */
export function textureCells(width: number, height: number, rows: readonly TextureRow[], tokens: HexTokens): Cell[] {
  if (!width || !height || rows.length === 0) return [];
  const { cell: R, fill, sparse } = tokens;
  const dx = R * Math.sqrt(3);
  const dy = R * 1.5;
  const shares = rows.map((row) => articulationShares(row.versions.map((v) => v.art)));
  const cells: Cell[] = [];
  // Rows run top to bottom, so the nearest row is found once per line of cells by walking forward.
  let near = 0;
  for (let j = 0; j * dy < height + R; j++) {
    const cy = j * dy;
    while (near < rows.length - 1 && Math.abs(rows[near + 1]!.mid - cy) <= Math.abs(rows[near]!.mid - cy)) near++;
    const row = rows[near]!;
    for (let i = -1; i * dx < width + R; i++) {
      const cx = i * dx + (j % 2 ? dx / 2 : 0);
      if (cellChance(i, j) > sparse + (1 - sparse) * row.imp) continue;
      let share = 1;
      if (row.versions.length > 1) {
        const gap = (v: TextureVersion) => (cx < v.l ? v.l - cx : cx > v.r ? cx - v.r : 0);
        const nearest = row.versions.reduce((a, b, k) => (gap(b) < gap(row.versions[a]!) ? k : a), 0);
        share = shares[near]![nearest]!;
      }
      cells.push({ x: cx, y: cy, alpha: fill * articulationTone(tokens, share) });
    }
  }
  return cells;
}

/** A pointy-topped hexagon's six corners around its centre, starting at the lower right, as the prototype's hexPath. */
export function hexagon(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 6 }, (_, k) => {
    const a = Math.PI / 6 + k * (Math.PI / 3);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

/** The least important row's hexagon on the importance key keeps this share of a full cell, so it still shows. */
export const KEY_PIN = 0.12;
/** The radius of each hexagon on the articulation key, in px. */
export const KEY_ART_R = 6;
/** Where the importance key runs down the first column's 28 px gutter, in px from its left. */
export const KEY_X = 10;

/** A row's hexagon on the importance key, from its importance level: a pinpoint at 0, a full cell at 1. */
export function keyRadius(tokens: HexTokens, imp: number): number {
  return tokens.cell * tokens.size * (KEY_PIN + (1 - KEY_PIN) * imp);
}

/** The importance key, in its own coordinates: an outlined hexagon per row, the hairline's segments, and the caption's top. */
export interface ImportanceKey {
  hexes: { x: number; y: number; r: number }[];
  lines: { y1: number; y2: number }[];
  /** The caption's top, 8 px above the first hexagon, or null when there's no room for it whole. */
  caption: number | null;
}

/**
 * The importance key for a column's rows, top to bottom: each row's vote's middle and its importance level, from
 * importanceLevel. The hairline joins each pair of hexagons 3 px clear of each and stays at full strength. A column
 * with no rows has no key; a column with one row has one hexagon.
 */
export function importanceKey(rows: readonly { y: number; imp: number }[], tokens: HexTokens, captionHeight: number): ImportanceKey | null {
  if (rows.length === 0) return null;
  const hexes = rows.map((row) => ({ x: KEY_X, y: row.y, r: keyRadius(tokens, row.imp) }));
  const lines = hexes.slice(1).flatMap((b, k) => {
    const a = hexes[k]!;
    const y1 = a.y + a.r + 3;
    const y2 = b.y - b.r - 3;
    return y2 > y1 ? [{ y1, y2 }] : [];
  });
  const top = hexes[0]!.y - hexes[0]!.r - 8 - captionHeight;
  return { hexes, lines, caption: top >= 0 ? top : null };
}

/** The articulation key, in its own coordinates: a filled hexagon per wording, the fading hairline, and the caption's left. */
export interface ArticulationKey {
  hexes: { x: number; tone: number }[];
  /** Each segment runs from `from` to `to`, fading from tone1 at x1 to tone2 at x2. */
  segments: { from: number; to: number; x1: number; x2: number; tone1: number; tone2: number }[];
  /** The caption's left, after the first hexagon, or null when it doesn't fit whole. */
  caption: number | null;
}

/**
 * The articulation key for an unfolded row's wordings, in order: where each wording's first letter starts and its net
 * articulation votes. A hexagon sits over the start of each wording, toned as the texture shades the row. The
 * caption follows the first hexagon and is left out, not cut off, when it has scrolled past the key's left end, would
 * run past its right end (the fold button), or would reach the second hexagon. A row with one wording has no key.
 */
export function articulationKey(wordings: readonly { x: number; art: number }[], tokens: HexTokens, width: number, captionWidth: number): ArticulationKey | null {
  if (wordings.length < 2) return null;
  const shares = articulationShares(wordings.map((w) => w.art));
  const hexes = wordings.map((w, k) => ({ x: w.x + KEY_ART_R, tone: articulationTone(tokens, shares[k]!) }));
  const left = hexes[0]!.x + KEY_ART_R + 8;
  const right = left + captionWidth;
  const caption = left < 0 || right > width || right + 8 > hexes[1]!.x - KEY_ART_R - 3 ? null : left;
  const segments = hexes.slice(1).flatMap((b, k) => {
    const a = hexes[k]!;
    const from = k === 0 && caption !== null ? right + 8 : a.x + KEY_ART_R + 3;
    const to = b.x - KEY_ART_R - 3;
    return to > from ? [{ from, to, x1: a.x, x2: b.x, tone1: a.tone, tone2: b.tone }] : [];
  });
  return { hexes, segments, caption };
}
