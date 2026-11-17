import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// The full role matrix (M2-1; plans/architecture.md §7, point 5): every
// action × all seven personas, Owner, Editor, Contributor, Voter, Viewer,
// signed out, and non-member.
//
// M2 adds two roles to M1's three. A Viewer only reads. An Editor may do what
// a Contributor may, and also take a source off anyone's wording (the Owner
// could before; the Editor now can too). Editing and deleting a wording stay
// its author's, for an Editor as for anyone (Q28). A link gives Viewer,
// Voter, or Contributor, never Editor or Owner.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(502);

const boardSeq = async (board: string) => Number((await db.client.query("select last_seq from board where id = $1", [board])).rows[0].last_seq);
const members = async (board: string) =>
  (await db.client.query("select account_id, role, joined_via from board_member where board_id = $1 order by account_id", [board])).rows;

const PERSONAS = ["owner", "editor", "contributor", "voter", "viewer", "signed out", "non-member"] as const;
type Persona = (typeof PERSONAS)[number];
type Role = "viewer" | "voter" | "contributor" | "editor" | "owner";
const RANK: Record<Role, number> = { viewer: 1, voter: 2, contributor: 3, editor: 4, owner: 5 };

interface Cast {
  b: SeededBoard;
  person: Record<Persona, string | undefined>;
  /** A wording each persona wrote, for the actions only an author may take. Signed out wrote none. */
  own: Record<Persona, string | undefined>;
  /** A wording by another contributor, Cara, citing a source she added. No persona wrote either. */
  others: { version: string; source: string };
}

/** An invited-only board with one of each persona, and Cara, a contributor who isn't one of them. */
async function castBoard(): Promise<Cast> {
  const b = await seedBoard(db.client, ids);
  await db.client.query("update board set general_access = 'invited' where id = $1", [b.board]);
  const person: Cast["person"] = { owner: b.ana, contributor: b.ben, "signed out": undefined } as Cast["person"];
  for (const [persona, name] of [["editor", "eve"], ["voter", "vic"], ["viewer", "val"]] as const) {
    person[persona] = await addAccount(db.client, ids, name, { confirmed: true });
    await addMember(db.client, b.board, person[persona]!, persona);
  }
  person["non-member"] = await addAccount(db.client, ids, "sam", { confirmed: true });
  const cara = await addAccount(db.client, ids, "cara", { confirmed: true });
  await addMember(db.client, b.board, cara, "contributor");

  const own = { "signed out": undefined } as Cast["own"];
  const others = await write(db.client, b.board, async (seq) => {
    for (const persona of PERSONAS) {
      if (persona === "signed out") continue;
      own[persona] = (await addArgument(db.client, ids, { board: b.board, option: b.no, author: person[persona]!, seq, wording: `Written by the ${persona}.` })).version;
    }
    const { version } = await addArgument(db.client, ids, { board: b.board, option: b.yes, author: cara, seq, wording: "Written by Cara." });
    const source = ids.itemId();
    await db.client.query(
      `insert into source (id, board_id, name, locator, finding, backs_up, limits, added_by, created_at, changed_seq)
       values ($1, $2, 'Cara''s survey', 'https://example.test/survey', 'Most people work weekdays.', '', '', $3, now(), $4)`,
      [source, b.board, cara, seq],
    );
    await db.client.query("insert into revision_source (version_id, rev, source_id, board_id) values ($1, 1, $2, $3)", [version, source, b.board]);
    return { version, source };
  });
  return { b, person, own, others };
}

type Do = (cast: Cast, as: string | undefined, persona: Persona) => Promise<{ status: number; body: { reason?: string } }>;

interface Action {
  name: string;
  /** The least role that may take it. */
  least: Role;
  write: boolean;
  /** For an action on someone else's item: the least role that may take it anyway, or null if no role may. */
  othersFrom?: Role | null;
  run: Do;
}

