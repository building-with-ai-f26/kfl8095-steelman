// The list (E-03, M2-7), from the prototype's feed (renderHome and post in
// docs/prototype/source/steelman-refined.html): the home page lists the
// boards you're on, the most recently changed first, each with its question,
// its options and how many arguments each has, your role, and how long ago it
// changed. New steelman is a button on it, and the sheet has its own address.
// Spaces, comments, and who's here come later and don't appear.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { signInByCode, test as siteTest } from "./support/sign-in.ts";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;
const QUESTION = "Should our library open on Sundays?";
const HOUR = 3_600_000;

const list = (page: Page): Locator => page.getByRole("list", { name: "Your steelmen" });
const posts = (page: Page): Locator => list(page).locator(":scope > li");
const questions = (page: Page): Locator => posts(page).getByRole("heading", { level: 2 });

/** A test account's browser on the home page. */
async function home(board: TestBoard, person: Parameters<TestBoard["open"]>[0] = "jordan_w", width = 1280): Promise<Page> {
  const page = await board.open(person, { width });
  await page.goto("/");
  await expect(list(page)).toBeVisible();
  return page;
}

/** Makes a board through the API as this person, and returns its ID. */
async function makeBoard(board: TestBoard, person: Parameters<TestBoard["open"]>[0], question: string, access = { general: "link", linkRole: "contributor" }): Promise<string> {
  const answer = (await board.api(person).post("../../boards", { question, options: ["Stay open", "Close at nine"], access })) as { board: string };
  return answer.board;
}

test("E-03: the home page lists the boards you're on: the question, each option with how many arguments it has, your role, and how long ago it changed", async ({ board }) => {
  board.clock.advance(3 * HOUR);
  const page = await home(board);

  await expect(questions(page)).toHaveText([QUESTION]);
  const post = posts(page).first();
  await expect(post.getByRole("list", { name: "Options and how many arguments each has" }).getByRole("listitem")).toHaveText(["Yes3", "No3"]);
  await expect(post.locator(".sm-post-meta .sm-tag")).toHaveText("can contribute");
  await expect(post.locator("time")).toHaveText("Updated 3h ago");
});

test("E-03: the board's question is a link that opens it", async ({ board }) => {
  const page = await home(board);

  await questions(page).getByRole("link", { name: QUESTION }).click();

  await expect(page).toHaveURL(new RegExp(`/b/${board.demo.board}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
});

test("E-03: the Owner sees Owner, and the most recently changed board comes first: a vote moves a board to the top", async ({ board }) => {
  board.clock.advance(HOUR);
  await makeBoard(board, "maya.chen", "Should the café stay open late?");
  const page = await home(board, "maya.chen");
  await expect(questions(page)).toHaveText(["Should the café stay open late?", QUESTION]);
  await expect(posts(page).locator(".sm-post-meta .sm-tag")).toHaveText(["Owner", "Owner"]);

  board.clock.advance(HOUR);
  const snapshot = await board.api("tess.b").snapshot();
  await board.api("tess.b").put(`arguments/${snapshot.arguments[0].id}/importance`, { value: 1 });
  await page.reload();

  await expect(questions(page)).toHaveText([QUESTION, "Should the café stay open late?"]);
  await expect(posts(page).first().locator("time")).toHaveText("Updated just now");
});

test("E-03: a board you aren't on never appears, even one open to anyone with the link", async ({ board }) => {
  await makeBoard(board, "maya.chen", "Should the café stay open late?", { general: "invited", linkRole: "contributor" });
  await makeBoard(board, "maya.chen", "Should the gym open at six?");

  const page = await home(board);

  await expect(questions(page)).toHaveText([QUESTION]);
});

test("E-03, H-02: a board you came into by the link appears once you've opened it, and leaves when the owner turns the link off", async ({ board }) => {
  board.clock.advance(HOUR);
  const café = await makeBoard(board, "maya.chen", "Should the café stay open late?");
  const page = await board.open("jordan_w");
  await page.goto(`/b/${café}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should the café stay open late?");

  await page.goto("/");
  await expect(questions(page)).toHaveText(["Should the café stay open late?", QUESTION]);

  await board.api("maya.chen").put(`../${café}/access`, { general: "invited", linkRole: "contributor" });
  await page.reload();
  await expect(questions(page)).toHaveText([QUESTION]);
});

test("E-03, F-01: New steelman is a button in the top bar of the list; it opens the sheet at its own address, and the new board then heads the list", async ({ board }) => {
  board.clock.advance(HOUR);
  const page = await home(board);

  await page.getByRole("link", { name: "New steelman" }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
  await page.getByRole("textbox", { name: "Question" }).fill("Should our school start an hour later?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Start later");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Keep the time");
  await page.getByRole("button", { name: "Create steelman" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our school start an hour later?");

  await page.goBack();
  await page.goBack();
  await expect(questions(page)).toHaveText(["Should our school start an hour later?", QUESTION]);
  await expect(posts(page).first().locator(".sm-post-meta .sm-tag")).toHaveText("Owner");
});

siteTest("E-03: with no boards yet, the list says so and offers New steelman", async ({ site }) => {
  const page = await site.browse();
  await page.goto("/");
  await page.getByLabel("Email").fill("new.person@example.test");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  await page.getByLabel("Code").fill(site.codeFor("new.person@example.test"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Username").fill("new_person");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator(".sm-feed-empty")).toContainText("No steelmen yet.");
  await page.locator(".sm-feed-empty").getByRole("link", { name: "New steelman" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
});

siteTest("E-03: someone who signs in from a board's link finds it in their list", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, "lee.visitor@example.test", "lee_visitor");

  await page.goto("/");

  await expect(questions(page)).toHaveText([QUESTION]);
  await expect(posts(page).locator(".sm-post-meta .sm-tag")).toHaveText("can contribute");
});

for (const size of SIZES) {
  test(`E-03, M-04: the list passes an accessibility scan, and looks as saved, at ${size.name} width`, async ({ board }) => {
    board.clock.advance(HOUR);
    await makeBoard(board, "maya.chen", "Should the café stay open late?");
    board.clock.advance(2 * HOUR);
    const page = await home(board, "maya.chen", size.width);
    await expect(posts(page)).toHaveCount(2);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await expect(page).toHaveScreenshot(`list-${size.name}.png`);
  });
}
