import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// History lists new arguments and wordings (J-03; the builder, Nov 22, 2026).
// Adding one writes no change-log row, because the log never holds what
// anyone wrote (invariant 7), so History builds these entries when it's read,
// from the wordings the board already holds: who added each, when, and its
// ID. A wording added in the same write as an argument is a new argument;
// any other is a new wording. Nothing new is stored, and an entry still holds
// no one's words.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(2048);
let b: SeededBoard;
let val: string;
let eve: string;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  val = await addAccount(db.client, ids, "val", { confirmed: true });
  await addMember(db.client, b.board, val, "viewer");
  eve = await addAccount(db.client, ids, "eve", { confirmed: true });
  await addMember(db.client, b.board, eve, "editor");
});

interface Entry {
  seq: number;
  at: string;
  actorName: string;
  kind: string;
  subjectKind: string;
  subjectId: string;
  reason: string | null;
  detail: Record<string, unknown>;
}

const FAMILIES = "Weekend hours suit families.";
const SHIFTS = "People who work shifts can only come on Sundays.";

const usernameOf = async (account: string) => (await db.client.query("select username from account where id = $1", [account])).rows[0].username as string;
const history = async (as = val) => (await api.get(`/api/boards/${b.board}/history`, { as })).body.entries as Entry[];
const additions = (entries: Entry[]) => entries.filter((e) => e.kind === "argument_added" || e.kind === "wording_added");

/** Adds an argument through the API, and answers its first wording's ID. */
async function newArgument(as: string, wording = FAMILIES, option = b.yes): Promise<{ argument: string; version: string }> {
  const argument = ids.itemId();
  const version = ids.itemId();
  const { body } = await api.post(`/api/boards/${b.board}/arguments`, { as, body: { id: argument, optionId: option, versionId: version, wording, context: "" } });
  expect(body).toMatchObject({ status: "done" });
  return { argument, version };
}

/** Adds a wording to an argument through the API, and answers its ID. */
async function newWording(as: string, argument: string, wording = SHIFTS): Promise<string> {
  const version = ids.itemId();
  const { body } = await api.post(`/api/boards/${b.board}/arguments/${argument}/versions`, { as, body: { id: version, wording, context: "" } });
  expect(body).toMatchObject({ status: "done" });
  return version;
}

const addOption = async (name: string, as = b.ana) => api.post(`/api/boards/${b.board}/options`, { as, body: { id: ids.itemId(), name } });

/** A change-log row written straight to the database, as the service would write it. */
async function logged(kind: string, subjectKind: string, subject: string, after: object = {}): Promise<void> {
  await write(db.client, b.board, (seq) =>
    db.client.query("insert into change (board_id, seq, at, actor_id, kind, subject_kind, subject_id, after) values ($1, $2, now(), $3, $4, $5, $6, $7)", [
      b.board,
      seq,
      b.ana,
      kind,
      subjectKind,
      subject,
      JSON.stringify(after),
    ]),
  );
}

