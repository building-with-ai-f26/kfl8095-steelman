// Home and a space's page on their canvas (M3d-24; E-03, E-06, G-02, G-05).
// Home's list sits on a faint neutral map: --sm-canvas-neutral (#e2e1de) with
// the light and the default canvas's grain and contours, in place of plain
// --sm-list-bg. A space's page sits on its space's canvas, the tint mixed 72
// percent with the list's gray so the miniatures, drawn on the full tint,
// still stand out, under the space's own light and texture. On hover a list
// item lifts 3 px in --sm-lift, and its miniature rises 2 px more and grows
// 3.5 percent. Under reduced motion the shadow still changes and nothing
// moves. axe-core can't judge contrast over a background image (it reports it
// as needing review), so, as canvas.spec.ts does, the test reads the canvas's
// own pixels at the page's darker bottom corner and behind each empty state's
// text, and works out the contrast itself; the sort bar and the counts sit on
// their own opaque backgrounds, so the scan must have judged them.

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const CANVASES = ["stone", "cool", "sand", "slate", "sage", "lilac"] as const;
const NAME = "Atlas pod";
const EMPTY = "Atlas annex";
const ABOUT = "Pod 6 tries the list's canvases here.";
const SECOND = "Should Pod 6 map the campus?";
const NO_MATCH = "No steelmen match that search.";
const NO_STEELMEN = "No steelmen are in this space yet.";
const NO_STEELMEN_HOME = "You have no steelmen yet.";
const STONE = "Atlas stone";
const SLATE = "Atlas slate";

const home = (page: Page): Locator => page.locator(".sm-home");
const posts = (page: Page): Locator => page.locator(".sm-feed-list > .sm-post");

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

interface Spaces {
  /** The space with the demo board and one more in it. */
  space: string;
  /** A space with no steelmen in it. */
  empty: string;
  /** Changes both spaces' canvas. */
  canvasTo(canvas: string): Promise<void>;
}

/** Maya makes a space with the demo board and one more in it, and an empty one, both on stone. */
async function spaces(board: TestBoard): Promise<Spaces> {
  const space = board.ids.itemId();
  const empty = board.ids.itemId();
  const maya = board.api("maya.chen");
  await maya.post("../../spaces", { id: space, name: NAME, about: ABOUT, canvas: "stone" });
  await maya.post("../../spaces", { id: empty, name: EMPTY, about: ABOUT, canvas: "stone" });
  await maya.put("space", { space });
  await maya.post("../../boards", { question: SECOND, options: ["Map it", "Leave it"], space, access: { general: "space", linkRole: "contributor" } });
  return {
    space,
    empty,
    async canvasTo(canvas) {
      await maya.put(`../../spaces/${space}`, { name: NAME, about: ABOUT, canvas });
      await maya.put(`../../spaces/${empty}`, { name: EMPTY, about: ABOUT, canvas });
    },
  };
}

/** Opens a space's page and waits for its card and its list, or its empty state. */
async function openSpace(page: Page, space: string, name: string): Promise<void> {
  await page.goto(`/s/${space}`);
  await expect(page.getByRole("region", { name: `About ${name}` }).filter({ visible: true })).toBeVisible();
  await expect(page.locator(".sm-feed-list, .sm-feed-empty")).toBeVisible();
  await settled(page);
}

/** Splits a computed CSS list on its top-level commas. */
function layers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") depth--;
    else if (value[i] === "," && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out;
}

/** A computed colour, rgb(…) or color(srgb …), as [r, g, b] from 0 to 255. */
function rgbOf(value: string): number[] {
  const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
  return value.startsWith("color(") ? numbers.slice(0, 3).map((c) => c * 255) : numbers.slice(0, 3);
}
const hexRgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const luminance = ([r, g, b]: number[]) => {
  const [lr, lg, lb] = [r!, g!, b!].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** A token's value as the page computes it. */
function token(page: Page, name: string): Promise<string> {
  return page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);
}

