-- What each database role may do. Anything not granted here is refused.
--
-- steelman_app, the service:
--   * may read everything;
--   * may add and change content, but never remove a row of it (invariant 6:
--     deleted and hidden items keep their place);
--   * may add revisions and citations, and erase a revision's text, but not
--     otherwise change them (invariant 2);
--   * may add, change, and withdraw votes (invariant 1);
--   * may add to the change log, and nothing else (invariant 8).

grant select on
  account, board, option, argument, version, version_revision, revision_source, source,
  published_order, importance_vote, articulation_vote, assessment, change
  to steelman_app;

grant insert, update on account, board, option, argument, version, source, published_order to steelman_app;

grant insert on version_revision, revision_source, change to steelman_app;
grant update (wording, context) on version_revision to steelman_app;

grant insert, update, delete on importance_vote, articulation_vote, assessment to steelman_app;

-- steelman_account_deletion, used only by the account-deletion job (M1):
-- the one exception to "append-only". It may replace who did a change with
-- the deleted-account stand-in and scrub their ID from before and after.
-- The rest of what that job needs is granted when it is built.
grant select on change to steelman_account_deletion;
grant update (actor_id, before, after) on change to steelman_account_deletion;
