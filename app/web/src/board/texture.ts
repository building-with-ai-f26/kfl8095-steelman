// The hexagon texture behind each column (B-07), as the prototype's
// drawTexture draws it (docs/prototype/source/steelman-refined.html): a
// lattice of filled hexagons of one size. Importance sets density: the most
// important row on the board is a full honeycomb, the least important keeps
// only a scattering. Articulation sets tone across an unfolded row: each cell
// takes the tone of the wording nearest it, the best-articulated darkest.
// Pure: it takes rows measured on screen and gives the cells; Texture.tsx
// measures and paints.

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
 * The cells to fill on a canvas of this size, for its column's rows, top to bottom. Lines of cells run 1.5 radii
 * apart, every other one shifted by half a cell, so they make a honeycomb; each line takes its density from the row
 * whose middle is nearest it.
 */
export function textureCells(width: number, height: number, rows: readonly TextureRow[], tokens: HexTokens): Cell[] {
  if (!width || !height || rows.length === 0) return [];
  const { cell: R, fill, sparse, floor } = tokens;
  const dx = R * Math.sqrt(3);
  const dy = R * 1.5;
  const tone = rows.map((row) => Math.max(1, ...row.versions.map((v) => v.art)));
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
      let art = 1;
      if (row.versions.length > 1) {
        const gap = (v: TextureVersion) => (cx < v.l ? v.l - cx : cx > v.r ? cx - v.r : 0);
        art = row.versions.reduce((a, b) => (gap(b) < gap(a) ? b : a)).art / tone[near]!;
      }
      cells.push({ x: cx, y: cy, alpha: fill * (floor + (1 - floor) * Math.max(0, art)) });
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
