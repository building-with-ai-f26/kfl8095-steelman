// plans/build-plan.md, M3d-10, "A polish pass on the board" (A-01, A-02,
// M-14, M-15), at 1280 and 375 px. Four changes, each with its test here.
// While the board's first read is on its way, skeleton cards stand in the
// board's own layout with the status "The steelman is loading.", as GitHub's
// Primer and YouTube draw placeholders, and the board replaces them. A card
// lifts a pixel on hover and settles on press, by its translate and its
// shadow only, so no card's place in the layout changes. Share, Settings,
// History, the comments panel, both menus, the problem bar, and the Update
// pill arrive with one entrance and leave with one exit, on the tokens. Every
// control draws the same focus ring, except a draft card's two fields, which
// keep the prototype's grey fill for a later row. Under reduced motion nothing
// animates.
//
// The entrances and exits are CSS animations, so they're read from the
// computed style, which stays after they end, and an exit is caught by a
// MutationObserver the moment its copy (or the bar itself) is marked to leave.
// Helpers are copied from zoom-motion.spec.ts, not imported, so that file
// stays as it is.

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import { TEST_POSTHOG, TICK_MS, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, pill, poll, row } from "./support/screen.ts";

const WIDTHS = [1280, 375] as const;
const QUESTION = "Should our library open on Sundays?";
const LEAD = "Sunday is the only free day for many people who work weekdays.";
const STUDY = "Students need a quiet place to study before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
const LOADING = "The steelman is loading.";
const REFUSED = "maya.chen: Failed to load resource: the server responded with a status of 409 (Conflict)";

const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const skeleton = (page: Page): Locator => page.locator(".sm-skeleton");

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Waits until nothing on the page is animating, CSS included, as hide-columns.spec.ts does. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/** Holds the board's first read (GET /api/boards/:id, not its changes) until the test lets it go. */
function holdFirstRead(): { prepare(context: BrowserContext): Promise<unknown>; release(): Promise<void>; held: Promise<void> } {
  let route: Route | null = null;
  let arrived: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (arrived = resolve));
  return {
    prepare: (context) =>
      context.route(/\/api\/boards\/[^/?]+$/, async (request) => {
        if (request.request().method() !== "GET" || route) return request.fallback();
        route = request;
        arrived();
      }),
    held,
    async release() {
      await held;
      await route!.fallback();
    },
  };
}

/** Notes what the skeleton's status region says at the moment it is put on the page, as an init script. */
function watchStatus(): void {
  new MutationObserver((changes, observer) => {
    for (const change of changes)
      for (const node of change.addedNodes) {
        const status = node instanceof HTMLElement ? (node.matches(".sm-skeleton") ? node : node.querySelector(".sm-skeleton"))?.querySelector("[role=status]") : null;
        if (!status) continue;
        (window as unknown as { firstStatus?: string }).firstStatus = status.textContent ?? "";
        observer.disconnect();
        return;
      }
  }).observe(document, { childList: true, subtree: true });
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where an element is drawn, in page pixels, or on screen for one fixed to the window. */
function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    // A bar fixed to the window stays where it is on screen as the page scrolls, so it's measured on screen.
    const fixed = getComputedStyle(element).position === "fixed";
    return { left: left + (fixed ? 0 : window.scrollX), top: top + (fixed ? 0 : window.scrollY), width, height };
  });
}

