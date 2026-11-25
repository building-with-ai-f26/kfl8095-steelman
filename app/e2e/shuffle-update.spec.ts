// plans/build-plan.md, M3d-3, "Cards shuffle into the new order on Update"
// (B-05, M-02, M-15), with two people at 1280 and 375 px. The prototype moves
// each row from its old place to its new one when Update is pressed
// (docs/prototype/source/steelman-refined.html, render(..., 'reorder')); the
// app does it with motion.ts's flip(). The other person votes a lower row to
// the top of No, and nothing moves until the reader presses Update. Then each
// row that moved starts at its old place and slides into exactly the layout a
// reload draws, while the row the reader is reading stays still and the wires
// stay on their cards. A second Update during the shuffle ends at the newest
// order, and under reduced motion nothing animates and the layout is the same.
//
// Web Animations run on the page's own timeline, which Playwright's clock
// doesn't move, so the tests hold the shuffle's animations paused and set
// their time themselves. The wires follow on animation frames, which the
// clock does move, so each sampled frame runs the clock on a little first.

import type { Page } from "@playwright/test";
import { TICK_MS, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, importance, pill, poll, rows } from "./support/screen.ts";

const NO = ["Staff need a guaranteed day off.", "Opening a seventh day costs more than the budget allows.", "Few people would come, judging by Saturday afternoons."];
const WIDTHS = [1280, 375] as const;

interface Place {
  left: number;
  top: number;
}

/** Every row on screen, by argument ID, in viewport pixels, and how far the page is scrolled. */
function places(page: Page): Promise<{ scrollX: number; scrollY: number; rows: Record<string, Place> }> {
  return page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    rows: Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-node]")].flatMap((row) => {
        const { left, top, width, height } = row.getBoundingClientRect();
        return width || height ? [[row.dataset.node!, { left, top }]] : [];
      }),
    ),
  }));
}

/**
 * The centre of every row on screen, by argument ID, in viewport pixels, written as a Place. A row partway through a
 * shuffle is drawn up to 1 percent larger about its centre, so its centre is where it's seen.
 */
function centres(page: Page): Promise<Record<string, Place>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-node]")].flatMap((row) => {
        const { left, top, width, height } = row.getBoundingClientRect();
        return width || height ? [[row.dataset.node!, { left: left + width / 2, top: top + height / 2 }]] : [];
      }),
    ),
  );
}

/** Each row's place on the page itself, which doesn't depend on how far it's scrolled. */
function onPage(seen: Awaited<ReturnType<typeof places>>): Record<string, Place> {
  return Object.fromEntries(Object.entries(seen.rows).map(([id, place]) => [id, { left: place.left + seen.scrollX, top: place.top + seen.scrollY }]));
}

function near(a: Record<string, Place>, b: Record<string, Place>, within: number): string[] {
  const problems = Object.keys(a).length === Object.keys(b).length ? [] : [`${Object.keys(a).length} rows, not ${Object.keys(b).length}`];
  for (const [id, place] of Object.entries(a)) {
    const other = b[id];
    if (!other) problems.push(`row ${id} is missing`);
    else if (Math.abs(place.left - other.left) > within || Math.abs(place.top - other.top) > within) problems.push(`row ${id} is at ${JSON.stringify(place)}, not ${JSON.stringify(other)}`);
  }
  return problems;
}

/** The Web Animations (not CSS ones) on the board's rows and everything in them, by the row each is in. */
function boardMoves(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition))
      .flatMap((animation) => {
        const row = ((animation.effect as KeyframeEffect | null)?.target as Element | null)?.closest<HTMLElement>("[data-node]");
        return row ? [row.dataset.node!] : [];
      }),
  );
}

/**
 * Opens the board for one person. On a phone the window is 600 px tall. At the fixture's 900 px, the demo board is
 * only 90 px taller than the window, so the page can't scroll far enough to hold the row being read still when a row
 * moves above it, with motion or without. At 600 px it can, even for the two moves in a row of the second Update.
 */
async function open(board: TestBoard, person: "jordan_w" | "tess.b", width: number): Promise<Page> {
  const page = await board.open(person, { width });
  if (width < 640) await page.setViewportSize({ width, height: 600 });
  return page;
}

/** On a phone only one side shows: the No side here, where the votes are. */
async function showNo(page: Page, width: number): Promise<void> {
  if (width < 640) await page.getByRole("tab", { name: /^No/ }).click();
  await page.evaluate(() => document.fonts.ready);
}

/** "Opening…" goes from 1 to 4, past "Staff…" at 3: one vote in the other person's browser, two through the API. */
async function voteOpeningToTheTop(board: TestBoard, other: Page, width: number): Promise<void> {
  await showNo(other, width);
  const up = importance(other, NO[1]!).getByRole("button", { name: "More important if true" });
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  const opening = await find(board, NO[1]!);
  for (const person of ["omar_h", "maya.chen"] as const) await board.api(person).put(`arguments/${opening.argument}/importance`, { value: 1 });
}

