// Opening a board from Your steelmen, and going back to the list (M3d-9,
// E-07). A plain click on a post's question opens its board inside the page,
// with an entry of its own in the browser's history, so that the board can
// grow out of the post's miniature, and the wordmark or Back can shrink it
// into the list again once Home has drawn the list it already holds. Every
// other way between pages (New steelman, Your account, a link with a modifier
// key, a deep link) loads the page as before.
//
// What it needs is held here, in memory only: the miniature's rect from the
// click, the list as Home last drew it, how far down the list was scrolled,
// and which boards the reader wrote to since. A reload or a deep link starts
// with none of it, so it shows no motion.
//
// The offline queue lives only in this tab (Q20), so a board with actions
// waiting is left by loading the page, which brings up the browser's leave
// prompt as before.

import type { BoardList } from "@steelman/shared";
import type { Rect } from "./board/motion.ts";
import type { Closing } from "./board/zoom.ts";

/** The board opened from the list, and the rect its post's miniature had on the click, until the board is drawn. */
let opening: { board: string; from: Rect } | null = null;
/** The list as Home last drew it, the board last opened from it, and how far down it was scrolled then. */
let held: { list: BoardList; board: string | null; scrollY: number } | null = null;
/** The boards the reader has written to since the list was last read: those moved to the top when it's drawn again. */
const written = new Set<string>();
/** The board just left for the list by Back or the wordmark, and its copy to shrink into its post, if it has one. */
let returning: { board: string; closing: Closing | null } | null = null;
/** The board on screen: whether it can be left without the browser's leave prompt. */
let shown: { board: string; quiet(): boolean } | null = null;
/** The address the board on screen last gave its history entry: the board, an open version, or a linked comment. */
let address: { board: string; path: string } | null = null;

/** A click with the main button and no modifier key, which the page may follow itself. */
export function plainClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

/** Home notes each list it reads from the service, which is the order every write so far has given it. */
export function rememberList(list: BoardList): void {
  held = { list, board: held?.board ?? null, scrollY: held?.scrollY ?? 0 };
  written.clear();
}

/** The list Home last drew, with each board the reader wrote to since then at the top, as the service now orders it. */
export function heldList(): BoardList | null {
  if (!held) return null;
  const { list } = held;
  const moved = list.boards.filter((board) => written.has(board.id)).map((board) => ({ ...board, changedAt: list.now }));
  if (!moved.length) return list;
  return { ...list, boards: [...moved, ...list.boards.filter((board) => !written.has(board.id))] };
}

/** How far down the list was scrolled when a board was opened from it. */
export function listScroll(): number {
  return held?.scrollY ?? 0;
}

/** A post's question was clicked: its board opens from the rect its miniature has now. */
export function noteOpening(board: string, from: Rect): void {
  opening = { board, from };
  if (held) held = { ...held, board, scrollY: window.scrollY };
}

/** The rect a board grows from, once: only for the board just opened from the list. */
export function takeOpening(board: string): Rect | null {
  const from = opening?.board === board ? opening.from : null;
  opening = null;
  return from;
}

/** Back or Forward opens a page with no click on a miniature, so nothing grows. */
export function forgetOpening(): void {
  opening = null;
  returning = null;
}

/** Back, or the wordmark, leaves a board opened from the list for the list again. */
export function noteReturn(board: string, closing: Closing | null): void {
  returning = { board, closing };
}

/** The board Home was just brought back from, once. */
export function takeReturn(): { board: string; closing: Closing | null } | null {
  const was = returning;
  returning = null;
  return was;
}

/** Whether the list is the page this board was opened from, in this page's memory. */
export function cameFromList(board: string): boolean {
  return held?.board === board;
}

/** The api notes each write the service took, by its board. */
export function noteWrite(board: string): void {
  written.add(board);
}

/** The board on screen says whether it can be left quietly, until it goes, and its address goes with it. */
export function showBoard(board: string, quiet: () => boolean): () => void {
  const entry = { board, quiet };
  shown = entry;
  return () => {
    if (shown === entry) shown = null;
    if (address?.board === board) address = null;
  };
}

/** Whether the board on screen, if any, can be left inside the page: nothing waits to send, and no held delete would be lost. */
export function leavesQuietly(): boolean {
  return shown?.quiet() ?? true;
}

/** The board notes the address it gives its history entry each time that changes. */
export function noteAddress(board: string, path: string): void {
  address = { board, path };
}

/** The address this board last gave its history entry, or null when it gave none. */
export function lastAddress(board: string): string | null {
  return address?.board === board ? address.path : null;
}
