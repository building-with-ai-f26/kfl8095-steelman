import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addMember, seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Closing a board (M3b-3, I-05): the Owner closes it now, sets a time it
// closes, and reopens it. Nothing is written when the time passes: the
// service asks one rule, closedSince, with its clock. Tests move the fake
// clock forward, which never goes back, and never wait.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(3301);

const PERSONAS = ["owner", "editor", "contributor", "voter", "viewer", "signed out", "non-member"] as const;
type Persona = (typeof PERSONAS)[number];
const HOUR = 3_600_000;

let b: SeededBoard;
let person: Record<Persona, string | null>;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  person = { owner: b.ana, contributor: b.ben, "signed out": null } as Record<Persona, string | null>;
  for (const [persona, name] of [["editor", "eve"], ["voter", "vic"], ["viewer", "val"]] as const) {
    person[persona] = await addAccount(db.client, ids, name, { confirmed: true });
    await addMember(db.client, b.board, person[persona]!, persona);
  }
  person["non-member"] = await addAccount(db.client, ids, "sam", { confirmed: true });
});

const as = (who: string | null) => (who === null ? {} : { as: who });
const close = (who: string | null = b.ana) => api.put(`/api/boards/${b.board}/closed`, as(who));
const reopen = (who: string | null = b.ana) => api.delete(`/api/boards/${b.board}/closed`, as(who));
const closeAt = (at: string | null, who: string | null = b.ana) => api.put(`/api/boards/${b.board}/closing`, { ...as(who), body: { closesAt: at } });
const inAnHour = () => new Date(api.clock.now().getTime() + HOUR).toISOString();
const seqOf = async () => Number((await db.client.query("select last_seq from board where id = $1", [b.board])).rows[0].last_seq);
const vote = (value: 1 | -1 | null = 1) => api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: b.ben, body: { value } });

describe("who may close, set a closing time, and reopen", () => {
  const WRITES = {
    "close now": () => close,
    "set a closing time": () => (who: string | null) => closeAt(inAnHour(), who),
    reopen: () => reopen,
  } as const;
  const expected = (persona: Persona) =>
    persona === "owner" ? 200 : persona === "signed out" ? 401 : 403;

  for (const [name, write] of Object.entries(WRITES)) {
    test(`I-05: only the Owner may ${name}, on an open board`, async () => {
      for (const persona of PERSONAS) {
        if (persona === "owner") continue;
        const before = await seqOf();
        const answer = await write()(person[persona]);
        expect(answer.status, persona).toBe(expected(persona));
        expect(answer.body.reason, persona).toBe(persona === "signed out" ? "signed_out" : persona === "non-member" ? "no_access" : "not_allowed");
        expect(await seqOf(), persona).toBe(before);
      }
      expect((await write()(b.ana)).status).toBe(200);
    });
  }

  test("I-05: on a closed board, the Owner may still reopen and set or clear a closing time, and nobody else may", async () => {
    await close();
    for (const persona of PERSONAS) {
      if (persona === "owner") continue;
      for (const write of [() => closeAt(inAnHour(), person[persona]), () => closeAt(null, person[persona]), () => reopen(person[persona])]) {
        expect((await write()).status, persona).toBe(expected(persona));
      }
    }
    expect((await closeAt(inAnHour())).body).toMatchObject({ status: "done" });
    expect((await closeAt(null)).body).toMatchObject({ status: "done" });
    expect((await reopen()).body).toMatchObject({ status: "done" });
  });
});

