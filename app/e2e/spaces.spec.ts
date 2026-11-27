// Spaces on screen (G-01, G-02, G-05, E-08, M3d-19), from the prototype's
// sidebar, space card, rail, and space settings (sidebar, spaceCard, rail,
// and spaceSettingsMarkup in docs/prototype/source/steelman-refined.html).
// Home gains a sidebar: Home, "Your spaces" with each space's swatch and
// board count, and New space. Under 900 px it folds behind a button named
// "Spaces" in the header. Choosing a space lists only its steelmen, under
// the space's card, with the rail's "Needs your help" on a wide screen. New
// space and a space's Settings make it and run its members. New steelman
// gains a Space menu, and a board in a space shows its space in the top bar
// and takes its canvas. Two people use it at 1280 and 375 px: Maya makes
// the space and invites Jordan, and Jordan finds Maya's board through it.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { TEST_POSTHOG, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const WIDTHS = [1280, 375] as const;
/** A name found nowhere else, so finding it anywhere means a space's name went there. */
const SPACE_NAME = "Quokka pod";
const ABOUT = "Pod 6 tries its steelmen here first.";
const QUESTION = "Should Pod 6 meet on Fridays?";
const THIN = "Should Pod 6 share one notebook?";

const sidebar = (page: Page): Locator => page.getByRole("navigation", { name: "Spaces" });
const toggle = (page: Page): Locator => page.getByRole("button", { name: "Spaces", exact: true });
const list = (page: Page, name = "Your steelmen"): Locator => page.getByRole("list", { name });
const questions = (page: Page, name?: string): Locator => list(page, name).locator(":scope > li").getByRole("heading", { level: 2 });
/** The space's card: in the rail on a wide screen, and above the list otherwise. Only one is drawn at a time. */
const card = (page: Page): Locator => page.getByRole("region", { name: `About ${SPACE_NAME}` }).filter({ visible: true });
const announced = (page: Page): Locator => page.locator(".sm-space-edit .sm-live");

