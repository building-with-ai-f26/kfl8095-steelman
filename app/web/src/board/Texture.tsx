// The hexagon texture behind each column (B-07): the prototype's
// `<canvas class="sm-texture">`, first in each `.sm-column`, placed and sized
// by the prototype's own CSS. It's decoration, hidden from screen readers and
// from the pointer. Wires.tsx decides when to paint it, with the wires.

import { hexTokens, hexagon, importanceLevel, textureCells } from "./texture.ts";
import type { TextureRow } from "./texture.ts";

export function Texture() {
  return <canvas className="sm-texture" aria-hidden="true" />;
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
}
