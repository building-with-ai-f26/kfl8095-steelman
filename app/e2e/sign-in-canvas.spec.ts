// Sign-in on a map that tours the spaces (M3d-25, L-01, M-05, M-04). Signed
// out, the sign-in page sits on M3d-21's contour map, and its tint moves
// through the six spaces' tints: stone first, then slate, sage, lilac, sand,
// and cool, a step every 4.2 seconds, each fading in over 2.6 seconds, while
// the contours pan slowly. The steps are timers, so these tests hold the
// browser's clock still and move it on themselves. The fade, the hold, and the
// pan are Web Animations, which run on the page's own timeline and not on that
// clock, so a test that reads pixels first stops them where each tint is fully
// shown. Choose a username, a new map after the code step, takes up the tour
// where the code step left it. Under reduced motion the map stays on stone and doesn't pan, and so
// do the problem pages that share the card: a link to a board that doesn't
// exist, and one to a board this account may not open. axe-core can't judge
// contrast over a background image (it reports it as needing review), so on
// each tint the test also reads the map's own pixels at its darkest corner and
// works out the contrast of muted and quiet text placed there, as
// canvas.spec.ts does for the board.

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { TEST_POSTHOG, expect as boardExpect, test as boardTest } from "./support/board.ts";
import { expect, test } from "./support/sign-in.ts";
import type { SignInSite } from "./support/sign-in.ts";

const TOUR = ["stone", "slate", "sage", "lilac", "sand", "cool"] as const;
const STEP_MS = 4200;
const FADE_MS = 2600;

const heading = (page: Page): Locator => page.getByRole("heading", { level: 1 });
const map = (page: Page): Locator => page.locator(".sm-tint-map");
const tint = (page: Page) => map(page).getAttribute("data-tint");
const notice = (page: Page): Locator => page.getByRole("region", { name: "Analytics" });

/** Stands in for PostHog's script, so nothing reaches PostHog. The service has the key (`test.use({ analytics: true })`), so the notice opens. */
const quietPostHog = (context: BrowserContext) => context.route(`${TEST_POSTHOG.host}/**`, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));

/** Signed out, at a board's link, with the browser's clock held still, so the tour moves only when the test moves it. */
async function signedOut(site: SignInSite, width = 1280, analytics = false): Promise<Page> {
  const page = await site.browse({ width });
  if (analytics) await quietPostHog(page.context());
  const time = new Date("2026-11-27T12:00:00Z").getTime();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1000);
  await page.goto(site.boardPath);
  await expect(heading(page)).toHaveText("Sign in");
  return page;
}

/** What plays on the map: each animation's target, timing, and state. */
async function mapAnimations(page: Page) {
  return map(page).evaluate((element) =>
    element.getAnimations({ subtree: true }).map((animation) => {
      const effect = animation.effect as KeyframeEffect;
      const timing = effect.getTiming();
      return {
        on: (effect.target as HTMLElement).dataset.tintLayer ?? (effect.target as HTMLElement).className,
        duration: timing.duration,
        delay: timing.delay,
        iterations: timing.iterations,
        keyframes: effect.getKeyframes().map((frame) => ({ opacity: frame.opacity, transform: frame.transform })),
        state: animation.playState,
      };
    }),
  );
}

/** Stops every animation on the map with the current tint fully shown: past its fade, on its hold. */
async function holdTint(page: Page): Promise<void> {
  await map(page).evaluate((element, fade) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      if (Number(animation.currentTime ?? 0) < fade) animation.currentTime = fade;
    }
  }, FADE_MS);
}

/**
 * Runs the accessibility scan. axe-core waits on timers, so the clock runs while it scans and is held still again
 * after. The scan takes far less than a step, so the tour doesn't move on during it.
 */
async function scan(page: Page): Promise<string[]> {
  await page.clock.resume();
  const results = await new AxeBuilder({ page }).analyze();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/** Switches reduced motion, and waits for the page to hear of it: the browser tells the page at its next frame. */
async function setReducedMotion(page: Page, reducedMotion: "reduce" | "no-preference"): Promise<void> {
  await page.evaluate(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    (window as unknown as { motionChanged: Promise<void> }).motionChanged = new Promise((done) => query.addEventListener("change", () => done(), { once: true }));
  });
  await page.emulateMedia({ reducedMotion });
  await page.evaluate(() => (window as unknown as { motionChanged: Promise<void> }).motionChanged);
}

