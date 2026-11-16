-- Deleting an account (M-07, M1-12; plans/architecture.md §2, "Account
-- deletion and anonymization", and §7, "Export and deletion").
--
-- The job runs in one transaction under steelman_account_deletion, so what it
-- may touch is exactly what is granted below. It erases the person's email
-- and sign-in, deletes their votes and assessments, credits what they wrote
-- to one stand-in account, scrubs them from the change log, and hands over or
-- deletes the boards they own (Q11).
--
-- The job switches to this role inside its transaction (set local role), so the
-- service's own database user must be a member of it, as it is of
-- steelman_app: a deployment grants both (M1-14).
--
-- Additive only, so the code already running keeps working (AGENTS.md rule 7).

-- A board nobody else could open is deleted with its owner's account (Q11).
-- Like a deleted wording, it keeps its row with its text erased (invariant 6),
-- so the change log stays append-only (invariant 8), and its link answers
-- that it doesn't exist.
alter table board add column deleted_at timestamptz;

grant usage on schema sign_in to steelman_account_deletion;
grant select on
  account, board, board_member, option, argument, version, version_revision, source,
  importance_vote, articulation_vote, assessment,
  sign_in.session, sign_in.sign_in_method, sign_in.sign_in_code
  to steelman_account_deletion;

-- The stand-in every deleted person's arguments, wordings, and sources are
-- credited to, `deleted_account`, so nothing links two of one person's
-- contributions. The job adds it the first time it runs (a row added here
-- would change every database's accounts); its name is reserved
-- (shared/src/inputs.ts), so nobody can take it first.
grant insert on account to steelman_account_deletion;

-- The person: email erased, marked deleted. The username stays for 30 days, so
-- nobody can take it straight away (architecture §7, Retention).
grant update (email, email_verified, name, image, updated_at, deleted_at) on account to steelman_account_deletion;

-- Sign-in: their sessions, ways of signing in, and codes waiting for their address.
grant delete on sign_in.session, sign_in.sign_in_method, sign_in.sign_in_code to steelman_account_deletion;

-- Their votes and assessments; the counts they were part of.
grant delete on importance_vote, articulation_vote, assessment to steelman_account_deletion;
grant update (importance, importance_voters, created_by, changed_seq) on argument to steelman_account_deletion;
grant update (articulation, articulation_voters, yes, no, author_id, hidden_by, changed_seq) on version to steelman_account_deletion;

-- What they wrote, credited to the stand-in; on a board being deleted, every text erased.
grant update (created_by, wording, context) on version_revision to steelman_account_deletion;
grant update (added_by, unavailable_by, name, locator, finding, backs_up, limits, changed_seq) on source to steelman_account_deletion;
grant update (name, changed_seq) on option to steelman_account_deletion;

-- Each board the job touches takes its next change number (take_change_number
-- moves last_seq); a board they made is credited to the stand-in, and one
-- being deleted loses its question.
grant update (last_seq, created_by, question, deleted_at) on board to steelman_account_deletion;

-- Their memberships end; a board they own passes to someone else.
grant delete, update (role) on board_member to steelman_account_deletion;
