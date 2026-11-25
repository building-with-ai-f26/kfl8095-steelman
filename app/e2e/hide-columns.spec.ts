// plans/build-plan.md, M3d-6, "Hide a column, or show only one" (A-08, M-15),
// ported from the prototype's hide-col, solo-col and show-col
// (docs/prototype/source/steelman-refined.html). Hiding is a way of reading,
// so every role gets the two items: an Editor or the Owner in the option's ⋯
// after Rename and Delete, and a role below Editor under its own Column view
// button. A hidden column folds to a 44 px strip, "Show <option>", with its
// name and argument count, as Trello's collapsed list does, and a click on it
// brings the column back, as Google Sheets' hidden-column marker does. Which
// columns are hidden stays in this browser, for each board, and never reaches
// the service.
//
// Web Animations run on the page's own timeline, which Playwright's clock
// doesn't move, so the motion test catches each new animation the moment it
// starts and holds it paused, as unfold-motion.spec.ts does. Its helpers are
// copied here, not imported, so that file stays as it is.

import AxeBuilder from "@axe-core/playwright";
import type { Page, Request } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { column, find, row, status } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SECOND = "Shift workers can only come on Sundays.";
const EDITED = "Sunday is the only day off for many people who work weekdays.";
const HIDE = "Hide this column";
const SOLO = "Show only this column";
const HIDE_HINT = "It folds to a strip. Click the strip to bring it back.";
const LAST_HINT = "At least one column stays visible.";
const SOLO_HINT = "This hides the other columns.";

const viewButton = (page: Page, option: string) => page.getByRole("button", { name: `Column view for ${option}`, exact: true });
const viewMenu = (page: Page) => page.getByRole("menu", { name: "Column view" });
const optionsButton = (page: Page, option: string) => page.getByRole("button", { name: `Options for ${option}`, exact: true });
const settingsMenu = (page: Page) => page.getByRole("menu", { name: "Option settings" });
/** A hidden column's strip, "Show Yes, 3 arguments": its name holds every word drawn on it, as WCAG's label in name asks. */
const strip = (page: Page, option: string) => page.getByRole("button", { name: new RegExp(`^Show ${option}, \\d+ arguments?$`) });
const columnNames = (page: Page) => page.locator(".sm-board > .sm-column").evaluateAll((sections) => sections.map((section) => section.getAttribute("aria-label")));
const stripNames = (page: Page) => page.locator(".sm-board > .sm-col-hidden .sm-col-hidden-name").allTextContents();

/** Opens the board as someone below Editor and hides an option's column by its Column view menu. */
async function hideByView(page: Page, option: string): Promise<void> {
  await viewButton(page, option).click();
  await viewMenu(page).getByRole("menuitem", { name: HIDE }).click();
  await expect(strip(page, option)).toBeVisible();
}

/** Adds a third option, "Maybe", through the API, as the Owner. */
async function addMaybe(board: TestBoard): Promise<void> {
  await board.api("maya.chen").post("options", { id: board.ids.itemId(), name: "Maybe" });
}

/** Every request the page sends to the service from now on. */
function serviceRequests(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) sent.push(request);
  });
  return sent;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Waits until nothing on the page is animating, CSS included, as unfold-motion.spec.ts does. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Every column, strip, row and card on screen, by what it is and its ID, on the page itself (independent of scrolling). */
function places(page: Page): Promise<Record<string, Place>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>(".sm-board > .sm-column, .sm-board > .sm-col-hidden, [data-node], .sm-card[data-card]")].flatMap((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        if (!width && !height) return [];
        const key = element.dataset.node !== undefined ? `node:${element.dataset.node}` : element.dataset.card !== undefined ? `card:${element.dataset.card}` : `${element.className.split(" ")[0]}:${element.dataset.option}`;
        return [[key, { left: left + window.scrollX, top: top + window.scrollY, width, height }]];
      }),
    ),
  );
}

function near(a: Record<string, Place>, b: Record<string, Place>, within: number): string[] {
  const problems = Object.keys(a).length === Object.keys(b).length ? [] : [`${Object.keys(a).length} places, not ${Object.keys(b).length}`];
  for (const [id, place] of Object.entries(a)) {
    const other = b[id];
    if (!other) problems.push(`${id} is missing`);
    else if ((["left", "top", "width", "height"] as const).some((side) => Math.abs(place[side] - other[side]) > within)) problems.push(`${id} is at ${JSON.stringify(place)}, not ${JSON.stringify(other)}`);
  }
  return problems;
}

