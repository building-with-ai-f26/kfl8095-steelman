import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("M0-1: .env.example holds names only, never values", () => {
  const lines = readFileSync(new URL("../.env.example", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("#"));

  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) expect(line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
});
