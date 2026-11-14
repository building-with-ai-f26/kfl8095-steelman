-- Who may open a board, and as what (H-02; plans/architecture.md §2 and §7).
--
-- A person's role on a board is their board_member row. Failing that, if the
-- board is open to anyone with the link and their email is confirmed, it is
-- the board's link role, and they are recorded as a member, by the link, the
-- first time they open it (Q7). Failing that, they have no access.
--
-- Roles and the two kinds of access are words the service checks, not
-- values the database lists, so M2's Viewer and Editor need no migration
-- (Q24). The words today: general_access is 'invited' or 'link'; a role is
-- 'voter', 'contributor', or 'owner'; joined_via is 'invite' (added by name:
-- the owner by creating the board, others by invitation later, H-01) or
-- 'link'. Turning link access off deletes the 'link' rows and keeps the rest.
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).

-- Existing boards start open only to the people named on them: the safe default.
alter table board
  add column general_access text not null default 'invited',
  add column link_role      text not null default 'contributor';

create table board_member (
  board_id   text not null references board (id),
  account_id text not null references account (id),
  role       text not null,
  joined_via text not null,
  joined_at  timestamptz not null,
  -- One role per person per board.
  primary key (board_id, account_id)
);

-- "Which boards is this person on?", for account deletion (M1-12).
create index board_member_account on board_member (account_id);

-- Every board made so far is owned by the person who made it.
insert into board_member (board_id, account_id, role, joined_via, joined_at)
  select id, created_by, 'owner', 'invite', created_at from board;

-- Membership isn't board content (invariant 6): a row really is removed when
-- someone loses access.
grant select, insert, update, delete on board_member to steelman_app;
