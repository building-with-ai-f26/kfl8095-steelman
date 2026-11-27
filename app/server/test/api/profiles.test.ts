import { beforeEach, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Profiles (L-03, M3d-16; plans/architecture.md §7 "Who sees what about
// people"): GET /api/people/<username> gathers one person's arguments,
// wordings, and sources, but only from boards where the viewer already has a
// role, which today is a board_member row. A board open to anyone with the
// link lets in every signed-in account with a confirmed email, so a board the
// viewer could open but never has stays out, and so does its question: the
// link is the only secret such a board has. A name held after a change
// (M3d-15) answers with the new name.

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1616 });
const ids = createSeededIds(1618);
const DAY = 86_400_000;
const INVITED_QUESTION = "Should the staff room get a second fridge?";
const LINK_QUESTION = "Should the gym open at six?";

let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const done = (answer: { status: number; body: { status?: string } }, what: string) => {
  expect(answer.status, `${what}: ${JSON.stringify(answer.body)}`).toBe(200);
};
const nameOf = async (account: string): Promise<string> => (await db.client.query("select username from account where id = $1", [account])).rows[0].username;
const profile = (as: string | undefined, name: string) => api.get(`/api/people/${encodeURIComponent(name)}`, as === undefined ? {} : { as });
/** The profile as this viewer reads it, which must answer 200. */
const read = async (as: string, of: string) => {
  const answer = await profile(as, await nameOf(of));
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.body;
};
const texts = (items: { text: string }[]) => items.map((item) => item.text).sort();
const confirmed = (name: string) => addAccount(db.client, ids, name, { confirmed: true });

/** A board this person owns, open only to invited people or to anyone with the link, with its two options. */
async function boardOf(owner: string, question: string, general: "invited" | "link") {
  const made = await api.post("/api/boards", { as: owner, body: { question, options: ["Yes", "No"], access: { general, linkRole: "contributor" } } });
  done(made, "make a board");
  const snapshot = await api.get(`/api/boards/${made.body.board}`, { as: owner });
  return { board: made.body.board as string, yes: snapshot.body.options[0].id as string, no: snapshot.body.options[1].id as string };
}
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
const cite = async (as: string, version: string, board = b.board, name = "Library visitor count") => {
  const id = ids.itemId();
  done(
    await api.post(`/api/boards/${board}/versions/${version}/sources`, { as, body: { id, name, locator: "https://example.test/visits", finding: "Visits rise on weekends.", backsUp: "", limits: "" } }),
    "cite",
  );
  return id;
};

test("L-03: a profile shows the person's arguments, other wordings, and sources, each with its board, its question, the card it opens, and its age", async () => {
  const cara = await confirmed("cara");
  await addMember(db.client, b.board, cara, "contributor");
  api.clock.advance(60_000);
  const bens = await argue(b.ben, b.yes);
  const onAnas = await reword(b.ben, b.argument);
  const source = await cite(b.ben, bens.version);

  const body = await read(cara, b.ben);
  expect(body.username).toBe(await nameOf(b.ben));
  expect(body.you).toBe(false);
  expect(body.now).toBe(api.clock.now().toISOString());
  const at = (body.arguments[0] as { at: string }).at;
  expect(Date.parse(at)).toBeLessThanOrEqual(Date.parse(body.now));
  expect(body.arguments).toEqual([{ id: bens.argument, board: b.board, question: "Should our library open on Sundays?", version: bens.version, text: "Weekend hours help students.", at }]);
  // The wording that started his own argument is the argument, so Wordings holds only his other wording, as the prototype's tabs do.
  expect(body.wordings).toEqual([expect.objectContaining({ id: onAnas, board: b.board, version: onAnas, text: "Students need Sunday hours before Monday exams." })]);
  // A source opens the wording that cites it.
  expect(body.sources).toEqual([expect.objectContaining({ id: source, board: b.board, version: bens.version, text: "Library visitor count" })]);

  // Your own profile says so.
  const own = await read(b.ben, b.ben);
  expect(own.you).toBe(true);
  // Ana's seeded arguments, and the source she cited, show to anyone on the board.
  const anas = await read(cara, b.ana);
  expect(texts(anas.arguments)).toEqual(["Staff need a guaranteed day off.", "Sunday is the only free day for many people."]);
  expect(anas.sources).toEqual([expect.objectContaining({ id: b.source, version: b.version, text: "City library survey, 2025" })]);
});