/** A shadow token as a box-shadow computes it inside the study. */
function shadowOf(page: Page, name: string): Promise<string> {
  return page.evaluate((property) => {
    const probe = document.createElement("div");
    probe.style.boxShadow = `var(${property})`;
    document.querySelector("#steelman-study")!.append(probe);
    const shadow = getComputedStyle(probe).boxShadow;
    probe.remove();
    return shadow;
  }, name);
}

/** Answers the list with no boards in it, so Home shows its own empty state. */
function emptyList(context: BrowserContext): Promise<unknown> {
  return context.route(/\/api\/boards$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...((await response.json()) as object), boards: [] } });
  });
}

/** Holds the first answer to the list, so the skeleton shows, until it's released (as pages-polish.spec.ts does). */
function holdList(): { prepare(context: BrowserContext): Promise<unknown>; held: Promise<void>; release(): Promise<void> } {
  let route: Route | null = null;
  let arrived: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (arrived = resolve));
  return {
    prepare: (context) =>
      context.route(/\/api\/boards$/, async (request) => {
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

/** The average colour of the page in a box of the window, as drawn. */
async function averageIn(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<number[]> {
  const png = await page.screenshot({ clip, animations: "disabled" });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
    return sum.map((total) => total / (data.length / 4));
  }, png.toString("base64"));
}

/** The canvas at the darker of the page's two bottom corners, with everything on it hidden. */
async function darkerCorner(page: Page): Promise<number[]> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const hide = await page.addStyleTag({ content: "#steelman-study .sm-home > * { visibility:hidden !important; }" });
  await settled(page);
  const box = (await home(page).boundingBox())!;
  const bottom = Math.min(box.y + box.height, page.viewportSize()!.height) - 32;
  const corners = [
    await averageIn(page, { x: box.x, y: bottom, width: 32, height: 32 }),
    await averageIn(page, { x: box.x + box.width - 32, y: bottom, width: 32, height: 32 }),
  ];
  await hide.evaluate((style) => (style as Element).remove());
  await page.evaluate(() => window.scrollTo(0, 0));
  return corners.sort((a, b) => luminance(a) - luminance(b))[0]!;
}

/** Muted and quiet text's own colours, as text in the list's main landmark computes them, as [r, g, b, alpha]. */
async function textColours(page: Page): Promise<{ muted: number[]; quiet: number[] }> {
  return page.evaluate(() => {
    const main = document.querySelector("#steelman-study .sm-feed")!;
    const read = (colour: string) => {
      const line = document.createElement("p");
      line.textContent = "This line is only measured.";
      line.style.cssText = `position:fixed; left:0; top:0; margin:0; color:${colour};`;
      main.append(line);
      const [r = 0, g = 0, b = 0, alpha = 1] = (getComputedStyle(line).color.match(/[\d.]+/g) ?? []).map(Number);
      line.remove();
      return [r, g, b, alpha];
    };
    return { muted: read("var(--sm-muted)"), quiet: read("var(--sm-quiet)") };
  });
}

/** An empty state's sentence and the canvas behind it, with the sentence hidden while the canvas is read. */
async function sentenceOnCanvas(page: Page, sentence: Locator): Promise<{ ink: number[]; ground: number[] }> {
  const ink = rgbOf(await sentence.evaluate((element) => getComputedStyle(element).color));
  const hide = await page.addStyleTag({ content: "#steelman-study :is(.sm-feed-empty, .sm-feed-nomatch) p { color:transparent !important; }" });
  await settled(page);
  const box = (await sentence.boundingBox())!;
  const ground = await averageIn(page, { x: Math.round(box.x), y: Math.round(box.y), width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) });
  await hide.evaluate((style) => (style as Element).remove());
  return { ink, ground };
}

/**
 * The scan finds nothing, and it judged the sort bar, the search field, and the options' argument counts rather than
 * leaving them for review. (A post's own meta line sits on the post's grain over white, not on the canvas, and axe
 * leaves it for review on every page, so it isn't part of this check.)
 */
