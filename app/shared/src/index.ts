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
  COMMENT_MAX,
  LIMITS,
  OPTIONS_PER_BOARD,
  RESERVED_USERNAMES,
  USERNAME,
  boardIdInput,
  cleanText,
  commentBodyInput,
  contextInput,
  isAllowedUsername,
  itemIdInput,
  optionNameInput,
  questionInput,
  sourceInput,
  webLink,
  wordingInput,
} from "./inputs.ts";
export type { SourceInput } from "./inputs.ts";
export { LINK_ROLES, POLICY, ROLES, can } from "./policy.ts";
export type { Action, Refusal, Role } from "./policy.ts";
export { posthogAssetsHost, tooManyMessage } from "./api.ts";
export { MEMBER_ROLES, REPORT_REASONS, accessInput, assessmentInput, changesQuery, deleteAccountInput, editInput, hideInput, memberRoleInput, newArgumentInput, newBoardInput, newCommentInput, newOptionInput, newSourceInput, newWordingInput, renameOptionInput, renameQuestionInput, closingInput, inviteInput, reportInput, voteInput, combineInput, separateInput } from "./api.ts";
export type {
  Access,
  ArgumentRow,
  CombinePreview,
  BoardChanges,
  BoardList,
  BoardListing,
  BoardSnapshot,
  HistoryEntry, LogRow,
  NewBoard,
  OptionRow,
  Person,
  PublicConfig,
  RefusalReason,
  ReportReason,
  SourceRow,
  Standing,
  VersionRow,
  WriteAnswer,
} from "./api.ts";
export { leaveOut, openView, pillCount, pressUpdate, putBack, receive, showMoved } from "./sync.ts";
export type { BoardRows, ReaderView } from "./sync.ts";
export { CASE_SIZE, strongestCase } from "./strongest.ts";
export { closedSince, closingOf } from "./closing.ts";
export type { Closing } from "./closing.ts";
export type { CaseItem, OptionCase } from "./strongest.ts";
export { enqueue } from "./queue.ts";
export type { QueuedAction } from "./queue.ts";
