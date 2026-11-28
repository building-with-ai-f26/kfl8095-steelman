-- Suspension (J-06, L-01, M3d-36; plans/architecture.md §2, the account table,
-- and §7, "Sign-in and sessions"; finding F8 of the public-spaces security
-- review): when the builder suspended the account with the operator job
-- (server/src/jobs/operator-cli.ts). Null when it isn't suspended. While it is
-- set, every route treats the account's sessions as signed out, and a code or
-- Google sign-in makes no session. Unsuspending sets it back to null.
--
-- No default: the time comes from the service's clock, never the database's.
-- No new grant: the service may already update the account table (0006).
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7): it
-- never reads the column.

alter table account add column suspended_at timestamptz;
