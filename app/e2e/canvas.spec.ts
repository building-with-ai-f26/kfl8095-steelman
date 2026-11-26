// Map contours on the canvas (M3d-21, M-05, G-02, A-01, M-04). The canvas gains
// a light, --sm-canvas-light: up to 30% white at the top centre, under the
// question, fading out well before the edges, so the edges keep the plain tint
// and texture. It comes first in every canvas's layers, so the board carries
// it on each of the six space canvases, with one size per layer. A bottom
// corner is where the light has faded to the plain tint and texture, so muted
// and quiet text placed there must pass the accessibility scan at 4.5:1 or
// more; any darkening added to the edges later must keep it so. axe-core can't
// judge contrast over a background image (it reports it as needing review), so
// the test also reads the canvas's own pixels at that corner, reads the placed
// text's computed colours, and works out the contrast itself.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const CANVASES = ["stone", "cool", "sand", "slate", "sage", "lilac"] as const;
const NAME = "Canvas pod";
const ABOUT = "Pod 6 tries each canvas here.";

const surface = (page: Page): Locator => page.locator(".sm-surface");

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/** Maya puts the demo board in a new space, and returns a way to change the space's canvas. */
async function spaceForBoard(board: TestBoard): Promise<(canvas: string) => Promise<unknown>> {
  const space = board.ids.itemId();
  await board.api("maya.chen").post("../../spaces", { id: space, name: NAME, about: ABOUT, canvas: "stone" });
  await board.api("maya.chen").put("space", { space });
  return (canvas) => board.api("maya.chen").put(`../../spaces/${space}`, { name: NAME, about: ABOUT, canvas });
}

/** Opens the board again once its space's canvas has changed, and waits for the canvas. */
async function reopen(page: Page, canvas: string): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await expect(surface(page)).toHaveAttribute("data-canvas", canvas);
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

/** The canvas's average colour in a 32 px square at the board's bottom-left corner, with the board's contents hidden. */
async function cornerColour(page: Page): Promise<number[]> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const hide = await page.addStyleTag({ content: "#steelman-study .sm-surface > * { visibility:hidden !important; }" });
  await settled(page);
  const box = (await surface(page).boundingBox())!;
  const png = await page.screenshot({ clip: { x: box.x, y: box.y + box.height - 32, width: 32, height: 32 }, animations: "disabled" });
  await hide.evaluate((style) => (style as Element).remove());
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

/**
 * Places a line of muted text and a line of quiet text in the board's bottom-left corner, where the light has faded to
 * the plain tint and texture, and returns each line's computed colour as [r, g, b, alpha].
 */
async function placeTextAtEdge(page: Page): Promise<{ muted: number[]; quiet: number[] }> {
  return page.evaluate(() => {
    const at = document.querySelector(".sm-surface")!;
    // In the board's main landmark, as all of its text is, but fixed to the surface's corner.
    const main = at.querySelector("main")!;
    const bottom = at.getBoundingClientRect().bottom;
    for (const [i, colour, weight] of [
      [0, "var(--sm-muted)", 400],
      [1, "var(--sm-quiet)", 300],
    ] as const) {
      const line = document.createElement("p");
      line.className = "sm-edge-probe";
      line.textContent = i === 0 ? "This muted line sits at the canvas's edge." : "This quiet line sits at the canvas's edge.";
      line.style.cssText = `position:fixed; left:${at.getBoundingClientRect().left + 8}px; top:${bottom - 44 + i * 18}px; margin:0; font:${weight} 12px/16px var(--sm-sans); color:${colour}; background:none;`;
      main.append(line);
    }
    const [muted, quiet] = [...document.querySelectorAll(".sm-edge-probe")].map((line) => {
      const [r = 0, g = 0, b = 0, alpha = 1] = (getComputedStyle(line).color.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, alpha];
    });
    return { muted: muted!, quiet: quiet! };
  });
}

test("M-05, G-02, A-01: the board carries the light layer first, with one size per layer, on each of the six canvases", async ({ board }) => {
  const canvasTo = await spaceForBoard(board);
  const maya = await board.open("maya.chen");
  for (const canvas of CANVASES) {
    await canvasTo(canvas);
    await reopen(maya, canvas);
    const { image, size } = await surface(maya).evaluate((element) => {
      const style = getComputedStyle(element);
      return { image: style.backgroundImage, size: style.backgroundSize };
    });
    const list = layers(image);
    expect(list[0], `the light on ${canvas}`).toMatch(/^radial-gradient\(/);
    // Only the light is a gradient: the contours, grain, dots, and linen are images.
    expect(list.slice(1).every((layer) => layer.startsWith("url(")), `the textures under the light on ${canvas}`).toBe(true);
    expect(layers(size), `${canvas}'s sizes`).toHaveLength(list.length);
  }
});

for (const width of [1280, 375]) {
  test(`M-05, G-02, A-01, M-04: at ${width} px, muted and quiet text at a bottom corner of each canvas passes the accessibility scan, at 4.5:1 or more`, async ({ board }) => {
    const canvasTo = await spaceForBoard(board);
    const maya = await board.open("maya.chen", { width });
    for (const canvas of CANVASES) {
      await canvasTo(canvas);
      await reopen(maya, canvas);
      const edge = await cornerColour(maya);
      // The tokens' own colours, as the placed text computes them, so a lighter --sm-muted or --sm-quiet fails here.
      const ink = await placeTextAtEdge(maya);
      for (const name of ["muted", "quiet"] as const) {
        const [r, g, b, alpha] = ink[name];
        expect(alpha, `${name} text is opaque`).toBe(1);
        expect(contrast([r!, g!, b!], edge), `${name} text, rgb(${r}, ${g}, ${b}), on ${canvas}'s bottom corner, rgb(${edge.map(Math.round).join(", ")})`).toBeGreaterThanOrEqual(4.5);
      }
      await settled(maya);
      const results = await new AxeBuilder({ page: maya }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
        `the scan on ${canvas}`,
      ).toEqual([]);
    }
  });
}