async function scan(page: Page, where: string, list: boolean): Promise<void> {
  await settled(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    `the scan on ${where}`,
  ).toEqual([]);
  if (!list) return;
  const judged = (results.passes.find((rule) => rule.id === "color-contrast")?.nodes ?? []).map((node) => node.target.join(" "));
  const unjudged = (results.incomplete.find((rule) => rule.id === "color-contrast")?.nodes ?? []).map((node) => node.target.join(" "));
  // On a phone the word "Sort" is said but not drawn, so the chosen sort is the text the bar always draws.
  expect(judged.some((target) => target.includes("sm-feed-sort-value")), `the sort bar's contrast is judged on ${where}`).toBe(true);
  expect(judged.some((target) => target === "input"), `the search field's contrast is judged on ${where}`).toBe(true);
  expect(judged.some((target) => target.endsWith('b[title="3 arguments"]')), `the counts' contrast is judged on ${where}`).toBe(true);
  expect(unjudged.filter((target) => /sm-feed-sort|^input$|b\[title=/.test(target)), `nothing in the sort bar or the counts is left for review on ${where}`).toEqual([]);
}

/** Muted and quiet text at the page's darker bottom corner reach 4.5:1. */
async function cornerContrast(page: Page, where: string): Promise<void> {
  const corner = await darkerCorner(page);
  const ink = await textColours(page);
  for (const name of ["muted", "quiet"] as const) {
    const [r, g, b, alpha] = ink[name];
    expect(alpha, `${name} text is opaque`).toBe(1);
    expect(contrast([r!, g!, b!], corner), `${name} text, rgb(${r}, ${g}, ${b}), at ${where}'s darker bottom corner, rgb(${corner.map(Math.round).join(", ")})`).toBeGreaterThanOrEqual(4.5);
  }
}

/** An empty state's sentence reaches 4.5:1 on the canvas behind it. */
async function sentenceContrast(page: Page, text: string, where: string): Promise<void> {
  const sentence = page.locator(".sm-feed-empty p, .sm-feed-nomatch p").filter({ hasText: text });
  await expect(sentence).toBeVisible();
  const { ink, ground } = await sentenceOnCanvas(page, sentence);
  expect(contrast(ink, ground), `"${text}" on ${where}, rgb(${ground.map(Math.round).join(", ")})`).toBeGreaterThanOrEqual(4.5);
}

/** Searches the list for something no steelman says, so the no-match state shows. */
async function searchForNothing(page: Page): Promise<void> {
  await page.getByRole("searchbox", { name: "Search steelmen" }).fill("zebra quokka");
  await expect(page.locator(".sm-feed-nomatch")).toContainText(NO_MATCH);
}

test("E-03, G-02: Home sits on the neutral canvas, --sm-canvas-neutral with the light and the contours, in place of plain gray", async ({ board }) => {
  const page = await board.open("maya.chen", { at: "/" });
  await expect(posts(page)).toHaveCount(1);

  expect((await token(page, "--sm-canvas-neutral")).toLowerCase()).toBe("#e2e1de");
  await expect(home(page)).not.toHaveAttribute("data-canvas");
  const { colour, image, size } = await home(page).evaluate((element) => {
    const style = getComputedStyle(element);
    return { colour: style.backgroundColor, image: style.backgroundImage, size: style.backgroundSize };
  });
  expect(rgbOf(colour).map(Math.round)).toEqual([226, 225, 222]);
  const list = layers(image);
  expect(list, "the light, the grain, and the contours").toHaveLength(3);
  expect(list[0], "the light comes first").toMatch(/^radial-gradient\(/);
  expect(list.slice(1).every((layer) => layer.startsWith("url(")), "the grain and the contours are images").toBe(true);
  // The contours are the 480 px tile (M3d-21), sized once over the whole page for the light.
  expect(layers(size)).toEqual(["100% 100%", "180px 180px", "480px 480px"]);
});

test("E-06, G-02, G-05: each of the six canvases shows on its space's page, its tint mixed 72 percent with the list's gray, under the space's own light and texture, and the sidebar's stone and slate swatches keep their contours", async ({ board }) => {
  const { space, canvasTo } = await spaces(board);
  const maya = board.api("maya.chen");
  await maya.post("../../spaces", { id: board.ids.itemId(), name: STONE, about: ABOUT, canvas: "stone" });
  await maya.post("../../spaces", { id: board.ids.itemId(), name: SLATE, about: ABOUT, canvas: "slate" });
  const page = await board.open("maya.chen", { at: "/" });
  await expect(posts(page)).toHaveCount(2);
  await settled(page);
  const gray = hexRgb(await token(page, "--sm-list-bg"));
  const swatch = (name: string) => page.locator(".sm-side-link").filter({ hasText: name }).locator(".sm-swatch");
  const drawn = (name: string) => swatch(name).evaluate((element) => ({ image: getComputedStyle(element).backgroundImage, size: getComputedStyle(element).backgroundSize }));
  // On Home, which sets no canvas of its own, the stone and slate swatches draw the default canvas: the light, the grain, and the contours.
  const atHome = { stone: await drawn(STONE), slate: await drawn(SLATE) };
  expect(layers(atHome.stone.image), "the stone swatch's light, grain, and contours").toHaveLength(3);
  expect(atHome.slate).toEqual(atHome.stone);
  for (const canvas of CANVASES) {
    await canvasTo(canvas);
    await openSpace(page, space, NAME);
    await expect(home(page)).toHaveAttribute("data-canvas", canvas);

    const tint = hexRgb(await token(page, `--sm-canvas-${canvas}`));
    const mixed = tint.map((c, i) => 0.72 * c + 0.28 * gray[i]!);
    const page_ = await home(page).evaluate((element) => {
      const style = getComputedStyle(element);
      return { colour: style.backgroundColor, image: style.backgroundImage, size: style.backgroundSize };
    });
    const thumb = await posts(page).first().locator(".sm-thumb").evaluate((element) => ({ canvas: element.getAttribute("data-canvas"), colour: getComputedStyle(element).backgroundColor, image: getComputedStyle(element).backgroundImage }));
    rgbOf(page_.colour).forEach((c, i) => expect(Math.abs(c - mixed[i]!), `${canvas}'s page colour, ${page_.colour}`).toBeLessThanOrEqual(1.5));
    // The miniature keeps the full tint, so it stands out on the mixed page.
    expect(thumb.canvas).toBe(canvas);
    expect(rgbOf(thumb.colour).map(Math.round)).toEqual(tint);
    // The page draws the space's own layers: its light first, then its texture.
    expect(page_.image, `${canvas}'s layers`).toBe(thumb.image);
    expect(layers(page_.image)[0]).toMatch(/^radial-gradient\(/);
    expect(layers(page_.size), `${canvas}'s sizes`).toHaveLength(layers(page_.image).length);
    // The page's canvas doesn't reach the other spaces' swatches: stone and slate keep the contours on every page.
    expect(await drawn(STONE), `the stone swatch on ${canvas}'s page`).toEqual(atHome.stone);
    expect(await drawn(SLATE), `the slate swatch on ${canvas}'s page`).toEqual(atHome.slate);
  }
});

test("E-06, G-05: while the list loads on a space's page, the skeleton already sits on the space's canvas, and on Home on the neutral one", async ({ board }) => {
  const { space, canvasTo } = await spaces(board);
  await canvasTo("sage");
  const hold = holdList();
  const page = await board.open("maya.chen", { at: `/s/${space}`, prepare: (context) => hold.prepare(context) });
  await hold.held;
  const skeleton = page.locator(".sm-home:has(> .sm-feed-skeleton)");
  // The spaces arrive while the list is held, so the skeleton knows the space's canvas before the list comes.
  await expect(skeleton).toHaveAttribute("data-canvas", "sage");
  const gray = hexRgb(await token(page, "--sm-list-bg"));
  const tint = hexRgb(await token(page, "--sm-canvas-sage"));
  const mixed = tint.map((c, i) => 0.72 * c + 0.28 * gray[i]!);
  const colour = await skeleton.evaluate((element) => getComputedStyle(element).backgroundColor);
  rgbOf(colour).forEach((c, i) => expect(Math.abs(c - mixed[i]!), `the skeleton's colour, ${colour}`).toBeLessThanOrEqual(1.5));
  await hold.release();
  await expect(page.locator(".sm-feed-list")).toBeVisible();
  await expect(home(page)).toHaveAttribute("data-canvas", "sage");
  expect(await home(page).evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(colour);

  const onHome = holdList();
  const homePage = await board.open("maya.chen", { at: "/", prepare: (context) => onHome.prepare(context) });
  await onHome.held;
  await expect(homePage.locator(".sm-home:has(> .sm-feed-skeleton)")).toBeVisible();
  await expect(homePage.locator(".sm-home:has(> .sm-feed-skeleton)")).not.toHaveAttribute("data-canvas");
  await onHome.release();
  await expect(homePage.locator(".sm-feed-list")).toBeVisible();
});

test("E-03, E-06: at 1280 px, hovering a list item lifts it 3 px in --sm-lift, and its miniature rises 2 px more and grows 3.5 percent", async ({ board }) => {
  const page = await board.open("maya.chen", { at: "/" });
  const post = posts(page).first();
  const thumb = post.locator(".sm-thumb");
  await expect(thumb).toBeVisible();
  await settled(page);
  const lift = await shadowOf(page, "--sm-lift");
  const before = { post: (await post.boundingBox())!, thumb: (await thumb.boundingBox())!, top: await post.evaluate((element) => (element as HTMLElement).offsetTop) };

  await post.hover({ position: { x: 12, y: 12 } });
  await settled(page);
  const after = { post: (await post.boundingBox())!, thumb: (await thumb.boundingBox())!, top: await post.evaluate((element) => (element as HTMLElement).offsetTop) };
  expect(after.post.y - before.post.y, "the item lifts 3 px").toBeCloseTo(-3, 1);
  expect(after.top, "its place in the list stays").toBe(before.top);
  expect(await post.evaluate((element) => getComputedStyle(element).boxShadow)).toBe(lift);
  expect(after.thumb.width / before.thumb.width, "the miniature grows 3.5 percent").toBeCloseTo(1.035, 3);
  expect(after.thumb.height / before.thumb.height).toBeCloseTo(1.035, 3);
  const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(centre(after.thumb) - centre(before.thumb), "the miniature rises 2 px more than the item").toBeCloseTo(-5, 1);
});

test("E-03: a pointer resting just above a list item's bottom edge keeps it lifted, rather than the item lifting out from under it", async ({ board }) => {
  const page = await board.open("maya.chen", { at: "/" });
  const post = posts(page).first();
  await expect(post).toBeVisible();
  await settled(page);
  const before = (await post.boundingBox())!;
  // 1 px above the bottom edge, inside the 3 px the item lifts by, and then a pixel along it, as a resting hand drifts.
  const x = before.x + before.width / 2;
  const y = before.y + before.height - 1;
  await page.mouse.move(x, y);
  await settled(page);
  for (const step of [1, 2, 3]) {
    await page.mouse.move(x + step, y);
    await settled(page);
  }
  expect(await post.evaluate((element) => element.matches(":hover")), "the item is still under the pointer").toBe(true);
  expect((await post.boundingBox())!.y - before.y, "and it stays lifted").toBeCloseTo(-3, 1);
});

test("E-03: at 375 px, where the miniature isn't drawn, hovering a list item lifts it 3 px", async ({ board }) => {
  const page = await board.open("maya.chen", { width: 375, at: "/" });
  const post = posts(page).first();
  await expect(post).toBeVisible();
  await expect(post.locator(".sm-thumb")).toBeHidden();
  await settled(page);
  const before = (await post.boundingBox())!;
  await post.hover({ position: { x: 12, y: 12 } });
  await settled(page);
  expect((await post.boundingBox())!.y - before.y).toBeCloseTo(-3, 1);
});

test("E-03, E-06: under reduced motion, hovering a list item changes its shadow, and neither it nor its miniature moves or grows", async ({ board }) => {
  const page = await board.open("maya.chen");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const post = posts(page).first();
  const thumb = post.locator(".sm-thumb");
  await expect(thumb).toBeVisible();
  await settled(page);
  const before = { post: (await post.boundingBox())!, thumb: (await thumb.boundingBox())!, shadow: await post.evaluate((element) => getComputedStyle(element).boxShadow) };

  const lift = await shadowOf(page, "--sm-lift");
  const shadow = await shadowOf(page, "--sm-shadow");

  await post.hover({ position: { x: 12, y: 12 } });
  expect(await page.evaluate(() => document.getAnimations().length), "nothing animates").toBe(0);
  await page.clock.runFor(40);
  const after = { post: (await post.boundingBox())!, thumb: (await thumb.boundingBox())!, shadow: await post.evaluate((element) => getComputedStyle(element).boxShadow) };
  expect(after.shadow, "the shadow still changes").not.toBe(before.shadow);
  expect(after.shadow, "the item takes --sm-lift").toBe(lift);
  expect(await thumb.evaluate((element) => getComputedStyle(element).boxShadow), "the miniature takes --sm-shadow").toBe(shadow);
  expect(after.post).toEqual(before.post);
  expect(after.thumb).toEqual(before.thumb);
});

for (const width of [1280, 375]) {
  test(`E-03, G-02: at ${width} px, the scan passes on Home, with the sort bar, the counts, and the no-match state on the canvas at 4.5:1 or more`, async ({ board }) => {
    await spaces(board);
    const page = await board.open("maya.chen", { width, at: "/" });
    await expect(posts(page)).toHaveCount(2);
    await scan(page, "Home", true);
    await cornerContrast(page, "Home");
    await searchForNothing(page);
    await sentenceContrast(page, NO_MATCH, "Home");
    await scan(page, "Home's search with no match", false);
  });

  test(`E-03, G-02: at ${width} px, the scan passes on Home with no steelmen, with its empty state on the canvas at 4.5:1 or more`, async ({ board }) => {
    const page = await board.open("maya.chen", { width, at: "/", prepare: emptyList });
    await expect(page.locator(".sm-feed-empty")).toContainText(NO_STEELMEN_HOME);
    await expect(home(page)).not.toHaveAttribute("data-canvas");
    await settled(page);
    await sentenceContrast(page, NO_STEELMEN_HOME, "Home");
    await cornerContrast(page, "Home with no steelmen");
    await scan(page, "Home with no steelmen", false);
  });

  for (const canvas of CANVASES) {
    test(`E-03, E-06, G-02, G-05: at ${width} px on ${canvas}, the scan passes on a space's page, with the sort bar, the counts, and the empty states on the canvas at 4.5:1 or more`, async ({ board }) => {
      const { space, empty, canvasTo } = await spaces(board);
      await canvasTo(canvas);
      const page = await board.open("maya.chen", { width, at: "/" });
      await expect(posts(page)).toHaveCount(2);

      await openSpace(page, space, NAME);
      await expect(home(page)).toHaveAttribute("data-canvas", canvas);
      await scan(page, `${canvas}'s page`, true);
      await cornerContrast(page, `${canvas}'s page`);
      await searchForNothing(page);
      await sentenceContrast(page, NO_MATCH, `${canvas}'s page`);
      await scan(page, `${canvas}'s search with no match`, false);

      await openSpace(page, empty, EMPTY);
      await expect(home(page)).toHaveAttribute("data-canvas", canvas);
      await sentenceContrast(page, NO_STEELMEN, `${canvas}'s empty space`);
      await scan(page, `${canvas}'s empty space`, false);
    });
  }
}