function near(actual: Box, expected: Box, px: number, what: string): void {
  for (const side of ["left", "width"] as const) expect(Math.abs(actual[side] - expected[side]), `${what} ${side}: ${actual[side]} vs ${expected[side]}`).toBeLessThanOrEqual(px);
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Skeleton cards while the board loads (A-01).

for (const width of WIDTHS) {
  test(`A-01, M-15: at ${width} px, while the board loads, skeleton cards stand in the board's own layout with the status sentence, and the board replaces them`, async ({ board }) => {
    const hold = holdFirstRead();
    // A Contributor, as most readers are: an Owner's board also has the column to add an option, which the skeleton,
    // drawn before anyone's role is known, leaves out.
    const page = await board.open("jordan_w", { width, prepare: (context) => Promise.all([hold.prepare(context), context.addInitScript(watchStatus)]), at: `/b/${board.demo.board}` });
    await hold.held;

    await expect(skeleton(page)).toBeVisible();
    // It waits twice --sm-slow before it fades in on --sm-medium, so a quick read shows nothing at all. This is read
    // from the animation itself, since a sample of its opacity would depend on how fast the machine is.
    const timing = await page.locator(".sm-skeleton-scene").evaluate((element) => {
      const animation = element.getAnimations().find((each) => (each as CSSAnimation).animationName === "sm-skeleton-in");
      const { delay, duration } = animation?.effect?.getTiming() ?? {};
      return { delay, duration };
    });
    expect(timing).toEqual({ delay: 840, duration: 200 });
    // One sentence for the whole placeholder, said once, as Primer's loading pattern asks; the blocks themselves are
    // hidden from screen readers, and nothing in them is a heading, a card, or a row the board's code looks for.
    await expect(page.getByRole("status").filter({ hasText: LOADING })).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: LOADING })).toHaveText(LOADING);
    // The status region is on the page empty, and its sentence arrives after, as Primer asks, so a screen reader
    // hears a change to a region it already knows. Only the hidden blocks are busy, so nothing holds the sentence back.
    expect(await page.evaluate(() => (window as unknown as { firstStatus?: string }).firstStatus)).toBe("");
    await expect(skeleton(page).locator(".sm-skeleton-scene")).toHaveAttribute("aria-busy", "true");
    expect(await page.locator("[aria-busy]").count()).toBe(1);
    await expect(page.getByRole("heading")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    expect(await page.locator("[data-card], [data-node], .sm-card, .sm-column, .sm-scene, .sm-board, #sm-status").count()).toBe(0);
    const shown = width === 1280 ? 2 : 1;
    const columns = skeleton(page).locator(".sm-skeleton-column");
    await expect(columns.filter({ visible: true })).toHaveCount(shown);
    for (let at = 0; at < shown; at++) expect(await columns.nth(at).locator(".sm-skeleton-card").count()).toBeGreaterThanOrEqual(2);
    // Once its fade-in ends, it is fully drawn.
    await page.waitForFunction(() => document.querySelector(".sm-skeleton-scene")?.getAnimations().every((animation) => animation.playState !== "running" || (animation as CSSAnimation).animationName !== "sm-skeleton-in"));
    await expect.poll(() => skeleton(page).locator(".sm-skeleton-scene").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const head = await boxOf(page.locator(".sm-skeleton-head"));
    const first = await boxOf(columns.nth(0));
    const second = shown === 2 ? await boxOf(columns.nth(1)) : null;

    await hold.release();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await expect(skeleton(page)).toHaveCount(0);
    await expect(page.getByText(LOADING)).toHaveCount(0);
    // The placeholders stood where the question and the columns now are.
    near(head, await boxOf(page.locator(".sm-head")), 2, "question");
    const real = page.locator(".sm-board > .sm-column").filter({ visible: true });
    near(first, await boxOf(real.nth(0)), 2, "first column");
    if (second) near(second, await boxOf(real.nth(1)), 2, "second column");
  });
}

test("A-01, M-15, M-04: under reduced motion the skeleton is drawn at once and nothing animates, and the skeleton and the board pass an accessibility scan", async ({ board }) => {
  const hold = holdFirstRead();
  const page = await board.open("maya.chen", { prepare: hold.prepare, at: `/b/${board.demo.board}` });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await hold.held;
  await expect(skeleton(page)).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await page.locator(".sm-skeleton-scene").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await expectNoAxeViolations(page);

  await hold.release();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expectNoAxeViolations(page);
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Cards lift on hover and press (A-02).

/** Every card's place in the layout (offsets, which no translate moves), and where each is drawn. */
function cardPlaces(page: Page): Promise<{ layout: Box; drawn: Box }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".sm-card[data-card]")].map((element) => {
      let left = 0;
      let top = 0;
      for (let at: HTMLElement | null = element; at; at = at.offsetParent as HTMLElement | null) {
        left += at.offsetLeft;
        top += at.offsetTop;
      }
      const drawn = element.getBoundingClientRect();
      return { layout: { left, top, width: element.offsetWidth, height: element.offsetHeight }, drawn: { left: drawn.left, top: drawn.top, width: drawn.width, height: drawn.height } };
    }),
  );
}

/** Every computed property of the element, to see which ones hover or press changed. */
function styleOf(locator: Locator): Promise<Record<string, string>> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return Object.fromEntries([...style].map((name) => [name, style.getPropertyValue(name)]));
  });
}

function changed(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(after).filter((name) => before[name] !== after[name]);
}

/** The prototype's hover already tints a card's border (it moves nothing); the lift adds the translate and the shadow. */
const LIFT_ONLY = /^(translate|transform|box-shadow|border-(top|right|bottom|left|block-start|block-end|inline-start|inline-end)-color)$/;