const ACTIONS: Action[] = [
  { name: "read the board", least: "viewer", write: false, run: ({ b }, as) => api.get(`/api/boards/${b.board}`, { as }) },
  { name: "read its changes", least: "viewer", write: false, run: ({ b }, as) => api.get(`/api/boards/${b.board}/changes?after=0`, { as }) },
  {
    name: "vote on an argument's importance",
    least: "voter",
    write: true,
    run: ({ b }, as) => api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as, body: { value: 1 } }),
  },
  {
    name: "vote on a wording's articulation",
    least: "voter",
    write: true,
    run: ({ b }, as) => api.put(`/api/boards/${b.board}/versions/${b.version}/articulation`, { as, body: { value: 1 } }),
  },
  {
    name: "assess a wording's evidence",
    least: "voter",
    write: true,
    run: ({ b }, as) => api.put(`/api/boards/${b.board}/versions/${b.version}/assessment`, { as, body: { rev: 1, supported: true } }),
  },
  {
    name: "add an argument",
    least: "contributor",
    write: true,
    run: ({ b }, as) =>
      api.post(`/api/boards/${b.board}/arguments`, { as, body: { id: ids.itemId(), optionId: b.yes, versionId: ids.itemId(), wording: "Libraries are for everyone.", context: "" } }),
  },
  {
    name: "add a wording",
    least: "contributor",
    write: true,
    run: ({ b }, as) => api.post(`/api/boards/${b.board}/arguments/${b.argument}/versions`, { as, body: { id: ids.itemId(), wording: "Sunday suits working people.", context: "" } }),
  },
  {
    name: "edit their own wording",
    least: "contributor",
    write: true,
    run: ({ b, own }, as, persona) => api.put(`/api/boards/${b.board}/versions/${own[persona] ?? b.version}`, { as, body: { baseRev: 1, wording: "Edited.", context: "" } }),
  },
  {
    name: "edit someone else's wording",
    least: "contributor",
    othersFrom: null,
    write: true,
    run: ({ b, others }, as) => api.put(`/api/boards/${b.board}/versions/${others.version}`, { as, body: { baseRev: 1, wording: "Edited by someone else.", context: "" } }),
  },
  {
    name: "delete their own wording",
    least: "contributor",
    write: true,
    run: ({ b, own }, as, persona) => api.delete(`/api/boards/${b.board}/versions/${own[persona] ?? b.version}`, { as }),
  },
  {
    name: "delete someone else's wording",
    least: "contributor",
    othersFrom: null,
    write: true,
    run: ({ b, others }, as) => api.delete(`/api/boards/${b.board}/versions/${others.version}`, { as }),
  },
  {
    name: "take a source someone else added off someone else's wording",
    least: "contributor",
    othersFrom: "editor",
    write: true,
    run: ({ b, others }, as) => api.delete(`/api/boards/${b.board}/versions/${others.version}/sources/${others.source}`, { as }),
  },
  {
    name: "add a source to a wording",
    least: "contributor",
    write: true,
    run: ({ b }, as) =>
      api.post(`/api/boards/${b.board}/versions/${b.version}/sources`, {
        as,
        body: { id: ids.itemId(), name: "Staff rota", locator: "https://example.test/rota", finding: "Two people work Sundays.", backsUp: "", limits: "" },
      }),
  },
  {
    name: "edit a source someone else added",
    least: "contributor",
    othersFrom: null,
    write: true,
    run: ({ b, others }, as) =>
      api.put(`/api/boards/${b.board}/sources/${others.source}`, {
        as,
        body: { name: "Cara's survey", locator: "https://example.test/survey", finding: "Edited by someone else.", backsUp: "", limits: "" },
      }),
  },
  {
    name: "change who can get in",
    least: "owner",
    write: true,
    run: ({ b }, as) => api.put(`/api/boards/${b.board}/access`, { as, body: { general: "link", linkRole: "voter" } }),
  },
];

