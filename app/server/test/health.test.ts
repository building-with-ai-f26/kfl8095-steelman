import { expect, test } from "vitest";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../src/app.ts";

const HOUR = 60 * 60 * 1000;

test("M0-1: the health route answers", async () => {
  const app = buildApp({
    clock: createFakeClock(new Date("2026-11-16T09:00:00Z")),
    ids: createSeededIds(1),
  });

  const response = await app.inject({ method: "GET", url: "/api/health" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: "ok", time: "2026-11-16T09:00:00.000Z" });
  await app.close();
});

test("M0-1: moving the clock an hour takes milliseconds, and the server sees it", async () => {
  const started = performance.now();
  const clock = createFakeClock(new Date("2026-11-16T09:00:00Z"));
  const app = buildApp({ clock, ids: createSeededIds(1) });

  const before = await app.inject({ method: "GET", url: "/api/health" });
  clock.advance(HOUR);
  const after = await app.inject({ method: "GET", url: "/api/health" });

  const serverSaw = Date.parse(after.json().time) - Date.parse(before.json().time);
  expect(serverSaw).toBe(HOUR);
  expect(performance.now() - started).toBeLessThan(1000);
  await app.close();
});
