// The board's two decorative layers, as the prototype draws them
// (docs/prototype/source/steelman-refined.html, drawLinks and drawTexture):
// the wires from the question to each option's header and on to each
// argument row (A-01), and the hexagon texture behind each column, its
// density from importance and its tone from articulation (B-07). Both are
// decoration: hidden from screen readers, never focused or clicked, and
// redrawn whenever the board's layout changes (M-03, M-04).

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import { column, find, importance, pill, poll, row } from "./support/screen.ts";

const SUNDAY = "Sunday is the only free day for many people who work weekdays.";
const STUDY = "Students need a quiet place to study before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
const FEW = "Few people would come, judging by Saturday afternoons.";

interface Point {
  x: number;
  y: number;
}

/** Where a path ends, following its M, L, H, and V commands. */
function endOf(d: string): Point {
  let at: Point = { x: 0, y: 0 };
  for (const [, command, args] of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
    const n = args!.trim().split(/[\s,]+/).map(Number);
    if (command === "M" || command === "L") at = { x: n[0]!, y: n[1]! };
    if (command === "H") at = { ...at, x: n[0]! };
    if (command === "V") at = { ...at, y: n[0]! };
  }
  return at;
}

function startOf(d: string): Point {
  const [x, y] = d.slice(1).split(/[\sLHV]/).map(Number);
  return { x: x!, y: y! };
}

/**
 * What the wires should reach, read from the screen in the scene's coordinates: the question's bottom centre, each
 * column's header top centre, and each row's leading card, 16 px below its top, at the row's edge when its track is
 * scrolled sideways. Only columns and rows on screen count.
 */
function targets(page: Page) {
  return page.evaluate(() => {
    const scene = document.querySelector(".sm-scene")!.getBoundingClientRect();
    const rel = (element: Element) => {
      const b = element.getBoundingClientRect();
      return { x: b.left - scene.left, y: b.top - scene.top, w: b.width, h: b.height };
    };
    const question = rel(document.querySelector(".sm-head")!);
    const columns = [...document.querySelectorAll<HTMLElement>(".sm-board .sm-column")]
      .filter((c) => c.offsetParent !== null && c.dataset.option)
      .map((c) => {
        const head = rel(c.querySelector(".sm-column-head")!);
        const rows = [...c.querySelectorAll<HTMLElement>("[data-node]")].map((node) => {
          const card = rel(node.querySelector(".sm-card")!);
          const wrap = node.querySelector(".sm-card-wrap");
          return { id: node.dataset.node!, x: wrap ? Math.max(card.x, rel(wrap).x) : card.x, y: card.y + 16 };
        });
        return { id: c.dataset.option!, x: head.x + head.w / 2, y: head.y, rows };
      });
    return { question: { x: question.x + question.w / 2, y: question.y + question.h }, columns };
  });
}

/** The wires drawn, by what each one reaches. */
function wires(page: Page): Promise<{ to: string; d: string }[]> {
  return page.locator(".sm-links path").evaluateAll((paths) => paths.map((path) => ({ to: path.getAttribute("data-to") ?? "", d: path.getAttribute("d") ?? "" })));
}

/** Every wire starts and ends where it should: one from the question to each header, one from its lane to each row. */
async function expectWiresInPlace(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const want = await targets(page);
      const drawn = await wires(page);
      const near = (a: Point, b: Point) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
      const problems: string[] = [];
      const options = drawn.filter((wire) => wire.to.startsWith("option:"));
      const rows = drawn.filter((wire) => wire.to.startsWith("row:"));
      if (options.length !== want.columns.length) problems.push(`${options.length} option wires for ${want.columns.length} columns`);
      const rowCount = want.columns.reduce((n, c) => n + c.rows.length, 0);
      if (rows.length !== rowCount) problems.push(`${rows.length} row wires for ${rowCount} rows`);
      for (const c of want.columns) {
        const wire = options.find((w) => w.to === `option:${c.id}`);
        if (!wire) problems.push(`no wire to option ${c.id}`);
        else {
          if (!near(startOf(wire.d), want.question)) problems.push(`option ${c.id}'s wire starts at ${JSON.stringify(startOf(wire.d))}, not the question's foot ${JSON.stringify(want.question)}`);
          if (!near(endOf(wire.d), c)) problems.push(`option ${c.id}'s wire ends at ${JSON.stringify(endOf(wire.d))}, not its header ${JSON.stringify({ x: c.x, y: c.y })}`);
        }
        for (const r of c.rows) {
          const rowWire = rows.find((w) => w.to === `row:${r.id}`);
          if (!rowWire) problems.push(`no wire to row ${r.id}`);
          else if (!near(endOf(rowWire.d), r)) problems.push(`row ${r.id}'s wire ends at ${JSON.stringify(endOf(rowWire.d))}, not ${JSON.stringify(r)}`);
        }
      }
      return problems;
    })
    .toEqual([]);
}