interface Caught {
  /** "board", "strip:<option>", or the element's class. */
  on: string;
  keyframes: Record<string, string>[];
  duration: number;
  easing: string;
  /** The board's --sm-settle, to compare the easing with. */
  settle: string;
}

/**
 * Clicks the element in the page itself and holds the Web Animations that start after it, paused, under `name`,
 * before any has run more than a few ms, as unfold-motion.spec.ts's clickAndCatch does.
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
      const board = document.querySelector(".sm-board")!;
      // The token as the browser writes an easing it was given.
      const settle = new KeyframeEffect(null, [], { easing: getComputedStyle(board).getPropertyValue("--sm-settle").trim() }).getTiming().easing as string;
      const on = (element: Element): string => {
        if (element.matches(".sm-board")) return "board";
        if (element.matches(".sm-col-hidden")) return `strip:${(element as HTMLElement).dataset.option}`;
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
          easing: String(effect.getTiming().easing),
          settle,
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

/** Counts every Web Animation the page starts from now on. */
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

/** Where each wire ends against where its row's card is drawn now, from combine-motion.spec.ts, and whether each strip has its wire. */
function wireProblems(page: Page, within: number): Promise<string[]> {
  return page.evaluate((within) => {
    const scene = document.querySelector(".sm-scene")!.getBoundingClientRect();
    const rel = (element: Element) => {
      const b = element.getBoundingClientRect();
      return { x: b.left - scene.left, y: b.top - scene.top, w: b.width, h: b.height };
    };
    const end = (d: string) => {
      let at = { x: 0, y: 0 };
      for (const [, command, args] of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
        const n = args!.trim().split(/[\s,]+/).map(Number);
        if (command === "M" || command === "L") at = { x: n[0]!, y: n[1]! };
        if (command === "H") at = { ...at, x: n[0]! };
        if (command === "V") at = { ...at, y: n[0]! };
      }
      return at;
    };
    const drawn = new Map([...document.querySelectorAll(".sm-links path")].map((path) => [path.getAttribute("data-to") ?? "", end(path.getAttribute("d") ?? "")]));
    const problems: string[] = [];
    for (const column of document.querySelectorAll<HTMLElement>(".sm-board .sm-column")) {
      if (column.offsetParent === null || !column.dataset.option) continue;
      for (const node of column.querySelectorAll<HTMLElement>("[data-node]")) {
        const card = rel(node.querySelector(".sm-card")!);
        const wrap = node.querySelector(".sm-card-wrap");
        const want = { x: wrap ? Math.max(card.x, rel(wrap).x) : card.x, y: card.y + 16 };
        const at = drawn.get(`row:${node.dataset.node}`);
        if (!at) problems.push(`no wire to row ${node.dataset.node}`);
        else if (Math.abs(at.x - want.x) > within || Math.abs(at.y - want.y) > within) problems.push(`row ${node.dataset.node}'s wire ends at ${JSON.stringify(at)}, not ${JSON.stringify(want)}`);
      }
    }
    // A strip's wire reaches the top of its head, as each column's does.
    for (const hidden of document.querySelectorAll<HTMLElement>(".sm-board .sm-col-hidden")) {
      const head = rel(hidden.querySelector(".sm-column-head")!);
      const at = drawn.get(`option:${hidden.dataset.option}`);
      if (!at) problems.push(`no wire to the strip for ${hidden.dataset.option}`);
      else if (Math.abs(at.y - head.y) > within || at.x < head.x - within || at.x > head.x + head.w + within) problems.push(`the strip's wire ends at ${JSON.stringify(at)}, not on ${JSON.stringify(head)}`);
    }
    return problems;
  }, within);
}