for (const width of WIDTHS) {
  test(`A-02, M-15: at ${width} px, a card lifts on hover and settles on press by its translate and shadow only, and no card's place changes`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    await settled(page);
    const study = card(page, STUDY);
    await study.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    await settled(page);
    const rest = await styleOf(study);
    const before = await cardPlaces(page);
    const index = await study.evaluate((element) => [...document.querySelectorAll(".sm-card[data-card]")].indexOf(element));
    // The card's transition carries the lift on the --sm-fast ease, with the prototype's shadow and border.
    expect(rest["transition-property"]).toContain("translate");
    expect(rest["transition-property"]).toContain("box-shadow");

    // Hover: over the card's author line, away from its buttons.
    const author = await study.locator(".sm-card-meta, .sm-author, .sm-by").first().boundingBox();
    const over = author ?? (await study.boundingBox())!;
    await page.mouse.move(over.x + 4, over.y + over.height / 2);
    await settled(page);
    const hovered = await styleOf(study);
    expect(hovered.translate).toBe("0px -1px");
    expect(hovered["box-shadow"]).not.toBe(rest["box-shadow"]);
    expect(changed(rest, hovered).filter((name) => !LIFT_ONLY.test(name))).toEqual([]);
    const lifted = await cardPlaces(page);
    expect(lifted.map((place) => place.layout)).toEqual(before.map((place) => place.layout));
    lifted.forEach((place, at) => {
      const was = before[at]!.drawn;
      expect(place.drawn.left).toBeCloseTo(was.left, 1);
      expect(place.drawn.top).toBeCloseTo(at === index ? was.top - 1 : was.top, 1);
    });

    // Press: on the wording, the card's own action, the card settles back down to its resting shadow.
    const claim = (await study.locator(".sm-claim-button").boundingBox())!;
    await page.mouse.move(claim.x + 8, claim.y + claim.height / 2);
    await page.mouse.down();
    await settled(page);
    const pressed = await styleOf(study);
    expect(pressed.translate).toMatch(/^(none|0px)$/);
    expect(pressed["box-shadow"]).toBe(rest["box-shadow"]);
    expect(changed(rest, pressed).filter((name) => !LIFT_ONLY.test(name))).toEqual([]);
    expect((await cardPlaces(page)).map((place) => place.layout)).toEqual(before.map((place) => place.layout));
    await page.mouse.up();

    // The card the press opened doesn't lift under the pointer, so its details and its form hold still to be read.
    await expect(study).toHaveClass(/sm-expanded/);
    await settled(page);
    expect((await styleOf(study)).translate).toMatch(/^(none|0px)$/);
  });
}

test("A-02, M-15: under reduced motion a card's lift and press show at once, and nothing animates", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const study = card(page, STUDY);
  const box = (await study.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height - 10);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect((await styleOf(study)).translate).toBe("0px -1px");

  // Pressed on its wording, it is down at once, with nothing animating.
  const claim = (await study.locator(".sm-claim-button").boundingBox())!;
  await page.mouse.move(claim.x + 8, claim.y + claim.height / 2);
  await page.mouse.down();
  expect((await styleOf(study)).translate).toMatch(/^(none|0px)$/);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.mouse.up();
});

test("A-02, M-15: on a touch screen a card doesn't lift, so a tap doesn't leave it raised", async ({ board }) => {
  const page = await board.open("maya.chen", { width: 375, touch: true });
  await settled(page);
  expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(false);
  const study = card(page, STUDY);
  await study.scrollIntoViewIfNeeded();
  const box = (await study.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height - 10);
  await settled(page);
  expect((await styleOf(study)).translate).toMatch(/^(none|0px)$/);
});

test("A-02, M-15: a card whose comments are open keeps its ink ring while it's pressed", async ({ board }) => {
  const page = await board.open("maya.chen");
  const study = card(page, STUDY);
  await study.getByRole("button", { name: /^(Comment|\d+ comments?) on this version$/ }).click();
  await expect(page.getByRole("dialog", { name: "Comments" })).toBeVisible();
  await expect(study).toHaveClass(/sm-commenting/);
  await page.mouse.move(2, 2);
  await settled(page);
  const ring = (await styleOf(study))["box-shadow"];
  expect(ring).toContain("rgb(36, 36, 36) 0px 0px 0px 1px");
  const claim = (await study.locator(".sm-claim-button").boundingBox())!;
  await page.mouse.move(claim.x + 8, claim.y + claim.height / 2);
  await page.mouse.down();
  await settled(page);
  const pressed = await styleOf(study);
  expect(pressed["box-shadow"]).toBe(ring);
  expect(pressed.translate).toMatch(/^(none|0px)$/);
  await page.mouse.up();
});

// ---------------------------------------------------------------------------------------------------------------
// 3. One entrance and one exit for every panel, menu, and bar (M-15, M-14).

interface Motion {
  name: string;
  duration: number;
  easing: string;
}

interface Exit extends Motion {
  hidden: string | null;
  inert: boolean;
  role: string | null;
  names: number;
  looks: string[];
  box: Box;
}

