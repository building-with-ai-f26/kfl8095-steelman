// What the browser says about a username it won't send (L-01, L-04): the same
// sentences when you choose one at first sign-in and when you change it on
// Your account. Whether a name is free, only the service can say.

import { RESERVED_USERNAMES, USERNAME, isAllowedUsername } from "@steelman/shared";

export const USERNAME_SHAPE = `Use ${USERNAME.min} to ${USERNAME.max} letters, numbers, or underscores.`;

/** Why a name can't be sent, as a sentence, or "" when it can. `name` is as typed, already in lower case. */
export function usernameProblem(name: string): string {
  if (RESERVED_USERNAMES.includes(name)) return `${name} is reserved.`;
  return isAllowedUsername(name) ? "" : USERNAME_SHAPE;
}

export function usernameTaken(name: string): string {
  return `${name} is taken.`;
}
