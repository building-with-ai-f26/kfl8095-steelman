// Short ways to read and work the board screen, by what a person sees: the
// labels and roles the prototype uses (docs/prototype/source/steelman-refined.html).

import type { Locator, Page } from "@playwright/test";
import type { TestBoard } from "./board.ts";
import { POLL_MS } from "./board.ts";

export function column(page: Page, option: string): Locator {
  return page.locator(`.sm-column[aria-label="${option}"]`);
}

/** The leading wording of each row in a column, top to bottom. */
export function rows(page: Page, option: string): Promise<string[]> {
  return column(page, option).locator(".sm-idea").evaluateAll((sections) => sections.map((section) => section.querySelector(".sm-card .sm-claim, .sm-removed-note")?.textContent?.trim() ?? ""));
}

/** The row whose leading wording starts with this text. */
export function row(page: Page, wording: string): Locator {
  return page.locator(".sm-idea").filter({ has: page.locator(".sm-card-wrap > .sm-card .sm-claim, .sm-track .sm-card:first-of-type .sm-claim", { hasText: wording }) }).first();
}

/** An argument's importance vote, named after its leading wording, cut short as the prototype does. */
export function importance(page: Page, wording: string): Locator {
  return page.getByRole("group", { name: `Importance: ${short(wording)}`, exact: true });
}

export function short(wording: string): string {
  return wording.length > 60 ? `${wording.slice(0, 57)}…` : wording;
}

/** The count of changes waiting, with its Update button, or the offline note. */
export function pill(page: Page): Locator {
  return page.locator(".sm-fresh");
}

export function status(page: Page): Locator {
  return page.locator("#sm-status");
}

/** Moves the page's clock on to its next request for changes, and lets the answer arrive. */
export async function poll(page: Page): Promise<void> {
  const answered = page.waitForResponse((response) => response.url().includes("/changes?"));
  await page.clock.runFor(POLL_MS);
  await answered;
}

/** Finds an argument and its wordings on the board by a wording's text. */
export async function find(board: TestBoard, wording: string): Promise<{ argument: string; version: string; rev: number }> {
  const snapshot = await board.api("maya.chen").snapshot();
  const version = snapshot.versions.find((v: { wording: string | null }) => v.wording === wording);
  if (!version) throw new Error(`No wording "${wording}" on the demo board`);
  return { argument: version.argumentId, version: version.id, rev: version.rev };
}
