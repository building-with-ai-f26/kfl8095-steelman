// plans/build-plan.md, M3d-5, "Rows unfold and fold, and card details open
// and close" (A-04, A-02, M-15), at 1280 and 375 px. Compare eases the
// board's columns and the lead card's width, grows the row's axis, and slides
// each version out from the lead card's x, 45 ms apart for each version, as
// the prototype's render(..., 'unfold') does
// (docs/prototype/source/steelman-refined.html). Fold closes the row at once,
// and an inert copy slides the versions back into the lead card, as the
// prototype's foldOut does, and then leaves the page. A card's details ease
// their height open, and closing eases an inert copy shut while the real
// reveal is `hidden` at once, as the prototype's 'detail' and collapseOut do.
// Focus and the spoken sentence stay what they are today, and every animation
// ends in the layout the app draws under reduced motion.
//
// Web Animations run on the page's own timeline, which Playwright's clock
// doesn't move, so the tests catch each new animation the moment it starts,
// hold it paused, and set its time themselves, as cards-arrive-leave.spec.ts
// does.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, row } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
/** Two more wordings of the Sunday row, so that it has four and the stagger has three turns. */
const MORE = ["Many people who work all week are free only on Sundays.", "For weekday workers, Sunday is often the only day off."];
const WIDTHS = [1280, 375] as const;
/** The prototype's stagger between one version and the next. */
const STAGGER_MS = 45;
/** The most turns the stagger takes after the first version, so that the last one starts within 270 ms. */
const MOST_TURNS = 6;
/** --sm-medium, the fold's slide. */
const MEDIUM_MS = 200;

interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Every row and card on screen, by "node:" or "card:" and its ID, on the page itself (independent of scrolling). */
function places(page: Page): Promise<Record<string, Place>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-node], .sm-card[data-card]")].flatMap((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        if (!width && !height) return [];
        const key = element.dataset.node !== undefined ? `node:${element.dataset.node}` : `card:${element.dataset.card}`;
        return [[key, { left: left + window.scrollX, top: top + window.scrollY, width, height }]];
      }),
    ),
  );
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

/** The Sunday row with four wordings, opened for jordan_w; on a phone the window is 600 px tall, as in the other motion tests. */
async function setUp(board: TestBoard, width: number, options: { reduced?: boolean; at?: string } = {}): Promise<{ page: Page; argument: string; lead: string }> {
  const { argument, version } = await find(board, LEAD);
  const snapshot = await board.api("maya.chen").snapshot();
  const have = snapshot.versions.filter((v: { argumentId: string }) => v.argumentId === argument).length;
  if (have < 4) for (const wording of MORE) await board.api("omar_h").post(`arguments/${argument}/versions`, { id: board.ids.itemId(), wording, context: "" });
  const page = await board.open("jordan_w", { width, ...(options.at ? { at: options.at } : {}) });
  if (options.reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  if (width < 640) await page.setViewportSize({ width, height: 600 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await page.evaluate(() => document.fonts.ready);
  return { page, argument, lead: version };
}

/** Scrolls a row's track back to its start, so that its cards are measured where a fresh page draws them. */
async function trackToStart(page: Page, argument: string): Promise<void> {
  await page.evaluate((argument) => document.querySelector(`[data-node="${argument}"] .sm-track`)?.scrollTo({ left: 0 }), argument);
  await page.clock.runFor(40);
}

/** Stops the page's clock half a second on, so that a copy's backstop timer waits for the test however long a held frame takes. */
async function holdClock(page: Page): Promise<void> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
}

interface Caught {
  /** "board", "row:<id>", "card:<id>", "vote:<id>", "axis", "slot", "reveal:<id>", "copy:card", "copy:other", or "copy:reveal". */
  on: string;
  keyframes: Record<string, string>[];
  duration: number;
  delay: number;
}

/**
 * Clicks the element in the page itself and holds the Web Animations that start after it, paused, under `name`,
 * before any has run more than a few ms. A click from inside the page moves no focus, as a script's doesn't.
 */
function clickAndCatch(page: Page, name: string, selector: string): Promise<Caught[]> {
  return page.evaluate(
    async ({ name, selector }) => {
      const ours = () => document.getAnimations().filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
      const earlier = new Set(ours());
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) throw new Error(`Nothing matches ${selector}`);
      target.click();
      let held: Animation[] = [];
      const start = document.timeline.currentTime as number;
      while (!held.length && (document.timeline.currentTime as number) - start < 5_000) {
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
        if (element.closest(".sm-folding-layer")) return element.matches(".sm-card") ? "copy:card" : "copy:other";
        if (element.matches(".sm-folding-reveal")) return "copy:reveal";
        if (element.matches(".sm-board")) return "board";
        if (element.matches("[data-node]")) return `row:${(element as HTMLElement).dataset.node}`;
        if (element.matches(".sm-card[data-card]")) return `card:${(element as HTMLElement).dataset.card}`;
        if (element.matches("[data-vote-for]")) return `vote:${(element as HTMLElement).dataset.voteFor}`;
        if (element.matches(".sm-track-axis")) return "axis";
        if (element.matches(".sm-card-reveal")) return `reveal:${element.id.replace("sm-reveal-", "")}`;
        if (element.closest(".sm-track")) return "slot";
        return element.className;
      };
      return held.map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        return {
          on: on(effect.target!),
          keyframes: effect.getKeyframes().map((keyframe) =>
            Object.fromEntries(Object.entries(keyframe).flatMap(([key, value]) => (["offset", "easing", "composite"].includes(key) ? [] : [[key === "computedOffset" ? "offset" : key, String(value)]]))),
          ),
          duration: Number(effect.getComputedTiming().duration),
          delay: Number(effect.getTiming().delay ?? 0),
        };
      });
    },
    { name, selector },
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

/** Counts every Web Animation the page starts from now on, so that one which starts and ends between two checks still counts. */
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

function animationsStarted(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { animationsStarted: number }).animationsStarted);
}

