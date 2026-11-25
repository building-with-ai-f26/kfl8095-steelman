// Hiding and restoring a comment (M3b-14; D-01, J-02), with two people, as
// the prototype does it (steelman-refined.html, commentItem): an Editor or
// the Owner sees Hide last among someone else's comment's buttons. Hide puts
// the report reasons and Cancel in place of the buttons, as the wording
// menu's "Hide it as" does and as GitHub's "Hide comment" asks for a reason
// (from memory). Everyone else sees "A moderator removed this comment as
// spam." in its place, and never its text; Editors and the Owner see the text
// struck through, with Restore. History says who hid and restored it, and
// links to it. comments.spec.ts, comment-replies.spec.ts, and
// comment-links.spec.ts are left as they were; their helpers are copied here.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { poll, status } from "./support/screen.ts";

const TEXT = "Do other libraries open on Sundays?";

const panel = (page: Page) => page.getByRole("dialog", { name: "Comments" });
const questionBubble = (page: Page) => page.locator(".sm-head").getByRole("button", { name: /comments? on this question$/i });
/** A comment in the panel, by its author as the panel names them. */
const comment = (page: Page, by: string): Locator => panel(page).getByRole("article", { name: `Comment by ${by}` });
const buttons = (item: Locator): Locator => item.locator(".sm-comment-actions").getByRole("button");
const action = (item: Locator, name: string): Locator => item.locator(".sm-comment-actions").getByRole("button", { name, exact: true });
const reasons = (item: Locator): Locator => item.getByRole("group", { name: "Hide it as" });
const sentence = (item: Locator): Locator => item.locator(".sm-comment-deleted");
const struck = (item: Locator): Locator => item.locator(".sm-removed-claim");
const historyPanel = (page: Page) => page.getByRole("dialog", { name: "History" });
const entries = (page: Page) => historyPanel(page).getByRole("listitem");

type Person = Parameters<TestBoard["api"]>[0];

/** A comment on the question, as this person, through the API. Answers its ID. */
async function commentOnQuestion(board: TestBoard, as: Person, body = TEXT): Promise<string> {
  const id = board.ids.itemId();
  await board.api(as).post("comments", { id, body });
  return id;
}

async function openQuestion(page: Page): Promise<void> {
  await questionBubble(page).click();
  await expect(panel(page)).toBeVisible();
}

for (const width of [1280, 375]) {
  test(`D-01, J-02: at ${width} px, an Editor hides someone else's comment as spam, the other reader sees the sentence on the next poll, and Restore brings it back for both`, async ({ board }) => {
    await commentOnQuestion(board, "omar_h");
    await board.setRole("jordan_w", "editor");
    const editor = await board.open("jordan_w", { width });
    const reader = await board.open("lin.zhao", { width });
    await openQuestion(editor);
    await openQuestion(reader);
    const theirs = comment(editor, "omar_h");
    await expect(buttons(theirs)).toHaveText(["Reply", "Resolve", "Link", "Hide"]);

    await action(theirs, "Hide").click();
    await expect(reasons(theirs).getByRole("button")).toHaveText(["Spam", "Abusive", "Off-topic", "Something else", "Cancel"]);
    await expect(reasons(theirs).getByRole("button", { name: "Cancel" })).toBeFocused();
    await reasons(theirs).getByRole("button", { name: "Spam" }).click();

    await expect(status(editor)).toHaveText("The comment is hidden.");
    await expect(action(theirs, "Restore")).toBeFocused();
    await expect(buttons(theirs)).toHaveText(["Restore"]);
    await expect(sentence(theirs)).toHaveText("A moderator removed this comment as spam.");
    await expect(struck(theirs)).toHaveText(TEXT);
    await expect(struck(theirs)).toHaveClass(/ph-no-capture/);
    await expect(struck(theirs)).toHaveCSS("text-decoration-line", "line-through");

    await poll(reader);
    const seen = comment(reader, "omar_h");
    await expect(sentence(seen)).toHaveText("A moderator removed this comment as spam.");
    await expect(panel(reader).getByText(TEXT)).toHaveCount(0);
    await expect(buttons(seen)).toHaveCount(0);
    await expect(questionBubble(reader)).toHaveAccessibleName("1 comment on this question");

    await action(theirs, "Restore").click();
    await expect(status(editor)).toHaveText("The comment is restored.");
    await expect(action(theirs, "Hide")).toBeFocused();
    await expect(theirs.locator("p").first()).toHaveText(TEXT);
    await expect(sentence(theirs)).toHaveCount(0);

    await poll(reader);
    await expect(seen.locator("p").first()).toHaveText(TEXT);
    await expect(buttons(seen)).toHaveText(["Reply", "Resolve", "Link"]);
  });
}

