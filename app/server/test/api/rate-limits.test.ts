import { beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { LIMITS } from "../../src/limits.ts";
import { useApi } from "../support/api.ts";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";

// The class-trial rate limits for what needs an account (M2-6, architecture
// §7 "Rate limits and abuse"): counted per account, in the service's memory,
// on the service's clock. Over a limit: 429 with Retry-After, and nothing saved.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(66);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

let seeded: SeededBoard;
beforeAll(async () => {
  seeded = await seedBoard(db.client, ids);
});

const newArgument = (option: string) => ({ id: ids.itemId(), optionId: option, versionId: ids.itemId(), wording: `An argument, ${ids.itemId()}.`, context: "" });
const newBoard = () => ({ question: "Should the pod meet on Fridays?", options: ["Yes", "No"] });

describe("over a limit", () => {
  test("M-12: the next new board past the limit is refused with how long to wait; another person isn't affected; an hour later it's allowed", async () => {
    const ana = await addPerson("ana_boards");
    for (let n = 0; n < LIMITS.board.most; n++) expect((await api.post("/api/boards", { as: ana, body: newBoard() })).status).toBe(200);

    const over = await api.post("/api/boards", { as: ana, body: newBoard() });

    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ status: "refused", reason: "too_many" });
    expect(over.body.retryAfter).toBeGreaterThan(0);
    expect(over.body.retryAfter).toBeLessThanOrEqual(HOUR / 1000);
    expect((await api.post("/api/boards", { as: seeded.ben, body: newBoard() })).status).toBe(200);
    api.clock.advance(HOUR);
    expect((await api.post("/api/boards", { as: ana, body: newBoard() })).status).toBe(200);
  });

  test("M-12 C-01: arguments, wordings, edits, and sources share one writing limit; the next past it saves nothing", async () => {
    const writer = await addContributor("writer");
    const writes = LIMITS.writing.most;
    const argument = newArgument(seeded.yes);
    expect((await api.post(`/api/boards/${seeded.board}/arguments`, { as: writer, body: argument })).status).toBe(200);
    expect((await api.post(`/api/boards/${seeded.board}/arguments/${seeded.argument}/versions`, { as: writer, body: { id: ids.itemId(), wording: "Another way to say it.", context: "" } })).status).toBe(200);
    expect((await api.put(`/api/boards/${seeded.board}/versions/${argument.versionId}`, { as: writer, body: { baseRev: 1, wording: "Said better.", context: "" } })).status).toBe(200);
    expect((await api.post(`/api/boards/${seeded.board}/versions/${argument.versionId}/sources`, { as: writer, body: source() })).status).toBe(200);
    for (let n = 4; n < writes; n++) expect((await api.post(`/api/boards/${seeded.board}/arguments`, { as: writer, body: newArgument(seeded.no) })).status).toBe(200);

    const late = newArgument(seeded.no);
    const over = await api.post(`/api/boards/${seeded.board}/arguments`, { as: writer, body: late });
    const overSource = await api.post(`/api/boards/${seeded.board}/versions/${argument.versionId}/sources`, { as: writer, body: source() });

    expect([over.status, overSource.status]).toEqual([429, 429]);
    const board = (await api.get(`/api/boards/${seeded.board}`, { as: writer })).body;
    expect(board.arguments.map((row: { id: string }) => row.id)).not.toContain(late.id);
    api.clock.advance(HOUR);
    expect((await api.post(`/api/boards/${seeded.board}/arguments`, { as: writer, body: late })).status).toBe(200);
  });

  test("M-12: votes and assessments share one limit a minute; another person isn't affected; a minute later it's allowed", async () => {
    const voter = await addContributor("voter");
    const votes = LIMITS.voting.most;
    for (let n = 0; n < votes; n++) {
      const answer =
        n % 3 === 0
          ? await api.put(`/api/boards/${seeded.board}/arguments/${seeded.argument}/importance`, { as: voter, body: { value: n % 2 ? 1 : -1 } })
          : n % 3 === 1
            ? await api.put(`/api/boards/${seeded.board}/versions/${seeded.version}/articulation`, { as: voter, body: { value: n % 2 ? 1 : null } })
            : await api.put(`/api/boards/${seeded.board}/versions/${seeded.version}/assessment`, { as: voter, body: { rev: 1, supported: n % 2 === 0 } });
      expect(answer.status, `vote ${n + 1}`).toBe(200);
    }

    const over = await api.put(`/api/boards/${seeded.board}/arguments/${seeded.otherArgument}/importance`, { as: voter, body: { value: 1 } });

    expect(over.status).toBe(429);
    expect(over.body.retryAfter).toBeLessThanOrEqual(60);
    expect((await api.put(`/api/boards/${seeded.board}/arguments/${seeded.otherArgument}/importance`, { as: seeded.ben, body: { value: 1 } })).status).toBe(200);
    const other = (await api.get(`/api/boards/${seeded.board}`, { as: voter })).body.arguments.find((row: { id: string }) => row.id === seeded.otherArgument);
    expect(other.myVote).toBeNull();
    api.clock.advance(MINUTE);
    expect((await api.put(`/api/boards/${seeded.board}/arguments/${seeded.otherArgument}/importance`, { as: voter, body: { value: 1 } })).status).toBe(200);
  }, 60_000);

  test("M-12: the answer carries Retry-After in seconds, as HTTP says", async () => {
    const quick = await addPerson("ana_retry");
    for (let n = 0; n < LIMITS.board.most; n++) await api.post("/api/boards", { as: quick, body: newBoard() });
    api.clock.advance(20 * MINUTE);

    const over = await api.app.inject({ method: "POST", url: "/api/boards", headers: { "x-steelman-test-user": quick }, payload: newBoard() });

    expect(over.statusCode).toBe(429);
    expect(over.headers["retry-after"]).toBe(String(40 * 60));
  });
});

