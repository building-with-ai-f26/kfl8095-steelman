// Public spaces in the browser (G-07, G-01, G-05, M3d-20; security review
// F4, F5, F6, F9, and F13). Maya, a space's Owner, makes it public from Space
// settings: Visibility offers Private and Public, and Public asks first, in
// place, with Make public and Cancel, as GitHub's Change visibility asks
// (checked live on Nov 28). Jordan, who isn't in the space, opens Find spaces
// from the sidebar, searches it in the browser, and joins the space at once,
// as Slack's Channels directory lists public channels with Join Channel
// (checked live on Nov 28). The space's board shared with everyone in it
// joins Jordan's list, while Tess's board, shared before the space went
// public, stopped being shared. The board's Share hint says that anyone can
// join and get in, the space's card says "Public space" with a globe, the
// member list is kept from Jordan, and Leave takes Jordan out. Two people use
// it at 1280 and 375 px.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { TEST_POSTHOG, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { test as siteTest } from "./support/sign-in.ts";

const WIDTHS = [1280, 375] as const;
/** A name found nowhere else, so finding it anywhere means a space's name went there. */
const SPACE_NAME = "Quokka commons";
const ABOUT = "Pod 6 tries its steelmen here first.";
const MAYAS = "Should Pod 6 meet on Fridays?";
const TESSS = "Should Pod 6 share one notebook?";
/** What Jordan types in Search spaces, found nowhere else either. */
const SEARCH = "tries its steel";
/** A full sentence (AGENTS.md rule 13). */
const SENTENCE = /^[A-Z0-9][^]* [^]*[.?]$/;

const sidebar = (page: Page): Locator => page.getByRole("navigation", { name: "Spaces" });
const toggle = (page: Page): Locator => page.getByRole("button", { name: "Spaces", exact: true });
const card = (page: Page): Locator => page.getByRole("region", { name: `About ${SPACE_NAME}` }).filter({ visible: true });
const found = (page: Page): Locator => page.getByRole("list", { name: "Public spaces" }).getByRole("listitem", { name: `About ${SPACE_NAME}` });
const visibility = (page: Page): Locator => page.getByRole("radiogroup", { name: "Visibility" });
const question = (page: Page): Locator => page.getByRole("group", { name: "Make the space public" });
const pill = (page: Page) => page.getByRole("button", { name: /^(Anyone with the link|Invited only|Everyone in .+)$/ });

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

/** Every line in these places is a full sentence. */
async function expectSentences(page: Page, selector: string): Promise<void> {
  for (const text of await page.locator(selector).allInnerTexts()) expect(text.trim()).toMatch(SENTENCE);
}

/**
 * Maya's private space, with tess.b a Member; Maya's own board in it and the demo board, both shared with everyone in
 * it; and Tess's board in it, shared with everyone in it too. Jordan is in no space.
 */
async function privateSpace(board: TestBoard): Promise<{ space: string; mayas: string; tesss: string }> {
  const space = board.ids.itemId();
  await board.api("maya.chen").post("../../spaces", { id: space, name: SPACE_NAME, about: ABOUT, canvas: "sage" });
  await board.api("maya.chen").post(`../../spaces/${space}/invites`, { username: "tess.b", role: "member" });
  await board.api("maya.chen").put("space", { space });
  await board.api("maya.chen").put("access", { general: "space", linkRole: "contributor" });
  const mayas = ((await board.api("maya.chen").post("../../boards", { question: MAYAS, options: ["Fridays", "Mondays"], space, access: { general: "space", linkRole: "contributor" } })) as { board: string }).board;
  const tesss = ((await board.api("tess.b").post("../../boards", { question: TESSS, options: ["One notebook", "One each"], space, access: { general: "space", linkRole: "voter" } })) as { board: string }).board;
  return { space, mayas, tesss };
}

