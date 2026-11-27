import { beforeEach, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Your statistics (L-09, M3d-14; plans/architecture.md §7 "Who sees what
// about people"): GET /api/account/statistics works out, on each request,
// counts of what you wrote from the tables Steelman already keeps. It reads
// only boards where you still have a role, leaves out deleted, hidden, and
// merged items, and never reads a vote or an assessment, so nothing about how
// anyone votes appears. "In its option's top three" and "leads its row" follow
// the board's own Strongest case rule (shared/src/strongest.ts): the newest
// published order, then what it hasn't ranked yet in the order added.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(4141);
const TICK = 60_000;

const ZERO = { arguments: 0, argumentsInTopThree: 0, wordings: 0, wordingsLeading: 0, sources: 0, comments: 0, boards: 0 };

let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const done = (answer: { status: number; body: { status?: string } }, what: string) => {
  expect(answer.status, `${what}: ${JSON.stringify(answer.body)}`).toBe(200);
};
const statistics = async (as: string) => {
  const answer = await api.get("/api/account/statistics", { as });
  expect(answer.status).toBe(200);
  return answer.body;
};
/** A confirmed account that's a contributor on the board. */
const member = async (name: string, board = b.board) => {
  const id = await addAccount(db.client, ids, name, { confirmed: true });
  await addMember(db.client, board, id, "contributor");
  return id;
};
const argue = async (as: string, optionId: string, board = b.board, wording = "Weekend hours help students.") => {
  const id = ids.itemId();
  const versionId = ids.itemId();
  done(await api.post(`/api/boards/${board}/arguments`, { as, body: { id, optionId, versionId, wording, context: "" } }), `argue ${wording}`);
  return { argument: id, version: versionId };
};
const reword = async (as: string, argument: string, board = b.board, wording = "Students need Sunday hours before Monday exams.") => {
  const id = ids.itemId();
  done(await api.post(`/api/boards/${board}/arguments/${argument}/versions`, { as, body: { id, wording, context: "" } }), `reword ${wording}`);
  return id;
};
const cite = async (as: string, version: string, board = b.board) => {
  const id = ids.itemId();
  done(
    await api.post(`/api/boards/${board}/versions/${version}/sources`, { as, body: { id, name: "Library visitor count", locator: "https://example.test/visits", finding: "Visits rise on weekends.", backsUp: "", limits: "" } }),
    "cite",
  );
  return id;
};
const comment = async (as: string, on: { versionId?: string; optionId?: string; parentId?: string }, board = b.board) => {
  const id = ids.itemId();
  done(await api.post(`/api/boards/${board}/comments`, { as, body: { id, ...on, body: "Which survey is this from?" } }), "comment");
  return id;
};
const upvote = (as: string, argument: string) => api.put(`/api/boards/${b.board}/arguments/${argument}/importance`, { as, body: { value: 1 } });

test("L-09: each count matches what the person wrote on a seeded board, and the top three and lead wordings follow the published order", async () => {
  const cara = await member("cara");
  const yes = await argue(cara, b.yes);
  await argue(cara, b.no, b.board, "Staff would lose their only shared day off.");
  const onAnas = await reword(cara, b.argument);
  await cite(cara, yes.version);
  await cite(cara, onAnas);
  const thread = await comment(cara, { versionId: b.version });
  await comment(cara, { versionId: b.version, parentId: thread });
  await comment(cara, {});

  // Nothing is published yet, so the order is the order added: each option has two arguments, both in its top three, and
  // Ana's wording leads the row Cara added a wording to.
  expect(await statistics(cara)).toEqual({ arguments: 2, argumentsInTopThree: 2, wordings: 3, wordingsLeading: 2, sources: 2, comments: 3, boards: 1 });

  // Ben adds three arguments for Yes that Ana and Ben vote up, and votes Cara's wording on Ana's argument the better
  // put. Once the order is published, Cara's Yes argument is fifth, and her wording leads Ana's row.
  for (const wording of ["Sunday opening brings in families.", "Sunday is when commuters are home.", "Sunday hours match the parks' hours."]) {
    const { argument } = await argue(b.ben, b.yes, b.board, wording);
    done(await upvote(b.ana, argument), "Ana votes");
    done(await upvote(b.ben, argument), "Ben votes");
  }
  done(await api.put(`/api/boards/${b.board}/versions/${onAnas}/articulation`, { as: b.ben, body: { value: 1 } }), "Ben prefers Cara's wording");
  api.clock.advance(TICK);
  done(await api.get(`/api/boards/${b.board}`, { as: b.ana }), "a read publishes the order");

  expect(await statistics(cara)).toEqual({ arguments: 2, argumentsInTopThree: 1, wordings: 3, wordingsLeading: 3, sources: 2, comments: 3, boards: 1 });
  // Ben's three arguments are the Yes option's top three, and each is the only wording in its row.
  expect(await statistics(b.ben)).toEqual({ arguments: 3, argumentsInTopThree: 3, wordings: 3, wordingsLeading: 3, sources: 0, comments: 0, boards: 1 });
});

test("L-09: deleted, hidden, and merged items are left out, and so are comments whose wording or option is gone", async () => {
  const cara = await member("cara");
  await argue(cara, b.yes);
  const merged = await argue(cara, b.no, b.board, "Staff would lose their only shared day off.");
  const alone = await argue(cara, b.no, b.board, "Opening costs more than the budget allows.");
  const hiddenWording = await reword(cara, b.otherArgument);
  const commentedWording = await reword(cara, b.argument);
  const deletedWording = await reword(cara, b.argument, b.board, "Sunday is the one day shift workers have free.");
  const maybe = ids.itemId();
  done(await api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: maybe, name: "Maybe" } }), "add an option");

  await comment(cara, { versionId: b.version });
  await comment(cara, { versionId: commentedWording });
  const deletedComment = await comment(cara, {});
  const hiddenComment = await comment(cara, {});
  await comment(cara, { optionId: maybe });
  expect(await statistics(cara)).toEqual({ arguments: 3, argumentsInTopThree: 3, wordings: 6, wordingsLeading: 3, sources: 0, comments: 5, boards: 1 });

  done(await api.put(`/api/boards/${b.board}/versions/${hiddenWording}/hidden`, { as: b.ana, body: { reason: "offtopic" } }), "Ana hides a wording");
  done(await api.put(`/api/boards/${b.board}/versions/${commentedWording}/hidden`, { as: b.ana, body: { reason: "offtopic" } }), "Ana hides the commented wording");
  done(await api.delete(`/api/boards/${b.board}/versions/${deletedWording}`, { as: cara }), "Cara deletes a wording");
  // Deleting an argument's only wording deletes the argument.
  done(await api.delete(`/api/boards/${b.board}/versions/${alone.version}`, { as: cara }), "Cara deletes an argument");
  // Combining the only wording of an argument into another merges the argument; the wording is still Cara's.
  done(await api.post(`/api/boards/${b.board}/versions/${merged.version}/combine`, { as: b.ana, body: { into: b.otherArgument } }), "Ana combines Cara's argument");
  done(await api.delete(`/api/boards/${b.board}/comments/${deletedComment}`, { as: cara }), "Cara deletes a comment");
  done(await api.put(`/api/boards/${b.board}/comments/${hiddenComment}/hidden`, { as: b.ana, body: { reason: "spam" } }), "Ana hides a comment");
  done(await api.delete(`/api/boards/${b.board}/options/${maybe}`, { as: b.ana }), "Ana deletes the option");

  // Left: the Yes argument and its wording, the combined wording (second in Ana's No row), and the comment on Ana's wording.
  expect(await statistics(cara)).toEqual({ arguments: 1, argumentsInTopThree: 1, wordings: 2, wordingsLeading: 1, sources: 0, comments: 1, boards: 1 });
});

