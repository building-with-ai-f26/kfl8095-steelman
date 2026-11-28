// Serving the built web app (M1-14a; plans/architecture.md §4: one service,
// one address, serves the app as well as the API). The built files are under
// /assets/, with hashed names, so they're cached for a year; every other
// address outside /api/ gets the app's page, never cached, which reads the
// address itself (links.ts), so a release reaches everyone on their next load.
//
// The JavaScript, CSS, and SVG files under /assets/ are compressed once, at
// start, as brotli and as gzip, and kept in memory beside the plain bytes
// (M-06, F12, M3d-30). A request gets brotli when its accept-encoding allows
// it, else gzip when that is allowed, else the plain file, and every asset
// answer says it varies by accept-encoding so a cache never hands one to a
// browser that asked for another. PNG and WOFF2 files are already compressed,
// so they're read from disk and sent as they are.
//
// Nothing outside the web app's folder is ever read, whatever the address.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";

const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const PAGE_TYPE = "text/html; charset=utf-8";
const YEAR = "public, max-age=31536000, immutable";
const COMPRESSED = new Set([".js", ".css", ".svg"]);

type Encodings = { plain: Buffer; br: Buffer; gzip: Buffer };

export function serveWebApp(app: FastifyInstance, directory: string): void {
  const root = normalize(directory + sep);
  // Read once, at start: a container without its page fails to start rather than answer 500s.
  const page = readFileSync(join(root, "index.html"));
  const compressed = compressAssets(root);

  app.get("/*", async (request, reply) => {
    const path = decodeSafely(request.url.split("?")[0]!);
    if (path === null || path === "/api" || path.startsWith("/api/")) return reply.code(404).send({ reason: "not_found" });
    if (!path.startsWith("/assets/")) return reply.type(PAGE_TYPE).header("cache-control", "no-cache").send(page);

    const file = normalize(join(root, path));
    if (!file.startsWith(root)) return reply.code(404).send({ reason: "not_found" });
    const type = TYPES[extname(file)] ?? "application/octet-stream";

    const kept = compressed.get(file);
    if (kept) {
      const encoding = chooseEncoding(request.headers["accept-encoding"]);
      reply.type(type).header("cache-control", YEAR).header("vary", "accept-encoding");
      if (encoding) reply.header("content-encoding", encoding);
      return reply.send(encoding ? kept[encoding] : kept.plain);
    }
    try {
      const body = await readFile(file);
      return reply.type(type).header("cache-control", YEAR).header("vary", "accept-encoding").send(body);
    } catch {
      return reply.code(404).send({ reason: "not_found" });
    }
  });
}

/**
 * Every JavaScript, CSS, and SVG file under `root`/assets/, plain and compressed,
 * keyed by its normalized path. A web folder without assets/ has none.
 */
function compressAssets(root: string): Map<string, Encodings> {
  const kept = new Map<string, Encodings>();
  const assets = join(root, "assets");
  if (!existsSync(assets)) return kept;
  for (const name of readdirSync(assets, { recursive: true, encoding: "utf8" })) {
    const file = normalize(join(assets, name));
    if (!COMPRESSED.has(extname(file)) || !statSync(file).isFile()) continue;
    const plain = readFileSync(file);
    const br = brotliCompressSync(plain, {
      params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT, [constants.BROTLI_PARAM_SIZE_HINT]: plain.length },
    });
    kept.set(file, { plain, br, gzip: gzipSync(plain, { level: constants.Z_BEST_COMPRESSION }) });
  }
  return kept;
}

/**
 * Brotli when the accept-encoding header allows it, else gzip when it allows
 * that, else null for the plain file. An encoding is allowed when it's named,
 * or covered by `*`, with a weight above zero; no header allows neither.
 */
function chooseEncoding(header: string | undefined): "br" | "gzip" | null {
  if (!header) return null;
  const weights = new Map<string, number>();
  for (const part of header.toLowerCase().split(",")) {
    const [name, ...params] = part.split(";").map((piece) => piece.trim());
    if (!name) continue;
    const q = params.find((param) => param.startsWith("q="));
    const weight = q === undefined ? 1 : Number(q.slice(2));
    weights.set(name, Number.isFinite(weight) ? weight : 0);
  }
  const allowed = (encoding: string) => (weights.get(encoding) ?? weights.get("*") ?? 0) > 0;
  if (allowed("br")) return "br";
  if (allowed("gzip")) return "gzip";
  return null;
}

/** The path with %xx decoded once, or null if it can't be. */
function decodeSafely(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}
