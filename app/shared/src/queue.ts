// What the offline queue keeps (plans/architecture.md §3). While offline,
// the browser holds the reader's actions in memory and sends them, in
// order, when it's back.
//
// Every write says what the result should be, so for votes and assessments
// the queue keeps only the latest choice per item. The latest goes where it
// was made, after anything it might depend on (an assessment of a revision
// the reader's own queued edit creates, say). Things written are all kept.

export type QueuedAction =
  | { kind: "importance"; argumentId: string; value: 1 | -1 | null }
  | { kind: "articulation"; versionId: string; value: 1 | -1 | null }
  | { kind: "assess"; versionId: string; rev: number; supported: boolean | null }
  | { kind: "addArgument"; id: string; optionId: string; versionId: string; wording: string; context: string }
  | { kind: "addWording"; argumentId: string; id: string; wording: string; context: string }
  | { kind: "edit"; versionId: string; baseRev: number; wording: string; context: string }
  | { kind: "delete"; versionId: string };

/** Which item a choice is about, for the kinds where only the latest counts. */
function choiceKey(action: QueuedAction): string | null {
  if (action.kind === "importance") return `importance:${action.argumentId}`;
  if (action.kind === "articulation") return `articulation:${action.versionId}`;
  if (action.kind === "assess") return `assess:${action.versionId}`;
  return null;
}

export function enqueue(queue: readonly QueuedAction[], action: QueuedAction): QueuedAction[] {
  const key = choiceKey(action);
  const kept = key === null ? queue : queue.filter((queued) => choiceKey(queued) !== key);
  return [...kept, action];
}
