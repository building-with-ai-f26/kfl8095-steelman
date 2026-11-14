import { beforeAll, describe, expect, test } from "vitest";
import { BOARD_ID_BYTES } from "@steelman/shared";
import { createSeededIds } from "@steelman/shared/testing";
import { systemIds } from "../../src/system.ts";
import { addAccount } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";

// New steelman (F-01, M1-6): a question and two to four options make a
// board, its creator is its Owner, and, as the builder decided on Nov 14, a
// new board is open to anyone with the link, as Contributor.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(601);
let maker: string;
beforeAll(async () => {
  maker = await addAccount(db.client, ids, "mia", { confirmed: true });
});

const create = (body: unknown, as: string = maker) => api.post("/api/boards", { as, body });
const QUESTION = "Should our school start an hour later?";

describe("creating a board", () => {
  test("F-01: a question and its options make a board, and the answer names it", async () => {
    const { status, body } = await create({ question: QUESTION, options: ["Start later", "Keep the time"] });

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", board: expect.stringMatching(/^[A-Za-z0-9_-]{12}$/) });
  });

  test("F-01: the creator can open it at once, as its Owner, with the question and the options in order", async () => {
    const { body } = await create({ question: QUESTION, options: ["Start later", "Keep the time", "Make it optional"] });

    const opened = await api.get(`/api/boards/${body.board}`, { as: maker });

    expect(opened.status).toBe(200);
    expect(opened.body.board.question).toBe(QUESTION);
    expect(opened.body.options.map((o: { name: string; position: number }) => [o.position, o.name])).toEqual([
      [1, "Start later"],
      [2, "Keep the time"],
      [3, "Make it optional"],
    ]);
    expect(opened.body.arguments).toEqual([]);
    expect(opened.body.role).toBe("owner");
    const members = await db.client.query("select account_id, role, joined_via from board_member where board_id = $1", [body.board]);
    expect(members.rows).toEqual([{ account_id: maker, role: "owner", joined_via: "invite" }]);
  });

  test("H-02, F-01: a new board is open to anyone with the link, as Contributor", async () => {
    const { body } = await create({ question: QUESTION, options: ["Start later", "Keep the time"] });

    expect((await api.get(`/api/boards/${body.board}`, { as: maker })).body.access).toEqual({ general: "link", linkRole: "contributor" });
  });

  test("H-02, F-01: its creator can choose who can get in from the start", async () => {
    const { body } = await create({ question: QUESTION, options: ["Start later", "Keep the time"], access: { general: "invited", linkRole: "voter" } });

    expect((await api.get(`/api/boards/${body.board}`, { as: maker })).body.access).toEqual({ general: "invited", linkRole: "voter" });
  });

  test("F-01, H-02: someone who isn't a member and can't come in by the link can't open it", async () => {
    const { body } = await create({ question: QUESTION, options: ["Start later", "Keep the time"] });
    // A test account has no confirmed email, so the link doesn't let it in.
    const stranger = await addAccount(db.client, ids, "sol");

    const { status, body: refused } = await api.get(`/api/boards/${body.board}`, { as: stranger });

    expect(status).toBe(403);
    expect(refused.reason).toBe("no_access");
  });

  test("F-01, H-02: a board made Invited only refuses even a signed-in stranger with a confirmed email", async () => {
    const { body } = await create({ question: QUESTION, options: ["Start later", "Keep the time"], access: { general: "invited", linkRole: "contributor" } });
    const stranger = await addAccount(db.client, ids, "tam", { confirmed: true });

    const { status, body: refused } = await api.get(`/api/boards/${body.board}`, { as: stranger });

    expect(status).toBe(403);
    expect(refused.reason).toBe("no_access");
  });

  test("F-01: it goes in the change log as made by its creator, with no text", async () => {
    const { body } = await create({ question: QUESTION, options: ["Start later", "Keep the time"] });

    const log = await db.client.query("select seq, actor_id, kind, subject_kind, subject_id, before, after from change where board_id = $1", [body.board]);
    expect(log.rows).toEqual([{ seq: "1", actor_id: maker, kind: "board_created", subject_kind: "board", subject_id: body.board, before: {}, after: {} }]);
  });

  test("F-01: the text is tidied as the rest of the board's is", async () => {
    const { body } = await create({ question: "  Should our school\n start   an hour later? ", options: ["  Start   later ", "Keep the time"] });

    const opened = (await api.get(`/api/boards/${body.board}`, { as: maker })).body;
    expect(opened.board.question).toBe("Should our school start an hour later?");
    expect(opened.options[0].name).toBe("Start later");
  });

  test("F-01: each board gets its own ID", async () => {
    const first = (await create({ question: QUESTION, options: ["Start later", "Keep the time"] })).body.board;
    const second = (await create({ question: QUESTION, options: ["Start later", "Keep the time"] })).body.board;

    expect(first).not.toBe(second);
  });

  test("F-01: someone signed out can't make one", async () => {
    const { status, body } = await api.post("/api/boards", { body: { question: QUESTION, options: ["Start later", "Keep the time"] } });

    expect(status).toBe(401);
    expect(body.reason).toBe("signed_out");
  });
});

