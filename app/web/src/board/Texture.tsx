// The hexagon texture behind each column (B-07): the prototype's
// `<canvas class="sm-texture">`, first in each `.sm-column`, placed and sized
// by the prototype's own CSS. It's decoration, hidden from screen readers and
// from the pointer. Wires.tsx decides when to paint it, with the wires.
//
// The hex keys (M3d-27, B-06 and B-07) are painted in the same pass, from the
// same tokens and the same importance levels, so a key always matches its
// texture: ImportanceKey down the first column's gutter, and ArticulationKey
// in an unfolded row's strip. Both are decoration too, and both are hidden at
// 640 px and below, where the phone's captions show instead.

import { articulationKey, hexTokens, hexagon, importanceKey, importanceLevel, textureCells, KEY_ART_R } from "./texture.ts";
import type { HexTokens, TextureRow } from "./texture.ts";

export function Texture() {
  return <canvas className="sm-texture" aria-hidden="true" />;
}

/** The importance key's place in the first column, as today's axis had (.sm-col-vaxis); paintTextures draws in it. */
export function ImportanceKey() {
  return (
    <div className="sm-col-vaxis sm-hex-key sm-hex-vkey" aria-hidden="true">
      <svg focusable="false" />
      <span className="sm-hex-caption">More important</span>
    </div>
  );
}

/** The articulation key's place in an unfolded row's strip, before the fold button; paintTextures draws in it. */
export function ArticulationKey() {
  return (
    <div className="sm-hex-key sm-hex-hkey" aria-hidden="true">
      <svg focusable="false" />
      <span className="sm-hex-caption">Best articulation</span>
    </div>
  );
}

/** What the texture reads from the board's votes, counting the reader's own not yet back. */
export interface TextureVotes {
  /** Every row's net importance, across the whole board, to scale each row against the others. */
  scores: readonly number[];
  /** A row's net importance, by its argument's ID. */
  importance(argumentId: string): number | undefined;
  /** A wording's net articulation votes, by its version's ID. */
  articulation(versionId: string): number;
}

/** What each canvas last painted, so a redraw of the same layout and votes paints nothing. */
const painted = new WeakMap<HTMLCanvasElement, string>();

