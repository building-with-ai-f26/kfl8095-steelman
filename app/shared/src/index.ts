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
  SPACE_LIMITS,
  USERNAME,
  boardIdInput,
  cleanText,
  commentBodyInput,
  contextInput,
  emailAddress,
  isAllowedUsername,
  itemIdInput,
  optionNameInput,
  questionInput,
  sourceInput,
  spaceAboutInput,
  spaceNameInput,
  webLink,
  wordingInput,
} from "./inputs.ts";
export type { SourceInput } from "./inputs.ts";
export { CODE_LASTS_MINUTES, SESSION_LASTS_DAYS, SIGN_IN_CODES_COUNTED_HOURS, SIGN_IN_EMAILS_KEPT_HOURS, USERNAME_HELD_DAYS, USERNAME_HOLD_DAYS } from "./periods.ts";
export { LINK_ROLES, POLICY, ROLES, can } from "./policy.ts";
export type { Action, Refusal, Role } from "./policy.ts";
export { SPACE_POLICY, SPACE_ROLES, canInSpace } from "./policy.ts";
export type { SpaceAction, SpaceRole } from "./policy.ts";
export { NEW_SPACE_VISIBILITIES, PUBLIC_SPACES, SPACE_CANVASES, SPACE_MEMBER_ROLES, SPACE_VISIBILITIES, newSpaceInput, spaceInviteInput, spaceRoleInput, spaceSettingsInput, spaceVisibilityInput } from "./api.ts";
export type { BoardSpace, FoundSpace, FoundSpaces, MakePublicCounts, SpaceCanvas, SpaceList, SpaceMember, SpaceSummary, SpaceVisibility, SpaceWriteAnswer } from "./api.ts";
export { PUBLIC_SPACES_MOST, SPACE_ADMINS_POST, peopleIn, postingIn, posthogAssetsHost, tooManyMessage } from "./api.ts";
export { MEMBER_ROLES, REPORT_REASONS, accessInput, assessmentInput, boardSpaceInput, changesQuery, deleteAccountInput, usernameChangeInput, editInput, hideInput, memberRoleInput, newArgumentInput, newBoardInput, newCommentInput, newOptionInput, newSourceInput, newWordingInput, renameOptionInput, renameQuestionInput, closingInput, inviteInput, reportInput, voteInput, combineInput, separateInput } from "./api.ts";
export type {
  Access,
  ArgumentRow,
  CombinePreview,
  CommentLinkState,
  CommentRow,
  BoardChanges,
  BoardList,
  AccountStatistics,
  Profile,
  ProfileItem,
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
  UsernameChangeAnswer,
  VersionRow,
  WriteAnswer,
} from "./api.ts";
export { leaveOut, openView, pillCount, pressUpdate, putBack, receive, showMoved } from "./sync.ts";
export type { BoardRows, ReaderView } from "./sync.ts";
export { openCount, subjectStands, threadsOn } from "./comments.ts";
export type { CommentTarget, Thread } from "./comments.ts";
export { CASE_SIZE, rankLive, strongestCase } from "./strongest.ts";
export { closedSince, closingOf } from "./closing.ts";
export type { Closing } from "./closing.ts";
export type { CaseItem, OptionCase } from "./strongest.ts";
export { enqueue } from "./queue.ts";
export type { QueuedAction } from "./queue.ts";