test("L-03: a contribution on a board the viewer has no role on never appears, and neither does that board's question", async () => {
  const invited = await boardOf(b.ana, INVITED_QUESTION, "invited");
  await argue(b.ana, invited.yes, invited.board, "A second fridge stops the lunch queue.");

  const body = await read(b.ben, b.ana);
  expect(texts(body.arguments)).toEqual(["Staff need a guaranteed day off.", "Sunday is the only free day for many people."]);
  expect(JSON.stringify(body)).not.toContain(INVITED_QUESTION);
  expect(JSON.stringify(body)).not.toContain(invited.board);
  expect(JSON.stringify(body)).not.toContain("second fridge");

  // Ana sees her own writing there, because she has a role on it.
  expect(texts((await read(b.ana, b.ana)).arguments)).toContain("A second fridge stops the lunch queue.");
});

test("L-03: a link board the viewer could open but never has stays out, with its question, and shows once they open it by its link", async () => {
  const link = await boardOf(b.ana, LINK_QUESTION, "link");
  await argue(b.ana, link.yes, link.board, "Early hours suit people who work days.");
  // Cara is a member of the seeded board only; the gym board lets her in by its link, but she hasn't opened it.
  const cara = await confirmed("cara");
  await addMember(db.client, b.board, cara, "contributor");
  const before = await read(cara, b.ana);
  expect(texts(before.arguments)).toEqual(["Staff need a guaranteed day off.", "Sunday is the only free day for many people."]);
  expect(JSON.stringify(before)).not.toContain(LINK_QUESTION);
  expect(JSON.stringify(before)).not.toContain(link.board);

  // Reading a profile records no membership, so asking again changes nothing.
  expect(await read(cara, b.ana)).toEqual(before);

  done(await api.get(`/api/boards/${link.board}`, { as: cara }), "Cara opens the gym board by its link");
  const after = await read(cara, b.ana);
  expect(after.arguments).toContainEqual(expect.objectContaining({ board: link.board, question: LINK_QUESTION, text: "Early hours suit people who work days." }));
});

test("L-03: a person who shares no board with the viewer shows their name and no items", async () => {
  const cara = await confirmed("cara");
  // The seeded board is open by its link, and Cara has never opened it.
  const body = await read(cara, b.ana);
  expect(body).toEqual({ username: await nameOf(b.ana), you: false, now: api.clock.now().toISOString(), arguments: [], wordings: [], sources: [] });
  expect(JSON.stringify(body)).not.toContain("Should our library open on Sundays?");
});

test("L-03: removing the viewer from a board drops that board's items from every profile they open", async () => {
  const cara = await confirmed("cara");
  await addMember(db.client, b.board, cara, "contributor");
  await argue(b.ben, b.no, b.board, "Opening costs more than the budget allows.");
  expect((await read(cara, b.ana)).arguments).toHaveLength(2);
  expect((await read(cara, b.ben)).arguments).toHaveLength(1);

  done(await api.delete(`/api/boards/${b.board}/people/${cara}`, { as: b.ana }), "Ana removes Cara");
  for (const person of [b.ana, b.ben]) {
    const body = await read(cara, person);
    expect([...body.arguments, ...body.wordings, ...body.sources]).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("Should our library open on Sundays?");
  }

  // Turning the link off removes the link's members, and so drops the board too.
  const dee = await confirmed("dee");
  done(await api.get(`/api/boards/${b.board}`, { as: dee }), "Dee opens the board by its link");
  expect((await read(dee, b.ana)).arguments).toHaveLength(2);
  done(await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "invited", linkRole: "contributor" } }), "Ana turns the link off");
  expect((await read(dee, b.ana)).arguments).toEqual([]);
});

