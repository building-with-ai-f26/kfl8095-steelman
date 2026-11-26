// Inviting by username, and Remove (M3b-7, H-01), on Share: the Owner adds
// someone by their username at a role, as Google Drive's Add people does,
// and removes a member with a button at the end of their row, as GitHub's
// collaborator rows have.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { POLL_MS, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { status } from "./support/screen.ts";

/** The app's sentence at a limit (tooManyMessage), for half an hour's wait. */
const TOO_MANY = "You’ve done that too many times in a row. Try again in 30 minutes.";

const share = (page: Page) => page.getByRole("dialog", { name: "Share" });
const field = (page: Page) => share(page).getByRole("textbox", { name: "Add people" });
const newRole = (page: Page) => share(page).getByRole("combobox", { name: "Access level for new people" });
const inviteButton = (page: Page) => share(page).getByRole("button", { name: "Invite" });
const fieldError = (page: Page) => share(page).locator("#sm-invite-error");
const people = (page: Page) => share(page).locator(".sm-people > li");

async function openShare(page: Page): Promise<void> {
  await page.locator(".sm-head .sm-meta-vis .sm-meta-pill").click();
  // The panel rises into place; the browser's clock is the test's, so let it play.
  await page.clock.runFor(500);
  await expect(share(page)).toBeVisible();
}

/** Takes lin.zhao off the board through the API, so the Owner can invite them back. */
async function removeLin(board: TestBoard): Promise<void> {
  await board.api("maya.chen").delete(`people/${board.demo.people["lin.zhao"]}`);
}

const inviteOnly = (board: TestBoard) => board.api("maya.chen").put("access", { general: "invited", linkRole: "contributor" });

test("H-01: the Owner invites by the button and by Enter, and the person is on the list, here and after a reload", async ({ board }) => {
  await removeLin(board);
  await board.api("maya.chen").delete(`people/${board.demo.people["omar_h"]}`);
  const page = await board.open("maya.chen");
  await openShare(page);
  await expect(newRole(page)).toHaveValue("contributor");

  await field(page).fill("lin.zhao");
  await inviteButton(page).click();
  await expect(status(page)).toHaveText("lin.zhao can contribute.");
  await expect(people(page).filter({ hasText: "lin.zhao" })).toHaveCount(1);
  await expect(field(page)).toHaveValue("");

  await newRole(page).selectOption("voter");
  await field(page).fill("@Omar_H");
  await field(page).press("Enter");
  await expect(status(page)).toHaveText("omar_h can vote.");
  await expect(people(page).filter({ hasText: "omar_h" }).getByRole("combobox")).toHaveValue("voter");

  await page.reload();
  await openShare(page);
  await expect(people(page).filter({ hasText: "lin.zhao" })).toHaveCount(1);
  await expect(people(page).filter({ hasText: "omar_h" })).toHaveCount(1);
});

test("H-01: each error shows under the field, marks it invalid, is read out, and adds nobody", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openShare(page);
  const count = await people(page).count();

  await inviteButton(page).click();
  await expect(fieldError(page)).toHaveText("Type who you want to add.");
  await expect(fieldError(page)).toHaveAttribute("role", "alert");
  // The same problem again is a new alert, so a screen reader reads it again.
  await fieldError(page).evaluate((element) => element.setAttribute("data-first", ""));
  await field(page).fill("@");
  await inviteButton(page).click();
  await expect(fieldError(page)).toHaveText("Type who you want to add.");
  await expect(fieldError(page)).not.toHaveAttribute("data-first", "");
  await expect(field(page)).toHaveAttribute("aria-invalid", "true");
  await expect(field(page)).toHaveAccessibleDescription("Type who you want to add.");

  await field(page).fill("lin.zhao");
  await expect(fieldError(page)).toHaveCount(0);
  await inviteButton(page).click();
  await expect(fieldError(page)).toHaveText("lin.zhao already has access.");

  await field(page).fill("nobody_here");
  await inviteButton(page).click();
  await expect(fieldError(page)).toHaveText("No one is called nobody_here. Check the username.");
  await expect(field(page)).toHaveAttribute("aria-invalid", "true");
  await expect(people(page)).toHaveCount(count);
  board.errors.splice(0);
});

test("H-01, M-12: the too-many sentence shows on Share at the limit", async ({ board }) => {
  const page = await board.open("maya.chen");
  // The service's own limit is tested on the service (invites.test.ts); here its answer is given.
  await page.route("**/invites", (route) => route.fulfill({ status: 429, headers: { "retry-after": "1800" }, json: { status: "refused", reason: "too_many", retryAfter: 1800 } }));
  await openShare(page);

  await field(page).fill("lin.zhao");
  await inviteButton(page).click();

  await expect(fieldError(page)).toHaveText(TOO_MANY);
  board.errors.splice(0);
});