test("D-01, J-02: each reason has its own sentence, and Something else names none", async ({ board }) => {
  for (const [reason, body] of [["spam", "One."], ["abuse", "Two."], ["offtopic", "Three."], ["other", "Four."]] as const) {
    const id = await commentOnQuestion(board, "omar_h", body);
    await board.api("maya.chen").put(`comments/${id}/hidden`, { reason });
  }
  const reader = await board.open("lin.zhao");
  await openQuestion(reader);

  // Added in the same second, so the panel orders them by ID, not as added: each sentence is looked for on its own.
  await expect(panel(reader).locator(".sm-comment-deleted")).toHaveCount(4);
  for (const said of [
    "A moderator removed this comment as spam.",
    "A moderator removed this comment as abusive.",
    "A moderator removed this comment as off-topic.",
    "A moderator removed this comment.",
  ]) {
    await expect(panel(reader).getByText(said, { exact: true })).toHaveClass(/sm-comment-deleted/);
  }
  for (const body of ["One.", "Two.", "Three.", "Four."]) await expect(panel(reader).getByText(body)).toHaveCount(0);
});

test("D-01, J-02, H-03: Hide is offered only to an Editor or the Owner, on someone else's comment, and neither Hide nor Restore on a closed board", async ({ board }) => {
  await commentOnQuestion(board, "omar_h");
  await commentOnQuestion(board, "maya.chen", "What would the staff cost be?");
  const hidden = await commentOnQuestion(board, "tess.b", "Which survey is this from?");
  await board.api("maya.chen").put(`comments/${hidden}/hidden`, { reason: "offtopic" });

  const contributor = await board.open("jordan_w");
  await openQuestion(contributor);
  await expect(panel(contributor).getByRole("button", { name: "Hide", exact: true })).toHaveCount(0);
  await expect(panel(contributor).getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);

  const owner = await board.open("maya.chen");
  await openQuestion(owner);
  await expect(buttons(comment(owner, "omar_h"))).toHaveText(["Reply", "Resolve", "Link", "Hide"]);
  await expect(buttons(comment(owner, "You"))).toHaveText(["Reply", "Resolve", "Link", "Delete"]);
  await expect(buttons(comment(owner, "tess.b"))).toHaveText(["Restore"]);

  await board.api("maya.chen").put("closed", {});
  const closed = await board.open("maya.chen");
  await openQuestion(closed);
  await expect(buttons(comment(closed, "omar_h"))).toHaveText(["Reply", "Resolve", "Link"]);
  await expect(struck(comment(closed, "tess.b"))).toHaveText("Which survey is this from?");
  await expect(buttons(comment(closed, "tess.b"))).toHaveCount(0);
});

