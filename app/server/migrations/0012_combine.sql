-- Combining arguments (M3a-6, A-10; plans/architecture.md §2, "How undo
-- works"): one row per person who had an importance vote on either of two
-- arguments when they were combined, saying what their votes were before and
-- what the combine left on the argument they went into. Undo puts each back,
-- unless the person has voted again since (their newer vote wins). A row
-- whose person disagreed with themself (+1 on one, -1 on the other) is how
-- the board asks them to vote again (PRD §5).
--
-- These are votes, so they live here and not in the change log, which never
-- holds one (invariant 7, migration 0005). Like votes, they go with the
-- person's account (architecture §2, the deletion table).
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).

create table combine_vote (
  board_id     text not null references board (id),
  -- The change number of the combine.
  seq          bigint not null,
  account_id   text not null references account (id),
  from_id      text not null,
  into_id      text not null,
  from_value   smallint,
  into_value   smallint,
  -- What the combine left on `into_id` for this person: null when it removed both votes.
  after_value  smallint,
  asked_again  boolean not null,
  primary key (board_id, seq, account_id),
  foreign key (board_id, from_id) references argument (board_id, id),
  foreign key (board_id, into_id) references argument (board_id, id)
);

-- "Am I asked to vote again on this argument?", for each reader's rows.
create index combine_vote_asked on combine_vote (into_id, account_id) where asked_again;
-- "Whose are these?", for account deletion.
create index combine_vote_account on combine_vote (account_id);

grant select, insert, delete on combine_vote to steelman_app;
grant update (asked_again) on combine_vote to steelman_app;
grant select, delete on combine_vote to steelman_account_deletion;
