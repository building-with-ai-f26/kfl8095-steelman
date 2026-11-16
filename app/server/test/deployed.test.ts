import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../src/app.ts";
import { resendEmail } from "../src/email.ts";

// The service as deployed (M1-14a; plans/architecture.md §4 and §6): one
// container serves the built web app as well as the API, sends sign-in codes
// through Resend, and writes one JSON line per request that Cloud Logging can
// read, holding no query string, email, or token.

const clock = createFakeClock(new Date("2026-11-16T12:00:00Z"));
const ids = createSeededIds(1401);

describe("serving the web app", () => {
  const web = mkdtempSync(join(tmpdir(), "steelman-web-"));
  writeFileSync(join(web, "index.html"), "<!doctype html><title>Steelman</title>");
  mkdirSync(join(web, "assets"));
  writeFileSync(join(web, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(tmpdir(), "outside.txt"), "not served");
  const app = buildApp({ clock, ids, mode: "production", webDirectory: web });
  beforeAll(() => app.ready());
  afterAll(() => app.close());

  test("M-06: any page's address gets the app, never cached, with the Content Security Policy", async () => {
    // An address with a dot in it is a page too, unless it's one of the built files.
    for (const url of ["/", "/b/abc123def456", "/b/abc123def456/v/x", "/account", "/privacy", "/b/not.a.board"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers["content-type"], url).toBe("text/html; charset=utf-8");
      expect(response.headers["cache-control"], url).toBe("no-cache");
      expect(response.headers["content-security-policy"], url).toBeDefined();
      expect(response.body).toContain("<title>Steelman</title>");
    }
  });

  test("M-06: the built files are served with their type, and kept a year (their names change when they do)", async () => {
    const response = await app.inject({ method: "GET", url: "/assets/index-abc123.js" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.body).toBe("console.log(1)");
  });

  test("M-07: a missing file is a 404, and nothing outside the web app's folder is ever served", async () => {
    expect((await app.inject({ method: "GET", url: "/assets/missing.js" })).statusCode).toBe(404);
    for (const url of ["/../outside.txt", "/assets/..%2F..%2Foutside.txt", "/%2e%2e/outside.txt"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.body, url).not.toContain("not served");
    }
  });

  test("M-06: an address under /api/ that isn't the API is a 404, not the app", async () => {
    for (const url of ["/api/no-such-thing", "/api"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(404);
      expect(response.body, url).not.toContain("<title>");
    }
  });
});

describe("sign-in codes by email, through Resend", () => {
  test("L-01: sends the code to the address, from the sending domain, with the API key", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
    };
    const email = resendEmail({ apiKey: "re_test", from: "Steelman <sign-in@send.steelman-argument.test>", fetch: fakeFetch });

    await email.sendSignInCode("ana@example.test", "123456");

    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://api.resend.com/emails");
    expect(sent[0]!.init.method).toBe("POST");
    expect(new Headers(sent[0]!.init.headers).get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse(String(sent[0]!.init.body));
    expect(body).toMatchObject({ from: "Steelman <sign-in@send.steelman-argument.test>", to: ["ana@example.test"], subject: "Your Steelman sign-in code: 123456" });
    expect(body.text).toContain("123456");
    expect(body.text).toContain("10 minutes");
  });

  test("L-01: a refusal from Resend is an error, which names neither the address nor the code", async () => {
    const email = resendEmail({ apiKey: "re_test", from: "x@y.test", fetch: async () => new Response("{}", { status: 422 }) });

    const failure = await email.sendSignInCode("ana@example.test", "123456").then(
      () => null,
      (error: Error) => error.message,
    );
    expect(failure).toBe("Resend refused the sign-in email: 422");
  });
});

describe("logs", () => {
  /** The app as deployed, writing its log lines into `lines`. */
  function logged(): { app: ReturnType<typeof buildApp>; lines: string[] } {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(...String(chunk).split("\n").filter(Boolean));
        done();
      },
    });
    return { app: buildApp({ clock, ids, mode: "production", logs: stream }), lines };
  }

  test("M-07: one JSON line per request, with severity, route, status, and duration, and no query string", async () => {
    const { app, lines } = logged();
    await app.ready();
    await app.inject({ method: "GET", url: "/api/health?email=ana%40example.test&token=secret" });
    await app.close();

    const done = lines.map((line) => JSON.parse(line)).find((entry) => entry.status === 200);
    expect(done).toMatchObject({ severity: "INFO", method: "GET", route: "/api/health", status: 200, time: "2026-11-16T12:00:00.000Z" });
    expect(typeof done.durationMs).toBe("number");
    expect(lines.join("\n")).not.toMatch(/ana|example\.test|secret|token/);
  });

  test("M-07: the route is logged as its pattern, so no board's link (its ID) reaches the logs", async () => {
    const { app, lines } = logged();
    await app.ready();
    await app.inject({ method: "GET", url: "/api/boards/abcdefghijkl/changes?after=3" });
    await app.close();

    expect(lines.join("\n")).not.toContain("abcdefghijkl");
  });

  test("M-07: a failure is logged as an error with its stack, and nothing else of the error", async () => {
    const { app, lines } = logged();
    app.get("/api/boom", async () => {
      throw Object.assign(new Error("duplicate key value"), { detail: "Key (email)=(ana@example.test) already exists." });
    });
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/boom?token=secret" });
    await app.close();

    expect(response.statusCode).toBe(500);
    const failure = lines.map((line) => JSON.parse(line)).find((entry) => entry.severity === "ERROR");
    expect(failure).toMatchObject({ route: "/api/boom", method: "GET" });
    expect(failure.message).toMatch(/^Error: duplicate key value\n\s+at /);
    expect(lines.join("\n")).not.toMatch(/ana@example|secret/);
  });
});
