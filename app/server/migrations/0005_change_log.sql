-- The change log: one row per structural or moderation action on a board,
-- in order. It answers "who did this, and why?" and, later, "how is it
-- undone?" (plans/architecture.md §2).
--
-- Invariant 7: it never copies what people wrote, and holds no votes. A row
-- points at things by ID. So erasing someone's text happens in one place,
-- and the only record of who voted how is the vote tables.
--
-- Invariant 8: it is append-only. The grants in the next migration let the
-- service add rows and nothing else.

-- True when every piece of text anywhere inside the JSON looks like an ID or
-- a short keyword: letters, digits, "-" and "_" only, at most 40 of them.
-- A sentence has spaces, so it can't pass.
create function holds_only_references(detail jsonb) returns boolean language sql immutable as $$
  select not exists (
    select 1
    from jsonb_path_query(detail, 'strict $.**') as value
    where jsonb_typeof(value) = 'string' and (value #>> '{}') !~ '^[A-Za-z0-9_-]{1,40}$'
  )
$$;

create table change (
  board_id     text not null references board (id),
  -- The change number of the write that made this row.
  seq          bigint not null,
  at           timestamptz not null,
  actor_id     text not null references account (id),
  -- Later features add their own kinds (hide, restore, combine, separate…).
  -- Votes and assessments are never among them.
  kind         text not null check (kind in (
                 'argument_added', 'version_added', 'version_edited',
                 'sources_changed', 'version_deleted', 'argument_deleted')),
  subject_kind text not null check (subject_kind in ('option', 'argument', 'version', 'source')),
  subject_id   text not null check (subject_id ~ '^[A-Za-z0-9_-]{20}$'),
  -- Only what is needed to show the change or undo it, by ID.
  before       jsonb not null default '{}' check (holds_only_references(before)),
  after        jsonb not null default '{}' check (holds_only_references(after)),
  -- A moderator's stated reason, where the action has one.
  reason       text check (char_length(reason) between 1 and 140),
  primary key (board_id, seq)
);

create function change_rules() returns trigger language plpgsql as $$
declare
  taken bigint := taken_change_number(new.board_id);
begin
  if taken is null then
    raise exception 'A write to "change" must first take board %''s next change number', new.board_id
      using errcode = 'check_violation', hint = 'Call take_change_number(board) in the same transaction.';
  end if;
  if new.seq <> taken then
    raise exception 'A change row written now must be numbered %, not %', taken, new.seq using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger change_rules before insert on change
  for each row execute function change_rules();
