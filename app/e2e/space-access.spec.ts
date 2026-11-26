// Boards in a space (G-04, G-05, H-02, M-07, M3d-18), in the browser: Share's
// General access gains "Everyone in <space>", at the role the link has, as
// Google Drive's General access offers "Anyone in <organisation>" (from
// memory), and its hint is a sentence whose verb follows that role. History
// says who shared the board with the space. A board's space is named only to
// the space's members; anyone else on the board reads "the space". Nothing on
// screen puts a board in a space yet (New steelman's Space menu is M3d-19), so
// each test puts the demo board in Maya's space, POD 6, through the API.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { status } from "./support/screen.ts";

const SIZES = [
  { name: "desktop", width: 1280 },
  { name: "375", width: 375 },
] as const;

const pill = (page: Page) => page.getByRole("button", { name: /^(Anyone with the link|Invited only|Everyone in .+)$/ });
const panel = (page: Page) => page.getByRole("dialog", { name: "Share" });
const general = (page: Page) => page.getByRole("combobox", { name: "General access" });
const history = (page: Page) => page.getByRole("dialog", { name: "History" });

/** Maya makes POD 6, adds jordan_w to it, and puts the demo board in it. Tess stays outside it. */
async function inPod6(board: TestBoard): Promise<void> {
  const space = board.ids.itemId();
  await board.api("maya.chen").post("../../spaces", { id: space, name: "POD 6" });
  await board.api("maya.chen").post(`../../spaces/${space}/invites`, { username: "jordan_w", role: "member" });
  await board.api("maya.chen").put("space", { space });
}

for (const size of SIZES) {
  test(`G-05, H-02: at ${size.name} width, the Owner shares the board with everyone in its space, and the hint says what they can do`, async ({ board }) => {
    await inPod6(board);
    const owner = await board.open("maya.chen", { width: size.width });

    await pill(owner).click();
    await expect(general(owner).getByRole("option")).toHaveText(["Invited only", "Everyone in POD 6", "Anyone with the link"]);
    await general(owner).selectOption("space");

    await expect(pill(owner)).toHaveText("Everyone in POD 6");
    // The role stays the link's, and its menu stays beside the choice.
    await expect(owner.getByRole("combobox", { name: "Space role" })).toHaveValue("contributor");
    await expect(panel(owner)).toContainText("Everyone in POD 6 can find this steelman, vote, and write. Anyone who can open it can comment.");
    await owner.getByRole("combobox", { name: "Space role" }).selectOption("voter");
    await expect(panel(owner)).toContainText("Everyone in POD 6 can find this steelman and vote.");
    await expect(status(owner)).toHaveText("Everyone in POD 6 can vote.");
    await expect.poll(async () => (await board.api("maya.chen").snapshot()).access).toEqual({ general: "space", linkRole: "voter" });

    const results = await new AxeBuilder({ page: owner }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test(`G-05, H-02, J-03: at ${size.name} width, History says who shared it with the space, by name for its members, and "the space" for anyone else`, async ({ board }) => {
    await inPod6(board);
    await board.api("maya.chen").put("access", { general: "space", linkRole: "voter" });

    const member = await board.open("jordan_w", { width: size.width });
    await member.getByRole("button", { name: "History" }).click();
    await expect(history(member).getByRole("listitem").nth(0)).toContainText("maya.chen let everyone in POD 6 vote.");
    await expect(history(member).getByRole("listitem").nth(1)).toContainText("maya.chen put the board in POD 6.");
    const results = await new AxeBuilder({ page: member }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

    const outsider = await board.open("tess.b", { width: size.width });
    await expect(pill(outsider)).toHaveText("Everyone in the space");
    await outsider.getByRole("button", { name: "History" }).click();
    await expect(history(outsider).getByRole("listitem").nth(0)).toContainText("maya.chen let everyone in the space vote.");
    await expect(history(outsider).getByRole("listitem").nth(1)).toContainText("maya.chen put the board in a space.");
    await expect(outsider.getByText("POD 6")).toHaveCount(0);
  });
}

test("G-05, H-02: on a board in no space, the choice is there and can't be chosen", async ({ board }) => {
  const owner = await board.open("maya.chen");

  await pill(owner).click();

  await expect(general(owner).getByRole("option")).toHaveText(["Invited only", "Everyone in a space", "Anyone with the link"]);
  await expect(general(owner).getByRole("option", { name: "Everyone in a space" })).toBeDisabled();
  await expect(general(owner)).toHaveValue("link");
});

test("G-05, H-02: someone in the space who isn't the Owner sees the choice and its hint, and can't change it", async ({ board }) => {
  await inPod6(board);
  await board.api("maya.chen").put("access", { general: "space", linkRole: "voter" });
  const member = await board.open("jordan_w");

  await pill(member).click();

  await expect(general(member)).toBeDisabled();
  await expect(member.getByRole("combobox", { name: "Space role" })).toBeDisabled();
  await expect(panel(member)).toContainText("Everyone in POD 6 can find this steelman and vote. Anyone who can open it can comment.");
  await expect(panel(member)).toContainText("Only the owner can change who can get in.");
});

test("G-05, H-02: someone let in through the space, who isn't on the board, sees themself under People with access at the space's role, and no one else from the space", async ({ board }) => {
  await inPod6(board);
  await board.api("maya.chen").put("access", { general: "space", linkRole: "voter" });
  // Jordan is on the demo board by invitation; removed from it, they get in through POD 6 alone.
  await board.api("maya.chen").delete(`people/${board.demo.people["jordan_w"]}`);
  const member = await board.open("jordan_w");

  await pill(member).click();

  const people = member.getByRole("region", { name: "People with access" }).getByRole("listitem");
  await expect(people).toHaveText([/^MCmaya\.chen/, /^JWjordan_w \(you\)can vote$/, /^LZlin\.zhao/, /^OHomar_h/, /^TBtess\.b/]);
  await expect(people.filter({ hasText: "jordan_w" }).getByRole("combobox")).toHaveCount(0);
  const results = await new AxeBuilder({ page: member }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("G-05, M-08: what is read out after a change, which can name the space and people, is kept out of screen replays", async ({ board }) => {
  await inPod6(board);
  const owner = await board.open("maya.chen");

  await pill(owner).click();
  await general(owner).selectOption("space");

  await expect(status(owner)).toHaveText("Everyone in POD 6 can contribute.");
  await expect(status(owner)).toHaveClass(/\bph-no-capture\b/);
});