test("L-03: hidden and deleted items are left out, even for the board's Owner", async () => {
  const bens = await argue(b.ben, b.yes);
  const gone = await argue(b.ben, b.no, b.board, "Opening costs more than the budget allows.");
  await cite(b.ben, gone.version, b.board, "Budget report");
  const hidden = await reword(b.ben, b.argument);
  const deleted = await reword(b.ben, b.otherArgument, b.board, "Staff deserve two days off in a row.");
  const before = await read(b.ana, b.ben);
  expect(texts(before.arguments)).toEqual(["Opening costs more than the budget allows.", "Weekend hours help students."]);
  expect(before.wordings).toHaveLength(2);
  expect(texts(before.sources)).toEqual(["Budget report"]);

  done(await api.put(`/api/boards/${b.board}/versions/${hidden}/hidden`, { as: b.ana, body: { reason: "offtopic" } }), "Ana hides Ben's wording");
  done(await api.delete(`/api/boards/${b.board}/versions/${deleted}`, { as: b.ben }), "Ben deletes a wording");
  // Deleting an argument's only wording deletes the argument, and its source is cited by no shown wording.
  done(await api.delete(`/api/boards/${b.board}/versions/${gone.version}`, { as: b.ben }), "Ben deletes an argument");

  const after = await read(b.ana, b.ben);
  expect(after.arguments).toEqual([expect.objectContaining({ id: bens.argument })]);
  expect(after.wordings).toEqual([]);
  expect(after.sources).toEqual([]);
  expect(JSON.stringify(after)).not.toContain("Students need Sunday hours before Monday exams.");
});

test("L-03: an argument shows only its creator's words, when their first wording is hidden and another person's stays shown", async () => {
  const cara = await confirmed("cara");
  await addMember(db.client, b.board, cara, "contributor");
  const bens = await argue(b.ben, b.yes);
  const caras = await reword(cara, bens.argument);
  done(await api.put(`/api/boards/${b.board}/versions/${bens.version}/hidden`, { as: b.ana, body: { reason: "offtopic" } }), "Ana hides Ben's first wording");

  // Ben has no shown wording on his argument, so it isn't on his profile, and Cara's words never show as his.
  const ben = await read(b.ana, b.ben);
  expect([...ben.arguments, ...ben.wordings]).toEqual([]);
  expect(JSON.stringify(ben)).not.toContain("Students need Sunday hours before Monday exams.");
  const caraRead = await read(b.ana, cara);
  expect(caraRead.arguments).toEqual([]);
  expect(caraRead.wordings).toEqual([expect.objectContaining({ id: caras, version: caras, text: "Students need Sunday hours before Monday exams." })]);

  // A later wording of his own becomes the argument's card, and isn't listed twice.
  api.clock.advance(60_000);
  const later = await reword(b.ben, bens.argument, b.board, "Sunday hours help students who work on Saturdays.");
  const after = await read(b.ana, b.ben);
  expect(after.arguments).toEqual([expect.objectContaining({ id: bens.argument, version: later, text: "Sunday hours help students who work on Saturdays." })]);
  expect(after.wordings).toEqual([]);
  // A second one of his own after that is one of his other wordings.
  api.clock.advance(60_000);
  const third = await reword(b.ben, bens.argument, b.board, "Students who work Saturdays can only study on Sundays.");
  expect((await read(b.ana, b.ben)).wordings).toEqual([expect.objectContaining({ id: third, version: third })]);
});

test("L-03: an older wording combined into someone else's argument stays the writer's wording, and the argument shows its creator's words", async () => {
  const bens = await argue(b.ben, b.yes);
  api.clock.advance(60_000);
  const anas = await argue(b.ana, b.yes, b.board, "Families can visit together on Sundays.");
  // Ben's only wording goes into Ana's newer argument, so his argument is combined away (M3a-7), and his wording is the older one there.
  done(await api.post(`/api/boards/${b.board}/versions/${bens.version}/combine`, { as: b.ana, body: { into: anas.argument } }), "Ana combines Ben's wording");

  const ana = await read(b.ben, b.ana);
  expect(ana.arguments).toContainEqual(expect.objectContaining({ id: anas.argument, version: anas.version, text: "Families can visit together on Sundays." }));
  expect(JSON.stringify(ana)).not.toContain("Weekend hours help students.");
  const ben = await read(b.ana, b.ben);
  expect(ben.arguments).toEqual([]);
  expect(ben.wordings).toEqual([expect.objectContaining({ id: bens.version, version: bens.version, text: "Weekend hours help students." })]);
});

