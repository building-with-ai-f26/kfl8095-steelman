# 006. Unattended agent work, gated by automated tests

**Status:** accepted (proposed by an independent review; approved by the builder, except who merges, which is open as Q18) · **Date:** 2026-11-11 · **Details:** [architecture.md §8](../architecture.md#8-testing-and-unattended-work)

## Context
The builder isn't on this project full time or part time. Agents build it one backlog item at a time, mostly with nobody watching. The first draft relied on the builder reviewing every pull request, and several of its "done when" checks needed a person at a browser. Votes are the product, and the worst failures are silent (counts that disagree, a vote on the wrong wording), so "it looked fine" was never a good enough check anyway.

## Options
| Option | For | Against |
|---|---|---|
| **Automated gates strong enough to merge on, with a short stop-and-ask list** | Work continues without the builder. The checks are the same every time. The riskiest part gets a test far more thorough than a person clicking | Real work up front: a simulation, stand-ins for every outside service, guard checks |
| The builder reviews every pull request | The most human judgment per change | The builder's time is the scarcest thing. Agents would sit idle, or pile changes on unreviewed ones |
| Agents merge freely; test by hand at milestones | Fastest to start | Bugs in vote counts would surface weeks late, mixed together, in front of classmates |

## Decision
1. **One command** (`npm run check`) runs every pre-merge check with no accounts, no network, and no real waiting: it starts its own Postgres 17, uses stand-ins for email, Google, PostHog, and the clock, and aims to finish in under five minutes.
2. **Layers:** types and lint; unit tests on the pure rules; one database test per invariant; API tests (role matrix, stale-write table, every write sent twice); a **seeded random simulation** of many readers that checks counts and that all readers converge; browser tests of the recorded scenarios with an accessibility scan and screenshot comparison. After merge, a smoke test on staging. Nightly: a soak run, mutation testing, a dependency audit; monthly, a restore test.
3. **Guards against weakened tests:** acceptance tests are written and seen failing first; edits to existing tests, screenshots, the policy table, merged migrations, CI workflows, and `plans/` need the builder; no retries or skips; nightly mutation testing; a second agent reviews each pull request.
4. **The backlog in `plans/build-plan.md` is the approved plan.** An agent takes the next item, builds it, and moves on. A fixed list of situations makes it stop and ask instead.
5. **Who merges** is the builder's choice (Q18). Recommended after M0: a pull request merges itself when every gate is green and nothing protected is touched. Production releases always need the builder.

## Why
It moves the builder's attention from every change to the few that need judgment, and it tests the riskiest problem harder than review could. The simulation works because the design is checkable: counts can be recounted, and any reader who catches up must match a fresh one.

## Revisit if
- `npm run check` passes while a real bug reaches staging more than once: find which layer should have caught it and strengthen that layer first.
- The suite grows past about ten minutes (split it; keep the fast part for every change).
- A second human joins (then per-pull-request previews and human review may earn their place back).