/** What each persona should be answered. */
function expected(persona: Persona, action: Action): { status: number; reason?: string } {
  if (persona === "signed out") return { status: 401, reason: "signed_out" };
  if (persona === "non-member") return { status: 403, reason: "no_access" };
  if (RANK[persona] < RANK[action.least]) return { status: 403, reason: "not_allowed" };
  if (action.othersFrom === undefined) return { status: 200 };
  if (action.othersFrom !== null && RANK[persona] >= RANK[action.othersFrom]) return { status: 200 };
  return { status: 403, reason: "not_author" };
}

const who = (persona: Persona) => (persona === "signed out" ? "someone signed out" : persona === "owner" || persona === "editor" ? `an ${persona}` : `a ${persona}`);

describe("the role matrix, all seven personas", () => {
  let cast: Cast;
  beforeEach(async () => {
    cast = await castBoard();
  });

  for (const action of ACTIONS) {
    for (const persona of PERSONAS) {
      const answer = expected(persona, action);
      test(`H-03: ${who(persona)} ${answer.status === 200 ? "may" : "may not"} ${action.name}`, async () => {
        const before = await boardSeq(cast.b.board);

        const { status, body } = await action.run(cast, cast.person[persona], persona);

        expect(status).toBe(answer.status);
        if (answer.reason) {
          expect(body.reason).toBe(answer.reason);
          // A refused write changes nothing, not even the change number.
          expect(await boardSeq(cast.b.board)).toBe(before);
        } else if (action.write) {
          expect(await boardSeq(cast.b.board)).toBe(before + 1);
        }
      });
    }
  }

  test("H-03: the board tells a Viewer and an Editor their own role", async () => {
    for (const persona of ["viewer", "editor"] as const) {
      const { body } = await api.get(`/api/boards/${cast.b.board}`, { as: cast.person[persona] });

      expect((body as { role?: string }).role, persona).toBe(persona);
    }
  });

  test("H-03: on a closed board, a Viewer and an Editor may still read, and neither may write", async () => {
    await db.client.query("update board set closed_at = now() where id = $1", [cast.b.board]);

    for (const persona of ["viewer", "editor"] as const) {
      for (const action of ACTIONS) {
        const { status, body } = await action.run(cast, cast.person[persona], persona);
        if (!action.write) expect(status, `${persona}: ${action.name}`).toBe(200);
        // A closed board is said before whose item it is: only a role too low is told so instead.
        else expect(body.reason, `${persona}: ${action.name}`).toBe(RANK[persona] >= RANK[action.least] ? "board_closed" : "not_allowed");
      }
    }
  });
});

describe("a link that gives Viewer", () => {
  let b: SeededBoard;
  let visitor: string;
  beforeEach(async () => {
    b = await seedBoard(db.client, ids);
    visitor = await addAccount(db.client, ids, "lee", { confirmed: true });
  });

  test("H-02, H-03: the owner may set the link role to Viewer", async () => {
    const { status } = await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "link", linkRole: "viewer" } });

    expect(status).toBe(200);
    expect((await db.client.query("select link_role from board where id = $1", [b.board])).rows[0].link_role).toBe("viewer");
  });

  test("H-02, H-03: someone who opens it then becomes a Viewer: they read, and can't vote", async () => {
    await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "link", linkRole: "viewer" } });

    expect((await api.get(`/api/boards/${b.board}`, { as: visitor })).status).toBe(200);
    expect(await members(b.board)).toContainEqual({ account_id: visitor, role: "viewer", joined_via: "link" });
    const vote = await api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: visitor, body: { value: 1 } });
    expect(vote.body.reason).toBe("not_allowed");
  });

  test("H-02, H-03: the link role can't be Editor or Owner", async () => {
    for (const linkRole of ["editor", "owner"]) {
      const { status } = await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "link", linkRole } });

      expect(status, linkRole).toBe(400);
    }
    expect((await db.client.query("select link_role from board where id = $1", [b.board])).rows[0].link_role).toBe("contributor");
  });
});