/** The copies a fold or a closing card leaves for a moment: none once the motion is over. */
function copies(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll(".sm-folding-layer > *, .sm-folding-reveal").length);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Where the focus is and what the status line says, in words a test can compare. */
function focusAndSpeech(page: Page): Promise<{ focus: string; status: string }> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const card = active?.closest<HTMLElement>("[data-card]")?.dataset.card ?? "";
    // The element itself, by its kind and its card; a chevron's own label says "Expand" once it has closed the card.
    const focus = !active || active === document.body ? "body" : `${active.tagName} ${active.className} ${card}`;
    return { focus, status: document.querySelector("#sm-status")?.textContent ?? "" };
  });
}

for (const width of WIDTHS) {
  test(`A-04 M-15: at ${width} px, Compare eases the board's width and slides each version out from the lead card's x, 45 ms apart, and the layout ends where a reduced-motion run draws it`, async ({ board }) => {
    const { page, argument, lead } = await setUp(board, width);

    const caught = await clickAndCatch(page, "unfold", `[data-node="${argument}"] .sm-stack-button`);
    const versions = await page.evaluate((argument) => [...document.querySelectorAll<HTMLElement>(`[data-node="${argument}"] .sm-track > .sm-card`)].map((card) => card.dataset.card!), argument);
    expect(versions).toHaveLength(4);
    expect(versions[0]).toBe(lead);

    // A width animation: the board's columns where they change (a phone's board has one column), and the lead card's width.
    const columns = caught.filter((c) => c.on === "board");
    if (width >= 640) {
      expect(columns).toHaveLength(1);
      expect(columns[0]!.keyframes[0]!.gridTemplateColumns).not.toBe(columns[0]!.keyframes.at(-1)!.gridTemplateColumns);
      expect(columns[0]!.duration).toBe(420);
    } else expect(columns).toEqual([]);
    const leadWidth = caught.filter((c) => c.on === `card:${lead}` && c.keyframes[0]!.width !== undefined);
    expect(leadWidth).toHaveLength(1);
    expect(leadWidth[0]!.keyframes[0]!.width).not.toBe(leadWidth[0]!.keyframes.at(-1)!.width);
    // The axis grows from nothing.
    const axis = caught.filter((c) => c.on === "axis");
    expect(axis).toHaveLength(1);
    expect(axis[0]!.keyframes[0]!.height).toBe("0px");

    // Every version after the lead, its vote with it, slides from a translate to none, 45 ms after the one before it.
    versions.slice(1).forEach((id, turn) => {
      for (const on of [`card:${id}`, `vote:${id}`]) {
        const slide = caught.filter((c) => c.on === on && c.keyframes[0]!.transform !== undefined);
        expect(slide, on).toHaveLength(1);
        expect(slide[0]!.keyframes[0]!.transform).toMatch(/^translateX\(-\d+(\.\d+)?px\)$/);
        expect(slide[0]!.keyframes.at(-1)!.transform).toBe("none");
        expect(slide[0]!.delay).toBe(turn * STAGGER_MS);
        expect(slide[0]!.duration).toBe(420);
      }
    });
    // Nothing on the lead's own vote, and nothing on any other row or card: only the board, the axis, this row, its
    // lead card, and its other versions, their votes, and its track's slot move.
    expect(caught.filter((c) => c.on === `vote:${lead}`)).toEqual([]);
    // "slot" is the new-wording slot at the end of this row's track, the only track on the page, which slides with them.
    const allowed = new Set(["board", "axis", "slot", `row:${argument}`, `card:${lead}`, ...versions.slice(1).flatMap((id) => [`card:${id}`, `vote:${id}`])]);
    expect(caught.map((c) => c.on).filter((on) => !allowed.has(on))).toEqual([]);

    // In the first frame each version is at the lead card's x.
    await frameAt(page, "unfold", 0);
    const lefts = await page.evaluate((versions) => versions.map((id) => document.querySelector(`.sm-card[data-card="${id}"]`)!.getBoundingClientRect().left), versions);
    for (const left of lefts.slice(1)) expect(Math.abs(left - lefts[0]!)).toBeLessThanOrEqual(1);

    await finish(page, "unfold");
    expect(await copies(page)).toBe(0);
    await expectNoAxeViolations(page);
    await trackToStart(page, argument);
    const after = await places(page);

    // A reduced-motion run of the same draws the same layout, and starts nothing.
    const still = await setUp(board, width, { reduced: true });
    await countAnimations(still.page);
    await row(still.page, LEAD).getByRole("button", { name: "Compare 4 wordings of this argument" }).click();
    await expect(row(still.page, LEAD).locator(".sm-track")).toBeVisible();
    await trackToStart(still.page, argument);
    expect(await animationsStarted(still.page)).toBe(0);
    expect(near(await places(still.page), after, 1)).toEqual([]);
  });

  test(`A-04 M-15: at ${width} px, Fold closes the row at once while an inert copy slides the versions back into the lead card, and nothing is left once it ends`, async ({ board }) => {
    const { page, argument, lead } = await setUp(board, width);
    const folded = await places(page);
    await row(page, LEAD).getByRole("button", { name: "Compare 4 wordings of this argument" }).click();
    await settled(page);
    const before = await page.evaluate((argument) => {
      const cards = [...document.querySelectorAll<HTMLElement>(`[data-node="${argument}"] .sm-track > .sm-card`)];
      return cards.map((card) => card.getBoundingClientRect().left);
    }, argument);
    await holdClock(page);

    const caught = await clickAndCatch(page, "fold", `[data-node="${argument}"] .sm-fold`);

    // The row is closed at once: no track, its stack back.
    expect(await page.evaluate((argument) => document.querySelectorAll(`[data-node="${argument}"] .sm-track`).length, argument)).toBe(0);
    await expect(row(page, LEAD).getByRole("button", { name: "Compare 4 wordings of this argument" })).toBeVisible();
    // The copy is hidden from screen readers and the cursor, and names no row, card, or control.
    const copy = await page.evaluate(() => {
      const layer = document.querySelector(".sm-folding-layer")!;
      return {
        hidden: layer.getAttribute("aria-hidden"),
        inert: layer.hasAttribute("inert"),
        cards: layer.querySelectorAll(".sm-card").length,
        named: [...layer.querySelectorAll("*")].flatMap((element) => [...element.attributes].map((a) => a.name)).filter((name) => name === "id" || name === "tabindex" || name.startsWith("data-") || name.startsWith("aria-")),
        lefts: [...layer.querySelectorAll<HTMLElement>(".sm-card")].map((card) => card.getBoundingClientRect().left),
      };
    });
    expect(copy).toMatchObject({ hidden: "true", inert: true, cards: 3, named: [] });

    // Each copied version slides from where it was to the lead card's x and fades; the lead's width eases back.
    const slides = caught.filter((c) => c.on === "copy:card");
    expect(slides).toHaveLength(3);
    for (const slide of slides) {
      expect(slide.keyframes[0]).toMatchObject({ transform: "none", opacity: "1" });
      expect(slide.keyframes.at(-1)!.opacity).toBe("0");
    }
    const ends = slides.map((slide, index) => copy.lefts[index]! + parseFloat(/^translateX\((-?[\d.]+)px\)$/.exec(slide.keyframes.at(-1)!.transform!)![1]!));
    for (const end of ends) expect(Math.abs(end - before[0]!)).toBeLessThanOrEqual(1);
    for (const slide of slides) expect(slide.delay).toBe(0);
    // The lead's width, the board's columns, and the row's height wait for the copy to slide home, as the prototype
    // awaits foldOut before its render(..., 'fold'); the row gives its axis's room back as the copy slides.
    const leadWidth = caught.filter((c) => c.on === `card:${lead}` && c.keyframes[0]!.width !== undefined);
    expect(leadWidth).toHaveLength(1);
    expect(leadWidth[0]!.delay).toBe(MEDIUM_MS);
    const columns = caught.filter((c) => c.on === "board");
    if (width >= 640) {
      expect(columns).toHaveLength(1);
      expect(columns[0]!.delay).toBe(MEDIUM_MS);
    }
    const height = caught.filter((c) => c.on === `row:${argument}` && c.keyframes[0]!.marginBottom !== undefined);
    expect(height).toHaveLength(1);
    expect(height[0]!.delay).toBe(MEDIUM_MS);
    const axisRoom = caught.filter((c) => c.on === `row:${argument}` && c.keyframes[0]!.paddingTop !== undefined);
    expect(axisRoom).toHaveLength(1);
    expect(axisRoom[0]!.delay).toBe(0);

    // In its first frame the copy holds each version where it was.
    await frameAt(page, "fold", 0);
    const held = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".sm-folding-layer .sm-card")].map((card) => card.getBoundingClientRect().left));
    held.forEach((left, index) => expect(Math.abs(left - before[index + 1]!)).toBeLessThanOrEqual(1));

    await finish(page, "fold");
    await expect.poll(() => copies(page)).toBe(0);
    // The accessibility check runs on the page's own timers.
    await page.clock.resume();
    await expectNoAxeViolations(page);
    expect(near(await places(page), folded, 1)).toEqual([]);
  });

  test(`A-02 M-15: at ${width} px, a card's details ease their height open and shut, closing leaves hidden set, and the focus and the status line don't change`, async ({ board }) => {
    const { page, lead } = await setUp(board, width);
    const closed = await places(page);
    const claim = page.locator(`[data-card="${lead}"] .sm-claim-button`);
    await claim.focus();
    const said = await focusAndSpeech(page);

    const opening = await clickAndCatch(page, "open", `[data-card="${lead}"] .sm-claim-button`);
    const grow = opening.filter((c) => c.on === `reveal:${lead}`);
    expect(grow).toHaveLength(1);
    expect(grow[0]!.keyframes[0]!.height).toBe("0px");
    expect(parseFloat(grow[0]!.keyframes.at(-1)!.height!)).toBeGreaterThan(0);
    expect(grow[0]!.duration).toBe(200);
    expect(await page.evaluate((id) => document.getElementById(`sm-reveal-${id}`)!.hidden, lead)).toBe(false);
    await frameAt(page, "open", 0);
    expect(await page.evaluate((id) => document.getElementById(`sm-reveal-${id}`)!.getBoundingClientRect().height, lead)).toBeLessThanOrEqual(1);
    await finish(page, "open");
    expect(await focusAndSpeech(page)).toEqual(said);
    await expect(page.getByRole("region", { name: "Context" })).toBeVisible();
    await expectNoAxeViolations(page);

    const chevron = page.locator(`[data-card="${lead}"] .sm-expand`);
    await chevron.focus();
    const before = await focusAndSpeech(page);
    await holdClock(page);
    const closing = await clickAndCatch(page, "close", `[data-card="${lead}"] .sm-expand`);
    // The real reveal is hidden at once, as today; an inert copy beside it eases shut.
    expect(await page.evaluate((id) => document.getElementById(`sm-reveal-${id}`)!.hidden, lead)).toBe(true);
    await expect(page.getByRole("region", { name: "Context" })).toHaveCount(0);
    const copy = await page.evaluate((id) => {
      const copies = [...document.querySelectorAll<HTMLElement>(`[data-card="${id}"] .sm-folding-reveal`)];
      return copies.map((element) => ({ hidden: element.getAttribute("aria-hidden"), inert: element.hasAttribute("inert"), id: element.id, height: element.getBoundingClientRect().height }));
    }, lead);
    expect(copy).toHaveLength(1);
    expect(copy[0]).toMatchObject({ hidden: "true", inert: true, id: "" });
    const shut = closing.filter((c) => c.on === "copy:reveal");
    expect(shut).toHaveLength(1);
    expect(parseFloat(shut[0]!.keyframes[0]!.height!)).toBeGreaterThan(0);
    expect(shut[0]!.keyframes.at(-1)!.height).toBe("0px");
    await frameAt(page, "close", 0);
    expect(await page.evaluate((id) => document.querySelector<HTMLElement>(`[data-card="${id}"] .sm-folding-reveal`)!.getBoundingClientRect().height, lead)).toBeCloseTo(parseFloat(shut[0]!.keyframes[0]!.height!), 0);
    expect(await focusAndSpeech(page)).toEqual(before);

    await finish(page, "close");
    await expect.poll(() => copies(page)).toBe(0);
    expect(await page.evaluate((id) => document.getElementById(`sm-reveal-${id}`)!.hidden, lead)).toBe(true);
    expect(await focusAndSpeech(page)).toEqual(before);
    expect(near(await places(page), closed, 1)).toEqual([]);
  });

  test(`A-04 A-02 M-15: at ${width} px, Compare, a card's details, and Fold leave the focus and the spoken sentence where reduced motion leaves them`, async ({ board }) => {
    const run = async (reduced: boolean) => {
      const { page, argument, lead } = await setUp(board, width, { reduced });
      const heard: { focus: string; status: string }[] = [];
      const press = async (selector: string) => {
        await page.locator(selector).focus();
        await page.keyboard.press("Enter");
        heard.push(await focusAndSpeech(page));
        await settled(page);
      };
      await press(`[data-node="${argument}"] .sm-stack-button`);
      await press(`[data-card="${lead}"] .sm-claim-button`);
      await press(`[data-card="${lead}"] .sm-expand`);
      await press(`[data-node="${argument}"] .sm-fold`);
      await expect.poll(() => copies(page)).toBe(0);
      return heard;
    };
    expect(await run(false)).toEqual(await run(true));
  });

  test(`A-04 M-15: at ${width} px, a fast double click on Compare, and a fold during an unfold, both end in a consistent layout with nothing left behind`, async ({ board }) => {
    const { page, argument } = await setUp(board, width);
    const folded = await places(page);

    // A fold during an unfold: both clicks land before the unfold's first frame has run its course.
    await page.evaluate(async (argument) => {
      document.querySelector<HTMLElement>(`[data-node="${argument}"] .sm-stack-button`)!.click();
      await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(null);
      });
      document.querySelector<HTMLElement>(`[data-node="${argument}"] .sm-fold`)!.click();
    }, argument);
    await settled(page);
    await expect.poll(() => copies(page)).toBe(0);
    expect(await page.evaluate((argument) => document.querySelectorAll(`[data-node="${argument}"] .sm-track`).length, argument)).toBe(0);
    expect(near(await places(page), folded, 1)).toEqual([]);

    // A fast double click: whatever the second click lands on, the board ends as a reduced-motion run of that state draws it.
    await row(page, LEAD).locator(".sm-stack-button").dblclick();
    await settled(page);
    await expect.poll(() => copies(page)).toBe(0);
    const unfolded = await page.evaluate((argument) => document.querySelectorAll(`[data-node="${argument}"] .sm-track`).length === 1, argument);
    const at = await page.evaluate(() => window.location.pathname);
    await trackToStart(page, argument);
    const after = await places(page);

    const still = await setUp(board, width, { reduced: true, at });
    if (unfolded && (await still.page.locator(`[data-node="${argument}"] .sm-track`).count()) === 0) await row(still.page, LEAD).getByRole("button", { name: "Compare 4 wordings of this argument" }).click();
    await trackToStart(still.page, argument);
    expect(near(await places(still.page), after, 1)).toEqual([]);
  });

  test(`A-04 M-15: at ${width} px, a fold clicked while the unfold still runs starts with the rows below where they were drawn`, async ({ board }) => {
    const { page, argument } = await setUp(board, width);
    // The rows below the Sunday row in its column, by ID, and their tops on the page as drawn now.
    const below = await page.evaluate((argument) => {
      const node = document.querySelector<HTMLElement>(`[data-node="${argument}"]`)!;
      const column = node.closest(".sm-column") ?? document;
      const top = node.getBoundingClientRect().top;
      return [...column.querySelectorAll<HTMLElement>("[data-node]")].filter((other) => other.getBoundingClientRect().top > top + 1).map((other) => other.dataset.node!);
    }, argument);
    expect(below.length).toBeGreaterThan(0);
    const tops = () => page.evaluate((ids) => ids.map((id) => document.querySelector(`[data-node="${id}"]`)!.getBoundingClientRect().top + window.scrollY), below);
    await holdClock(page);

    await clickAndCatch(page, "unfold", `[data-node="${argument}"] .sm-stack-button`);
    // Partway through the unfold, as the row grows and its bottom margin gives the rows below their room a step at a time.
    await frameAt(page, "unfold", 150);
    const drawn = await tops();

    await clickAndCatch(page, "fold", `[data-node="${argument}"] .sm-fold`);
    await frameAt(page, "fold", 0);
    const first = await tops();
    first.forEach((top, index) => expect(Math.abs(top - drawn[index]!), below[index]).toBeLessThanOrEqual(1));

    await finish(page, "fold");
    await expect.poll(() => copies(page)).toBe(0);
  });

  test(`A-04 A-02 M-15: at ${width} px with reduced motion, Compare, a card's details, and Fold start no animation and draw no copy`, async ({ board }) => {
    const { page, argument, lead } = await setUp(board, width, { reduced: true });
    await countAnimations(page);
    const none = async () => (await page.evaluate(() => document.getAnimations().length)) + (await animationsStarted(page)) + (await copies(page));

    await row(page, LEAD).getByRole("button", { name: "Compare 4 wordings of this argument" }).click();
    expect(await none()).toBe(0);
    await page.locator(`[data-card="${lead}"] .sm-claim-button`).click();
    await expect(page.getByRole("region", { name: "Context" })).toBeVisible();
    expect(await none()).toBe(0);
    await page.locator(`[data-card="${lead}"] .sm-expand`).click();
    expect(await page.evaluate((id) => document.getElementById(`sm-reveal-${id}`)!.hidden, lead)).toBe(true);
    expect(await none()).toBe(0);
    await page.locator(`[data-node="${argument}"] .sm-fold`).click();
    await expect(row(page, LEAD).locator(".sm-track")).toHaveCount(0);
    expect(await none()).toBe(0);
  });
}