/** The next shared order arrives, and the pill offers it. */
async function nextOrder(board: TestBoard, reader: Page): Promise<void> {
  board.clock.advance(TICK_MS);
  await poll(reader);
  await expect(pill(reader)).toHaveText(/1 change\s*Update/);
}

interface Pressed {
  /** Where every row on screen was just before Update. */
  before: Record<string, Place>;
  /** The centre of every row on screen just before Update. */
  centres: Record<string, Place>;
  /** The row Update holds still: the first whose bottom is more than 60 px down the window, as Board.tsx's readingAnchor() picks it. */
  anchor: { id: string; top: number };
  /** The new Web Animations on the board, held paused: on a row itself, or on a card in it, and each one's keyframes. */
  moves: { row: string; onRow: boolean; keyframes: { scale: string | undefined; offset: number }[] }[];
  /** When the last of them ends, in ms. */
  span: number;
}

/**
 * Presses Update in the page itself and holds the animations it starts, paused, under `name`, before any of them has
 * run more than a few ms, however slow the machine is.
 */
function pressUpdate(page: Page, name: string): Promise<Pressed> {
  return page.evaluate(async (name) => {
    const seen = () =>
      Object.fromEntries(
        [...document.querySelectorAll<HTMLElement>("[data-node]")].flatMap((row) => {
          const { left, top, width, height } = row.getBoundingClientRect();
          return width || height ? [[row.dataset.node!, { left, top }]] : [];
        }),
      );
    const ours = () =>
      document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition) && ((animation.effect as KeyframeEffect | null)?.target as Element | null)?.closest("[data-node]"));
    const before = seen();
    const centres = Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-node]")].flatMap((row) => {
        const { left, top, width, height } = row.getBoundingClientRect();
        return width || height ? [[row.dataset.node!, { left: left + width / 2, top: top + height / 2 }]] : [];
      }),
    );
    const anchored = [...document.querySelectorAll<HTMLElement>("[data-node]")].find((row) => row.getBoundingClientRect().bottom > 60)!;
    const anchor = { id: anchored.dataset.node!, top: anchored.getBoundingClientRect().top };
    const earlier = new Set(ours());
    document.querySelector<HTMLButtonElement>(".sm-fresh button")!.click();
    let held: Animation[] = [];
    // React draws the new order within a task or two of the click; a real task, which Playwright's clock doesn't hold.
    for (let turn = 0; turn < 200 && !held.length; turn++) {
      await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(null);
      });
      held = ours().filter((animation) => !earlier.has(animation));
    }
    for (const animation of held) animation.pause();
    (window as unknown as Record<string, Animation[]>)[name] = held;
    return {
      before,
      centres,
      anchor,
      moves: held.map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        const target = effect.target as Element;
        return {
          row: target.closest<HTMLElement>("[data-node]")!.dataset.node!,
          onRow: target.matches("[data-node]"),
          keyframes: effect.getKeyframes().map((keyframe) => ({ scale: keyframe.scale as string | undefined, offset: keyframe.computedOffset })),
        };
      }),
      span: Math.max(0, ...held.map((animation) => Number(animation.effect!.getComputedTiming().endTime))),
    };
  }, name);
}

/** Sets every held animation to the same moment, as one frame of the shuffle, and lets the wires catch up with it. */
async function frameAt(page: Page, name: string, ms: number): Promise<void> {
  await page.evaluate(
    ({ name, ms }) => {
      for (const animation of (window as unknown as Record<string, Animation[]>)[name]!) animation.currentTime = ms;
    },
    { name, ms },
  );
  await page.clock.runFor(40);
}

/** Lets the held animations run to their end. */
async function finish(page: Page, name: string): Promise<void> {
  await page.evaluate((name) => {
    for (const animation of (window as unknown as Record<string, Animation[]>)[name]!) if (animation.playState !== "idle") animation.finish();
  }, name);
  await expect.poll(() => boardMoves(page)).toEqual([]);
  await page.clock.runFor(40);
}

/**
 * How far each wire's ends are from what they reach, in the scene's pixels, as wires-texture.spec.ts measures it: the
 * question's foot, each header's top centre, and each row's leading card 16 px below its top, at the row's edge when
 * its track is scrolled sideways. Each wire beyond `within` px, and each one missing, is a problem.
 */
