// The rules both the server and the browser follow. Everything exported from
// here is a pure function or a type: same input, same output, no clock, no
// network, no database (plans/architecture.md §4).

export type { Clock } from "./clock.ts";
export { BOARD_ID_BYTES, ITEM_ID_BYTES, idFromBytes, idSourceFrom } from "./ids.ts";
export type { IdSource } from "./ids.ts";

export { nextBoardOrder, nextOrder } from "./order.ts";
export type { BoardCounts, BoardOrder, Ranked } from "./order.ts";
export { fewestMoves, staleCount } from "./stale.ts";
export { FEW_ASSESSMENTS_BELOW, METER_SEGMENTS, credibility, credibilityLabel } from "./credibility.ts";
export type { Credibility } from "./credibility.ts";
export {
  LIMITS,
  OPTIONS_PER_BOARD,
  boardIdInput,
  cleanText,
  contextInput,
  itemIdInput,
  optionNameInput,
  questionInput,
  sourceInput,
  webLink,
  wordingInput,
} from "./inputs.ts";
export type { SourceInput } from "./inputs.ts";
export { POLICY, can } from "./policy.ts";
export type { Action, Refusal } from "./policy.ts";
export { assessmentInput, changesQuery, editInput, newArgumentInput, newWordingInput, voteInput } from "./api.ts";
export type {
  ArgumentRow,
  BoardChanges,
  BoardSnapshot,
  LogRow,
  OptionRow,
  RefusalReason,
  SourceRow,
  VersionRow,
  WriteAnswer,
} from "./api.ts";
export { openView, pillCount, pressUpdate, receive } from "./sync.ts";
export type { BoardRows, ReaderView } from "./sync.ts";
export { enqueue } from "./queue.ts";
export type { QueuedAction } from "./queue.ts";
