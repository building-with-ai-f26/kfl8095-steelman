// The periods the privacy page states (M-07, M3d-37): each one equals the
// constant that sets it, so the page can't drift from the code. The constants
// live in shared/src/periods.ts, because the web app may not import the server
// (test/boundaries.test.ts), and the server derives its own values from them.
// The backup periods are set by Terraform, not by the app, so the last tests
// read them from infra/modules/steelman/main.tf.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { CODE_LASTS_MINUTES, SESSION_LASTS_DAYS, SIGN_IN_CODES_COUNTED_HOURS, SIGN_IN_EMAILS_KEPT_HOURS, USERNAME_HELD_DAYS, USERNAME_HOLD_DAYS } from "@steelman/shared";
import { Privacy } from "../src/Privacy.tsx";

/** The page's text, as a reader sees it: no tags, and React's markers between text pieces removed. */
function pageText(): string {
  return renderToString(createElement(Privacy))
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

test("M-07: the privacy page says a code works for as long as the code's constant sets", () => {
  expect(pageText()).toContain(`A code for signing in or for a new email works for ${CODE_LASTS_MINUTES} minutes.`);
});

test("M-07: the privacy page says a session lasts as long as the session's constant sets", () => {
  expect(pageText()).toContain(`You stay signed in until ${SESSION_LASTS_DAYS} days after you last use Steelman.`);
});

test("M-07: the privacy page says a sign-in email's record is kept as long as the daily job keeps it", () => {
  expect(pageText()).toContain(`We delete each record of an email we sent at the first daily clean-up after the record is ${SIGN_IN_EMAILS_KEPT_HOURS} hours old.`);
});

test("M-07: the privacy page says code requests from a network address are counted for as long as the limit's constant sets", () => {
  const period = SIGN_IN_CODES_COUNTED_HOURS === 1 ? "an hour" : `${SIGN_IN_CODES_COUNTED_HOURS} hours`;
  expect(pageText()).toContain(`counts the code requests from each network address for ${period}, in memory only`);
});

test("M-07: the privacy page says a deleted account's username is held as long as the deletion's constant sets", () => {
  expect(pageText()).toContain(`We hold a deleted account’s username for ${USERNAME_HELD_DAYS} days so that no one can take it straight away.`);
});

test("M-07: the privacy page says a changed username's old name is kept as long as the username change's constant sets", () => {
  expect(pageText()).toContain(`When you change your username, Steelman keeps your old one for ${USERNAME_HOLD_DAYS} days so that no one else takes it and links to it still work.`);
});

test("M-07: the periods are the ones architecture §7's retention table names", () => {
  expect({ CODE_LASTS_MINUTES, SESSION_LASTS_DAYS, SIGN_IN_CODES_COUNTED_HOURS, SIGN_IN_EMAILS_KEPT_HOURS, USERNAME_HELD_DAYS, USERNAME_HOLD_DAYS }).toEqual({
    CODE_LASTS_MINUTES: 10,
    SESSION_LASTS_DAYS: 30,
    SIGN_IN_CODES_COUNTED_HOURS: 1,
    SIGN_IN_EMAILS_KEPT_HOURS: 24,
    USERNAME_HELD_DAYS: 30,
    USERNAME_HOLD_DAYS: 30,
  });
});

/** The database's Terraform, where the backup periods are set. */
async function infra(): Promise<string> {
  return readFile(join(import.meta.dirname, "../../../infra/modules/steelman/main.tf"), "utf8");
}

/** The number Terraform sets for `key`, such as `retained_backups = 14`. */
function setting(terraform: string, key: string): number {
  const found = new RegExp(`\\b${key}\\s*=\\s*(\\d+)`).exec(terraform);
  if (!found) throw new Error(`main.tf doesn't set ${key}`);
  return Number(found[1]);
}

test("M-07: the privacy page says the daily backups last as many days as Terraform keeps them", async () => {
  const terraform = await infra();
  // One backup a day, counted: so the count is the days.
  expect(terraform).toMatch(/retention_unit\s*=\s*"COUNT"/);
  expect(pageText()).toContain(`We keep daily backups of the database for ${setting(terraform, "retained_backups")} days`);
});

test("M-07: the privacy page says the weekly backups last as many weeks as Terraform keeps the export's versions", async () => {
  // Each week's export replaces the last, and an old version goes once this many newer ones exist, so the exports cover this many weeks.
  expect(pageText()).toContain(`and weekly backups for ${setting(await infra(), "num_newer_versions")} weeks.`);
});

test("M-07: the privacy page says the database can be restored as far back as Terraform keeps its transaction logs", async () => {
  expect(pageText()).toContain(`The database can also be restored to any moment in the last ${setting(await infra(), "transaction_log_retention_days")} days.`);
});