test("M3d-6, A-08: at 1280 px, a Viewer and a Contributor find Hide this column and Show only this column under Column view, and neither sees Options for", async ({ board }) => {
  await board.setRole("jordan_w", "viewer");
  for (const person of ["jordan_w", "tess.b"] as const) {
    const page = await board.open(person);
    // A version's own ⋯ is "Options for this version"; no option's ⋯ is drawn.
    await expect(page.getByRole("button", { name: /^Options for (Yes|No)$/ })).toHaveCount(0);
    await expect(viewButton(page, "Yes")).toHaveAttribute("aria-haspopup", "menu");
    await expect(viewButton(page, "Yes")).toHaveAttribute("data-tooltip", "Column view");
    // The button carries the option's name, which someone wrote, so PostHog's autocapture leaves it out.
    await expect(viewButton(page, "Yes")).toHaveClass(/ph-no-capture/);

    await viewButton(page, "Yes").click();
    await expect(viewButton(page, "Yes")).toHaveAttribute("aria-expanded", "true");
    expect(await viewMenu(page).getByRole("menuitem").allTextContents(), person).toEqual([`${HIDE}${HIDE_HINT}`, `${SOLO}${SOLO_HINT}`]);
    await expect(viewMenu(page).getByRole("menuitem", { name: HIDE })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(viewMenu(page).getByRole("menuitem", { name: SOLO })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewMenu(page)).toHaveCount(0);
    await expect(viewButton(page, "Yes")).toBeFocused();
  }
});

test("M3d-6, A-08: an Editor finds both items in the option's ⋯ after Rename and Delete, and the menu still opens on Rename", async ({ board }) => {
  await board.setRole("lin.zhao", "editor");
  const page = await board.open("lin.zhao");
  await expect(page.getByRole("button", { name: /^Column view for/ })).toHaveCount(0);

  await optionsButton(page, "Yes").click();
  expect(await settingsMenu(page).getByRole("menuitem").allTextContents()).toEqual(["Rename", "DeleteA question needs at least two options.", `${HIDE}${HIDE_HINT}`, `${SOLO}${SOLO_HINT}`]);
  await expect(settingsMenu(page).getByRole("menuitem", { name: "Rename" })).toBeFocused();

  await settingsMenu(page).getByRole("menuitem", { name: HIDE }).click();
  await expect(strip(page, "Yes")).toBeFocused();
  await strip(page, "Yes").click();
  // Back on the button that opened the menu.
  await expect(optionsButton(page, "Yes")).toBeFocused();
});

test("M3d-6, A-08: Hide folds the column to a strip with its name and count, says so, and puts the cursor on the strip; the strip brings it back by click and by keyboard", async ({ board }) => {
  const page = await board.open("tess.b");

  await hideByView(page, "Yes");
  await expect(column(page, "Yes")).toHaveCount(0);
  await expect(strip(page, "Yes")).toBeFocused();
  await expect(strip(page, "Yes").locator(".sm-col-hidden-name")).toHaveText("Yes");
  await expect(strip(page, "Yes").locator(".sm-col-hidden-count")).toHaveText("3 arguments");
  await expect(strip(page, "Yes")).toHaveAccessibleName("Show Yes, 3 arguments");
  await expect(strip(page, "Yes")).toHaveClass(/ph-no-capture/);
  await expect(status(page)).toHaveText("Yes is hidden. Its strip brings it back.");

  await strip(page, "Yes").click();
  await expect(column(page, "Yes")).toBeVisible();
  await expect(strip(page, "Yes")).toHaveCount(0);
  await expect(status(page)).toHaveText("Yes is showing again.");
  await expect(viewButton(page, "Yes")).toBeFocused();

  // By keyboard: the menu from Enter, Hide by Enter, and the strip by Enter.
  await page.keyboard.press("Enter");
  await expect(viewMenu(page).getByRole("menuitem", { name: HIDE })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(strip(page, "Yes")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(column(page, "Yes")).toBeVisible();
  await expect(viewButton(page, "Yes")).toBeFocused();
  await expect(status(page)).toHaveText("Yes is showing again.");
});

test("M3d-6, A-08: when only one column is showing, its Hide is disabled with its sentence and Show only this column isn't offered", async ({ board }) => {
  const page = await board.open("tess.b");
  await hideByView(page, "Yes");

  await viewButton(page, "No").click();
  expect(await viewMenu(page).getByRole("menuitem").allTextContents()).toEqual([`${HIDE}${LAST_HINT}`]);
  const hide = viewMenu(page).getByRole("menuitem", { name: HIDE });
  await expect(hide).toHaveAttribute("aria-disabled", "true");
  // A control that says why it can't be used still takes a click, which changes nothing.
  await hide.click({ force: true });
  await expect(column(page, "No")).toBeVisible();
  expect(await columnNames(page)).toEqual(["No"]);
});

test("M3d-6, A-08: Show only this column leaves one column and strips for the others, and says so", async ({ board }) => {
  await addMaybe(board);
  const page = await board.open("tess.b");
  await expect(column(page, "Maybe")).toBeVisible();

  await viewButton(page, "No").click();
  await viewMenu(page).getByRole("menuitem", { name: SOLO }).click();
  expect(await columnNames(page)).toEqual(["No"]);
  expect(await stripNames(page)).toEqual(["Yes", "Maybe"]);
  await expect(strip(page, "Maybe").locator(".sm-col-hidden-count")).toHaveText("0 arguments");
  await expect(status(page)).toHaveText("Only No is showing. The other options are strips at the side.");
  await expect(viewButton(page, "No")).toBeFocused();

  // An Editor's Show only does the same from the ⋯.
  await board.setRole("lin.zhao", "editor");
  const editor = await board.open("lin.zhao");
  await optionsButton(editor, "Maybe").click();
  await settingsMenu(editor).getByRole("menuitem", { name: SOLO }).click();
  expect(await columnNames(editor)).toEqual(["Maybe"]);
  await expect(optionsButton(editor, "Maybe")).toBeFocused();
  await expect(status(editor)).toHaveText("Only Maybe is showing. The other options are strips at the side.");
});

test("M3d-6, A-08: hiding the first option moves the importance axis and the first column's styling to the next visible column", async ({ board }) => {
  const page = await board.open("tess.b");
  await expect(column(page, "Yes")).toHaveClass(/\bsm-first\b/);
  await expect(column(page, "Yes").locator(".sm-col-vaxis")).toHaveCount(1);
  await expect(column(page, "No")).not.toHaveClass(/\bsm-first\b/);

  await hideByView(page, "Yes");
  await expect(column(page, "No")).toHaveClass(/\bsm-first\b/);
  await expect(column(page, "No").locator(".sm-col-vaxis")).toHaveCount(1);
  await expect(page.locator(".sm-col-vaxis")).toHaveCount(1);
});

test("M3d-6, A-08: a row unfolded in a column that hides folds, and its draft is kept", async ({ board }) => {
  const page = await board.open("tess.b");
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await row(page, LEAD).getByRole("button", { name: "Suggest a better version" }).click();
  await page.getByRole("textbox", { name: "Your version", exact: true }).fill("A draft I want to keep.");

  await hideByView(page, "Yes");
  await expect(page.getByRole("textbox", { name: "Your version", exact: true })).toHaveCount(0);
  await strip(page, "Yes").click();
  // The row is folded once the column is back.
  await expect(row(page, LEAD).locator(".sm-track")).toHaveCount(0);
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await row(page, LEAD).getByRole("button", { name: "Suggest a better version" }).click();
  await expect(page.getByRole("textbox", { name: "Your version", exact: true })).toHaveValue("A draft I want to keep.");
});

test("M3d-6, A-08, A-06: an edit in progress in a column that hides closes, and Edit on that wording again brings its text back", async ({ board }) => {
  const page = await board.open("maya.chen");
  const card = page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: LEAD }) });
  const editForm = page.getByRole("form", { name: "Edit your version" });
  const edit = async () => {
    await card.getByRole("button", { name: "Options for this version" }).click();
    await page.getByRole("menu", { name: "Version options" }).getByRole("menuitem", { name: "Edit wording and context" }).click();
  };
  await edit();
  await editForm.getByLabel("Your version", { exact: true }).fill(EDITED);

  await optionsButton(page, "Yes").click();
  await settingsMenu(page).getByRole("menuitem", { name: HIDE }).click();
  await expect(strip(page, "Yes")).toBeFocused();
  await expect(status(page)).toHaveText("Yes is hidden. Its strip brings it back.");
  await strip(page, "Yes").click();
  await expect(editForm).toHaveCount(0);
  await expect(status(page)).toHaveText("Yes is showing again.");

  await edit();
  await expect(editForm.getByLabel("Your version", { exact: true })).toHaveValue(EDITED);
  // Cancel discards it, so the next edit starts from the wording.
  await editForm.getByRole("button", { name: "Cancel editing" }).click();
  await expect(status(page)).toHaveText("Changes discarded.");
  await edit();
  await expect(editForm.getByLabel("Your version", { exact: true })).toHaveValue(LEAD);
});

