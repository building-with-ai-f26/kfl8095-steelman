// The words for who can get in (H-02, G-05, M3d-18), in one place, for the
// pill, Share's General access and its hint, and what is read out after a
// change. A board shared with everyone in its space names the space only for
// a reader who is in it (the service sends the name to members alone);
// anyone else reads "the space". As Google Drive's General access names the
// organisation ("Anyone in <organisation>"), Notion's "Everyone at
// <workspace>", and Figma's "Anyone at <team>" (from memory), the choice
// names the group, and the role follows the link's.

import type { Access } from "@steelman/shared";

type LinkRole = Access["linkRole"];

/** What each role a link or a space may give lets people do, as the hint's sentence says it. */
const MAY: Record<LinkRole, string> = { viewer: "read", voter: "read and vote", contributor: "read, vote, and write" };
/** The same for everyone in a space, who find the board in their list: "Everyone in POD 6 can find this steelman and vote." */
const SPACE_MAY: Record<LinkRole, string> = { viewer: "find this steelman and read it", voter: "find this steelman and vote", contributor: "find this steelman, vote, and write" };
/** The verb after a change is read out, and in History: "Anyone with the link can vote." */
export const LINK_CAN: Record<LinkRole, string> = { viewer: "view", voter: "vote", contributor: "contribute" };

/** The space's name for this reader, or "the space" when they aren't in it. */
const called = (spaceName: string | null) => spaceName ?? "the space";

/** The pill's text and the General access choice. */
export function generalLabel(general: Access["general"], spaceName: string | null): string {
  if (general === "link") return "Anyone with the link";
  if (general === "space") return `Everyone in ${called(spaceName)}`;
  return "Invited only";
}

/** The General access choice on a board that isn't in a space, which can't be chosen until it is. */
export const NO_SPACE_LABEL = "Everyone in a space";

/** The first sentence under General access. */
export function accessHint(access: Access, spaceName: string | null): string {
  if (access.general === "link") return `Anyone with the link can ${MAY[access.linkRole]}.`;
  if (access.general === "space") return `Everyone in ${called(spaceName)} can ${SPACE_MAY[access.linkRole]}.`;
  return "Only invited people can open it.";
}

/** What is read out once a change of General access is saved. */
export function accessAnnouncement(access: Access, spaceName: string | null): string {
  if (access.general === "link") return `Anyone with the link can ${LINK_CAN[access.linkRole]}.`;
  if (access.general === "space") return `Everyone in ${called(spaceName)} can ${LINK_CAN[access.linkRole]}.`;
  return "Only invited people can open it.";
}
