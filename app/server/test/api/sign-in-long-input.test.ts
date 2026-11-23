import { afterEach, describe, expect, test, vi } from "vitest";
import { logLine } from "../../src/sign-in.ts";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";

// A very long value sent to a sign-in route (L-01; the security audit of
// Nov 22, SECURITY.md). Better Auth quotes the value in what it logs, and the
// pattern that masked emails in that line took time that grew with the square
// of the value's length: one signed-out request of a megabyte kept the service
// busy for many minutes. The line is now masked in one pass and cut short, and
// sign-in's routes take only small bodies.

const db = useTestDatabase({ migrated: true });
const api = useSignIn(db);

afterEach(() => vi.restoreAllMocks());

describe("what sign-in writes to the log", () => {
  test("L-01: an email address is masked", () => {
    expect(logLine("No account for dana@school.example.edu today")).toBe("No account for <email> today");
  });

  test("L-01: a megabyte with no spaces is handled at once, and the line is cut short", () => {
    const started = performance.now();
    const line = logLine(`Invalid callbackURL: https://x/${"a".repeat(1_000_000)}`);
    // The old pattern needed many minutes for this; one pass needs a few milliseconds.
    expect(performance.now() - started).toBeLessThan(1000);
    expect(line.length).toBeLessThanOrEqual(300);
  });

  test("L-01: an address past the cut is never left half shown", () => {
    const line = logLine(`${"a ".repeat(140)}first.last@school.example.edu and more`);
    expect(line).not.toContain("first.last");
    expect(line).not.toContain("school.example.edu");
  });
});

describe("a long value sent to a sign-in route", () => {
  test("L-01: a long callback address is refused, and the log holds a short line", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const answer = await api.request("POST", "/api/auth/sign-in/social", { body: { provider: "google", callbackURL: `https://x/${"a".repeat(8000)}` } });

    expect(answer.status).toBe(403);
    for (const [line] of logged.mock.calls) expect(String(line).length).toBeLessThanOrEqual(320);
  });

  test("L-01: a body larger than a sign-in request needs is refused before sign-in reads it", async () => {
    const answer = await api.request("POST", "/api/auth/sign-in/social", { body: { provider: "google", callbackURL: `https://x/${"a".repeat(40_000)}` } });

    expect(answer.status).toBe(413);
  });
});
