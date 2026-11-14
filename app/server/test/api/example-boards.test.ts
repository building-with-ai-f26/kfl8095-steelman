import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { newBoardInput } from "@steelman/shared";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { DEMO_PEOPLE, seedDemoBoard } from "../../src/demo-board.ts";
import { EXAMPLE_BOARDS, EXAMPLE_PEOPLE, seedExampleBoards } from "../../src/example-boards.ts";
import { NOON } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The local seed (M1-6): the prototype's example boards and their people as
// test accounts, added through the same service functions the API uses.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const clock = createFakeClock(new Date(NOON));
const ids = createSeededIds(611);
let kysely: Db;
let added: string[];
const accountId = async (username: string) => (await db.client.query("select id from account where username = $1", [username])).rows[0]?.id as string;

beforeAll(async () => {
  kysely = createDatabase(db.url);
  // As `npm run db:seed` does: the demo board first, whose people are among the examples' too.
  await seedDemoBoard(kysely, clock, ids);
  added = await seedExampleBoards(kysely, clock, ids);
  // Several hundred writes, one transaction each, so it takes a few seconds when every test file runs at once.
}, 60_000);
afterAll(async () => {
  await kysely.destroy();
});

describe("the example boards", () => {
  test("F-01: all seven are added, each with its fixed link", () => {
    expect(added).toEqual(EXAMPLE_BOARDS.map((b) => b.id));
    expect(EXAMPLE_BOARDS.map((b) => b.id)).toEqual(["example-0001", "example-0002", "example-0003", "example-0004", "example-0005", "example-0006", "example-0007"]);
  });

  test("F-01: each one is a board the New steelman sheet could have made", () => {
    for (const board of EXAMPLE_BOARDS) {
      expect(newBoardInput.safeParse({ question: board.question, options: board.options.map((o) => o.name) }).success, board.id).toBe(true);
    }
  });

  test("F-01: each opens for its owner with the prototype's question, options, and wordings", async () => {
    for (const example of EXAMPLE_BOARDS) {
      const { status, body } = await api.get(`/api/boards/${example.id}`, { as: await accountId(example.owner) });

      expect(status, example.id).toBe(200);
      expect(body.role).toBe("owner");
      expect(body.board.question).toBe(example.question);
      expect(body.options.map((o: { name: string }) => o.name)).toEqual(example.options.map((o) => o.name));
      const texts = example.options.flatMap((o) => o.arguments.flatMap((a) => a.wordings.map(([, text]) => text)));
      expect(body.versions.map((v: { wording: string }) => v.wording).sort()).toEqual([...texts].sort());
    }
  });

  test("F-01: each option's arguments keep the prototype's order", async () => {
    for (const example of EXAMPLE_BOARDS) {
      const { body } = await api.get(`/api/boards/${example.id}`, { as: await accountId(example.owner) });
      for (const [o, option] of example.options.entries()) {
        const optionId = body.options[o].id;
        const byId = new Map<string, string>(body.versions.map((v: { argumentId: string; wording: string }) => [v.argumentId, v.wording]));
        const shown = (body.order.arguments[optionId] ?? []).map((id: string) => byId.get(id));
        const expected = [...option.arguments].sort((a, b) => b.importance - a.importance).map((a) => a.wordings[0][1]);
        // Each argument's first wording names it here; with several wordings, any of them may stand for it.
        expect(shown.length, `${example.id} ${option.name}`).toBe(expected.length);
        for (const [i, argument] of [...option.arguments].sort((a, b) => b.importance - a.importance).entries()) {
          expect(argument.wordings.map(([, text]) => text), `${example.id} ${option.name} #${i + 1}`).toContain(shown[i]);
        }
      }
    }
  });

  test("F-01: an argument's importance is its prototype score in votes, one per four points, from the board's people", async () => {
    for (const example of EXAMPLE_BOARDS) {
      const { body } = await api.get(`/api/boards/${example.id}`, { as: await accountId(example.owner) });
      const firstWording = new Map<string, string>(body.versions.map((v: { argumentId: string; wording: string }) => [v.wording, v.argumentId]));
      const voters = example.open ? EXAMPLE_PEOPLE.length : 1;
      for (const argument of example.options.flatMap((o) => o.arguments)) {
        const row = body.arguments.find((a: { id: string }) => a.id === firstWording.get(argument.wordings[0][1]));
        expect(row.importance, `${example.id}: ${argument.wordings[0][1]}`).toBe(Math.min(Math.round(argument.importance / 4), voters));
      }
    }
  });

  test("H-02: the open ones are open to anyone with the link, as Contributor; Denver is its owner's alone", async () => {
    for (const example of EXAMPLE_BOARDS) {
      const { body } = await api.get(`/api/boards/${example.id}`, { as: await accountId(example.owner) });
      expect(body.access, example.id).toEqual(example.open ? { general: "link", linkRole: "contributor" } : { general: "invited", linkRole: "contributor" });
    }
    const denver = EXAMPLE_BOARDS.find((b) => !b.open)!;
    const someoneElse = await accountId(EXAMPLE_PEOPLE.find((name) => name !== denver.owner)!);
    expect((await api.get(`/api/boards/${denver.id}`, { as: someoneElse })).body.reason).toBe("no_access");
  });

  test("F-01: the test accounts are the examples' people, and the demo board's people aren't made twice", async () => {
    const names = (await db.client.query("select username from account order by username")).rows.map((r) => r.username);

    expect(names).toEqual([...new Set([...EXAMPLE_PEOPLE, ...DEMO_PEOPLE])].sort());
    expect(EXAMPLE_PEOPLE).not.toContain("kieran_lamee");
  });

  test("F-01: running it again adds nothing", async () => {
    const before = (await db.client.query("select (select count(*) from board) as boards, (select count(*) from account) as accounts, (select count(*) from version) as versions")).rows[0];

    expect(await seedExampleBoards(kysely, clock, ids)).toEqual([]);

    expect((await db.client.query("select (select count(*) from board) as boards, (select count(*) from account) as accounts, (select count(*) from version) as versions")).rows[0]).toEqual(before);
  });
});
