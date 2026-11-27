import { beforeEach, describe, expect, test } from "vitest";
import { createSeededIds } from "@steelman/shared/testing";
import { seedBoard } from "../support/board.ts";
import type { SeededBoard } from "../support/board.ts";
import { useTestDatabase } from "../support/database.ts";
import type { GoogleAccount } from "../support/fake-google.ts";
import { useSignIn } from "../support/sign-in.ts";

// Production moves from app.steelman-argument.com to the bare address in M3d-12
// (plans/build-plan.md M3d-12, plans/architecture.md Q13). The sign-in base URL,
// the trusted origin, and the Origin check on writes (§7 "Sign-in and sessions")
// all follow APP_ORIGIN, so no app code changes. This file starts the service
// with the origin set to https://steelman-argument.com, which is the value
// main.ts passes on from APP_ORIGIN. The test can't import main.ts itself,
// because main.ts reads the environment and starts listening when it loads.

const APEX = "https://steelman-argument.com";
const OLD = "https://app.steelman-argument.com";

const db = useTestDatabase({ migrated: true });
const api = useSignIn(db, { google: true, origin: APEX });
const ids = createSeededIds(1225);

let n = 0;
/** A new address for each test, so their codes and limits don't mix. */
const newAddress = () => `apex${++n}@school.example.edu`;
/** A new Google account for each test. */
const newGoogler = (): GoogleAccount => {
  n++;
  return { sub: `2093${String(n).padStart(17, "0")}`, email: `apex-googler${n}@school.example.edu`, emailVerified: true, name: `Pat Apex ${n}`, picture: `https://lh3.example/${n}.jpg` };
};

describe("production at steelman-argument.com", () => {
  let b: SeededBoard;
  beforeEach(async () => {
    b = await seedBoard(db.client, ids);
  });
  const vote = (cookie: string, origin: string) =>
    api.request("PUT", `/api/boards/${b.board}/arguments/${b.argument}/importance`, { cookie, body: { value: 1 }, origin });

  test("M-06, M-08: a write sent from steelman-argument.com itself is accepted", async () => {
    const cookie = await api.signedIn(newAddress(), "apex_writer");

    expect((await vote(cookie, APEX)).status).toBe(200);
  });

  test("M-06, M-08: a write sent from the old address, app.steelman-argument.com, is refused as another site's", async () => {
    const cookie = await api.signedIn(newAddress(), "old_host_writer");

    const refused = await vote(cookie, OLD);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ status: "refused", reason: "wrong_origin" });
  });

  test("M-06, M-08: Google sends people back to steelman-argument.com, not to the old address", async () => {
    const signIn = await api.signInWithGoogle(newGoogler(), { callbackURL: `${APEX}/b/some-board` });

    expect(signIn.started.status).toBe(200);
    expect(new URL(signIn.started.body.url as string).searchParams.get("redirect_uri")).toBe(`${APEX}/api/auth/callback/google`);
    expect(signIn.finished?.status).toBe(302);
    expect(signIn.finished?.location).toBe(`${APEX}/b/some-board`);
    expect(signIn.cookie).toBeDefined();
  });
});