test("M3d-6, A-08: widening the window past 640 px closes what's open in a column saved as hidden, and keeps its draft", async ({ board }) => {
  const page = await board.open("tess.b");
  await hideByView(page, "Yes");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator(".sm-col-hidden")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Yes/ })).toHaveAttribute("aria-selected", "true");
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await row(page, LEAD).getByRole("button", { name: "Suggest a better version" }).click();
  await page.getByRole("textbox", { name: "Your version", exact: true }).fill("A draft I want to keep.");

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(strip(page, "Yes")).toBeVisible();
  await strip(page, "Yes").click();
  await expect(column(page, "Yes")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your version", exact: true })).toHaveCount(0);
  await expect(row(page, LEAD).locator(".sm-track")).toHaveCount(0);
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await row(page, LEAD).getByRole("button", { name: "Suggest a better version" }).click();
  await expect(page.getByRole("textbox", { name: "Your version", exact: true })).toHaveValue("A draft I want to keep.");
});

test("M3d-6, A-08: with every option saved as hidden, every column shows, and Hide hides only the one chosen", async ({ board }) => {
  const page = await board.open("tess.b");
  await page.evaluate(({ board, ids }) => localStorage.setItem(`steelman-hidden-columns:${board}`, JSON.stringify(ids)), { board: board.demo.board, ids: [board.demo.options.yes, board.demo.options.no] });
  await page.reload();
  await expect(column(page, "Yes")).toBeVisible();
  await expect(column(page, "No")).toBeVisible();
  await expect(page.locator(".sm-col-hidden")).toHaveCount(0);

  await hideByView(page, "Yes");
  await expect(strip(page, "Yes")).toBeFocused();
  await expect(status(page)).toHaveText("Yes is hidden. Its strip brings it back.");
  expect(await columnNames(page)).toEqual(["No"]);
});

