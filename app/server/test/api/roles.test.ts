import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount, addArgument, addMember, seedBoard, write } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { useSignIn } from "../support/sign-in.ts";

// Roles and link sharing (M1-5; plans/architecture.md §7).
//
// M1's roles are Owner, Contributor, and Voter: a Voter votes and assesses, a
// Contributor also writes, and only the Owner changes who can get in. A
// person's role is their board_member row; failing that, the board's link
// role if it's open to anyone with the link and their email is confirmed;
// failing that, they have no access. Viewer and Editor come in M2.

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(501);

const boardSeq = async (board: string) => Number((await db.client.query("select last_seq from board where id = $1", [board])).rows[0].last_seq);
const members = async (board: string) =>
  (await db.client.query("select account_id, role, joined_via from board_member where board_id = $1 order by account_id", [board])).rows;
const setAccess = (board: string, general: "invited" | "link", linkRole: "voter" | "contributor" = "contributor") =>
  db.client.query("update board set general_access = $2, link_role = $3 where id = $1", [board, general, linkRole]);

// ---------------------------------------------------------------------------
// The matrix: one test per action × role.

const PERSONAS = ["owner", "contributor", "voter", "signed out", "non-member"] as const;
type Persona = (typeof PERSONAS)[number];

interface Cast {
  b: SeededBoard;
  /** Who each persona is; signed out is nobody. */
  person: Record<Persona, string | undefined>;
  /** A wording each persona wrote, for the actions only an author may take. Signed out wrote none. */
  own: Record<Persona, string | undefined>;
}

/** An invited-only board with one of each persona. The non-member once wrote on it, so their own wording exists. */
async function castBoard(): Promise<Cast> {
  const b = await seedBoard(db.client, ids);
  await setAccess(b.board, "invited");
  const voter = await addAccount(db.client, ids, "vic", { confirmed: true });
  await addMember(db.client, b.board, voter, "voter");
  const stranger = await addAccount(db.client, ids, "sam", { confirmed: true });
  const person: Cast["person"] = { owner: b.ana, contributor: b.ben, voter, "signed out": undefined, "non-member": stranger };
  const own = { "signed out": undefined } as Cast["own"];
  await write(db.client, b.board, async (seq) => {
    for (const persona of ["owner", "contributor", "voter", "non-member"] as const) {
      own[persona] = (await addArgument(db.client, ids, { board: b.board, option: b.no, author: person[persona]!, seq, wording: `Written by the ${persona}.` })).version;
    }
  });
  return { b, person, own };
}

type Do = (cast: Cast, as: string | undefined, persona: Persona) => Promise<{ status: number; body: { reason?: string } }>;

/** Each action, and the least role that may take it. */
const ACTIONS: { name: string; least: "voter" | "contributor" | "owner"; write: boolean; run: Do }[] = [
  { name: "read the board", least: "voter", write: false, run: ({ b }, as) => api.get(`/api/boards/${b.board}`, { as }) },
  { name: "read its changes", least: "voter", write: false, run: ({ b }, as) => api.get(`/api/boards/${b.board}/changes?after=0`, { as }) },
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
    name: "delete their own wording",
    least: "contributor",
    write: true,
    run: ({ b, own }, as, persona) => api.delete(`/api/boards/${b.board}/versions/${own[persona] ?? b.version}`, { as }),
  },
  {
    name: "change who can get in",
    least: "owner",
    write: true,
    run: ({ b }, as) => api.put(`/api/boards/${b.board}/access`, { as, body: { general: "link", linkRole: "voter" } }),
  },
];

const RANK = { voter: 1, contributor: 2, owner: 3 } as const;

/** What each persona should be answered. */
function expected(persona: Persona, least: keyof typeof RANK): { status: number; reason?: string } {
  if (persona === "signed out") return { status: 401, reason: "signed_out" };
  if (persona === "non-member") return { status: 403, reason: "no_access" };
  return RANK[persona] >= RANK[least] ? { status: 200 } : { status: 403, reason: "not_allowed" };
}

