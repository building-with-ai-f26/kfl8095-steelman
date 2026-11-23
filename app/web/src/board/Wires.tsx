// The wires and the hexagon texture on the board (A-01, B-07), as the
// prototype draws them (docs/prototype/source/steelman-refined.html, drawLinks
// and drawTexture): the prototype's `<svg class="sm-links">`, first in the
// scene, under everything else, with its own CSS. Both are decoration, hidden
// from screen readers and from the pointer, and neither moves the layout.
//
// They're drawn from what's on screen, so they're redrawn whenever it changes:
// after the board's own changes (new votes, rows unfolded, Update), when the
// scene changes size (a resize, a card opening, the phone layout), when
// anything inside it changes (a draft or an evidence form opening, History
// opening), and when an unfolded row is scrolled sideways. Each burst of
// changes is drawn once, once the browser has applied it, and a redraw of the
// same layout writes nothing. The prototype also redraws on every animation
// frame while its own motion plays (folding, reordering, zooming); the board
// here has none of that motion, so there's nothing to animate, with or without
// reduced motion.

import { useLayoutEffect, useMemo, useRef } from "react";
import type { QueuedAction, ReaderView } from "@steelman/shared";
import { articulationShown, importanceShown } from "./display.ts";
import { paintTextures } from "./Texture.tsx";
import type { TextureVotes } from "./Texture.tsx";
import { wireLayout } from "./wires.ts";
import type { Box, WireColumn } from "./wires.ts";

const SVG = "http://www.w3.org/2000/svg";
/** The decoration itself, whose own redraws aren't changes to redraw for. */
const DECORATION = ".sm-links, canvas.sm-texture";

export function Wires({ view, mine }: { view: ReaderView; mine: readonly QueuedAction[] }) {
  const links = useRef<SVGSVGElement>(null);
  const votes = useMemo(() => votesOf(view, mine), [view, mine]);
  const latest = useRef(votes);
  latest.current = votes;
  const redraw = useRef(() => {});

  useLayoutEffect(() => {
    const svg = links.current!;
    const scene = svg.parentElement!;
    let pending = false;
    const draw = () => {
      pending = false;
      if (!svg.isConnected) return;
      drawWires(svg, scene);
      paintTextures(scene, latest.current);
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(draw);
    };
    redraw.current = schedule;
    const resized = new ResizeObserver(schedule);
    resized.observe(scene);
    const changed = new MutationObserver((records) => {
      if (records.some((record) => !decoration(record.target))) schedule();
    });
    changed.observe(scene, { subtree: true, childList: true, attributes: true, characterData: true });
    // An unfolded row's wordings scroll sideways: the wire stops at the row's edge, and the tone follows the wordings.
    const scrolled = (event: Event) => (event.target as Element).classList?.contains("sm-track") && schedule();
    scene.addEventListener("scroll", scrolled, { capture: true, passive: true });
    // The serif's arrival rewraps the wordings.
    void document.fonts?.ready.then(schedule);
    draw();
    return () => {
      redraw.current = () => {};
      resized.disconnect();
      changed.disconnect();
      scene.removeEventListener("scroll", scrolled, { capture: true });
    };
  }, []);
  // New votes change the texture even where nothing on screen moves.
  useLayoutEffect(() => redraw.current(), [votes]);

  return <svg ref={links} className="sm-links" aria-hidden="true" focusable="false" />;
}

function decoration(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(DECORATION) != null;
}

/** The votes the texture shows: what the board holds, with the reader's own not yet back. */
function votesOf(view: ReaderView, mine: readonly QueuedAction[]): TextureVotes {
  const importance = new Map<string, number>();
  for (const ids of Object.values(view.shown.arguments))
    for (const id of ids) {
      const argument = view.rows.arguments[id];
      if (argument) importance.set(id, importanceShown(argument, mine).score);
    }
  return {
    scores: [...importance.values()],
    importance: (argumentId) => importance.get(argumentId),
    articulation(versionId) {
      const version = view.rows.versions[versionId];
      return version ? articulationShown(version, mine).score : 0;
    },
  };
}

/** What the wires last drew, so a redraw of the same layout writes nothing. */
const drawn = new WeakMap<SVGSVGElement, string>();

/** Measures the question, the columns on screen, and their rows, and draws the wires between them. */
function drawWires(svg: SVGSVGElement, scene: HTMLElement): void {
  const origin = scene.getBoundingClientRect();
  const rect = (element: Element): Box => {
    const b = element.getBoundingClientRect();
    return { x: b.left - origin.left, y: b.top - origin.top, w: b.width, h: b.height };
  };
  const question = scene.querySelector(".sm-head");
  // A column that isn't shown (the other side, on a phone) has no wire.
  const columns: WireColumn[] = [...scene.querySelectorAll<HTMLElement>(".sm-board .sm-column")]
    .filter((column) => column.offsetParent !== null)
    .flatMap((column) => {
      const head = column.querySelector(".sm-column-head");
      if (!head) return [];
      const rows = [...column.querySelectorAll<HTMLElement>("[data-node]")].flatMap((node) => {
        const card = node.querySelector(".sm-card");
        const wrap = node.querySelector(".sm-card-wrap");
        return card ? [{ id: node.dataset.node!, card: rect(card), ...(wrap ? { edge: rect(wrap).x } : {}) }] : [];
      });
      // The option being named has no ID yet.
      return [{ id: column.dataset.option ?? "new", head: rect(head), rows }];
    });
  const { paths, ports } = question ? wireLayout(rect(question), columns, window.matchMedia("(max-width: 640px)").matches) : { paths: [], ports: [] };
  const viewBox = `0 0 ${origin.width} ${origin.height}`;
  const key = JSON.stringify([viewBox, paths, ports]);
  if (drawn.get(svg) === key) return;
  drawn.set(svg, key);
  svg.setAttribute("viewBox", viewBox);
  const element = (name: string, attributes: Record<string, string | number>) => {
    const made = document.createElementNS(SVG, name);
    for (const [attribute, value] of Object.entries(attributes)) made.setAttribute(attribute, String(value));
    return made;
  };
  // In the prototype's order, which decides what's drawn over what: the question's circle, then each wire with the
  // circle at its far end (a spine has none).
  const circle = (k: number) => element("circle", { cx: ports[k]!.x, cy: ports[k]!.y, r: 3 });
  let next = 1;
  const parts = ports.length ? [circle(0)] : [];
  for (const path of paths) {
    parts.push(element("path", { d: path.d, "data-to": path.to }));
    if (!path.to.startsWith("spine:")) parts.push(circle(next++));
  }
  svg.replaceChildren(...parts);
}
