// The motion system's tokens on the board (M3d-2, M-15). docs/design/tokens.css
// reaches the app through the prototype's stylesheet (web/vite.config.ts), so
// the settle curve, the lift, and the timings that were written into the code
// before (the drawer's 160 ms fade, a thread's 220 ms fold, and a link's
// 1.4 s ring) are read here from the board itself. With reduced motion,
// nothing on the board starts a Web Animation, which accessibility.spec.ts
// can't see because it reads only CSS (plans/build-plan.md, Motion rules).

import { expect, test } from "./support/board.ts";

test("M-15: the settle curve, the lift, and the motion timings reach the board as tokens", async ({ board }) => {
  const page = await board.open("jordan_w");
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector("#steelman-study")!);
    const read = (name: string) => style.getPropertyValue(name).trim();
    const settle = read("--sm-settle");
    return {
      settle,
      settleWorks: CSS.supports("animation-timing-function", settle),
      lift: read("--sm-lift"),
      liftWorks: CSS.supports("box-shadow", read("--sm-lift")),
      // The build's CSS minifier may write 120ms as .12s, so each is read in ms.
      times: ["--sm-fast", "--sm-medium", "--sm-slow", "--sm-leave", "--sm-fold", "--sm-ring"].map((name) => {
        const value = read(name);
        return Math.round(parseFloat(value) * (value.endsWith("ms") ? 1 : 1000));
      }),
      ease: read("--sm-ease").replace(/\s/g, "").replace(/([(,])0\./g, "$1."),
    };
  });

  // A spring written with linear(): it starts at 0, rises past 1 by about 4 percent, and comes to rest at 1.
  expect(tokens.settle).toMatch(/^linear\(/);
  expect(tokens.settleWorks).toBe(true);
  const stops = [...tokens.settle.slice("linear(".length, -1).split(",")].map((stop) => parseFloat(stop.trim()));
  expect(stops[0]).toBe(0);
  expect(stops.at(-1)).toBe(1);
  expect(Math.max(...stops)).toBeGreaterThanOrEqual(1.03);
  expect(Math.max(...stops)).toBeLessThanOrEqual(1.05);
  expect(tokens.lift).not.toBe("");
  expect(tokens.liftWorks).toBe(true);
  // The three speeds and the ease stay as they were; the timings in the code are now tokens with the same values.
  expect(tokens.times).toEqual([120, 200, 420, 160, 220, 1400]);
  expect(tokens.ease).toBe("cubic-bezier(.2,.7,.2,1)");
});

test("M-15: the drawer's fade and a thread's fold still run for 160 ms and 220 ms on the ease", async ({ board }) => {
  const page = await board.open("jordan_w");
  const timing = await page.evaluate(() => {
    const study = document.querySelector("#steelman-study")!;
    const drawer = document.createElement("div");
    drawer.className = "sm-drawer sm-leaving";
    const comments = document.createElement("div");
    comments.className = "sm-comments-body";
    const fold = document.createElement("div");
    fold.className = "sm-fold";
    comments.append(fold);
    study.append(drawer, comments);
    const of = (element: Element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction };
    };
    const result = { leave: of(drawer), fold: of(fold) };
    drawer.remove();
    comments.remove();
    return result;
  });
  expect(timing.leave).toEqual({ name: "sm-leave", duration: "0.16s", easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
  expect(timing.fold).toEqual({ name: "sm-fold", duration: "0.22s", easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
});

test("M-15: with reduced motion, nothing on the board starts a Web Animation", async ({ board }) => {
  // Reduced motion is on before the board opens, so the board never starts drawing itself (M3d-23).
  const page = await board.open("jordan_w", { at: "/privacy" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/b/${board.demo.board}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Should our library open on Sundays?");
  const running = () => page.evaluate(() => document.getAnimations().map((animation) => (animation.effect as KeyframeEffect | null)?.target?.className ?? "?"));

  expect(await running()).toEqual([]);
  // Unfold a row and fold it again, and open and close Comments: none of it animates.
  await page.getByRole("button", { name: "Compare 2 wordings of this argument" }).first().click();
  expect(await running()).toEqual([]);
  await page.getByRole("button", { name: "Fold versions back into the stack" }).first().click();
  expect(await running()).toEqual([]);
  await page.locator(".sm-head").getByRole("button", { name: /comments? on this question$/i }).click();
  await expect(page.getByRole("dialog", { name: "Comments" })).toBeVisible();
  expect(await running()).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  expect(await running()).toEqual([]);
});
