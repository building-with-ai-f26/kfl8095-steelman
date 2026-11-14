// The web app's way to the board's API. Each call goes as the person signed
// in (the browser sends their session cookie), or says which test account the
// tab is acting as (testUser.ts), and answers in the shared API types.

import type { BoardChanges, BoardSnapshot, QueuedAction, WriteAnswer } from "@steelman/shared";
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

export async function readBoard(board: string): Promise<BoardSnapshot | null> {
  const response = await call("GET", `boards/${board}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Reading the board failed: ${response.status}`);
  return (await response.json()) as BoardSnapshot;
}

export async function readChanges(board: string, after: number): Promise<BoardChanges> {
  const response = await call("GET", `boards/${board}/changes?after=${after}`);
  if (!response.ok) throw new Error(`Asking for changes failed: ${response.status}`);
  return (await response.json()) as BoardChanges;
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
