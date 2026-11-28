import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";

// Compressed downloads of the built files (M-06, M3d-30 in plans/build-plan.md;
// F12 in plans/reviews/public-spaces-security-review.md).
// The service compresses every JavaScript, CSS, and SVG file under /assets/
// once at start, as brotli and as gzip. A request gets brotli when its
// accept-encoding allows it, else gzip when that is allowed, else the plain
// file. Every asset answer says it varies by accept-encoding. PNG and WOFF2
// files are already compressed, so they go out as they are. Pages, unknown
// files, and paths that leave the folder answer as they did before.

const clock = createFakeClock(new Date("2026-11-28T12:00:00Z"));
const ids = createSeededIds(4420);

const SCRIPT = "export function hello(name) { return `Hello, ${name}.`; }\n".repeat(400);
const STYLE = ".card { color: var(--ink); padding: 8px 12px; }\n".repeat(200);
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>\n'.repeat(20);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 7)]);
const FONT = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(2000, 3)]);
const YEAR = "public, max-age=31536000, immutable";

const web = mkdtempSync(join(tmpdir(), "steelman-compressed-"));
writeFileSync(join(web, "index.html"), "<!doctype html><title>Steelman</title>");
mkdirSync(join(web, "assets"));
writeFileSync(join(web, "assets", "index-abc123.js"), SCRIPT);
writeFileSync(join(web, "assets", "index-abc123.css"), STYLE);
writeFileSync(join(web, "assets", "icon-abc123.svg"), ICON);
writeFileSync(join(web, "assets", "apple-touch-icon-abc123.png"), PNG);
writeFileSync(join(web, "assets", "font-abc123.woff2"), FONT);
writeFileSync(join(tmpdir(), "outside.txt"), "not served");

const app = buildApp({ clock, ids, mode: "production", webDirectory: web });
beforeAll(() => app.ready());
afterAll(() => app.close());

const get = (url: string, acceptEncoding?: string) =>
  app.inject({ method: "GET", url, headers: acceptEncoding === undefined ? {} : { "accept-encoding": acceptEncoding } });