describe("not counted", () => {
  test("M-12: a request that saves nothing, invalid or refused by the person's role, isn't counted", async () => {
    const maker = await addPerson("ana_invalid");
    for (let n = 0; n < LIMITS.board.most + 5; n++) expect((await api.post("/api/boards", { as: maker, body: { question: "", options: ["Yes", "No"] } })).status).toBe(400);
    const viewer = await addPerson("viewer");
    await db.client.query("insert into board_member (board_id, account_id, role, joined_via, joined_at) values ($1, $2, 'viewer', 'invite', $3)", [seeded.board, viewer, new Date(api.clock.now())]);
    for (let n = 0; n < LIMITS.writing.most + 5; n++) expect((await api.post(`/api/boards/${seeded.board}/arguments`, { as: viewer, body: newArgument(seeded.yes) })).status).toBe(403);

    expect((await api.post("/api/boards", { as: maker, body: newBoard() })).status).toBe(200);
  });

  test("M-12: reading, deleting, and Share settings aren't limited", async () => {
    const writer = await addContributor("deleter");
    for (let n = 0; n < LIMITS.writing.most; n++) await api.post(`/api/boards/${seeded.board}/arguments`, { as: writer, body: newArgument(seeded.yes) });
    const mine = newArgument(seeded.yes);
    expect((await api.post(`/api/boards/${seeded.board}/arguments`, { as: writer, body: mine })).status).toBe(429);

    for (let n = 0; n < 5; n++) expect((await api.get(`/api/boards/${seeded.board}`, { as: writer })).status).toBe(200);
    const written = (await api.get(`/api/boards/${seeded.board}`, { as: writer })).body.versions.find((row: { authorId: string; deleted: boolean }) => row.authorId === writer && !row.deleted);
    expect((await api.delete(`/api/boards/${seeded.board}/versions/${written.id}`, { as: writer })).status).toBe(200);
    for (let n = 0; n < 5; n++) {
      expect((await api.put(`/api/boards/${seeded.board}/access`, { as: seeded.ana, body: { general: n % 2 ? "link" : "invited", linkRole: "contributor" } })).status).toBe(200);
    }
    await api.put(`/api/boards/${seeded.board}/access`, { as: seeded.ana, body: { general: "link", linkRole: "contributor" } });
  });
});

let people = 0;
/** A new account with a username, so its counts start at nothing. */
async function addPerson(name: string): Promise<string> {
  const id = ids.itemId();
  await db.client.query("insert into account (id, username, email_verified, created_at) values ($1, $2, true, $3)", [id, `${name}${++people}`, new Date(api.clock.now())]);
  return id;
}

/** A new person who may write and vote on the seeded board. */
async function addContributor(name: string): Promise<string> {
  const id = await addPerson(name);
  await db.client.query("insert into board_member (board_id, account_id, role, joined_via, joined_at) values ($1, $2, 'contributor', 'invite', $3)", [seeded.board, id, new Date(api.clock.now())]);
  return id;
}

function source() {
  return { id: ids.itemId(), name: "City library survey, 2026", locator: "", finding: "Most weekday visitors can't come on weekdays.", backsUp: "", limits: "" };
}
