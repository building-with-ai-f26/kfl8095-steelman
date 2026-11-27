// plans/build-plan.md, M3d-8, "A vote presses, the number rolls, and others'
// changes are marked on Update" (B-01, B-02, B-06, M-02, M-15). A vote arrow
// presses in, to 0.92 and back at --sm-fast, and its number rolls at
// --sm-medium: the old figure slides out in the vote's direction and the new
// one slides in, while the new value is in the page from the start. A count
// that changes on a poll rolls the same way, and no row moves. On Update, each
// card someone else added or edited since the reader's last Update wears a
// ring that fades over 1.6 s, as the prototype's flashIds does
// (docs/prototype/source/steelman-refined.html). No word appears near the
// arrow (B-06), and under reduced motion nothing animates.
//
// Web Animations run on the page's own timeline, which Playwright's clock
// doesn't move, so these tests record every animate() call and, where they
// look at a frame, hold the animations paused and set their time themselves,
// as cards-arrive-leave.spec.ts and combine-motion.spec.ts do. Their helpers
// are copied here, because existing test files stay as they are.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { TICK_MS, expect, test } from "./support/board.ts";
import type { TestBoard } from "./support/board.ts";
import { find, importance, pill, poll, row, rows, short } from "./support/screen.ts";

const LEAD = "Sunday is the only free day for many people who work weekdays.";
const SHIFT = "Shift workers can only come on Sundays.";
const STUDY = "Students need a quiet place to study before Monday exams.";
const STUDY_EDITED = "Students need a quiet place to study the day before Monday exams.";
const FAMILY = "Families could visit together on the one day nobody has school or work.";
const STAFF = "Staff need a guaranteed day off.";
const OPENING = "Opening a seventh day costs more than the budget allows.";
const OPENING_EDITED = "Opening a seventh day costs more than this year's budget allows.";
const FEW = "Few people would come, judging by Saturday afternoons.";
const NEW_ARGUMENT = "Sunday hours would need volunteers the library hasn't recruited yet.";
const FAST_MS = 120;
const MEDIUM_MS = 200;
const RING_MS = 1600;

/** One animate() call the page made: what it plays on, its keyframes, and its timing. */
interface Started {
  on: string;
  keyframes: Record<string, string | number | null>[];
  duration: number;
  composite: string;
}

interface Recorded {
  smStarted: Started[];
  smAnimations: Animation[];
  smHold: boolean;
}

/**
 * Records every animate() call the page makes from now on. Each is named by what it plays on: "press:<group>" on an
 * arrow, "score:<group>" on the number, "roll:<group>" on anything else in the vote, "row:<id>" on a row, "card:<id>"
 * on a card, or "other:<class>". While `smHold` is set, each animation is paused the moment it starts.
 */
async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Recorded;
    if (w.smStarted) return;
    w.smStarted = [];
    w.smAnimations = [];
    w.smHold = false;
    const label = (element: Element) => {
      const vote = element.closest(".sm-vote");
      const group = vote?.getAttribute("aria-label") ?? "";
      if (vote && element.closest(".sm-vote-btn")) return `press:${group}`;
      if (vote && element.matches(".sm-vote-score")) return `score:${group}`;
      if (vote) return `roll:${group}`;
      if (element.matches("[data-node]")) return `row:${(element as HTMLElement).dataset.node}`;
      if (element.matches(".sm-card[data-card]")) return `card:${(element as HTMLElement).dataset.card}`;
      return `other:${element.className}`;
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const animation = animate.apply(this, args);
      const effect = animation.effect as KeyframeEffect;
      w.smStarted.push({
        on: label(this),
        keyframes: effect.getKeyframes().map(({ offset, computedOffset, easing, composite, ...values }) => {
          void offset;
          void easing;
          void composite;
          return { ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])), offset: computedOffset };
        }),
        duration: Number(effect.getComputedTiming().duration),
        composite: effect.composite,
      });
      w.smAnimations.push(animation);
      if (w.smHold) animation.pause();
      return animation;
    };
  });
}

/** What has started since the mark, and a new mark. */
async function startedSince(page: Page, from: number): Promise<{ started: Started[]; mark: number }> {
  return page.evaluate((from) => {
    const w = window as unknown as Recorded;
    return { started: w.smStarted.slice(from), mark: w.smStarted.length };
  }, from);
}

