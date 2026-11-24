// The speech bubbles and the comments panel (M3b-11, D-01): reading and
// adding comments. Each card, each option's header, and the question's header
// carry the prototype's speech bubble with its count (steelman-refined.html,
// commentButton). It opens Comments in the drawer History and Settings use,
// which is fixed to the window, as Figma's and Notion's comment sidebars are.
// The panel quotes its subject, lists the open threads, and ends with the box
// and Comment, which ⌘/Ctrl + Enter also presses, as GitHub's comment box
// does (docs.github.com keyboard shortcuts, read live Nov 24). Comments are
// sent at once, not queued: when one can't be added, its text stays in the box.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { LIMITS } from "../server/src/limits.ts";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { column, find, poll, status } from "./support/screen.ts";

const HOUR = 60 * 60_000;
const LEAD = "Sunday is the only free day for many people who work weekdays.";
const FAMILIES = "Families could visit together on the one day nobody has school or work.";
const FEW = "Few people would come, judging by Saturday afternoons.";
const BUDGET = "Opening a seventh day costs more than the budget allows.";

const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });
const panel = (page: Page) => page.getByRole("dialog", { name: "Comments" });
const box = (page: Page) => panel(page).getByRole("textbox");
const send = (page: Page) => panel(page).getByRole("button", { name: "Comment", exact: true });
const questionBubble = (page: Page) => page.locator(".sm-head").getByRole("button", { name: /comments? on this question$/i });
const optionBubble = (page: Page, option: string) => column(page, option).locator(".sm-column-head").getByRole("button", { name: /comments? on this option$/i });
const versionBubble = (page: Page, wording: string) => card(page, wording).getByRole("button", { name: /comments? on this version$/i });

/** A comment on the question, as this person, through the API. */
async function commentOnQuestion(board: TestBoard, as: Parameters<TestBoard["api"]>[0], body: string): Promise<void> {
  await board.api(as).post("comments", { id: board.ids.itemId(), body });
}

test("D-01: each bubble opens Comments on its subject, with the cursor in the box and the subject ringed; the bubble or Escape closes it", async ({ board }) => {
  const page = await board.open("jordan_w");
  const subjects = [
    { bubble: questionBubble(page), name: "Comment on this question", kind: "Question", text: "Should our library open on Sundays?", ringed: page.locator(".sm-head"), box: "Add a comment on this question" },
    { bubble: optionBubble(page, "Yes"), name: "Comment on this option", kind: "Option", text: "Yes", ringed: column(page, "Yes").locator(".sm-column-head"), box: "Add a comment on this option" },
    { bubble: versionBubble(page, LEAD), name: "Comment on this version", kind: "Version", text: LEAD, ringed: card(page, LEAD), box: "Add a comment on this version" },
  ];
  for (const [index, subject] of subjects.entries()) {
    await expect(subject.bubble).toHaveAccessibleName(subject.name);
    await subject.bubble.click();

    await expect(panel(page)).toBeVisible();
    await expect(status(page)).toHaveText(/^The comments panel is open\.\u00a0?$/);
    await expect(subject.bubble).toHaveAttribute("aria-expanded", "true");
    await expect(panel(page).locator("blockquote")).toContainText(subject.kind);
    await expect(panel(page).locator("blockquote")).toContainText(subject.text);
    await expect(panel(page).getByText("There are no comments yet.")).toBeVisible();
    await expect(panel(page).getByRole("textbox", { name: subject.box })).toBeFocused();
    await expect(panel(page).getByRole("textbox", { name: subject.box })).toHaveAttribute("placeholder", "Add a comment");
    await expect(subject.ringed).toHaveClass(/sm-commenting/);

    // The bubble closes it the first time round, Escape the others; either way the cursor goes back to the bubble.
    if (index === 0) await subject.bubble.click();
    else await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(/^The comments panel is closed\.\u00a0?$/);
    await expect(subject.bubble).toBeFocused();
    await expect(subject.ringed).not.toHaveClass(/sm-commenting/);
  }
});

