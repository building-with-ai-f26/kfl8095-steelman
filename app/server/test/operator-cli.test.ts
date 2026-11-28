import { describe, expect, test } from "vitest";
import { parseOperatorArgs, report } from "../src/jobs/operator.ts";

// The operator's commands (J-06, M3d-36; finding F8 of the public-spaces
// security review), as the steelman-operator job reads them from its
// arguments: `suspend <username>`, `unsuspend <username>`, and
// `make-private <space id>`. Each outcome is one plain sentence, and only a
// name or ID that matches nothing fails, so the job exits with an error. No
// database: suspension.test.ts runs the commands.

const USAGE = "Run one command: suspend <username>, unsuspend <username>, or make-private <space ID>.";

describe("parsing the operator's commands", () => {
  test("J-06: suspend, unsuspend, and make-private each take one name or ID", () => {
    expect(parseOperatorArgs(["suspend", "lin_zhao"])).toEqual({ command: "suspend", username: "lin_zhao" });
    expect(parseOperatorArgs(["unsuspend", "lin_zhao"])).toEqual({ command: "unsuspend", username: "lin_zhao" });
    expect(parseOperatorArgs(["make-private", "AbCdEfGhIjKlMnOpQrSt"])).toEqual({ command: "make-private", space: "AbCdEfGhIjKlMnOpQrSt" });
  });

  test("J-06: spaces around a name or ID don't count", () => {
    expect(parseOperatorArgs([" suspend ", " lin_zhao "])).toEqual({ command: "suspend", username: "lin_zhao" });
  });

  test("J-06: no command, an unknown one, or the wrong number of words says how to run it", () => {
    for (const args of [[], ["suspend"], ["suspend", ""], ["suspend", "a", "b"], ["delete", "lin_zhao"], ["make-private"]]) {
      expect(parseOperatorArgs(args), JSON.stringify(args)).toEqual({ error: USAGE });
    }
  });
});

describe("what each command says", () => {
  test("J-06: suspend says who is suspended and how many sessions ended", () => {
    expect(report({ command: "suspend", result: "done", username: "lin_zhao", ended: 2 })).toEqual({ ok: true, sentence: "lin_zhao is now suspended, and Steelman signed them out of 2 sessions." });
    expect(report({ command: "suspend", result: "done", username: "lin_zhao", ended: 1 })).toEqual({ ok: true, sentence: "lin_zhao is now suspended, and Steelman signed them out of 1 session." });
    expect(report({ command: "suspend", result: "done", username: "lin_zhao", ended: 0 })).toEqual({ ok: true, sentence: "lin_zhao is now suspended, and they had no sessions to end." });
  });

  test("J-06: suspend run twice says the account is already suspended, and still says when a session ended", () => {
    expect(report({ command: "suspend", result: "already", username: "lin_zhao", ended: 0 })).toEqual({ ok: true, sentence: "lin_zhao is already suspended." });
    expect(report({ command: "suspend", result: "already", username: "lin_zhao", ended: 1 })).toEqual({ ok: true, sentence: "lin_zhao is already suspended, and Steelman signed them out of 1 session." });
  });

  test("J-06: unsuspend says they can sign in again, or that they weren't suspended", () => {
    expect(report({ command: "unsuspend", result: "done", username: "lin_zhao" })).toEqual({ ok: true, sentence: "lin_zhao is no longer suspended and can sign in again." });
    expect(report({ command: "unsuspend", result: "already", username: "lin_zhao" })).toEqual({ ok: true, sentence: "lin_zhao isn’t suspended." });
  });

  test("J-06: make-private says the space is private now, or already was", () => {
    expect(report({ command: "make-private", result: "done", space: "S1" })).toEqual({ ok: true, sentence: "Space S1 is now private, and its members stay in it." });
    expect(report({ command: "make-private", result: "already", space: "S1" })).toEqual({ ok: true, sentence: "Space S1 is already private." });
  });

  test("J-06: an unknown username or space ID says so and fails", () => {
    expect(report({ command: "suspend", result: "unknown", username: "nobody" })).toEqual({ ok: false, sentence: "No account has the username nobody." });
    expect(report({ command: "unsuspend", result: "unknown", username: "nobody" })).toEqual({ ok: false, sentence: "No account has the username nobody." });
    expect(report({ command: "make-private", result: "unknown", space: "S1" })).toEqual({ ok: false, sentence: "No space has the ID S1." });
  });
});