for (const width of WIDTHS) {
  test(`G-07, G-01, G-05: at ${width} px, Maya makes her space public after its question, and Jordan finds it, joins it, opens its board, and leaves`, async ({ board }) => {
    const { space, mayas, tesss } = await privateSpace(board);

    // The Owner's choice: Private is chosen, and Public asks first, with the space's counts.
    const maya = await board.open("maya.chen", { width, at: `/s/${space}/settings` });
    await expect(visibility(maya).getByRole("radio", { name: "Private" })).toHaveAttribute("aria-checked", "true");
    await expect(maya.getByText("Only members can find and open this space.")).toBeVisible();
    await expect(maya.getByText("Anyone with a Steelman account can find this space and join it.")).toBeVisible();
    await visibility(maya).getByRole("radio", { name: "Public" }).click();
    await expect(question(maya)).toContainText(
      `Anyone with a Steelman account can then join ${SPACE_NAME}, which has 2 members, and open its 2 steelmen that are shared with everyone in the space, with their history and comments.`,
    );
    await expect(question(maya)).toContainText("The 1 steelman that another member owns stops being shared with the space, until its Owner shares it again.");
    await expectSentences(maya, ".sm-space-ask p, .sm-visibility small");
    await expectNoAxeViolations(maya);

    // Cancel changes nothing.
    await question(maya).getByRole("button", { name: "Cancel" }).click();
    await expect(question(maya)).toHaveCount(0);
    await expect(visibility(maya).getByRole("radio", { name: "Private" })).toHaveAttribute("aria-checked", "true");
    expect(((await board.api("maya.chen").get(`../../spaces/${space}`)) as { visibility: string }).visibility).toBe("private");

    await visibility(maya).getByRole("radio", { name: "Public" }).click();
    await question(maya).getByRole("button", { name: "Make public" }).click();
    await expect(maya.locator(".sm-space-edit .sm-live")).toHaveText(`${SPACE_NAME} is now public.`);
    await expect(visibility(maya).getByRole("radio", { name: "Public" })).toHaveAttribute("aria-checked", "true");
    await expect(maya.locator(".sm-space-hero .sm-space-facts")).toContainText("Public space");

    // Jordan finds it from the sidebar, and the search filters in the browser.
    const jordan = await board.open("jordan_w", { width, at: "/" });
    await openSidebar(jordan, width);
    await sidebar(jordan).getByRole("link", { name: "Find spaces" }).click();
    await expect(jordan.getByRole("heading", { level: 1 })).toHaveText("Find spaces");
    await expect(found(jordan)).toContainText("Public space");
    await expect(found(jordan)).toContainText("2 members");
    await expect(found(jordan).locator(".sm-space-facts svg").first()).toHaveClass(/lucide-globe/);
    const search = jordan.getByRole("searchbox", { name: "Search spaces" });
    await search.fill("no such space anywhere");
    await expect(jordan.locator(".sm-feed-nomatch")).toHaveText(/No spaces match that search./);
    await search.fill(SEARCH);
    await expect(found(jordan)).toBeVisible();
    await expectNoAxeViolations(jordan);

    await found(jordan).getByRole("button", { name: `Join ${SPACE_NAME}` }).click();
    await expect(jordan.locator(".sm-find .sm-live")).toHaveText(`You joined ${SPACE_NAME}.`);
    if (width < 900) await toggle(jordan).click();
    await expect(sidebar(jordan).getByRole("link", { name: new RegExp(`^${SPACE_NAME}`) })).toBeVisible();
    if (width < 900) await jordan.keyboard.press("Escape");
    await found(jordan).getByRole("link", { name: `Open ${SPACE_NAME}` }).click();

    // The space's page: Maya's board joins Jordan's list, and Tess's, no longer shared, doesn't.
    await expect(card(jordan)).toBeVisible();
    await expect(card(jordan)).toContainText("Public space");
    const listed = jordan.getByRole("list", { name: SPACE_NAME }).locator(":scope > li").getByRole("heading", { level: 2 });
    await expect(listed).toContainText([MAYAS]);
    await expect(listed.filter({ hasText: TESSS })).toHaveCount(0);
    expect(((await board.api("tess.b").get(`../${tesss}`)) as { access: { general: string } }).access.general).toBe("invited");

    // Settings: Jordan, a Member, reads no member list.
    await jordan.goto(`/s/${space}/settings`);
    await expect(jordan.getByText("Only the space’s Admins and its Owner can see who is in a public space.")).toBeVisible();
    await expect(jordan.locator(".sm-people")).toHaveCount(0);

    // Share's hint on a board in a public space says how far it reaches.
    await maya.goto(`/b/${mayas}`);
    await pill(maya).click();
    await expect(maya.getByRole("dialog", { name: "Share" })).toContainText(`Anyone with a Steelman account can join ${SPACE_NAME} and then find this steelman, vote, and write.`);

    // Leave takes Jordan out at once.
    await jordan.goto(`/s/${space}`);
    await card(jordan).getByRole("button", { name: "Leave" }).click();
    await expect(jordan.getByText(`You left ${SPACE_NAME}.`)).toBeVisible();
    await jordan.goto("/");
    await expect(jordan.getByRole("list", { name: "Your steelmen" })).toBeVisible();
    await expect(jordan.getByRole("heading", { level: 2, name: MAYAS })).toHaveCount(0);
  });
}

