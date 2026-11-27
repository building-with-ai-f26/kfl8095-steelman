// The hex keys (M3d-27) that replace the axis captions at widths above
// 640 px. Down the first column, an outlined hexagon sits level with each
// row's vote, sized by the row's importance on the texture's own curve
// (B-06). Above an unfolded row, a filled hexagon sits over the start of
// each wording, toned by its articulation as the texture shades the row
// (B-07). Phones keep today's captions. The approved specimen is
// docs/design/index.html, section "Hex keys".

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { TICK_MS, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { column, find, pill, poll, row } from "./support/screen.ts";

const SUNDAY = "Sunday is the only free day for many people who work weekdays.";
const SHIFT = "Shift workers can only come on Sundays.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
const THIRD = "People who work all week have only Sunday to visit.";
/** The least important row's hexagon keeps this share of a full cell (KEY_PIN in board/texture.ts). */
const KEY_PIN = 0.12;
/** The articulation key's hexagons have this radius in px (KEY_ART_R in board/texture.ts). */
const KEY_ART_R = 6;

interface Mark {
  x: number;
  y: number;
  r: number;
  tone: number;
}

/** The importance key on screen: each hexagon's centre and radius, and each row's vote, top to bottom. */
function importanceKeyOnScreen(page: Page) {
  return page.evaluate(() => {
    const key = document.querySelector<HTMLElement>(".sm-hex-vkey");
    if (!key || key.offsetParent === null) return null;
    const hexes = [...key.querySelectorAll("polygon")].map((polygon) => {
      const b = polygon.getBoundingClientRect();
      return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, r: b.height / 2, tone: 1 };
    });
    const rows = [...key.closest(".sm-column")!.querySelectorAll<HTMLElement>("[data-node]")].map((node) => {
      const b = node.querySelector('.sm-vote[data-axis="v"]')!.getBoundingClientRect();
      return (b.top + b.bottom) / 2;
    });
    const caption = key.querySelector<HTMLElement>(".sm-hex-caption")!;
    return { hexes, rows, caption: getComputedStyle(caption).visibility === "hidden" ? null : caption.textContent, lines: key.querySelectorAll("line").length, hidden: key.getAttribute("aria-hidden") };
  });
}

/** The articulation key above the unfolded row: its hexagons, and where each wording's first letter starts. */
function articulationKeyOnScreen(page: Page) {
  return page.evaluate(() => {
    const key = document.querySelector<HTMLElement>(".sm-hex-hkey");
    if (!key || key.offsetParent === null) return null;
    const hexes: Mark[] = [...key.querySelectorAll("polygon")].map((polygon) => {
      const b = polygon.getBoundingClientRect();
      return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, r: b.height / 2, tone: Number(polygon.getAttribute("fill-opacity")) };
    });
    const starts = [...key.closest("[data-node]")!.querySelectorAll(".sm-track .sm-card[data-card]")].map((card) => (card.querySelector(".sm-claim") ?? card).getBoundingClientRect().left);
    const caption = key.querySelector<HTMLElement>(".sm-hex-caption")!;
    const box = key.getBoundingClientRect();
    return { hexes, starts, caption: getComputedStyle(caption).visibility === "hidden" ? null : { text: caption.textContent, left: caption.getBoundingClientRect().left }, mid: (box.top + box.bottom) / 2, hidden: key.getAttribute("aria-hidden") };
  });
}

/** The full cell's radius and the importance curve, from the design tokens. */
function tokens(page: Page): Promise<{ full: number; curve: number; floor: number }> {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => parseFloat(style.getPropertyValue(name));
    return { full: read("--sm-hex-cell") * read("--sm-hex-size"), curve: read("--sm-hex-curve"), floor: read("--sm-hex-art-floor") };
  });
}

/** A row's hexagon radius for its score, scaled against every row on the board, as the texture's density is. */
function radius(full: number, curve: number, scores: number[], score: number): number {
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const level = Math.pow(hi === lo ? 1 : (score - lo) / (hi - lo), curve);
  return full * (KEY_PIN + (1 - KEY_PIN) * level);
}