test("L-03: items on a deleted option or a deleted board are left out", async () => {
  const bens = await argue(b.ben, b.no, b.board, "Opening costs more than the budget allows.");
  const onAnas = await reword(b.ben, b.otherArgument, b.board, "Staff deserve two days off in a row.");
  await cite(b.ben, bens.version, b.board, "Budget report");
  expect((await read(b.ana, b.ben)).arguments).toHaveLength(1);
  // The board refuses to delete an option that holds an argument (options.ts), so the option is deleted here directly:
  // the profile keeps the rule Your statistics keeps anyway.
  await write(db.client, b.board, (seq) => db.client.query("update option set deleted_at = now(), changed_seq = $2 where id = $1", [b.no, seq]));
  const ben = await read(b.ana, b.ben);
  expect([...ben.arguments, ...ben.wordings, ...ben.sources]).toEqual([]);
  expect(JSON.stringify(ben)).not.toContain(onAnas);
  expect(texts((await read(b.ben, b.ana)).arguments)).toEqual(["Sunday is the only free day for many people."]);

  // A board is deleted with its last owner's account, which also removes its members (account.ts), so the board alone is
  // marked deleted first, to check that a membership on a deleted board counts for nothing.
  const cara = await confirmed("cara");
  const dee = await confirmed("dee");
  const fridge = await boardOf(cara, INVITED_QUESTION, "invited");
  await addMember(db.client, fridge.board, b.ben, "contributor");
  await addMember(db.client, fridge.board, dee, "viewer");
  await argue(b.ben, fridge.yes, fridge.board, "A second fridge stops the lunch queue.");
  expect(texts((await read(dee, b.ben)).arguments)).toEqual(["A second fridge stops the lunch queue."]);
  await write(db.client, fridge.board, () => db.client.query("update board set deleted_at = now() where id = $1", [fridge.board]));
  expect((await read(dee, b.ben)).arguments).toEqual([]);
  await write(db.client, fridge.board, () => db.client.query("update board set deleted_at = null where id = $1", [fridge.board]));

  // The real way: Cara removes Ben, so no one can take the board, and deletes her account.
  done(await api.delete(`/api/boards/${fridge.board}/people/${b.ben}`, { as: cara }), "Cara removes Ben");
  done(await api.post("/api/account/delete", { as: cara, body: { username: await nameOf(cara) } }), "Cara deletes her account");
  const after = await read(dee, b.ben);
  expect(after.arguments).toEqual([]);
  expect(JSON.stringify(after)).not.toContain(INVITED_QUESTION);
});

test("L-03: each tab lists the newest first", async () => {
  const first = await argue(b.ben, b.yes);
  api.clock.advance(60_000);
  const second = await argue(b.ben, b.no, b.board, "Opening costs more than the budget allows.");
  api.clock.advance(60_000);
  const olderWording = await reword(b.ben, b.argument);
  api.clock.advance(60_000);
  const newerWording = await reword(b.ben, b.otherArgument, b.board, "Staff deserve two days off in a row.");
  api.clock.advance(60_000);
  const olderSource = await cite(b.ben, first.version);
  api.clock.advance(60_000);
  const newerSource = await cite(b.ben, second.version, b.board, "Budget report");

  const body = await read(b.ana, b.ben);
  expect(body.arguments.map((item: { id: string }) => item.id)).toEqual([second.argument, first.argument]);
  expect(body.wordings.map((item: { id: string }) => item.id)).toEqual([newerWording, olderWording]);
  expect(body.sources.map((item: { id: string }) => item.id)).toEqual([newerSource, olderSource]);
});