describe("compressed downloads of the built files", () => {
  test("M-06: a script asked for with br comes back as brotli bytes that decompress to the file", async () => {
    const response = await get("/assets/index-abc123.js", "gzip, deflate, br");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe("br");
    expect(response.headers["vary"]).toBe("accept-encoding");
    expect(response.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(response.headers["cache-control"]).toBe(YEAR);
    expect(brotliDecompressSync(response.rawPayload).toString("utf8")).toBe(SCRIPT);
    expect(response.rawPayload.length).toBeLessThan(Buffer.byteLength(SCRIPT) / 4);
    expect(Number(response.headers["content-length"])).toBe(response.rawPayload.length);
  });

  test("M-06: a script asked for with gzip only comes back as gzip bytes that decompress to the file", async () => {
    const response = await get("/assets/index-abc123.js", "gzip");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(response.headers["vary"]).toBe("accept-encoding");
    expect(response.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(response.headers["cache-control"]).toBe(YEAR);
    expect(gunzipSync(response.rawPayload).toString("utf8")).toBe(SCRIPT);
  });

  test("M-06: a script asked for with neither encoding comes back as the plain file", async () => {
    for (const acceptEncoding of [undefined, "identity", "deflate"]) {
      const response = await get("/assets/index-abc123.js", acceptEncoding);
      expect(response.statusCode, acceptEncoding).toBe(200);
      expect(response.headers["content-encoding"], acceptEncoding).toBeUndefined();
      expect(response.headers["vary"], acceptEncoding).toBe("accept-encoding");
      expect(response.headers["content-type"], acceptEncoding).toBe("text/javascript; charset=utf-8");
      expect(response.headers["cache-control"], acceptEncoding).toBe(YEAR);
      expect(response.body, acceptEncoding).toBe(SCRIPT);
    }
  });

  test("M-06: an encoding refused with q=0 is never sent, and a wildcard allows brotli", async () => {
    const cases: [string, string | undefined][] = [
      ["br;q=0, gzip", "gzip"],
      ["gzip;q=0, br;q=0", undefined],
      ["gzip;q=0", undefined],
      ["BR", "br"],
      ["*", "br"],
      ["br;q=0, *", "gzip"],
      ["gzip;q=0.5, br;q=0.1", "br"],
    ];
    for (const [acceptEncoding, expected] of cases) {
      const response = await get("/assets/index-abc123.js", acceptEncoding);
      expect(response.headers["content-encoding"], acceptEncoding).toBe(expected);
      expect(response.headers["vary"], acceptEncoding).toBe("accept-encoding");
      const body = expected === "br" ? brotliDecompressSync(response.rawPayload) : expected === "gzip" ? gunzipSync(response.rawPayload) : response.rawPayload;
      expect(body.toString("utf8"), acceptEncoding).toBe(SCRIPT);
    }
  });

  test("M-06: stylesheets and SVG files are compressed too, and keep their types", async () => {
    for (const [url, type, source] of [
      ["/assets/index-abc123.css", "text/css; charset=utf-8", STYLE],
      ["/assets/icon-abc123.svg", "image/svg+xml", ICON],
    ] as const) {
      const response = await get(url, "br, gzip");
      expect(response.statusCode, url).toBe(200);
      expect(response.headers["content-encoding"], url).toBe("br");
      expect(response.headers["vary"], url).toBe("accept-encoding");
      expect(response.headers["content-type"], url).toBe(type);
      expect(response.headers["cache-control"], url).toBe(YEAR);
      expect(brotliDecompressSync(response.rawPayload).toString("utf8"), url).toBe(source);
    }
  });

  test("M-06: a PNG or WOFF2 file is never compressed again, even when brotli is allowed", async () => {
    for (const [url, type, bytes] of [
      ["/assets/apple-touch-icon-abc123.png", "image/png", PNG],
      ["/assets/font-abc123.woff2", "font/woff2", FONT],
    ] as const) {
      const response = await get(url, "gzip, deflate, br");
      expect(response.statusCode, url).toBe(200);
      expect(response.headers["content-encoding"], url).toBeUndefined();
      expect(response.headers["vary"], url).toBe("accept-encoding");
      expect(response.headers["content-type"], url).toBe(type);
      expect(response.headers["cache-control"], url).toBe(YEAR);
      expect(Buffer.compare(response.rawPayload, bytes), url).toBe(0);
    }
  });

  test("M-06: a HEAD request for a script carries the encoding and the compressed length", async () => {
    const get = await app.inject({ method: "GET", url: "/assets/index-abc123.js", headers: { "accept-encoding": "br" } });
    const head = await app.inject({ method: "HEAD", url: "/assets/index-abc123.js", headers: { "accept-encoding": "br" } });
    expect(head.statusCode).toBe(200);
    expect(head.headers["content-encoding"]).toBe("br");
    expect(head.headers["vary"]).toBe("accept-encoding");
    expect(head.headers["content-length"]).toBe(get.headers["content-length"]);
  });

  test("M-06: a page's address gets the app as before, uncompressed and never cached", async () => {
    for (const url of ["/", "/b/abc123def456", "/b/not.a.board"]) {
      const response = await get(url, "gzip, deflate, br");
      expect(response.statusCode, url).toBe(200);
      expect(response.headers["content-type"], url).toBe("text/html; charset=utf-8");
      expect(response.headers["cache-control"], url).toBe("no-cache");
      expect(response.headers["content-encoding"], url).toBeUndefined();
      expect(response.body, url).toContain("<title>Steelman</title>");
    }
  });

  test("M-06: an unknown asset is a 404, and nothing outside the web app's folder is ever served", async () => {
    const missing = await get("/assets/missing.js", "br");
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ reason: "not_found" });
    expect(missing.headers["content-encoding"]).toBeUndefined();
    for (const url of ["/../outside.txt", "/assets/..%2F..%2Foutside.txt", "/%2e%2e/outside.txt", "/assets/..%2F..%2F..%2Foutside.txt"]) {
      const response = await get(url, "br, gzip");
      expect(response.body, url).not.toContain("not served");
      expect(response.headers["content-encoding"], url).toBeUndefined();
    }
  });

  test("M-06: an address under /api/ that isn't the API is still a 404, not the app", async () => {
    for (const url of ["/api/no-such-thing", "/api"]) {
      const response = await get(url, "br");
      expect(response.statusCode, url).toBe(404);
      expect(response.body, url).not.toContain("<title>");
    }
  });
});