test("L-09: an argument whose only wording is hidden is left out and takes no place in the top three, and a source counts only while a shown wording cites it", async () => {
  const cara = await member("cara");
  // Nothing is published, so the order is the order added. Yes: Ana's seeded argument, Ben's two, then Cara's.
  const bens = await argue(b.ben, b.yes, b.board, "Sunday opening brings in families.");
  await argue(b.ben, b.yes, b.board, "Sunday is when commuters are home.");
  const yes = await argue(cara, b.yes, b.board, "Sunday hours match the parks' hours.");
  const hidden = await argue(cara, b.no, b.board, "Staff would lose their only shared day off.");
  const deleted = await argue(cara, b.no, b.board, "Opening costs more than the budget allows.");
  await cite(cara, yes.version);
  await cite(cara, hidden.version);
  await cite(cara, deleted.version);

  // Cara's Yes argument is fourth, so only her two No arguments are in their option's top three.
  expect(await statistics(cara)).toEqual({ arguments: 3, argumentsInTopThree: 2, wordings: 3, wordingsLeading: 3, sources: 3, comments: 0, boards: 1 });

  // With the only wording of Ben's first argument hidden, that argument takes no place, and Cara's moves into the top three.
  done(await api.put(`/api/boards/${b.board}/versions/${bens.version}/hidden`, { as: b.ana, body: { reason: "offtopic" } }), "Ana hides Ben's wording");
  expect(await statistics(cara)).toEqual({ arguments: 3, argumentsInTopThree: 3, wordings: 3, wordingsLeading: 3, sources: 3, comments: 0, boards: 1 });

  // Hiding the only wording of Cara's argument leaves out the argument, the wording, and the source only it cites.
  done(await api.put(`/api/boards/${b.board}/versions/${hidden.version}/hidden`, { as: b.ana, body: { reason: "offtopic" } }), "Ana hides Cara's wording");
  expect(await statistics(cara)).toEqual({ arguments: 2, argumentsInTopThree: 2, wordings: 2, wordingsLeading: 2, sources: 2, comments: 0, boards: 1 });

  // Deleting the only wording of an argument deletes the argument, and the source only it cited drops out too.
  done(await api.delete(`/api/boards/${b.board}/versions/${deleted.version}`, { as: cara }), "Cara deletes an argument");
  expect(await statistics(cara)).toEqual({ arguments: 1, argumentsInTopThree: 1, wordings: 1, wordingsLeading: 1, sources: 1, comments: 0, boards: 1 });
});

