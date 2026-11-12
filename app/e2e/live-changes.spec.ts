// tests/build-1-manual.md, November 11, "Live changes" (B-05, M-02) and
// "Live changes, structure" (edit only; M-02, A-06): one test per row, each
// with two people. What's on screen holds still; counts change in place; new
// things join the end; the pill counts what Update would change.
//
// The second person acts in their own browser where the board screen offers
// the action (votes, a new argument, a new wording), and through the API
// where it doesn't yet (editing and deleting).

import { TICK_MS, expect, test } from "./support/board.ts";
import { column, find, importance, pill, poll, row, rows, status } from "./support/screen.ts";

const YES = ["Sunday is the only free day for many people who work weekdays.", "Students need a quiet place to study before Monday exams.", "Families could visit together on the one day nobody has school or work."];
const NO = ["Staff need a guaranteed day off.", "Opening a seventh day costs more than the budget allows.", "Few people would come, judging by Saturday afternoons."];

test("B-05 M-02 B-01 Votes: counts change in place, the order on screen holds still, and the pill counts the moves", async ({ board }) => {
  const reader = await board.open("jordan_w");
  const other = await board.open("tess.b");
  expect(await rows(reader, "Yes")).toEqual(YES);

  // "Families…" goes from 1 to 4: one vote in the other person's browser, two through the API.
  await importance(other, YES[2]!).getByRole("button", { name: "More important if true" }).click();
  await expect(importance(other, YES[2]!).getByRole("button", { name: "More important if true" })).toHaveAttribute("aria-pressed", "true");
  const families = await find(board, YES[2]!);
  await board.api("lin.zhao").put(`arguments/${families.argument}/importance`, { value: 1 });
  await board.api("maya.chen").put(`arguments/${families.argument}/importance`, { value: 1 });

  await poll(reader);
  await expect(importance(reader, YES[2]!).getByLabel("Net 4")).toBeVisible();
  expect(await rows(reader, "Yes")).toEqual(YES);
  await expect(pill(reader)).toBeHidden();

  // The next shared order puts "Families…" first: one move away from what's on screen.
  board.clock.advance(TICK_MS);
  await poll(reader);
  await expect(pill(reader)).toHaveText(/1 change\s*Update/);
  expect(await rows(reader, "Yes")).toEqual(YES);
});

test("B-05 M-02 A-03 New argument: joins the end of its column, and earlier rows don't move", async ({ board }) => {
  const reader = await board.open("jordan_w");
  const other = await board.open("omar_h");

  await other.getByRole("button", { name: "Add an argument for No" }).click();
  await other.getByRole("textbox", { name: "Your argument", exact: true }).fill("Sunday hours would cut into weekday hours.");
  await other.getByRole("button", { name: "Add your argument" }).click();
  await expect(column(other, "No").locator(".sm-claim").last()).toHaveText("Sunday hours would cut into weekday hours.");

  await poll(reader);
  await expect.poll(() => rows(reader, "No")).toEqual([...NO, "Sunday hours would cut into weekday hours."]);
  expect(await rows(reader, "Yes")).toEqual(YES);
});

test("B-05 M-02 A-05 New wording: an unfolded single-wording row goes from 1 to 2 wordings, the new one last", async ({ board }) => {
  const reader = await board.open("jordan_w");
  const other = await board.open("tess.b");

  await row(reader, YES[1]!).getByRole("button", { name: "Write another wording of this argument" }).click();
  const track = row(reader, YES[1]!).getByRole("region", { name: "Versions, best articulated first" });
  await expect(track.locator(".sm-card .sm-claim")).toHaveText([YES[1]!]);

  await row(other, YES[1]!).getByRole("button", { name: "Write another wording of this argument" }).click();
  await row(other, YES[1]!).getByRole("button", { name: "Suggest a better version" }).click();
  await other.getByRole("textbox", { name: "Your version", exact: true }).fill("Students with Monday exams need somewhere quiet on Sunday.");
  await other.getByRole("button", { name: "Add your version" }).click();
  await expect(row(other, YES[1]!).locator(".sm-track .sm-card .sm-claim")).toHaveCount(2);

  await poll(reader);
  await expect(track.locator(".sm-card .sm-claim")).toHaveText([YES[1]!, "Students with Monday exams need somewhere quiet on Sunday."]);
});

test("B-05 M-02 Update: rows take the shared order, the pill goes, and the board says so", async ({ board }) => {
  const reader = await board.open("jordan_w");
  const families = await find(board, YES[2]!);
  for (const person of ["lin.zhao", "maya.chen", "tess.b"] as const) await board.api(person).put(`arguments/${families.argument}/importance`, { value: 1 });
  board.clock.advance(TICK_MS);
  await poll(reader);
  await expect(pill(reader)).toHaveText(/1 change\s*Update/);

  await pill(reader).getByRole("button", { name: "Update" }).click();
  await expect.poll(() => rows(reader, "Yes")).toEqual([YES[2], YES[0], YES[1]]);
  await expect(pill(reader)).toBeHidden();
  await expect(status(reader)).toHaveText("Board updated.");
});

