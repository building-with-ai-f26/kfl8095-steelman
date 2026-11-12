-- Seed data for the schema as it stood after migration 0006_grants.
--
-- The upgrade test (migrations.test.ts) builds a database up to that
-- migration, loads this file, then applies every later migration, so each
-- new migration is tried against a database that already holds rows.
--
-- This file is frozen: it must keep working against the schema of its day.
-- When later migrations need testing against newer shapes of data, add a new
-- seed file named after the newest migration instead of changing this one.

begin;
insert into account (id, username, created_at) values
  ('seedana0000000000000', 'ana', '2026-11-01T12:00:00Z'), ('seedben0000000000000', 'ben', '2026-11-01T12:00:00Z'), ('seedcy00000000000000', 'cy', '2026-11-01T12:00:00Z');
insert into board (id, question, created_by, created_at) values
  ('seedboard001', 'Should our library open on Sundays?', 'seedana0000000000000', '2026-11-01T12:00:00Z');

-- Change 1: the board's content.
select take_change_number('seedboard001');
insert into option (id, board_id, name, position, created_at, changed_seq) values
  ('seedyes0000000000000', 'seedboard001', 'Yes', 1, '2026-11-01T12:00:00Z', 1), ('seedno00000000000000', 'seedboard001', 'No', 2, '2026-11-01T12:00:00Z', 1);
insert into argument (id, board_id, option_id, created_by, created_at, created_seq, changed_seq) values
  ('seedarg1000000000000', 'seedboard001', 'seedyes0000000000000', 'seedana0000000000000', '2026-11-01T12:00:00Z', 1, 1), ('seedarg2000000000000', 'seedboard001', 'seedno00000000000000', 'seedben0000000000000', '2026-11-01T12:00:00Z', 1, 1);
insert into version (id, board_id, argument_id, author_id, created_at, created_seq, current_rev, changed_seq) values
  ('seedver1000000000000', 'seedboard001', 'seedarg1000000000000', 'seedana0000000000000', '2026-11-01T12:00:00Z', 1, 1, 1),
  ('seedver2000000000000', 'seedboard001', 'seedarg1000000000000', 'seedben0000000000000', '2026-11-01T12:00:00Z', 1, 1, 1),
  ('seedver3000000000000', 'seedboard001', 'seedarg2000000000000', 'seedben0000000000000', '2026-11-01T12:00:00Z', 1, 1, 1);
insert into version_revision (version_id, board_id, rev, wording, context, why, created_by, created_at) values
  ('seedver1000000000000', 'seedboard001', 1, 'Sunday is the only free day for many people.', '', 'created', 'seedana0000000000000', '2026-11-01T12:00:00Z'),
  ('seedver2000000000000', 'seedboard001', 1, 'Shift workers can only come on Sundays.', 'Narrower, and easier to check.', 'created', 'seedben0000000000000', '2026-11-01T12:00:00Z'),
  ('seedver3000000000000', 'seedboard001', 1, 'Staff need a guaranteed day off.', '', 'created', 'seedben0000000000000', '2026-11-01T12:00:00Z');
insert into source (id, board_id, name, locator, finding, backs_up, limits, added_by, created_at, changed_seq) values
  ('seedsrc1000000000000', 'seedboard001', 'City library survey, 2025', 'https://example.org/survey', 'Most weekday visitors can''t come on weekdays.', '', 'One city.', 'seedana0000000000000', '2026-11-01T12:00:00Z', 1);
insert into revision_source (version_id, rev, source_id, board_id) values ('seedver1000000000000', 1, 'seedsrc1000000000000', 'seedboard001');
insert into change (board_id, seq, at, actor_id, kind, subject_kind, subject_id, after) values
  ('seedboard001', 1, '2026-11-01T12:00:00Z', 'seedana0000000000000', 'argument_added', 'argument', 'seedarg1000000000000', '{"version": "seedver1000000000000"}');
commit;

-- Change 2: votes and an assessment, with the cached counts they produce.
begin;
select take_change_number('seedboard001');
insert into importance_vote (argument_id, account_id, board_id, value, voted_at) values
  ('seedarg1000000000000', 'seedana0000000000000', 'seedboard001', 1, '2026-11-01T12:00:00Z'), ('seedarg1000000000000', 'seedben0000000000000', 'seedboard001', 1, '2026-11-01T12:00:00Z'), ('seedarg2000000000000', 'seedcy00000000000000', 'seedboard001', -1, '2026-11-01T12:00:00Z');
insert into articulation_vote (version_id, account_id, board_id, value, voted_at) values
  ('seedver2000000000000', 'seedcy00000000000000', 'seedboard001', 1, '2026-11-01T12:00:00Z');
insert into assessment (version_id, rev, account_id, board_id, supported, assessed_at) values
  ('seedver1000000000000', 1, 'seedben0000000000000', 'seedboard001', true, '2026-11-01T12:00:00Z'), ('seedver1000000000000', 1, 'seedcy00000000000000', 'seedboard001', false, '2026-11-01T12:00:00Z');
update argument set importance = 2, importance_voters = 2, changed_seq = 2 where id = 'seedarg1000000000000';
update argument set importance = -1, importance_voters = 1, changed_seq = 2 where id = 'seedarg2000000000000';
update version set articulation = 1, articulation_voters = 1, changed_seq = 2 where id = 'seedver2000000000000';
update version set yes = 1, no = 1, changed_seq = 2 where id = 'seedver1000000000000';
commit;

-- Change 3: an edit, which starts the wording's assessments over.
begin;
select take_change_number('seedboard001');
insert into version_revision (version_id, board_id, rev, wording, context, why, importance_votes_before, articulation_votes_before, created_by, created_at) values
  ('seedver1000000000000', 'seedboard001', 2, 'Sunday is the only free day for most people who work shifts.', '', 'edited', 2, 0, 'seedana0000000000000', '2026-11-01T12:00:00Z');
insert into revision_source (version_id, rev, source_id, board_id) values ('seedver1000000000000', 2, 'seedsrc1000000000000', 'seedboard001');
update version set current_rev = 2, yes = 0, no = 0, changed_seq = 3 where id = 'seedver1000000000000';
insert into change (board_id, seq, at, actor_id, kind, subject_kind, subject_id, before, after) values
  ('seedboard001', 3, '2026-11-01T12:00:00Z', 'seedana0000000000000', 'version_edited', 'version', 'seedver1000000000000', '{"rev": 1}', '{"rev": 2}');
commit;

-- Change 4: a wording deleted by its author, and the shared order saved.
begin;
select take_change_number('seedboard001');
update version_revision set wording = null, context = null where version_id = 'seedver3000000000000';
update version set deleted_at = '2026-11-01T12:00:00Z', changed_seq = 4 where id = 'seedver3000000000000';
insert into change (board_id, seq, at, actor_id, kind, subject_kind, subject_id) values
  ('seedboard001', 4, '2026-11-01T12:00:00Z', 'seedben0000000000000', 'version_deleted', 'version', 'seedver3000000000000');
insert into published_order (board_id, computed_at, arguments, versions, changed_seq) values
  ('seedboard001', '2026-11-01T12:00:00Z', '{"seedyes0000000000000": ["seedarg1000000000000"], "seedno00000000000000": ["seedarg2000000000000"]}', '{"seedarg1000000000000": ["seedver2000000000000", "seedver1000000000000"], "seedarg2000000000000": []}', 4);
commit;
