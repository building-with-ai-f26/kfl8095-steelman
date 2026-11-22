-- The tour (L-02, M2-9; plans/architecture.md §2, the account table): when
-- the account was first shown the tour of the three votes, so it opens on
-- their first board and never again, on any device. Null until then. Taking
-- it again from Your account doesn't change it.
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).

alter table account add column tour_seen_at timestamptz;
