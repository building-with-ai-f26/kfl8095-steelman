import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useApi } from "../support/api.ts";
import { useTestDatabase } from "../support/database.ts";

// Option names stay different from each other (A-07), as New steelman already
// asks when a board is made ("Each option needs a different name.",
// shared/src/api.ts): capitals don't count, and a deleted option's name is
// free again. Found by the M3a audit (Nov 22): adding and renaming didn't
// check, so a board could have two columns called "Yes".

const db = useTestDatabase({ migrated: true });
const api = useApi(db);
const ids = createSeededIds(977);

let b: SeededBoard;
beforeEach(async () => {
  b = await seedBoard(db.client, ids);
});

const add = (id: string, name: string) => api.post(`/api/boards/${b.board}/options`, { as: b.ana, body: { id, name } });
const rename = (id: string, name: string) => api.put(`/api/boards/${b.board}/options/${id}`, { as: b.ana, body: { name } });
const remove = (id: string) => api.delete(`/api/boards/${b.board}/options/${id}`, { as: b.ana });
const restore = (id: string) => api.put(`/api/boards/${b.board}/options/${id}/restore`, { as: b.ana });
const names = async () => ((await api.get(`/api/boards/${b.board}`, { as: b.ana })).body.options as { name: string; deleted: boolean }[]).filter((o) => !o.deleted).map((o) => o.name);

describe("option names stay different", () => {
  test("A-07: an option can't be added with a name another option has, whatever its capitals", async () => {
    expect((await add(ids.itemId(), "yes")).body).toMatchObject({ status: "refused", reason: "option_name_taken" });
    expect(await names()).toEqual(["Yes", "No"]);
  });

  test("A-07: an option can't be renamed to a name another option has, but its own capitals can change", async () => {
    expect((await rename(b.no, "YES")).body).toMatchObject({ status: "refused", reason: "option_name_taken" });
    expect((await rename(b.no, "NO")).body).toMatchObject({ status: "done" });
    expect(await names()).toEqual(["Yes", "NO"]);
  });

  test("A-07: a deleted option's name is free again, and then that option can't come back until one of them is renamed", async () => {
    const third = ids.itemId();
    await add(third, "Only in winter");
    await remove(third);
    const again = ids.itemId();
    expect((await add(again, "Only in winter")).body).toMatchObject({ status: "done" });

    expect((await restore(third)).body).toMatchObject({ status: "refused", reason: "option_name_taken" });
    await rename(again, "Only in summer");
    expect((await restore(third)).body).toMatchObject({ status: "done" });
    expect(await names()).toEqual(["Yes", "No", "Only in winter", "Only in summer"]);
  });
});
