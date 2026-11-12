-- Boards, and the change number every write to a board must take.
--
-- Invariant 9 (plans/architecture.md §2): every write takes the board's next
-- change number and stamps the rows it touched, in one transaction. Taking
-- the number locks the board's row until the transaction ends, so writes to
-- one board commit in number order. That is what makes "everything stamped
-- after N" safe to ask: a reader who has seen change N can never later be
-- handed a change numbered N or lower.

create table board (
  -- Unguessable: for "anyone with the link" boards, the link is the permission.
  id           text primary key,
  question     text not null,
  created_by   text not null references account (id),
  created_at   timestamptz not null,
  closed_at    timestamptz,
  -- How long a shared order stands before votes may produce a new one.
  tick_seconds integer not null default 60,
  -- The board's change number: how many writes it has had.
  last_seq     bigint not null default 0
);

-- The counter only ever moves up by one, through take_change_number().
create function board_counter_rules() returns trigger language plpgsql as $$
begin
  if new.last_seq <> old.last_seq and new.last_seq <> old.last_seq + 1 then
    raise exception 'A board''s change number only goes up, one at a time (% to %)', old.last_seq, new.last_seq
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger board_counter_rules before update on board
  for each row execute function board_counter_rules();

-- Takes the board's next change number for the current transaction, and
-- remembers it until the transaction ends so the triggers below can check
-- that rows were stamped with it. The update is also the lock that makes
-- writes to one board take turns.
create function take_change_number(for_board text) returns bigint language plpgsql as $$
declare
  seq   bigint;
  taken jsonb := coalesce(nullif(current_setting('steelman.change_numbers', true), ''), '{}')::jsonb;
begin
  update board set last_seq = last_seq + 1 where id = for_board returning last_seq into seq;
  if seq is null then
    raise exception 'No such board: %', for_board using errcode = 'foreign_key_violation';
  end if;
  -- "true" keeps the setting for this transaction only.
  perform set_config('steelman.change_numbers', (taken || jsonb_build_object(for_board, seq))::text, true);
  return seq;
end $$;

-- The number this transaction took for the board, or null if it took none.
create function taken_change_number(for_board text) returns bigint language sql stable as $$
  select (nullif(current_setting('steelman.change_numbers', true), '')::jsonb ->> for_board)::bigint
$$;

-- For tables whose rows readers are sent (they carry changed_seq): a row may
-- be added or changed only by a transaction that took the board's next
-- change number, and must be stamped with exactly that number.
create function require_stamp() returns trigger language plpgsql as $$
declare
  taken bigint := taken_change_number(new.board_id);
begin
  if tg_op = 'UPDATE' and new.board_id <> old.board_id then
    raise exception 'A row of "%" can''t move to another board', tg_table_name using errcode = 'check_violation';
  end if;
  if taken is null then
    raise exception 'A write to "%" must first take board %''s next change number', tg_table_name, new.board_id
      using errcode = 'check_violation', hint = 'Call take_change_number(board) in the same transaction.';
  end if;
  if new.changed_seq is distinct from taken then
    raise exception 'A row of "%" written now must be stamped with change number %, not %', tg_table_name, taken, new.changed_seq
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- For tables whose rows aren't sent to readers themselves but change what
-- readers see (votes, revisions, citations): the write must still have taken
-- the board's next change number, so the row it affects gets restamped.
create function require_change_number() returns trigger language plpgsql as $$
declare
  board text;
begin
  if tg_op = 'DELETE' then board := old.board_id; else board := new.board_id; end if;
  if tg_op = 'UPDATE' and new.board_id <> old.board_id then
    raise exception 'A row of "%" can''t move to another board', tg_table_name using errcode = 'check_violation';
  end if;
  if taken_change_number(board) is null then
    raise exception 'A write to "%" must first take board %''s next change number', tg_table_name, board
      using errcode = 'check_violation', hint = 'Call take_change_number(board) in the same transaction.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
