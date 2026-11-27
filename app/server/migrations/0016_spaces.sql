-- Spaces (G-03, G-04, M3d-17; plans/architecture.md §2, the space and
-- space_member tables): a group of people, such as a class pod, with its own
-- three roles. Anyone signed in may make one and becomes its one Owner (the
-- builder, Nov 24). Boards join spaces in M3d-18, which adds board.space_id;
-- this migration doesn't.
--
-- What the database holds true: a space names the account that made it; a
-- membership names a real space and a real account, once per person per
-- space; a space change row names its space and who made it, and holds IDs
-- and short keywords only (invariant 7, by the change log's own check).
--
-- The role words (owner, admin, member), the canvases, the visibilities
-- (private, and public from M3d-20), the 40- and 120-character limits, and
-- "exactly one owner" are the service's rules, kept under the space row's
-- lock, not the schema's (Q24). Times come from the service's clock, never
-- the database's.
--
-- space_change is a third table the row doesn't name: the board change log
-- needs a board and its change number, which a space has neither of, so a
-- space's changes get a log of their own, built the same way.
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).

create table space (
  id          text primary key,
  name        text not null,
  about       text not null,
  canvas      text not null,
  visibility  text not null,
  created_by  text not null references account (id),
  created_at  timestamptz not null,
  -- Set when it was deleted with its Owner's account, no one else in it. Its name and about text are erased.
  deleted_at  timestamptz
);

create table space_member (
  space_id    text not null references space (id),
  account_id  text not null references account (id),
  role        text not null,
  joined_at   timestamptz not null,
  -- One role per person per space.
  primary key (space_id, account_id)
);

-- "Which spaces is this person in?", for your spaces and for account deletion.
create index space_member_account on space_member (account_id);

-- One row per change to a space or its members, in the order made. It never
-- copies what people wrote: a rename records only that the space changed.
create table space_change (
  id        bigint generated always as identity primary key,
  space_id  text not null references space (id),
  at        timestamptz not null,
  actor_id  text not null references account (id),
  -- What happened, for example "space_edited" or "member_removed".
  kind      text not null,
  before    jsonb not null default '{}' check (holds_only_references(before)),
  after     jsonb not null default '{}' check (holds_only_references(after))
);

create index space_change_space on space_change (space_id, id);

-- The service makes and changes spaces, and never removes one, so a deleted
-- space keeps its row as a deleted board does. Membership isn't content
-- (as board_member, 0008): a row really is removed when someone leaves or is
-- removed. The space change log only grows (invariant 8).
grant select, insert, update on space to steelman_app;
grant select, insert, update, delete on space_member to steelman_app;
grant select, insert on space_change to steelman_app;

-- Account deletion (architecture §2, the deletion table): a space its Owner
-- leaves passes to the longest-standing Admin, else Member; with no one else
-- in it, it is deleted, its text erased. What they made is credited to the
-- stand-in, their memberships end, and their ID is scrubbed from the log.
grant select on space, space_member, space_change to steelman_account_deletion;
grant update (created_by, name, about, deleted_at) on space to steelman_account_deletion;
grant delete, update (role) on space_member to steelman_account_deletion;
grant update (actor_id, before, after) on space_change to steelman_account_deletion;