/** The two tokens every entrance and exit runs on, as the browser computes them. */
function tokens(page: Page): Promise<{ medium: number; leave: number; ease: string }> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    document.getElementById("steelman-study")!.append(probe);
    const read = (time: string) => {
      probe.style.transition = `opacity var(${time}) var(--sm-ease)`;
      const style = getComputedStyle(probe);
      return { ms: parseFloat(style.transitionDuration) * (style.transitionDuration.endsWith("ms") ? 1 : 1000), ease: style.transitionTimingFunction };
    };
    const medium = read("--sm-medium");
    const leave = read("--sm-leave");
    probe.remove();
    return { medium: Math.round(medium.ms), leave: Math.round(leave.ms), ease: medium.ease };
  });
}

/** The CSS animation an element runs, as its computed style says (it stays after the animation ends). */
function motionOf(locator: Locator): Promise<Motion> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const seconds = style.animationDuration;
    return { name: style.animationName, duration: Math.round(parseFloat(seconds) * (seconds.endsWith("ms") ? 1 : 1000)), easing: style.animationTimingFunction };
  });
}

/** Records every exit as it starts: a copy marked to leave, or a bar that is itself marked to leave. */
async function watchExits(page: Page): Promise<{ taken(): Promise<Exit[]>; clear(): Promise<void>; left(): Promise<number> }> {
  await page.evaluate(() => {
    const seen: unknown[] = [];
    // How each element in a panel is laid out and coloured where the panel's rules can tell a copy from the panel
    // (a menu's red Delete, Share's narrow general-access row), so a copy can be checked to look like what it replaces.
    const looks = (root: Element) =>
      [root, ...root.querySelectorAll("*")].map((element) => {
        const style = getComputedStyle(element);
        const tinted = element.matches("[data-action] svg, [data-action] svg *");
        return `${element.tagName} ${style.display} ${style.marginLeft} ${style.flexGrow}${tinted ? ` ${style.color}` : ""}`;
      });
    (window as unknown as { looks: typeof looks }).looks = looks;
    const record = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      const seconds = style.animationDuration;
      const { left, top, width, height } = node.getBoundingClientRect();
      seen.push({
        name: style.animationName,
        duration: Math.round(parseFloat(seconds) * (seconds.endsWith("ms") ? 1 : 1000)),
        easing: style.animationTimingFunction,
        hidden: node.getAttribute("aria-hidden"),
        inert: node.inert,
        role: node.getAttribute("role"),
        names: node.querySelectorAll("[id], [for], [name], [data-key]").length + (node.matches("[id], [for], [name], [data-key]") ? 1 : 0),
        looks: looks(node),
        box: style.position === "fixed" ? { left, top, width, height } : { left: left + window.scrollX, top: top + window.scrollY, width, height },
      });
    };
    const leaving = (node: Node): node is HTMLElement => node instanceof HTMLElement && (node.classList.contains("sm-exit") || node.classList.contains("sm-leaving"));
    new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === "childList") for (const node of change.addedNodes) if (leaving(node)) record(node);
        if (change.type === "attributes" && leaving(change.target) && !/\bsm-exit\b/.test(change.oldValue ?? "")) record(change.target);
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    (window as unknown as { exits: unknown[] }).exits = seen;
  });
  return {
    taken: () => page.evaluate(() => [...(window as unknown as { exits: Exit[] }).exits]),
    clear: () => page.evaluate(() => void (window as unknown as { exits: Exit[] }).exits.splice(0)),
    left: () => page.evaluate(() => document.querySelectorAll(".sm-exit, .sm-leaving").length),
  };
}

interface Panel {
  name: string;
  open(page: Page): Promise<void>;
  shown(page: Page): Locator;
  close(page: Page): Promise<void>;
  /** A bar leaves as itself, marked, rather than through a copy; it's then gone or hidden. */
  bar?: true;
}

const sharePill = (page: Page) => page.getByRole("button", { name: /^(Anyone with the link|Invited only)$/ });

async function renameYes(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Options for Yes", exact: true }).click();
  await page.getByRole("menu", { name: "Option settings" }).getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Option name" }).fill(name);
  await page.getByRole("textbox", { name: "Option name" }).press("Enter");
}

/** Three more people put "Families…" first, so the next poll after the next shared order offers Update. */
async function offerUpdate(board: TestBoard, page: Page): Promise<void> {
  const family = await find(board, FAMILY);
  for (const person of ["tess.b", "lin.zhao", "omar_h"] as const) await board.api(person).put(`arguments/${family.argument}/importance`, { value: 1 });
  board.clock.advance(TICK_MS);
  await poll(page);
}

