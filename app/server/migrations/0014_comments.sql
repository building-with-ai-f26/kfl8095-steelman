-- Comments (D-01, M3b-8; plans/architecture.md §2): a note on the question,
-- an option, or a wording, threaded one level deep.
--
-- The target is an option, a version, or neither (the question), never both.
-- A version is the target by its ID, so its comments follow it through
-- combine and separate with no code (Q8). Like every board row, a comment
-- points only at rows of its own board (the foreign keys include board_id),
-- and each write is stamped with the board's change number.
--
-- Deleted by its author, a comment keeps its row and loses its body in the
-- same transaction (invariant 6), so a thread still reads. The three hidden
-- columns are a version's, for M3b-14. No length or value checks (Q24): the
-- service checks those.
--
-- Comments aren't in the change log (the prototype logs none).
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).

create table comment (
  id            text primary key,
  board_id      text not null references board (id),
  option_id     text,
  version_id    text,
  parent_id     text,
  author_id     text not null references account (id),
  -- Null once the comment has been deleted and its text erased.
  body          text,
  created_at    timestamptz not null,
  resolved_at   timestamptz,
  hidden_at     timestamptz,
  hidden_by     text references account (id),
  hidden_reason text,
  deleted_at    timestamptz,
  changed_seq   bigint not null,
  unique (board_id, id),
  foreign key (board_id, option_id) references option (board_id, id),
  foreign key (board_id, version_id) references version (board_id, id),
  foreign key (board_id, parent_id) references comment (board_id, id),
  -- One target or none: an invariant of the model, not a value rule.
  constraint comment_one_target check (option_id is null or version_id is null)
);

create trigger comment_stamp before insert or update on comment
  for each row execute function require_stamp();

-- "Which comments changed since change N?", for live updates (M3b-10).
create index comment_changes on comment (board_id, changed_seq);
-- "Whose comments are these?", for Download your data and account deletion.
create index comment_author on comment (author_id);

-- The service adds and changes comments, and never removes a row (invariant 6).
grant select, insert, update on comment to steelman_app;

-- Account deletion: the person's comments lose their text and author; on a
-- board deleted with its owner, every comment loses its text.
grant select on comment to steelman_account_deletion;
grant update (body, author_id, hidden_by, deleted_at, changed_seq) on comment to steelman_account_deletion;