test("G-07: the Owner can't leave, and a Member of a private space is asked before leaving it", async ({ board }) => {
  const { space } = await privateSpace(board);
  const maya = await board.open("maya.chen", { at: `/s/${space}` });
  await expect(card(maya)).toBeVisible();
  await expect(card(maya).getByRole("button", { name: "Leave" })).toHaveCount(0);

  const tess = await board.open("tess.b", { at: `/s/${space}` });
  await card(tess).getByRole("button", { name: "Leave" }).click();
  await expect(card(tess)).toContainText(`You need an invite from its Admins or its Owner to come back to ${SPACE_NAME}.`);
  await expectNoAxeViolations(tess);
  await card(tess).getByRole("button", { name: "Cancel" }).click();
  await card(tess).getByRole("button", { name: "Leave" }).click();
  await card(tess).getByRole("group", { name: `Leave ${SPACE_NAME}` }).getByRole("button", { name: "Leave" }).click();
  await expect(tess.getByText(`You left ${SPACE_NAME}.`)).toBeVisible();
});

test("G-07, G-04: by keyboard, the arrow keys only move between Private and Public, Space chooses, focus follows the question, and Join hands its focus to Open", async ({ board }) => {
  const { space } = await privateSpace(board);
  const maya = await board.open("maya.chen", { at: `/s/${space}/settings` });
  const privateRadio = visibility(maya).getByRole("radio", { name: "Private" });
  const publicRadio = visibility(maya).getByRole("radio", { name: "Public" });
  await expect(privateRadio).toHaveAttribute("aria-checked", "true");

  // An arrow key moves to Public and chooses nothing: no question opens.
  await privateRadio.focus();
  await maya.keyboard.press("ArrowRight");
  await expect(publicRadio).toBeFocused();
  await expect(publicRadio).toHaveAttribute("tabindex", "0");
  await expect(privateRadio).toHaveAttribute("aria-checked", "true");
  await expect(question(maya)).toHaveCount(0);

  // Space chooses it, and focus moves to the question; Cancel gives focus back to the chosen option.
  await maya.keyboard.press("Space");
  await expect(question(maya)).toBeFocused();
  await expect(question(maya).getByRole("status")).toContainText(`which has 2 members`);
  await question(maya).getByRole("button", { name: "Cancel" }).press("Enter");
  await expect(privateRadio).toBeFocused();

  // After Make public, focus is on Public, which shows as chosen at once.
  await privateRadio.press("ArrowDown");
  await maya.keyboard.press("Space");
  await question(maya).getByRole("button", { name: "Make public" }).press("Enter");
  await expect(publicRadio).toBeFocused();
  await expect(publicRadio).toHaveAttribute("aria-checked", "true");

  // From Public, an arrow key doesn't make the space private.
  await maya.keyboard.press("ArrowLeft");
  await expect(privateRadio).toBeFocused();
  await expect(publicRadio).toHaveAttribute("aria-checked", "true");
  expect(((await board.api("maya.chen").get(`../../spaces/${space}`)) as { visibility: string }).visibility).toBe("public");

  // Join hands its focus to Open.
  const jordan = await board.open("jordan_w", { at: "/spaces/find" });
  await found(jordan).getByRole("button", { name: `Join ${SPACE_NAME}` }).press("Enter");
  await expect(found(jordan).getByRole("link", { name: `Open ${SPACE_NAME}` })).toBeFocused();
});

