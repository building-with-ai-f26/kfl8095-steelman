import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Undoing a combine never leaves an argument with no wordings (A-10, J-04).
// Found by the M3a audit (Nov 22): when two arguments became one and the
// second's own wording was moved out or deleted afterwards, Undo took the
// combined wording back and left the second argument on the board, empty,
// still taking votes and keeping its option from being deleted. It closes
// instead, as the argument a separation made does when its undo empties it.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(4410);
let b: SeededBoard;
let second: { argument: string; version: string };
let third: { argument: string; version: string };
let eve: string;

beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  second = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Weekend hours suit families." }));
  third = await write(db.client, b.board, (seq) => addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq, wording: "Sunday is the only free day for many." }));
  eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
});

const combine = (version: string, into: string) => api.post(`/api/boards/${b.board}/versions/${version}/combine`, { as: eve, body: { into } });
const separate = (version: string, argumentId: string) => api.post(`/api/boards/${b.board}/versions/${version}/separate`, { as: eve, body: { argumentId } });
const undo = (seq: number) => api.put(`/api/boards/${b.board}/changes/${seq}/undo`, { as: eve });
const argumentOf = async (version: string) => (await db.client.query("select argument_id from version where id = $1", [version])).rows[0].argument_id;
/** Arguments still on the board (not deleted, not combined away) that have no wording left. */
const emptyArguments = async () =>
  (
    await db.client.query(
      `select a.id from argument a
       where a.board_id = $1 and a.deleted_at is null and a.merged_into is null
         and not exists (select 1 from version v where v.argument_id = a.id and v.deleted_at is null)`,
      [b.board],
    )
  ).rows.map((row) => row.id);
const shownAs = async (id: string) => (await api.get(`/api/boards/${b.board}`, { as: eve })).body.arguments.find((a: { id: string }) => a.id === id);

describe("undoing a combine after the argument it joined lost its own wordings", () => {
  test("A-10, J-04: its own wording was combined into a third argument since: Undo closes the emptied argument", async () => {
    const merge = (await combine(b.version, second.argument)).body;
    await combine(second.version, third.argument);

    expect((await undo(merge.seq)).body).toMatchObject({ status: "done" });

    expect(await argumentOf(b.version)).toBe(b.argument);
    expect(await emptyArguments()).toEqual([]);
    expect(await shownAs(second.argument)).toMatchObject({ deleted: true, mergedInto: null });
    expect(await shownAs(b.argument)).toMatchObject({ deleted: false, mergedInto: null });
  });

  test("A-10, J-04: its own wording was deleted by its author since: Undo closes the emptied argument", async () => {
    const merge = (await combine(b.version, second.argument)).body;
    await api.delete(`/api/boards/${b.board}/versions/${second.version}`, { as: b.ben });

    expect((await undo(merge.seq)).body).toMatchObject({ status: "done" });

    expect(await argumentOf(b.version)).toBe(b.argument);
    expect(await emptyArguments()).toEqual([]);
    expect(await shownAs(second.argument)).toMatchObject({ deleted: true });
  });

  test("A-10, J-04: a wording combined into a separated argument, whose separation was undone since: Undo closes that argument", async () => {
    const extra = ids.itemId();
    await api.post(`/api/boards/${b.board}/arguments/${second.argument}/versions`, { as: b.ben, body: { id: extra, wording: "Families shop together at weekends.", context: "" } });
    const made = ids.itemId();
    const separation = (await separate(extra, made)).body;
    const joined = (await combine(b.version, made)).body;
    await undo(separation.seq);

    expect((await undo(joined.seq)).body).toMatchObject({ status: "done" });

    expect(await argumentOf(b.version)).toBe(b.argument);
    expect(await emptyArguments()).toEqual([]);
  });

  test("A-10, J-04: an argument that still has a wording of its own stays open", async () => {
    const merge = (await combine(b.version, second.argument)).body;

    expect((await undo(merge.seq)).body).toMatchObject({ status: "done" });

    expect(await shownAs(second.argument)).toMatchObject({ deleted: false });
    expect(await emptyArguments()).toEqual([]);
  });
});
