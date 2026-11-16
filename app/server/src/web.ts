// Serving the built web app (M1-14a; plans/architecture.md §4: one service,
// one address, serves the app as well as the API). The built files are under
// /assets/, with hashed names, so they're cached for a year; every other
// address outside /api/ gets the app's page, never cached, which reads the
// address itself (links.ts), so a release reaches everyone on their next load.
//
// Nothing outside the web app's folder is ever read, whatever the address.

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { FastifyInstance } from "fastify";

const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const PAGE_TYPE = "text/html; charset=utf-8";

export function serveWebApp(app: FastifyInstance, directory: string): void {
  const root = normalize(directory + sep);
  // Read once, at start: a container without its page fails to start rather than answer 500s.
  const page = readFileSync(join(root, "index.html"));

  app.get("/*", async (request, reply) => {
    const path = decodeSafely(request.url.split("?")[0]!);
    if (path === null || path === "/api" || path.startsWith("/api/")) return reply.code(404).send({ reason: "not_found" });
    if (!path.startsWith("/assets/")) return reply.type(PAGE_TYPE).header("cache-control", "no-cache").send(page);

    const file = normalize(join(root, path));
    if (!file.startsWith(root)) return reply.code(404).send({ reason: "not_found" });
    try {
      const body = await readFile(file);
      return reply
        .type(TYPES[extname(file)] ?? "application/octet-stream")
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(body);
    } catch {
      return reply.code(404).send({ reason: "not_found" });
    }
  });
}

/** The path with %xx decoded once, or null if it can't be. */
function decodeSafely(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}