test("D-01: a click on the board outside the panel leaves it open", async ({ board }) => {
  const page = await board.open("jordan_w");
  await questionBubble(page).click();
  await expect(panel(page)).toBeVisible();

  await page.locator(".sm-head h1").click();
  await expect(panel(page)).toBeVisible();
  await expect(status(page)).not.toHaveText(/The comments panel is closed\./);
});

/** A closing panel's copy as it was put on the page: its aria-hidden, its role, and how many IDs it holds. */
type Copy = { hidden: string | null; role: string | null; ids: number };

/** Watches the page for the closing panel's copy: what each was like when it came, and how many are still there. */
async function watchLeaving(page: Page): Promise<() => Promise<{ seen: Copy[]; left: number }>> {
  await page.evaluate(() => {
    const record: { seen: Copy[] } = { seen: [] };
    (window as unknown as { leaving: typeof record }).leaving = record;
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes)
          if (node instanceof HTMLElement && node.classList.contains("sm-leaving")) record.seen.push({ hidden: node.getAttribute("aria-hidden"), role: node.getAttribute("role"), ids: node.querySelectorAll("[id]").length + (node.id ? 1 : 0) });
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => ({ ...(window as unknown as { leaving: { seen: Copy[] } }).leaving, left: document.querySelectorAll(".sm-leaving").length }));
}

