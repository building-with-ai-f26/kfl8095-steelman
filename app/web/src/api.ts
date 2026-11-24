// The web app's way to the board's API. Each call goes as the person signed
// in (the browser sends their session cookie), or says which test account the
// tab is acting as (testUser.ts), and answers in the shared API types.

import { tooManyMessage } from "@steelman/shared";
import type { Access, BoardChanges, BoardList, BoardSnapshot, CombinePreview, HistoryEntry, NewBoard, Person, PublicConfig, QueuedAction, ReportReason, Standing, WriteAnswer } from "@steelman/shared";
import { analyticsOn } from "./analyticsChoice.ts";
import { chosenTestUser } from "./testUser.ts";

/** The request never reached the service: the browser is offline, or the service is down. */
export class Unreachable extends Error {}

export type Answer = WriteAnswer | { status: "not_found" } | { status: "invalid" };

/** @param keepalive Lets the request finish after the tab closes. */
async function call(method: string, path: string, body?: unknown, keepalive = false): Promise<Response> {
  const person = chosenTestUser();
  const headers: Record<string, string> = person ? { "x-steelman-test-user": person } : {};
  // A write says when this browser's analytics are on, so the service may send its event (M2-12). Never on a read.
  if (method !== "GET" && analyticsOn()) headers["x-steelman-analytics"] = "on";
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    return await fetch(`/api/${path}`, { method, headers, keepalive, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch (error) {
    throw new Unreachable(String(error));
  }
}

/** What the service says the web app should know when it starts. When it can't be asked, analytics stay off. */
export async function readConfig(): Promise<PublicConfig> {
  try {
    const response = await call("GET", "config");
    return response.ok ? ((await response.json()) as PublicConfig) : { analytics: null };
  } catch {
    return { analytics: null };
  }
}

/** Why a board can't be read: there's no such board, or this person may not open it. */
export type Closed = "missing" | "no_access" | "signed_out";

/** The answer to a read the service refused, as a Closed, or null when it didn't refuse. */
function closedBy(response: Response): Closed | null {
  if (response.status === 404) return "missing";
  if (response.status === 403) return "no_access";
  if (response.status === 401) return "signed_out";
  return null;
}

export async function readBoard(board: string): Promise<(BoardSnapshot & Standing) | Closed> {
  const response = await call("GET", `boards/${board}`);
  const closed = closedBy(response);
  if (closed) return closed;
  if (!response.ok) throw new Error(`Reading the board failed: ${response.status}`);
  return (await response.json()) as BoardSnapshot & Standing;
}

export async function readChanges(board: string, after: number): Promise<(BoardChanges & Standing) | Closed> {
  const response = await call("GET", `boards/${board}/changes?after=${after}`);
  const closed = closedBy(response);
  if (closed) return closed;
  if (!response.ok) throw new Error(`Asking for changes failed: ${response.status}`);
  return (await response.json()) as BoardChanges & Standing;
}

/** Makes a board (F-01). Answers its ID, or what to tell the person. */
/** The boards this person is on (E-03), or why not: signed out, or the service can't be reached. */
export async function listBoards(): Promise<BoardList | "signed_out" | "failed"> {
  try {
    const response = await call("GET", "boards");
    if (response.status === 401) return "signed_out";
    return response.ok ? ((await response.json()) as BoardList) : "failed";
  } catch {
    return "failed";
  }
}

export async function createBoard(board: NewBoard): Promise<string | { problem: string }> {
  let response: Response;
  try {
    response = await call("POST", "boards", board);
  } catch (error) {
    if (!(error instanceof Unreachable)) throw error;
    return { problem: "Couldn’t reach Steelman. Try again." };
  }
  if (response.status === 401) return { problem: "You’ve been signed out. Reload the page to sign in." };
  if (response.status === 429) return { problem: tooManyMessage(((await response.json()) as { retryAfter: number }).retryAfter) };
  if (!response.ok) return { problem: "Steelman couldn’t make that board. Try again." };
  return ((await response.json()) as { board: string }).board;
}

/** The owner changes who can get in. Not queued: it needs the service there to answer. */
export async function setAccess(board: string, access: Access): Promise<Answer> {
  const response = await call("PUT", `boards/${board}/access`, access);
  if (response.status === 404) return { status: "not_found" };
  if (response.status === 400) return { status: "invalid" };
  if (response.status >= 500) throw new Unreachable(`The service answered ${response.status}`);
  return (await response.json()) as Answer;
}

/** Reports a wording (M2-3), or with `null` withdraws the reader's report. Not queued, like setAccess. */
export async function setReport(board: string, version: string, report: { reason: ReportReason; note: string } | null): Promise<Answer> {
  const path = `boards/${board}/versions/${encodeURIComponent(version)}/report`;
  const response = report ? await call("PUT", path, report) : await call("DELETE", path);
  if (response.status === 404) return { status: "not_found" };
  if (response.status === 400) return { status: "invalid" };
  if (response.status >= 500) throw new Unreachable(`The service answered ${response.status}`);
  return (await response.json()) as Answer;
}

/** An Editor or the Owner hides a wording with a reason (M2-4), or with `null` restores it. Not queued. */
export async function setHidden(board: string, version: string, reason: ReportReason | null): Promise<Answer> {
  const path = `boards/${board}/versions/${encodeURIComponent(version)}/hidden`;
  const response = reason ? await call("PUT", path, { reason }) : await call("DELETE", path);
  if (response.status === 404) return { status: "not_found" };
  if (response.status === 400) return { status: "invalid" };
  if (response.status >= 500) throw new Unreachable(`The service answered ${response.status}`);
  return (await response.json()) as Answer;
}

/** Options (M3a-2, A-07): an Editor or the Owner adds one with the ID the browser made, renames one, or deletes an empty one. Not queued. */
export async function addOption(board: string, option: { id: string; name: string }): Promise<Answer> {
  return answerOf(await call("POST", `boards/${board}/options`, option));
}

export async function renameOption(board: string, option: string, name: string): Promise<Answer> {
  return answerOf(await call("PUT", `boards/${board}/options/${encodeURIComponent(option)}`, { name }));
}

/** Renames the board's question (M3b-2, I-01): the Owner's, in Settings. */
export async function renameQuestion(board: string, question: string): Promise<Answer> {
  return answerOf(await call("PUT", `boards/${board}/question`, { question }));
}

/** `keepalive`, when the tab is closing and the request must finish after the page is gone. */
export async function deleteOption(board: string, option: string, keepalive = false): Promise<Answer> {
  return answerOf(await call("DELETE", `boards/${board}/options/${encodeURIComponent(option)}`, undefined, keepalive));
}

/** Reports that a source can't be opened (M3a-3, C-02), or with `false` withdraws or clears the report. Not queued. */
export async function setUnavailable(board: string, source: string, unavailable: boolean): Promise<Answer> {
  return answerOf(await call(unavailable ? "PUT" : "DELETE", `boards/${board}/sources/${encodeURIComponent(source)}/unavailable`));
}

async function answerOf(response: Response): Promise<Answer> {
  if (response.status === 404) return { status: "not_found" };
  if (response.status === 400) return { status: "invalid" };
  if (response.status >= 500) throw new Unreachable(`The service answered ${response.status}`);
  return (await response.json()) as Answer;
}

/** Everyone on the board, for Share's people list (M2-2b), or null when it can't be read now. */
export async function readPeople(board: string): Promise<Person[] | null> {
  try {
    const response = await call("GET", `boards/${board}/people`);
    return response.ok ? ((await response.json()) as { people: Person[] }).people : null;
  } catch (error) {
    if (error instanceof Unreachable) return null;
    throw error;
  }
}

/** The board's History (M3a-4, J-03), newest first, or null when it can't be read now. */
export async function readHistory(board: string): Promise<HistoryEntry[] | null> {
  try {
    const response = await call("GET", `boards/${board}/history`);
    return response.ok ? ((await response.json()) as { entries: HistoryEntry[] }).entries : null;
  } catch (error) {
    if (error instanceof Unreachable) return null;
    throw error;
  }
}

/** Restores a deleted option from History (M3a-4). Not queued. */
export async function restoreOption(board: string, option: string): Promise<Answer> {
  return answerOf(await call("PUT", `boards/${board}/options/${encodeURIComponent(option)}/restore`));
}

/** Cites a source already on the board on a wording: from History, putting back one taken off (M3a-4). Not queued. */
export async function citeSource(board: string, version: string, source: string): Promise<Answer> {
  return answerOf(await call("PUT", `boards/${board}/versions/${encodeURIComponent(version)}/sources/${encodeURIComponent(source)}`));
}

/** Combines a wording into another argument in its option (M3a-7, A-10). Not queued, like a moderator's action. */
export async function combineWording(board: string, version: string, into: string): Promise<Answer> {
  return answerOf(await call("POST", `boards/${board}/versions/${encodeURIComponent(version)}/combine`, { into }));
}

/** Makes a wording its own argument, with the ID the browser made for it (M3a-7). Not queued. */
export async function separateWording(board: string, version: string, argumentId: string): Promise<Answer> {
  return answerOf(await call("POST", `boards/${board}/versions/${encodeURIComponent(version)}/separate`, { argumentId }));
}

/** Undoes a combine or a separation by its change number (M3a-7, J-04). Not queued. */
export async function undoChange(board: string, seq: number): Promise<Answer> {
  return answerOf(await call("PUT", `boards/${board}/changes/${seq}/undo`));
}

/** What combining a wording into an argument would do (M3a-7): whether the arguments become one, and who'd be asked to vote again. Null when it can't be read now. */
export async function readCombinePreview(board: string, version: string, into: string): Promise<CombinePreview | null> {
  try {
    const response = await call("GET", `boards/${board}/versions/${encodeURIComponent(version)}/combine?into=${encodeURIComponent(into)}`);
    return response.ok ? ((await response.json()) as CombinePreview) : null;
  } catch (error) {
    if (error instanceof Unreachable) return null;
    throw error;
  }
}

/** The owner sets someone's role. Not queued, like setAccess. */
export async function setRole(board: string, account: string, role: Exclude<Person["role"], "owner">): Promise<Answer> {
  const response = await call("PUT", `boards/${board}/people/${encodeURIComponent(account)}`, { role });
  if (response.status === 404) return { status: "not_found" };
  if (response.status === 400) return { status: "invalid" };
  if (response.status >= 500) throw new Unreachable(`The service answered ${response.status}`);
  return (await response.json()) as Answer;
}

/**
 * Sends one queued action. Every write says what the result should be, so sending one twice is safe.
 * @param keepalive For a removal sent as the tab closes, which has to arrive after the page is gone.
 */
export async function send(board: string, action: QueuedAction, keepalive = false): Promise<Answer> {
  const at = `boards/${board}`;
  const response = await (() => {
    switch (action.kind) {
      case "importance":
        return call("PUT", `${at}/arguments/${action.argumentId}/importance`, { value: action.value });
      case "articulation":
        return call("PUT", `${at}/versions/${action.versionId}/articulation`, { value: action.value });
      case "assess":
        return call("PUT", `${at}/versions/${action.versionId}/assessment`, { rev: action.rev, supported: action.supported });
      case "addArgument":
        return call("POST", `${at}/arguments`, { id: action.id, optionId: action.optionId, versionId: action.versionId, wording: action.wording, context: action.context });
      case "addWording":
        return call("POST", `${at}/arguments/${action.argumentId}/versions`, { id: action.id, wording: action.wording, context: action.context });
      case "edit":
        return call("PUT", `${at}/versions/${action.versionId}`, { baseRev: action.baseRev, wording: action.wording, context: action.context });
      case "delete":
        return call("DELETE", `${at}/versions/${action.versionId}`, undefined, keepalive);
      case "addSource":
        return call("POST", `${at}/versions/${action.versionId}/sources`, { id: action.id, name: action.name, locator: action.locator, finding: action.finding, backsUp: "", limits: "" });
      case "editSource":
        return call("PUT", `${at}/sources/${action.sourceId}`, { name: action.name, locator: action.locator, finding: action.finding, backsUp: action.backsUp, limits: action.limits });
      case "uncite":
        return call("DELETE", `${at}/versions/${action.versionId}/sources/${action.sourceId}`, undefined, keepalive);
    }
  })();
  if (response.status === 404) return { status: "not_found" };
  if (response.status === 400) return { status: "invalid" };
  if (response.status >= 500) throw new Unreachable(`The service answered ${response.status}`);
  return (await response.json()) as Answer;
}

/** Whether this account has been shown the tour (L-02), or null when the service can't say, and then it doesn't show. */
export async function readTour(): Promise<boolean | null> {
  try {
    const response = await call("GET", "account/tour");
    return response.ok ? ((await response.json()) as { seen: boolean }).seen : null;
  } catch {
    return null;
  }
}

/** Tells the service the tour has been shown, so it isn't shown again on any device. If this doesn't arrive, it shows once more. */
export async function markTourSeen(): Promise<void> {
  try {
    await call("PUT", "account/tour");
  } catch {
    // Nothing to tell the reader: at worst the tour opens again on their next board.
  }
}

/** Your account (M-07): who you are and how you sign in. */
export interface MyAccount {
  username: string | null;
  email: string | null;
  signIn: string[];
}

export async function readMyAccount(): Promise<MyAccount | "signed_out"> {
  const response = await call("GET", "account");
  if (response.status === 401) return "signed_out";
  if (!response.ok) throw new Error(`Reading your account failed: ${response.status}`);
  return (await response.json()) as MyAccount;
}

/** Download your data: saves steelman-data.json. Through fetch, so a tab acting as a test account downloads that account's. */
export async function downloadMyData(): Promise<boolean> {
  try {
    const response = await call("GET", "account/data");
    if (!response.ok) return false;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    link.download = "steelman-data.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2_000);
    return true;
  } catch {
    return false;
  }
}

/** Delete account, confirmed by the username they typed. */
export async function deleteMyAccount(username: string): Promise<"done" | "wrong_username" | "failed"> {
  try {
    const response = await call("POST", "account/delete", { username });
    if (response.ok) return "done";
    return response.status === 400 ? "wrong_username" : "failed";
  } catch {
    return "failed";
  }
}