test("B-05 M-02 A-06 Delete open card: the wording shows as deleted in place, counts on the pill, and is gone after Update and after reload", async ({ board }) => {
  const reader = await board.open("jordan_w");
  await row(reader, YES[0]!).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  const track = row(reader, YES[0]!).getByRole("region", { name: "Versions, best articulated first" });
  await expect(track.locator(".sm-card")).toHaveCount(2);

  const shift = await find(board, "Shift workers can only come on Sundays.");
  await board.api("omar_h").delete(`versions/${shift.version}`);
  await poll(reader);
  await expect(track.locator(".sm-card").nth(1)).toHaveText("Deleted by omar_h");
  await expect(pill(reader)).toHaveText(/1 change\s*Update/);

  await pill(reader).getByRole("button", { name: "Update" }).click();
  await expect(track.locator(".sm-card")).toHaveCount(1);
  await expect(pill(reader)).toBeHidden();

  await reader.reload();
  await expect(reader.getByText("Shift workers can only come on Sundays.")).toHaveCount(0);
  await expect(reader.getByText("Deleted by omar_h")).toHaveCount(0);
  await expect(pill(reader)).toBeHidden();
});

test("B-05 M-02 A-05 A-03 Draft on a vanished argument: after Update the draft moves to a new argument in the same column, with focus in it", async ({ board }) => {
  const reader = await board.open("jordan_w");
  await row(reader, YES[1]!).getByRole("button", { name: "Write another wording of this argument" }).click();
  await row(reader, YES[1]!).getByRole("button", { name: "Suggest a better version" }).click();
  await reader.getByRole("textbox", { name: "Your version", exact: true }).fill("My sharper wording");

  const students = await find(board, YES[1]!);
  await board.api("lin.zhao").delete(`versions/${students.version}`);
  await poll(reader);
  await expect(reader.getByRole("textbox", { name: "Your version", exact: true })).toHaveValue("My sharper wording");
  await expect(pill(reader)).toHaveText(/1 change\s*Update/);

  await pill(reader).getByRole("button", { name: "Update" }).click();
  const draft = column(reader, "Yes").getByRole("textbox", { name: "Your argument", exact: true });
  await expect(draft).toHaveValue("My sharper wording");
  await expect(draft).toBeFocused();
  await expect(status(reader)).toHaveText("That argument was deleted. Your draft is now a new argument.");
  expect(await rows(reader, "Yes")).toEqual([YES[0], YES[2]]);
});

test("B-05 M-02 Offline: a vote waits while offline, others' votes don't arrive, and coming back sends it", async ({ board }) => {
  const reader = await board.open("jordan_w");
  const few = await find(board, NO[2]!);

  await reader.context().setOffline(true);
  const vote = importance(reader, NO[1]!).getByRole("button", { name: "More important if true" });
  await vote.click();
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  await expect(pill(reader)).toHaveText("Offline · 1 waiting to send");

  // Meanwhile "Few people would come" goes from -1 to 3, ahead of what the reader votes up.
  await board.api("maya.chen").put(`arguments/${few.argument}/importance`, { value: 1 });
  await board.api("tess.b").put(`arguments/${few.argument}/importance`, { value: 1 });
  await board.api("omar_h").put(`arguments/${few.argument}/importance`, { value: 1 });
  await reader.clock.runFor(10_000);
  await expect(importance(reader, NO[2]!).getByLabel("Net -1")).toBeVisible();

  await reader.context().setOffline(false);
  await expect(pill(reader)).toHaveText("Back online · 1 sent");
  await expect(importance(reader, NO[1]!).getByLabel("Net 2")).toBeVisible();
  await expect(importance(reader, NO[2]!).getByLabel("Net 3")).toBeVisible();

  board.clock.advance(TICK_MS);
  await reader.clock.runFor(10_000);
  await expect(pill(reader)).toHaveText(/1 change\s*Update/);
  expect(await rows(reader, "No")).toEqual(NO);
});

test("M-02 A-06 Edit: the author's edit shows in place, marked edited, and the earlier wording can be shown struck through", async ({ board }) => {
  const reader = await board.open("jordan_w");
  const staff = await find(board, NO[0]!);
  await board.api("omar_h").put(`versions/${staff.version}`, { baseRev: staff.rev, wording: "Staff need two days off in a row.", context: "" });

  await poll(reader);
  const edited = row(reader, "Staff need two days off in a row.");
  await expect(edited.locator(".sm-byline")).toHaveText("omar_h · edited");
  expect(await rows(reader, "No")).toEqual(["Staff need two days off in a row.", NO[1], NO[2]]);
  await expect(pill(reader)).toBeHidden();

  await edited.getByRole("button", { name: "edited" }).click();
  await expect(edited.locator(".sm-prev del")).toHaveText(NO[0]!);
});
