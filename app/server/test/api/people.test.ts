import { beforeEach, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Share's people list (M2-2b; Q27): everyone on the board, and their role.
// The owner sets each member's role, from Viewer to Editor. Someone whose
// role the owner set keeps it whatever the link does afterwards, as someone
// added by name would: a later link role doesn't change it, and turning the
// link off doesn't remove them.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(503);

const boardSeq = async (board: string) => Number((await db.client.query("select last_seq from board where id = $1", [board])).rows[0].last_seq);
const username = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;

let b: SeededBoard;
/** Lee came by the link, as a Contributor. */
let lee: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  lee = await addAccount(db.client, ids, "lee", { confirmed: true });
  await addMember(db.client, b.board, lee, "contributor", "link");
});

test("M2-2b, H-03: Share lists everyone on the board, the owner first and then the others by username, each with their role and never an email", async () => {
  const { status, body } = await api.get(`/api/boards/${b.board}/people`, { as: lee });

  expect(status).toBe(200);
  const others = [
    { id: b.ben, name: await username(b.ben), role: "contributor" },
    { id: lee, name: await username(lee), role: "contributor" },
  ].sort((x, y) => x.name.localeCompare(y.name));
  expect(body.people).toEqual([{ id: b.ana, name: await username(b.ana), role: "owner" }, ...others]);
  expect(JSON.stringify(body)).not.toContain("@");
});

test("M2-2b, H-03: the owner makes someone who came by the link an Editor, and it stays theirs whatever the link does", async () => {
  const set = await api.put(`/api/boards/${b.board}/people/${lee}`, { as: b.ana, body: { role: "editor" } });
  expect(set.status).toBe(200);
  expect((await api.get(`/api/boards/${b.board}`, { as: lee })).body.role).toBe("editor");

  await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "link", linkRole: "viewer" } });
  expect((await api.get(`/api/boards/${b.board}`, { as: lee })).body.role).toBe("editor");

  await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "invited", linkRole: "viewer" } });
  expect((await api.get(`/api/boards/${b.board}`, { as: lee })).body.role).toBe("editor");
});

test("M2-2b, H-03: the owner lowers someone to Viewer, and the board's next answer to them says so", async () => {
  await api.put(`/api/boards/${b.board}/people/${b.ben}`, { as: b.ana, body: { role: "viewer" } });

  const { body } = await api.get(`/api/boards/${b.board}/changes?after=0`, { as: b.ben });
  expect(body.role).toBe("viewer");
  const vote = await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });
  expect(vote.body.reason).toBe("not_allowed");
});

test("M2-2b: a role change is in the change log, with who changed it, and the role before and after", async () => {
  await api.put(`/api/boards/${b.board}/people/${lee}`, { as: b.ana, body: { role: "voter" } });

  const { rows } = await db.client.query("select actor_id, kind, subject_kind, subject_id, before, after from change where board_id = $1 order by seq desc limit 1", [b.board]);
  expect(rows[0]).toEqual({
    actor_id: b.ana,
    kind: "role_changed",
    subject_kind: "board",
    subject_id: b.board,
    before: { account: lee, role: "contributor" },
    after: { account: lee, role: "voter" },
  });
});

test("M2-2b: setting the role someone already has is done once", async () => {
  await api.put(`/api/boards/${b.board}/people/${lee}`, { as: b.ana, body: { role: "voter" } });
  const before = await boardSeq(b.board);

  const again = await api.put(`/api/boards/${b.board}/people/${lee}`, { as: b.ana, body: { role: "voter" } });

  expect(again.body.status).toBe("already_done");
  expect(await boardSeq(b.board)).toBe(before);
});

test("M2-2b, H-03: nobody can be made Owner, the owner's own role can't be set, and nor can the role of someone not on the board", async () => {
  const before = await boardSeq(b.board);
  const stranger = await addAccount(db.client, ids, "sam", { confirmed: true });

  expect((await api.put(`/api/boards/${b.board}/people/${lee}`, { as: b.ana, body: { role: "owner" } })).status).toBe(400);
  expect((await api.put(`/api/boards/${b.board}/people/${b.ana}`, { as: b.ana, body: { role: "editor" } })).status).toBe(404);
  expect((await api.put(`/api/boards/${b.board}/people/${stranger}`, { as: b.ana, body: { role: "voter" } })).status).toBe(404);
  expect(await boardSeq(b.board)).toBe(before);
});

test("M2-2b, H-03: an Editor can't set roles, not even to make someone else an Editor", async () => {
  await api.put(`/api/boards/${b.board}/people/${lee}`, { as: b.ana, body: { role: "editor" } });

  const { status, body } = await api.put(`/api/boards/${b.board}/people/${b.ben}`, { as: lee, body: { role: "editor" } });

  expect(status).toBe(403);
  expect(body.reason).toBe("not_allowed");
});

test("M2-2b, M-07: deleting an account takes its ID out of the role changes that named it", async () => {
  await api.put(`/api/boards/${b.board}/people/${lee}`, { as: b.ana, body: { role: "voter" } });

  const deleted = await api.post("/api/account/delete", { as: lee, body: { username: await username(lee) } });
  expect(deleted.status).toBe(200);

  const { rows } = await db.client.query("select before::text, after::text from change where board_id = $1 and kind = 'role_changed'", [b.board]);
  expect(rows).toHaveLength(1);
  expect(rows[0].before).not.toContain(lee);
  expect(rows[0].after).not.toContain(lee);
  const people = await api.get(`/api/boards/${b.board}/people`, { as: b.ana });
  expect(people.body.people.map((person: { id: string }) => person.id)).not.toContain(lee);
});

test("M2-2b: the owner choosing the role someone already has by the link makes it theirs, without a change-log row", async () => {
  const logged = async () => Number((await db.client.query("select count(*) from change where board_id = $1", [b.board])).rows[0].count);
  const rows = await logged();

  await api.put(`/api/boards/${b.board}/people/${lee}`, { as: b.ana, body: { role: "contributor" } });
  await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "link", linkRole: "viewer" } });

  expect((await api.get(`/api/boards/${b.board}`, { as: lee })).body.role).toBe("contributor");
  // The one row is the link's change.
  expect(await logged()).toBe(rows + 1);
});
