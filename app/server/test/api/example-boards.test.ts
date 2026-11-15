import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { newBoardInput, sourceInput } from "@steelman/shared";
import { createFakeClock, createSeededIds } from "@steelman/shared/testing";
import { createDatabase } from "../../src/db/database.ts";
import type { Db } from "../../src/db/database.ts";
import { DEMO_PEOPLE, seedDemoBoard } from "../../src/demo-board.ts";
import { EXAMPLE_BOARDS, EXAMPLE_PEOPLE, EXAMPLE_SOURCES, scaled, seedExampleBoards } from "../../src/example-boards.ts";
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

  test("F-01: an existing test account is found whatever its capitals, not made again", async () => {
    await db.client.query("update account set username = 'Maya.Chen' where username = 'maya.chen'");
    try {
      const accounts = Number((await db.client.query("select count(*) from account")).rows[0].count);

      await seedExampleBoards(kysely, clock, ids);

      expect(Number((await db.client.query("select count(*) from account")).rows[0].count)).toBe(accounts);
    } finally {
      await db.client.query("update account set username = 'maya.chen' where username = 'Maya.Chen'");
    }
  });

  test("F-01: it refuses to write as a real person (an account with an email) who has one of its usernames", async () => {
    await db.client.query("update account set email = 'riley@example.test' where username = 'riley_park'");
    try {
      const accounts = Number((await db.client.query("select count(*) from account")).rows[0].count);

      await expect(seedExampleBoards(kysely, clock, ids)).rejects.toThrow(/riley_park/);

      expect(Number((await db.client.query("select count(*) from account")).rows[0].count)).toBe(accounts);
    } finally {
      await db.client.query("update account set email = null where username = 'riley_park'");
    }
  });

  test("C-01, B-03: the open-weight board's wordings cite the prototype's sources and carry its assessments, scaled to the seed's people", async () => {
    const example = EXAMPLE_BOARDS[0]!;
    const { body } = await api.get(`/api/boards/${example.id}`, { as: await accountId(example.owner) });
    const sources = new Map<string, { name: string; locator: string; finding: string; addedByName: string }>(body.sources.map((s: { id: string }) => [s.id, s]));
    let checked = 0;
    for (const [, text, , evidence] of example.options.flatMap((o) => o.arguments.flatMap((a) => a.wordings))) {
      const version = body.versions.find((v: { wording: string }) => v.wording === text);
      const cited = version.sourceIds.map((id: string) => sources.get(id));
      const expected = (evidence?.sources ?? []).map((key) => EXAMPLE_SOURCES[key]);

      expect(cited.map((s: { name: string }) => s.name).sort(), text).toEqual(expected.map((s) => s.name).sort());
      for (const source of expected) expect(cited).toContainEqual(expect.objectContaining({ name: source.name, locator: source.locator, finding: source.finding, addedByName: source.addedBy }));
      expect({ yes: version.yes, no: version.no }, text).toEqual(evidence ? scaled(evidence, EXAMPLE_PEOPLE.length) : { yes: 0, no: 0 });
      if (evidence) checked++;
    }
    expect(checked).toBe(13);
  });

  test("C-01: a source cited by several wordings is one source, and each is one the source form could have taken", async () => {
    const example = EXAMPLE_BOARDS[0]!;
    const { body } = await api.get(`/api/boards/${example.id}`, { as: await accountId(example.owner) });

    expect(body.sources.map((s: { name: string }) => s.name).sort()).toEqual(Object.values(EXAMPLE_SOURCES).map((s) => s.name).sort());
    const clouds = body.sources.find((s: { name: string }) => s.name === EXAMPLE_SOURCES.clouds.name).id;
    expect(body.versions.filter((v: { sourceIds: string[] }) => v.sourceIds.includes(clouds))).toHaveLength(2);
    for (const source of Object.values(EXAMPLE_SOURCES)) {
      expect(sourceInput.safeParse({ name: source.name, locator: source.locator, finding: source.finding, backsUp: "", limits: "" }).success, source.name).toBe(true);
    }
  });

  test("B-03: scaling keeps the prototype's counts when they fit, and its share when they don't", () => {
    expect(scaled({ yes: 4, no: 0 }, 17)).toEqual({ yes: 4, no: 0 });
    expect(scaled({ yes: 14, no: 6 }, 17)).toEqual({ yes: 12, no: 5 });
    expect(scaled({ yes: 16, no: 4 }, 17)).toEqual({ yes: 14, no: 3 });
  });

  test("F-01: running it again adds nothing", async () => {
    const before = (await db.client.query("select (select count(*) from board) as boards, (select count(*) from account) as accounts, (select count(*) from version) as versions")).rows[0];

    expect(await seedExampleBoards(kysely, clock, ids)).toEqual([]);

    expect((await db.client.query("select (select count(*) from board) as boards, (select count(*) from account) as accounts, (select count(*) from version) as versions")).rows[0]).toEqual(before);
  });
});
