import { expect, test } from "vitest";
import { chooseDatabase } from "./support/postgres.ts";

test("M0-1: with Docker running, the test database runs in Docker", () => {
  expect(chooseDatabase({ requested: undefined, dockerRunning: true })).toBe("docker");
});

test("M0-1: with Docker stopped, the test database is the one installed from npm", () => {
  expect(chooseDatabase({ requested: undefined, dockerRunning: false })).toBe("embedded");
});

test("M0-1: TEST_DATABASE=embedded skips Docker even when it is running", () => {
  expect(chooseDatabase({ requested: "embedded", dockerRunning: true })).toBe("embedded");
});

test("M0-1: TEST_DATABASE=docker fails loudly when Docker is stopped, instead of quietly switching", () => {
  expect(() => chooseDatabase({ requested: "docker", dockerRunning: false })).toThrow(/Docker/);
});

test("M0-1: an unknown TEST_DATABASE value is refused", () => {
  expect(() => chooseDatabase({ requested: "sqlite", dockerRunning: true })).toThrow(/TEST_DATABASE/);
});