/** Opens the sidebar where it folds behind its button, and waits for it. */
async function openSidebar(page: Page, width: number): Promise<void> {
  if (width < 900) await toggle(page).click();
  await expect(sidebar(page)).toBeVisible();
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  await settled(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Maya makes the space through the API, with jordan_w in it, and puts the demo board in it, shared with everyone there. */
async function spaceWithJordan(board: TestBoard): Promise<string> {
  const space = board.ids.itemId();
  await board.api("maya.chen").post("../../spaces", { id: space, name: SPACE_NAME, about: ABOUT, canvas: "sage" });
  await board.api("maya.chen").post(`../../spaces/${space}/invites`, { username: "jordan_w", role: "member" });
  await board.api("maya.chen").put("space", { space });
  await board.api("maya.chen").put("access", { general: "space", linkRole: "contributor" });
  return space;
}

/** Maya's new board in the space, shared with everyone in it, with no arguments yet. */
async function thinBoard(board: TestBoard, space: string, question = THIN): Promise<string> {
  const made = (await board.api("maya.chen").post("../../boards", { question, options: ["One notebook", "One each"], space, access: { general: "space", linkRole: "contributor" } })) as { board: string };
  return made.board;
}

for (const width of WIDTHS) {
  test(`G-01, G-02, G-05: at ${width} px, Maya makes a space, invites jordan_w by username, and starts a steelman shared with everyone in it, which Jordan finds and opens at its role`, async ({ board }) => {
    const maya = await board.open("maya.chen", { width, at: "/" });
    await expect(list(maya)).toBeVisible();
    await openSidebar(maya, width);
    await sidebar(maya).getByRole("link", { name: "New space" }).click();

    // New space: the hero names it as it's typed, and the limits are the service's.
    await expect(maya.getByRole("main", { name: "New space" })).toBeVisible();
    await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Untitled space");
    const name = maya.getByRole("textbox", { name: "Name" });
    await expect(name).toHaveAttribute("maxlength", "40");
    await expect(maya.getByRole("textbox", { name: "About" })).toHaveAttribute("maxlength", "120");
    await maya.getByRole("button", { name: "Create space" }).click();
    await expect(maya.locator("#sm-space-error")).toHaveText("Name the space.");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toBeFocused();
    await name.fill(SPACE_NAME);
    await expect(maya.getByRole("heading", { level: 1 })).toHaveText(SPACE_NAME);
    await maya.getByRole("textbox", { name: "About" }).fill(ABOUT);
    const sage = maya.getByRole("radiogroup", { name: "Canvas" }).getByRole("radio", { name: "Sage" });
    await sage.click();
    await expect(sage).toHaveAttribute("aria-checked", "true");
    await expect(maya.locator(".sm-space-hero .sm-space-banner")).toHaveAttribute("data-canvas", "sage");
    await maya.getByRole("button", { name: "Create space" }).click();

    // Its settings follow, with its Owner alone in it.
    await expect(maya.getByRole("main", { name: `Settings for ${SPACE_NAME}` })).toBeVisible();
    await expect(announced(maya)).toHaveText(`You made ${SPACE_NAME}. Invite people next.`);
    await expect(maya.getByText("Only members can find and open this space.")).toBeVisible();
    const members = maya.getByRole("region", { name: /^Members/ });
    const people = members.getByRole("list").last().getByRole("listitem");
    await expect(people).toHaveCount(1);
    await expect(people.first()).toContainText("maya.chen (you)");
    await expect(people.first()).toContainText("Owner");
    await expect(people.first()).toContainText("The owner of a space keeps that role.");
    await expect(members.getByRole("combobox", { name: "Role for maya.chen" })).toHaveCount(0);
    await expect(members.getByRole("button", { name: "Remove maya.chen" })).toHaveCount(0);

    // Invite by username, as a Member.
    await members.getByRole("textbox", { name: "Invite by username" }).fill("jordan_w");
    await expect(members.getByRole("combobox", { name: "Role", exact: true })).toHaveValue("member");
    await members.getByRole("button", { name: "Invite" }).click();
    await expect(people).toHaveCount(2);
    await expect(members.getByRole("combobox", { name: "Role for jordan_w" })).toHaveValue("member");
    await expect(members.getByRole("button", { name: "Remove jordan_w" })).toBeVisible();
    await expect(announced(maya)).toHaveText(`jordan_w is now a Member of ${SPACE_NAME}.`);

    // New steelman's Space menu, and General access for everyone in it, at the link's role.
    await maya.goto("/new");
    await maya.getByRole("textbox", { name: "Question" }).fill(QUESTION);
    await maya.getByRole("textbox", { name: "Option 1" }).fill("Fridays");
    await maya.getByRole("textbox", { name: "Option 2" }).fill("Mondays");
    const space = maya.getByRole("combobox", { name: "Space", exact: true });
    await expect(space.getByRole("option")).toHaveText(["None", SPACE_NAME]);
    await expect(maya.getByRole("main")).toHaveAttribute("data-canvas", "cool");
    await space.selectOption({ label: SPACE_NAME });
    const permissions = maya.getByRole("combobox", { name: "Permissions" });
    await expect(permissions).toHaveValue("space");
    await expect(permissions.getByRole("option")).toHaveText([`Everyone in ${SPACE_NAME}`, "Anyone with the link", "Invited only"]);
    await expect(maya.getByRole("main")).toHaveAttribute("data-canvas", "sage");
    await maya.getByRole("combobox", { name: "Space role" }).selectOption("voter");
    await maya.getByRole("button", { name: "Create steelman" }).click();

    // The board shows its space in the top bar, and takes its canvas.
    await expect(maya.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    await expect(maya.locator(".sm-surface")).toHaveAttribute("data-canvas", "sage");
    // On a phone the prototype's CSS leaves the breadcrumb out while a board is open, for the board's own tools.
    if (width === 1280) await expect(maya.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: SPACE_NAME })).toBeVisible();
    else await expect(maya.locator(".sm-crumbs a.sm-tag")).toHaveText(SPACE_NAME);
    const made = new URL(maya.url()).pathname.split("/")[2]!;

    // Jordan finds it without an invitation, under the space, and opens it at the role it gives the space.
    const jordan = await board.open("jordan_w", { width, at: "/" });
    await expect(questions(jordan)).toContainText([QUESTION]);
    await openSidebar(jordan, width);
    await expect(sidebar(jordan).getByRole("heading", { name: "Your spaces" })).toBeVisible();
    await sidebar(jordan).getByRole("link", { name: `${SPACE_NAME} 1 steelman` }).click();
    await expect(card(jordan)).toBeVisible();
    await expect(card(jordan).getByRole("heading", { name: SPACE_NAME })).toBeVisible();
    await expect(card(jordan)).toContainText(ABOUT);
    await expect(card(jordan)).toContainText("Private space");
    await expect(card(jordan)).toContainText("2 members");
    await expect(card(jordan).locator(".sm-space-banner")).toHaveAttribute("data-canvas", "sage");
    // Settings are for the Owner and Admins.
    await expect(card(jordan).getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(questions(jordan, SPACE_NAME)).toHaveText([QUESTION]);
    await expect(list(jordan, SPACE_NAME).locator(".sm-thumb")).toHaveAttribute("data-canvas", "sage");
    await list(jordan, SPACE_NAME).getByRole("link", { name: QUESTION }).click();
    await expect(jordan.getByRole("heading", { level: 1 })).toHaveText(QUESTION);
    expect(((await board.api("jordan_w").get(`../${made}`)) as { role: string }).role).toBe("voter");
  });

  test(`G-01, G-05, E-08: at ${width} px, a space's card shows Settings to its Owner, Needs your help lists a thin board, and the scans pass with the sidebar, the card, and Settings open`, async ({ board }) => {
    const space = await spaceWithJordan(board);
    await thinBoard(board, space);
    const maya = await board.open("maya.chen", { width, at: `/s/${space}` });
    await expect(card(maya)).toBeVisible();
    await expect(questions(maya, SPACE_NAME)).toHaveCount(2);
    await expect(card(maya).getByRole("link", { name: "Settings" })).toBeVisible();
    // The search and sort work on the space's list, as on Home's.
    await maya.getByRole("searchbox", { name: "Search steelmen" }).fill("notebook");
    await expect(questions(maya, SPACE_NAME)).toHaveText([THIN]);
    await maya.getByRole("searchbox", { name: "Search steelmen" }).fill("");

    if (width === 1280) {
      // The rail lists the board with an option under two arguments, and not the demo board, whose options have three each.
      const help = maya.getByRole("complementary", { name: "About this space" }).getByRole("region", { name: "Needs your help" });
      await expect(help.getByRole("listitem")).toHaveCount(1);
      await expect(help.getByRole("link")).toContainText(THIN);
      await expect(help.getByRole("link")).toContainText("2 options have fewer than two arguments.");
    }
    await openSidebar(maya, width);
    await expect(sidebar(maya).getByRole("link", { name: `${SPACE_NAME} 2 steelmen` })).toHaveAttribute("aria-current", "page");
    await expectNoAxeViolations(maya);

    await maya.goto(`/s/${space}/settings`);
    await expect(maya.getByRole("main", { name: `Settings for ${SPACE_NAME}` })).toBeVisible();
    await expect(maya.getByRole("region", { name: /^Members/ }).getByRole("combobox", { name: "Role for jordan_w" })).toHaveValue("member");
    await openSidebar(maya, width);
    await expectNoAxeViolations(maya);

    // Every new line a person reads here is a full sentence (AGENTS.md rule 13).
    const sentences = await maya.locator(".sm-space-edit small, .sm-space-edit .sm-person-note").allTextContents();
    expect(sentences.length).toBeGreaterThan(1);
    for (const sentence of sentences) expect(sentence.trim(), sentence).toMatch(/^(\(you\)|[A-Z0-9][^]* [^]*\.)$/);
  });

  test(`E-08: at ${width} px, an empty space says how to start a steelman, and its New steelman link starts on that space`, async ({ board }) => {
    const space = board.ids.itemId();
    await board.api("maya.chen").post("../../spaces", { id: space, name: SPACE_NAME });
    const maya = await board.open("maya.chen", { width, at: `/s/${space}` });
    await expect(card(maya)).toBeVisible();
    await expect(maya.getByText("No steelmen are in this space yet.").filter({ visible: true })).toBeVisible();
    // With no steelmen there's nothing to help with, so the rail says nothing about arguments.
    await expect(maya.getByRole("region", { name: "Needs your help" })).toHaveCount(0);
    await expect(maya.getByRole("main").getByRole("link", { name: "New steelman" })).toHaveAttribute("href", `/new?space=${space}`);
    // The header's New steelman starts on the space too.
    await expect(maya.getByRole("banner").getByRole("link", { name: "New steelman" })).toHaveAttribute("href", `/new?space=${space}`);
    await maya.getByRole("main").getByRole("link", { name: "New steelman" }).click();
    await expect(maya.getByRole("combobox", { name: "Space", exact: true })).toHaveValue(space);
  });
}

test("E-08: at 1280 px, a space whose options all have at least two arguments says so in a sentence, and one whose thin board is closed says it needs nothing from you", async ({ board }) => {
  // The demo board's options have three arguments each.
  const space = await spaceWithJordan(board);
  const maya = await board.open("maya.chen", { width: 1280, at: `/s/${space}` });
  const help = maya.getByRole("complementary", { name: "About this space" }).getByRole("region", { name: "Needs your help" });
  await expect(help).toBeVisible();
  await expect(help.getByRole("listitem")).toHaveCount(0);
  await expect(help).toContainText("Every option here has at least two arguments.");

  // A thin board that's closed asks for nothing, and the sentence doesn't claim every option is full.
  const thin = await thinBoard(board, space);
  await board.api("maya.chen").put(`../${thin}/closed`, {});
  await maya.reload();
  await expect(help).toBeVisible();
  await expect(help.getByRole("listitem")).toHaveCount(0);
  await expect(help).toContainText("No steelman here needs an argument from you right now.");
});

test("G-02, G-04: in Space settings, Maya makes jordan_w an Admin, saves the about text by leaving its field, and removes him, and the hero's member count follows", async ({ board }) => {
  const space = await spaceWithJordan(board);
  const maya = await board.open("maya.chen", { width: 1280, at: `/s/${space}/settings` });
  await expect(maya.getByRole("main", { name: `Settings for ${SPACE_NAME}` })).toBeVisible();
  const members = maya.getByRole("region", { name: /^Members/ });
  const facts = maya.locator(".sm-space-hero .sm-space-facts");
  await expect(facts).toContainText("2 members");
  const people = async () => ((await board.api("maya.chen").get(`../../spaces/${space}/people`)) as { people: { name: string | null; role: string }[] }).people;

  await members.getByRole("combobox", { name: "Role for jordan_w" }).selectOption("admin");
  await expect(announced(maya)).toHaveText("jordan_w is now an Admin.");
  expect((await people()).find((person) => person.name === "jordan_w")?.role).toBe("admin");

  const about = maya.getByRole("textbox", { name: "About" });
  await about.fill("Pod 6 meets here on Fridays.");
  await about.press("Tab");
  await expect(announced(maya)).toHaveText("The about text is saved.");
  expect(((await board.api("maya.chen").get(`../../spaces/${space}`)) as { about: string }).about).toBe("Pod 6 meets here on Fridays.");

  await members.getByRole("button", { name: "Remove jordan_w" }).click();
  await expect(announced(maya)).toHaveText("jordan_w is no longer in the space.");
  await expect(members.getByRole("list").last().getByRole("listitem")).toHaveCount(1);
  await expect(facts).toContainText("1 member");
  expect((await people()).map((person) => person.name)).toEqual(["maya.chen"]);
});

test("G-02: a name left for a canvas at once keeps both, and after a space is made each save leaves the cursor where it was", async ({ board }) => {
  const maya = await board.open("maya.chen", { width: 1280, at: "/spaces/new" });
  await maya.getByRole("textbox", { name: "Name", exact: true }).fill(SPACE_NAME);
  await maya.getByRole("button", { name: "Create space" }).click();
  await expect(maya.getByRole("main", { name: `Settings for ${SPACE_NAME}` })).toBeVisible();
  await expect(maya.getByRole("textbox", { name: "Invite by username" })).toBeFocused();
  const space = new URL(maya.url()).pathname.split("/")[2]!;

  // Leaving the name for a canvas sends two saves at once; the second keeps the first's name.
  await maya.getByRole("textbox", { name: "Name", exact: true }).fill("Wombat pod");
  const canvases = maya.getByRole("radiogroup", { name: "Canvas" });
  await canvases.getByRole("radio", { name: "Lilac" }).click();
  await expect(announced(maya)).toHaveText("The canvas is now Lilac.");
  await expect(canvases.getByRole("radio", { name: "Lilac" })).toBeFocused();
  // The arrow keys keep moving through the canvases after each save.
  await maya.keyboard.press("ArrowRight");
  await expect(announced(maya)).toHaveText("The canvas is now Warm stone.");
  await expect(canvases.getByRole("radio", { name: "Warm stone" })).toBeFocused();
  const saved = (await board.api("maya.chen").get(`../../spaces/${space}`)) as { name: string; canvas: string };
  expect({ name: saved.name, canvas: saved.canvas }).toEqual({ name: "Wombat pod", canvas: "stone" });
  await expect(sidebar(maya).getByRole("link", { name: /^Wombat pod/ })).toBeVisible();
});

test("G-01, E-07: from a board opened from a space's list, the wordmark goes to Home, as its name says", async ({ board }) => {
  const space = await spaceWithJordan(board);
  const maya = await board.open("maya.chen", { width: 1280, at: `/s/${space}` });
  await list(maya, SPACE_NAME).getByRole("link", { name: "Should our library open on Sundays?" }).click();
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await maya.getByRole("link", { name: "steelman. Your steelmen" }).click();
  await expect(list(maya)).toBeVisible();
  expect(new URL(maya.url()).pathname).toBe("/");
});

test("G-01: the folded sidebar stays open when a phone's window changes height, and closes when the window widens past the fold", async ({ board }) => {
  const page = await board.open("jordan_w", { width: 375, at: "/" });
  await expect(list(page)).toBeVisible();
  await toggle(page).click();
  await expect(sidebar(page)).toBeVisible();
  // As when a phone's address bar or keyboard comes and goes.
  await page.setViewportSize({ width: 375, height: 640 });
  await page.clock.runFor(40);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar(page)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  // The button isn't drawn past the fold, so it's found by its ID.
  await expect(page.locator("#sm-nav-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#steelman-study")).not.toHaveAttribute("data-nav-open");
});

test("G-01: under 900 px the sidebar folds behind the Spaces button, which opens it by keyboard and keeps its focus order, and Escape closes it", async ({ board }) => {
  await spaceWithJordan(board);
  const page = await board.open("jordan_w", { width: 375, at: "/" });
  await expect(list(page)).toBeVisible();
  await expect(sidebar(page)).toBeHidden();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(page)).toHaveAttribute("aria-controls", "sm-side");

  await toggle(page).focus();
  await page.keyboard.press("Enter");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar(page)).toBeVisible();
  // It opens on where you are, and Tab moves through it in order.
  await expect(sidebar(page).getByRole("link", { name: "Home" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sidebar(page).getByRole("link", { name: `${SPACE_NAME} 1 steelman` })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sidebar(page).getByRole("link", { name: "New space" })).toBeFocused();
  await settled(page);
  expect(await sidebar(page).evaluate((nav) => nav.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(sidebar(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");

  // A click outside it closes it too.
  await toggle(page).click();
  await expect(sidebar(page)).toBeVisible();
  await page.mouse.click(360, 600);
  await expect(sidebar(page)).toBeHidden();

  // The board's top bar has no Spaces button.
  await page.goto(`/b/${board.demo.board}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  await expect(toggle(page)).toHaveCount(0);
});

test("G-01: at 1280 px the sidebar stands beside the list, with no Spaces button, and Tab reaches its links before the search", async ({ board }) => {
  await spaceWithJordan(board);
  const page = await board.open("jordan_w", { width: 1280, at: "/" });
  await expect(list(page)).toBeVisible();
  await expect(sidebar(page)).toBeVisible();
  await expect(toggle(page)).toBeHidden();
  await expect(sidebar(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  const order: string[] = [];
  for (let tab = 0; tab < 20 && order.at(-1) !== "Search steelmen"; tab++) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || ""));
  }
  const at = (name: string) => order.findIndex((each) => each.startsWith(name));
  expect(at("Home")).toBeGreaterThanOrEqual(0);
  expect(at("Home")).toBeLessThan(at(SPACE_NAME));
  expect(at(SPACE_NAME)).toBeLessThan(at("New space"));
  expect(at("New space")).toBeLessThan(order.indexOf("Search steelmen"));
});

test("G-01, M-04: the sidebar slides in at --sm-medium, and under reduced motion it opens with no animation", async ({ board }) => {
  const page = await board.open("jordan_w", { width: 375, at: "/" });
  await expect(list(page)).toBeVisible();
  await toggle(page).click();
  // The rule, which stays while the sidebar is open, rather than the 200 ms animation, which may end before it's read.
  const slide = () =>
    sidebar(page).evaluate((nav) => {
      const style = getComputedStyle(nav);
      return { name: style.animationName, duration: parseFloat(style.animationDuration) * (style.animationDuration.endsWith("ms") ? 1 : 1000) };
    });
  const medium = await page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--sm-medium").trim();
    return value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
  });
  expect(medium).toBeGreaterThan(0);
  expect(await slide()).toEqual({ name: "sm-side-in", duration: medium });
  await page.keyboard.press("Escape");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(list(page)).toBeVisible();
  await toggle(page).click();
  await expect(sidebar(page)).toBeVisible();
  expect((await slide()).name).toBe("none");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

for (const width of WIDTHS) {
  test(`G-01, G-05: at ${width} px, the sidebar and the space card look as saved`, async ({ board }) => {
    const space = await spaceWithJordan(board);
    await thinBoard(board, space);
    const page = await board.open("maya.chen", { width, at: "/" });
    await expect(list(page).locator(":scope > li")).toHaveCount(2);
    await openSidebar(page, width);
    await settled(page);
    await expect(page).toHaveScreenshot(`spaces-sidebar-${width}.png`);

    await page.goto(`/s/${space}`);
    await expect(card(page)).toBeVisible();
    await settled(page);
    await expect(page).toHaveScreenshot(`space-card-${width}.png`);
  });
}

/** Stands in for PostHog's script: notes every call made to it, as analytics.spec.ts does. */
const RECORDER = `(() => {
  const queued = window.posthog;
  const calls = (window.__posthogCalls = []);
  for (const [key, options] of queued._i) calls.push(["init", key, options]);
  for (const call of queued) calls.push(call);
  window.posthog = new Proxy({ __loaded: true }, { get: (target, name) => (name in target ? target[name] : (...args) => void calls.push([name, ...args])) });
})();`;

/** Every element whose own text or attributes name the space and that PostHog's replays would record: those outside ph-no-capture, the tooltip box included. */
function unmasked(page: Page): Promise<string[]> {
  return page.evaluate((name) => {
    const found: string[] = [];
    for (const element of document.querySelectorAll("*")) {
      if (element.closest(".ph-no-capture")) continue;
      const own = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "");
      const attributes = [...element.attributes].map((attribute) => attribute.value);
      if ([...own, ...attributes].some((text) => text.includes(name))) found.push(element.outerHTML.slice(0, 160));
    }
    if (document.title.includes(name)) found.push(`title: ${document.title}`);
    return found;
  }, SPACE_NAME);
}

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });

  test("G-01, G-05, M-08: no space name reaches PostHog from the sidebar, the card, Settings, New steelman, or the board's top bar", async ({ board }) => {
    const space = await spaceWithJordan(board);
    await thinBoard(board, space);
    const sent: string[] = [];
    const page = await board.open("maya.chen", {
      at: "/",
      prepare: async (context) => {
        await context.route(`${TEST_POSTHOG.host}/**`, (route) => {
          sent.push(route.request().url(), route.request().postData() ?? "");
          return route.fulfill({ contentType: "text/javascript", body: RECORDER });
        });
      },
    });
    await page.waitForFunction(() => Array.isArray((window as unknown as { __posthogCalls?: unknown }).__posthogCalls));
    await expect(sidebar(page).getByRole("link", { name: `${SPACE_NAME} 2 steelmen` })).toBeVisible();
    expect(await unmasked(page)).toEqual([]);

    await sidebar(page).getByRole("link", { name: `${SPACE_NAME} 2 steelmen` }).click();
    await expect(card(page)).toBeVisible();
    // A tooltip shown over the space's links would copy its text outside the page's masks.
    await card(page).getByRole("link", { name: "Settings" }).hover();
    expect(await unmasked(page)).toEqual([]);

    await card(page).getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("main", { name: `Settings for ${SPACE_NAME}` })).toBeVisible();
    await page.getByRole("radiogroup", { name: "Canvas" }).getByRole("radio", { name: "Lilac" }).click();
    await expect(announced(page)).toHaveText("The canvas is now Lilac.");
    expect(await unmasked(page)).toEqual([]);

    await page.goto(`/new?space=${space}`);
    await expect(page.getByRole("combobox", { name: "Space", exact: true })).toHaveValue(space);
    expect(await unmasked(page)).toEqual([]);

    await page.goto(`/b/${board.demo.board}`);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(SPACE_NAME);
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link").hover();
    expect(await unmasked(page)).toEqual([]);

    const calls = await page.evaluate(() => (window as unknown as { __posthogCalls: unknown[] }).__posthogCalls);
    expect(calls.length).toBeGreaterThan(1);
    expect(JSON.stringify(calls)).not.toContain(SPACE_NAME);
    for (const each of sent) expect(each).not.toContain(SPACE_NAME);
  });
});