function mark(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as Recorded).smStarted.length);
}

/** Holds every animation that starts from now on, paused, until release(). */
function hold(page: Page, on: boolean): Promise<void> {
  return page.evaluate((on) => {
    (window as unknown as Recorded).smHold = on;
  }, on);
}

/** Sets every recorded animation still running to the same moment. */
async function frameAt(page: Page, ms: number): Promise<void> {
  await page.evaluate((ms) => {
    for (const animation of (window as unknown as Recorded).smAnimations) if (animation.playState !== "idle" && animation.playState !== "finished") animation.currentTime = ms;
  }, ms);
  await page.clock.runFor(40);
}

/** Lets every recorded animation run to its end, and waits until nothing on the page is animating. */
async function finish(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of (window as unknown as Recorded).smAnimations) if (animation.playState !== "idle" && animation.playState !== "finished") animation.finish();
  });
  await settled(page);
}

/** Waits until nothing on the page is animating, CSS included. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.clock.runFor(40);
}

/** Clicks the button in the page itself, so that the pointer doesn't rest on it and show its hint, and lets React draw. */
async function clickInPage(page: Page, selector: string): Promise<void> {
  await page.evaluate(async (selector) => {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error(`Nothing matches ${selector}`);
    button.click();
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(null);
      });
  }, selector);
}

/** The vote group's own selector, by its accessible name. */
function voteSelector(group: string): string {
  return `.sm-vote[aria-label="${group.replaceAll('"', '\\"')}"]`;
}

/** What the vote shows: the number's text and label, how many numbers it has, and the copy rolling out, if any. */
function voteReads(page: Page, group: string): Promise<{ text: string; label: string | null; scores: number; copies: { text: string; hidden: string | null; label: string | null }[] }> {
  return page.evaluate((selector) => {
    const vote = document.querySelector(selector)!;
    const score = vote.querySelector(".sm-vote-score")!;
    return {
      text: score.textContent ?? "",
      label: score.getAttribute("aria-label"),
      scores: vote.querySelectorAll(".sm-vote-score").length,
      copies: [...vote.querySelectorAll(":scope > :not(.sm-vote-btn):not(.sm-vote-score)")].map((copy) => ({ text: copy.textContent ?? "", hidden: copy.getAttribute("aria-hidden"), label: copy.getAttribute("aria-label") })),
    };
  }, voteSelector(group));
}

/** The translate a keyframe sets, as two numbers in percent of the element's own size: [x, y]. */
function shift(keyframe: Record<string, string | number | null> | undefined): [number, number] {
  const value = String(keyframe?.translate ?? "none");
  if (value === "none") return [0, 0];
  const [x = "0", y = "0"] = value.split(/\s+/);
  const percent = (part: string) => (part.endsWith("%") ? Number.parseFloat(part) : Number.parseFloat(part) === 0 ? 0 : Number.NaN);
  return [percent(x), percent(y)];
}

/** Every row and card on screen, by "node:" or "card:" and its ID, on the page itself. */
function places(page: Page): Promise<Record<string, { left: number; top: number }>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-node], .sm-card[data-card]")].flatMap((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        if (!width && !height) return [];
        const key = element.dataset.node !== undefined ? `node:${element.dataset.node}` : `card:${element.dataset.card}`;
        return [[key, { left: Math.round(left + window.scrollX), top: Math.round(top + window.scrollY) }]];
      }),
    ),
  );
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function open(board: TestBoard, person: "maya.chen" | "jordan_w" | "tess.b"): Promise<Page> {
  const page = await board.open(person, { width: 1280 });
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
  return page;
}

/** Unfolds the first Yes row, which has two wordings, so that each wording has its articulation vote. */
async function unfoldLead(page: Page): Promise<void> {
  await row(page, LEAD).getByRole("button", { name: "Compare 2 wordings of this argument" }).click();
  await expect(page.getByRole("group", { name: `Articulation: ${short(SHIFT)}`, exact: true })).toBeVisible();
  await settled(page);
}