/** What each column's texture has drawn: its total ink, and its pixels, to compare. */
function textures(page: Page): Promise<{ option: string; ink: number; pixels: string }[]> {
  return page.locator(".sm-board .sm-column").evaluateAll((columns) =>
    columns
      .filter((c) => (c as HTMLElement).offsetParent !== null)
      .map((c) => {
        const canvas = c.querySelector<HTMLCanvasElement>(":scope > canvas.sm-texture");
        if (!canvas || !canvas.width || !canvas.height) return { option: (c as HTMLElement).dataset.option ?? "", ink: 0, pixels: "" };
        const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let k = 3; k < data.length; k += 4) ink += data[k]!;
        return { option: (c as HTMLElement).dataset.option ?? "", ink, pixels: canvas.toDataURL() };
      }),
  );
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("A-01: wires run from the question to each option's header and from its lane to each argument row, and follow the layout as it changes", async ({ board }) => {
  const page = await board.open("jordan_w");
  await expectWiresInPlace(page);
  const drawn = await wires(page);
  expect(drawn.filter((wire) => wire.to.startsWith("option:"))).toHaveLength(2);
  expect(drawn.filter((wire) => wire.to.startsWith("row:"))).toHaveLength(6);
  // A small circle where each wire meets the question, a header, or a card.
  await expect(page.locator(".sm-links circle")).toHaveCount(1 + 2 + 6);

  // Unfolding a row widens its column.
  await row(page, SUNDAY).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expectWiresInPlace(page);

  // Opening a card pushes the rows under it down.
  await row(page, STUDY).locator(".sm-claim-button").first().click();
  await expectWiresInPlace(page);

  // History moves the board left on a wide screen.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
  await expectWiresInPlace(page);

  // And a narrower window puts everything somewhere else again.
  await page.setViewportSize({ width: 900, height: 900 });
  await expectWiresInPlace(page);
});

