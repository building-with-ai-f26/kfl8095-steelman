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
--     its link can still say what happened to it (invariant 6).

-- A side of the question.
create table option (
  id          text primary key check (id ~ '^[A-Za-z0-9_-]{20}$'),
  board_id    text not null references board (id),
  name        text not null check (char_length(name) between 1 and 80),
  position    integer not null,
  created_at  timestamptz not null,
  deleted_at  timestamptz,
  changed_seq bigint not null,
  unique (board_id, id),
  unique (board_id, position)
);
create index option_changes on option (board_id, changed_seq);
create trigger option_stamp before insert or update on option
  for each row execute function require_stamp();

-- A reason within an option. It groups the wordings of one idea and carries
-- their importance.
create table argument (
  id                text primary key check (id ~ '^[A-Za-z0-9_-]{20}$'),
  board_id          text not null references board (id),
  option_id         text not null,
  created_by        text not null references account (id),
  created_at        timestamptz not null,
  created_seq       bigint not null,
  -- Set when this argument was combined into another: old links follow it.
  merged_into       text check (merged_into <> id),
  deleted_at        timestamptz,
  -- Cached from importance_vote in the same transaction as each vote:
  -- the sum of the votes, and how many people have one.
  importance        integer not null default 0,
  importance_voters integer not null default 0 check (importance_voters >= 0),
  changed_seq       bigint not null,
  unique (board_id, id),
  foreign key (board_id, option_id) references option (board_id, id),
  foreign key (board_id, merged_into) references argument (board_id, id),
  -- A sum of +1s and -1s can't be bigger than the number of votes, and is
  -- odd exactly when that number is.
  check (abs(importance) <= importance_voters and (importance_voters - importance) % 2 = 0)
);
create index argument_changes on argument (board_id, changed_seq);
create trigger argument_stamp before insert or update on argument
  for each row execute function require_stamp();
create trigger argument_created_seq before insert or update on argument
  for each row execute function created_seq_rules();

-- A piece of evidence, shared on the board. Several wordings can cite it.
create table source (
  id             text primary key check (id ~ '^[A-Za-z0-9_-]{20}$'),
  board_id       text not null references board (id),
  name           text not null check (char_length(name) between 1 and 120),
  locator        text not null check (char_length(locator) <= 200),
  finding        text not null check (char_length(finding) between 1 and 500),
  backs_up       text not null check (char_length(backs_up) <= 300),
  limits         text not null check (char_length(limits) <= 300),
  added_by       text not null references account (id),
  created_at     timestamptz not null,
  -- Set when someone reports they can't open it.
  unavailable_at timestamptz,
  unavailable_by text references account (id),
  changed_seq    bigint not null,
  unique (board_id, id),
  check ((unavailable_at is null) = (unavailable_by is null))
);
create index source_changes on source (board_id, changed_seq);
create trigger source_stamp before insert or update on source
  for each row execute function require_stamp();

-- One wording of an argument. Its ID never changes (invariant 4): combining
-- and separating move it by changing argument_id, and everything attached to
-- it stays attached.
create table version (
  id                  text primary key check (id ~ '^[A-Za-z0-9_-]{20}$'),
  board_id            text not null references board (id),
  argument_id         text not null,
  author_id           text not null references account (id),
  created_at          timestamptz not null,
  created_seq         bigint not null,
  -- Which of its revisions is the wording now. Starts at 1.
  current_rev         integer not null check (current_rev >= 1),
  -- Hidden by a moderator: the text is kept, so it can be reviewed and restored.
  hidden_at           timestamptz,
  hidden_by           text references account (id),
  hidden_reason       text check (char_length(hidden_reason) between 1 and 140),
  -- Deleted by its author: the text is erased (see the triggers below).
  deleted_at          timestamptz,
  -- Cached from the vote tables in the same transaction as each vote.
  articulation        integer not null default 0,
  articulation_voters integer not null default 0 check (articulation_voters >= 0),
  -- Assessments of the current revision only.
  yes                 integer not null default 0 check (yes >= 0),
  no                  integer not null default 0 check (no >= 0),
  changed_seq         bigint not null,
  unique (board_id, id),
  foreign key (board_id, argument_id) references argument (board_id, id),
  check (abs(articulation) <= articulation_voters and (articulation_voters - articulation) % 2 = 0),
  check ((hidden_at is null) = (hidden_by is null) and (hidden_at is null) = (hidden_reason is null))
);
create index version_changes on version (board_id, changed_seq);
create trigger version_stamp before insert or update on version
  for each row execute function require_stamp();