/** The press and the roll that one arrow plays, from what started. */
function pressAndRoll(started: Started[], group: string) {
  return {
    press: started.filter((s) => s.on === `press:${group}`),
    score: started.filter((s) => s.on === `score:${group}`),
    copy: started.filter((s) => s.on === `roll:${group}`),
    others: started.filter((s) => !s.on.endsWith(`:${group}`)),
  };
}

const importanceGroup = (wording: string) => `Importance: ${short(wording)}`;
const articulationGroup = (wording: string) => `Articulation: ${short(wording)}`;

test("B-01 B-02 B-06 M-15: pressing an arrow plays one press and one roll in the vote's direction, and the number is the new value at once and when the roll ends", async ({ board }) => {
  const page = await open(board, "maya.chen");
  await unfoldLead(page);
  await record(page);
  const cases = [
    // Importance stands upright: up is more important, so the old figure leaves upward and the new one rises from below.
    { group: importanceGroup(FAMILY), button: "More important if true", was: 1, now: 2, leaves: [0, -100], enters: [0, 100] },
    { group: importanceGroup(STUDY), button: "Less important if true", was: 2, now: 1, leaves: [0, 100], enters: [0, -100] },
    // Articulation lies on its side, its "better" arrow pointing left: the old figure leaves to the left.
    { group: articulationGroup(SHIFT), button: "Better articulated", was: 0, now: 1, leaves: [-100, 0], enters: [100, 0] },
  ] as const;
  for (const vote of cases) {
    expect((await voteReads(page, vote.group)).text, vote.group).toBe(String(vote.was));
    const from = await mark(page);
    await hold(page, true);
    await clickInPage(page, `${voteSelector(vote.group)} .sm-vote-btn[aria-label="${vote.button}"]`);
    await hold(page, false);
    const { started } = await startedSince(page, from);
    const { press, score, copy, others } = pressAndRoll(started, vote.group);

    // One press: the arrow scales to 0.92 and back, at --sm-fast.
    expect(press, `${vote.group}'s press`).toHaveLength(1);
    expect(press[0]!.keyframes.map((k) => k.scale)).toEqual(["1", "0.92", "1"]);
    expect(press[0]!.duration).toBe(FAST_MS);
    // One roll, at --sm-medium: the new number slides in and an aria-hidden copy of the old one slides out.
    expect(score, `${vote.group}'s number`).toHaveLength(1);
    expect(copy, `${vote.group}'s outgoing copy`).toHaveLength(1);
    expect(score[0]!.duration).toBe(MEDIUM_MS);
    expect(copy[0]!.duration).toBe(MEDIUM_MS);
    expect(shift(copy[0]!.keyframes[0])).toEqual([0, 0]);
    expect(shift(copy[0]!.keyframes.at(-1))).toEqual(vote.leaves);
    expect(shift(score[0]!.keyframes[0])).toEqual(vote.enters);
    expect(shift(score[0]!.keyframes.at(-1))).toEqual([0, 0]);
    expect(others, "nothing else starts").toEqual([]);

    // At once, and halfway through, the number is the new value; the copy has no name and is hidden from screen readers.
    const during = await voteReads(page, vote.group);
    expect(during).toEqual({ text: String(vote.now), label: `Net ${vote.now}`, scores: 1, copies: [{ text: String(vote.was), hidden: "true", label: null }] });
    await frameAt(page, MEDIUM_MS / 2);
    expect((await voteReads(page, vote.group)).text).toBe(String(vote.now));

    // When the roll ends the copy is gone, and the number reads the new value.
    await finish(page);
    expect(await voteReads(page, vote.group)).toEqual({ text: String(vote.now), label: `Net ${vote.now}`, scores: 1, copies: [] });
  }

  // The service's answer and the next poll bring the same counts back: nothing rolls a second time.
  const from = await mark(page);
  await poll(page);
  await poll(page);
  expect((await startedSince(page, from)).started).toEqual([]);
  for (const vote of cases) expect((await voteReads(page, vote.group)).text).toBe(String(vote.now));
  await expectNoAxeViolations(page);
});

