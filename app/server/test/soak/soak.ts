// The soak run (plans/architecture.md §8, layer 8): many scripted voters
// against a running service, over real HTTP, then a recount. The simulation
// (../simulation/) plays sequences one step at a time in one process; this
// runs them all at once, so writes really race for the board's lock and
// the order tick passes in real time.
//
// Each voter is also a reader: it opens the board, polls for changes as the
// browser does, and at the end catches up, presses Update, and must have
// exactly the board a fresh reader gets.

import type { AddressInfo } from "node:net";
import pg from "pg";
import { openView, pressUpdate, receive } from "@steelman/shared";
import type { BoardChanges, BoardSnapshot, QueuedAction, ReaderView } from "@steelman/shared";
import { createSeededIds } from "@steelman/shared/testing";
import { buildApp } from "../../src/app.ts";
import { createDatabase } from "../../src/db/database.ts";
import { DEMO_BOARD, seedDemoBoard } from "../../src/demo-board.ts";
import { systemClock, systemIds } from "../../src/system.ts";

export interface SoakOptions {
  /** A migrated, empty database. */
  databaseUrl: string;
  voters: number;
  /** Stop at a time (the nightly run), or after a number of actions each (the quick run in `npm run check`). */
  stop: { seconds: number } | { actionsPerVoter: number };
  /** Each voter waits a random time in this range between actions. */
  pauseMs: [number, number];
  /** Picks the actions; the timing still varies from run to run. */
  seed: number;
  log?(line: string): void;
}

export interface SoakResult {
  requests: number;
  writes: number;
  /** Writes the service refused as stale, by reason: expected, since voters race each other. */
  refused: Record<string, number>;
  /** Anything that shouldn't happen: a 5xx, a failed request, an answer the client couldn't read. */
  errors: string[];
  /** Rows whose stored counts differ from a recount of the votes. */
  drifted: string[];
  /** Voters whose board, after catching up and pressing Update, differs from a fresh reader's. */
  disagreeing: string[];
}

