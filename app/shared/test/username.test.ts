import { describe, expect, test } from "vitest";
import { isAllowedUsername, USERNAME } from "../src/inputs.ts";

// The username rule the sign-in service and the sign-in screen share (L-01).

describe("how long a username can be", () => {
  test("L-01: 3 to 20 characters", () => {
    expect(USERNAME).toMatchObject({ min: 3, max: 20 });
    expect(isAllowedUsername("abc")).toBe(true);
    expect(isAllowedUsername("a".repeat(20))).toBe(true);
    expect(isAllowedUsername("ab")).toBe(false);
    expect(isAllowedUsername("a".repeat(21))).toBe(false);
  });
});
