// Vote feedback and axes (B-06), held to what the app does, for M3b's backlog
// (plans/build-plan.md). The prototype's axes are in the app, and each vote
// answers at once with the pressed arrow, the new number, and a sentence in
// the status line. The prototype's fading words ("Important.", "Well
// articulated.") aren't built: they are fragments (AGENTS.md rule 13), and
// the status line already says what happened in a sentence.
//
// These tests passed when they were written, because they hold what M1 and
// M2-11 built. Each was seen to fail by breaking what it checks (the pull
// request says how).

import { expect, test } from "./support/board.ts";

const TOP = "Sunday is the only free day for many people who work weekdays.";

test("B-06: a vote shows at once, before the service answers: the arrow pressed, the number one higher, and a sentence", async ({ board }) => {
  const page = await board.open("jordan_w");
  const importance = page.getByRole("group", { name: `Importance: ${TOP.slice(0, 40)}` });
  const more = importance.getByRole("button", { name: "More important if true" });
  const score = importance.locator(".sm-vote-score");
  const before = Number(await score.textContent());

  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  // Holds the vote's request, as a slow connection would.
  await page.route("**/importance", async (route) => {
    await held;
    await route.continue();
  });

  await more.click();

  await expect(more).toHaveAttribute("aria-pressed", "true");
  await expect(score).toHaveText(String(before + 1));
  await expect(page.locator("#sm-status")).toHaveText("You voted this argument more important.");
  release();
});

test("B-06: an articulation vote in an unfolded row shows the same way", async ({ board }) => {
  const page = await board.open("jordan_w");
  await page.getByRole("button", { name: "Compare 2 wordings of this argument" }).first().click();
  const articulation = page.getByRole("group", { name: `Articulation: ${TOP.slice(0, 40)}` });
  const better = articulation.getByRole("button", { name: "Better articulated" });
  const score = articulation.locator(".sm-vote-score");
  const before = Number(await score.textContent());

  await better.click();

  await expect(better).toHaveAttribute("aria-pressed", "true");
  await expect(score).toHaveText(String(before + 1));
  await expect(page.locator("#sm-status")).toHaveText("You voted this wording better articulated.");
});

test("B-06: the importance axis runs from more to less important, and a row's axis from best articulation to weaker", async ({ board }) => {
  const page = await board.open("jordan_w");

  const down = page.locator('.sm-axis[data-axis="v"]').first();
  await expect(down.locator(".sm-axis-label")).toHaveText(["more important", "less important"]);

  await page.getByRole("button", { name: "Compare 2 wordings of this argument" }).first().click();
  const across = page.locator('.sm-axis[data-axis="h"]').first();
  await expect(across.locator(".sm-axis-label")).toHaveText(["best articulation", "weaker"]);
});

test("B-06: no word fades in on the card after a vote", async ({ board }) => {
  const page = await board.open("jordan_w");
  const importance = page.getByRole("group", { name: `Importance: ${TOP.slice(0, 40)}` });

  await importance.getByRole("button", { name: "More important if true" }).click();
  await expect(page.locator("#sm-status")).toHaveText("You voted this argument more important.");

  await expect(page.getByText("Important.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Well articulated.", { exact: true })).toHaveCount(0);
});