export async function soak(options: SoakOptions): Promise<SoakResult> {
  const log = options.log ?? (() => {});
  const db = createDatabase(options.databaseUrl);
  await seedDemoBoard(db, systemClock, systemIds);
  const voterIds = Array.from({ length: options.voters }, () => systemIds.itemId());
  await db
    .insertInto("account")
    .values(voterIds.map((id, index) => ({ id, username: `voter_${String(index + 1).padStart(2, "0")}`, created_at: systemClock.now() })))
    .execute();
  await db.destroy();

  const app = buildApp({ clock: systemClock, ids: systemIds, database: createDatabase(options.databaseUrl), mode: "test" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/boards/${DEMO_BOARD}`;
  const result: SoakResult = { requests: 0, writes: 0, refused: {}, errors: [], drifted: [], disagreeing: [] };
  const deadline = "seconds" in options.stop ? performance.now() + options.stop.seconds * 1000 : Number.POSITIVE_INFINITY;
  const actions = "actionsPerVoter" in options.stop ? options.stop.actionsPerVoter : Number.POSITIVE_INFINITY;
  const random = rng(options.seed);

  const call = async (person: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> => {
    result.requests++;
    try {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { "x-steelman-test-user": person, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = await response.json();
      if (response.status >= 500 || response.status === 400) result.errors.push(`${method} ${path}: ${response.status} ${JSON.stringify(json)}`);
      return { status: response.status, json };
    } catch (error) {
      result.errors.push(`${method} ${path}: ${String(error)}`);
      return { status: 0, json: null };
    }
  };

  const voter = async (person: string, index: number) => {
    const ids = createSeededIds(options.seed * 1000 + index);
    let view = openView((await call(person, "GET", "")).json as BoardSnapshot);
    const catchUp = async () => {
      const answer = await call(person, "GET", `/changes?after=${view.seq}`);
      if (answer.status === 200) view = receive(view, answer.json as BoardChanges);
    };

    for (let done = 0; done < actions && performance.now() < deadline; done++) {
      const action = pick(view, random, ids);
      if (action === null) await catchUp();
      else {
        const answer = await send(call, person, action);
        if (answer.status === 200) result.writes++;
        else if (answer.status === 409 || answer.status === 403) {
          const reason = (answer.json as { reason?: string }).reason ?? String(answer.status);
          result.refused[reason] = (result.refused[reason] ?? 0) + 1;
        }
        // The browser asks for changes after each write, and every ~3 s anyway.
        if (random() < 0.5) await catchUp();
      }
      const [low, high] = options.pauseMs;
      if (high > 0) await new Promise((resolve) => setTimeout(resolve, low + random() * (high - low)));
    }
    return { person, finish: async () => ({ view: await settle(person) }) };

    /** Catches up until a fresh reader sees nothing newer, presses Update, and compares. */
    async function settle(who: string): Promise<ReaderView> {
      for (let attempt = 0; attempt < 5; attempt++) {
        await catchUp();
        const fresh = (await call(who, "GET", "")).json as BoardSnapshot;
        if (fresh.board.seq !== view.seq) continue;
        const updated = pressUpdate(view);
        const freshView = openView(fresh);
        if (JSON.stringify(updated.shown) !== JSON.stringify(freshView.shown) || JSON.stringify(sorted(updated.rows)) !== JSON.stringify(sorted(freshView.rows))) {
          result.disagreeing.push(who);
        }
        return updated;
      }
      result.disagreeing.push(`${who} (never caught up)`);
      return view;
    }
  };

  log(`Soak: ${options.voters} voters, ${"seconds" in options.stop ? `${options.stop.seconds} s` : `${actions} actions each`}, seed ${options.seed}`);
  const finished = await Promise.all(voterIds.map((id, index) => voter(id, index)));
  // Everyone has stopped writing. Each voter catches up and compares with a fresh reader.
  for (const voterDone of finished) await voterDone.finish();
  await app.close();

  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    result.drifted = await recount(client);
  } finally {
    await client.end();
  }
  log(`Soak: ${result.requests} requests, ${result.writes} writes, refused ${JSON.stringify(result.refused)}, ${result.errors.length} errors, ${result.drifted.length} drifted, ${result.disagreeing.length} disagreeing`);
  return result;
}

/** Rows whose stored counts differ from a recount of the votes and of the current revision's assessments. */
export async function recount(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{ item: string }>(
    `select 'argument ' || a.id as item from argument a
     where a.importance <> (select coalesce(sum(value), 0) from importance_vote where argument_id = a.id)
        or a.importance_voters <> (select count(*) from importance_vote where argument_id = a.id)
     union all
     select 'version ' || v.id from version v
     where v.articulation <> (select coalesce(sum(value), 0) from articulation_vote where version_id = v.id)
        or v.articulation_voters <> (select count(*) from articulation_vote where version_id = v.id)
        or v.yes <> (select count(*) from assessment where version_id = v.id and rev = v.current_rev and supported)
        or v.no <> (select count(*) from assessment where version_id = v.id and rev = v.current_rev and not supported)`,
  );
  return rows.map((row) => row.item);
}

/** What a voter does next, chosen from what it can see; null means "ask for changes". */
function pick(view: ReaderView, random: () => number, ids: ReturnType<typeof createSeededIds>): QueuedAction | null {
  const options = Object.keys(view.shown.arguments);
  const argumentIds = Object.values(view.shown.arguments).flat().filter((id) => isLive(view, id));
  const versionIds = argumentIds.flatMap((id) => view.shown.versions[id] ?? []).filter((id) => view.rows.versions[id] && !view.rows.versions[id]!.deleted);
  const vote = (): 1 | -1 | null => [1, 1, -1, null][Math.floor(random() * 4)] as 1 | -1 | null;
  const one = <T>(list: T[]): T | undefined => list[Math.floor(random() * list.length)];
  const roll = random();

  if (roll < 0.15) return null;
  if (roll < 0.6 && argumentIds.length) return { kind: "importance", argumentId: one(argumentIds)!, value: vote() };
  if (roll < 0.85 && versionIds.length) return { kind: "articulation", versionId: one(versionIds)!, value: vote() };
  if (roll < 0.9 && versionIds.length) {
    const version = view.rows.versions[one(versionIds)!]!;
    return { kind: "assess", versionId: version.id, rev: version.rev, supported: random() < 0.5 };
  }
  if (roll < 0.95 && argumentIds.length) return { kind: "addWording", argumentId: one(argumentIds)!, id: ids.itemId(), wording: `Another wording ${ids.itemId().slice(0, 6)}.`, context: "" };
  if (options.length) return { kind: "addArgument", id: ids.itemId(), optionId: one(options)!, versionId: ids.itemId(), wording: `A new argument ${ids.itemId().slice(0, 6)}.`, context: "" };
  return null;
}

function isLive(view: ReaderView, argumentId: string): boolean {
  const argument = view.rows.arguments[argumentId];
  return argument !== undefined && !argument.deleted && argument.mergedInto === null;
}

function send(call: (person: string, method: string, path: string, body?: unknown) => Promise<{ status: number; json: unknown }>, person: string, action: QueuedAction) {
  switch (action.kind) {
    case "importance":
      return call(person, "PUT", `/arguments/${action.argumentId}/importance`, { value: action.value });
    case "articulation":
      return call(person, "PUT", `/versions/${action.versionId}/articulation`, { value: action.value });
    case "assess":
      return call(person, "PUT", `/versions/${action.versionId}/assessment`, { rev: action.rev, supported: action.supported });
    case "addArgument":
      return call(person, "POST", "/arguments", { id: action.id, optionId: action.optionId, versionId: action.versionId, wording: action.wording, context: action.context });
    case "addWording":
      return call(person, "POST", `/arguments/${action.argumentId}/versions`, { id: action.id, wording: action.wording, context: action.context });
    case "edit":
      return call(person, "PUT", `/versions/${action.versionId}`, { baseRev: action.baseRev, wording: action.wording, context: action.context });
    case "delete":
      return call(person, "DELETE", `/versions/${action.versionId}`);
  }
}

/** Rows with their keys in a fixed order, so two views compare by content. */
function sorted(rows: ReaderView["rows"]): unknown {
  return Object.fromEntries(Object.entries(rows).map(([kind, byId]) => [kind, Object.fromEntries(Object.entries(byId).sort(([a], [b]) => (a < b ? -1 : 1)))]));
}

/** mulberry32: a small seeded random number generator. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
