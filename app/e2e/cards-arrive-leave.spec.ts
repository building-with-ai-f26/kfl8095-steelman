// plans/build-plan.md, M3d-4, "Cards arrive, and your deleted version gives
// up its place" (A-03, A-05, A-06, J-05, M-15), at 1280 and 375 px. The
// argument or wording you add rises 8 px and fades in, as the prototype's
// render(..., 'added') does (docs/prototype/source/steelman-refined.html),
// and the add slot after it makes room with motion.ts's flip(). Your deleted
// version leaves through a copy of its card that's hidden from screen readers
// and the cursor: its wording fades and its height eases into the dashed
// placeholder, and then the copy leaves the page. The rows below take their
// places at once, as they do today, and nothing animates on them. Undo plays
// the exit backwards on the real card. Every animation ends in the layout the
// app draws without motion, which a reload draws too.
//
// Web Animations run on the page's own timeline, which Playwright's clock
// doesn't move, so the tests catch each new animation the moment it starts,
// hold it paused, and set its time themselves, as shuffle-update.spec.ts does.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { column, find, poll, row, rows, status } from "./support/screen.ts";

const YES = ["Sunday is the only free day for many people who work weekdays.", "Students need a quiet place to study before Monday exams.", "Families could visit together on the one day nobody has school or work."];
const NO = ["Staff need a guaranteed day off.", "Opening a seventh day costs more than the budget allows.", "Few people would come, judging by Saturday afternoons."];
const SHIFT = "Shift workers can only come on Sundays.";
const NEW_ARGUMENT = "Sunday hours would cut into weekday hours.";
const NEW_WORDING = "Library staff need one guaranteed day off each week.";
const UNDO_MS = 10_000;
const WIDTHS = [1280, 375] as const;

interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Every row and card on screen, by "node:" or "card:" and its ID, on the page itself (independent of scrolling). */
function places(page: Page, within = "body"): Promise<Record<string, Place>> {
  return page.evaluate((within) => {
    const root = document.querySelector(within)!;
    return Object.fromEntries(
      [...root.querySelectorAll<HTMLElement>("[data-node], .sm-card[data-card]")].flatMap((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        if (!width && !height) return [];
        const key = element.dataset.node !== undefined ? `node:${element.dataset.node}` : `card:${element.dataset.card}`;
        return [[key, { left: left + window.scrollX, top: top + window.scrollY, width, height }]];
      }),
    );
  }, within);
}

function near(a: Record<string, Place>, b: Record<string, Place>, within: number): string[] {
  const problems = Object.keys(a).length === Object.keys(b).length ? [] : [`${Object.keys(a).length} rows and cards, not ${Object.keys(b).length}`];
  for (const [id, place] of Object.entries(a)) {
    const other = b[id];
    if (!other) problems.push(`${id} is missing`);
    else if ((["left", "top", "width", "height"] as const).some((side) => Math.abs(place[side] - other[side]) > within)) problems.push(`${id} is at ${JSON.stringify(place)}, not ${JSON.stringify(other)}`);
  }
  return problems;
}

/** Opens the board for one person; on a phone the window is 600 px tall, as in shuffle-update.spec.ts. */
async function open(board: TestBoard, person: "jordan_w" | "maya.chen" | "omar_h", width: number): Promise<Page> {
  const page = await board.open(person, { width });
  if (width < 640) await page.setViewportSize({ width, height: 600 });
  return page;
}

/** Reloads the page and waits for the board to be drawn again. */
async function reload(page: Page, width: number, side: "Yes" | "No"): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await showSide(page, width, side);
}

/** Scrolls a row's track back to its start, so that its cards are measured where a fresh page draws them. */
async function trackToStart(page: Page, argument: string): Promise<void> {
  await page.locator(`[data-node="${argument}"] .sm-track`).evaluate((element) => element.scrollTo({ left: 0 }));
  await page.clock.runFor(40);
}

/**
 * Stops the page's clock half a second on, so that its timers (the Undo bar's ten seconds, and the copy's own
 * backstop) wait for the test however long a held frame takes on a slow machine.
 */