function panels(board: TestBoard): Panel[] {
  return [
    { name: "Share", open: (page) => sharePill(page).click(), shown: (page) => page.getByRole("dialog", { name: "Share" }), close: (page) => page.getByRole("button", { name: "Close sharing" }).click() },
    { name: "Settings", open: (page) => page.locator(".sm-head").getByRole("button", { name: "Settings" }).click(), shown: (page) => page.getByRole("dialog", { name: "Settings" }), close: (page) => page.getByRole("button", { name: "Close settings" }).click() },
    { name: "History", open: (page) => page.getByRole("button", { name: "History", exact: true }).click(), shown: (page) => page.getByRole("dialog", { name: "History" }), close: (page) => page.getByRole("button", { name: "Close history" }).click() },
    { name: "Comments", open: (page) => page.getByRole("button", { name: "Comment on this question" }).click(), shown: (page) => page.getByRole("dialog", { name: "Comments" }), close: (page) => page.getByRole("button", { name: "Close comments" }).click() },
    { name: "the version menu", open: (page) => card(page, LEAD).getByRole("button", { name: "Options for this version" }).click(), shown: (page) => page.getByRole("menu", { name: "Version options" }), close: (page) => page.keyboard.press("Escape") },
    { name: "the option menu", open: (page) => page.getByRole("button", { name: "Options for Yes", exact: true }).click(), shown: (page) => page.getByRole("menu", { name: "Option settings" }), close: (page) => page.keyboard.press("Escape") },
    {
      name: "the problem bar",
      bar: true,
      open: async (page) => {
        await renameYes(page, "no");
        await expect(page.locator(".sm-problem")).toContainText("Another option already has that name.");
        expect(board.errors.splice(0)).toEqual([REFUSED]);
      },
      shown: (page) => page.locator(".sm-problem"),
      close: (page) => page.locator(".sm-problem").getByRole("button", { name: "Dismiss" }).click(),
    },
    {
      name: "the Update pill",
      bar: true,
      open: async (page) => {
        await offerUpdate(board, page);
        await expect(pill(page)).toHaveText(/1 change\s*Update/);
      },
      shown: (page) => pill(page),
      close: (page) => pill(page).getByRole("button", { name: "Update" }).click(),
    },
  ];
}

for (const width of WIDTHS) {
  test(`M-15, M-14: at ${width} px, Share, Settings, History, Comments, both menus, the problem bar, and the Update pill arrive with one entrance and leave with one exit on the tokens`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    await settled(page);
    const { medium, leave, ease } = await tokens(page);
    expect([medium, leave]).toEqual([200, 160]);
    const exits = await watchExits(page);

    for (const panel of panels(board)) {
      await test.step(panel.name, async () => {
        await panel.open(page);
        await expect(panel.shown(page)).toBeVisible();
        // The entrance: a fade and a 4 px rise on --sm-medium and the ease (the bars keep their centring as they rise).
        const entrance = await motionOf(panel.shown(page));
        expect(["sm-enter", "sm-fresh-enter"], `${panel.name} entrance`).toContain(entrance.name);
        expect(entrance, panel.name).toMatchObject({ duration: medium, easing: ease });
        await settled(page);
        const box = await boxOf(panel.shown(page));
        const looks = await panel.shown(page).evaluate((element) => (window as unknown as { looks(root: Element): string[] }).looks(element));
        await exits.clear();

        await panel.close(page);
        // The exit: one fade and a 4 px fall on --sm-leave and the ease, on a copy (or the bar itself) that screen
        // readers and the cursor skip, with nothing a test or a script could find twice, from where the panel was, and
        // laid out and coloured as the panel was.
        await expect.poll(async () => (await exits.taken()).length, `${panel.name} exit`).toBeGreaterThan(0);
        const [exit, ...more] = await exits.taken();
        expect(more, `${panel.name}: one exit`).toEqual([]);
        expect(exit, panel.name).toMatchObject({ name: panel.bar ? "sm-fresh-leave" : "sm-leave", duration: leave, easing: ease, hidden: "true", inert: true, names: 0 });
        if (!panel.bar) expect(exit, panel.name).toMatchObject({ role: null });
        expect(exit!.looks, `${panel.name}: the copy looks like the panel`).toEqual(looks);
        for (const side of ["left", "top", "width", "height"] as const) expect(Math.abs(exit!.box[side] - box[side]), `${panel.name} ${side}`).toBeLessThanOrEqual(1);
        if (panel.bar) await expect(panel.shown(page)).toBeHidden();
        else await expect(panel.shown(page)).toHaveCount(0);
        await expect.poll(exits.left, `${panel.name}: the copy goes`).toBe(0);
      });
    }
    await settled(page);
    await expectNoAxeViolations(page);
  });
}

test("M-15, M-14: under reduced motion no panel, menu, or bar animates as it opens or closes, and none leaves a copy", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const exits = await watchExits(page);
  for (const panel of panels(board)) {
    await test.step(panel.name, async () => {
      await panel.open(page);
      await expect(panel.shown(page)).toBeVisible();
      expect((await motionOf(panel.shown(page))).name).toBe("none");
      expect(await page.evaluate(() => document.getAnimations().length), panel.name).toBe(0);
      await panel.close(page);
      if (panel.bar) await expect(panel.shown(page)).toBeHidden();
      else await expect(panel.shown(page)).toHaveCount(0);
      expect(await page.evaluate(() => document.getAnimations().length), panel.name).toBe(0);
      expect(await exits.taken(), panel.name).toEqual([]);
      expect(await exits.left()).toBe(0);
    });
  }
});