test("H-01: a person's role menu changes their role, and arrowing through it never removes anyone", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openShare(page);
  const tess = people(page).filter({ hasText: "tess.b" });
  const count = await people(page).count();

  const menu = tess.getByRole("combobox");
  const before = await menu.inputValue();
  const other = before === "editor" ? "voter" : "editor";
  await menu.selectOption(other);
  await expect(menu).toHaveValue(other);
  await expect(people(page)).toHaveCount(count);

  // An arrow key changes the value on Linux and Windows, and opens the menu on macOS; either way no one leaves.
  await menu.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowUp");

  await expect(people(page)).toHaveCount(count);
  await expect(tess).toHaveCount(1);
});

test("H-01: Remove takes the person off, says so, leaves focus in the field, and their open board shows the no-access card on its next poll", async ({ board }) => {
  await inviteOnly(board);
  const lin = await board.open("lin.zhao");
  const page = await board.open("maya.chen");
  await openShare(page);

  await share(page).getByRole("button", { name: "Remove lin.zhao" }).click();

  await expect(people(page).filter({ hasText: "lin.zhao" })).toHaveCount(0);
  await expect(status(page)).toHaveText("lin.zhao no longer has access.");
  await expect(field(page)).toBeFocused();
  await lin.clock.runFor(POLL_MS);
  await expect(lin.getByRole("heading", { name: "You need access" })).toBeVisible();
  expect(board.errors.splice(0)).toEqual(["lin.zhao: Failed to load resource: the server responded with a status of 403 (Forbidden)"]);
});

test("H-01, H-02: removing someone from a board anyone with the link can open says they can still open it", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openShare(page);

  await share(page).getByRole("button", { name: "Remove lin.zhao" }).click();

  await expect(status(page)).toHaveText("lin.zhao no longer has access. lin.zhao can still open this steelman with the link.");
});

test("H-01: with Steelman unreachable, Invite says so", async ({ board }) => {
  await removeLin(board);
  const page = await board.open("maya.chen");
  await page.route("**/invites", (route) => route.abort("internetdisconnected"));
  await openShare(page);

  await field(page).fill("lin.zhao");
  await inviteButton(page).click();

  await expect(fieldError(page)).toHaveText("Couldn’t reach Steelman. Try again.");
  await expect(people(page).filter({ hasText: "lin.zhao" })).toHaveCount(0);
});

test("H-01, I-05: on a closed board the field, the role menu, Invite, and Remove are faded with the sentence", async ({ board }) => {
  await board.api("maya.chen").put("closed", {});
  const page = await board.open("maya.chen");
  await openShare(page);

  for (const control of [field(page), newRole(page), inviteButton(page), share(page).getByRole("button", { name: "Remove lin.zhao" })]) {
    await expect(control).toHaveAttribute("aria-disabled", "true");
    await expect(control).toHaveAttribute("data-tooltip", "This board is closed.");
  }
  await share(page).getByRole("button", { name: "Remove lin.zhao" }).click({ force: true });
  await expect(people(page).filter({ hasText: "lin.zhao" })).toHaveCount(1);
});

test("H-01, J-03: History says who was added at which role, and who was removed", async ({ board }) => {
  await removeLin(board);
  await board.api("maya.chen").post("invites", { username: "lin.zhao", role: "voter" });
  await removeLin(board);
  const page = await board.open("tess.b");

  await page.getByRole("button", { name: "History" }).click();

  const history = page.getByRole("dialog", { name: "History" });
  await expect(history).toContainText("maya.chen added lin.zhao as a voter.");
  await expect(history.locator("li p", { hasText: "maya.chen removed lin.zhao." })).toHaveCount(2);
});

test("H-01: someone who isn't the Owner sees no field and no Remove", async ({ board }) => {
  await board.setRole("tess.b", "editor");
  const page = await board.open("tess.b");
  await openShare(page);

  await expect(field(page)).toHaveCount(0);
  await expect(share(page).getByRole("button", { name: /^Remove / })).toHaveCount(0);
});

test("H-01, M-04: from the keyboard, the field, its role menu, Invite, and each person's Remove are reached by name, in that order", async ({ board }) => {
  const page = await board.open("maya.chen");
  await openShare(page);
  // Each target within a few presses of the one before, so Tab can't have gone round the panel to reach it.
  const order: [Locator, number][] = [[field(page), 60], [newRole(page), 1], [inviteButton(page), 1], [share(page).getByRole("button", { name: "Remove jordan_w" }), 12]];
  for (const [target, most] of order) {
    for (let presses = 0; presses < most && !(await target.evaluate((element) => element === document.activeElement)); presses++) await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
  }
});

for (const width of [1280, 375]) {
  test(`H-01, M-04: Share with the invite row passes an accessibility scan at ${width} px`, async ({ board }) => {
    const page = await board.open("maya.chen", { width });
    await openShare(page);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