test("L-09: only boards where the person still has a role count: not one they were removed from, a deleted one, or one whose link was turned off", async () => {
  const cara = await member("cara");
  await argue(cara, b.yes);

  const removed = await seedBoard(db.client, ids);
  await addMember(db.client, removed.board, cara, "contributor");
  await argue(cara, removed.yes, removed.board);
  await comment(cara, { versionId: removed.version }, removed.board);

  const deleted = await seedBoard(db.client, ids);
  await addMember(db.client, deleted.board, cara, "contributor");
  await argue(cara, deleted.yes, deleted.board);
  await cite(cara, deleted.version, deleted.board);

  // Cara gets into this one by its link, which records her as a member, and writes there.
  const linked = await seedBoard(db.client, ids);
  done(await api.get(`/api/boards/${linked.board}`, { as: cara }), "Cara opens the link");
  await argue(cara, linked.no, linked.board);

  expect(await statistics(cara)).toMatchObject({ arguments: 4, comments: 1, sources: 1, boards: 4 });

  done(await api.delete(`/api/boards/${removed.board}/people/${cara}`, { as: removed.ana }), "Ana removes Cara");
  await db.client.query("update board set deleted_at = now() where id = $1", [deleted.board]);
  done(await api.put(`/api/boards/${linked.board}/access`, { as: linked.ana, body: { general: "invited", linkRole: "contributor" } }), "Ana turns the link off");

  expect(await statistics(cara)).toEqual({ arguments: 1, argumentsInTopThree: 1, wordings: 1, wordingsLeading: 1, sources: 0, comments: 0, boards: 1 });
});

test("L-09: each request answers only its own person's numbers, and no vote or assessment counts as anyone's", async () => {
  const seeded = { arguments: 2, argumentsInTopThree: 2, wordings: 2, wordingsLeading: 2, sources: 1, comments: 0, boards: 1 };
  expect(await statistics(b.ana)).toEqual(seeded);
  // Ben is a contributor who hasn't written anything.
  expect(await statistics(b.ben)).toEqual(ZERO);

  // Ben and a voter vote on and assess Ana's work; neither gains anything, and Ana gains nothing from their votes.
  const dan = await addAccount(db.client, ids, "dan", { confirmed: true });
  await addMember(db.client, b.board, dan, "voter");
  for (const who of [b.ben, dan]) {
    done(await upvote(who, b.argument), "importance");
    done(await api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: who, body: { value: 1 } }), "articulation");
    done(await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: who, body: { rev: 1, supported: true } }), "assessment");
  }
  // Ana's own votes and assessment add nothing either.
  done(await upvote(b.ana, b.otherArgument), "Ana's importance");
  done(await api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/assessment`, { as: b.ana, body: { rev: 1, supported: false } }), "Ana's assessment");
  api.clock.advance(TICK);
  done(await api.get(`/api/boards/${b.board}`, { as: b.ana }), "a read publishes the order");

  expect(await statistics(b.ana)).toEqual(seeded);
  expect(await statistics(b.ben)).toEqual(ZERO);
  expect(await statistics(dan)).toEqual(ZERO);
});

test("L-09: a new account gets all zeros, even on a board it opened by the link", async () => {
  const eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  expect(await statistics(eve)).toEqual(ZERO);
  done(await api.get(`/api/boards/${b.board}`, { as: eve }), "Eve opens the link");
  expect(await statistics(eve)).toEqual(ZERO);
});

test("L-09: a signed-out request, or one for a deleted account, gets 401", async () => {
  expect(await api.get("/api/account/statistics")).toMatchObject({ status: 401, body: { status: "refused", reason: "signed_out" } });

  const cara = await member("cara");
  await argue(cara, b.yes);
  const username = (await db.client.query("select username from account where id = $1", [cara])).rows[0].username;
  done(await api.post("/api/account/delete", { as: cara, body: { username } }), "Cara deletes her account");
  expect(await api.get("/api/account/statistics", { as: cara })).toMatchObject({ status: 401, body: { status: "refused", reason: "signed_out" } });
});
