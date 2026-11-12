/**
 * Where new IDs come from. Like the clock, it is handed in: random in
 * production, seeded in tests so a failing run can be replayed exactly.
 *
 * Two sizes, from plans/architecture.md §2 ("Links and IDs"):
 * - a board's ID is its link, and for "anyone with the link" boards the link
 *   is the permission, so it must be unguessable: 72 random bits;
 * - everything inside a board only needs to be unique, and may be made by a
 *   browser that is offline: 120 random bits.
 */
export interface IdSource {
  boardId(): string;
  itemId(): string;
}

export const BOARD_ID_BYTES = 9; // 72 bits, written as 12 characters
export const ITEM_ID_BYTES = 15; // 120 bits, written as 20 characters

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Writes bytes as URL-safe text (base64url), four characters for every three
 * bytes. The byte count must be a multiple of three, so there is no padding.
 */
export function idFromBytes(bytes: Uint8Array): string {
  if (bytes.length === 0 || bytes.length % 3 !== 0) {
    throw new Error(`An ID needs a multiple of three bytes, got ${bytes.length}`);
  }
  let id = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    id +=
      ALPHABET[(chunk >> 18) & 63]! +
      ALPHABET[(chunk >> 12) & 63]! +
      ALPHABET[(chunk >> 6) & 63]! +
      ALPHABET[chunk & 63]!;
  }
  return id;
}

/** Builds an IdSource from anything that can supply bytes. */
export function idSourceFrom(nextBytes: (count: number) => Uint8Array): IdSource {
  return {
    boardId: () => idFromBytes(nextBytes(BOARD_ID_BYTES)),
    itemId: () => idFromBytes(nextBytes(ITEM_ID_BYTES)),
  };
}
