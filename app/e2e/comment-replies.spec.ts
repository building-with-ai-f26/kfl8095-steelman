// Replies, resolving, and deleting your own comment, on the board (M3b-12,
// D-01). Each comment carries the prototype's small text buttons in its order
// (steelman-refined.html, commentItem): Reply on an open thread's first
// comment, Resolve or Reopen on the first comment, and Delete on your own.
// Reply opens the prototype's inline form. Resolved threads fold under the
// prototype's "N resolved" toggle. Delete asks first, inside the panel, as
// Google Docs and GitHub ask before a comment goes. comments.spec.ts, which
// covers reading and adding, is left as it was.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { status } from "./support/screen.ts";

const panel = (page: Page) => page.getByRole("dialog", { name: "Comments" });
const mainBox = (page: Page) => panel(page).getByRole("textbox", { name: /^Add a comment on this / });
const replyBox = (page: Page) => panel(page).getByRole("textbox", { name: "Your reply" });
const replyForm = (page: Page) => panel(page).locator(".sm-reply-form");
const sendReply = (page: Page) => replyForm(page).getByRole("button", { name: "Reply", exact: true });
const questionBubble = (page: Page) => page.locator(".sm-head").getByRole("button", { name: /comments? on this question$/i });
/** A comment in the panel, by its author as the panel names them and a piece of its text. */
const comment = (page: Page, by: string, text: string): Locator => panel(page).getByRole("article", { name: `Comment by ${by}` }).filter({ hasText: text });
/** A comment's own buttons: Reply, Resolve or Reopen, and Delete. */
const action = (item: Locator, name: string): Locator => item.locator(".sm-comment-actions").getByRole("button", { name, exact: true });
const toggle = (page: Page) => panel(page).getByRole("button", { name: /^\d+ resolved$/ });
const confirmation = (page: Page) => panel(page).getByRole("group", { name: "Delete this comment?" });

type Person = Parameters<TestBoard["api"]>[0];

/** A comment on the question, as this person, through the API. Answers its ID. */
async function commentOnQuestion(board: TestBoard, as: Person, body: string): Promise<string> {
  const id = board.ids.itemId();
  await board.api(as).post("comments", { id, body });
  return id;
}

/** A reply to a thread on the question, as this person, through the API. */
async function replyOnQuestion(board: TestBoard, as: Person, parentId: string, body: string): Promise<string> {
  const id = board.ids.itemId();
  await board.api(as).post("comments", { id, parentId, body });
  return id;
}

/** Opens Comments on the question. */
async function openQuestion(page: Page): Promise<void> {
  await questionBubble(page).click();
  await expect(panel(page)).toBeVisible();
}

/** Moves the page's clock on to its next request for changes, and lets the answer arrive. */
async function poll(page: Page): Promise<void> {
  const answered = page.waitForResponse((response) => response.url().includes("/changes?"));
  await page.clock.runFor(3_000);
  await answered;
}

/** Presses Tab (or Shift + Tab) until this control has the focus. */
async function tabTo(page: Page, target: Locator, key: "Tab" | "Shift+Tab" = "Tab"): Promise<void> {
  for (let presses = 0; presses < 300 && !(await target.evaluate((element) => element === document.activeElement)); presses++) await page.keyboard.press(key);
  await expect(target).toBeFocused();
}