test("M-15, M-04: the board passes an accessibility scan with Share open, and with the problem bar and the Update pill showing", async ({ board }) => {
  const page = await board.open("maya.chen");
  await sharePill(page).click();
  await expect(page.getByRole("dialog", { name: "Share" })).toBeVisible();
  await settled(page);
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Close sharing" }).click();
  await settled(page);

  await renameYes(page, "no");
  await expect(page.locator(".sm-problem")).toBeVisible();
  expect(board.errors.splice(0)).toEqual([REFUSED]);
  await offerUpdate(board, page);
  await expect(pill(page)).toHaveText(/1 change\s*Update/);
  await settled(page);
  await expectNoAxeViolations(page);
});

// ---------------------------------------------------------------------------------------------------------------
// 4. The same focus ring on every control (M-15).

interface Ring {
  what: string;
  style: string;
  width: string;
  offset: string;
  color: string;
  contrast: number;
  field: boolean;
}

/** The ring around whatever has the keyboard's focus: on the control, or on the field box that holds it. */
function ringHere(page: Page): Promise<Ring | null> {
  return page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || focused === document.body || !focused.matches(":focus-visible")) return null;
    const control = focused.matches("button, a[href], input, select, textarea, summary, [role=tab], [role=menuitem], [role=menuitemradio], [tabindex]:not([tabindex='-1'])");
    if (!control) return null;
    // A draft card's two fields keep the prototype's grey fill for focus, with no ring: the board's one exception,
    // written down for a later row in the test log.
    if (focused.matches(".sm-compose-card textarea")) return null;
    // A choice's radio is ringed on its choice, as the prototype draws it, and Share's invite field around its input.
    const ringed = (focused.matches(".sm-choice input, .sm-share-field input") ? focused.closest(".sm-choice, .sm-share-field") : focused) as HTMLElement;
    const field = focused.matches("input:not([type=checkbox], [type=radio]), select, textarea");
    const style = getComputedStyle(ringed);
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = ([r, g, b]: number[]) => {
      const channel = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
    };
    // The ground the ring is drawn on: the first solid background around the control.
    let ground = [255, 255, 255];
    for (let at = ringed.parentElement; at; at = at.parentElement) {
      const background = rgb(getComputedStyle(at).backgroundColor);
      if (background.length >= 3 && (background[3] ?? 1) >= 0.5) {
        ground = background;
        break;
      }
    }
    const [lighter, darker] = [luminance(rgb(style.outlineColor)), luminance(ground)].sort((a, b) => b - a);
    const name = focused.getAttribute("aria-label") ?? focused.textContent?.trim().slice(0, 30) ?? "";
    return { what: `${focused.tagName.toLowerCase()}.${focused.className.split(" ")[0]} "${name}"`, style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor, contrast: (lighter! + 0.05) / (darker! + 0.05), field };
  });
}

function expectSameRing(ring: Ring): void {
  expect(ring, ring.what).toMatchObject({ style: "solid", width: "2px", offset: ring.field ? "1px" : "3px" });
  expect(["rgb(36, 36, 36)", "rgb(255, 255, 255)"], `${ring.what} colour`).toContain(ring.color);
  expect(ring.contrast, `${ring.what} contrast with its ground`).toBeGreaterThanOrEqual(3);
}

for (const width of WIDTHS) {
  test(`M-15, M-04: at ${width} px, every control the keyboard reaches draws the same ring, 2 px solid in ink or white for its ground, 3 px out from a button or link and 1 px out from a field`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    await settled(page);
    const seen = new Set<string>();
    const check = async () => {
      const ring = await ringHere(page);
      if (!ring) return;
      seen.add(ring.what);
      expectSameRing(ring);
    };

    // The page from its top: the header, the question, its tools, and the first column's controls.
    await page.locator("body").focus();
    for (let at = 0; at < 45; at++) {
      await page.keyboard.press("Tab");
      await check();
    }
    expect(seen.size).toBeGreaterThan(15);

    // Share's controls, on its white panel under the dark question.
    await sharePill(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Share" })).toBeVisible();
    for (let at = 0; at < 8; at++) {
      await page.keyboard.press("Tab");
      if (!(await page.getByRole("dialog", { name: "Share" }).evaluate((panel) => panel.contains(document.activeElement)))) break;
      await check();
    }
    await page.keyboard.press("Escape");

    // The problem bar's Dismiss and the pill's Update, on their ink.
    await renameYes(page, "no");
    await expect(page.locator(".sm-problem")).toBeVisible();
    expect(board.errors.splice(0)).toEqual([REFUSED]);
    await offerUpdate(board, page);
    await expect(pill(page)).toHaveText(/1 change\s*Update/);
    for (const button of [page.locator(".sm-problem").getByRole("button", { name: "Dismiss" }), pill(page).getByRole("button", { name: "Update" })]) {
      await page.keyboard.press("Shift+Tab");
      await button.focus();
      const ring = await ringHere(page);
      expect(ring).not.toBeNull();
      expectSameRing(ring!);
    }
  });
}

