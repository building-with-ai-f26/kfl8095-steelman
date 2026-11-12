// Whether the service can be reached is decided by asking it, not by the
// browser's own online flag (M-02). The flag is false wherever the machine
// has no network but the loopback one (CI's no-network job, where the
// service is on localhost), and wrong in other ways on real devices.

import { expect, test } from "./support/board.ts";
import { importance, pill } from "./support/screen.ts";

test("M-02: a browser that says it is offline while the service answers still sends, and shows no offline note", async ({ board }) => {
  const reader = await board.open("jordan_w", { onLine: false });
  expect(await reader.evaluate(() => navigator.onLine)).toBe(false);

  const vote = importance(reader, "Opening a seventh day costs more than the budget allows.");
  await vote.getByRole("button", { name: "More important if true" }).click();
  await expect(vote.getByLabel("Net 2")).toBeVisible();
  await expect(pill(reader)).toBeHidden();
});
