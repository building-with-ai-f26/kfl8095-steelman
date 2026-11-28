// The new version of the privacy page (M-07, M-08, M3d-37): after an audit of
// every claim against the code (tests/build-1-manual.md, November 28), the
// page adds section 6 of plans/reviews/public-spaces-security-review.md with
// the builder's member-list rule (F6), the deletion sentence rewritten for
// M3d-33 (F14), one account per email (M3d-32), the record of a removal
// (M3d-35), suspension (M3d-36), instant space invites, the people a board
// lists (F17), the page addresses logs and PostHog hold (F18), and Cloudflare.
// The sentences the reviews found false are gone. Read signed out, at desktop
// width and at 375 px.

import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";

const SIZES = [1280, 375] as const;

/** A browser session nobody is signed in to, at the same service as the board's. */
async function signedOut(browser: Browser, origin: string, path: string, width: number): Promise<Page> {
  const context = await browser.newContext({ baseURL: origin, viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

/** Each sentence this version adds or changes, in the order the page has them (the first test checks the order). */
const NEW_SENTENCES = [
  // What we collect
  "If you sign in with Google, we also keep the ID that Google gives your account, but not your name or picture.",
  "One email address has one Steelman account, so signing in with Google opens the account that already uses your Google email.",
  "We keep when you made your account and whether you have seen the tour.",
  "We keep the boards you are on, your role on each, and whether you were invited or came by the board’s link.",
  "We keep the spaces you make, the spaces you join and leave, and when.",
  "When an admin removes you from a space, we keep a record of who removed you and when, and you can’t rejoin that space by yourself until an admin invites you back.",
  "If we suspend your account, you are signed out everywhere and can’t sign in again until we lift the suspension. What you wrote stays on its boards. We keep when we suspended your account, even after the account is deleted.",
  "Each time Steelman emails a code, or tells an address that another account already uses it, it records a hash of that email address and the time, so that it can limit how many emails one address gets.",
  "To limit how many codes are sent, Steelman counts the code requests from each network address for an hour, in memory only, and never saves that address.",
  "We don’t record your IP address or your browser with your sign-in.",
  "Google Cloud logs each request to Steelman with your IP address, your browser, and the address of the page.",
  "For each request, Steelman’s own log records only which part of Steelman it asked for, how it ended, and how long it took. It records no IDs.",
  "When something goes wrong, the log also records the error and where in Steelman’s code it happened. Steelman removes any email address from the errors that sign-in logs.",
  "When we suspend an account or lift a suspension, our log records its username. When we make a space private, our log records the space’s ID.",
  // Who sees what
  "In a private space, every member sees the usernames of the other members and how many members it has.",
  "Anyone can make a Steelman account, so anyone can find a public space and join it.",
  "Every signed-in account sees a public space’s name, about text, canvas, and how many members it has.",
  "In a public space, only its admins and owner see its member list. Other members see your username only where you write and on the boards you are on.",
  "Everyone in a space opens the steelmen shared with the space, with their history, comments, and the names of the people on them.",
  "When the owner makes a private space public, everything above opens to anyone who joins, including what members wrote before.",
  "Your profile shows anyone who joins a public space what you wrote on that space’s steelmen.",
  "Leaving a space doesn’t remove what you wrote on its steelmen.",
  "An admin of a space can add you to it by your username without asking you first. You can leave any space you don’t own at any time.",
  "Everyone who can open a board sees the usernames of everyone on it, whether they were invited or came by its link.",
  // Who processes it for us
  "Google tells us your email and the ID of your Google account if you sign in with Google.",
  "When your email changes, Resend also sends your old address a note that names your new one.",
  "Cloudflare manages our web addresses. If you visit our old address or the www address, Cloudflare sees that visit and sends you on to Steelman.",
  // Cookies and analytics
  "Replays also hide usernames where boards, spaces, profiles, and Your account show them, and they hide space names, comments, sources, and the wordings on cards.",
  "They show a board’s question and the context of a card you open.",
  "A replay can still show your username where a message repeats it, such as the request to type it before you delete your account.",
  "The address of each page you visit goes to PostHog, and it includes the IDs of the boards, wordings, comments, and spaces you open. A profile’s address goes without its username.",
  "While your analytics are on, our service also tells PostHog each time you vote, assess, or save an argument, a wording, or a source, because the browser’s own analytics are sometimes blocked.",
  "Each of these events says only what was saved and whether it came from the real site, our test site, or a developer’s computer.",
  // How long we keep it
  "We delete each record of an email we sent at the first daily clean-up after the record is 24 hours old.",
  "On our test site, the daily clean-up runs only when the site is updated, so codes, sessions, records of emails, and held usernames can stay there longer than this list says.",
  "Google Cloud keeps request logs, which hold your IP address, your browser, and the address of each page you visit, for 30 days. It keeps Steelman’s own log for 30 days too.",
  "The database can also be restored to any moment in the last 7 days.",
  "The block that keeps you out of a space ends when an admin invites you back or when you delete your account. The space’s record of changes keeps the removal, even after the space is deleted. After you delete your account, that record shows deleted_account instead of you.",
  // Your choices
  "It also signs you out everywhere and deletes your reports.",
  "A board you own in a space passes to the space’s owner, or else to its longest-standing admin. Otherwise the board passes to its longest-standing editor, or else to its longest-standing contributor. If no one can take it, the board is deleted with everything on it.",
  "A space you own passes to its longest-standing admin, or else to the longest-standing member the space invited. A space with no one left to take it is deleted.",
  // Changes to this page
  "This version, from November 28, 2026, adds what happens in public spaces, when an admin removes you from a space, and when we suspend an account. It also says that one email address has one account, names Cloudflare as a service we use, and says what our logs and analytics hold. It corrects what happens to your boards and spaces when you delete your account.",
];

/** The sentences the re-review found false (F6, F10, F14), and the review of this version (Nov 28). */
const GONE = [
  "No one outside the space sees either.",
  "A board you own passes to its longest-standing contributor.",
  "on the steelmen you’re invited to",
  "without any IDs, how the request ended",
  "on our test site each time it is updated",
  "until an admin invites you back or you delete your account",
];

for (const width of SIZES) {
  test(`M-07, M-08: signed out at ${width} px, the new privacy page holds each new sentence and its new date, and the false sentences are gone`, async ({ board, browser }) => {
    const origin = new URL((await board.open("jordan_w")).url()).origin;
    const page = await signedOut(browser, origin, "/privacy", width);
    const main = page.locator("main");

    await expect(page.locator(".sm-privacy-date")).toHaveText("Updated November 28, 2026");
    for (const sentence of NEW_SENTENCES) await expect(main).toContainText(sentence);
    // In the order this list has them, which is the page's order.
    const text = (await main.innerText()).replace(/\s+/g, " ");
    const at = NEW_SENTENCES.map((sentence) => text.indexOf(sentence));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    for (const sentence of GONE) await expect(main).not.toContainText(sentence);
    // Cloudflare is named as a processor, as the other four are.
    await expect(page.getByRole("heading", { name: "Who processes it for us" }).locator("xpath=following-sibling::ul[1]").locator("b", { hasText: "Cloudflare" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("M-07, M-08: every line on the privacy page starts with a capital and ends with a full stop, and holds the new sentences (rule 13)", async ({ board, browser }) => {
  const origin = new URL((await board.open("jordan_w")).url()).origin;
  const page = await signedOut(browser, origin, "/privacy", 1280);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");

  // The date line is a label, as GitHub's "Effective date" is; everything else said on the page is a sentence.
  const lines = (await page.locator("main li, main p:not(.sm-privacy-date)").allInnerTexts()).map((line) => line.replace(/\s+/g, " ").trim());
  expect(lines.length).toBeGreaterThan(20);
  const fragments = lines.filter((line) => !/^[A-Z0-9]/.test(line) || !/[.]$/.test(line));
  expect(fragments).toEqual([]);
  // Each new sentence is inside one of those lines, so the check above covers it. Whether each line is a plain,
  // complete sentence is checked by reading (tests/build-1-manual.md, November 28).
  const outside = NEW_SENTENCES.filter((sentence) => !lines.some((line) => line.includes(sentence)));
  expect(outside).toEqual([]);
});