test("B-01 M-15: a second press while the number still rolls stops the first roll, and its one copy sits exactly over the number", async ({ board }) => {
  const page = await open(board, "maya.chen");
  await record(page);
  const group = importanceGroup(FAMILY);
  const up = `${voteSelector(group)} .sm-vote-btn[aria-label="More important if true"]`;
  await hold(page, true);
  const first = await mark(page);
  await clickInPage(page, up);
  // The first roll is held at its first frame, where the number is drawn a whole box away from where it rests.
  const second = await mark(page);
  expect(second - first).toBe(3);
  await clickInPage(page, up);
  await hold(page, false);
  const { started } = await startedSince(page, second);
  expect(pressAndRoll(started, group).copy).toHaveLength(1);
  const now = await page.evaluate(
    ({ selector, from, to }) => {
      const vote = document.querySelector(selector)!;
      const score = vote.querySelector<HTMLElement>(".sm-vote-score")!;
      const copies = [...vote.querySelectorAll<HTMLElement>(".sm-vote-roll")];
      const box = (element: HTMLElement) => ({ left: element.offsetLeft, top: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight });
      return {
        earlier: (window as unknown as Recorded).smAnimations.slice(from, to).map((animation) => animation.playState),
        copies: copies.map((copy) => ({ text: copy.textContent, box: box(copy), parent: copy.offsetParent === score.offsetParent })),
        score: box(score),
      };
    },
    { selector: voteSelector(group), from: first, to: second },
  );
  // The first press, roll, and copy have stopped; only the second roll's copy is drawn, holding the figure it leaves.
  expect(now.earlier.slice(1)).toEqual(["idle", "idle"]);
  expect(now.copies.map((copy) => [copy.text, copy.parent])).toEqual([["2", true]]);
  const copyBox = now.copies[0]!.box;
  for (const side of ["left", "top", "width", "height"] as const) expect(Math.abs(copyBox[side] - now.score[side]), side).toBeLessThanOrEqual(1);
  expect(await voteReads(page, group)).toMatchObject({ text: "1", label: "Net 1", scores: 1 });
  await finish(page);
  expect(await voteReads(page, group)).toEqual({ text: "1", label: "Net 1", scores: 1, copies: [] });
});

