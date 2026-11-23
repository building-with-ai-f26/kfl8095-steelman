// The wires on the board (A-01), as the prototype's drawLinks draws them
// (docs/prototype/source/steelman-refined.html): from the foot of the question
// down to the top of each option's header, then down a spine in the column's
// left lane, with a short wire across to each argument row's leading card. A
// small circle marks each end. Pure: it takes boxes measured on screen, in the
// scene's coordinates, and gives the paths; Wires.tsx measures and draws.

/** A box on screen, relative to the scene's top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WireRow {
  id: string;
  /** The row's leading card: its first `.sm-card`, folded or unfolded. */
  card: Box;
  /** The left edge of the row's cards (`.sm-card-wrap`). An unfolded row scrolled sideways leaves its first card past it. */
  edge?: number;
}

export interface WireColumn {
  id: string;
  head: Box;
  rows: WireRow[];
}

/** One path, and what it reaches: "option:<id>", "spine:<id>", or "row:<id>". */
export interface Wire {
  to: string;
  d: string;
}

export interface WireLayout {
  paths: Wire[];
  /** Where the small circles go: the question's foot, each header's top, each row's card. */
  ports: { x: number; y: number }[];
}

/** How far below a card's top its wire meets it, level with the first line of its wording. */
const ROW_WIRE_Y = 16;
/** How far right of its header's left edge a column's spine runs. */
const SPINE_X = 12;

/** Positions are kept to two decimals, so the markup stays short and a redraw of the same layout matches. */
const n = (value: number) => Math.round(value * 100) / 100;

/**
 * The wires for the columns on screen, left to right (or top to bottom on a phone). On a phone (`narrow`, 640 px and
 * below) columns stack, so the wire to each column after the first runs down the board's left edge, 8 px in, and
 * comes in from the left above its header.
 */
export function wireLayout(question: Box, columns: WireColumn[], narrow: boolean): WireLayout {
  const qx = n(question.x + question.w / 2);
  const qy = n(question.y + question.h);
  const paths: Wire[] = [];
  const ports = [{ x: qx, y: qy }];
  columns.forEach((column, index) => {
    const hx = n(column.head.x + column.head.w / 2);
    const hy = n(column.head.y);
    const d = narrow && index > 0 ? `M${qx} ${qy}V${n(qy + 18)}H8V${n(hy - 17)}H${hx}V${hy}` : `M${qx} ${qy}V${n(qy + 24)}H${hx}V${hy}`;
    paths.push({ to: `option:${column.id}`, d });
    ports.push({ x: hx, y: hy });
    if (column.rows.length === 0) return;
    const spine = n(column.head.x + SPINE_X);
    const ys = column.rows.map((row) => n(row.card.y + ROW_WIRE_Y));
    paths.push({ to: `spine:${column.id}`, d: `M${spine} ${n(column.head.y + column.head.h)}L${spine} ${Math.max(...ys)}` });
    column.rows.forEach((row, k) => {
      const x = n(row.edge === undefined ? row.card.x : Math.max(row.card.x, row.edge));
      paths.push({ to: `row:${row.id}`, d: `M${spine} ${ys[k]}L${x} ${ys[k]}` });
      ports.push({ x, y: ys[k]! });
    });
  });
  return { paths, ports };
}
