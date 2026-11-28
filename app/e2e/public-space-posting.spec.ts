// Who puts a board in a public space, in the browser (G-05, M3d-34; security
// review F1). New steelman's Space menu lists a public space only for its
// Admins and its Owner, as GitHub leaves an organization out of a member's
// Owner menu on "Create a new repository" when only its owners may create
// them (from memory). A private space is listed for every member, as before.
// The sentence a Member reads if the service refuses them anyway is checked
// in web/test/public-space-posting.test.ts, since that refusal's 403 would
// count as a console error here. No route makes a space public until M3d-20,
// so the test makes it public in the database.

import type { Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";

const PUBLIC_NAME = "Quokka commons";
const PRIVATE_NAME = "Quokka pod";

/** Maya makes a public space and a private one, with jordan_w a Member of each. */
async function twoSpaces(board: TestBoard): Promise<{ open: string; closed: string }> {
  const open = board.ids.itemId();
  const closed = board.ids.itemId();
  for (const [id, name] of [[open, PUBLIC_NAME], [closed, PRIVATE_NAME]] as const) {
    await board.api("maya.chen").post("../../spaces", { id, name, about: "Pod 6 tries its steelmen here first.", canvas: "sage" });
    await board.api("maya.chen").post(`../../spaces/${id}/invites`, { username: "jordan_w", role: "member" });
  }
  await board.setSpaceVisibility(open, "public");
  return { open, closed };
}

async function sheet(board: TestBoard, at = "/new"): Promise<Page> {
  const page = await board.open("jordan_w", { width: 1280, at });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New steelman");
  return page;
}

const spaceMenu = (page: Page) => page.getByRole("combobox", { name: "Space", exact: true });

test("G-05: New steelman's Space menu leaves out a public space for a Member, and lists it once they're an Admin", async ({ board }) => {
  const { open } = await twoSpaces(board);

  const member = await sheet(board);
  await expect(spaceMenu(member).getByRole("option")).toHaveText(["None", PRIVATE_NAME]);

  await board.api("maya.chen").put(`../../spaces/${open}/people/${board.demo.people["jordan_w"]}`, { role: "admin" });
  const admin = await sheet(board);
  await expect(spaceMenu(admin).getByRole("option")).toHaveText(["None", PUBLIC_NAME, PRIVATE_NAME]);
  await spaceMenu(admin).selectOption({ label: PUBLIC_NAME });
  await expect(spaceMenu(admin)).toHaveValue(open);
});

test("G-05: a Member who follows a link to New steelman in a public space starts on None, open to anyone with the link", async ({ board }) => {
  const { open } = await twoSpaces(board);

  const page = await sheet(board, `/new?space=${open}`);

  await expect(spaceMenu(page).getByRole("option")).toHaveText(["None", PRIVATE_NAME]);
  await expect(spaceMenu(page)).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Permissions" })).toHaveValue("link");
});