describe("History lists what was added", () => {
  test("J-03, A-03, A-05: a new argument and a new wording each appear once, with who, when, and the wording's ID, in order among the changes", async () => {
    const start = api.clock.now().getTime();
    api.clock.advance(60_000);
    const added = await newArgument(b.ben);
    api.clock.advance(60_000);
    await addOption("Only in winter", eve);
    api.clock.advance(60_000);
    const wording = await newWording(eve, b.argument);

    const entries = await history();

    const benName = await usernameOf(b.ben);
    const eveName = await usernameOf(eve);
    expect(entries.slice(0, 3).map((e) => [e.kind, e.actorName, e.subjectKind, e.subjectId, e.at])).toEqual([
      ["wording_added", eveName, "version", wording, new Date(start + 180_000).toISOString()],
      ["option_added", eveName, "option", expect.any(String), new Date(start + 120_000).toISOString()],
      ["argument_added", benName, "version", added.version, new Date(start + 60_000).toISOString()],
    ]);
    // Newest first: each addition carries the change number of the write that made it.
    expect(entries.map((e) => e.seq)).toEqual([...entries.map((e) => e.seq)].sort((x, y) => y - x));
    expect(entries[0]!.seq).toBeGreaterThan(entries[1]!.seq);
    expect(entries[1]!.seq).toBeGreaterThan(entries[2]!.seq);
    expect(entries[0]).toMatchObject({ reason: null, detail: {} });
    expect(entries.filter((e) => e.subjectId === added.version)).toHaveLength(1);
    expect(entries.filter((e) => e.subjectId === wording)).toHaveLength(1);
  });

  test("J-03: the arguments a board began with are listed too, each once, though they share a change number", async () => {
    const entries = await history();

    const anaName = await usernameOf(b.ana);
    expect(entries.map((e) => [e.kind, e.actorName, e.subjectId])).toEqual(
      [b.version, b.otherVersion].sort().map((version) => ["argument_added", anaName, version]),
    );
    expect(new Set(entries.map((e) => `${e.kind}:${e.seq}:${e.subjectId}`)).size).toBe(entries.length);
  });

  test("J-03, J-04: a separation is listed as a separation, not as a new argument", async () => {
    const wording = await newWording(b.ben, b.argument);
    const fresh = ids.itemId();
    const separated = (await api.post(`/api/boards/${b.board}/versions/${wording}/separate`, { as: eve, body: { argumentId: fresh } })).body.seq as number;

    const entries = await history();

    expect(entries[0]).toMatchObject({ kind: "wording_separated", seq: separated, subjectId: wording, detail: { argument: fresh } });
    expect(entries.filter((e) => e.seq === separated)).toHaveLength(1);
    expect(entries.filter((e) => e.kind === "argument_added").map((e) => e.subjectId).sort()).toEqual([b.version, b.otherVersion].sort());
    // The wording was added to an argument that was already there, and moving it doesn't change that.
    expect(entries.filter((e) => e.subjectId === wording).map((e) => e.kind)).toEqual(["wording_separated", "wording_added"]);
  });

  test("J-03, J-04: a wording that began an argument is still a new argument after it's combined into another", async () => {
    const added = await newArgument(b.ben);
    await api.post(`/api/boards/${b.board}/versions/${added.version}/combine`, { as: eve, body: { into: b.argument } });

    const entries = await history();

    expect(entries.filter((e) => e.subjectId === added.version).map((e) => e.kind)).toEqual(["wording_combined", "argument_added"]);
  });

  test("J-03, M-07: what a deleted account added shows as deleted_account's", async () => {
    const added = await newArgument(eve);
    const wording = await newWording(eve, b.argument);
    await api.post("/api/account/delete", { as: eve, body: { username: await usernameOf(eve) } });

    const entries = await history();

    expect(additions(entries).filter((e) => [added.version, wording].includes(e.subjectId)).map((e) => [e.kind, e.actorName])).toEqual([
      ["wording_added", "deleted_account"],
      ["argument_added", "deleted_account"],
    ]);
  });

  test("J-03, H-03, J-02: a Viewer gets the same entries as an Editor, a hidden wording's and a deleted one's among them", async () => {
    const hidden = await newWording(b.ben, b.argument);
    const deleted = await newArgument(b.ben);
    await api.put(`/api/boards/${b.board}/versions/${hidden}/hidden`, { as: eve, body: { reason: "spam" } });
    await api.delete(`/api/boards/${b.board}/versions/${deleted.version}`, { as: b.ben });

    const asViewer = await history(val);

    expect(asViewer).toEqual(await history(eve));
    expect(additions(asViewer).map((e) => e.subjectId)).toEqual(expect.arrayContaining([hidden, deleted.version]));
  });

  test("J-03, invariant 7: an entry for something added never holds what was written", async () => {
    await newArgument(b.ben, FAMILIES);
    await newWording(b.ben, b.argument, SHIFTS);

    const { body } = await api.get(`/api/boards/${b.board}/history`, { as: eve });

    const sent = JSON.stringify(body);
    for (const text of [FAMILIES, SHIFTS, "Sunday is the only free day for many people.", "Staff need a guaranteed day off.", "City library survey"]) expect(sent).not.toContain(text);
    for (const entry of additions(body.entries)) expect(Object.keys(entry).sort()).toEqual(["actorName", "at", "detail", "kind", "reason", "seq", "subjectId", "subjectKind"]);
  });

  test("J-03: History answers at most 500 entries, the newest of the changes and the additions together", async () => {
    // 262 additions (the board began with 2) and 260 changes: neither is over 500 alone.
    await write(db.client, b.board, async (seq) => {
      for (let i = 0; i < 260; i += 1) await addArgument(db.client, ids, { board: b.board, option: b.yes, author: b.ben, seq });
    });
    for (let i = 0; i < 260; i += 1) await logged("option_renamed", "option", b.yes);

    const entries = await history();

    expect(entries).toHaveLength(500);
    expect(entries.slice(0, 260).every((e) => e.kind === "option_renamed")).toBe(true);
    expect(additions(entries)).toHaveLength(240);
    // The oldest are the ones left out: the two the board began with.
    expect(entries.map((e) => e.subjectId)).not.toContain(b.version);
    expect(entries.map((e) => e.subjectId)).not.toContain(b.otherVersion);
    expect(entries.map((e) => e.seq)).toEqual([...entries.map((e) => e.seq)].sort((x, y) => y - x));
  });
});

describe("History on an edited source", () => {
  test("J-03, C-02: an edit that cleared the source's report says so; one that didn't doesn't", async () => {
    await logged("source_edited", "source", b.source, { revised: [] });
    await logged("source_edited", "source", b.source, { revised: [], cleared: true });

    const entries = await history();

    expect(entries[0]).toMatchObject({ kind: "source_edited", subjectId: b.source, detail: { cleared: true } });
    expect(entries[1]).toMatchObject({ kind: "source_edited", subjectId: b.source });
    expect(entries[1]!.detail).toEqual({});
  });
});
