// Whether a board is closed (I-05, M3b-3): closed by hand, or its closing
// time has passed. Nothing is written when the time passes, so the service
// and the browser both ask this one rule with the time now.

/** What a reader is told about a board's closing, only when it is closed or has a closing time. */
export interface Closing {
  /** Closed now, by hand or by its time. */
  closed: boolean;
  /** When the Owner closed it by hand, or null. */
  closedAt: string | null;
  /** The moment the Owner set it to close, or null. */
  closesAt: string | null;
}

/** When the board closed, or null while it is open: the earlier of being closed by hand and a closing time that has come. */
export function closedSince(board: { closedAt: Date | null; closesAt: Date | null }, now: Date): Date | null {
  const times = [board.closedAt, board.closesAt && board.closesAt.getTime() <= now.getTime() ? board.closesAt : null].filter((time): time is Date => time !== null);
  if (times.length === 0) return null;
  return times.reduce((earliest, time) => (time.getTime() < earliest.getTime() ? time : earliest));
}

/** The closing object for a board, or undefined when it is open with no closing time, so answers keep their old shape. */
export function closingOf(board: { closedAt: Date | null; closesAt: Date | null }, now: Date): Closing | undefined {
  if (board.closedAt === null && board.closesAt === null) return undefined;
  return { closed: closedSince(board, now) !== null, closedAt: board.closedAt?.toISOString() ?? null, closesAt: board.closesAt?.toISOString() ?? null };
}
