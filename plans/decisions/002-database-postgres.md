# 002. One Postgres database: current-state tables with stamped rows, plus a change log for structure

**Status:** accepted Nov 11; revised the same day by an independent review (votes are no longer logged), pending the builder's approval · **Date:** 2026-11-11 · **Details:** [architecture.md §2](../architecture.md#2-data-model)

## Context
Steelman's rules are relational and strict: one vote per person per target, assessments tied to the wording they judged, stable version IDs across combine and separate, an audit trail for moderation, and reversible structural changes. Readers also need "what changed since change N" for live updates.

## Options
| Option | For | Against |
|---|---|---|
| **Postgres: current-state tables whose rows are stamped with a per-board change number, plus an append-only change log for structural and moderation actions** | Constraints enforce the invariants. Ordinary SQL for reads. "What changed since N" is the rows stamped after N: at most one per item, however many votes there were. The log is small and holds only what an audit trail and undo need | Writes to one board take turns on its change counter (fine up to a few hundred writes a second per board) |
| The same, but logging every write, votes included, and replaying the log for live updates (the first draft) | One mechanism for live updates, audit, and undo | The log grows with every vote and needs pruning under a second database role. Catch-up cost grows with the number of votes. The browser must replay events exactly or its counts drift. Vote rows need care to keep voters' names out |
| Full event sourcing | Complete history by construction | Every read goes through replay and projections; too much machinery for one builder to explain and run |
| Snapshots per structural change | Simple undo | Undo would erase everything written since, which the PRD forbids |
| A document or realtime database (Firestore) | Built-in live listeners | Weak at the relational invariants; a second store to keep consistent |

## Decision
Managed Postgres (Cloud SQL). Normal tables hold each board's present state. Every write takes the board's next change number and stamps it on the rows it touched, in one transaction; taking the number locks the board's counter, so writes to a board commit in number order. Structural and moderation actions also append a row to the board's change log, which points to items by ID and never copies what people wrote. Votes and assessments are not logged: the vote tables are their record. Scores are cached on their rows in the same transaction; the shared order is derived and saved per tick, newest only.

Every write is safe to send twice by its shape: votes set a value, new items arrive with IDs the browser made, edits name the revision they started from. There is no table of requests already seen.

## Why
One store and one query language, with the database itself guaranteeing the rules the product depends on. Stamped rows work for live updates because nothing on a board is ever removed from its table (deleted, hidden, and combined items keep their rows), so the current state of a row always tells a reader what happened to it. That leaves the log to do only what a log is needed for.

## Revisit if
- One board needs more writes per second than its counter allows (batch votes first).
- Reads for very large public boards outgrow one instance (add a read replica before anything else).
- A feature needs the full history of counts over time (then record it for that feature, e.g. a daily tally, rather than logging every vote).