test("L-03: no count of votes, assessments, or points is in the answer", async () => {
  const bens = await argue(b.ben, b.yes);
  done(await api.put(`/api/boards/${b.board}/arguments/${bens.argument}/importance`, { as: b.ana, body: { value: 1 } }), "Ana votes");
  done(await api.put(`/api/boards/${b.board}/versions/${bens.version}/articulation`, { as: b.ana, body: { value: 1 } }), "Ana prefers it");
  done(await api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { rev: 1, supported: true } }), "Ben assesses");

  for (const [viewer, person] of [
    [b.ana, b.ben],
    [b.ben, b.ana],
  ] as const) {
    const body = await read(viewer, person);
    expect(Object.keys(body).sort()).toEqual(["arguments", "now", "sources", "username", "wordings", "you"]);
    for (const item of [...body.arguments, ...body.wordings, ...body.sources]) expect(Object.keys(item).sort()).toEqual(["at", "board", "id", "question", "text", "version"]);
  }
});

test("L-03: an unknown name, a deleted account's name, the deleted stand-in's name, and a name of the wrong shape get 404", async () => {
  const cara = await confirmed("cara");
  const caraName = await nameOf(cara);
  expect(await profile(b.ana, "nobody_here")).toEqual({ status: 404, body: { reason: "not_found" } });
  expect((await profile(b.ana, caraName)).status).toBe(200);
  // Capitals don't matter, as they don't when inviting by name.
  expect((await profile(b.ana, caraName.toUpperCase())).status).toBe(200);

  done(await api.post("/api/account/delete", { as: cara, body: { username: caraName } }), "Cara deletes her account");
  expect(await profile(b.ana, caraName)).toEqual({ status: 404, body: { reason: "not_found" } });
  expect(await profile(b.ana, "deleted_account")).toEqual({ status: 404, body: { reason: "not_found" } });
  expect(await profile(b.ana, "a b")).toEqual({ status: 404, body: { reason: "not_found" } });
  expect(await profile(b.ana, "x".repeat(41))).toEqual({ status: 404, body: { reason: "not_found" } });
});

test("L-03, L-04: a held old name answers with the new name, and an ended hold or a deleted account's hold answers 404", async () => {
  const old = await nameOf(b.ben);
  const renamed = "ben_renamed";
  done(await api.put("/api/account/username", { as: b.ben, body: { username: renamed } }), "Ben changes his name");
  const held = await profile(b.ana, old);
  expect(held.status).toBe(200);
  expect(held.body.username).toBe(renamed);
  expect(held.body).toEqual((await profile(b.ana, renamed)).body);

  // Thirty days on, the hold has ended, and the old name answers 404 even before the daily job deletes it.
  api.clock.advance(30 * DAY);
  expect(await profile(b.ana, old)).toEqual({ status: 404, body: { reason: "not_found" } });
  expect((await profile(b.ana, renamed)).status).toBe(200);

  // A deleted account keeps its hold for the 30 days, but there is no one to send the old name to.
  const cara = await confirmed("cara");
  const caraOld = await nameOf(cara);
  const caraNew = "cara_renamed";
  done(await api.put("/api/account/username", { as: cara, body: { username: caraNew } }), "Cara changes her name");
  expect((await profile(b.ana, caraOld)).body.username).toBe(caraNew);
  done(await api.post("/api/account/delete", { as: cara, body: { username: caraNew } }), "Cara deletes her account");
  expect(await profile(b.ana, caraOld)).toEqual({ status: 404, body: { reason: "not_found" } });
  expect(await profile(b.ana, caraNew)).toEqual({ status: 404, body: { reason: "not_found" } });
});

test("L-03: signed out is 401, and so is a deleted account", async () => {
  const name = await nameOf(b.ana);
  expect(await profile(undefined, name)).toEqual({ status: 401, body: { status: "refused", reason: "signed_out" } });
  const cara = await confirmed("cara");
  done(await api.post("/api/account/delete", { as: cara, body: { username: await nameOf(cara) } }), "Cara deletes her account");
  expect(await profile(cara, name)).toEqual({ status: 401, body: { status: "refused", reason: "signed_out" } });
});