test("G-07, G-04: in a private space, Leave's question takes focus at Cancel, and Cancel gives it back to Leave", async ({ board }) => {
  const { space } = await privateSpace(board);
  const tess = await board.open("tess.b", { at: `/s/${space}` });
  await card(tess).getByRole("button", { name: "Leave" }).press("Enter");
  const asked = card(tess).getByRole("group", { name: `Leave ${SPACE_NAME}` });
  await expect(asked.getByRole("button", { name: "Cancel" })).toBeFocused();
  await asked.getByRole("button", { name: "Cancel" }).press("Enter");
  await expect(card(tess).getByRole("button", { name: "Leave" })).toBeFocused();
});

/** Stands in for PostHog's script: notes every call made to it, as analytics.spec.ts does. */
const RECORDER = `(() => {
  const queued = window.posthog;
  const calls = (window.__posthogCalls = []);
  for (const [key, options] of queued._i) calls.push(["init", key, options]);
  for (const call of queued) calls.push(call);
  window.posthog = new Proxy({ __loaded: true }, { get: (target, name) => (name in target ? target[name] : (...args) => void calls.push([name, ...args])) });
})();`;

/** Every element whose own text or attributes hold `text` and that PostHog's replays would record: those outside ph-no-capture. */
function unmasked(page: Page, text: string): Promise<string[]> {
  return page.evaluate((name) => {
    const hits: string[] = [];
    for (const element of document.querySelectorAll("*")) {
      if (element.closest(".ph-no-capture")) continue;
      const own = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "");
      const attributes = [...element.attributes].map((attribute) => attribute.value);
      if ([...own, ...attributes].some((each) => each.includes(name))) hits.push(element.outerHTML.slice(0, 160));
    }
    if (document.title.includes(name)) hits.push(`title: ${document.title}`);
    return hits;
  }, text);
}

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });

  test("G-07, M-08: no space name or search text reaches PostHog from Find spaces, Join, or Make public's question", async ({ board }) => {
    const { space } = await privateSpace(board);
    const sent: string[] = [];
    const prepare = async (context: import("@playwright/test").BrowserContext) => {
      await context.route(`${TEST_POSTHOG.host}/**`, (route) => {
        sent.push(route.request().url(), route.request().postData() ?? "");
        return route.fulfill({ contentType: "text/javascript", body: RECORDER });
      });
    };
    const maya = await board.open("maya.chen", { at: `/s/${space}/settings`, prepare });
    await visibility(maya).getByRole("radio", { name: "Public" }).click();
    await expect(question(maya)).toContainText(SPACE_NAME);
    expect(await unmasked(maya, SPACE_NAME)).toEqual([]);
    await question(maya).getByRole("button", { name: "Make public" }).click();
    await expect(maya.locator(".sm-space-edit .sm-live")).toHaveText(`${SPACE_NAME} is now public.`);

    const jordan = await board.open("jordan_w", { at: "/spaces/find", prepare });
    await jordan.waitForFunction(() => Array.isArray((window as unknown as { __posthogCalls?: unknown }).__posthogCalls));
    await jordan.getByRole("searchbox", { name: "Search spaces" }).fill(SEARCH);
    await expect(found(jordan)).toBeVisible();
    expect(await unmasked(jordan, SPACE_NAME)).toEqual([]);
    expect(await unmasked(jordan, SEARCH)).toEqual([]);
    await found(jordan).getByRole("button", { name: `Join ${SPACE_NAME}` }).click();
    await expect(jordan.locator(".sm-find .sm-live")).toHaveText(`You joined ${SPACE_NAME}.`);
    expect(await unmasked(jordan, SPACE_NAME)).toEqual([]);

    for (const page of [maya, jordan]) {
      const calls = await page.evaluate(() => (window as unknown as { __posthogCalls: unknown[] }).__posthogCalls);
      expect(calls.length).toBeGreaterThan(1);
      expect(JSON.stringify(calls)).not.toContain(SPACE_NAME);
      expect(JSON.stringify(calls)).not.toContain(SEARCH);
    }
    for (const each of sent) {
      expect(each).not.toContain(SPACE_NAME);
      expect(each).not.toContain(SEARCH);
    }
  });
});

siteTest("G-07: signed out, Find spaces asks for sign-in and shows no space", async ({ site }) => {
  const page = await site.browse();
  const asked: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/spaces")) asked.push(request.url());
  });
  await page.goto("/spaces/find");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page.getByRole("list", { name: "Public spaces" })).toHaveCount(0);
  expect(asked).toEqual([]);
});
