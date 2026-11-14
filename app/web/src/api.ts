// The web app's way to the board's API. Each call goes as the person signed
// in (the browser sends their session cookie), or says which test account the
// tab is acting as (testUser.ts), and answers in the shared API types.

import type { Access, BoardChanges, BoardSnapshot, QueuedAction, Standing, WriteAnswer } from "@steelman/shared";
import { chosenTestUser } from "./testUser.ts";

/** The request never reached the service: the browser is offline, or the service is down. */
export class Unreachable extends Error {}

export type Answer = WriteAnswer | { status: "not_found" } | { status: "invalid" };

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const person = chosenTestUser();
  const headers: Record<string, string> = person ? { "x-steelman-test-user": person } : {};
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    return await fetch(`/api/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch (error) {
    throw new Unreachable(String(error));
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

/** The owner changes who can get in. Not queued: it needs the service there to answer. */
export async function setAccess(board: string, access: Access): Promise<Answer> {
  const response = await call("PUT", `boards/${board}/access`, access);
  if (response.status === 404) return { status: "not_found" };
  if (response.status === 400) return { status: "invalid" };
  if (response.status >= 500) throw new Unreachable(`The service answered ${response.status}`);
  return (await response.json()) as Answer;
}

/** Sends one queued action. Every write says what the result should be, so sending one twice is safe. */
export async function send(board: string, action: QueuedAction): Promise<Answer> {
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
        return call("DELETE", `${at}/versions/${action.versionId}`);
    }
  })();
  if (response.status === 404) return { status: "not_found" };
  if (response.status === 400) return { status: "invalid" };
  if (response.status >= 500) throw new Unreachable(`The service answered ${response.status}`);
  return (await response.json()) as Answer;
}
