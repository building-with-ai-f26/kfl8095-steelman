import { beforeEach, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The list (E-03, M2-7): the boards you're a member of, including those you
// came into by the link, each with its question, its options and how many
// arguments each has, your role, and when it last changed; the most
// recently changed first. A board you can't read never appears.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(707);

let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const list = async (as: string) => (await api.get("/api/boards", { as })).body;
const create = async (as: string, question: string, options = ["Yes", "No"]) => (await api.post("/api/boards", { as, body: { question, options } })).body.board as string;
const MINUTE = 60_000;

test("E-03: each board you're on shows its question, its options with how many arguments each has, your role, and when it last changed", async () => {
  const { boards } = await list(b.ben);

  expect(boards).toEqual([
    {
      id: b.board,
      question: "Should our library open on Sundays?",
      options: [
        { name: "Yes", arguments: 1 },
        { name: "No", arguments: 1 },
      ],
      role: "contributor",
      changedAt: expect.any(String),
    },
  ]);
});

test("E-03: the answer says what time it is by the service's clock, so how long ago doesn't depend on the reader's", async () => {
  const { now } = await list(b.ben);

  expect(now).toBe(api.clock.now().toISOString());
});

test("E-03: someone on no board gets an empty list", async () => {
  const nobody = await addAccount(db.client, ids, "nobody", { confirmed: true });

  expect(await list(nobody)).toMatchObject({ boards: [] });
});

test("E-03: a board you aren't on never appears, even one anyone with the link can open", async () => {
  const stranger = await addAccount(db.client, ids, "stranger", { confirmed: true });
  await create(b.ana, "Should the café stay open late?");

  expect((await list(stranger)).boards).toEqual([]);
  expect((await list(b.ana)).boards).toHaveLength(2);
});

test("E-03, H-02: a board you came into by the link appears once you've opened it, with the link's role", async () => {
  const visitor = await addAccount(db.client, ids, "visitor", { confirmed: true });
  await api.get(`/api/boards/${b.board}`, { as: visitor });

  expect((await list(visitor)).boards).toEqual([expect.objectContaining({ id: b.board, role: "contributor" })]);
});

test("E-03, H-02: when the owner turns link access off, a board you came into by the link disappears", async () => {
  const visitor = await addAccount(db.client, ids, "visitor", { confirmed: true });
  await api.get(`/api/boards/${b.board}`, { as: visitor });

  await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "invited", linkRole: "contributor" } });

  expect((await list(visitor)).boards).toEqual([]);
  expect((await list(b.ben)).boards).toHaveLength(1);
});

test("E-03: a deleted board never appears", async () => {
  await db.client.query("update board set deleted_at = $2 where id = $1", [b.board, api.clock.now()]);

  expect((await list(b.ben)).boards).toEqual([]);
});

test("E-03: deleted and combined arguments aren't counted, and a deleted option isn't shown", async () => {
  const deleted = ids.itemId();
  await api.post(`/api/boards/${b.board}/arguments`, { as: b.ben, body: { id: ids.itemId(), optionId: b.yes, versionId: deleted, wording: "Weekend hours help students.", context: "" } });
  await api.delete(`/api/boards/${b.board}/versions/${deleted}`, { as: b.ben });
  const combined = ids.itemId();
  await api.post(`/api/boards/${b.board}/arguments`, { as: b.ben, body: { id: combined, optionId: b.yes, versionId: ids.itemId(), wording: "Families are free on Sundays.", context: "" } });
  await write(db.client, b.board, async (seq) => {
    await db.client.query("update argument set merged_into = $2, changed_seq = $3 where id = $1", [combined, b.argument, seq]);
    const maybe = ids.itemId();
    await db.client.query("insert into option (id, board_id, name, position, created_at, deleted_at, changed_seq) values ($1, $2, 'Maybe', 3, $3, $3, $4)", [maybe, b.board, api.clock.now(), seq]);
  });

  expect((await list(b.ben)).boards[0].options).toEqual([
    { name: "Yes", arguments: 1 },
    { name: "No", arguments: 1 },
  ]);
});

test("E-03: the most recently changed board comes first, and a vote counts as a change", async () => {
  api.clock.advance(MINUTE);
  const later = await create(b.ana, "Should the café stay open late?");
  expect((await list(b.ana)).boards.map((x: { id: string }) => x.id)).toEqual([later, b.board]);

  api.clock.advance(5 * MINUTE);
  await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value: 1 } });

  const { boards } = await list(b.ana);
  expect(boards.map((x: { id: string }) => x.id)).toEqual([b.board, later]);
  expect(boards[0].changedAt).toBe(api.clock.now().toISOString());
});

test("E-03: an edit counts as a change, and so does a new argument", async () => {
  api.clock.advance(MINUTE);
  const later = await create(b.ana, "Should the café stay open late?");
  api.clock.advance(MINUTE);
  await api.put(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana, body: { baseRev: 1, wording: "Sunday is many people's only free day.", context: "" } });
  expect((await list(b.ana)).boards[0].id).toBe(b.board);

  api.clock.advance(MINUTE);
  const optionId = (await api.get(`/api/boards/${later}`, { as: b.ana })).body.options[0].id;
  await api.post(`/api/boards/${later}/arguments`, { as: b.ana, body: { id: ids.itemId(), optionId, versionId: ids.itemId(), wording: "Students study late.", context: "" } });
  expect((await list(b.ana)).boards[0].id).toBe(later);
});

test("E-03: an Owner, an Editor, and a Viewer each see their own role", async () => {
  const eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  const vic = await addAccount(db.client, ids, "vic", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
  await addMember(db.client, b.board, vic, "viewer");

  for (const [as, role] of [
    [b.ana, "owner"],
    [eve, "editor"],
    [vic, "viewer"],
  ] as const) {
    expect((await list(as)).boards[0].role).toBe(role);
  }
});

test("E-03: signed out, the list is refused", async () => {
  const { status, body } = await api.get("/api/boards");

  expect(status).toBe(401);
  expect(body).toEqual({ status: "refused", reason: "signed_out" });
});
