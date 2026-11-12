-- What a board holds: options, arguments, wordings (versions) and their
-- revisions, sources, and the saved shared order.
--
-- Three things are true of every table here (plans/architecture.md §2):
--   * It carries board_id, and its foreign keys include board_id, so a row
--     can only point at rows of its own board.
--   * Rows readers are sent carry changed_seq, the board's change number
--     when the row last changed, indexed with board_id. Live updates are
--     "the rows stamped after N".
--   * Nothing is ever removed. A deleted or hidden item keeps its row, so
--     its link can still say what happened to it (invariant 6; the grants
--     in the last migration hold the service to it).

-- A side of the question.
create table option (
  id          text primary key,
  board_id    text not null references board (id),
  name        text not null,
  position    integer not null,
  created_at  timestamptz not null,
  deleted_at  timestamptz,
  changed_seq bigint not null,
  unique (board_id, id)
);
create index option_changes on option (board_id, changed_seq);
create trigger option_stamp before insert or update on option
  for each row execute function require_stamp();

-- A reason within an option. It groups the wordings of one idea and carries
-- their importance.
create table argument (
  id                text primary key,
  board_id          text not null references board (id),
  option_id         text not null,
  created_by        text not null references account (id),
  created_at        timestamptz not null,
  -- The change number it was added at: "the order they were added".
  created_seq       bigint not null,
  -- Set when this argument was combined into another: old links follow it.
  merged_into       text,
  deleted_at        timestamptz,
  -- Cached from importance_vote in the same transaction as each vote:
  -- the sum of the votes, and how many people have one.
  importance        integer not null default 0,
  importance_voters integer not null default 0,
  changed_seq       bigint not null,
  unique (board_id, id),
  foreign key (board_id, option_id) references option (board_id, id),
  foreign key (board_id, merged_into) references argument (board_id, id)
);
create index argument_changes on argument (board_id, changed_seq);
create trigger argument_stamp before insert or update on argument
  for each row execute function require_stamp();

-- A piece of evidence, shared on the board. Several wordings can cite it.
create table source (
  id             text primary key,
  board_id       text not null references board (id),
  name           text not null,
  locator        text not null,
  finding        text not null,
  backs_up       text not null,
  limits         text not null,
  added_by       text not null references account (id),
  created_at     timestamptz not null,
  -- Set when someone reports they can't open it.
  unavailable_at timestamptz,
  unavailable_by text references account (id),
  changed_seq    bigint not null,
  unique (board_id, id));
create index source_changes on source (board_id, changed_seq);
create trigger source_stamp before insert or update on source
  for each row execute function require_stamp();

-- One wording of an argument. Its ID never changes (invariant 4): combining
-- and separating move it by changing argument_id, and everything attached to
-- it stays attached.
create table version (
  id                  text primary key,
  board_id            text not null references board (id),
  argument_id         text not null,
  author_id           text not null references account (id),
  created_at          timestamptz not null,
  created_seq         bigint not null,
  -- Which of its revisions is the wording now. Starts at 1.
  current_rev         integer not null,
  -- Hidden by a moderator: the text is kept, so it can be reviewed and restored.
  hidden_at           timestamptz,
  hidden_by           text references account (id),
  hidden_reason       text,
  -- Deleted by its author: the service erases the text.
  deleted_at          timestamptz,
  -- Cached from the vote tables in the same transaction as each vote.
  articulation        integer not null default 0,
  articulation_voters integer not null default 0,
  -- Assessments of the current revision only.
  yes                 integer not null default 0,
  no                  integer not null default 0,
  changed_seq         bigint not null,
  unique (board_id, id),
  foreign key (board_id, argument_id) references argument (board_id, id)
);
create index version_changes on version (board_id, changed_seq);
create trigger version_stamp before insert or update on version
  for each row execute function require_stamp();

-- Every wording a version has had. Editing the wording or changing its
-- sources saves revision n + 1; credibility belongs to a revision, so it
-- starts over (invariant 2).
create table version_revision (
  version_id                 text not null,
  board_id                   text not null references board (id),
  rev                        integer not null,
  -- Null once the wording has been deleted and its text erased.
  wording                    text,
  context                    text,
  -- created, edited, sources_changed, or source_changed.
  why                        text not null,
  -- How many importance and articulation votes there were just before this
  -- revision replaced the last one, for the "edited" mark.
  importance_votes_before    integer,
  articulation_votes_before  integer,
  created_by                 text not null references account (id),
  created_at                 timestamptz not null,
  primary key (version_id, rev),
  unique (board_id, version_id, rev),
  foreign key (board_id, version_id) references version (board_id, id));
create trigger version_revision_change_number before insert or update on version_revision
  for each row execute function require_change_number();

-- A version always points at a revision that exists. Checked when the
-- transaction ends, because a new version and its first revision are saved
-- together and each refers to the other.
alter table version add constraint version_current_revision_exists
  foreign key (id, current_rev) references version_revision (version_id, rev)
  deferrable initially deferred;

-- Which sources a revision cites. Rows are only ever added: changing a
-- wording's sources saves a new revision with its own list.
create table revision_source (
  version_id text not null,
  rev        integer not null,
  source_id  text not null,
  board_id   text not null references board (id),
  primary key (version_id, rev, source_id),
  foreign key (board_id, version_id, rev) references version_revision (board_id, version_id, rev),
  foreign key (board_id, source_id) references source (board_id, id)
);
create trigger revision_source_change_number before insert or update or delete on revision_source
  for each row execute function require_change_number();

-- The shared order (plans/architecture.md §3): saved because ties keep the
-- previous order, so it can't be worked out from the votes alone. One row
-- per board, replaced each time; only the newest is ever needed.
create table published_order (
  board_id    text primary key references board (id),
  computed_at timestamptz not null,
  -- Option ID to its arguments' IDs, most important first.
  arguments   jsonb not null,
  -- Argument ID to its wordings' IDs, best articulated first.
  versions    jsonb not null,
  changed_seq bigint not null
);
create index published_order_changes on published_order (board_id, changed_seq);
create trigger published_order_stamp before insert or update on published_order
  for each row execute function require_stamp();