for (const width of [1280, 375]) {
  test(`D-01: at ${width} px, a reply appears under its thread for both people and raises the count, with focus back on Reply`, async ({ board }) => {
    const first = "Do other libraries open on Sundays?";
    await commentOnQuestion(board, "omar_h", first);
    const writer = await board.open("jordan_w", { width });
    const reader = await board.open("lin.zhao", { width });
    await openQuestion(reader);
    await openQuestion(writer);

    const theirs = comment(writer, "omar_h", first);
    await action(theirs, "Reply").click();
    await expect(replyBox(writer)).toBeFocused();
    await expect(replyBox(writer)).toHaveAttribute("placeholder", "Reply");
    await expect(replyForm(writer).getByRole("button", { name: "Cancel" })).toBeVisible();
    await replyBox(writer).fill("Two of the four in the county do.");
    await sendReply(writer).click();

    await expect(status(writer)).toHaveText("Your reply was added.");
    await expect(action(theirs, "Reply")).toBeFocused();
    await expect(replyBox(writer)).toHaveCount(0);
    const thread = panel(writer).locator(".sm-comments-body > .sm-thread").filter({ hasText: first });
    await expect(thread.getByRole("article", { name: "Comment by You" })).toContainText("Two of the four in the county do.");
    await expect(thread.getByRole("article", { name: "Comment by You" })).toHaveClass(/sm-reply/);
    await expect(questionBubble(writer)).toHaveAccessibleName("2 comments on this question");

    await poll(reader);
    await expect(questionBubble(reader)).toHaveAccessibleName("2 comments on this question");
    const theirThread = panel(reader).locator(".sm-comments-body > .sm-thread").filter({ hasText: first });
    await expect(theirThread.getByRole("article", { name: "Comment by jordan_w" })).toContainText("Two of the four in the county do.");
    await expect(theirThread.locator(".sm-reply.sm-comment-new")).toHaveCount(1);
  });
}

test("D-01: Escape in the reply box closes only the reply and returns focus to Reply; the next Escape closes the panel", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  const theirs = comment(page, "omar_h", "Do other libraries open on Sundays?");
  await action(theirs, "Reply").click();
  await replyBox(page).fill("Half a thought.");

  await page.keyboard.press("Escape");
  await expect(replyBox(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(action(theirs, "Reply")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
});

test("D-01: Cancel closes the reply form and returns focus to Reply", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  const theirs = comment(page, "omar_h", "Do other libraries open on Sundays?");
  await action(theirs, "Reply").click();
  await replyForm(page).getByRole("button", { name: "Cancel" }).click();
  await expect(replyBox(page)).toHaveCount(0);
  await expect(action(theirs, "Reply")).toBeFocused();
});

test("D-01: an empty reply isn't sent and says why", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  await action(comment(page, "omar_h", "Do other libraries open on Sundays?"), "Reply").click();
  await replyBox(page).fill("   ");
  await sendReply(page).click();

  await expect(replyForm(page).getByText("Write a reply first.")).toBeVisible();
  await expect(status(page)).toHaveText("Write a reply first.");
  await expect(replyBox(page)).toHaveAttribute("aria-invalid", "true");
  await expect(replyBox(page)).toBeFocused();
  await expect(panel(page).getByRole("article")).toHaveCount(1);
});

for (const width of [1280, 375]) {
  test(`D-01: at ${width} px, Resolve folds the thread and lowers the count for both, the toggle shows it, and Reopen brings it back`, async ({ board }) => {
    await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
    await commentOnQuestion(board, "tess.b", "What would the staff cost be?");
    const page = await board.open("jordan_w", { width });
    const reader = await board.open("lin.zhao", { width });
    await openQuestion(reader);
    await openQuestion(page);
    await expect(questionBubble(page)).toHaveAccessibleName("2 comments on this question");

    await action(comment(page, "omar_h", "Sundays"), "Resolve").click();
    await expect(status(page)).toHaveText("The thread is resolved. It is under Resolved.");
    await expect(mainBox(page)).toBeFocused();
    await expect(comment(page, "omar_h", "Sundays")).toHaveCount(0);
    await expect(comment(page, "tess.b", "staff cost")).toBeVisible();
    await expect(toggle(page)).toHaveText("1 resolved");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(questionBubble(page)).toHaveAccessibleName("1 comment on this question");

    await poll(reader);
    await expect(questionBubble(reader)).toHaveAccessibleName("1 comment on this question");
    await expect(comment(reader, "omar_h", "Sundays")).toHaveCount(0);
    await expect(toggle(reader)).toHaveText("1 resolved");

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    const resolved = comment(page, "omar_h", "Sundays");
    await expect(resolved).toBeVisible();
    await expect(panel(page).locator(".sm-thread.sm-resolved")).toContainText("Do other libraries open on Sundays?");
    // A resolved thread takes no replies, so its first comment offers Reopen and no Reply.
    await expect(action(resolved, "Reply")).toHaveCount(0);
    await action(resolved, "Reopen").click();

    await expect(status(page)).toHaveText("The thread is open again.");
    await expect(mainBox(page)).toBeFocused();
    await expect(toggle(page)).toHaveCount(0);
    await expect(action(comment(page, "omar_h", "Sundays"), "Resolve")).toBeVisible();
    await expect(questionBubble(page)).toHaveAccessibleName("2 comments on this question");
    await poll(reader);
    await expect(questionBubble(reader)).toHaveAccessibleName("2 comments on this question");
    await expect(comment(reader, "omar_h", "Sundays")).toBeVisible();
  });
}

