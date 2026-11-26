import { beforeAll, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { addAccount } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";
import { addSpace, addSpaceMember } from "../support/space.ts";

// New steelman's Space menu (G-05, F-01, M3d-19): a new board starts in a
// space its maker is in, in the same write that makes it, so it is never
// left outside its space or shared more widely than its maker chose. A space
// they aren't in, or one that was deleted, answers as no space does
// (no_space), as putting a board in a space does (sharing.ts), and nothing
// is made. Its change row names the space by its ID, never by its name
// (invariant 7).

const db = useTestDatabase({ migrated: true });
const api = useApi(db, { seed: 1920 });
const ids = createSeededIds(1921);

const QUESTION = "Should Pod 6 meet on Fridays?";
let mia: string;
let mel: string;
let sam: string;
let space: string;
beforeAll(async () => {
  mia = await addAccount(db.client, ids, "mia", { confirmed: true });
  mel = await addAccount(db.client, ids, "mel", { confirmed: true });
  sam = await addAccount(db.client, ids, "sam", { confirmed: true });
  space = await addSpace(db.client, ids, mia, { name: "POD 6", about: "Building with AI" });
  await addSpaceMember(db.client, space, mel, "member", "2026-11-16T12:02:00Z");
});

const create = (body: unknown, as = mia) => api.post("/api/boards", { as, body });
const boards = async () => Number((await db.client.query("select count(*) from board")).rows[0].count);

describe("a new board in a space", () => {
  test("G-05, F-01: starts in the space, shared with everyone in it, and a member finds it in their list at the role it gives", async () => {
    const { status, body } = await create({ question: QUESTION, options: ["Fridays", "Mondays"], space, access: { general: "space", linkRole: "voter" } });

    expect(status).toBe(200);
    expect(body).toEqual({ status: "done", board: expect.stringMatching(/^[A-Za-z0-9_-]{12}$/) });
    const opened = (await api.get(`/api/boards/${body.board}`, { as: mia })).body;
    expect(opened.access).toEqual({ general: "space", linkRole: "voter" });
    expect(opened.space).toEqual({ id: space, name: "POD 6" });
    const listed = ((await api.get("/api/boards", { as: mel })).body.boards as { id: string; role: string; space?: string }[]).find((each) => each.id === body.board);
    expect(listed).toMatchObject({ role: "voter", space });
    expect((await api.get(`/api/boards/${body.board}`, { as: mel })).body.role).toBe("voter");
    // Someone outside the space can't open it, and doesn't find it.
    expect((await api.get(`/api/boards/${body.board}`, { as: sam })).status).toBe(403);
  });

  test("G-05, F-01: a Member may start one in their space too, open only to invited people", async () => {
    const { body } = await create({ question: QUESTION, options: ["Fridays", "Mondays"], space, access: { general: "invited", linkRole: "contributor" } }, mel);

    const opened = (await api.get(`/api/boards/${body.board}`, { as: mel })).body;
    expect(opened).toMatchObject({ role: "owner", access: { general: "invited", linkRole: "contributor" }, space: { id: space, name: "POD 6" } });
    // Invited only: the space's other members don't find it.
    expect(((await api.get("/api/boards", { as: mia })).body.boards as { id: string }[]).map((each) => each.id)).not.toContain(body.board);
  });

  test("G-05, F-01: its change row names the space by its ID and holds no text", async () => {
    const { body } = await create({ question: QUESTION, options: ["Fridays", "Mondays"], space, access: { general: "space", linkRole: "voter" } });

    const log = await db.client.query("select kind, before, after from change where board_id = $1", [body.board]);
    expect(log.rows).toEqual([{ kind: "board_created", before: {}, after: { space } }]);
  });

  test("G-05, F-01: a space its maker isn't in answers as no space does, and makes nothing", async () => {
    const before = await boards();

    const { status, body } = await create({ question: QUESTION, options: ["Fridays", "Mondays"], space, access: { general: "space", linkRole: "voter" } }, sam);

    expect({ status, body }).toEqual({ status: 409, body: { status: "refused", reason: "no_space" } });
    expect(await boards()).toBe(before);
  });

  test("G-05, F-01: a space that doesn't exist, or was deleted, answers the same, and makes nothing", async () => {
    const gone = await addSpace(db.client, ids, mia, { name: "Old pod", about: "" });
    await db.client.query("update space set deleted_at = $2, name = '', about = '' where id = $1", [gone, "2026-11-16T13:00:00Z"]);
    const before = await boards();

    for (const missing of [gone, "n".repeat(20)]) {
      expect(await create({ question: QUESTION, options: ["Fridays", "Mondays"], space: missing }), missing).toEqual({ status: 409, body: { status: "refused", reason: "no_space" } });
    }
    expect(await boards()).toBe(before);
  });

  test("G-05, F-01: sharing with everyone in a space without naming one is still refused, and makes nothing", async () => {
    const before = await boards();

    expect((await create({ question: QUESTION, options: ["Fridays", "Mondays"], access: { general: "space", linkRole: "voter" } })).status).toBe(400);
    expect(await boards()).toBe(before);
  });
});
