// The rules both the server and the browser follow. Everything exported from
// here is a pure function or a type: same input, same output, no clock, no
// network, no database (plans/architecture.md §4).

export type { Clock } from "./clock.ts";
export { BOARD_ID_BYTES, ITEM_ID_BYTES, idFromBytes, idSourceFrom } from "./ids.ts";
export type { IdSource } from "./ids.ts";
