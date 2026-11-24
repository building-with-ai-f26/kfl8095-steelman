-- Closing a board at a set time (M3b-3, I-05; plans/architecture.md §2).
-- `closed_at` keeps meaning closed by hand; `closes_at` is the moment the
-- Owner chose. Nothing is written when that moment passes: the service asks
-- one rule (closedSince, shared/src/closing.ts) with its own clock.
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).
-- The service may already update `board` (migration 0006).

alter table board add column closes_at timestamptz;