function wireProblems(page: Page, within: number): Promise<string[]> {
  return page.evaluate((within) => {
    const scene = document.querySelector(".sm-scene")!.getBoundingClientRect();
    const rel = (element: Element) => {
      const b = element.getBoundingClientRect();
      return { x: b.left - scene.left, y: b.top - scene.top, w: b.width, h: b.height };
    };
    const ends = (d: string) => {
      let at = { x: 0, y: 0 };
      let start: typeof at | null = null;
      for (const [, command, args] of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
        const n = args!.trim().split(/[\s,]+/).map(Number);
        if (command === "M" || command === "L") at = { x: n[0]!, y: n[1]! };
        if (command === "H") at = { ...at, x: n[0]! };
        if (command === "V") at = { ...at, y: n[0]! };
        start ??= at;
      }
      return { start: start ?? at, end: at };
    };
    const drawn = new Map([...document.querySelectorAll(".sm-links path")].map((path) => [path.getAttribute("data-to") ?? "", ends(path.getAttribute("d") ?? "")]));
    const problems: string[] = [];
    const check = (what: string, at: { x: number; y: number } | undefined, want: { x: number; y: number }) => {
      if (!at) problems.push(`no wire to ${what}`);
      else if (Math.abs(at.x - want.x) > within || Math.abs(at.y - want.y) > within) problems.push(`${what} is at ${JSON.stringify(at)}, not ${JSON.stringify(want)}`);
    };
    const q = rel(document.querySelector(".sm-head")!);
    const foot = { x: q.x + q.w / 2, y: q.y + q.h };
    for (const column of document.querySelectorAll<HTMLElement>(".sm-board .sm-column")) {
      if (column.offsetParent === null || !column.dataset.option) continue;
      const head = rel(column.querySelector(".sm-column-head")!);
      const wire = drawn.get(`option:${column.dataset.option}`);
      check(`option ${column.dataset.option}'s start`, wire?.start, foot);
      check(`option ${column.dataset.option}'s end`, wire?.end, { x: head.x + head.w / 2, y: head.y });
      for (const node of column.querySelectorAll<HTMLElement>("[data-node]")) {
        const card = rel(node.querySelector(".sm-card")!);
        const wrap = node.querySelector(".sm-card-wrap");
        check(`row ${node.dataset.node}'s end`, drawn.get(`row:${node.dataset.node}`)?.end, { x: wrap ? Math.max(card.x, rel(wrap).x) : card.x, y: card.y + 16 });
      }
    }
    return problems;
  }, within);
}

async function anchorTop(page: Page, id: string): Promise<number> {
  return page.evaluate((id) => document.querySelector(`[data-node="${id}"]`)!.getBoundingClientRect().top, id);
}

/** Reloads the reader's page and returns where each row is drawn on the page from scratch. */
async function reloaded(page: Page, width: number): Promise<Record<string, Place>> {
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await showNo(page, width);
  return onPage(await places(page));
}

