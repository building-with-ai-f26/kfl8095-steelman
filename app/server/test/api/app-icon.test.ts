import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";

// The app's icon as the deployed service serves it (M3d-1, M-05). The real
// web app is built into a folder of its own, then served the way production
// serves it. The touch icon is a built file under /assets/, and the page's
// Content Security Policy still lets the inline SVG icon load.

const clock = createFakeClock(new Date("2026-11-24T12:00:00Z"));
const ids = createSeededIds(3401);

const directives = (policy: string) =>
  Object.fromEntries(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .map(([name, ...sources]) => [name, sources]),
  );

describe("serving the app's icon", () => {
  let webDirectory = "";
  let touchIcon = "";
  let app: ReturnType<typeof buildApp> | undefined;

  beforeAll(async () => {
    webDirectory = await mkdtemp(join(tmpdir(), "steelman-icon-server-"));
    await build({ root: join(import.meta.dirname, "../../../web"), mode: "test", logLevel: "warn", build: { outDir: webDirectory, emptyOutDir: true } });
    const html = await readFile(join(webDirectory, "index.html"), "utf8");
    touchIcon = html.match(/<link\b[^>]*rel="apple-touch-icon"[^>]*href="([^"]+)"/)?.[1] ?? "";
    // The service reads index.html once, when it starts, so it starts after the build.
    app = buildApp({ clock, ids, mode: "production", webDirectory });
    await app.ready();
  }, 120_000);
  afterAll(async () => {
    await app?.close();
    await rm(webDirectory, { recursive: true, force: true });
  });

  test("M-05: the touch icon's /assets/ address answers with the PNG, kept a year", async () => {
    expect(touchIcon).toMatch(/^\/assets\/[\w-]+\.png$/);
    const response = await app!.inject({ method: "GET", url: touchIcon });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.rawPayload.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  test("M-05: the page's Content Security Policy still allows data: images, so the inline icon loads", async () => {
    const response = await app!.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('rel="icon"');
    const policy = directives(String(response.headers["content-security-policy"]));
    expect(policy["img-src"]).toContain("data:");
    expect(policy["img-src"]).toContain("'self'");
  });
});
