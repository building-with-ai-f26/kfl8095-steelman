// M3a-9, the no-access screen (H-02, M-06): someone who opens the link of a
// board they aren't invited to sees a card, the one "This steelman doesn't
// exist" uses, that says which account they're signed in with and offers two
// ways on: Your steelmen, or signing in with another account, which brings
// them back to the same link. Against the real service with sign-in turned on
// (support/sign-in.ts), so the email shown is the one a person signed in
// with; and once as a test account, which has a username and no email.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect as boardExpect, test as boardTest } from "./support/board.ts";
import { QUESTION, expect, signInByCode, test } from "./support/sign-in.ts";
import type { SignInSite } from "./support/sign-in.ts";

const VISITOR = "lee.visitor@example.test";
const MEMBER = "sam.member@example.test";
const LEAD = "Sunday is the only free day for many people who work weekdays.";

const card = (page: Page): Locator => page.getByRole("region", { name: "No access" });
const another = (page: Page): Locator => page.getByRole("button", { name: "Sign in with another account" });

/** Signs in by email code on the page as it is, without going anywhere first, choosing a username if one is given. */
async function signInHere(site: SignInSite, page: Page, email: string, username?: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  // The code is read once it has been sent, not before (an earlier sign-in's would still be in the outbox).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  await page.getByLabel("Code").fill(site.codeFor(email));
  await page.getByRole("button", { name: "Sign in" }).click();
  if (username !== undefined) {
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

/** Only invited people can open the demo board from here on. No screen invites anyone yet (M3b), so it's set in the database. */
async function inviteOnly(site: SignInSite): Promise<void> {
  await site.sql("update board set general_access = 'invited' where id = $1", [site.demo.board]);
}

/** Someone who isn't a member opens the board's link, signs in by code, and is shown the card. */
async function visitorAt(site: SignInSite, link: string, width = 1280): Promise<Page> {
  const page = await site.browse({ width });
  await page.goto(link);
  await signInHere(site, page, VISITOR, "lee_visitor");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You need access");
  return page;
}

for (const width of [1280, 375]) {
  test(`M3a-9, H-02, M-06, M-04: someone who isn't a member opens an invited-only board's link and sees the card, with their email and both ways on, and it passes an accessibility scan, at ${width} px`, async ({ site }) => {
    await inviteOnly(site);

    const page = await visitorAt(site, site.boardPath, width);

    await expect(card(page)).toBeVisible();
    await expect(card(page).getByText("You don’t have access to this steelman.")).toBeVisible();
    await expect(card(page)).toContainText("The owner hasn’t shared it with this account.");
    await expect(card(page)).toContainText(`You’re signed in as ${VISITOR}.`);
    await expect(card(page).getByRole("link", { name: "Go to Your steelmen" })).toHaveAttribute("href", "/");
    await expect(another(page)).toBeVisible();
    // Nothing of the board shows.
    await expect(page.getByText(QUESTION)).toHaveCount(0);
    await expect(page.getByText(LEAD)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll").toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("M3a-9, H-02, M-06: Go to Your steelmen leads to the list", async ({ site }) => {
  await inviteOnly(site);
  const page = await visitorAt(site, site.boardPath);

  await card(page).getByRole("link", { name: "Go to Your steelmen" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your steelmen");
});

test("M3a-9, H-02, M-06, L-04: Sign in with another account signs them out, asks them to sign in, and shows a member the same link", async ({ site }) => {
  // Sam signs in once while the link is open, so they have an account and a username; then the board becomes invited only, with Sam invited.
  const first = await site.browse();
  await signInByCode(site, first, MEMBER, "sam_member");
  const version = await first
    .locator(".sm-card")
    .filter({ has: first.locator(".sm-claim", { hasText: LEAD }) })
    .getAttribute("data-card");
  await site.sql("update board_member set joined_via = 'invite' where board_id = $1 and account_id = (select id from account where username = 'sam_member')", [site.demo.board]);
  await inviteOnly(site);
  const link = `${site.boardPath}/v/${version}`;

  const page = await visitorAt(site, link);
  await expect(card(page)).toContainText(`You’re signed in as ${VISITOR}.`);
  const before = await page.context().cookies();

  await another(page).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  expect(new URL(page.url()).pathname).toBe(link);
  await expect(page.getByText(QUESTION)).toHaveCount(0);
  // The session itself is ended, not only the cookie cleared: the old cookie, sent again from another browser, is refused.
  expect((await page.request.get("/api/account")).status()).toBe(401);
  const replay = await page.context().browser()!.newContext({ baseURL: site.origin });
  await replay.addCookies(before);
  expect((await replay.request.get("/api/account")).status()).toBe(401);
  await replay.close();

  await signInHere(site, page, MEMBER);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
  expect(new URL(page.url()).pathname).toBe(link);
  await expect(page.getByRole("heading", { level: 1, name: "You need access" })).toHaveCount(0);
  // It is Sam's session now.
  expect(((await (await page.request.get("/api/account")).json()) as { username: string }).username).toBe("sam_member");
});

test("M3a-9, H-02, M-06: signing in again as the same person who has no access shows the card again, at the same link", async ({ site }) => {
  await inviteOnly(site);
  const page = await visitorAt(site, site.boardPath);

  await another(page).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await signInHere(site, page, VISITOR);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You need access");
  expect(new URL(page.url()).pathname).toBe(site.boardPath);
  await expect(card(page)).toContainText(`You’re signed in as ${VISITOR}.`);
});

test("M3a-9, H-02, M-06: when the service can't sign them out, the card says so and they stay signed in", async ({ site }) => {
  await inviteOnly(site);
  const page = await visitorAt(site, site.boardPath);
  await page.route("**/api/auth/sign-out", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));

  await another(page).click();

  await expect(card(page).getByRole("alert")).toHaveText("Couldn’t sign you out. Try again.");
  await expect(another(page)).toBeFocused();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You need access");
  expect((await page.request.get("/api/account")).status()).toBe(200);

  // Reachable again, it works.
  await page.unroute("**/api/auth/sign-out");
  await another(page).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
});

test("M3a-9, H-02, L-01: someone reading a board whose owner turns the link off is shown the card", async ({ site }) => {
  const page = await site.browse();
  await signInByCode(site, page, VISITOR, "lee_visitor");

  // As the owner's change does (server/src/sharing.ts): the board is invited only, and the people who came by the
  // link are no longer members. In that order, so a poll in between can't join them by the link again.
  await inviteOnly(site);
  await site.sql("delete from board_member where board_id = $1 and joined_via = 'link'", [site.demo.board]);

  // Their next poll (every 3 s) learns it.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You need access", { timeout: 10_000 });
  await expect(card(page)).toContainText(`You’re signed in as ${VISITOR}.`);
  await expect(page.getByText(LEAD)).toHaveCount(0);
});

boardTest("M3a-9, M-06: a link to a board that doesn't exist still shows “This steelman doesn’t exist”, not the no-access card", async ({ board }) => {
  const page = await board.open("maya.chen", { at: "/b/no-such-board", missingBoards: true });

  await boardExpect(page.getByRole("heading", { level: 1 })).toHaveText("This steelman doesn’t exist");
  await boardExpect(page.getByRole("region", { name: "Not found" })).toBeVisible();
  await boardExpect(card(page)).toHaveCount(0);
  await boardExpect(another(page)).toHaveCount(0);
  await boardExpect(page.getByRole("link", { name: "New steelman" }).last()).toBeVisible();
});

boardTest("M3a-9, H-02: a tab acting as a test account, which has no email, is shown the card with that account's username", async ({ board }) => {
  const theirs = (await board.api("tess.b").post("../../boards", { question: "Should the café open early?", options: ["Yes, at seven", "No, at nine"], access: { general: "invited", linkRole: "contributor" } })) as { board: string };

  const page = await board.open("maya.chen", { at: `/b/${theirs.board}`, closedBoards: true });

  await boardExpect(page.getByRole("heading", { level: 1 })).toHaveText("You need access");
  await boardExpect(card(page)).toContainText("You’re signed in as maya.chen.");
  await boardExpect(page.getByText("Should the café open early?")).toHaveCount(0);
});

test("M3a-9, H-02: for a tab acting as a test account, Sign in with another account stops acting as it and asks them to sign in at the same link", async ({ site }) => {
  // Jordan, one of the demo board's people, is no longer a member, and the board is invited only.
  await inviteOnly(site);
  await site.sql("delete from board_member where board_id = $1 and account_id = $2", [site.demo.board, site.demo.people["jordan_w"]]);
  const page = await site.browse();
  // The switch keeps the choice per tab, in sessionStorage (web/src/testUser.ts). Set once, not on every load, so it can be forgotten.
  await page.goto("/privacy");
  await page.evaluate((id) => sessionStorage.setItem("steelman.testUser", id), site.demo.people["jordan_w"]);
  await page.goto(site.boardPath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You need access");
  await expect(card(page)).toContainText("You’re signed in as jordan_w.");

  await another(page).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  expect(new URL(page.url()).pathname).toBe(site.boardPath);
  expect(await page.evaluate(() => sessionStorage.getItem("steelman.testUser"))).toBeNull();
});
