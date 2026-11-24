import { expect, test } from "vitest";
import { ROLES, can } from "../src/index.ts";

// The two rows M3b-2 adds to the policy table (I-01, I-05): `settings`, the
// Owner's, refused on a closed board; and `close`, the Owner's, allowed on a
// closed board, since reopening acts on one.

const OPEN = { closed: false };
const CLOSED = { closed: true };

test("I-01: only the Owner may change a board's settings, and not once it is closed", () => {
  for (const role of ROLES) expect(can("someone", role, "settings", OPEN), role).toBe(role === "owner" ? null : "not_allowed");
  expect(can("someone", "owner", "settings", CLOSED)).toBe("board_closed");
  expect(can(null, null, "settings", OPEN)).toBe("signed_out");
  expect(can("someone", null, "settings", OPEN)).toBe("no_access");
});

test("I-05: only the Owner may close or reopen a board, on an open board and on a closed one", () => {
  for (const board of [OPEN, CLOSED]) {
    for (const role of ROLES) expect(can("someone", role, "close", board), `${role}, closed: ${board.closed}`).toBe(role === "owner" ? null : "not_allowed");
    expect(can(null, null, "close", board)).toBe("signed_out");
    expect(can("someone", null, "close", board)).toBe("no_access");
  }
});