test("M3d-6, A-08: hidden columns stay hidden after a reload and in a second tab, and a new browser shows every column", async ({ board }) => {
  const page = await board.open("tess.b");
  await hideByView(page, "Yes");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await expect(strip(page, "Yes")).toBeVisible();
  await expect(column(page, "Yes")).toHaveCount(0);

  const second = await page.context().newPage();
  await second.goto(`/b/${board.demo.board}`);
  await expect(second.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await expect(strip(second, "Yes")).toBeVisible();
  await expect(column(second, "Yes")).toHaveCount(0);

  const fresh = await board.open("tess.b");
  await expect(column(fresh, "Yes")).toBeVisible();
  await expect(fresh.locator(".sm-col-hidden")).toHaveCount(0);
});

test("M3d-6, A-08: opening a version's link in a hidden column shows the column and rings the version", async ({ board }) => {
  const page = await board.open("tess.b");
  await hideByView(page, "Yes");
  await page.addInitScript(() => {
    const rung: string[] = ((window as unknown as { rung: string[] }).rung = []);
    new MutationObserver((changes) => {
      for (const change of changes) {
        const all = [change.target, ...change.addedNodes].filter((node): node is Element => node instanceof Element);
        for (const element of all) for (const ringed of [element, ...element.querySelectorAll(".sm-arrived")]) if (ringed instanceof HTMLElement && ringed.classList.contains("sm-arrived") && ringed.dataset.card) rung.push(ringed.dataset.card);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
  });
  const { version } = await find(board, SECOND);

  await page.goto(`/b/${board.demo.board}/v/${version}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await expect(column(page, "Yes")).toBeVisible();
  await expect(strip(page, "Yes")).toHaveCount(0);
  await expect(page.locator(`.sm-card[data-card="${version}"] .sm-claim-button`)).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate((id) => (window as unknown as { rung: string[] }).rung.includes(id), version)).toBe(true);

  // The column stays shown afterwards, as the prototype's prepareReveal forgets it was hidden.
  await page.goto(`/b/${board.demo.board}`);
  await expect(column(page, "Yes")).toBeVisible();
});

test("M3d-6, A-08, E-01: Strongest case shows every option while a column is hidden on the board", async ({ board }) => {
  const page = await board.open("tess.b");
  await hideByView(page, "Yes");

  await page.getByRole("button", { name: "Strongest case", exact: true }).click();
  await expect(page.locator(".sm-case-column")).toHaveCount(2);
  expect(await page.locator(".sm-case-column").evaluateAll((sections) => sections.map((section) => section.getAttribute("aria-label")))).toEqual(["The case for Yes", "The case for No"]);
  await expect(page.locator(".sm-col-hidden")).toHaveCount(0);

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(strip(page, "Yes")).toBeVisible();
});

test("M3d-6, A-08, E-01, J-03: opening a wording in a hidden column from Strongest case or from History shows the column", async ({ board }) => {
  // A moderator's hide and restore puts the wording in History.
  const { version } = await find(board, SECOND);
  await board.api("maya.chen").put(`versions/${version}/hidden`, { reason: "spam" });
  await board.api("maya.chen").delete(`versions/${version}/hidden`);
  const page = await board.open("tess.b");
  await hideByView(page, "Yes");

  await page.getByRole("button", { name: "Strongest case", exact: true }).click();
  await page.getByRole("region", { name: "The case for Yes" }).getByRole("button", { name: /^Argument 1: / }).click();
  await expect(column(page, "Yes")).toBeVisible();
  await expect(strip(page, "Yes")).toHaveCount(0);
  await expect(column(page, "Yes").locator(".sm-claim-button[aria-expanded='true']")).toBeFocused();

  await hideByView(page, "Yes");
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("dialog", { name: "History" }).getByRole("listitem").nth(0).getByRole("link", { name: `“${SECOND}”` }).click();
  await expect(column(page, "Yes")).toBeVisible();
  await expect(strip(page, "Yes")).toHaveCount(0);
  await expect(page.locator(`.sm-card[data-card="${version}"] .sm-claim-button`)).toHaveAttribute("aria-expanded", "true");
});

test("M3d-6, A-08, D-01: a link to a comment on a hidden option shows its column", async ({ board }) => {
  const id = board.ids.itemId();
  await board.api("omar_h").post("comments", { id, body: "Which survey is this from?", optionId: board.demo.options.yes });
  const page = await board.open("tess.b");
  await hideByView(page, "Yes");

  await page.goto(`/b/${board.demo.board}/c/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await expect(column(page, "Yes")).toBeVisible();
  await expect(strip(page, "Yes")).toHaveCount(0);
});

test("M3d-6, A-08: no request reaches the service when a column is hidden or shown", async ({ board }) => {
  await addMaybe(board);
  const page = await board.open("tess.b");
  await expect(column(page, "Maybe")).toBeVisible();
  // Polls wait for the page's clock, which stays still here, so every request below would be the hiding's own.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 60_000);
  const sent = serviceRequests(page);

  await hideByView(page, "Yes");
  await strip(page, "Yes").click();
  await viewButton(page, "No").click();
  await viewMenu(page).getByRole("menuitem", { name: SOLO }).click();
  await strip(page, "Maybe").click();
  await expect(column(page, "Maybe")).toBeVisible();
  expect(sent.map((request) => `${request.method()} ${request.url()}`)).toEqual([]);
  // What's kept is in this browser, for this board.
  expect(await page.evaluate((board) => localStorage.getItem(`steelman-hidden-columns:${board}`), board.demo.board)).not.toBeNull();
});

test("M3d-6, A-08, M-15: the columns play one width animation on the settle curve, the strip fades in, wires stay on their cards, and it ends at a reload's layout", async ({ board }) => {
  const page = await board.open("tess.b");
  await page.evaluate(() => document.fonts.ready);
  const before = await places(page);
  await viewButton(page, "Yes").click();

  const caught = await clickAndCatch(page, "hide", '[role="menu"] [data-action="hide-col"]');
  const columns = caught.filter((c) => c.on === "board");
  expect(columns).toHaveLength(1);
  expect(columns[0]!.keyframes[0]!.gridTemplateColumns).not.toBe(columns[0]!.keyframes.at(-1)!.gridTemplateColumns);
  expect(columns[0]!.duration).toBe(420);
  expect(columns[0]!.easing).toBe(columns[0]!.settle);
  const fades = caught.filter((c) => c.on.startsWith("strip:"));
  expect(fades).toHaveLength(1);
  expect(fades[0]!.keyframes[0]!.opacity).toBe("0");
  expect(fades[0]!.keyframes.at(-1)!.opacity).toBe("1");
  // Nothing else moves: no card crosses a column.
  expect(caught.map((c) => c.on).filter((on) => on !== "board" && !on.startsWith("strip:"))).toEqual([]);

  // Partway, the wires follow the cards and reach the strip.
  await frameAt(page, "hide", 210);
  expect(await wireProblems(page, 1)).toEqual([]);
  await finish(page, "hide");
  expect(await wireProblems(page, 1)).toEqual([]);
  const hidden = await places(page);
  expect(Object.keys(hidden)).toContain(`sm-col-hidden:${board.demo.options.yes}`);

  // A reload draws the same layout, and starts nothing.
  await page.reload();
  await expect(strip(page, "Yes")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
  expect(near(await places(page), hidden, 1)).toEqual([]);

  // The strip brings the column back with one width animation, back to the layout the board had.
  const shown = await clickAndCatch(page, "show", ".sm-col-hidden .sm-column-head");
  expect(shown.filter((c) => c.on === "board")).toHaveLength(1);
  expect(shown.filter((c) => c.on !== "board")).toEqual([]);
  await frameAt(page, "show", 210);
  expect(await wireProblems(page, 1)).toEqual([]);
  await finish(page, "show");
  expect(near(await places(page), before, 1)).toEqual([]);
});

test("M3d-6, A-08, M-15: under reduced motion, hiding, showing, and Show only start no animation", async ({ board }) => {
  await addMaybe(board);
  const page = await board.open("tess.b");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await countAnimations(page);

  await hideByView(page, "Yes");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await strip(page, "Yes").click();
  await viewButton(page, "No").click();
  await viewMenu(page).getByRole("menuitem", { name: SOLO }).click();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await strip(page, "Yes").click();
  await expect(column(page, "Yes")).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { animationsStarted: number }).animationsStarted)).toBe(0);
});

test("M3d-6, A-08, M-04: at 375 px, with a column hidden at 1280 px first, neither item is offered, a Viewer sees no Column view button, the side tabs list every option, and nothing scrolls sideways", async ({ board }) => {
  await board.setRole("jordan_w", "viewer");
  await board.setRole("lin.zhao", "editor");
  const viewer = await board.open("jordan_w");
  await hideByView(viewer, "Yes");
  const editor = await board.open("lin.zhao");
  await optionsButton(editor, "Yes").click();
  await settingsMenu(editor).getByRole("menuitem", { name: HIDE }).click();
  await expect(strip(editor, "Yes")).toBeVisible();

  for (const page of [viewer, editor]) {
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("tab")).toHaveCount(2);
    expect(await page.getByRole("tab").locator("span").allTextContents()).toEqual(["Yes", "No"]);
    await expect(page.locator(".sm-col-hidden")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Column view for/ })).toHaveCount(0);
    // Once the wires have been redrawn for the narrower window.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  await optionsButton(editor, "Yes").click();
  expect(await settingsMenu(editor).getByRole("menuitem").allTextContents()).toEqual(["Rename", "DeleteA question needs at least two options."]);
  await editor.keyboard.press("Escape");

  // Wider again, the column saved as hidden is a strip again.
  await viewer.setViewportSize({ width: 1280, height: 900 });
  await expect(strip(viewer, "Yes")).toBeVisible();
});

for (const width of [1280, 375] as const) {
  test(`M3d-6, A-08, M-04: the board passes an accessibility scan with a column hidden, at ${width} px`, async ({ board }) => {
    const page = await board.open("tess.b");
    await hideByView(page, "Yes");
    if (width < 640) await page.setViewportSize({ width, height: 812 });
    else await expect(strip(page, "Yes")).toBeVisible();
    await settled(page);
    await expectNoAxeViolations(page);
  });
}
