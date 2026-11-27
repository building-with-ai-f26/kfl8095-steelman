import { expect, test } from "vitest";
import { environmentOf } from "../src/events.ts";

// Production moves to the bare address, steelman-argument.com, in M3d-12
// (plans/build-plan.md M3d-12, plans/architecture.md Q13). The service tags each
// event it sends with the host it was asked on, so this checks that the bare
// address and www are tagged as production, with or without a port, and that
// staging stays staging.

test("M-08: the bare address steelman-argument.com counts as production", () => {
  expect(environmentOf("steelman-argument.com")).toBe("production");
  expect(environmentOf("steelman-argument.com:443")).toBe("production");
});

test("M-08: www.steelman-argument.com counts as production", () => {
  expect(environmentOf("www.steelman-argument.com")).toBe("production");
});

test("M-08: staging.steelman-argument.com still counts as staging after the move", () => {
  expect(environmentOf("staging.steelman-argument.com")).toBe("staging");
  expect(environmentOf("staging.steelman-argument.com:443")).toBe("staging");
});