test("A-01 M-03: at 375 px the wire goes to the side shown, and nothing scrolls sideways", async ({ board }) => {
  const page = await board.open("jordan_w", { width: 375 });
  await expectWiresInPlace(page);
  expect((await wires(page)).filter((wire) => wire.to.startsWith("option:"))).toEqual([expect.objectContaining({ to: `option:${board.demo.options.yes}` })]);

  await page.getByRole("tab", { name: /^No/ }).click();
  await expectWiresInPlace(page);
  expect((await wires(page)).filter((wire) => wire.to.startsWith("option:"))).toEqual([expect.objectContaining({ to: `option:${board.demo.options.no}` })]);

  await row(page, "Staff need a guaranteed day off.").getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expectWiresInPlace(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("A-01 M-02 A-07: the wires follow rows combined and deleted, and options added and deleted", async ({ board }) => {
  const page = await board.open("maya.chen");
  const study = await find(board, STUDY);
  const family = await find(board, FAMILY);

  // Someone else combines two rows: the one combined stays in its place, marked, until Update.
  await board.setRole("tess.b", "editor");
  await board.api("tess.b").post(`versions/${study.version}/combine`, { into: family.argument });
  await poll(page);
  await expect(column(page, "Yes").locator(".sm-idea.sm-merged")).toBeVisible();
  await expectWiresInPlace(page);
  await pill(page).getByRole("button", { name: "Update" }).click();
  await expect(column(page, "Yes").locator(".sm-idea")).toHaveCount(2);
  await expectWiresInPlace(page);
  expect((await wires(page)).filter((wire) => wire.to.startsWith("row:"))).toHaveLength(5);

  await page.getByRole("button", { name: "Add an option" }).click();
  await page.getByRole("textbox", { name: "Option name" }).fill("Only in winter");
  await page.getByRole("textbox", { name: "Option name" }).press("Enter");
  await expect(column(page, "Only in winter")).toBeVisible();
  await expectWiresInPlace(page);
  expect((await wires(page)).filter((wire) => wire.to.startsWith("option:"))).toHaveLength(3);

  await page.getByRole("button", { name: "Options for Only in winter" }).click();
  await page.getByRole("menu", { name: "Option settings" }).getByRole("menuitem", { name: /Delete/ }).click();
  await expect(column(page, "Only in winter")).toHaveCount(0);
  await expectWiresInPlace(page);
  expect((await wires(page)).filter((wire) => wire.to.startsWith("option:"))).toHaveLength(2);
});

test("B-07: a hexagon texture sits behind each column, and an importance vote changes it", async ({ board }) => {
  const page = await board.open("jordan_w");
  await expect.poll(async () => (await textures(page)).map((t) => t.ink > 0)).toEqual([true, true]);
  // One canvas per column, behind its rows, covering the column's panel.
  await expect(page.locator(".sm-column > canvas.sm-texture")).toHaveCount(2);
  const before = await textures(page);

  // The least important row on the board becomes less unimportant, which changes every row's share of the honeycomb.
  await importance(page, FEW).getByRole("button", { name: "More important if true" }).click();
  await expect(importance(page, FEW).getByRole("button", { name: "More important if true" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await textures(page)).find((t) => t.option === board.demo.options.no)?.pixels).not.toBe(before.find((t) => t.option === board.demo.options.no)?.pixels);
});

test("A-01 B-07: Strongest case has the wires and the hexagon texture too", async ({ board }) => {
  const page = await board.open("jordan_w");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Strongest case", exact: true }).click();
  await expect(page.locator(".sm-case-column")).toHaveCount(2);
  await expectWiresInPlace(page);
  expect((await wires(page)).filter((wire) => wire.to.startsWith("row:"))).toHaveLength(6);
  await expect.poll(async () => (await textures(page)).map((t) => t.ink > 0)).toEqual([true, true]);
});

for (const width of [1280, 375]) {
  test(`A-01 B-07 M-04: the wires and textures are hidden from screen readers, can't be focused or clicked, and pass the accessibility scan at ${width} px`, async ({ board }) => {
    const page = await board.open("jordan_w", { width });
    await row(page, SUNDAY).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
    await expectWiresInPlace(page);

    const layers = page.locator(".sm-links, .sm-texture");
    expect(await layers.count()).toBeGreaterThan(1);
    for (const layer of await layers.all()) {
      await expect(layer).toHaveAttribute("aria-hidden", "true");
      await expect(layer).not.toHaveAttribute("tabindex");
      await expect(layer).toHaveCSS("pointer-events", "none");
    }
    // Nothing inside them is focusable, or named.
    expect(await page.locator(".sm-links *").evaluateAll((parts) => parts.filter((part) => part.matches("a, [tabindex], [focusable='true'], title, desc")).length)).toBe(0);
    // Neither takes the cursor, even when asked to.
    expect(
      await layers.evaluateAll((all) =>
        all.filter((layer) => {
          (layer as HTMLElement).focus();
          return document.activeElement === layer || (layer as HTMLElement).tabIndex >= 0;
        }).length,
      ),
    ).toBe(0);
    // A click where a wire runs reaches the board under it.
    const lane = await page.locator(".sm-links path[data-to^='spine:']").first().evaluate((path) => {
      const b = path.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".sm-links, .sm-texture") ?? null, lane)).toBeNull();

    await expectNoAxeViolations(page);
  });
}

test("A-01 B-07: with reduced motion, the wires and textures are drawn at once, and nothing about them animates", async ({ board }) => {
  const page = await board.open("jordan_w");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await expectWiresInPlace(page);
  await expect.poll(async () => (await textures(page)).map((t) => t.ink > 0)).toEqual([true, true]);

  await row(page, SUNDAY).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expectWiresInPlace(page);
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => (animation.effect as KeyframeEffect | null)?.target?.closest(".sm-links, .sm-texture")).length)).toBe(0);
});