test("D-01, J-02: Escape puts the reasons away and returns focus to Hide, and so does Cancel; the next Escape closes the panel", async ({ board }) => {
  await commentOnQuestion(board, "omar_h");
  await board.setRole("jordan_w", "editor");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  const theirs = comment(page, "omar_h");

  await action(theirs, "Hide").click();
  await page.keyboard.press("Escape");
  await expect(reasons(theirs)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(action(theirs, "Hide")).toBeFocused();

  await action(theirs, "Hide").click();
  await reasons(theirs).getByRole("button", { name: "Cancel" }).click();
  await expect(reasons(theirs)).toHaveCount(0);
  await expect(action(theirs, "Hide")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
});

test("D-01, J-02: the reasons are put away when someone else deletes the comment meanwhile, and the thread stays", async ({ board }) => {
  const id = await commentOnQuestion(board, "omar_h");
  await board.api("lin.zhao").post("comments", { id: board.ids.itemId(), parentId: id, body: "Some open late on Thursdays." });
  await board.setRole("jordan_w", "editor");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  await action(comment(page, "omar_h"), "Hide").click();
  await expect(reasons(comment(page, "omar_h"))).toBeVisible();

  await board.api("omar_h").delete(`comments/${id}`);
  await poll(page);

  // The reply keeps the thread, so the deleted comment stays in its place, and the reasons are gone from it.
  const gone = panel(page).getByRole("article", { name: "Deleted comment" });
  await expect(gone).toContainText("This comment was deleted.");
  await expect(panel(page).getByRole("group", { name: "Hide it as" })).toHaveCount(0);
  await expect(comment(page, "lin.zhao")).toBeVisible();
  await expect(panel(page).getByRole("textbox", { name: /^Add a comment on this / })).toBeFocused();
});

test("D-01, J-02: the reasons are put away when another moderator hides the comment meanwhile, and don't come back when it's restored", async ({ board }) => {
  const id = await commentOnQuestion(board, "omar_h");
  await board.setRole("jordan_w", "editor");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  const theirs = comment(page, "omar_h");
  await action(theirs, "Hide").click();
  await expect(reasons(theirs)).toBeVisible();

  await board.api("maya.chen").put(`comments/${id}/hidden`, { reason: "spam" });
  await poll(page);
  await expect(reasons(theirs)).toHaveCount(0);
  await expect(buttons(theirs)).toHaveText(["Restore"]);

  await board.api("maya.chen").delete(`comments/${id}/hidden`);
  await poll(page);
  await expect(buttons(theirs)).toHaveText(["Reply", "Resolve", "Link", "Hide"]);
  await expect(reasons(theirs)).toHaveCount(0);
});

test("D-01, J-02, H-03: the reasons are put away when the board closes meanwhile", async ({ board }) => {
  await commentOnQuestion(board, "omar_h");
  await board.setRole("jordan_w", "editor");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  const theirs = comment(page, "omar_h");
  await action(theirs, "Hide").click();
  await expect(reasons(theirs)).toBeVisible();

  await board.api("maya.chen").put("closed", {});
  await poll(page);
  await expect(reasons(theirs)).toHaveCount(0);
  await expect(buttons(theirs)).toHaveText(["Reply", "Resolve", "Link"]);
});

test("D-01, J-02: Hide on a resolved thread's comment keeps the thread under the resolved toggle, with the cursor on Cancel and then on Restore", async ({ board }) => {
  const id = await commentOnQuestion(board, "omar_h");
  await board.api("lin.zhao").put(`comments/${id}/resolved`, {});
  await board.setRole("jordan_w", "editor");
  const page = await board.open("jordan_w");
  await openQuestion(page);
  const toggle = panel(page).getByRole("button", { name: "1 resolved" });
  await toggle.click();
  const underToggle = panel(page).locator(".sm-resolved-toggle ~ .sm-thread");
  const theirs = comment(page, "omar_h");
  await expect(underToggle).toContainText(TEXT);

  await action(theirs, "Hide").click();
  await expect(reasons(theirs).getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(underToggle.getByRole("group", { name: "Hide it as" })).toBeVisible();
  await expect(panel(page).getByText("Every comment here is resolved.")).toBeVisible();

  await reasons(theirs).getByRole("button", { name: "Spam" }).click();
  await expect(action(theirs, "Restore")).toBeFocused();
  await expect(toggle).toBeVisible();
  await expect(underToggle).toContainText("A moderator removed this comment as spam.");
});

test("D-01, J-02, J-03: History says who hid a comment and why, and who restored it, and its link opens the comment", async ({ board }) => {
  const id = await commentOnQuestion(board, "omar_h");
  await board.api("maya.chen").put(`comments/${id}/hidden`, { reason: "spam" });
  await board.api("maya.chen").delete(`comments/${id}/hidden`);
  const page = await board.open("lin.zhao");
  await page.getByRole("button", { name: "History" }).click();
  await expect(historyPanel(page)).toBeVisible();

  await expect(entries(page).nth(0)).toContainText("maya.chen restored a comment.");
  await expect(entries(page).nth(1)).toContainText("maya.chen hid a comment as spam.");
  await expect(entries(page).nth(0).getByRole("button", { name: /Restore/ })).toHaveCount(0);
  const link = entries(page).nth(1).getByRole("link", { name: "a comment" });
  await expect(link).toHaveAttribute("href", `/b/${board.demo.board}/c/${id}`);

  await link.click();
  await expect(historyPanel(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(comment(page, "omar_h")).toBeFocused();
  await expect(comment(page, "omar_h")).toContainText(TEXT);
});

test("D-01, J-02, M-06: a hidden comment's link lands on it, where its sentence shows", async ({ board }) => {
  const id = await commentOnQuestion(board, "omar_h");
  await board.api("maya.chen").put(`comments/${id}/hidden`, { reason: "abuse" });
  const page = await board.open("lin.zhao");
  await page.goto(`/b/${board.demo.board}/c/${id}`);

  await expect(panel(page)).toBeVisible();
  await expect(comment(page, "omar_h")).toBeFocused();
  await expect(sentence(comment(page, "omar_h"))).toHaveText("A moderator removed this comment as abusive.");
  await expect(page.locator(".sm-link-note")).toHaveCount(0);
});

for (const width of [1280, 375]) {
  test(`D-01, J-02, M-04: no accessibility violations with the reasons open and with a hidden comment, for an Editor and for a Contributor, and no sideways scroll, at ${width} px`, async ({ board }) => {
    await commentOnQuestion(board, "omar_h");
    const hidden = await commentOnQuestion(board, "tess.b", "Which survey is this from?");
    await board.api("maya.chen").put(`comments/${hidden}/hidden`, { reason: "spam" });
    await board.setRole("jordan_w", "editor");
    const scan = async (page: Page) => {
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };

    const editor = await board.open("jordan_w", { width });
    await openQuestion(editor);
    await expect(struck(comment(editor, "tess.b"))).toBeVisible();
    await scan(editor);
    await action(comment(editor, "omar_h"), "Hide").click();
    await expect(reasons(comment(editor, "omar_h"))).toBeVisible();
    // The reasons rise in; the scan waits until they have, so it checks them as they're read.
    await reasons(comment(editor, "omar_h")).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    await scan(editor);

    const reader = await board.open("lin.zhao", { width });
    await openQuestion(reader);
    await expect(sentence(comment(reader, "tess.b"))).toBeVisible();
    await scan(reader);
  });
}