for (const width of WIDTHS) {
  test(`B-05 M-02 M-15: at ${width} px, the other person's votes move nothing, and Update shuffles each moved row from its old place into the layout a reload draws`, async ({ board }) => {
    const reader = await open(board, "jordan_w", width);
    const other = await open(board, "tess.b", width);
    await showNo(reader, width);
    const ids = { staff: (await find(board, NO[0]!)).argument, opening: (await find(board, NO[1]!)).argument, few: (await find(board, NO[2]!)).argument };
    const still = await places(reader);

    // The other person votes "Opening…" above "Staff…": counts change in place, and nothing moves on its own.
    await voteOpeningToTheTop(board, other, width);
    await poll(reader);
    await nextOrder(board, reader);
    expect(await rows(reader, "No")).toEqual(NO);
    expect(near((await places(reader)).rows, still.rows, 0.5)).toEqual([]);
    expect(await boardMoves(reader)).toEqual([]);

    const pressed = await pressUpdate(reader, "shuffle");
    const sampled: { at: number; anchorWithin1px: boolean; wires: string[] }[] = [];
    // Its first frame: every row is drawn where it was before Update, the moving ones held at their old place.
    await frameAt(reader, "shuffle", 0);
    expect(near((await places(reader)).rows, pressed.before, 1)).toEqual([]);
    for (const at of [0, 0.15, 0.3, 0.5, 0.75].map((part) => Math.round(pressed.span * part))) {
      await frameAt(reader, "shuffle", at);
      sampled.push({ at, anchorWithin1px: Math.abs((await anchorTop(reader, pressed.anchor.id)) - pressed.anchor.top) <= 1, wires: await wireProblems(reader, 2) });
    }
    await finish(reader, "shuffle");
    const after = await places(reader);

    // One animation on each row that moved, and none on a row that stayed or on anything in it.
    const moved = Object.keys(after.rows)
      .filter((id) => near({ [id]: after.rows[id]! }, { [id]: pressed.before[id]! }, 0.5).length > 0)
      .sort();
    const onRows = pressed.moves.filter((move) => move.onRow).map((move) => move.row);
    expect(onRows.slice().sort()).toEqual(moved);
    expect(pressed.moves.filter((move) => !moved.includes(move.row))).toEqual([]);
    // Each moved row travels: it grows to 1.01 halfway through its move, and its card wears the lift.
    for (const move of pressed.moves.filter((move) => move.onRow)) expect(move.keyframes, `row ${move.row}'s move`).toContainEqual({ scale: "1.01", offset: 0.5 });
    expect([...new Set(pressed.moves.filter((move) => !move.onRow).map((move) => move.row))].sort()).toEqual(moved);
    expect(moved).not.toContain(pressed.anchor.id);
    if (width === 1280) {
      // The row being read is "Sunday…", at the top of Yes, so nothing scrolls: only "Opening…" and "Staff…" move.
      expect(pressed.anchor.id).not.toBe(ids.staff);
      expect(moved).toEqual([ids.opening, ids.staff].sort());
    } else {
      // On a phone only No shows, and the row being read is "Staff…". The page scrolls to hold it still, so "Opening…"
      // moves above it and "Few…" moves up the screen by as much as the page scrolled.
      expect(pressed.anchor.id).toBe(ids.staff);
      expect(moved).toEqual([ids.opening, ids.few].sort());
    }

    // The row being read stays within 1 px, and the wires stay on their cards, in every frame and at the end.
    for (const frame of sampled) expect(frame, `the frame at ${frame.at} ms`).toEqual({ at: frame.at, anchorWithin1px: true, wires: [] });
    expect(Math.abs((await anchorTop(reader, pressed.anchor.id)) - pressed.anchor.top)).toBeLessThanOrEqual(1);
    await expect.poll(() => wireProblems(reader, 1)).toEqual([]);

    expect(await rows(reader, "No")).toEqual([NO[1], NO[0], NO[2]]);
    expect(near(await reloaded(reader, width), onPage(after), 1)).toEqual([]);
  });

  test(`B-05 M-02 M-15: at ${width} px, a second Update during the shuffle ends at the newest order`, async ({ board }) => {
    const reader = await open(board, "jordan_w", width);
    const other = await open(board, "tess.b", width);
    await showNo(reader, width);
    await voteOpeningToTheTop(board, other, width);
    await nextOrder(board, reader);
    const first = await pressUpdate(reader, "first");
    expect(first.moves.length).toBeGreaterThan(0);
    // The first shuffle is held partway, a fifth of the way in, where the settle curve has the moving rows at their
    // largest, and "Staff…" goes from 3 to 5, back above "Opening…" at 4.
    await frameAt(reader, "first", Math.round(first.span * 0.2));
    const staff = await find(board, NO[0]!);
    for (const person of ["lin.zhao", "omar_h"] as const) await board.api(person).put(`arguments/${staff.argument}/importance`, { value: 1 });
    await nextOrder(board, reader);

    const second = await pressUpdate(reader, "second");
    expect(second.moves.length).toBeGreaterThan(0);
    // The first shuffle stops where it is, and the second starts from there: in its first frame, every row is centred
    // where the paused first shuffle drew it, with no jump.
    expect(await reader.evaluate(() => (window as unknown as Record<string, Animation[]>).first!.map((animation) => animation.playState))).toEqual(first.moves.map(() => "idle"));
    await frameAt(reader, "second", 0);
    expect(near(await centres(reader), second.centres, 1)).toEqual([]);
    await finish(reader, "second");
    expect(Math.abs((await anchorTop(reader, second.anchor.id)) - second.anchor.top)).toBeLessThanOrEqual(1);
    expect(await rows(reader, "No")).toEqual(NO);
    await expect.poll(() => wireProblems(reader, 1)).toEqual([]);
    const after = onPage(await places(reader));
    expect(near(await reloaded(reader, width), after, 1)).toEqual([]);
  });

  test(`B-05 M-02 M-15: at ${width} px with reduced motion, Update starts no Web Animation and draws the same layout`, async ({ board }) => {
    const reader = await open(board, "jordan_w", width);
    const other = await open(board, "tess.b", width);
    await reader.emulateMedia({ reducedMotion: "reduce" });
    await showNo(reader, width);
    await voteOpeningToTheTop(board, other, width);
    await nextOrder(board, reader);

    const pressed = await pressUpdate(reader, "shuffle");
    expect(pressed.moves).toEqual([]);
    expect(await reader.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await rows(reader, "No")).toEqual([NO[1], NO[0], NO[2]]);
    expect(Math.abs((await anchorTop(reader, pressed.anchor.id)) - pressed.anchor.top)).toBeLessThanOrEqual(1);
    await expect.poll(() => wireProblems(reader, 1)).toEqual([]);
    const after = onPage(await places(reader));
    expect(near(await reloaded(reader, width), after, 1)).toEqual([]);
  });
}