/** Moves the clock on to the tour's next step. */
async function nextStep(page: Page): Promise<void> {
  await page.clock.runFor(STEP_MS);
}

/**
 * Moves the clock on until the next tint arrives, a tenth of a second at a time, for a test whose scans let the clock
 * run for a while: the next tint must still come within one step.
 */
async function untilNextTint(page: Page): Promise<void> {
  const was = await tint(page);
  for (let ran = 0; ran < STEP_MS; ran += 100) {
    await page.clock.runFor(100);
    if ((await tint(page)) !== was) return;
  }
  throw new Error(`The map stayed on ${was} for a whole step`);
}

const luminance = ([r, g, b]: number[]) => {
  const [lr, lg, lb] = [r!, g!, b!].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** The average colour of a PNG's pixels. */
async function averageColour(page: Page, png: Buffer): Promise<number[]> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
    return sum.map((total) => total / (data.length / 4));
  }, png.toString("base64"));
}

/**
 * The map's darkest place in view: the bottom-right corner of the window, which the light's falloff darkens most, and
 * above the analytics notice where the notice reaches across a phone's screen.
 */
async function darkCorner(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const main = document.querySelector("main.sm-landing")!.getBoundingClientRect();
    const right = Math.min(main.right, window.innerWidth);
    let bottom = Math.min(main.bottom, window.innerHeight);
    const over = document.querySelector(".sm-analytics-notice")?.getBoundingClientRect();
    if (over && over.right > right - 48) bottom = Math.min(bottom, over.top - 8);
    return { x: right - 48, y: bottom - 48, width: 48, height: 48 };
  });
}

/** Places a line of muted text and a line of quiet text in the corner, and returns each line's computed colour as [r, g, b, alpha]. */
async function placeTextAt(page: Page, corner: { x: number; y: number; width: number; height: number }): Promise<{ muted: number[]; quiet: number[] }> {
  return page.evaluate(({ x, y, width, height }) => {
    const main = document.querySelector("main.sm-landing")!;
    for (const [i, colour, weight] of [
      [0, "var(--sm-muted)", 400],
      [1, "var(--sm-quiet)", 300],
    ] as const) {
      const line = document.createElement("p");
      line.className = "sm-edge-probe";
      line.textContent = i === 0 ? "Muted." : "Quiet.";
      line.style.cssText = `position:fixed; right:${window.innerWidth - (x + width) + 4}px; top:${y + height - 40 + i * 18}px; margin:0; font:${weight} 12px/16px var(--sm-sans); color:${colour}; background:none;`;
      main.append(line);
    }
    const [muted, quiet] = [...document.querySelectorAll(".sm-edge-probe")].map((line) => {
      const [r = 0, g = 0, b = 0, alpha = 1] = (getComputedStyle(line).color.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, alpha];
    });
    return { muted: muted!, quiet: quiet! };
  }, corner);
}