test("D-01: with every thread resolved, the panel says so above the toggle, not the empty line", async ({ board }) => {
  const id = await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  await board.api("tess.b").put(`comments/${id}/resolved`, {});
  const page = await board.open("jordan_w");
  await openQuestion(page);

  const said = panel(page).getByText("Every comment here is resolved.");
  await expect(said).toBeVisible();
  await expect(panel(page).getByText("There are no comments yet.")).toHaveCount(0);
  await expect(toggle(page)).toHaveText("1 resolved");
  const [line, button] = [(await said.boundingBox())!, (await toggle(page).boundingBox())!];
  expect(line.y + line.height).toBeLessThanOrEqual(button.y + 0.5);
  await expect(questionBubble(page)).toHaveAccessibleName("Comment on this question");
});

test("D-01: only your own comments offer Delete, in the prototype's order after Reply and Resolve", async ({ board }) => {
  const theirs = await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  await replyOnQuestion(board, "jordan_w", theirs, "Two of the four in the county do.");
  await commentOnQuestion(board, "jordan_w", "Who would staff it?");
  const page = await board.open("jordan_w");
  await openQuestion(page);

  const names = (item: Locator) => item.locator(".sm-comment-actions").getByRole("button").allInnerTexts();
  expect(await names(comment(page, "omar_h", "Sundays"))).toEqual(["Reply", "Resolve"]);
  expect(await names(comment(page, "You", "Two of the four"))).toEqual(["Delete"]);
  expect(await names(comment(page, "You", "Who would staff it?"))).toEqual(["Reply", "Resolve", "Delete"]);
});

