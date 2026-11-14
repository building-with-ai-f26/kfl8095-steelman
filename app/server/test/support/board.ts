// Builds a small board straight in the database, for tests that then try to
// break a rule with raw SQL. It goes through no application code on purpose:
// these tests are about what the database itself refuses.

import type pg from "pg";
import type { IdSource } from "@steelman/shared";

export const NOON = "2026-11-16T12:00:00Z";

export interface SeededBoard {
  board: string;
  /**
   * Two people. Ana wrote everything on the board and owns it; Ben was
   * invited to contribute. The board is also open to anyone with the link,
   * as a contributor, so anyone signed in with a confirmed email gets in.
   */
  ana: string;
  ben: string;
  /** Two options, each with one argument, each with one wording at revision 1. */
  yes: string;
  no: string;
  argument: string;
  version: string;
  otherArgument: string;
  otherVersion: string;
  /** A source, cited by `version` only. */
  source: string;
}

/** Runs the work in a transaction; rolls back and rethrows if it fails. */
export async function transaction<T>(client: pg.Client, work: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    const result = await work();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/**
 * One write to a board, done properly: a transaction that takes the board's
 * next change number and hands it to the work, which stamps its rows with it.
 */
export async function write<T>(client: pg.Client, board: string, work: (seq: string) => Promise<T>): Promise<T> {
  return transaction(client, async () => work(await takeChangeNumber(client, board)));
}

export async function takeChangeNumber(client: pg.Client, board: string): Promise<string> {
  const result = await client.query("select take_change_number($1) as seq", [board]);
  return result.rows[0].seq;
}

/** An account. With `confirmed`, it has an email it has confirmed, as everyone who signs in does. */
export async function addAccount(client: pg.Client, ids: IdSource, name: string, { confirmed = false } = {}): Promise<string> {
  const id = ids.itemId();
  // Usernames are unique, and one test file seeds many boards, so make each distinct.
  const username = `${name}_${id.slice(0, 8)}`;
  await client.query("insert into account (id, username, email, email_verified, created_at) values ($1, $2, $3, $4, $5)", [
    id,
    username,
    confirmed ? `${username}@example.test` : null,
    confirmed,
    NOON,
  ]);
  return id;
}

export type MemberRole = "owner" | "contributor" | "voter";

/** Makes someone a member of a board: invited by name, unless `via` says they came by the link. */
export async function addMember(client: pg.Client, board: string, account: string, role: MemberRole, via: "invite" | "link" = "invite"): Promise<void> {
  await client.query("insert into board_member (board_id, account_id, role, joined_via, joined_at) values ($1, $2, $3, $4, $5)", [
    board,
    account,
    role,
    via,
    NOON,
  ]);
}

export async function addArgument(
  client: pg.Client,
  ids: IdSource,
  at: { board: string; option: string; author: string; seq: string; wording?: string },
): Promise<{ argument: string; version: string }> {
  const argument = ids.itemId();
  const version = ids.itemId();
  await client.query(
    `insert into argument (id, board_id, option_id, created_by, created_at, created_seq, changed_seq)
     values ($1, $2, $3, $4, $5, $6, $6)`,
    [argument, at.board, at.option, at.author, NOON, at.seq],
  );
  await client.query(
    `insert into version (id, board_id, argument_id, author_id, created_at, created_seq, current_rev, changed_seq)
     values ($1, $2, $3, $4, $5, $6, 1, $6)`,
    [version, at.board, argument, at.author, NOON, at.seq],
  );
  await client.query(
    `insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at)
     values ($1, $2, 1, $3, '', 'created', $4, $5)`,
    [version, at.board, at.wording ?? "Sunday is the only free day for many people.", at.author, NOON],
  );
  return { argument, version };
}

export async function seedBoard(client: pg.Client, ids: IdSource): Promise<SeededBoard> {
  const ana = await addAccount(client, ids, "ana");
  const ben = await addAccount(client, ids, "ben");
  const board = ids.boardId();
  await client.query(
    "insert into board (id, question, created_by, created_at, general_access, link_role) values ($1, $2, $3, $4, 'link', 'contributor')",
    [board, "Should our library open on Sundays?", ana, NOON],
  );
  await addMember(client, board, ana, "owner");
  await addMember(client, board, ben, "contributor");

  return write(client, board, async (seq) => {
    const yes = ids.itemId();
    const no = ids.itemId();
    await client.query(
      `insert into option (id, board_id, name, position, created_at, changed_seq)
       values ($1, $3, 'Yes', 1, $4, $5), ($2, $3, 'No', 2, $4, $5)`,
      [yes, no, board, NOON, seq],
    );
    const first = await addArgument(client, ids, { board, option: yes, author: ana, seq });
    const second = await addArgument(client, ids, { board, option: no, author: ana, seq, wording: "Staff need a guaranteed day off." });

    const source = ids.itemId();
    await client.query(
      `insert into source (id, board_id, name, locator, finding, backs_up, limits, added_by, created_at, changed_seq)
       values ($1, $2, 'City library survey, 2025', '', 'Most weekday visitors can''t come on weekdays.', '', '', $3, $4, $5)`,
      [source, board, ana, NOON, seq],
    );
    await client.query("insert into revision_source (version_id, rev, source_id, board_id) values ($1, 1, $2, $3)", [first.version, source, board]);

    return {
      board,
      ana,
      ben,
      yes,
      no,
      argument: first.argument,
      version: first.version,
      otherArgument: second.argument,
      otherVersion: second.version,
      source,
    };
  });
}

/** Runs the work as one of the database roles the service uses, then switches back. */
export async function asRole<T>(client: pg.Client, role: "steelman_app" | "steelman_account_deletion", work: () => Promise<T>): Promise<T> {
  await client.query(`set role ${role}`);
  try {
    return await work();
  } finally {
    // After a failed statement inside a transaction, the reset has to wait for the rollback.
    await client.query("rollback").catch(() => {});
    await client.query("reset role");
  }
}