test("D-01: the panel fades out as it closes, as a copy hidden from screen readers that then goes, and with reduced motion it just goes", async ({ board }) => {
  const page = await board.open("jordan_w");
  let leaving = await watchLeaving(page);
  await questionBubble(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect.poll(async () => (await leaving()).seen).toEqual([{ hidden: "true", role: null, ids: 0 }]);
  await expect.poll(async () => (await leaving()).left).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  leaving = await watchLeaving(page);
  await questionBubble(page).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  expect(await leaving()).toEqual({ seen: [], left: 0 });
});

test("D-01: a comment keeps the line breaks it was written with", async ({ board }) => {
  const page = await board.open("jordan_w");
  await questionBubble(page).click();
  await box(page).fill("First line.\nSecond line.");
  await send(page).click();

  await expect(status(page)).toHaveText("Your comment was added.");
  const text = panel(page).getByRole("article", { name: "Comment by You" }).locator("p");
  expect(await text.evaluate((element: HTMLElement) => element.innerText)).toBe("First line.\nSecond line.");
});

test("D-01: deleting the wording your open panel is on closes the panel at once and leaves the Undo sentence", async ({ board }) => {
  const page = await board.open("jordan_w");
  await versionBubble(page, BUDGET).click();
  await expect(panel(page)).toBeVisible();

  await card(page, BUDGET).getByRole("button", { name: "Options for this version" }).click();
  await page.getByRole("menu", { name: "Version options" }).getByRole("menuitem", { name: "Delete argument" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("Argument deleted. Undo is available for ten seconds.");

  // Once the delete is sent and polled, the panel doesn't say it was someone else's.
  const answered = page.waitForResponse((response) => response.request().method() === "DELETE");
  await page.clock.runFor(10_000 + 1_000);
  await answered;
  await poll(page);
  await expect(status(page)).not.toHaveText(/its comments are closed/);
});

test("D-01: an empty comment is refused and says why; ⌘/Ctrl + Enter posts one, which the panel shows as yours", async ({ board }) => {
  const page = await board.open("jordan_w");
  await versionBubble(page, LEAD).click();

  await send(page).click();
  await expect(panel(page).getByText("Write a comment first.")).toBeVisible();
  await expect(box(page)).toHaveAttribute("aria-invalid", "true");
  await expect(box(page)).toBeFocused();

  await box(page).fill("Which shifts do they mean?");
  await page.keyboard.press("ControlOrMeta+Enter");

  await expect(status(page)).toHaveText("Your comment was added.");
  const mine = panel(page).getByRole("article", { name: "Comment by You" });
  await expect(mine).toContainText("Which shifts do they mean?");
  await expect(mine.locator(".sm-avatar")).toHaveText("JW");
  await expect(box(page)).toHaveValue("");
  await expect(box(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(versionBubble(page, LEAD)).toHaveAccessibleName("1 comment on this version");
  await expect(versionBubble(page, LEAD)).toHaveText("1");
});

test("D-01: the other reader's count goes up on their next poll, and their open panel shows the comment with its author and time", async ({ board }) => {
  const writer = await board.open("jordan_w");
  const reader = await board.open("lin.zhao");
  await optionBubble(reader, "No").click();

  await optionBubble(writer, "No").click();
  await box(writer).fill("Is the budget figure from this year?");
  await send(writer).click();
  await expect(status(writer)).toHaveText("Your comment was added.");

  await poll(reader);
  await expect(optionBubble(reader, "No")).toHaveAccessibleName("1 comment on this option");
  const theirs = panel(reader).getByRole("article", { name: "Comment by jordan_w" });
  // It arrived while the panel was open, so it rises in.
  await expect(panel(reader).locator(".sm-thread.sm-comment-new")).toContainText("Is the budget figure from this year?");
  await expect(theirs).toContainText("jordan_w");
  await expect(theirs).toContainText("Is the budget figure from this year?");
  const time = theirs.locator("time");
  await expect(time).toHaveAttribute("datetime", board.clock.now().toISOString());
  await expect(time).toHaveAttribute("title", /November 16, 2026/);
  await expect(time).not.toBeEmpty();
  await expect(panel(reader).getByText("There are no comments yet.")).toHaveCount(0);
});

test("D-01, H-03: a Viewer can comment", async ({ board }) => {
  await board.setRole("omar_h", "viewer");
  const page = await board.open("omar_h");
  await versionBubble(page, LEAD).click();
  await box(page).fill("I read this one twice.");
  await send(page).click();

  await expect(status(page)).toHaveText("Your comment was added.");
  await expect(panel(page).getByRole("article", { name: "Comment by You" })).toContainText("I read this one twice.");
});

test("D-01, I-05: a comment is accepted on a closed board, and the box isn't faded", async ({ board }) => {
  await board.api("maya.chen").put("closed", {});
  const page = await board.open("jordan_w");
  await questionBubble(page).click();

  await expect(box(page)).toBeEditable();
  await expect(box(page)).not.toHaveAttribute("data-blocked");
  await expect(questionBubble(page)).not.toHaveAttribute("data-blocked");
  await box(page).fill("Will it open again in spring?");
  await send(page).click();
  await expect(status(page)).toHaveText("Your comment was added.");
});

test("D-01: a draft is kept for each subject, through closing the panel, opening another subject, and opening History", async ({ board }) => {
  const page = await board.open("jordan_w");
  await versionBubble(page, LEAD).click();
  await box(page).fill("A first thought.");
  await panel(page).getByRole("button", { name: "Close comments" }).click();
  await expect(panel(page)).toHaveCount(0);

  await questionBubble(page).click();
  await expect(box(page)).toHaveValue("");
  await box(page).fill("About the question.");
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);

  await versionBubble(page, LEAD).click();
  await expect(box(page)).toHaveValue("A first thought.");
  await questionBubble(page).click();
  await expect(box(page)).toHaveValue("About the question.");
});

test("D-01: offline, the comment isn't sent, the panel says so, and the text stays in the box", async ({ board }) => {
  const page = await board.open("jordan_w");
  await versionBubble(page, LEAD).click();
  await page.route("**/comments", (route) => route.abort("internetdisconnected"));
  await box(page).fill("Sent from the train.");
  await send(page).click();

  await expect(panel(page).getByText("You’re offline, so your comment wasn’t sent. It is still in the box.")).toBeVisible();
  await expect(box(page)).toHaveValue("Sent from the train.");
  await expect(panel(page).getByRole("article")).toHaveCount(0);

  // Back online, the same text is sent once.
  await page.unroute("**/comments");
  await send(page).click();
  await expect(status(page)).toHaveText("Your comment was added.");
  await expect(panel(page).getByRole("article")).toHaveCount(1);
});

test.describe("one comment an hour", () => {
  test.use({ limits: { ...LIMITS, comment: { most: 1, windowMs: HOUR } } });

  test("D-01, M-12: at the limit, the panel says how long to wait, and the text stays in the box", async ({ board }) => {
    const page = await board.open("jordan_w");
    await questionBubble(page).click();
    await box(page).fill("The first one.");
    await send(page).click();
    await expect(status(page)).toHaveText("Your comment was added.");

    await box(page).fill("The second one.");
    await send(page).click();
    await expect(panel(page).getByText("Too many in a row. Try again in 60 minutes.")).toBeVisible();
    await expect(box(page)).toHaveValue("The second one.");
    board.errors.splice(0);
  });
});

test("D-01: a comment on a wording deleted meanwhile isn't added, says why, and the text stays in the box", async ({ board }) => {
  const { version } = await find(board, FAMILIES);
  const page = await board.open("jordan_w");
  await versionBubble(page, FAMILIES).click();
  await box(page).fill("Which families?");
  // No poll runs until the comment is sent, so the panel is still open when Comment is pressed.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  await board.api("tess.b").delete(`versions/${version}`);
  await send(page).click();

  await expect(panel(page).getByText("This wording was removed, so your comment wasn’t added.")).toBeVisible();
  await expect(box(page)).toHaveValue("Which families?");
  board.errors.splice(0);
});

test("D-01: an open panel closes on the next poll when the other person deletes its wording, and when a moderator hides it", async ({ board }) => {
  const families = await find(board, FAMILIES);
  const few = await find(board, FEW);
  const page = await board.open("jordan_w");

  await versionBubble(page, FAMILIES).click();
  await expect(panel(page)).toBeVisible();
  await board.api("tess.b").delete(`versions/${families.version}`);
  await poll(page);
  await expect(panel(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("This wording was removed, so its comments are closed.");

  await versionBubble(page, FEW).click();
  await expect(panel(page)).toBeVisible();
  await board.api("maya.chen").put(`versions/${few.version}/hidden`, { reason: "spam" });
  await poll(page);
  await expect(panel(page)).toHaveCount(0);
  await expect(status(page)).toHaveText(/^This wording was removed, so its comments are closed\.\u00a0?$/);
});

test("D-01, J-03, I-01: opening History or Settings closes Comments, and opening Comments closes either", async ({ board }) => {
  const page = await board.open("maya.chen");
  const history = page.getByRole("dialog", { name: "History" });
  const settings = page.getByRole("dialog", { name: "Settings" });

  await questionBubble(page).click();
  await page.getByRole("button", { name: "History" }).click();
  await expect(history).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await expect(questionBubble(page)).toHaveAttribute("aria-expanded", "false");

  await versionBubble(page, LEAD).click();
  await expect(panel(page)).toBeVisible();
  await expect(history).toHaveCount(0);

  await page.locator(".sm-head").getByRole("button", { name: "Settings" }).click();
  await expect(settings).toBeVisible();
  await expect(panel(page)).toHaveCount(0);

  await optionBubble(page, "Yes").click();
  await expect(panel(page)).toBeVisible();
  await expect(settings).toHaveCount(0);
  await expect(page.locator(".sm-scene")).toHaveClass(/sm-with-drawer/);
});

for (const width of [1280, 375]) {
  test(`D-01, M-03: at ${width} px, a card's bubble below the fold opens the panel with its box in view, and so does History after scrolling`, async ({ board }) => {
    for (let n = 1; n <= 6; n++) {
      await board.api("jordan_w").post("arguments", { id: board.ids.itemId(), optionId: board.demo.options.yes, versionId: board.ids.itemId(), wording: `Extra reason number ${n} for opening.`, context: "" });
    }
    const page = await board.open("jordan_w", { width });
    const bubble = versionBubble(page, "Extra reason number 6 for opening.");
    await bubble.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await bubble.click();

    await expect(box(page)).toBeInViewport();
    await expect(send(page)).toBeInViewport();
    await expect(panel(page).locator("blockquote")).toBeInViewport();
    await expect(panel(page).locator("blockquote")).toContainText("Extra reason number 6 for opening.");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);

    // History, pressed while the board is scrolled down, opens in view too.
    await page.getByRole("button", { name: "History" }).evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByRole("dialog", { name: "History" })).toBeInViewport();
  });
}

test("D-01, M-08: a comment's text, the quoted subject, and the box are kept out of PostHog's autocapture", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  await questionBubble(page).click();

  const theirs = panel(page).getByRole("article", { name: "Comment by omar_h" });
  await expect(theirs.getByText("Do other libraries open on Sundays?")).toHaveClass(/ph-no-capture/);
  await expect(panel(page).locator("blockquote")).toHaveClass(/ph-no-capture/);
  await expect(box(page)).toHaveClass(/ph-no-capture/);
});

test("D-01, A-02, C-01: a card with no sources shows its bubble and still no source count", async ({ board }) => {
  const page = await board.open("jordan_w");
  await expect(versionBubble(page, LEAD)).toBeVisible();
  await expect(card(page, LEAD).locator(".sm-source-button")).toHaveCount(0);
  // Drawn at full strength, not the prototype's 40%, so its icon keeps 3:1 contrast.
  expect(await versionBubble(page, LEAD).evaluate((button) => getComputedStyle(button).opacity)).toBe("1");
});

test("D-01, M-04: by keyboard only, the question's bubble opens the panel, Ctrl + Enter posts, and Escape goes back", async ({ board }) => {
  const page = await board.open("jordan_w");
  const bubble = page.getByRole("button", { name: "Comment on this question", exact: true });
  for (let presses = 0; presses < 200 && !(await bubble.evaluate((element) => element === document.activeElement)); presses++) await page.keyboard.press("Tab");
  await expect(bubble).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(panel(page).getByRole("textbox", { name: "Add a comment on this question" })).toBeFocused();
  await page.keyboard.type("Typed without a mouse.");
  await page.keyboard.press("Control+Enter");
  await expect(status(page)).toHaveText("Your comment was added.");
  await expect(panel(page).getByRole("article", { name: "Comment by You" })).toContainText("Typed without a mouse.");

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "1 comment on this question", exact: true })).toBeFocused();
});

