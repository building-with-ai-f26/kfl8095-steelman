import { beforeEach, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// "Edited", with the votes before (M2-5; A-06, Q22): an edited wording says
// how many importance and articulation votes it had just before the edit,
// so an author can't quietly change what a wording says once it has
// collected votes. Each revision keeps those two counts as they were.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(407);
let b: SeededBoard;
/** Three voters besides Ana and Ben. */
let voters: string[];
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  voters = [];
  for (const name of ["vic", "val", "vera"]) {
    const voter = await addAccount(db.client, ids, name, { confirmed: true });
    await addMember(db.client, b.board, voter, "voter");
    voters.push(voter);
  }
});

const version = async (id: string, as: string = b.ben) => (await api.get(`/api/boards/${b.board}`, { as })).body.versions.find((v: { id: string }) => v.id === id);
const edit = (baseRev: number, wording: string) => api.put(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana, body: { baseRev, wording, context: "" } });
const importance = (as: string, value: 1 | -1 | null) => api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as, body: { value } });
const articulation = (as: string, value: 1 | -1 | null) => api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as, body: { value } });

test("M2-5, A-06: an edited wording says how many importance and articulation votes it had just before the edit, not after later votes", async () => {
  await importance(voters[0]!, 1);
  await importance(voters[1]!, -1);
  await articulation(voters[0]!, 1);

  await edit(1, "Sunday is the only free day for most shift workers.");
  await importance(voters[2]!, 1);
  await articulation(voters[1]!, 1);
  await articulation(voters[2]!, -1);

  expect((await version(b.version)).votesBefore).toEqual({ importance: 2, articulation: 1 });
});

test("M2-5, A-06: a wording never edited has no counts from before", async () => {
  await importance(voters[0]!, 1);

  expect((await version(b.version)).votesBefore).toBeNull();
});

test("M2-5, A-06: after a second edit, the counts are the ones just before it", async () => {
  await importance(voters[0]!, 1);
  await edit(1, "Sunday is the only free day for most shift workers.");
  await importance(voters[1]!, 1);
  await articulation(voters[0]!, 1);

  await edit(2, "Sunday is the only free day for most weekday workers.");

  expect((await version(b.version)).votesBefore).toEqual({ importance: 2, articulation: 1 });
});

test("M2-5, A-06: an edit sent twice keeps one snapshot, and the counts don't move", async () => {
  await importance(voters[0]!, 1);
  await edit(1, "Sunday is the only free day for most shift workers.");
  await importance(voters[1]!, 1);

  const again = await edit(1, "Sunday is the only free day for most shift workers.");

  expect(again.body.status).toBe("already_done");
  const { rows } = await db.client.query("select count(*)::int as n from version_revision where version_id = $1 and why = 'edited'", [b.version]);
  expect(rows[0].n).toBe(1);
  expect((await version(b.version)).votesBefore).toEqual({ importance: 1, articulation: 0 });
});

test("M2-5, A-06: a deleted wording says nothing about its votes before", async () => {
  await importance(voters[0]!, 1);
  await edit(1, "Sunday is the only free day for most shift workers.");
  await api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana });

  expect((await version(b.version)).votesBefore).toBeNull();
});

test("M2-5, A-06, C-01: a change of sources doesn't count as an edit: after one, the counts stay the edit's, and an edit after one takes its own", async () => {
  const addSource = () =>
    api.post(`/api/boards/${b.board}/versions/${b.version}/sources`, {
      as: b.ana,
      body: { id: ids.itemId(), name: "Shift work survey", locator: "https://example.test/survey", finding: "Four in ten shift workers have Sunday off.", backsUp: "", limits: "" },
    });
  await importance(voters[0]!, 1);
  await addSource();
  await importance(voters[1]!, 1);

  await edit(2, "Sunday is the only free day for most shift workers.");
  await articulation(voters[0]!, 1);
  await addSource();

  const shown = await version(b.version);
  expect(shown.rev).toBe(4);
  expect(shown.previousWording).toBe("Sunday is the only free day for many people.");
  expect(shown.votesBefore).toEqual({ importance: 2, articulation: 0 });
});