/** Presses Tab up to `stops` times while the keyboard stays inside `scope`, checking the ring at each stop. */
async function tabWithin(page: Page, scope: Locator, stops: number, check: () => Promise<void>): Promise<void> {
  for (let at = 0; at < stops; at++) {
    await page.keyboard.press("Tab");
    if (!(await scope.evaluate((element) => element.contains(document.activeElement)).catch(() => false))) break;
    await check();
  }
}

/** Moves down a menu with the arrow keys, as its keyboard pattern has it, checking the ring on each item. */
async function arrowThrough(page: Page, menu: Locator, check: () => Promise<void>): Promise<number> {
  const items = await menu.getByRole("menuitem").count();
  for (let at = 0; at < items; at++) {
    await check();
    await page.keyboard.press("ArrowDown");
  }
  return items;
}

/** A ring checker that also remembers what it saw, by control. */
function ringChecker(page: Page): { check(): Promise<void>; seen: Set<string> } {
  const seen = new Set<string>();
  return {
    seen,
    async check() {
      const ring = await ringHere(page);
      if (!ring) return;
      seen.add(ring.what);
      expectSameRing(ring);
    },
  };
}

const seenAny = (seen: Set<string>, pattern: RegExp): boolean => [...seen].some((what) => pattern.test(what));

test("M-15, M-04: inside Settings, History, Comments, both menus, a card's details and its source form, the Report note, an option's name field, and the drafts, every control the keyboard reaches draws the same ring", async ({ board }) => {
  const page = await board.open("maya.chen");
  await settled(page);
  const { check, seen } = ringChecker(page);
  const open = async (button: Locator) => {
    await button.focus();
    await page.keyboard.press("Enter");
  };

  await test.step("Settings, with its closing date and time", async () => {
    await open(page.locator(".sm-head").getByRole("button", { name: "Settings" }));
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await tabWithin(page, settings, 40, check);
    await open(settings.getByRole("button", { name: "Add a date" }));
    await settings.getByLabel("Closing date", { exact: true }).focus();
    await check();
    await page.keyboard.press("Tab");
    await check();
    expect(seenAny(seen, /^input\.sm-rdate/)).toBe(true);
    await open(page.getByRole("button", { name: "Close settings" }));
    await expect(settings).toHaveCount(0);
  });

  await test.step("History", async () => {
    await open(page.getByRole("button", { name: "History", exact: true }));
    const history = page.getByRole("dialog", { name: "History" });
    await expect(history).toBeVisible();
    await tabWithin(page, history, 20, check);
    await open(page.getByRole("button", { name: "Close history" }));
    await expect(history).toHaveCount(0);
  });

  await test.step("Comments, with its comment box", async () => {
    await open(page.getByRole("button", { name: "Comment on this question" }));
    const comments = page.getByRole("dialog", { name: "Comments" });
    await expect(comments).toBeVisible();
    // The comment box has the keyboard as the panel opens.
    await expect(comments.getByRole("textbox").first()).toBeFocused();
    await check();
    await tabWithin(page, comments, 20, check);
    expect(seenAny(seen, /^textarea/)).toBe(true);
    await open(page.getByRole("button", { name: "Close comments" }));
    await expect(comments).toHaveCount(0);
  });

  await test.step("the version menu", async () => {
    await open(card(page, LEAD).getByRole("button", { name: "Options for this version" }));
    const menu = page.getByRole("menu", { name: "Version options" });
    await expect(menu).toBeVisible();
    expect(await arrowThrough(page, menu, check)).toBeGreaterThan(2);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  await test.step("the option menu, and an option's name field", async () => {
    await open(page.getByRole("button", { name: "Options for Yes", exact: true }));
    const menu = page.getByRole("menu", { name: "Option settings" });
    await expect(menu).toBeVisible();
    expect(await arrowThrough(page, menu, check)).toBeGreaterThan(2);
    await menu.getByRole("menuitem", { name: "Rename" }).focus();
    await page.keyboard.press("Enter");
    const name = page.getByRole("textbox", { name: "Option name" });
    await expect(name).toBeFocused();
    const ring = await ringHere(page);
    expect(ring).not.toBeNull();
    expectSameRing(ring!);
    expect(ring!.offset).toBe("1px");
    await page.keyboard.press("Escape");
    await expect(name).toHaveCount(0);
  });

  await test.step("a card's details and its source form", async () => {
    await open(card(page, LEAD).locator(".sm-claim-button"));
    const details = card(page, LEAD).getByRole("region", { name: "Evidence and its assessment" });
    await expect(details).toBeVisible();
    await tabWithin(page, card(page, LEAD), 30, check);
    await open(details.getByRole("button", { name: "Add a source" }));
    const form = page.getByRole("form", { name: /source$/ });
    await expect(form).toBeVisible();
    await form.locator("input, textarea").first().focus();
    await check();
    await tabWithin(page, form, 10, check);
    await open(form.getByRole("button", { name: "Cancel" }));
    await expect(form).toHaveCount(0);
  });

  await test.step("a new argument's draft and a suggested version's draft", async () => {
    await open(page.getByRole("button", { name: "Add an argument for Yes" }));
    const idea = page.getByRole("form", { name: "New argument for Yes" });
    await expect(idea).toBeVisible();
    // With words in it, so Add can be pressed and the keyboard reaches it.
    await idea.getByRole("textbox").first().fill("Libraries are where many people read the news.");
    await idea.getByRole("textbox").first().focus();
    await tabWithin(page, idea, 6, check);
    expect(seenAny(seen, /"Add your argument"/)).toBe(true);
    await open(idea.getByRole("button", { name: "Close draft" }));

    await open(row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }));
    await open(row(page, LEAD).getByRole("button", { name: "Suggest a better version" }));
    const draft = row(page, LEAD).getByRole("form", { name: "Suggest a version" });
    await expect(draft).toBeVisible();
    await draft.getByRole("textbox").first().fill("Sunday is the one free day for many people who work in the week.");
    await draft.getByRole("textbox").first().focus();
    await tabWithin(page, draft, 6, check);
    expect(seenAny(seen, /"Add your version"/)).toBe(true);
  });
});

