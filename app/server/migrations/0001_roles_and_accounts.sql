-- The two database roles the service uses, and the people who use Steelman.
--
-- Roles (plans/architecture.md §2, invariant 8):
--   steelman_app               what the service runs as, day to day.
--   steelman_account_deletion  used only by the account-deletion job, the one
--                              thing allowed to alter the change log.
-- Neither can sign in. A deployment gives its own sign-in user membership of
-- a role; no password ever appears in a migration. What each role may do is
-- granted in the last migration, once the tables exist.
--
-- Roles belong to the whole database server, not one database, so they may
-- already be there (tests make many databases on one server).
do $$
begin
  create role steelman_app nologin;
exception when duplicate_object or unique_violation then
  null;
end $$;

do $$
begin
  create role steelman_account_deletion nologin;
exception when duplicate_object or unique_violation then
  null;
end $$;

-- A person. Sign-in (M1) adds email and the rest; M0 needs only someone to
-- attribute votes and wordings to.
--
-- No column here or anywhere else defaults to the database's clock: the
-- service supplies every time, so tests control it (architecture §8).
create table account (
  id         text primary key,
  username   text not null check (char_length(username) between 1 and 20),
  created_at timestamptz not null,
  deleted_at timestamptz
);

-- Unique whatever the capitals: "Morgan" and "morgan" are one name.
create unique index account_username_unique on account (lower(username));
