import { afterEach, expect, test, vi } from "vitest";
import { SPACE_ADMINS_POST } from "@steelman/shared";
import type { SpaceSummary } from "@steelman/shared";
import { createBoard } from "../src/api.ts";
import { spacesToPostIn } from "../src/spaces.ts";

// Who puts a board in a public space, on screen (G-05, H-02, M3d-34). New
// steelman's Space menu lists a public space only for its Admins and its
// Owner, as GitHub leaves an organization out of a member's Owner menu when
// only its owners create repositories (from memory). A Member who gets as
// far as sending one anyway, because they were made a Member after the
// sheet opened, reads why, in a full sentence (AGENTS.md rule 13), as Slack
// says in a channel where only admins post.

const space = (id: string, visibility: string, role: SpaceSummary["role"]): SpaceSummary =>
  ({ id, name: `Space ${id}`, about: "", canvas: "stone", visibility, role, members: 3 }) as SpaceSummary;

afterEach(() => {
  vi.unstubAllGlobals();
});

test("G-05, H-02: the Space menu lists every private space, and a public one only for its Admins and Owner", () => {
  const mine = [space("a", "private", "member"), space("b", "public", "member"), space("c", "public", "admin"), space("d", "public", "owner"), space("e", "private", "admin")];
  expect(spacesToPostIn(mine).map((each) => each.id)).toEqual(["a", "c", "d", "e"]);
});

test("G-05, H-02: a visibility the browser doesn't know is listed only for Admins and the Owner, as the service treats it", () => {
  expect(spacesToPostIn([space("a", "community", "member"), space("b", "community", "admin")]).map((each) => each.id)).toEqual(["b"]);
});

test("G-05, H-02: a Member refused a board in a public space is told why, in a full sentence", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "refused", reason: "space_admins_post" }), { status: 403, headers: { "content-type": "application/json" } })));

  const answer = await createBoard({ question: "Should Pod 6 meet on Fridays?", options: ["Fridays", "Mondays"], space: "s".repeat(20), access: { general: "space", linkRole: "voter" } });

  expect(answer).toEqual({ problem: SPACE_ADMINS_POST });
  expect(SPACE_ADMINS_POST).toBe("Only the space’s admins can add steelmen to a public space.");
  expect(SPACE_ADMINS_POST).toMatch(/^[A-Z][^.]* [a-z]+[^.]*\.$/);
});

test("G-05: someone taken out of the space is still told that, and not the public-space sentence", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "refused", reason: "no_space" }), { status: 409, headers: { "content-type": "application/json" } })));

  const answer = await createBoard({ question: "Should Pod 6 meet on Fridays?", options: ["Fridays", "Mondays"], space: "s".repeat(20) });

  expect(answer).toEqual({ problem: "You aren’t in that space any more. Choose another space, or none." });
});
