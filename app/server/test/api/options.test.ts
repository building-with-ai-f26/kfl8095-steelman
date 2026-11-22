import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Options: add, rename, delete (M3a-2; A-07), as the prototype's option
// header ⋯ menu and dashed + Option have them. Changing a board's structure
// is an Editor's and the Owner's (a new `structure` action; permissions.md's
// matrix: Contributors suggest, which is A-11, later). A board keeps two to
// four options; only an empty option can be deleted. Each is one write, safe
// to send twice, and a change row, so other readers see it on their next
// poll.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(531);

let b: SeededBoard;
let eve: string;
let vic: string;
let val: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  vic = await addAccount(db.client, ids, "vic", { confirmed: true });
  val = await addAccount(db.client, ids, "val", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
  await addMember(db.client, b.board, vic, "voter");
  await addMember(db.client, b.board, val, "viewer");
});

const add = (as: string | undefined, id: string, name: string) => api.post(`/api/boards/${b.board}/options`, { as, body: { id, name } });
const rename = (as: string | undefined, id: string, name: string) => api.put(`/api/boards/${b.board}/options/${id}`, { as, body: { name } });
const remove = (as: string | undefined, id: string) => api.delete(`/api/boards/${b.board}/options/${id}`, { as });
const options = async (as: string) => (await api.get(`/api/boards/${b.board}`, { as })).body.options as { id: string; name: string; position: number; deleted: boolean }[];
const log = async (as: string) => (await api.get(`/api/boards/${b.board}/changes?after=0`, { as })).body.log as { kind: string; subjectKind: string; subjectId: string; actorName: string }[];

describe("adding an option", () => {
  test("M3a-2, A-07: an Editor adds an option at the end, and the change log says who", async () => {
    const id = ids.itemId();
    expect((await add(eve, id, "Only in winter")).status).toBe(200);

    const now = await options(b.ben);
    expect(now.filter((o) => !o.deleted).map((o) => o.name)).toEqual(["Yes", "No", "Only in winter"]);
    expect(now.find((o) => o.id === id)!.position).toBeGreaterThan(Math.max(...now.filter((o) => o.id !== id).map((o) => o.position)));
    expect((await log(b.ben)).at(-1)).toMatchObject({ kind: "option_added", subjectKind: "option", subjectId: id, actorName: expect.stringMatching(/^eve/) });
  });

  test("M3a-2, A-07: sent twice, it's added once; an ID already used by something else is refused", async () => {
    const id = ids.itemId();
    await add(b.ana, id, "Only in winter");
    expect((await add(b.ana, id, "Only in winter")).body).toEqual({ status: "already_done" });
    expect((await add(b.ana, b.version, "Clash")).body).toMatchObject({ status: "refused", reason: "id_taken" });
    expect((await options(b.ana)).filter((o) => !o.deleted)).toHaveLength(3);
  });

  test("M3a-2, A-07: a board has at most four options", async () => {
    await add(b.ana, ids.itemId(), "Third");
    await add(b.ana, ids.itemId(), "Fourth");
    const fifth = await add(b.ana, ids.itemId(), "Fifth");
    expect(fifth.status).toBe(409);
    expect(fifth.body).toMatchObject({ status: "refused", reason: "too_many_options" });
  });

  test("M3a-2, A-07: a name is needed, of at most 80 characters", async () => {
    expect((await add(b.ana, ids.itemId(), "   ")).status).toBe(400);
    expect((await add(b.ana, ids.itemId(), "x".repeat(81))).status).toBe(400);
  });
});

describe("renaming an option", () => {
  test("M3a-2, A-07: the Owner renames an option; another reader sees it on their next poll", async () => {
    const before = Number((await api.get(`/api/boards/${b.board}`, { as: b.ben })).body.board.seq);
    expect((await rename(b.ana, b.yes, "Yes, every Sunday")).status).toBe(200);

    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${before}`, { as: b.ben })).body;
    expect(changes.options).toEqual([expect.objectContaining({ id: b.yes, name: "Yes, every Sunday" })]);
    expect(changes.log.at(-1)).toMatchObject({ kind: "option_renamed", subjectId: b.yes });
  });

  test("M3a-2, A-07: the same name again changes nothing", async () => {
    expect((await rename(b.ana, b.yes, "Yes")).body).toEqual({ status: "already_done" });
  });
});

describe("deleting an option", () => {
  test("M3a-2, A-07: an Editor deletes an empty option; it's marked deleted, and the change log says so", async () => {
    const id = ids.itemId();
    await add(b.ana, id, "Only in winter");
    expect((await remove(eve, id)).status).toBe(200);

    expect((await options(b.ben)).find((o) => o.id === id)).toMatchObject({ deleted: true });
    expect((await log(b.ben)).at(-1)).toMatchObject({ kind: "option_deleted", subjectId: id });
    expect((await remove(eve, id)).body).toEqual({ status: "already_done" });
  });

  test("M3a-2, A-07: an option with arguments can't be deleted", async () => {
    await add(b.ana, ids.itemId(), "Third");
    const refused = await remove(b.ana, b.yes);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ status: "refused", reason: "option_not_empty" });
  });

  test("M3a-2, A-07: a board keeps at least two options", async () => {
    // Ana deletes the only wording of No's one argument, which deletes the argument.
    expect((await api.delete(`/api/boards/${b.board}/versions/${b.otherVersion}`, { as: b.ana })).status).toBe(200);
    const refused = await remove(b.ana, b.no);
    expect(refused.body).toMatchObject({ status: "refused", reason: "too_few_options" });
  });

  test("M3a-2, A-07: renaming a deleted option is refused", async () => {
    const id = ids.itemId();
    await add(b.ana, id, "Third");
    await remove(b.ana, id);
    expect((await rename(b.ana, id, "Back again")).body).toMatchObject({ status: "refused", reason: "option_deleted" });
  });
});

describe("who may change a board's options", () => {
  test("M3a-2, A-07: a Contributor, a Voter, and a Viewer may not; signed out is asked to sign in", async () => {
    for (const as of [b.ben, vic, val]) {
      expect((await add(as, ids.itemId(), "Mine")).body, as).toMatchObject({ status: "refused", reason: "not_allowed" });
      expect((await rename(as, b.yes, "Mine")).body, as).toMatchObject({ status: "refused", reason: "not_allowed" });
    }
    expect((await add(undefined, ids.itemId(), "Mine")).status).toBe(401);
  });

  test("M3a-2, A-07: on a closed board, no one may", async () => {
    await db.client.query("update board set closed_at = now() where id = $1", [b.board]);
    expect((await add(b.ana, ids.itemId(), "Late")).body).toMatchObject({ status: "refused", reason: "board_closed" });
  });
});
