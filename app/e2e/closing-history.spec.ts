// Closing a board (M3b-3, I-05), as History tells it: after the Owner's four
// closing writes through the API, History says each in a sentence, with the
// closing time in the reader's own time zone, named.

import { expect, test } from "./support/board.ts";

test.use({ timezoneId: "America/New_York" });

test("I-05, J-03: History says who closed and reopened the board, and set and removed its closing time", async ({ board }) => {
  const owner = board.api("maya.chen");
  // Nov 30, 2026 at 5 PM in New York, which is 22:00 UTC (Eastern Standard Time).
  await owner.put("closing", { closesAt: "2026-11-30T22:00:00.000Z" });
  await owner.put("closing", { closesAt: null });
  await owner.put("closed", {});
  await owner.delete("closed");

  const page = await board.open("tess.b");
  await page.getByRole("button", { name: "History" }).click();
  const entries = page.locator(".sm-history li p");

  await expect(entries.filter({ hasText: "maya.chen set the board to close on Nov 30 at 5 PM EST." })).toHaveCount(1);
  await expect(entries.filter({ hasText: "maya.chen removed the closing date." })).toHaveCount(1);
  await expect(entries.filter({ hasText: "maya.chen closed the board." })).toHaveCount(1);
  await expect(entries.filter({ hasText: "maya.chen reopened the board." })).toHaveCount(1);
});