async function holdClock(page: Page): Promise<void> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
}

/** On a phone only one side shows. */
async function showSide(page: Page, width: number, side: "Yes" | "No"): Promise<void> {
  if (width < 640) await page.getByRole("tab", { name: new RegExp(`^${side}`) }).click();
  await page.evaluate(() => document.fonts.ready);
}

interface Caught {
  /** What each new animation plays on: "card:<id>", "slot:argument", "slot:wording", "copy:box", "copy:face", or "row:<id>" for anything else in a row. */
  on: string;
  keyframes: { transform?: string; opacity?: string; height?: string; clipPath?: string; offset: number }[];
  duration: number;
  /** When it ends, in ms. */
  end: number;
}

/**
 * Clicks the element in the page itself and holds the Web Animations that start after it, paused, under `name`,
 * before any has run more than a few ms. An addition arrives only once the service has it, so this waits up to 15 s
 * of the page's own timeline, which Playwright's clock doesn't hold.
 */
function clickAndCatch(page: Page, name: string, selector: string, text?: string): Promise<Caught[]> {
  return page.evaluate(
    async ({ name, selector, text }) => {
      const ours = () => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
      const earlier = new Set(ours());
      const target = [...document.querySelectorAll<HTMLElement>(selector)].find((element) => text === undefined || element.textContent?.trim() === text);
      if (!target) throw new Error(`Nothing matches ${selector} ${text ?? ""}`);
      target.click();
      let held: Animation[] = [];
      const start = document.timeline.currentTime as number;
      while (!held.length && (document.timeline.currentTime as number) - start < 15_000) {
        await new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = resolve;
          channel.port2.postMessage(null);
        });
        held = ours().filter((animation) => !earlier.has(animation));
      }
      for (const animation of held) animation.pause();
      (window as unknown as Record<string, Animation[]>)[name] = held;
      const on = (element: Element): string => {
        if (element.closest(".sm-leaving-layer")) return element.matches(".sm-leaving") ? "copy:box" : "copy:face";
        if (element.matches(".sm-card[data-card]")) return `card:${(element as HTMLElement).dataset.card}`;
        if (element.matches(".sm-new-idea")) return "slot:argument";
        if (element.matches(".sm-track .sm-add-card")) return "slot:wording";
        return `row:${element.closest<HTMLElement>("[data-node]")?.dataset.node ?? element.className}`;
      };
      return held.map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        return {
          on: on(effect.target!),
          keyframes: effect.getKeyframes().map((keyframe) => ({
            ...(keyframe.transform !== undefined ? { transform: String(keyframe.transform) } : {}),
            ...(keyframe.opacity !== undefined ? { opacity: String(keyframe.opacity) } : {}),
            ...(keyframe.height !== undefined ? { height: String(keyframe.height) } : {}),
            ...(keyframe.clipPath !== undefined ? { clipPath: String(keyframe.clipPath) } : {}),
            offset: keyframe.computedOffset,
          })),
          duration: Number(effect.getComputedTiming().duration),
          end: Number(effect.getComputedTiming().endTime),
        };
      });
    },
    { name, selector, text },
  );
}

/** Sets every held animation to the same moment, and lets the wires catch up with it. */
async function frameAt(page: Page, name: string, ms: number): Promise<void> {
  await page.evaluate(
    ({ name, ms }) => {
      for (const animation of (window as unknown as Record<string, Animation[]>)[name]!) if (animation.playState !== "idle") animation.currentTime = ms;
    },
    { name, ms },
  );
  await page.clock.runFor(40);
}

/** Lets the held animations run to their end, and waits until no Web Animation is left on the page. */
async function finish(page: Page, name: string): Promise<void> {
  await page.evaluate((name) => {
    for (const animation of (window as unknown as Record<string, Animation[]>)[name]!) if (animation.playState !== "idle") animation.finish();
  }, name);
  await settled(page);
}

