-- Removal from a space sticks (G-04, G-07, M3d-35; plans/architecture.md §2,
-- the space_block table and the deletion table; finding F3 of the
-- public-spaces security review).
--
-- When an Admin or the Owner removes someone from a space, the service keeps
-- a block, so M3d-20's Join and Find spaces can keep that person out until an
-- Admin or the Owner invites them back. Leaving keeps no block. The invite
-- lifts the block by deleting its row, and the space's change log records the
-- lift.
--
-- What the database holds true: a block names a real space, a real account,
-- and the real account that removed them, once per person per space, and says
-- when. Times come from the service's clock, never the database's.
--
-- Q24 allows the table, because it holds only keys, foreign keys, and a time.
-- Who may remove someone, and that Leave writes no block, are the service's
-- rules, kept under the space row's lock.
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7): it
-- never reads the table, so a removal made by it is simply not kept.

create table space_block (
  space_id    text not null references space (id),
  account_id  text not null references account (id),
  blocked_by  text not null references account (id),
  at          timestamptz not null,
  -- One block per person per space.
  primary key (space_id, account_id)
);

-- "Which spaces removed this person?", for Download your data, account
-- deletion, and M3d-20's Find spaces.
create index space_block_account on space_block (account_id);
-- "Which blocks did this person write?", for account deletion.
create index space_block_blocked_by on space_block (blocked_by);

-- The service writes a block and lifts it, and never changes one.
grant select, insert, delete on space_block to steelman_app;

-- Account deletion (architecture §2, the deletion table): a person's blocks
-- are deleted, and a block they wrote is credited to the stand-in. It reads
-- the table to find them, as 0016 lets it read space_member.
grant select on space_block to steelman_account_deletion;
grant delete, update (blocked_by) on space_block to steelman_account_deletion;