for (const width of [1280, 375]) {
  test(`D-01: at ${width} px, Delete asks first, inside the panel, and Cancel keeps the comment with focus back on Delete`, async ({ board }) => {
    await commentOnQuestion(board, "jordan_w", "Who would staff it?");
    const page = await board.open("jordan_w", { width });
    await openQuestion(page);
    const mine = comment(page, "You", "Who would staff it?");

    await action(mine, "Delete").click();
    await expect(confirmation(page)).toBeVisible();
    await expect(confirmation(page).getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(confirmation(page).getByRole("button", { name: "Cancel" })).toBeFocused();
    await confirmation(page).getByRole("button", { name: "Cancel" }).click();

    await expect(confirmation(page)).toHaveCount(0);
    await expect(mine).toBeVisible();
    await expect(action(mine, "Delete")).toBeFocused();
    await expect(questionBubble(page)).toHaveAccessibleName("1 comment on this question");

    // Escape cancels it too, and leaves the panel open.
    await action(mine, "Delete").click();
    await page.keyboard.press("Escape");
    await expect(confirmation(page)).toHaveCount(0);
    await expect(panel(page)).toBeVisible();
    await expect(action(mine, "Delete")).toBeFocused();
  });
}

test("D-01: when someone resolves a thread meanwhile, an open Delete question stays with the cursor, and a focused Resolve hands the cursor to the comment box", async ({ board }) => {
  const mine = await commentOnQuestion(board, "jordan_w", "Who would staff it?");
  const theirs = await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  await openQuestion(page);

  await action(comment(page, "You", "Who would staff it?"), "Delete").click();
  await expect(confirmation(page).getByRole("button", { name: "Cancel" })).toBeFocused();
  await board.api("lin.zhao").put(`comments/${mine}/resolved`, {});
  await poll(page);
  await expect(toggle(page)).toHaveCount(0);
  await expect(confirmation(page).getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(mainBox(page)).toBeFocused();
  await expect(toggle(page)).toHaveText("1 resolved");

  await action(comment(page, "omar_h", "Sundays"), "Resolve").focus();
  await board.api("lin.zhao").put(`comments/${theirs}/resolved`, {});
  await poll(page);
  await expect(comment(page, "omar_h", "Sundays")).toHaveCount(0);
  await expect(mainBox(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
});

test("D-01: deleting a reply removes it, with focus in the comment box, and the count drops for the other reader on poll", async ({ board }) => {
  const first = await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  await replyOnQuestion(board, "jordan_w", first, "Two of the four in the county do.");
  const page = await board.open("jordan_w");
  const reader = await board.open("lin.zhao");
  await openQuestion(reader);
  await openQuestion(page);
  await expect(questionBubble(page)).toHaveAccessibleName("2 comments on this question");

  await action(comment(page, "You", "Two of the four"), "Delete").click();
  await confirmation(page).getByRole("button", { name: "Delete" }).click();

  await expect(status(page)).toHaveText("Your comment was deleted.");
  await expect(mainBox(page)).toBeFocused();
  await expect(comment(page, "You", "Two of the four")).toHaveCount(0);
  await expect(comment(page, "omar_h", "Sundays")).toBeVisible();
  await expect(questionBubble(page)).toHaveAccessibleName("1 comment on this question");

  await poll(reader);
  await expect(questionBubble(reader)).toHaveAccessibleName("1 comment on this question");
  await expect(comment(reader, "jordan_w", "Two of the four")).toHaveCount(0);
});

test("D-01: deleting a first comment with replies leaves its line, with no buttons, and the replies", async ({ board }) => {
  const first = await commentOnQuestion(board, "jordan_w", "Who would staff it?");
  await replyOnQuestion(board, "omar_h", first, "The volunteers could.");
  const page = await board.open("jordan_w");
  const reader = await board.open("lin.zhao");
  await openQuestion(reader);
  await openQuestion(page);

  await action(comment(page, "You", "Who would staff it?"), "Delete").click();
  await confirmation(page).getByRole("button", { name: "Delete" }).click();

  await expect(status(page)).toHaveText("Your comment was deleted.");
  await expect(mainBox(page)).toBeFocused();
  const gone = panel(page).getByRole("article", { name: "Deleted comment" });
  await expect(gone).toContainText("This comment was deleted.");
  await expect(gone.getByRole("button")).toHaveCount(0);
  await expect(comment(page, "omar_h", "The volunteers could.")).toBeVisible();
  await expect(questionBubble(page)).toHaveAccessibleName("1 comment on this question");

  await poll(reader);
  await expect(panel(reader).getByRole("article", { name: "Deleted comment" })).toContainText("This comment was deleted.");
  await expect(panel(reader).getByRole("article", { name: "Deleted comment" }).getByRole("button")).toHaveCount(0);
  await expect(comment(reader, "omar_h", "The volunteers could.")).toBeVisible();
  await expect(questionBubble(reader)).toHaveAccessibleName("1 comment on this question");
});

test("D-01: deleting a first comment with no replies removes its thread, and the panel says there are none", async ({ board }) => {
  await commentOnQuestion(board, "jordan_w", "Who would staff it?");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  await action(comment(page, "You", "Who would staff it?"), "Delete").click();
  await confirmation(page).getByRole("button", { name: "Delete" }).click();

  await expect(status(page)).toHaveText("Your comment was deleted.");
  await expect(panel(page).getByRole("article")).toHaveCount(0);
  await expect(panel(page).getByText("There are no comments yet.")).toBeVisible();
  await expect(questionBubble(page)).toHaveAccessibleName("Comment on this question");
});

test("D-01: a reply to a thread someone just resolved isn't added, says why, and the draft stays", async ({ board }) => {
  const id = await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  await action(comment(page, "omar_h", "Sundays"), "Reply").click();
  await replyBox(page).fill("Two of the four in the county do.");
  // No poll runs until the reply is sent, so the form is still open when Reply is pressed.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  await board.api("lin.zhao").put(`comments/${id}/resolved`, {});
  await sendReply(page).click();

  await expect(replyForm(page).getByText("This thread was resolved, so your reply wasn’t added.")).toBeVisible();
  await expect(status(page)).toHaveText("This thread was resolved, so your reply wasn’t added.");
  await expect(replyBox(page)).toHaveValue("Two of the four in the county do.");
  expect(board.errors.splice(0)).toEqual(["jordan_w: Failed to load resource: the server responded with a status of 409 (Conflict)"]);

  // The draft stays through the next poll too, beside the thread's Reopen, which lets it be sent.
  await poll(page);
  await expect(replyBox(page)).toHaveValue("Two of the four in the county do.");
  await action(comment(page, "omar_h", "Sundays"), "Reopen").click();
  await expect(status(page)).toHaveText("The thread is open again.");
  await sendReply(page).click();
  await expect(status(page)).toHaveText("Your reply was added.");
  await expect(comment(page, "You", "Two of the four")).toBeVisible();
});

test("D-01: offline, a reply isn't sent, the form says so, and the text stays in the box", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  await action(comment(page, "omar_h", "Sundays"), "Reply").click();
  await page.route("**/comments", (route) => route.abort("internetdisconnected"));
  await replyBox(page).fill("Sent from the train.");
  await sendReply(page).click();

  await expect(replyForm(page).getByText("You’re offline, so your reply wasn’t sent. It is still in the box.")).toBeVisible();
  await expect(replyBox(page)).toHaveValue("Sent from the train.");

  // Back online, the same text is sent once.
  await page.unroute("**/comments");
  await sendReply(page).click();
  await expect(status(page)).toHaveText("Your reply was added.");
  await expect(panel(page).getByRole("article", { name: "Comment by You" })).toHaveCount(1);
});

test("D-01: a reply that reached the service but whose answer was lost is added once when sent again", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  await action(comment(page, "omar_h", "Sundays"), "Reply").click();
  // The reply is stored, and then the connection drops before its answer comes back.
  await page.route("**/comments", async (route) => {
    await route.fetch();
    await route.abort("internetdisconnected");
  });
  await replyBox(page).fill("Sent from the tunnel.");
  await sendReply(page).click();
  await expect(replyForm(page).getByText("You’re offline, so your reply wasn’t sent. It is still in the box.")).toBeVisible();

  // Sent again with the same text, it carries the same ID, so the service adds it only once.
  await page.unroute("**/comments");
  await sendReply(page).click();
  await expect(status(page)).toHaveText("Your reply was added.");
  await poll(page);
  await expect(panel(page).getByRole("article", { name: "Comment by You" })).toHaveCount(1);
  await expect(questionBubble(page)).toHaveAccessibleName("2 comments on this question");
  const snapshot = (await board.api("omar_h").snapshot()) as { comments?: { body: string | null }[] };
  expect((snapshot.comments ?? []).filter((row) => row.body === "Sent from the tunnel.")).toHaveLength(1);
});

test("D-01, M-08: the reply box and a reply's text are kept out of PostHog's autocapture", async ({ board }) => {
  const first = await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  await replyOnQuestion(board, "tess.b", first, "Two of the four in the county do.");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  await action(comment(page, "omar_h", "Sundays"), "Reply").click();

  await expect(replyBox(page)).toHaveClass(/ph-no-capture/);
  await expect(comment(page, "tess.b", "Two of the four").getByText("Two of the four in the county do.")).toHaveClass(/ph-no-capture/);
});

test("D-01, I-05: on a closed board, replying, resolving, and deleting your own comment still work, unfaded", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  await board.api("maya.chen").put("closed", {});
  const page = await board.open("jordan_w");
  await openQuestion(page);
  const theirs = comment(page, "omar_h", "Sundays");
  await expect(action(theirs, "Reply")).not.toHaveAttribute("data-blocked");

  await action(theirs, "Reply").click();
  await replyBox(page).fill("Will it open again in spring?");
  await sendReply(page).click();
  await expect(status(page)).toHaveText("Your reply was added.");

  await action(comment(page, "You", "spring"), "Delete").click();
  await confirmation(page).getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Your comment was deleted.");

  await action(theirs, "Resolve").click();
  await expect(status(page)).toHaveText("The thread is resolved. It is under Resolved.");
});

test("D-01, M-04: by keyboard only, by name: Reply, Ctrl + Enter, Resolve, the toggle, Reopen, and Delete with its confirmation", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  const page = await board.open("jordan_w");
  const bubble = page.getByRole("button", { name: "1 comment on this question", exact: true });
  await tabTo(page, bubble);
  await page.keyboard.press("Enter");
  await expect(mainBox(page)).toBeFocused();

  const theirs = comment(page, "omar_h", "Sundays");
  await tabTo(page, action(theirs, "Reply"), "Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(replyBox(page)).toBeFocused();
  await page.keyboard.type("Typed without a mouse.");
  await page.keyboard.press("Control+Enter");
  await expect(status(page)).toHaveText("Your reply was added.");
  await expect(action(theirs, "Reply")).toBeFocused();

  const mine = comment(page, "You", "Typed without a mouse.");
  await tabTo(page, action(mine, "Delete"));
  await page.keyboard.press("Enter");
  await expect(confirmation(page).getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirmation(page).getByRole("button", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Your comment was deleted.");
  await expect(mainBox(page)).toBeFocused();

  await tabTo(page, action(theirs, "Resolve"), "Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("The thread is resolved. It is under Resolved.");
  await expect(mainBox(page)).toBeFocused();

  await tabTo(page, toggle(page), "Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await tabTo(page, action(theirs, "Reopen"));
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("The thread is open again.");
  await expect(mainBox(page)).toBeFocused();
});

/** Watches the page for folding copies: what each was like when it came, and how many are still there. */
async function watchFolding(page: Page): Promise<() => Promise<{ seen: { hidden: string | null; inert: boolean; ids: number }[]; left: number }>> {
  await page.evaluate(() => {
    const record: { seen: { hidden: string | null; inert: boolean; ids: number }[] } = { seen: [] };
    (window as unknown as { folding: typeof record }).folding = record;
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes)
          if (node instanceof HTMLElement && node.classList.contains("sm-folding")) record.seen.push({ hidden: node.getAttribute("aria-hidden"), inert: node.inert, ids: node.querySelectorAll("[id]").length + (node.id ? 1 : 0) });
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => ({ ...(window as unknown as { folding: { seen: { hidden: string | null; inert: boolean; ids: number }[] } }).folding, left: document.querySelectorAll(".sm-folding").length }));
}

test("D-01: a resolved thread folds away as a copy hidden from screen readers that then goes, and with reduced motion it just goes", async ({ board }) => {
  await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
  await commentOnQuestion(board, "tess.b", "What would the staff cost be?");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  let folding = await watchFolding(page);
  await action(comment(page, "omar_h", "Sundays"), "Resolve").click();
  await expect(status(page)).toHaveText("The thread is resolved. It is under Resolved.");
  await expect.poll(async () => (await folding()).seen).toEqual([{ hidden: "true", inert: true, ids: 0 }]);
  await expect.poll(async () => (await folding()).left).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  folding = await watchFolding(page);
  await action(comment(page, "tess.b", "staff cost"), "Resolve").click();
  await expect(status(page)).toHaveText(/^The thread is resolved\. It is under Resolved\.\u00a0?$/);
  await expect(comment(page, "tess.b", "staff cost")).toHaveCount(0);
  expect(await folding()).toEqual({ seen: [], left: 0 });
});

for (const width of [1280, 375]) {
  test(`D-01, M-04: no accessibility violations with a reply form open, with the delete confirmation open, and with resolved threads shown, and no sideways scroll, at ${width} px`, async ({ board }) => {
    const first = await commentOnQuestion(board, "omar_h", "Do other libraries open on Sundays?");
    await replyOnQuestion(board, "jordan_w", first, "Two of the four in the county do.");
    const done = await commentOnQuestion(board, "tess.b", "What would the staff cost be?");
    await board.api("tess.b").put(`comments/${done}/resolved`, {});
    const page = await board.open("jordan_w", { width });
    await openQuestion(page);
    const scan = async () => {
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };

    await action(comment(page, "omar_h", "Sundays"), "Reply").click();
    await expect(replyBox(page)).toBeVisible();
    await scan();
    await replyForm(page).getByRole("button", { name: "Cancel" }).click();

    await action(comment(page, "You", "Two of the four"), "Delete").click();
    await expect(confirmation(page)).toBeVisible();
    await scan();
    await confirmation(page).getByRole("button", { name: "Cancel" }).click();

    await toggle(page).click();
    await expect(comment(page, "tess.b", "staff cost")).toBeVisible();
    await scan();
  });
}