test("B-01 B-06 M-15: no text other than the number appears near the arrow", async ({ board }) => {
  const page = await open(board, "maya.chen");
  await record(page);
  // Every text the page draws from now on, outside the screen reader's status line, with where it is.
  await page.evaluate(() => {
    const seen: { text: string; left: number; top: number }[] = [];
    (window as unknown as { smTexts: typeof seen }).smTexts = seen;
    const note = (node: Node) => {
      const element = node instanceof Element ? node : node.parentElement;
      if (!element || element.closest("#sm-status")) return;
      const text = node.textContent?.trim() ?? "";
      if (!text) return;
      const { left, top } = element.getBoundingClientRect();
      seen.push({ text, left, top });
    };
    new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === "characterData") note(change.target);
        for (const node of change.addedNodes) note(node);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const group = importanceGroup(FAMILY);
  const near = await page.evaluate((selector) => {
    const { left, top, right, bottom } = document.querySelector(selector)!.getBoundingClientRect();
    return { left: left - 200, top: top - 120, right: right + 200, bottom: bottom + 120 };
  }, voteSelector(group));
  await clickInPage(page, `${voteSelector(group)} .sm-vote-btn[aria-label="More important if true"]`);
  // Long past the prototype's 1.4 s message, which stays unbuilt.
  await page.clock.runFor(2_000);
  await settled(page);
  await clickInPage(page, `${voteSelector(group)} .sm-vote-btn[aria-label="More important if true"]`);
  await page.clock.runFor(2_000);
  await settled(page);
  const texts = await page.evaluate(() => (window as unknown as { smTexts: { text: string; left: number; top: number }[] }).smTexts);
  const nearby = texts.filter((t) => t.left >= near.left && t.left <= near.right && t.top >= near.top && t.top <= near.bottom);
  expect(nearby.length).toBeGreaterThan(0);
  expect(nearby.filter((t) => !/^-?\d+$/.test(t.text))).toEqual([]);
  for (const word of ["Important.", "Less important.", "Well articulated.", "Weaker articulation.", "Vote withdrawn."]) await expect(page.getByText(word, { exact: true })).toHaveCount(0);
  await expect(page.locator(".sm-vote-toast")).toHaveCount(0);
});

test("B-02 M-02 M-15: a second person's vote, arriving on a poll, rolls that count and adds no animation to any row's position", async ({ board }) => {
  const page = await open(board, "maya.chen");
  await unfoldLead(page);
  await record(page);
  const before = { yes: await rows(page, "Yes"), no: await rows(page, "No"), places: await places(page) };
  const family = await find(board, FAMILY);
  const shift_ = await find(board, SHIFT);
  await board.api("lin.zhao").put(`arguments/${family.argument}/importance`, { value: 1 });
  await board.api("lin.zhao").put(`versions/${shift_.version}/articulation`, { value: -1 });

  const from = await mark(page);
  await poll(page);
  // The new counts are in the page at once.
  await expect(importance(page, FAMILY).getByLabel("Net 2")).toBeVisible();
  await expect(page.getByRole("group", { name: articulationGroup(SHIFT), exact: true }).getByLabel("Net -1")).toBeVisible();
  const { started } = await startedSince(page, from);
  const family_ = pressAndRoll(started, importanceGroup(FAMILY));
  const shifted = pressAndRoll(started, articulationGroup(SHIFT));
  // Each count rolls once in the direction it moved, and nobody pressed anything here.
  expect(family_.press).toEqual([]);
  expect(family_.score).toHaveLength(1);
  expect(family_.copy).toHaveLength(1);
  expect(shift(family_.copy[0]!.keyframes.at(-1))).toEqual([0, -100]);
  expect(shifted.press).toEqual([]);
  expect(shifted.score).toHaveLength(1);
  expect(shifted.copy).toHaveLength(1);
  expect(shift(shifted.copy[0]!.keyframes.at(-1))).toEqual([100, 0]);
  // Nothing else starts: no row or card moves, and none is ringed.
  expect(started.filter((s) => !s.on.startsWith("score:") && !s.on.startsWith("roll:"))).toEqual([]);
  await settled(page);
  expect({ yes: await rows(page, "Yes"), no: await rows(page, "No"), places: await places(page) }).toEqual(before);
  expect(await voteReads(page, importanceGroup(FAMILY))).toEqual({ text: "2", label: "Net 2", scores: 1, copies: [] });

  // A poll that brings no change rolls nothing.
  const quiet = await mark(page);
  await poll(page);
  expect((await startedSince(page, quiet)).started).toEqual([]);
});

test("B-02 M-02 M-15: after Update, only the other people's added and edited cards carry a ring, it sits on a moving card's lift, and it ends", async ({ board }) => {
  const page = await open(board, "jordan_w");
  const study = await find(board, STUDY);
  const opening = await find(board, OPENING);
  const few = await find(board, FEW);
  const resting = await page.evaluate(() => getComputedStyle(document.querySelector(".sm-card[data-card]")!).boxShadow);

  // Someone else edits "Students…" and two more vote it to the top of Yes; someone else adds an argument to No.
  await board.api("lin.zhao").put(`versions/${study.version}`, { baseRev: study.rev, wording: STUDY_EDITED, context: "" });
  for (const person of ["maya.chen", "lin.zhao"] as const) await board.api(person).put(`arguments/${study.argument}/importance`, { value: 1 });
  const added = board.ids.itemId();
  await board.api("omar_h").post("arguments", { id: board.ids.itemId(), optionId: board.demo.options.no, versionId: added, wording: NEW_ARGUMENT, context: "" });
  // Someone else only votes on "Opening…", and the reader's own account edits it from elsewhere: neither is ringed.
  await board.api("tess.b").put(`arguments/${opening.argument}/importance`, { value: 1 });
  await board.api("jordan_w").put(`versions/${opening.version}`, { baseRev: opening.rev, wording: OPENING_EDITED, context: "" });

  await record(page);
  const atPoll = await mark(page);
  await poll(page);
  board.clock.advance(TICK_MS);
  await poll(page);
  await expect(pill(page)).toBeVisible();
  // A poll rings nothing: only counts roll.
  expect((await startedSince(page, atPoll)).started.filter((s) => !s.on.startsWith("score:") && !s.on.startsWith("roll:"))).toEqual([]);
  await settled(page);

  const from = await mark(page);
  await hold(page, true);
  await clickInPage(page, ".sm-fresh button");
  await hold(page, false);
  const { started } = await startedSince(page, from);
  const rings = started.filter((s) => s.keyframes.some((k) => String(k.boxShadow ?? "").includes("0px 0px 0px 3px")));
  // The ring is on the edited card and the added one, and on no other.
  expect(rings.map((s) => s.on).sort()).toEqual([`card:${added}`, `card:${study.version}`].sort());
  for (const ring of rings) {
    expect(ring.duration).toBe(RING_MS);
    expect(ring.composite).toBe("add");
  }
  // "Students…" rises to the top of Yes, so its card wears the lift too, and both show at once.
  expect(started.some((s) => s.on === `card:${study.version}` && !rings.includes(s) && s.keyframes.some((k) => k.boxShadow !== undefined))).toBe(true);
  const shadows = await page.evaluate(
    (id) => {
      // --sm-lift as the browser draws it, from a probe, so that it reads in the same form as the card's shadow.
      const probe = document.createElement("div");
      probe.style.boxShadow = getComputedStyle(document.documentElement).getPropertyValue("--sm-lift").trim();
      document.body.append(probe);
      const lifted = getComputedStyle(probe).boxShadow;
      probe.remove();
      return { now: getComputedStyle(document.querySelector(`.sm-card[data-card="${id}"]`)!).boxShadow, lifted };
    },
    study.version,
  );
  // The paused first frame shows the ring and each layer of the lift together.
  const liftLayers = shadows.lifted.match(/-?\d+(?:\.\d+)?px(?: -?\d+(?:\.\d+)?px){2,3}/g) ?? [];
  expect(liftLayers.length).toBe(2);
  expect(shadows.now).toContain("0px 0px 0px 3px");
  for (const layer of liftLayers) expect(shadows.now).toContain(layer);
  await frameAt(page, RING_MS / 2);
  await finish(page);
  expect(await rows(page, "Yes")).toEqual([STUDY_EDITED, LEAD, FAMILY]);
  // Once it ends, every card is back in its own shadow.
  expect(await page.evaluate(() => [...new Set([...document.querySelectorAll(".sm-card[data-card]")].map((card) => getComputedStyle(card).boxShadow))])).toEqual([resting]);
  await expectNoAxeViolations(page);

  // The next Update rings nothing new: the marks last only until the Update after them. "Few…" rises above the new one.
  await board.api("maya.chen").put(`arguments/${few.argument}/importance`, { value: 1 });
  board.clock.advance(TICK_MS);
  await poll(page);
  await expect(pill(page)).toBeVisible();
  const again = await mark(page);
  await clickInPage(page, ".sm-fresh button");
  expect((await startedSince(page, again)).started.filter((s) => s.keyframes.some((k) => String(k.boxShadow ?? "").includes("0px 0px 0px 3px")))).toEqual([]);
  await settled(page);
});

test("B-01 B-02 M-02 M-15: under reduced motion nothing animates and the number changes at once", async ({ board }) => {
  const page = await open(board, "jordan_w");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await record(page);
  const study = await find(board, STUDY);
  const group = importanceGroup(STAFF);

  await clickInPage(page, `${voteSelector(group)} .sm-vote-btn[aria-label="Less important if true"]`);
  expect(await voteReads(page, group)).toEqual({ text: "1", label: "Net 1", scores: 1, copies: [] });

  await board.api("lin.zhao").put(`versions/${study.version}`, { baseRev: study.rev, wording: STUDY_EDITED, context: "" });
  for (const person of ["maya.chen", "lin.zhao"] as const) await board.api(person).put(`arguments/${study.argument}/importance`, { value: 1 });
  await poll(page);
  await expect(importance(page, STUDY_EDITED).getByLabel("Net 4")).toBeVisible();
  board.clock.advance(TICK_MS);
  await poll(page);
  await expect(pill(page)).toBeVisible();
  await clickInPage(page, ".sm-fresh button");
  expect(await rows(page, "Yes")).toEqual([STUDY_EDITED, LEAD, FAMILY]);

  expect(await mark(page)).toBe(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator(".sm-vote > :not(.sm-vote-btn):not(.sm-vote-score)")).toHaveCount(0);
});
