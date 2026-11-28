import { describe, expect, test } from "vitest";
import { emailAddress } from "../src/inputs.ts";

// One email address, one account (L-01, L-04; build plan M3d-32, finding F7).
// emailAddress() is the one form of an address that the service stores and
// compares: its ends trimmed, Unicode NFKC applied, then its case lowered, in
// the same order as the database's unique index, lower(normalize(email, NFKC)).

describe("an email address's one form", () => {
  test("L-01: capitals don't count", () => {
    expect(emailAddress("Dana.Reyes@School.Example.EDU")).toBe("dana.reyes@school.example.edu");
  });

  test("L-01: spaces and line breaks at either end are trimmed", () => {
    expect(emailAddress("  dana@x.edu \n")).toBe("dana@x.edu");
    expect(emailAddress("\tdana@x.edu")).toBe("dana@x.edu");
  });

  test("L-01: a composed and a decomposed é are one letter", () => {
    const composed = "café@x.edu";
    const decomposed = "café@x.edu";
    expect(decomposed).not.toBe(composed);
    expect(emailAddress(decomposed)).toBe(composed);
    expect(emailAddress(composed)).toBe(composed);
  });

  test("L-01: full-width letters are the plain letters", () => {
    expect(emailAddress("Ｄana@x.edu")).toBe("dana@x.edu");
    expect(emailAddress("ｄana@x.edu")).toBe("dana@x.edu");
    // A full-width @ is an @.
    expect(emailAddress("dana＠x.edu")).toBe("dana@x.edu");
  });

  test("L-01: an address already in its one form stays as it is", () => {
    expect(emailAddress("x@a.bb-c.com")).toBe("x@a.bb-c.com");
    expect(emailAddress("c.com-v@target.com")).toBe("c.com-v@target.com");
  });

  test("L-01: Gmail's dotted and plus-tagged forms stay separate addresses", () => {
    expect(emailAddress("jane.doe@gmail.com")).toBe("jane.doe@gmail.com");
    expect(emailAddress("janedoe+steelman@gmail.com")).toBe("janedoe+steelman@gmail.com");
  });

  test("L-01: spaces inside an address are kept, so a bad address isn't made to look good", () => {
    expect(emailAddress("dana @x.edu")).toBe("dana @x.edu");
  });
});