describe("the role matrix", () => {
  let cast: Cast;
  beforeEach(async () => {
    cast = await castBoard();
  });

  for (const action of ACTIONS) {
    for (const persona of PERSONAS) {
      const answer = expected(persona, action.least);
      const verdict = answer.status === 200 ? "may" : "may not";
      test(`H-02, H-03: ${persona === "signed out" ? "someone signed out" : persona === "owner" ? "an owner" : `a ${persona}`} ${verdict} ${action.name}`, async () => {
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

  test("H-03: a refused reader is sent nothing of the board", async () => {
    for (const persona of ["signed out", "non-member"] as const) {
      const { body } = await api.get(`/api/boards/${cast.b.board}`, { as: cast.person[persona] });

      expect(Object.keys(body).sort()).toEqual(["reason", "status"]);
    }
  });

  test("M-06: a board that doesn't exist is not found, whoever asks", async () => {
    for (const persona of PERSONAS) {
      expect((await api.get("/api/boards/nosuchboard1", { as: cast.person[persona] })).status).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Anyone with the link.

describe("a board open to anyone with the link", () => {
  let b: SeededBoard;
  let visitor: string;
  beforeEach(async () => {
    b = await seedBoard(db.client, ids);
    visitor = await addAccount(db.client, ids, "lee", { confirmed: true });
  });
  const addAs = (who: string) =>
    api.post(`/api/boards/${b.board}/arguments`, { as: who, body: { id: ids.itemId(), optionId: b.yes, versionId: ids.itemId(), wording: "Libraries are for everyone.", context: "" } });
  const voteAs = (who: string) => api.put(`/api/boards/${b.board}/arguments/${b.argument}/importance`, { as: who, body: { value: 1 } });

  test("H-02: someone signed in with a confirmed email who opens it becomes a member, by the link, with the link's role", async () => {
    expect((await api.get(`/api/boards/${b.board}`, { as: visitor })).status).toBe(200);

    expect(await members(b.board)).toContainEqual({ account_id: visitor, role: "contributor", joined_via: "link" });
  });

  test("H-02: opening it again doesn't add them twice", async () => {
    await api.get(`/api/boards/${b.board}`, { as: visitor });
    await api.get(`/api/boards/${b.board}`, { as: visitor });

    expect((await members(b.board)).filter((m: { account_id: string }) => m.account_id === visitor)).toHaveLength(1);
  });

  test("H-02: with the link role Contributor, they can write", async () => {
    expect((await addAs(visitor)).status).toBe(200);
  });

  test("H-02: with the link role Voter, they can vote but not write", async () => {
    await setAccess(b.board, "link", "voter");

    expect((await voteAs(visitor)).status).toBe(200);
    const refused = await addAs(visitor);
    expect(refused.status).toBe(403);
    expect(refused.body.reason).toBe("not_allowed");
  });

  test("H-02: the link needs a confirmed email: without one, there's no access and no membership", async () => {
    const unconfirmed = await addAccount(db.client, ids, "una");

    const read = await api.get(`/api/boards/${b.board}`, { as: unconfirmed });

    expect(read.status).toBe(403);
    expect(read.body.reason).toBe("no_access");
    expect((await voteAs(unconfirmed)).status).toBe(403);
    expect((await members(b.board)).map((m: { account_id: string }) => m.account_id)).not.toContain(unconfirmed);
  });

  test("H-02: a board open only to invited people lets no one else in, and records nothing", async () => {
    await setAccess(b.board, "invited");

    const read = await api.get(`/api/boards/${b.board}`, { as: visitor });

    expect(read.status).toBe(403);
    expect(read.body.reason).toBe("no_access");
    expect((await members(b.board)).map((m: { account_id: string }) => m.account_id)).not.toContain(visitor);
  });

  test("H-02: turning link access off removes the people who came by the link, and keeps the invited ones", async () => {
    await api.get(`/api/boards/${b.board}`, { as: visitor });

    const { status } = await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "invited", linkRole: "contributor" } });

    expect(status).toBe(200);
    expect(await members(b.board)).toEqual(
      [
        { account_id: b.ana, role: "owner", joined_via: "invite" },
        { account_id: b.ben, role: "contributor", joined_via: "invite" },
      ].sort((x, y) => x.account_id.localeCompare(y.account_id)),
    );
    expect((await api.get(`/api/boards/${b.board}`, { as: visitor })).body.reason).toBe("no_access");
    expect((await voteAs(b.ben)).status).toBe(200);
  });

  test("H-02: turning it back on doesn't bring them back until they open it again", async () => {
    await api.get(`/api/boards/${b.board}`, { as: visitor });
    await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "invited", linkRole: "contributor" } });

    await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "link", linkRole: "contributor" } });

    expect((await members(b.board)).map((m: { account_id: string }) => m.account_id)).not.toContain(visitor);
    expect((await api.get(`/api/boards/${b.board}`, { as: visitor })).status).toBe(200);
  });

  test("H-02: changing the link role changes it for everyone who came by the link, and for no one invited", async () => {
    await api.get(`/api/boards/${b.board}`, { as: visitor });

    await api.put(`/api/boards/${b.board}/access`, { as: b.ana, body: { general: "link", linkRole: "voter" } });

    expect(await members(b.board)).toContainEqual({ account_id: visitor, role: "voter", joined_via: "link" });
    expect(await members(b.board)).toContainEqual({ account_id: b.ben, role: "contributor", joined_via: "invite" });
    expect((await addAs(visitor)).body.reason).toBe("not_allowed");
    expect((await addAs(b.ben)).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// The sharing setting itself.

describe("changing who can get in", () => {
  let b: SeededBoard;
  beforeEach(async () => {
    b = await seedBoard(db.client, ids);
  });
  const share = (body: unknown, as = b.ana) => api.put(`/api/boards/${b.board}/access`, { as, body });
  const access = async () => (await db.client.query("select general_access, link_role from board where id = $1", [b.board])).rows[0];

  test("H-02: the owner's change is saved, takes a change number, and goes in the change log", async () => {
    const before = await boardSeq(b.board);

    const { status, body } = await share({ general: "link", linkRole: "voter" });

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", seq: before + 1 });
    expect(await access()).toEqual({ general_access: "link", link_role: "voter" });
    const log = await db.client.query("select actor_id, kind, subject_kind, subject_id, before, after from change where board_id = $1 and seq = $2", [b.board, body.seq]);
    expect(log.rows).toEqual([
      {
        actor_id: b.ana,
        kind: "access_changed",
        subject_kind: "board",
        subject_id: b.board,
        before: { general: "link", linkRole: "contributor" },
        after: { general: "link", linkRole: "voter" },
      },
    ]);
  });

  test("H-02: sent twice, it changes once, and the second answer is 'already done'", async () => {
    await share({ general: "invited", linkRole: "voter" });
    const seq = await boardSeq(b.board);

    expect((await share({ general: "invited", linkRole: "voter" })).body).toEqual({ status: "already_done" });
    expect(await boardSeq(b.board)).toBe(seq);
  });

  test("H-02: general access is invited people or anyone with the link, and the link role is Voter or Contributor", async () => {
    for (const body of [
      { general: "everyone", linkRole: "voter" },
      { general: "link", linkRole: "owner" },
      { general: "link", linkRole: "viewer" },
      { general: "link" },
      { general: "link", linkRole: "voter", extra: true },
    ]) {
      expect((await share(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await access()).toEqual({ general_access: "link", link_role: "contributor" });
  });

  test("H-02: the board says who can get in, and the reader's own role", async () => {
    const { body } = await api.get(`/api/boards/${b.board}`, { as: b.ben });

    expect(body.access).toEqual({ general: "link", linkRole: "contributor" });
    expect(body.role).toBe("contributor");
    expect((await api.get(`/api/boards/${b.board}`, { as: b.ana })).body.role).toBe("owner");
  });

  test("H-02: each poll for changes says them too, so a reader's role follows a change at once", async () => {
    const visitor = await addAccount(db.client, ids, "lee", { confirmed: true });
    const { body: opened } = await api.get(`/api/boards/${b.board}`, { as: visitor });
    await share({ general: "link", linkRole: "voter" });

    const { body } = await api.get(`/api/boards/${b.board}/changes?after=${opened.board.seq}`, { as: visitor });

    expect(body.access).toEqual({ general: "link", linkRole: "voter" });
    expect(body.role).toBe("voter");
  });
});

// ---------------------------------------------------------------------------
// Through real sign-in, not the test-user switch.

describe("signed in by email code", () => {
  const signIn = useSignIn(db, { seed: 502 });
  let b: SeededBoard;
  beforeEach(async () => {
    b = await seedBoard(db.client, ids);
  });

  test("H-02, L-01: signing in by code confirms the email, so the link lets them in", async () => {
    const cookie = await signIn.signedIn("link.visitor@example.test", "link_visitor");

    const { status } = await signIn.request("GET", `/api/boards/${b.board}`, { cookie });

    expect(status).toBe(200);
  });

  test("H-02, L-01: and an invited-only board doesn't", async () => {
    await setAccess(b.board, "invited");
    const cookie = await signIn.signedIn("not.invited@example.test", "not_invited");

    const { status, body } = await signIn.request("GET", `/api/boards/${b.board}`, { cookie });

    expect(status).toBe(403);
    expect(body.reason).toBe("no_access");
  });
});