/** Paints the texture of every column in the scene that's on screen, from where its rows are now. */
export function paintTextures(scene: HTMLElement, votes: TextureVotes): void {
  const style = getComputedStyle(document.documentElement);
  const tokens = hexTokens((name) => style.getPropertyValue(name));
  const level = importanceLevel(votes.scores, tokens.curve);
  for (const canvas of scene.querySelectorAll<HTMLCanvasElement>(".sm-column > canvas.sm-texture")) {
    const box = canvas.getBoundingClientRect();
    // A column that isn't shown (the other side, on a phone) keeps what it had until it is.
    if (!box.width || !box.height) continue;
    // A long column can be very tall; the canvas stays under browsers' size limits by lowering its resolution.
    const dpr = Math.min(2, window.devicePixelRatio || 1, 16000 / box.height);
    const width = Math.round(box.width * dpr);
    const height = Math.round(box.height * dpr);
    const rows: TextureRow[] = [...canvas.parentElement!.querySelectorAll<HTMLElement>("[data-node]")].map((node) => {
      const b = node.getBoundingClientRect();
      const versions = [...node.querySelectorAll<HTMLElement>(".sm-track .sm-card[data-card]")].map((card) => {
        const v = card.getBoundingClientRect();
        return { l: v.left - box.left, r: v.right - box.left, art: votes.articulation(card.dataset.card!) };
      });
      return { mid: (b.top + b.bottom) / 2 - box.top, imp: level(votes.importance(node.dataset.node!) ?? 0), versions };
    });
    const key = JSON.stringify([width, height, dpr, tokens, rows]);
    if (painted.get(canvas) === key) continue;
    painted.set(canvas, key);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, box.width, box.height);
    context.fillStyle = tokens.ink;
    for (const cell of textureCells(box.width, box.height, rows, tokens)) {
      context.globalAlpha = cell.alpha;
      context.beginPath();
      hexagon(cell.x, cell.y, tokens.cell * tokens.size).forEach(([x, y], k) => (k === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
      context.closePath();
      context.fill();
    }
    context.globalAlpha = 1;
  }
  paintKeys(scene, votes, tokens, level);
}

const SVG = "http://www.w3.org/2000/svg";
/** What each key last drew, so a redraw of the same layout and votes writes nothing. */
const keyed = new WeakMap<HTMLElement, string>();

function svgElement(name: string, attributes: Record<string, string | number>): SVGElement {
  const made = document.createElementNS(SVG, name);
  for (const [attribute, value] of Object.entries(attributes)) made.setAttribute(attribute, String(value));
  return made;
}

const points = (corners: [number, number][]) => corners.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
/** Rounds to a hundredth, so the cache sees the same layout as the same. */
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Places a key's caption, or leaves it out when it doesn't fit whole. It's made invisible rather than removed, so its
 * size can still be measured on the next paint.
 */
function showCaption(caption: HTMLElement, at: number | null, side: "top" | "left"): void {
  caption.style.visibility = at === null ? "hidden" : "";
  if (at !== null) caption.style[side] = `${at.toFixed(1)}px`;
}

/** Paints both keys from where their rows and wordings are now, with the texture's own tokens and levels. */
function paintKeys(scene: HTMLElement, votes: TextureVotes, tokens: HexTokens, level: (score: number) => number): void {
  for (const key of scene.querySelectorAll<HTMLElement>(".sm-hex-vkey")) {
    // Hidden on a phone, or in a column that isn't shown.
    if (key.offsetParent === null) continue;
    const box = key.getBoundingClientRect();
    const caption = key.querySelector<HTMLElement>(".sm-hex-caption")!;
    // A combined row stays in its place until Update without a vote of its own, so it has no hexagon.
    const marks = [...key.parentElement!.querySelectorAll<HTMLElement>("[data-node]")].flatMap((node) => {
      const vote = node.querySelector(':scope > .sm-vote[data-axis="v"]');
      if (!vote) return [];
      const b = vote.getBoundingClientRect();
      return [{ y: round((b.top + b.bottom) / 2 - box.top), imp: level(votes.importance(node.dataset.node!) ?? 0) }];
    });
    const drawn = importanceKey(marks, tokens, round(caption.getBoundingClientRect().height));
    const state = JSON.stringify([tokens, drawn]);
    if (keyed.get(key) === state) continue;
    keyed.set(key, state);
    const parts: SVGElement[] = [];
    if (drawn) {
      const group = svgElement("g", { fill: "none", stroke: "var(--sm-axis-line)", "stroke-width": 1, "stroke-linejoin": "round" });
      for (const line of drawn.lines) group.append(svgElement("line", { x1: drawn.hexes[0]!.x, x2: drawn.hexes[0]!.x, y1: line.y1.toFixed(2), y2: line.y2.toFixed(2) }));
      for (const hex of drawn.hexes) group.append(svgElement("polygon", { points: points(hexagon(hex.x, hex.y, hex.r)) }));
      parts.push(group);
    }
    key.querySelector("svg")!.replaceChildren(...parts);
    showCaption(caption, drawn?.caption ?? null, "top");
  }

  for (const key of scene.querySelectorAll<HTMLElement>(".sm-hex-hkey")) {
    if (key.offsetParent === null) continue;
    const box = key.getBoundingClientRect();
    const caption = key.querySelector<HTMLElement>(".sm-hex-caption")!;
    const node = key.closest<HTMLElement>("[data-node]");
    // The same wordings the texture shades the row by, each from its first letter (or its removed note).
    const wordings = [...(node?.querySelectorAll<HTMLElement>(".sm-track .sm-card[data-card]") ?? [])].map((card) => {
      const start = (card.querySelector(".sm-claim, .sm-removed-note") ?? card).getBoundingClientRect().left;
      return { x: round(start - box.left), art: votes.articulation(card.dataset.card!) };
    });
    const drawn = articulationKey(wordings, tokens, round(box.width), round(caption.getBoundingClientRect().width));
    const state = JSON.stringify([tokens, round(box.height), drawn]);
    if (keyed.get(key) === state) continue;
    keyed.set(key, state);
    const parts: SVGElement[] = [];
    if (drawn) {
      const y = box.height / 2;
      const color = getComputedStyle(key).getPropertyValue("--sm-axis-line").trim() || "#5c5c5c";
      // Gradient IDs are the row's, so two unfolded rows in different columns never share one.
      const id = `sm-hex-fade-${node?.dataset.node ?? "row"}`;
      drawn.segments.forEach((segment, k) => {
        const gradient = svgElement("linearGradient", { id: `${id}-${k}`, gradientUnits: "userSpaceOnUse", x1: segment.x1.toFixed(2), x2: segment.x2.toFixed(2), y1: 0, y2: 0 });
        gradient.append(
          svgElement("stop", { offset: 0, "stop-color": color, "stop-opacity": segment.tone1.toFixed(3) }),
          svgElement("stop", { offset: 1, "stop-color": color, "stop-opacity": segment.tone2.toFixed(3) }),
        );
        parts.push(gradient, svgElement("rect", { x: segment.from.toFixed(2), y: (y - 0.5).toFixed(2), width: (segment.to - segment.from).toFixed(2), height: 1, fill: `url(#${id}-${k})` }));
      });
      const group = svgElement("g", { fill: tokens.ink });
      for (const hex of drawn.hexes) group.append(svgElement("polygon", { points: points(hexagon(hex.x, y, KEY_ART_R)), "fill-opacity": hex.tone.toFixed(3) }));
      parts.push(group);
    }
    key.querySelector("svg")!.replaceChildren(...parts);
    showCaption(caption, drawn?.caption ?? null, "left");
  }
}