test("M-15, M-04: the Report note's field draws the same ring, 1 px out", async ({ board }) => {
  const page = await board.open("tess.b");
  await settled(page);
  await card(page, LEAD).getByRole("button", { name: "Options for this version" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Report", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu", { name: "Report it as" }).getByRole("menuitem", { name: "Something else" }).focus();
  await page.keyboard.press("Enter");
  const note = page.getByRole("dialog", { name: "Report it as something else" }).getByRole("textbox");
  await note.focus();
  const ring = await ringHere(page);
  expect(ring).not.toBeNull();
  expectSameRing(ring!);
  expect(ring!).toMatchObject({ field: true, offset: "1px" });
});

test("M-15, M-04: a list post draws the ring 3 px out around the whole post, and the privacy page's back button draws it 3 px out", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Your steelmen" })).toBeVisible();
  const post = async () =>
    page.evaluate(() => {
      const link = document.activeElement;
      const ringed = link?.matches(".sm-post h2 a") ? link.closest(".sm-post") : null;
      if (!ringed) return null;
      const style = getComputedStyle(ringed);
      return { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor };
    });
  let ring = null;
  for (let at = 0; at < 30 && !ring; at++) {
    await page.keyboard.press("Tab");
    ring = await post();
  }
  expect(ring).toEqual({ style: "solid", width: "2px", offset: "3px", color: "rgb(36, 36, 36)" });

  await page.goto("/privacy");
  const back = page.locator(".sm-back-button");
  await expect(back).toBeVisible();
  for (let at = 0; at < 10 && !(await back.evaluate((element) => element === document.activeElement)); at++) await page.keyboard.press("Tab");
  await expect(back).toBeFocused();
  const backRing = await ringHere(page);
  expect(backRing).not.toBeNull();
  expectSameRing(backRing!);
});

/** Stands in for PostHog's script, as analytics.spec.ts's recorder does (copied, so that file stays as it is). */
const RECORDER = `(() => {
  const queued = window.posthog;
  window.posthog = new Proxy({ __loaded: true }, { get: (target, name) => (name in target ? target[name] : () => undefined) });
  void queued;
})();`;

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });

  test("M-15, M-04: the analytics notice's link and buttons draw the ring in white on its ink, 3 px out", async ({ board }) => {
    const page = await board.open("maya.chen", { prepare: (context) => context.route(`${TEST_POSTHOG.host}/**`, (route) => route.fulfill({ contentType: "text/javascript", body: RECORDER })) });
    const notice = page.getByRole("region", { name: "Analytics" });
    await expect(notice).toBeVisible();
    await page.keyboard.press("Tab");
    for (const control of [notice.getByRole("link", { name: "Privacy" }), notice.getByRole("button", { name: "Turn off" }), notice.getByRole("button", { name: "OK" })]) {
      await control.focus();
      const ring = await ringHere(page);
      expect(ring).not.toBeNull();
      expectSameRing(ring!);
      expect(ring!).toMatchObject({ color: "rgb(255, 255, 255)", offset: "3px" });
    }
  });
});
