-- Changing your username (L-04, M3d-15; plans/architecture.md §2, the
-- username_hold table): a changed username's old name, kept from everyone
-- else for 30 days, so links to it keep working and no one else takes it.
--
-- The unique index on account can't cover a name in another table, so the
-- service claims a name (by a change, or at first sign-in) only inside a
-- transaction that takes pg_advisory_xact_lock(hashtext(lower(name))) and
-- then checks both tables. This one makes an old name held by one account at
-- a time, whatever its capitals. A deleted account keeps its hold until it
-- ends: deletion never removes the account row, and the foreign key keeps it
-- that way.
--
-- The 30-day limit and taking a name back are the service's rules, not the
-- schema's, and there are no length or value checks (Q24). ends_at comes from
-- the service's clock, never the database's.
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).

create table username_hold (
  old_name    text not null,
  account_id  text not null references account (id),
  ends_at     timestamptz not null
);

create unique index username_hold_old_name_unique on username_hold (lower(old_name));
create index username_hold_account on username_hold (account_id);

-- The service adds a hold, reads them (claims, Download your data), and
-- deletes them (taking a name back, and the daily job). It never changes one.
grant select, insert, delete on username_hold to steelman_app;
