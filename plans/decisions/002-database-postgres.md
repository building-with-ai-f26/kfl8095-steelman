# 002. One Postgres database: current-state tables plus a per-board change log

**Status:** accepted · **Date:** 2026-11-11 · **Details:** [architecture.md §2](../architecture.md#2-data-model)

## Context
Steelman's rules are relational and strict: one vote per person per target, assessments tied to the wording they judged, stable version IDs across combine and separate, an audit trail for moderation, and reversible structural changes. Readers also need "what changed since change N" for live updates.

## Options
| Option | For | Against |
|---|---|---|
| **Postgres: current-state tables + an append-only change log per board** | Constraints enforce the invariants. Ordinary SQL for reads. The log gives live updates, the audit trail, and undo in one place | Writes to one board take turns on its change counter (fine up to a few hundred writes a second per board) |
| Full event sourcing | Complete history by construction | Every read goes through replay and projections; too much machinery for one builder to explain and run |
| Snapshots per structural change | Simple undo | Undo would erase everything written since, which the PRD forbids |
| A document or realtime database (Firestore) | Built-in live listeners | Weak at the relational invariants; a second store to keep consistent |

## Decision
Managed Postgres (Cloud SQL). Normal tables hold each board's present state. Every write also appends a numbered row to that board's change log, in the same transaction. The log points to items by ID and records counts. It never copies what people wrote, and never names voters. Scores are cached on their rows in the same transaction; the shared order is derived and saved per tick.

## Why
One store and one query language, with the database itself guaranteeing the rules the product depends on. The change log is the smallest addition that serves live updates, auditing, and undo together.

## Revisit if
- One board needs more writes per second than its counter allows (batch votes first).
- Reads for very large public boards outgrow one instance (add a read replica before anything else).
