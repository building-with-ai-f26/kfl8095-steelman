-- Reports (J-01, M2-3; plans/architecture.md §2): someone who can read a
-- board flags a wording as spam, abusive, off-topic, or something else, with
-- a note. Editors and the owner see how many open reports a wording has and
-- why, never who made them.
--
-- One report per person per wording, like a vote (invariant 1): reporting
-- again replaces the reason, and withdrawing marks it withdrawn, so a report
-- made again later reuses the row. Reasons are words the service checks
-- (Q24). A moderator resolving reports (M2-4) sets resolved_at, resolved_by,
-- and resolved_how.
--
-- A report isn't board content and isn't in the change log: like a vote, the
-- report table is the only place that links a person to it. It is deleted
-- with the reporter's account (architecture §2, the deletion table).
--
-- Keyed by wording and reporter, like a vote, rather than the id and
-- target architecture §2 sketches: reports on comments (T3) will get their
-- own table or column then.
--
-- Additive, so the code already running keeps working (AGENTS.md rule 7).

create table report (
  board_id     text not null references board (id),
  version_id   text not null,
  reporter_id  text not null references account (id),
  reason       text not null,
  note         text not null,
  reported_at  timestamptz not null,
  withdrawn_at timestamptz,
  resolved_at  timestamptz,
  resolved_by  text references account (id),
  resolved_how text,
  -- The board's change number when it was last reported, withdrawn, or
  -- resolved. Only an Editor's or the owner's request for changes reads it,
  -- so a report doesn't show itself to anyone else by stamping its wording.
  changed_seq  bigint not null,
  primary key (version_id, reporter_id),
  foreign key (board_id, version_id) references version (board_id, id)
);

-- "Whose reports are these?", for Download your data and account deletion.
create index report_reporter on report (reporter_id);
-- "Which reports changed since change N?", for a moderator's poll.
create index report_changes on report (board_id, changed_seq);

grant select, insert, update on report to steelman_app;

-- Account deletion: a reporter's reports go with them; a moderator's
-- resolutions are credited to the deleted-account stand-in.
grant select, delete on report to steelman_account_deletion;
grant update (resolved_by) on report to steelman_account_deletion;
