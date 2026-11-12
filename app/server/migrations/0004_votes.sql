-- The three kinds of judgment. The vote tables are the truth; the counts on
-- argument and version are caches of them.
--
-- Invariant 1 (plans/architecture.md §2): one judgment per person per
-- target. Each table's primary key is (target, person), so a second vote can
-- only replace the first. Changing a vote is an update; withdrawing it
-- deletes the row.
--
-- That shape is also what makes a vote safe to send twice (invariant 10):
-- "set my vote on this to +1" leaves one row however often it arrives.

-- How much an argument matters: +1 or -1.
create table importance_vote (
  argument_id text not null,
  account_id  text not null references account (id),
  board_id    text not null references board (id),
  value       smallint not null,
  voted_at    timestamptz not null,
  primary key (argument_id, account_id),
  foreign key (board_id, argument_id) references argument (board_id, id)
);
create trigger importance_vote_change_number before insert or update or delete on importance_vote
  for each row execute function require_change_number();

-- How well a wording puts its argument: +1 or -1. It follows the wording
-- when it moves to another argument, because the wording's ID never changes.
create table articulation_vote (
  version_id text not null,
  account_id text not null references account (id),
  board_id   text not null references board (id),
  value      smallint not null,
  voted_at   timestamptz not null,
  primary key (version_id, account_id),
  foreign key (board_id, version_id) references version (board_id, id)
);
create trigger articulation_vote_change_number before insert or update or delete on articulation_vote
  for each row execute function require_change_number();

-- Does the cited evidence support the wording, as worded? Keyed to the
-- revision that was judged (invariant 2): when the wording or its sources
-- change, old assessments stay as history but stop counting. Refusing an
-- assessment of an old revision (invariant 3) and a "yes" without evidence
-- (invariant 5) are the service's job.
create table assessment (
  version_id  text not null,
  rev         integer not null,
  account_id  text not null references account (id),
  board_id    text not null references board (id),
  supported   boolean not null,
  assessed_at timestamptz not null,
  primary key (version_id, rev, account_id),
  foreign key (board_id, version_id, rev) references version_revision (board_id, version_id, rev)
);
create trigger assessment_change_number before insert or update or delete on assessment
  for each row execute function require_change_number();
