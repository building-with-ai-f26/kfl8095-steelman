import { expect, test } from "vitest";
import { ROLES, can } from "../src/index.ts";

// The two rows M3b-8 adds to the policy table (D-01), as permissions.md's
// matrix has them: `comment`, for anyone who can read, and `uncomment`, for
// the comment's author only. Both are allowed on a closed board (architecture
// §7), so a person can always take their own words back.

const OPEN = { closed: false };
const CLOSED = { closed: true };

test("D-01: anyone who can read may comment, on an open board and a closed one", () => {
  for (const board of [OPEN, CLOSED]) {
    for (const role of ROLES) expect(can("someone", role, "comment", board), `${role}, closed: ${board.closed}`).toBeNull();
    expect(can(null, null, "comment", board)).toBe("signed_out");
    expect(can("someone", null, "comment", board)).toBe("no_access");
  }
});

test("D-01: only the author may delete a comment, whatever their role, on an open board and a closed one", () => {
  for (const board of [OPEN, CLOSED]) {
    for (const role of ROLES) {
      expect(can("someone", role, "uncomment", board, "someone"), `${role}, closed: ${board.closed}`).toBeNull();
      expect(can("someone", role, "uncomment", board, "someone else"), `${role}, closed: ${board.closed}`).toBe("not_author");
    }
  }
});