describe("what a board needs", () => {
  const refused = async (body: unknown) => {
    const before = Number((await db.client.query("select count(*) from board")).rows[0].count);
    const { status } = await create(body);
    const after = Number((await db.client.query("select count(*) from board")).rows[0].count);
    return { status, made: after - before };
  };

  test("F-01: a question", async () => {
    for (const question of ["", "   \n "]) expect(await refused({ question, options: ["Start later", "Keep the time"] })).toEqual({ status: 400, made: 0 });
  });

  test("F-01: a question of at most 200 characters", async () => {
    expect(await refused({ question: "Q".repeat(201), options: ["Start later", "Keep the time"] })).toEqual({ status: 400, made: 0 });
    expect((await create({ question: "Q".repeat(200), options: ["Start later", "Keep the time"] })).status).toBe(200);
  });

  test("F-01: at least two options, and more than four is refused", async () => {
    expect(await refused({ question: QUESTION, options: ["Start later"] })).toEqual({ status: 400, made: 0 });
    expect(await refused({ question: QUESTION, options: ["A", "B", "C", "D", "E"] })).toEqual({ status: 400, made: 0 });
    expect((await create({ question: QUESTION, options: ["A", "B", "C", "D"] })).status).toBe(200);
  });

  test("F-01: options with different names, ignoring capitals and spacing", async () => {
    expect(await refused({ question: QUESTION, options: ["Start later", " start   LATER "] })).toEqual({ status: 400, made: 0 });
  });

  test("F-01: no empty option, and none longer than 80 characters", async () => {
    expect(await refused({ question: QUESTION, options: ["Start later", "  "] })).toEqual({ status: 400, made: 0 });
    expect(await refused({ question: QUESTION, options: ["Start later", "O".repeat(81)] })).toEqual({ status: 400, made: 0 });
  });

  test("H-02: who can get in, if given, is invited people or anyone with the link, as Voter or Contributor", async () => {
    expect(await refused({ question: QUESTION, options: ["Start later", "Keep the time"], access: { general: "everyone", linkRole: "voter" } })).toEqual({ status: 400, made: 0 });
    expect(await refused({ question: QUESTION, options: ["Start later", "Keep the time"], access: { general: "link", linkRole: "owner" } })).toEqual({ status: 400, made: 0 });
  });

  test("F-01: nothing else: the board's ID is the service's to choose", async () => {
    expect(await refused({ question: QUESTION, options: ["Start later", "Keep the time"], id: "chosen-by-me" })).toEqual({ status: 400, made: 0 });
  });
});

describe("a board's ID", () => {
  test("F-01: is 72 random bits from the system's random numbers, written as 12 characters", () => {
    expect(BOARD_ID_BYTES * 8).toBe(72);
    const made = new Set(Array.from({ length: 1000 }, () => systemIds.boardId()));

    expect(made.size).toBe(1000);
    for (const id of made) expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });
});

describe("making a board while signed in", () => {
  const signIn = useSignIn(db, { seed: 602 });
  const make = (cookie: string, origin?: string | null) =>
    signIn.request("POST", "/api/boards", { cookie, body: { question: QUESTION, options: ["Start later", "Keep the time"] }, ...(origin === undefined ? {} : { origin }) });

  test("F-01, L-01: works with the session cookie, from Steelman's own site", async () => {
    const cookie = await signIn.signedIn("maker@example.test", "board_maker");

    const { status, body } = await make(cookie);

    expect(status).toBe(200);
    expect((await signIn.request("GET", `/api/boards/${body.board}`, { cookie })).body.role).toBe("owner");
  });

  test("F-01, L-01: is refused from another site, or with no Origin (cross-site request forgery)", async () => {
    const cookie = await signIn.signedIn("forged@example.test", "forged_maker");
    const before = Number((await db.client.query("select count(*) from board")).rows[0].count);

    for (const origin of ["https://evil.example", null]) expect((await make(cookie, origin)).status, String(origin)).toBe(403);
    expect(Number((await db.client.query("select count(*) from board")).rows[0].count)).toBe(before);
  });

  test("F-01, L-01: is refused before a username is chosen", async () => {
    const cookie = await signIn.signedIn("nameless@example.test");

    const { status, body } = await make(cookie);

    expect(status).toBe(403);
    expect(body.reason).toBe("needs_username");
  });
});