test("L-01, M-05: signed out, the map starts on stone, every 4.2 seconds the next space's tint fades in over 2.6 seconds while the contours pan, and the tour goes on into Choose a username", async ({ site }) => {
  const page = await signedOut(site);
  await expect(page.locator("main.sm-landing")).toHaveAttribute("data-canvas", "stone");
  expect(await tint(page)).toBe("stone");
  const pan = (await mapAnimations(page)).filter((animation) => animation.on.includes("sm-tint-texture"));
  expect(pan).toHaveLength(1);
  expect(pan[0]).toMatchObject({ duration: 50_000, iterations: Infinity, state: "running" });
  expect(pan[0]!.keyframes.map((frame) => frame.transform)).toEqual(["translate3d(-16px, -10px, 0px)", "translate3d(16px, 10px, 0px)"]);

  await page.clock.runFor(STEP_MS - 1);
  expect(await tint(page)).toBe("stone");
  await page.clock.runFor(1);
  expect(await tint(page)).toBe("slate");
  const slate = (await mapAnimations(page)).filter((animation) => animation.on === "slate");
  expect(slate.map(({ duration, delay, iterations }) => ({ duration, delay, iterations }))).toEqual([
    { duration: FADE_MS, delay: 0, iterations: 1 },
    { duration: STEP_MS, delay: FADE_MS, iterations: Infinity },
  ]);
  expect(slate[0]!.keyframes.map((frame) => frame.opacity)).toEqual(["0", "1"]);

  // Each tint in turn, fully shown once its fade is over, and back to stone after the sixth.
  for (const name of [...TOUR.slice(2), "stone"]) {
    await nextStep(page);
    expect(await tint(page)).toBe(name);
  }
  await holdTint(page);
  const shown = await page.locator(`[data-tint-layer="stone"]`).evaluate((layer) => getComputedStyle(layer).opacity);
  expect(shown).toBe("1");

  // The form is unchanged, and the tour goes on into the code step.
  await nextStep(page);
  expect(await tint(page)).toBe("slate");
  await page.getByLabel("Email").fill("tour@school.example.edu");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(heading(page)).toHaveText("Check your email");
  expect(await tint(page)).toBe("slate");
  await nextStep(page);
  expect(await tint(page)).toBe("sage");

  // A new account's code, a second into sage: Choose a username is a new map, which goes on from sage, not stone.
  await page.clock.runFor(1000);
  await page.getByLabel("Code").fill(site.codeFor("tour@school.example.edu"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(heading(page)).toHaveText("Choose a username");
  await expect(map(page)).toHaveCount(1);
  expect(await tint(page)).toBe("sage");
  const top = await page.locator("[data-tint-layer]").evaluateAll((layers) =>
    layers.map((layer) => ({ name: (layer as HTMLElement).dataset.tintLayer, z: Number((layer as HTMLElement).style.zIndex || 0), live: layer.getAnimations().length })),
  );
  const highest = top.reduce((a, b) => (b.z > a.z ? b : a));
  expect(highest).toMatchObject({ name: "sage" });
  expect(highest.live).toBeGreaterThan(0);
  expect((await mapAnimations(page)).filter((animation) => animation.on.includes("sm-tint-texture"))).toHaveLength(1);
  // Sage then holds for a full step, as it does when a hidden tab is shown again.
  await page.clock.runFor(STEP_MS - 1);
  expect(await tint(page)).toBe("sage");
  await page.clock.runFor(1);
  expect(await tint(page)).toBe("lilac");
  expect(site.errors).toEqual([]);
});

test("L-01: while the tab is hidden the tour pauses, and it goes on when the tab is shown again", async ({ site }) => {
  const page = await signedOut(site);
  await nextStep(page);
  expect(await tint(page)).toBe("slate");

  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((state) => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      Object.defineProperty(document, "hidden", { value: state === "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await setVisibility("hidden");
  expect((await mapAnimations(page)).map((animation) => animation.state)).toEqual(expect.arrayContaining(["paused"]));
  expect((await mapAnimations(page)).every((animation) => animation.state === "paused")).toBe(true);
  await page.clock.runFor(30_000);
  expect(await tint(page)).toBe("slate");

  await setVisibility("visible");
  expect((await mapAnimations(page)).every((animation) => animation.state === "running")).toBe(true);
  await nextStep(page);
  expect(await tint(page)).toBe("sage");
});

test("L-01, M-05: under reduced motion the map stays on stone and doesn't pan, and turning it on mid-tour puts the map back on stone", async ({ site }) => {
  const page = await site.browse();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const time = new Date("2026-11-27T12:00:00Z").getTime();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1000);
  await page.goto(site.boardPath);
  await expect(heading(page)).toHaveText("Sign in");
  await page.clock.runFor(10 * STEP_MS);
  expect(await tint(page)).toBe("stone");
  expect(await mapAnimations(page)).toEqual([]);
  expect(await page.locator(".sm-tint-texture").evaluate((layer) => getComputedStyle(layer).transform)).toBe("none");
  for (const name of TOUR) expect(await page.locator(`[data-tint-layer="${name}"]`).evaluate((layer) => getComputedStyle(layer).opacity), name).toBe("0");

  // With motion allowed again it tours, and turning reduced motion on puts it back on stone at once.
  await setReducedMotion(page, "no-preference");
  await nextStep(page);
  await nextStep(page);
  expect(await tint(page)).toBe("sage");
  await setReducedMotion(page, "reduce");
  expect(await tint(page)).toBe("stone");
  expect(await mapAnimations(page)).toEqual([]);
  await page.clock.runFor(10 * STEP_MS);
  expect(await tint(page)).toBe("stone");
});

boardTest("L-01, M-05: a link to a board that doesn't exist and one to a board this account may not open stay still on stone", async ({ board }) => {
  const theirs = (await board.api("tess.b").post("../../boards", { question: "Should the café open early?", options: ["Yes, at seven", "No, at nine"], access: { general: "invited", linkRole: "contributor" } })) as { board: string };
  for (const { at, title, options } of [
    { at: "/b/no-such-board", title: "This steelman doesn’t exist", options: { missingBoards: true as const } },
    { at: `/b/${theirs.board}`, title: "You need access", options: { closedBoards: true as const } },
  ]) {
    const page = await board.open("maya.chen", { at, ...options });
    await boardExpect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    const main = page.locator("main.sm-landing");
    await boardExpect(main, title).toHaveAttribute("data-canvas", "stone");
    await boardExpect(main.locator(".sm-tint-map"), title).toHaveCount(0);
    await page.clock.runFor(3 * STEP_MS);
    boardExpect(await main.evaluate((element) => element.getAnimations({ subtree: true }).length), title).toBe(0);
    boardExpect(await main.evaluate((element) => getComputedStyle(element).backgroundColor), title).toBe("rgb(220, 216, 207)");
    await page.context().close();
  }
});

test.describe("with a PostHog key", () => {
  test.use({ analytics: true });
  for (const width of [1280, 375]) {
    test(`L-01, M-05, M-04: at ${width} px, with the analytics notice open, each of the six tints passes the accessibility scan, and muted and quiet text at the map's darkest corner keeps 4.6:1`, async ({ site }) => {
      const page = await signedOut(site, width, true);
      await expect(notice(page)).toBeVisible();
      const edges = new Map<string, number[]>();
      for (const [step, name] of TOUR.entries()) {
        if (step > 0) await untilNextTint(page);
        expect(await tint(page)).toBe(name);
        await holdTint(page);
        if (step > 0) expect(await page.locator(`[data-tint-layer="${name}"]`).evaluate((layer) => getComputedStyle(layer).opacity), name).toBe("1");

        // The map's own pixels at its darkest corner, with the card hidden.
        const corner = await darkCorner(page);
        const hide = await page.addStyleTag({ content: "#steelman-study .sm-landing-inner { visibility:hidden !important; }" });
        const edge = await averageColour(page, await page.screenshot({ clip: corner }));
        await hide.evaluate((style) => (style as Element).remove());
        edges.set(name, edge);
        const ink = await placeTextAt(page, corner);
        for (const which of ["muted", "quiet"] as const) {
          const [r, g, b, alpha] = ink[which];
          expect(alpha, `${which} text is opaque`).toBe(1);
          const ratio = contrast([r!, g!, b!], edge);
          test.info().annotations.push({ type: "contrast", description: `${width} px, ${name}, ${which}: ${ratio.toFixed(3)}:1 on rgb(${edge.map((c) => c.toFixed(1)).join(", ")})` });
          expect(ratio, `${which} text, rgb(${r}, ${g}, ${b}), on ${name}'s darkest corner, rgb(${edge.map(Math.round).join(", ")})`).toBeGreaterThanOrEqual(4.6);
        }

        await expect(notice(page)).toBeVisible();
        expect(await scan(page), `the scan on ${name}`).toEqual([]);
        await page.evaluate(() => document.querySelectorAll(".sm-edge-probe").forEach((line) => line.remove()));
        // The panning map never makes the page scroll sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `the page's width on ${name}`).toBeLessThanOrEqual(width);
      }
      // Each tint really is painted: no two corners are the same colour, as they would be if a layer had no colour or
      // sat behind the page's own stone.
      for (const [i, a] of TOUR.entries()) {
        for (const b of TOUR.slice(i + 1)) {
          const [one, two] = [edges.get(a)!, edges.get(b)!];
          const apart = Math.max(...one.map((c, channel) => Math.abs(c - two[channel]!)));
          expect(apart, `${a}'s corner, rgb(${one.map(Math.round).join(", ")}), and ${b}'s, rgb(${two.map(Math.round).join(", ")})`).toBeGreaterThanOrEqual(2);
        }
      }
      expect(site.errors).toEqual([]);
    });
  }
});