describe("a board closed by the route", () => {
  test("I-05: every kind of write is refused board_closed, and every role still reads", async () => {
    await close();
    const before = await seqOf();
    const writes = [
      () => vote(),
      () => api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: b.ben, body: { value: 1 } }),
      () => api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { rev: 1, supported: true } }),
      () => api.post(`/api/boards/${b.board}/arguments`, { as: b.ana, body: { id: ids.itemId(), optionId: b.yes, versionId: ids.itemId(), wording: "Late.", context: "" } }),
      () => api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as: b.ana, body: { id: ids.itemId(), wording: "Late, again.", context: "" } }),
      () => api.put(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana, body: { baseRev: 1, wording: "Edited late.", context: "" } }),
      () => api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana }),
      () => api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/report`, { as: b.ben, body: { reason: "spam", note: "" } }),
      () => api.put(`/api/boards/${b.board}/versions/${b.otherVersion}/hidden`, { as: b.ana, body: { reason: "spam" } }),
      () => api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id: ids.itemId(), name: "Late option" } }),
      () => api.put(`/api/boards/${b.board}/options/${b.no}`, { as: b.ana, body: { name: "Never" } }),
      () => api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "link", linkRole: "voter" } }),
      () => api.put(`/api/boards/${b.board}/question`, { as: b.ana, body: { question: "Closed, but renamed?" } }),
    ];
    for (const [i, write] of writes.entries()) {
      const answer = await write();
      expect({ i, status: answer.status, body: answer.body }).toEqual({ i, status: 409, body: { status: "refused", reason: "board_closed" } });
    }
    expect(await seqOf()).toBe(before);

    for (const persona of ["owner", "editor", "contributor", "voter", "viewer"] as const) {
      const read = await api.get(`/api/boards/${b.board}`, { as: person[persona]! });
      expect(read.status, persona).toBe(200);
      expect(read.body.board.closed, persona).toBe(true);
    }
  });

  test("I-05: reopening lets writes through again", async () => {
    await close();
    expect((await vote()).body).toMatchObject({ status: "refused", reason: "board_closed" });

    expect((await reopen()).body).toMatchObject({ status: "done" });
    expect((await vote()).body).toMatchObject({ status: "done" });
  });
});

describe("a board closed by its time", () => {
  test("I-05: with a time an hour ahead a vote is taken; once the clock passes it, with no write between, the same vote is refused", async () => {
    await closeAt(inAnHour());
    expect((await vote(1)).body).toMatchObject({ status: "done" });
    // Reading the board may publish the shared order, which takes a change number, so the number is read after it.
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ben })).body.board.closed).toBe(false);
    const seq = await seqOf();

    api.clock.advance(HOUR);

    expect((await vote(-1)).body).toEqual({ status: "refused", reason: "board_closed" });
    expect(await seqOf()).toBe(seq);
    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: b.ben })).body;
    expect(changes.closing).toMatchObject({ closed: true, closedAt: null });
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ben })).body.board.closed).toBe(true);
  });

  test("I-05: each queued kind of write is refused board_closed after a close by time", async () => {
    await closeAt(inAnHour());
    api.clock.advance(HOUR + 1);
    {
      const writes = [
        () => vote(),
        () => api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as: b.ben, body: { value: 1 } }),
        () => api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as: b.ben, body: { rev: 1, supported: true } }),
        () => api.post(`/api/boards/${b.board}/arguments`, { as: b.ana, body: { id: ids.itemId(), optionId: b.yes, versionId: ids.itemId(), wording: "Late.", context: "" } }),
        () => api.put(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana, body: { baseRev: 1, wording: "Edited late.", context: "" } }),
        () => api.delete(`/api/boards/${b.board}/versions/${b.version}`, { as: b.ana }),
      ];
      for (const [i, write] of writes.entries()) expect({ i, body: (await write()).body }).toEqual({ i, body: { status: "refused", reason: "board_closed" } });
    }
  });

  test("I-05: reopening clears a closing time that has passed, and keeps one still ahead", async () => {
    const soon = inAnHour();
    await closeAt(soon);
    api.clock.advance(HOUR);
    {
      expect((await reopen()).body).toMatchObject({ status: "done" });
      expect((await vote()).body).toMatchObject({ status: "done" });
      const snapshot = (await api.get(`/api/boards/${b.board}`, { as: b.ana })).body;
      expect(snapshot.board.closed).toBe(false);
      expect(snapshot).not.toHaveProperty("closing");

      const later = new Date(api.clock.now().getTime() + HOUR).toISOString();
      await closeAt(later);
      await close();
      expect((await reopen()).body).toMatchObject({ status: "done" });
      expect((await api.get(`/api/boards/${b.board}`, { as: b.ana })).body.closing).toEqual({ closed: false, closedAt: null, closesAt: later });
    }
  });

  test("I-05: a closing time already past, or now, is refused as invalid; Close now is the way to close at once", async () => {
    const now = api.clock.now().getTime();
    expect((await closeAt(new Date(now - 1).toISOString())).status).toBe(400);
    expect((await closeAt(new Date(now).toISOString())).status).toBe(400);
    expect((await closeAt("next Tuesday")).status).toBe(400);
    expect((await api.put(`/api/boards/${b.board}/closing`, { as: b.ana, body: {} })).status).toBe(400);
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ana })).body).not.toHaveProperty("closing");
  });
});

describe("after a board has closed by its time", () => {
  test("I-05: setting a later time opens it again until then, and clearing the time opens it, as the prototype does; History says the new time", async () => {
    await closeAt(inAnHour());
    api.clock.advance(HOUR);
    expect((await vote()).body).toMatchObject({ reason: "board_closed" });

    const later = new Date(api.clock.now().getTime() + HOUR).toISOString();
    expect((await closeAt(later)).body).toMatchObject({ status: "done" });
    expect((await vote()).body).toMatchObject({ status: "done" });

    api.clock.advance(HOUR);
    expect((await vote(-1)).body).toMatchObject({ reason: "board_closed" });
    expect((await closeAt(null)).body).toMatchObject({ status: "done" });
    expect((await vote(-1)).body).toMatchObject({ status: "done" });
  });

  test("I-05: Close now on a board its time has closed is already done, and sets no second date", async () => {
    await closeAt(inAnHour());
    api.clock.advance(HOUR);

    expect((await close()).body).toEqual({ status: "already_done" });
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ana })).body.closing.closedAt).toBeNull();
  });

  test("I-05, A-10: the combine preview answers board_closed once the board has closed by its time", async () => {
    const other = (await api.post(`/api/boards/${b.board}/arguments`, { as: b.ana, body: { id: ids.itemId(), optionId: b.yes, versionId: ids.itemId(), wording: "Another argument.", context: "" } })).body;
    expect(other).toMatchObject({ status: "done" });
    const into = (await db.client.query("select id from argument where board_id = $1 and option_id = $2 and id <> $3 limit 1", [b.board, b.yes, b.argument])).rows[0].id;
    expect((await api.get(`/api/boards/${b.board}/versions/${b.version}/combine?into=${into}`, { as: b.ana })).status).toBe(200);

    await closeAt(inAnHour());
    api.clock.advance(HOUR);

    const preview = await api.get(`/api/boards/${b.board}/versions/${b.version}/combine?into=${into}`, { as: b.ana });
    expect({ status: preview.status, body: preview.body }).toEqual({ status: 409, body: { status: "refused", reason: "board_closed" } });
  });
});

describe("what the board says about closing", () => {
  test("I-05: the snapshot, each changes answer, and the list carry the closing dates only when there are any", async () => {
    const at = inAnHour();
    const seq = await seqOf();
    await closeAt(at);

    const closing = { closed: false, closedAt: null, closesAt: at };
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ben })).body.closing).toEqual(closing);
    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${seq}`, { as: b.ben })).body;
    expect(changes.closing).toEqual(closing);
    expect((await api.get(`/api/boards/${b.board}/changes?after=${changes.seq}`, { as: b.ben })).body.closing).toEqual(closing);
    const listed = (await api.get("/api/boards", { as: b.ben })).body.boards.find((board: { id: string }) => board.id === b.board);
    expect(listed.closing).toEqual(closing);

    await close();
    const closed = (await api.get(`/api/boards/${b.board}`, { as: b.ben })).body.closing;
    expect(closed).toEqual({ closed: true, closedAt: api.clock.now().toISOString(), closesAt: at });
  });

  test("I-05: an open board with no closing time answers and lists exactly as before", async () => {
    const snapshot = (await api.get(`/api/boards/${b.board}`, { as: b.ben })).body;
    expect(Object.keys(snapshot).sort()).toEqual(["access", "arguments", "board", "options", "order", "role", "sources", "versions"]);
    expect(snapshot.board.closed).toBe(false);
    const changes = (await api.get(`/api/boards/${b.board}/changes?after=${snapshot.board.seq}`, { as: b.ben })).body;
    expect(changes).toEqual({ seq: snapshot.board.seq, options: [], arguments: [], versions: [], sources: [], order: null, log: [], access: snapshot.access, role: "contributor" });
    const listed = (await api.get("/api/boards", { as: b.ben })).body.boards.find((board: { id: string }) => board.id === b.board);
    expect(Object.keys(listed).sort()).toEqual(["changedAt", "comments", "createdAt", "id", "options", "owner", "question", "role"]);
  });

  test("I-05: each of the three writes sent twice changes nothing the second time", async () => {
    const at = inAnHour();
    for (const write of [() => closeAt(at), () => closeAt(null), () => close(), () => reopen()]) {
      expect((await write()).body, "first").toMatchObject({ status: "done" });
      const seq = await seqOf();
      expect((await write()).body).toEqual({ status: "already_done" });
      expect(await seqOf()).toBe(seq);
    }
  });

  test("I-05: the four change rows hold no text, and read deleted_account after the owner's account is deleted", async () => {
    await closeAt(inAnHour());
    await closeAt(null);
    await close();
    await reopen();

    const { rows } = await db.client.query("select kind, subject_kind, subject_id, before, after, reason from change where board_id = $1 and kind like '%clos%' or board_id = $1 and kind = 'board_reopened' order by seq", [b.board]);
    expect(rows.map((row) => row.kind)).toEqual(["closing_date_set", "closing_date_cleared", "board_closed", "board_reopened"]);
    for (const row of rows) {
      expect(row.subject_kind).toBe("board");
      expect(row.subject_id).toBe(b.board);
      expect(row.reason).toBeNull();
      expect(JSON.stringify([row.before, row.after])).not.toMatch(/[A-Za-z]{2,} [A-Za-z]/);
    }
    expect(typeof rows[0].after.at).toBe("number");

    const username = (await db.client.query("select username from account where id = $1", [b.ana])).rows[0].username;
    expect((await api.post("/api/account/delete", { as: b.ana, body: { username } })).status).toBe(200);
    const history = (await api.get(`/api/boards/${b.board}/history`, { as: b.ben })).body.entries as { kind: string; actorName: string }[];
    const ours = history.filter((entry) => ["closing_date_set", "closing_date_cleared", "board_closed", "board_reopened"].includes(entry.kind));
    expect(ours.map((entry) => entry.actorName)).toEqual(["deleted_account", "deleted_account", "deleted_account", "deleted_account"]);
  });

  test("I-05: History gives a closing time's moment with its entry", async () => {
    const at = inAnHour();
    await closeAt(at);

    const history = (await api.get(`/api/boards/${b.board}/history`, { as: b.ben })).body.entries as { kind: string; detail: { closesAt?: string } }[];
    expect(history.find((entry) => entry.kind === "closing_date_set")?.detail).toEqual({ closesAt: at });
  });
});