for (const width of [1280, 375]) {
  test(`D-01, M-04: no accessibility violations with Comments open, and no sideways scroll, at ${width} px`, async ({ board }) => {
    await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
    const page = await board.open("jordan_w", { width });
    await questionBubble(page).click();
    await expect(panel(page).getByRole("article")).toHaveCount(1);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test.describe("in New York's time zone", () => {
  // The closing pill shows the time in the reader's zone, so the screenshot pins it, as the closing specs do.
  test.use({ timezoneId: "America/New_York" });

  test("D-01, I-05, M-03: at 375 px the Owner's header with both pills, History, Settings, and the bubble has nothing overlapping", async ({ board }) => {
    await board.api("maya.chen").put("closing", { closesAt: new Date(board.clock.now().getTime() + HOUR).toISOString() });
    await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
    const page = await board.open("maya.chen", { width: 375 });
    const head = page.locator(".sm-head");
    const parts = [head.locator(".sm-meta-vis .sm-meta-pill"), head.getByRole("button", { name: /^Closes / }), questionBubble(page), head.getByRole("button", { name: "History" }), head.getByRole("button", { name: "Settings" })];
    await expect(questionBubble(page)).toHaveAccessibleName("1 comment on this question");
    const boxes = await Promise.all(parts.map(async (part) => (await part.boundingBox())!));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i]!, boxes[j]!];
        const overlap = a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
        expect(overlap, `parts ${i} and ${j} overlap`).toBe(false);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(head).toHaveScreenshot("comments-head-375.png");
  });
});