create trigger version_created_seq before insert or update on version
  for each row execute function created_seq_rules();

-- Every wording a version has had. Editing the wording or changing its
-- sources saves revision n + 1; credibility belongs to a revision, so it
-- starts over (invariant 2).
create table version_revision (
  version_id                 text not null,
  board_id                   text not null references board (id),
  rev                        integer not null check (rev >= 1),
  -- Null only once the wording has been deleted and its text erased.
  wording                    text check (char_length(wording) between 1 and 500),
  context                    text check (char_length(context) <= 700),
  why                        text not null check (why in ('created', 'edited', 'sources_changed', 'source_changed')),
  -- How many importance and articulation votes there were just before this
  -- revision replaced the last one, for the "edited" mark.
  importance_votes_before    integer check (importance_votes_before >= 0),
  articulation_votes_before  integer check (articulation_votes_before >= 0),
  created_by                 text not null references account (id),
  created_at                 timestamptz not null,
  primary key (version_id, rev),
  unique (board_id, version_id, rev),
  foreign key (board_id, version_id) references version (board_id, id),
  -- Erasing takes the wording and its context together.
  check ((wording is null) = (context is null))
);
create trigger version_revision_change_number before insert or update on version_revision
  for each row execute function require_change_number();

-- A version always points at a revision that exists. Checked when the
-- transaction ends, because a new version and its first revision are saved
-- together and each refers to the other.
alter table version add constraint version_current_revision_exists
  foreign key (id, current_rev) references version_revision (version_id, rev)
  deferrable initially deferred;

create function version_rules() returns trigger language plpgsql as $$
begin
  if new.current_rev <> old.current_rev then
    if new.current_rev <> old.current_rev + 1 then
      raise exception 'A wording''s revisions go up one at a time (% to %)', old.current_rev, new.current_rev
        using errcode = 'check_violation';
    end if;
    -- Invariant 2: only assessments of the current revision count.
    if new.yes <> 0 or new.no <> 0 then
      raise exception 'A new revision''s yes and no counts start over at zero' using errcode = 'check_violation';
    end if;
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'A deleted wording can''t be brought back: its text is gone' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger version_rules before update on version
  for each row execute function version_rules();

create function version_revision_rules() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (select deleted_at from version where id = new.version_id) is not null then
      raise exception 'A deleted wording can''t be given new text' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  -- A saved revision is a record of what people voted on and assessed. The
  -- only change allowed is erasing its text when its wording is deleted.
  if (new.version_id, new.board_id, new.rev, new.why, new.created_by, new.created_at)
       is distinct from (old.version_id, old.board_id, old.rev, old.why, old.created_by, old.created_at)
     or new.importance_votes_before is distinct from old.importance_votes_before
     or new.articulation_votes_before is distinct from old.articulation_votes_before
     or (new.wording is not null and new.wording is distinct from old.wording)
     or (new.context is not null and new.context is distinct from old.context) then
    raise exception 'A saved revision can''t be rewritten: save a new revision instead' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger version_revision_rules before insert or update on version_revision
  for each row execute function version_revision_rules();

-- Checked when the transaction ends, so the steps of one write can come in
-- any order.
create function revision_fits_its_version() returns trigger language plpgsql as $$
declare
  v record;
begin
  select current_rev, deleted_at into v from version where id = new.version_id;
  if new.rev > v.current_rev then
    raise exception 'Revision % was saved ahead of its wording, which is on revision %', new.rev, v.current_rev
      using errcode = 'check_violation';
  end if;
  -- Invariant 6: text is erased exactly when its wording is deleted.
  if new.wording is null and v.deleted_at is null then
    raise exception 'A revision''s text can be erased only when its wording is deleted' using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger revision_fits_its_version after insert or update on version_revision
  deferrable initially deferred for each row execute function revision_fits_its_version();

create function deleted_version_is_erased() returns trigger language plpgsql as $$
begin
  if exists (select 1 from version_revision where version_id = new.id and wording is not null) then
    raise exception 'A deleted wording must have the text of every revision erased in the same transaction'
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger deleted_version_is_erased after insert or update on version
  deferrable initially deferred for each row
  when (new.deleted_at is not null) execute function deleted_version_is_erased();

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
  arguments   jsonb not null check (jsonb_typeof(arguments) = 'object'),
  -- Argument ID to its wordings' IDs, best articulated first.
  versions    jsonb not null check (jsonb_typeof(versions) = 'object'),
  changed_seq bigint not null
);
create index published_order_changes on published_order (board_id, changed_seq);
create trigger published_order_stamp before insert or update on published_order
  for each row execute function require_stamp();
