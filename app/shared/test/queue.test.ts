import { describe, expect, test } from "vitest";
import { enqueue } from "@steelman/shared";
import type { QueuedAction } from "@steelman/shared";

// What the offline queue keeps (plans/architecture.md §3): actions in the
// order they were made, but for votes and assessments only your latest
// choice per item, since every write says what the result should be.

const importance = (argumentId: string, value: 1 | -1 | null): QueuedAction => ({ kind: "importance", argumentId, value });
const assess = (versionId: string, rev: number, supported: boolean | null): QueuedAction => ({ kind: "assess", versionId, rev, supported });

describe("the offline queue", () => {
  test("M-02: keeps actions in the order they were made", () => {
    const queue = [importance("a", 1), importance("b", -1)].reduce(enqueue, [] as QueuedAction[]);

    expect(queue).toEqual([importance("a", 1), importance("b", -1)]);
  });

  test("M-02: keeps only the latest vote on each item, placed where the latest one was made", () => {
    const queue = [importance("a", 1), importance("b", 1), importance("a", -1), importance("a", null)].reduce(enqueue, [] as QueuedAction[]);

    expect(queue).toEqual([importance("b", 1), importance("a", null)]);
  });

  test("M-02: an importance vote and an articulation vote on things with the same ID are different items", () => {
    const articulation: QueuedAction = { kind: "articulation", versionId: "a", value: 1 };
    const queue = [importance("a", 1), articulation].reduce(enqueue, [] as QueuedAction[]);

    expect(queue).toHaveLength(2);
  });

  test("M-02, B-03: a later assessment replaces an earlier one of the same wording, after anything queued between them", () => {
    const edit: QueuedAction = { kind: "edit", versionId: "v", baseRev: 1, wording: "Sharper.", context: "" };
    const queue = [assess("v", 1, true), edit, assess("v", 2, false)].reduce(enqueue, [] as QueuedAction[]);

    expect(queue).toEqual([edit, assess("v", 2, false)]);
  });

  test("M-02, A-06: things written are all kept, in order", () => {
    const first: QueuedAction = { kind: "edit", versionId: "v", baseRev: 1, wording: "One.", context: "" };
    const second: QueuedAction = { kind: "edit", versionId: "v", baseRev: 2, wording: "Two.", context: "" };
    const removal: QueuedAction = { kind: "delete", versionId: "v" };

    expect([first, second, removal].reduce(enqueue, [] as QueuedAction[])).toEqual([first, second, removal]);
  });

  test("M-02: leaves the queue it was given untouched", () => {
    const queue = Object.freeze([importance("a", 1)]) as QueuedAction[];

    enqueue(queue, importance("a", -1));

    expect(queue).toEqual([importance("a", 1)]);
  });
});