/** A new board of Maya's with the given arguments for Yes and No, opened in her browser; it gives back the arguments' IDs. */
async function boardWith(board: TestBoard, page: Page, yes: number, no: number): Promise<{ board: string; arguments: string[] }> {
  const maya = board.api("maya.chen");
  const { board: id } = (await maya.post("/api/boards", { question: "Should the pod meet on Fridays?", options: ["Yes", "No"] })) as { board: string };
  const snapshot = (await maya.get(`/api/boards/${id}`)) as { options: { id: string; position: number }[] };
  const [yesOption, noOption] = [...snapshot.options].sort((a, b) => a.position - b.position);
  const made: string[] = [];
  for (const [option, count] of [[yesOption!, yes], [noOption!, no]] as const) {
    for (let n = 0; n < count; n++) {
      const argument = board.ids.itemId();
      made.push(argument);
      await maya.post(`/api/boards/${id}/arguments`, { id: argument, optionId: option.id, versionId: board.ids.itemId(), wording: `Argument ${n + 1} for this side.`, context: "" });
    }
  }
  return { board: id, arguments: made };
}

async function openBoard(page: Page, id: string): Promise<void> {
  await page.goto(`/b/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should the pod meet on Fridays?");
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** The Sunday row with a third wording, voted so the three wordings have 3, 1, and 0 net articulation votes. */
async function threeWordings(board: TestBoard): Promise<void> {
  const { argument, version } = await find(board, SUNDAY);
  const shift = await find(board, SHIFT);
  await board.api("lin.zhao").post(`arguments/${argument}/versions`, { id: board.ids.itemId(), wording: THIRD, context: "" });
  for (const person of ["lin.zhao", "jordan_w"] as const) await board.api(person).put(`versions/${version}/articulation`, { value: 1 });
  await board.api("tess.b").put(`versions/${shift.version}/articulation`, { value: 1 });
}

test("B-06: a ranked column shows one hexagon per row, each within 2 px of its row's vote and sized as the texture scales the board, and after Update the sizes follow the new order", async ({ board }) => {
  const page = await board.open("jordan_w");
  const { full, curve } = await tokens(page);
  // The demo board's importances: Yes has 3, 2, and 1, and No has 3, 1, and -1.
  const scores = [3, 2, 1, 3, 1, -1];
  await expect(page.locator(".sm-hex-vkey")).toHaveCount(1);
  await expect(column(page, "Yes").locator(".sm-hex-vkey")).toHaveCount(1);

  const placed = async () => {
    const key = await importanceKeyOnScreen(page);
    if (!key) return "no key";
    if (key.hexes.length !== key.rows.length) return `${key.hexes.length} hexagons for ${key.rows.length} rows`;
    return key.hexes.every((hex, k) => Math.abs(hex.y - key.rows[k]!) <= 2) ? "in place" : `hexagons at ${key.hexes.map((h) => h.y)}, votes at ${key.rows}`;
  };
  await expect.poll(placed).toBe("in place");
  const sizes = async () => (await importanceKeyOnScreen(page))!.hexes.map((hex) => Math.round(hex.r * 10) / 10);
  const expected = (order: number[]) => order.map((score) => Math.round(radius(full, curve, scores, score) * 10) / 10);
  await expect.poll(sizes).toEqual(expected([3, 2, 1]));
  const key = (await importanceKeyOnScreen(page))!;
  expect(key.caption).toBe("More important");
  expect(key.lines).toBe(2);
  expect(key.hidden).toBe("true");

  // Three more people put "Families…" first. Its count changes where it stands, so its hexagon grows in place.
  const family = await find(board, FAMILY);
  for (const person of ["tess.b", "lin.zhao", "omar_h"] as const) await board.api(person).put(`arguments/${family.argument}/importance`, { value: 1 });
  scores[2] = 4;
  board.clock.advance(TICK_MS);
  await poll(page);
  await expect.poll(sizes).toEqual(expected([3, 2, 4]));

  // Update moves it to the top, and the hexagons follow the new order.
  await pill(page).getByRole("button", { name: "Update" }).click();
  await expect.poll(sizes).toEqual(expected([4, 3, 2]));
  await expect.poll(placed).toBe("in place");
});

test("B-06: a board whose only argument is in the first column shows one full hexagon and its caption, a first column with one argument beside another column shows one hexagon, and one with none shows no key", async ({ board }) => {
  const page = await board.open("maya.chen");
  const { full } = await tokens(page);

  await openBoard(page, (await boardWith(board, page, 1, 0)).board);
  await expect.poll(async () => (await importanceKeyOnScreen(page))?.hexes.map((hex) => Math.round(hex.r * 10) / 10)).toEqual([Math.round(full * 10) / 10]);
  expect((await importanceKeyOnScreen(page))!.caption).toBe("More important");

  await openBoard(page, (await boardWith(board, page, 1, 1)).board);
  await expect.poll(async () => (await importanceKeyOnScreen(page))?.hexes.length).toBe(1);
  await expect(page.locator(".sm-hex-vkey")).toHaveCount(1);

  await openBoard(page, (await boardWith(board, page, 0, 1)).board);
  await expect(page.locator(".sm-column[aria-label='No'] .sm-idea")).toHaveCount(1);
  await expect(page.locator(".sm-hex-vkey")).toHaveCount(0);
});

test("B-07: an unfolded row of three shows three hexagons over the starts of its wordings, darkest first, and the caption scrolls away with the first wording", async ({ board }) => {
  await threeWordings(board);
  const page = await board.open("jordan_w");
  const { floor } = await tokens(page);
  await row(page, SUNDAY).getByRole("button", { name: "Compare 3 wordings of this argument" }).click();

  const placed = async () => {
    const key = await articulationKeyOnScreen(page);
    if (!key) return "no key";
    if (key.hexes.length !== 3 || key.starts.length !== 3) return `${key.hexes.length} hexagons for ${key.starts.length} wordings`;
    return key.hexes.every((hex, k) => Math.abs(hex.x - (key.starts[k]! + KEY_ART_R)) <= 2 && Math.abs(hex.y - key.mid) <= 2) ? "in place" : `hexagons at ${key.hexes.map((h) => h.x)}, wordings at ${key.starts}`;
  };
  await expect.poll(placed).toBe("in place");
  const key = (await articulationKeyOnScreen(page))!;
  expect(key.hidden).toBe("true");
  // 3, 1, and 0 votes: the best at full tone, the next at a third of the way above the floor, the weakest at the floor.
  expect(key.hexes.map((hex) => Math.round(hex.tone * 1000) / 1000)).toEqual([1, Math.round((floor + (1 - floor) / 3) * 1000) / 1000, floor]);
  expect(key.caption?.text).toBe("Best articulation");
  expect(key.caption!.left).toBeGreaterThan(key.hexes[0]!.x + KEY_ART_R);

  // Scrolled to the last wording: the caption goes with the first wording, and each hexagon stays over its own.
  await page.evaluate(() => {
    const track = document.querySelector<HTMLElement>(".sm-open .sm-track")!;
    track.scrollTo({ left: track.scrollWidth });
  });
  await expect.poll(async () => (await articulationKeyOnScreen(page))?.caption ?? null).toBeNull();
  await expect.poll(placed).toBe("in place");
});

test("B-07: a row of new wordings with no votes draws every hexagon at full tone", async ({ board }) => {
  const page = await board.open("maya.chen");
  const made = await boardWith(board, page, 1, 0);
  await board.api("maya.chen").post(`/api/boards/${made.board}/arguments/${made.arguments[0]}/versions`, { id: board.ids.itemId(), wording: "A second wording of the first argument.", context: "" });
  await openBoard(page, made.board);
  await page.getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expect.poll(async () => (await articulationKeyOnScreen(page))?.hexes.map((hex) => hex.tone)).toEqual([1, 1]);
});

test("B-06 B-07: at 375 px the captions show and no key does", async ({ board }) => {
  const page = await board.open("jordan_w", { width: 375 });
  const first = page.locator("section.sm-column").first();
  await expect(first.locator(".sm-col-axis")).toHaveText("Most important first");
  await expect(first.locator(".sm-col-axis")).toBeVisible();
  await expect(page.locator(".sm-hex-key:visible")).toHaveCount(0);

  await row(page, SUNDAY).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expect(row(page, SUNDAY).locator(".sm-pager-text")).toHaveText("1 of 2 · best articulated");
  await expect(row(page, SUNDAY).locator(".sm-pager")).toBeVisible();
  await expect(page.locator(".sm-hex-key:visible")).toHaveCount(0);
});

test("B-06 B-07: the accessibility scan passes with both keys at 1280 px and with the captions at 375 px", async ({ board }) => {
  await threeWordings(board);
  const wide = await board.open("jordan_w");
  await row(wide, SUNDAY).getByRole("button", { name: "Compare 3 wordings of this argument" }).click();
  await expect.poll(async () => (await articulationKeyOnScreen(wide))?.hexes.length).toBe(3);
  await expectNoAxeViolations(wide);

  const phone = await board.open("jordan_w", { width: 375 });
  await row(phone, SUNDAY).getByRole("button", { name: "Compare 3 wordings of this argument" }).click();
  await expect(row(phone, SUNDAY).locator(".sm-pager")).toBeVisible();
  await expectNoAxeViolations(phone);
});
