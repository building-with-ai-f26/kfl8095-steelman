// Question wording hints (F-02), in the browser: New steelman shows the
// prototype's hints between the question and the options as the person
// types. They never stop the board being made, and nothing is sent.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const WHY = "A question that starts with “Why” assumes an answer. Try starting it with “Should”.";
const YES_NO = "Name options as positions, not Yes or No.";

async function sheet(board: TestBoard, width = 1280): Promise<Page> {
  const page = await board.open("lin.zhao", { width });
  await page.goto("/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
  return page;
}

const question = (page: Page) => page.getByRole("textbox", { name: "Question" });
const option = (page: Page, n: number) => page.getByRole("textbox", { name: `Option ${n}` });
const hints = (page: Page) => page.locator("ul.sm-create-hints");

test("F-02: a question that starts with Why shows its hint, and changing it removes the hint", async ({ board }) => {
  const page = await sheet(board);

  await question(page).fill("Why should our school start later?");
  await expect(hints(page).getByRole("listitem")).toHaveText([WHY]);
  await expect(hints(page)).toHaveAttribute("aria-live", "polite");

  await question(page).fill("Should our school start later?");
  await expect(hints(page).getByRole("listitem")).toHaveCount(0);
});

test("F-02: the hints sit between the question and the options", async ({ board }) => {
  const page = await sheet(board);

  await question(page).fill("Why should our school start later?");
  const q = await question(page).boundingBox();
  const list = await hints(page).boundingBox();
  const first = await option(page, 1).boundingBox();
  expect(q!.y + q!.height).toBeLessThanOrEqual(list!.y);
  expect(list!.y + list!.height).toBeLessThanOrEqual(first!.y);
});

test("F-02: an option named No shows its hint", async ({ board }) => {
  const page = await sheet(board);

  await question(page).fill("Should our school start later?");
  await option(page, 2).fill("No");
  await expect(hints(page).getByRole("listitem")).toHaveText([YES_NO]);
});

test("F-02: with hints showing, Create steelman still makes the board, and the hints send nothing", async ({ board }) => {
  const page = await sheet(board);
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) sent.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });

  await question(page).fill("Why is this clearly better?");
  await option(page, 1).fill("Yes");
  await option(page, 2).fill("No");
  await expect(hints(page).getByRole("listitem")).toHaveCount(3);
  expect(sent).toEqual([]);

  await page.getByRole("button", { name: "Create steelman" }).click();
  await expect(page).toHaveURL(/\/b\/[A-Za-z0-9_-]{12}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Why is this clearly better?");
});

test("F-02: the empty sheet shows no hints and the list takes no room", async ({ board }) => {
  const page = await sheet(board);

  await expect(hints(page).getByRole("listitem")).toHaveCount(0);
  // Still in the page, so that the first hint is read out when it appears.
  await expect(hints(page)).toHaveCount(1);
  const box = await hints(page).boundingBox();
  expect(box === null || box.height <= 1).toBe(true);
});

for (const width of [1280, 375]) {
  test(`F-02, M-04: with hints showing, the sheet passes an accessibility scan at ${width} px with no sideways scroll`, async ({ board }) => {
    const page = await sheet(board, width);

    await question(page).fill("Why is this obviously the best plan for everyone at our school?");
    await option(page, 1).fill("Yes");
    await expect(hints(page).getByRole("listitem")).toHaveCount(3);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