/** Waits until nothing on the page is animating, CSS included. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/**
 * Counts every Web Animation the page starts from now on, by wrapping Element.prototype.animate, so that one which
 * starts and ends between two checks still counts.
 */
async function countAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    const counted = window as unknown as { animationsStarted: number };
    counted.animationsStarted = 0;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      counted.animationsStarted++;
      return animate.apply(this, args);
    };
  });
}

/** How many Web Animations the page has started since countAnimations(). */
function animationsStarted(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { animationsStarted: number }).animationsStarted);
}

async function openMenu(page: Page, wording: string): Promise<void> {
  await page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) }).getByRole("button", { name: "Options for this version" }).click();
  await expect(page.getByRole("menu", { name: "Version options" })).toBeVisible();
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const ENTRANCE = [
  { transform: "translateY(8px)", opacity: "0", offset: 0 },
  { transform: "none", opacity: "1", offset: 1 },
];

for (const width of WIDTHS) {
  test(`A-03 M-15: at ${width} px, your new argument rises 8 px and fades in once, the add slot below makes room with a flip, and the layout ends where a reload draws it`, async ({ board }) => {
    const page = await open(board, "jordan_w", width);
    await showSide(page, width, "No");
    await page.getByRole("button", { name: "Add an argument for No" }).click();
    await page.getByRole("textbox", { name: "Your argument", exact: true }).fill(NEW_ARGUMENT);

    const caught = await clickAndCatch(page, "arrive", 'button[aria-label="Add your argument"]');
    const { version } = await find(board, NEW_ARGUMENT);

    // One entrance, on the new card, at --sm-medium; one move on the slot below it, which ends at its place; nothing else.
    expect(caught.filter((c) => c.on === `card:${version}`)).toEqual([{ on: `card:${version}`, keyframes: ENTRANCE, duration: 200, end: 200 }]);
    const slot = caught.filter((c) => c.on === "slot:argument");
    expect(slot).toHaveLength(1);
    expect(slot[0]!.keyframes.at(0)!.transform).toMatch(/^translate\(0px, -\d+(\.\d+)?px\)$/);
    expect(slot[0]!.keyframes.at(-1)!.transform).toBe("none");
    expect(caught.map((c) => c.on).sort()).toEqual([`card:${version}`, "slot:argument"].sort());

    // In its first frame the new card is clear and 8 px below its place.
    await frameAt(page, "arrive", 0);
    expect(await page.evaluate((id) => getComputedStyle(document.querySelector(`[data-card="${id}"]`)!).opacity, version)).toBe("0");
    await finish(page, "arrive");

    expect(await rows(page, "No")).toEqual([...NO, NEW_ARGUMENT]);
    const after = await places(page);
    await reload(page, width, "No");
    expect(near(await places(page), after, 1)).toEqual([]);
  });

  test(`A-05 M-15: at ${width} px, your new wording rises 8 px and fades in at the end of its row, the slot beside it makes room with a flip, and the layout ends where a reload draws it`, async ({ board }) => {
    const page = await open(board, "jordan_w", width);
    await showSide(page, width, "No");
    await row(page, NO[0]!).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    await row(page, NO[0]!).getByRole("button", { name: "Suggest a better version" }).click();
    await row(page, NO[0]!).getByRole("textbox", { name: "Your version", exact: true }).fill(NEW_WORDING);

    const caught = await clickAndCatch(page, "arrive", 'button[aria-label="Add your version"]');
    const { version, argument } = await find(board, NEW_WORDING);

    expect(caught.filter((c) => c.on === `card:${version}`)).toEqual([{ on: `card:${version}`, keyframes: ENTRANCE, duration: 200, end: 200 }]);
    const slot = caught.filter((c) => c.on === "slot:wording");
    expect(slot).toHaveLength(1);
    expect(slot[0]!.keyframes.at(0)!.transform).toMatch(/^translate\(-\d+(\.\d+)?px, 0px\)$/);
    expect(slot[0]!.keyframes.at(-1)!.transform).toBe("none");
    expect(caught.map((c) => c.on).sort()).toEqual([`card:${version}`, "slot:wording"].sort());
    await finish(page, "arrive");

    const track = row(page, NO[0]!).locator(".sm-track .sm-card .sm-claim");
    await expect(track).toHaveText([NO[0]!, "Library staff already work Saturdays, so Sunday would leave them no weekend.", NEW_WORDING]);
    await trackToStart(page, argument);
    const after = await places(page);
    await reload(page, width, "No");
    await row(page, NO[0]!).getByRole("button", { name: "Compare 3 wordings of this argument" }).click();
    await settled(page);
    await trackToStart(page, argument);
    expect(near(await places(page), after, 1)).toEqual([]);
  });

  test(`A-06 J-05 M-15: at ${width} px, deleting your argument's only wording plays an exit on an inert copy that ends at the placeholder and leaves the page, and nothing animates on the rows below`, async ({ board }) => {
    const page = await open(board, "jordan_w", width);
    await showSide(page, width, "No");
    const budget = await find(board, NO[1]!);
    const few = await find(board, NO[2]!);
    const was = (await places(page))[`card:${budget.version}`]!;
    await openMenu(page, NO[1]!);
    await holdClock(page);

    const caught = await clickAndCatch(page, "leave", '[role="menuitem"]', "Delete argument");

    // The row is off at once, as today, with its Undo bar where it was and the cursor on Undo.
    expect(await rows(page, "No")).toEqual([NO[0], NO[2]]);
    await expect(column(page, "No").locator(".sm-undo")).toHaveText("Argument deleted.Undo");
    await expect(page.locator(".sm-undo").getByRole("button", { name: "Undo" })).toBeFocused();
    await expect(status(page)).toHaveText("Argument deleted. Undo is available for ten seconds.");

    // Everything that moves is on the copy: none on a row or a card the board draws.
    expect(caught.length).toBeGreaterThan(0);
    expect(caught.filter((c) => !c.on.startsWith("copy:"))).toEqual([]);
    // The copy is hidden from screen readers and from the cursor, and carries nothing that names a row or card.
    const copy = await page.evaluate(() => {
      const layer = document.querySelector(".sm-leaving-layer")!;
      return {
        hidden: layer.getAttribute("aria-hidden"),
        inert: (layer as HTMLElement).inert,
        copies: layer.querySelectorAll(".sm-leaving").length,
        named: layer.querySelectorAll("[id], [data-card], [data-node], [data-key]").length,
      };
    });
    expect(copy).toEqual({ hidden: "true", inert: true, copies: 1, named: 0 });

    // Its first frame is the card where it was.
    await frameAt(page, "leave", 0);
    const first = await page.locator(".sm-leaving").evaluate((box) => {
      const { left, top, width, height } = box.getBoundingClientRect();
      return { left: left + window.scrollX, top: top + window.scrollY, width, height, face: getComputedStyle(box.querySelector(".sm-leaving-face")!).opacity };
    });
    for (const side of ["left", "top", "width", "height"] as const) expect(Math.abs(first[side] - was[side]), side).toBeLessThanOrEqual(1);
    expect(first.face).toBe("1");
    const below = (await places(page))[`node:${few.argument}`]!;
    const fold = Math.max(...caught.filter((c) => c.on === "copy:face").map((c) => c.end));

    // Halfway through the fold, the Undo bar that took the card's place is drawn over the copy, not under it. The
    // copy's layer skips the cursor, so for this one look it takes it, to find what's drawn on top where they overlap.
    await frameAt(page, "leave", fold / 2);
    const stack = await page.evaluate(() => {
      const layer = document.querySelector<HTMLElement>(".sm-leaving-layer")!;
      const bar = document.querySelector<HTMLElement>(".sm-undo")!;
      const a = bar.getBoundingClientRect();
      const b = layer.querySelector(".sm-leaving")!.getBoundingClientRect();
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      if (right - left < 2 || bottom - top < 2) return { overlap: false, bar: -1, copy: -1 };
      layer.inert = false;
      layer.style.pointerEvents = "auto";
      try {
        const hits = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2);
        return { overlap: true, bar: hits.findIndex((hit) => bar.contains(hit)), copy: hits.findIndex((hit) => layer.contains(hit)) };
      } finally {
        layer.inert = true;
        layer.style.pointerEvents = "";
      }
    });
    expect(stack.overlap).toBe(true);
    expect(stack.bar).toBeGreaterThanOrEqual(0);
    expect(stack.copy).toBeGreaterThan(stack.bar);

    // Once its height has eased, the wording is gone and the copy is the dashed placeholder, as tall as its note.
    await frameAt(page, "leave", fold);
    const folded = await page.locator(".sm-leaving").evaluate((box: HTMLElement) => ({
      height: box.getBoundingClientRect().height,
      note: (box.querySelector(".sm-leaving-note") as HTMLElement).offsetHeight + box.offsetHeight - box.clientHeight,
      face: getComputedStyle(box.querySelector(".sm-leaving-face")!).opacity,
      border: getComputedStyle(box).borderTopStyle,
      says: box.querySelector(".sm-leaving-note")!.textContent,
    }));
    expect(Math.abs(folded.height - folded.note)).toBeLessThanOrEqual(1);
    expect(folded).toMatchObject({ face: "0", border: "dashed", says: "Deleted by jordan_w" });
    // The row below took its place at once and doesn't move while the copy leaves.
    expect(near({ few: (await places(page))[`node:${few.argument}`]! }, { few: below }, 0.5)).toEqual([]);

    await finish(page, "leave");
    await expect(page.locator(".sm-leaving")).toHaveCount(0);
    expect(near({ few: (await places(page))[`node:${few.argument}`]! }, { few: below }, 0.5)).toEqual([]);

    // Once it's sent and polled, nothing animates on the board, and the layout is a reload's.
    const answered = page.waitForResponse((response) => response.request().method() === "DELETE");
    await page.clock.runFor(UNDO_MS + 1_000);
    await answered;
    await poll(page);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length)).toBe(0);
    expect(await rows(page, "No")).toEqual([NO[0], NO[2]]);
    const after = await places(page);
    await reload(page, width, "No");
    expect(near(await places(page), after, 1)).toEqual([]);
  });

  test(`J-05 A-06 M-15: at ${width} px, Undo during the exit takes the copy away at once, plays the exit backwards on the real card, and ends at the earlier layout with the cursor on the card`, async ({ board }) => {
    const page = await open(board, "maya.chen", width);
    await showSide(page, width, "Yes");
    const lead = await find(board, YES[0]!);
    const before = await places(page);
    await openMenu(page, YES[0]!);
    await holdClock(page);
    const leaving = await clickAndCatch(page, "leave", '[role="menuitem"]', "Delete version");
    expect(leaving.filter((c) => !c.on.startsWith("copy:"))).toEqual([]);
    // The row's other wording leads it meanwhile, as today.
    expect((await rows(page, "Yes"))[0]).toBe(SHIFT);
    await frameAt(page, "leave", 60);

    const back = await clickAndCatch(page, "back", ".sm-undo button", "Undo");

    // The copy leaves at once, so only the real card is drawn, and the reverse plays on it alone.
    expect(await page.locator(".sm-leaving").count()).toBe(0);
    expect(await page.locator(`[data-card="${lead.version}"]`).count()).toBe(1);
    expect(back.map((c) => c.on)).toEqual([`card:${lead.version}`]);
    const keyframes = back[0]!.keyframes;
    expect(keyframes.at(0)).toMatchObject({ opacity: "0" });
    expect(keyframes.at(0)!.clipPath).toMatch(/^inset\(/);
    expect(keyframes.at(-1)).toMatchObject({ opacity: "1" });
    await finish(page, "back");

    expect(near(await places(page), before, 1)).toEqual([]);
    expect(await rows(page, "Yes")).toEqual(YES);
    await expect(page.locator(`[data-card="${lead.version}"]`).getByRole("button", { name: YES[0]! })).toBeFocused();
    await expect(status(page)).toHaveText("Restored.");
  });

  test(`A-03 A-06 M-04 M-15: at ${width} px, the board passes an accessibility scan once an arrival and an exit have ended`, async ({ board }) => {
    const page = await open(board, "jordan_w", width);
    await showSide(page, width, "No");
    await page.getByRole("button", { name: "Add an argument for No" }).click();
    await page.getByRole("textbox", { name: "Your argument", exact: true }).fill(NEW_ARGUMENT);
    await page.getByRole("button", { name: "Add your argument" }).click();
    await expect(column(page, "No").locator(".sm-claim").last()).toHaveText(NEW_ARGUMENT);
    await settled(page);
    await expectNoAxeViolations(page);

    await openMenu(page, NO[1]!);
    await page.getByRole("menuitem", { name: "Delete argument" }).click();
    await expect(page.locator(".sm-undo")).toBeVisible();
    await settled(page);
    await expect(page.locator(".sm-leaving")).toHaveCount(0);
    await expectNoAxeViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`A-03 A-05 A-06 J-05 M-15: at ${width} px with reduced motion, adding, deleting, and Undo start no animation and draw no copy`, async ({ board }) => {
    const page = await open(board, "jordan_w", width);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await showSide(page, width, "No");
    await countAnimations(page);
    // Nothing runs now, and nothing has started since the count began, even for a moment.
    const none = async () => (await page.evaluate(() => document.getAnimations().length)) + (await animationsStarted(page));

    await page.getByRole("button", { name: "Add an argument for No" }).click();
    await page.getByRole("textbox", { name: "Your argument", exact: true }).fill(NEW_ARGUMENT);
    await page.getByRole("button", { name: "Add your argument" }).click();
    await expect(column(page, "No").locator(".sm-claim").last()).toHaveText(NEW_ARGUMENT);
    expect(await none()).toBe(0);

    await row(page, NO[0]!).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    await row(page, NO[0]!).getByRole("button", { name: "Suggest a better version" }).click();
    await row(page, NO[0]!).getByRole("textbox", { name: "Your version", exact: true }).fill(NEW_WORDING);
    await row(page, NO[0]!).getByRole("button", { name: "Add your version" }).click();
    await expect(row(page, NO[0]!).locator(".sm-track .sm-card .sm-claim").last()).toHaveText(NEW_WORDING);
    expect(await none()).toBe(0);

    await openMenu(page, NO[1]!);
    await page.getByRole("menuitem", { name: "Delete argument" }).click();
    await expect(page.locator(".sm-undo")).toBeVisible();
    expect(await none()).toBe(0);
    expect(await page.locator(".sm-leaving").count()).toBe(0);

    await page.locator(".sm-undo").getByRole("button", { name: "Undo" }).click();
    await expect(status(page)).toHaveText("Restored.");
    expect(await none()).toBe(0);
    expect(await rows(page, "No")).toEqual([...NO, NEW_ARGUMENT]);
  });
}

test("A-03 A-05 B-05 M-02 M-15: other people's additions join the end at once, with no entrance and no move", async ({ board }) => {
  const page = await open(board, "jordan_w", 1280);
  await showSide(page, 1280, "No");
  const staff = await find(board, NO[0]!);
  await row(page, NO[0]!).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await settled(page);
  await countAnimations(page);
  await board.api("omar_h").post("arguments", { id: board.ids.itemId(), optionId: board.demo.options.no, versionId: board.ids.itemId(), wording: NEW_ARGUMENT, context: "" });
  await board.api("omar_h").post(`arguments/${staff.argument}/versions`, { id: board.ids.itemId(), wording: NEW_WORDING, context: "" });

  await poll(page);
  await expect.poll(() => rows(page, "No")).toEqual([...NO, NEW_ARGUMENT]);
  await expect(row(page, NO[0]!).locator(".sm-track .sm-card .sm-claim").last()).toHaveText(NEW_WORDING);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length)).toBe(0);
  // None started and ended while the rows were arriving, either.
  expect(await animationsStarted(page)).toBe(0);
});
