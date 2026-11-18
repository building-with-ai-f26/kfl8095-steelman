// "Edited", with the votes before (M2-5; A-06, Q22): hovering "edited" shows
// the wording it replaced and how many importance and articulation votes it
// had just before the edit; on a phone, a tap does. Later votes don't change
// what it says.

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const EDITED = "Sunday is the only free day for most people who work weekdays.";

const card = (page: Page, wording: string): Locator => page.locator(".sm-card").filter({ has: page.locator(".sm-claim", { hasText: wording }) });

/** Jordan votes on the lead wording's articulation, then Maya edits it and Lin votes on both. Answers the counts it had at the edit. */
async function editAfterVotes(board: TestBoard): Promise<{ importance: number; articulation: number }> {
  const { argument, version, rev } = await find(board, LEAD);
  await board.api("jordan_w").put(`versions/${version}/articulation`, { value: 1 });
  const snapshot = await board.api("maya.chen").snapshot();
  const counts = {
    importance: snapshot.arguments.find((a: { id: string }) => a.id === argument).importanceVoters as number,
    articulation: snapshot.versions.find((v: { id: string }) => v.id === version).articulationVoters as number,
  };
  await board.api("maya.chen").put(`versions/${version}`, { baseRev: rev, wording: EDITED, context: "" });
  await board.api("lin.zhao").put(`versions/${version}/articulation`, { value: -1 });
  return counts;
}

const said = (counts: { importance: number; articulation: number }) =>
  `Before this edit: ${counts.importance} importance ${counts.importance === 1 ? "vote" : "votes"} · ${counts.articulation} articulation ${counts.articulation === 1 ? "vote" : "votes"}`;

test("M2-5, A-06: hovering edited shows the earlier wording and the votes it had just before the edit; moving away hides them", async ({ board }) => {
  const counts = await editAfterVotes(board);
  const reader = await board.open("tess.b");
  const edited = card(reader, EDITED).getByRole("button", { name: "edited" });

  await edited.hover();

  await expect(card(reader, EDITED).locator(".sm-prev del")).toHaveText(LEAD);
  await expect(card(reader, EDITED).locator(".sm-prev-votes")).toHaveText(said(counts));
  await expect(edited).toHaveAttribute("aria-expanded", "true");

  await reader.getByRole("heading", { level: 1 }).hover();
  await expect(card(reader, EDITED).locator(".sm-prev")).toHaveCount(0);
});

test("M2-5, A-06: on a phone, a tap on edited shows them, and another tap hides them", async ({ board }) => {
  const counts = await editAfterVotes(board);
  const reader = await board.open("tess.b", { width: 375, touch: true });
  const edited = card(reader, EDITED).getByRole("button", { name: "edited" });

  await edited.tap();
  await expect(card(reader, EDITED).locator(".sm-prev-votes")).toHaveText(said(counts));
  await expect(edited).toHaveAttribute("aria-expanded", "true");

  await edited.tap();
  await expect(card(reader, EDITED).locator(".sm-prev")).toHaveCount(0);
  await expect(edited).toHaveAttribute("aria-expanded", "false");
});

test("M2-5, M-04: the pointer can move from edited onto what it shows, and Escape hides it without moving the pointer", async ({ board }) => {
  await editAfterVotes(board);
  const reader = await board.open("tess.b");
  const edited = card(reader, EDITED).getByRole("button", { name: "edited" });

  await edited.hover();
  await card(reader, EDITED).locator(".sm-prev del").hover();
  await expect(card(reader, EDITED).locator(".sm-prev-votes")).toBeVisible();

  await reader.keyboard.press("Escape");
  await expect(card(reader, EDITED).locator(".sm-prev")).toHaveCount(0);
});

test("M2-5, A-06: with a mouse, a click keeps it open after the pointer leaves, and a second click closes it", async ({ board }) => {
  await editAfterVotes(board);
  const reader = await board.open("tess.b");
  const edited = card(reader, EDITED).getByRole("button", { name: "edited" });

  await edited.click();
  await reader.getByRole("heading", { level: 1 }).hover();
  await expect(card(reader, EDITED).locator(".sm-prev-votes")).toBeVisible();
  await expect(edited).toHaveAttribute("aria-expanded", "true");

  await edited.click();
  await expect(card(reader, EDITED).locator(".sm-prev")).toHaveCount(0);
  await expect(edited).toHaveAttribute("aria-expanded", "false");
});