test(`A-04 M-15: at 1280 px, on a row with ten wordings, the stagger stops growing after six turns, so the last version starts 270 ms late`, async ({ board }) => {
  const { argument } = await find(board, LEAD);
  const many = [
    "Sunday is the one day off for a lot of people who work during the week.",
    "Plenty of weekday workers have no other free day than Sunday.",
    "People with weekday jobs often get only Sunday to themselves.",
    "A Sunday opening serves people who have no free weekday.",
    "Workers on weekday shifts can come to the library only on Sundays.",
    "For many people with weekday jobs, Sunday is the one free day they have.",
  ];
  for (const wording of [...MORE, ...many]) await board.api("omar_h").post(`arguments/${argument}/versions`, { id: board.ids.itemId(), wording, context: "" });
  const { page } = await setUp(board, 1280);

  const caught = await clickAndCatch(page, "unfold", `[data-node="${argument}"] .sm-stack-button`);
  const versions = await page.evaluate((argument) => [...document.querySelectorAll<HTMLElement>(`[data-node="${argument}"] .sm-track > .sm-card`)].map((card) => card.dataset.card!), argument);
  expect(versions).toHaveLength(10);
  const delays = versions.slice(1).map((id) => caught.find((c) => c.on === `card:${id}` && c.keyframes[0]!.transform !== undefined)!.delay);
  expect(delays).toEqual(versions.slice(1).map((_, turn) => Math.min(turn, MOST_TURNS) * STAGGER_MS));
  expect(Math.max(...delays)).toBe(270);
  await finish(page, "unfold");
});
