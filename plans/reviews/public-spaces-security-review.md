# Security re-review before public spaces

Reviewed November 27, 2026, from `origin/main` at `b8a0593`. This is the re-review that the builder set on Nov 18 to run "before access widens beyond the class trial, and before the public-communities phase" (`plans/reviews/deployment-trust-boundary.md`, "When to review again"). It gates build-plan rows M3d-20 (public spaces: find them and join) and M3d-26 (communities to explore on Home).

The threat model changes with M3d-20. Today every Member of a space was added by name by its Owner or an Admin. After M3d-20, anyone who makes an account can find a public space and join it at once as a Member, and so open every board shared with "Everyone in the space". Sign-up already has no allowlist, so "anyone with an account" means anyone on the internet.

## 1. What was reviewed and how

Six reviewers each read the code through one lens, and a second agent then tried to refute every finding.

| Lens | What it covered |
|---|---|
| Access control | Space and board roles, `entryTo`, `spaceBoards`, sharing, removal, account deletion |
| Abuse and spam | Sock-puppet accounts, joins, floods, moderation tools, operator tools, cost |
| Web and sign-in | XSS, links, CSP and headers, CORS, CSRF, cookies, redirects, Google linking, sessions |
| Privacy | What a joiner sees, the privacy page, analytics, account deletion |
| Infrastructure and trust boundary | Workflows, Google trust, the three gaps accepted on Nov 18, staging |
| Dependencies and data | `npm audit`, advisories, secrets in history, logs, migrations 0015–0017, input fuzzing |

- **Code.** Every reviewer read the worktree of `origin/main`. Nothing in it was edited, committed, or pushed.
- **Local.** Throwaway vitest files under `audit-scratch` used the repo's own test support against the local Docker test database on Node 22. They stood in for M3d-20's Join by adding a `space_member` row as a Member, which is what the row says Join does. Every scratch file is deleted.
- **Staging.** Reviewers sent a few dozen unauthenticated requests to https://staging.steelman-argument.com. No one signed in, and no sign-in code was sent.
- **Production.** Nothing touched production. Its configuration was read only from the Terraform in `infra/`. No `gh` or `gcloud` command ran.
- **Adversarial verification.** A second agent re-checked each finding and was asked to refute it. It reproduced findings where it could and corrected severities and fixes where they overreached. This review uses the verifier's severity. Section 8 lists what did not survive.

M3d-20 isn't built yet: visibility still accepts only `private` (`app/shared/src/api.ts:120`), and there is no Join route. Findings about Join are therefore about the design in the M3d-20 row and the code it will sit on.

## 2. Verdict

**M3d-20 can be built now on its branch. It should merge only after the items below are in the same pull request, or in pull requests that land before it.** None of them needs a new service, the load balancer, or a larger database. Most are a few lines each, and several share one piece: a `joined_via` column on `space_member`, a `space_block` table, and one `exists()` clause that requires a board's Owner to still be in the space.

What must be done first, in order:

1. **Fix the account-deletion hand-over (F2).** A Member promoted by the deletion must not inherit the deleted Owner's boards, and a Member who joined must not inherit a public space.
2. **Give a public space's Admins and Owner control over which boards are in it (F1).** Also require the board's Owner to still be a space member in `entryTo` and `spaceBoards` (F1, F4).
3. **Make removal stick (F3).** An Admin's removal writes a block that Join refuses.
4. **Stop sharing other people's boards when a space goes public, and say what opens (F4, F5, F13).** The Make public question names the members, history, comments, and roles that open, and Share and the space card say the space is public.
5. **Decide who sees a public space's member list, and stop instant invites into a public space (F6).**
6. **Add cheap stand-ins for new-member holds (F7).** Either a daily new-account cap or an account-age gate and a daily join cap on Join, counted in Postgres.
7. **Bound Find spaces (F9).** The server returns at most about 50 to 100 public spaces, and one account owns at most about 3 public spaces.
8. **Give the builder a reviewed takedown (F8).** That means a `make-private` command and an account suspension that sign-in honours, run as Cloud Run jobs like `migrate` and `daily`.
9. **Make the privacy page true (F10, F14), and have the builder confirm it.** Section 6 has the sentences.
10. **The builder accepts this review in writing.** That acceptance includes TB-4: the merge, not a release, is the moment classmates' spaces on staging can first be made public, because staging is open to anyone.

Several fixes need the builder: the new `SPACE_POLICY` row (the `builder-approved` label), new rows in the limits table, the sentence in the architecture §2 deletion table, and the privacy page wording.

## 3. Findings

Confirmed findings only, most severe first. Duplicates found by more than one lens are merged, and the original IDs are listed. "Before" means before M3d-20 merges.

| # | Severity | Finding | Where | When | Fix |
|---|---|---|---|---|---|
| F1 | High | Any joiner can put boards in every member's list, and no space Admin or Owner can take them out (AC-1) | `server/src/boards.ts:47`, `server/src/sharing.ts:92` (both check only `space_read`); `server/src/access.ts:134-141`; `server/src/spaces.ts:223-241`; `shared/src/policy.ts:126-141` | Before | Add a `space_post` action (least `admin`) that `createBoard` and `setBoardSpace` check when the space is public, or an Admin write that takes a board out of the space. In both cases, `entryTo` and `spaceBoards` also require the board's Owner to still be a space member, so removing a spammer removes their boards from everyone's list. |
| F2 | Medium | Account deletion can make the first stranger who joined the Owner of the space and of the deleted Owner's invited-only boards in it (AC-3, HEIR-1, P1, DEP-1) | `server/src/account.ts:314` (`SPACE_HEIRS`), `:322-345` (runs first, at `:251`), `:429` and `:443-463` (board heirs never check access) | Before | Choose a board's space heirs from the Owner and Admins as they stood before this deletion, so a Member promoted by the same transaction never qualifies. Otherwise use the board's own editor, then contributor. Add `space_member.joined_via` (`invite` or `join`), and leave self-joined Members out of `SPACE_HEIRS`. With no such heir, delete the space as happens today with no members. Add failing tests first. |
| F3 | Medium | Removing someone from a space doesn't stick, so in a public space they rejoin at once (AC-2, MOD-1, DEP-3) | `server/src/spaces.ts:236` (deletes the row and keeps no block); `migrations/0016_spaces.sql:36-43`; M3d-20 row ("Joining makes you a Member at once") | Before | Add a `space_block (space_id, account_id, blocked_by, at)` table, written by an Admin's removal and not by Leave. Join refuses a blocked account with the same 404 a private space gives, and Find spaces leaves the space out for them. An Admin's invite lifts the block, and the change row records it. Test that removed then Join is refused, that Leave then Join is allowed, and that an invite lifts the block. |
| F4 | Medium | A board stays shared with a space after its Owner leaves or is removed, and Make public then opens it to every account without that Owner's consent (AC-4) | `server/src/access.ts:51-60`, `:134-141`; `server/src/sharing.ts:13-14`; `server/test/api/space-boards.test.ts:240-248` | Before | Add the `exists()` clause from F1. When a space goes public, set every board owned by someone other than the space's Owner to `general_access = 'invited'`, as `setBoardSpace` already does on a move, and have the question say so. Add a simulation check that someone who joins after a space goes public can't open a board shared before then unless its Owner shared it again. |
| F5 | Medium | Nobody is told what Make public opens: the question counts only boards, and Share still says "Everyone in POD 6" (P2, WEB-1) | `app/web/src/board/spaceAccess.ts:25-28`, `:35-45`; `app/web/src/NewSteelman.tsx:56`, `:253`; M3d-20 row's question | Before | Make the question count members as well as boards and say that history and comments open, for example: "Anyone with a Steelman account can then join POD 6, see the usernames of its 12 members, and open its 4 steelmen that are shared with everyone in the space, with their history and comments." Send the space's visibility with the board's space, and when the space is public have the hint say "Anyone with a Steelman account can join POD 6 and then find this steelman, vote, and write." Add a two-person e2e check. |
| F6 | Medium | In a public space, any joiner reads the whole member list, and an Admin can place any username in a public space without asking (AC-5, P3, DEP-4) | `server/src/spaces.ts:295-316` (`listSpacePeople` for any Member); `server/src/spaces.ts:168-201` (invite adds at once); `plans/architecture.md:563`, `:642`; `web/src/Privacy.tsx:46` | Before | The builder chooses one rule. Either a public space shows the list only to Admins and the Owner, or the privacy page says "Anyone with an account can join a public space and see its members' usernames." In both cases, refuse invites while a space is public, or make them wait for the person's acceptance. Correct the architecture sentence. Test the rule in `public-spaces.test.ts`. |
| F7 | Medium | Nothing limits how many accounts one person makes or how fast a new account joins, so a few sock puppets outvote a pod (SYBIL-1) | `server/src/sign-in.ts:186-215` (no `user.create` hook); `server/src/limits.ts:5-9`, `:24` (30 an hour per network, per instance); `server/src/app.ts:309-314`; no limit on `/sign-in/social` | Before (minimal) | Add a site-wide daily new-account cap in a `databaseHooks.user.create.before` hook, counted in Postgres, which covers Google and email alike. Alternatively, have Join refuse accounts younger than about 24 hours and allow about 10 joins a day per account. Each cap is a limits-table row the builder agrees. Moving the per-network code count into Postgres can wait. |
| F8 | Medium | There is no operator tool to take down a public space or suspend an account (OPS-1) | `shared/src/policy.ts:139` (visibility is the Owner's alone); `server/src/sign-in.ts:349-353` (`personFor` checks only the session); no suspend anywhere in `server/src` | Before | Add `account.suspended_at`, which `personFor` and sign-in treat as signed out, and a small operator CLI run as a Cloud Run job: `suspend <username>` and `make-private <space id>`. A reviewed SQL runbook is acceptable for making a space private, but not for suspension, because deleting sessions alone lets the person sign straight back in. |
| F9 | Medium | Find spaces as designed sends every public space, unpaged, and public spaces cost nothing to make (FIND-1, DEP-5) | M3d-20 row ("filters by name and about text in the browser"); `server/src/app.ts:428` (spaces share the 20-an-hour board limit); `server/src/spaces.ts:243-262` | Before | Return at most about 50 to 100 public spaces, ranked on the server, with search done on the server once the cap bites. Let one account own at most about 3 public spaces, checked when visibility is set. For M3d-26, rank by members whose accounts are older than about 7 days. |
| F10 | Medium | The privacy page contradicts public spaces and says nothing about joining (P8) | `app/web/src/Privacy.tsx:31-48`, `:79`, `:108-114` | Before | Add the sentences in section 6, and have the builder confirm them. |
| F11 | Medium | Joiners, even at Viewer, can flood every shared board with comments, and cleanup is one item at a time by board Editors only (FLOOD-1) | `shared/src/policy.ts:56`, `:78`; `server/src/limits.ts:28`, `:36`; `server/src/moderation.ts`; `server/src/reports.ts` (wordings only) | Later | F3 and F7 are the blockers. M3d-20's question should say that people who join can comment even on boards shared as Viewer. Soon after, add "Remove and hide what they wrote here" for the space Admin and board Owners, and put comment reports to the builder as a product question. |
| F12 | Medium | The cost "ceilings" in SECURITY.md aren't ceilings: the 605 KB bundle goes out uncompressed, and the database disk grows without limit (COST-1) | `server/src/web.ts:29-34`; `infra/modules/steelman/main.tf:73`, `:705-722`; `SECURITY.md:70`, `:101` | Later | Compress `/assets` once at start with `node:zlib`, which needs no new package. Set `disk_autoresize_limit`, for example 20 GB. Correct the SECURITY.md, Terraform comment, and architecture sentences. A budget kill switch needs IAM changes, so it is the builder's call and fits with the load balancer. |
| F13 | Low | The space card always says "Private space" with a lock (P5) | `app/web/src/Spaces.tsx:160-170`; `SpaceSettings.tsx:196` | Before (in M3d-20) | Pass the visibility into `SpaceFacts`, show "Public space" with a globe icon, and add an assertion to `public-spaces.spec.ts`. |
| F14 | Low | The privacy page misstates what happens to your boards and spaces when you delete your account (P6) | `app/web/src/Privacy.tsx:112` | Before | Rewrite the sentence after F2 lands so that it matches the final rule. Section 6 has a draft. |
| F15 | Low | Boards default to Contributor for joiners, and the Make public question doesn't say so (AC-6) | `server/src/boards.ts:56-57`; `web/src/NewSteelman.tsx:56`; `shared/src/api.ts:72` | Later | Name the role in the question. Defaulting new boards in a public space to Voter is optional. |
| F16 | Low | Anyone can add any username to a board or space they own again and again, with no Accept step (INVITE-1) | `server/src/spaces.ts:168-201`; `server/src/sharing.ts:198-232` | Later | Leaving a space or board blocks re-invites from it until the person rejoins. Invites from someone who shares nothing with the invitee could wait as pending. Both are product changes for the builder. |
| F17 | Low | Any reader of a board sees every person invited to it, including people outside the space (P4) | `server/src/app.ts:594-598`; `server/src/sharing.ts:121-145` | Later | Add one privacy-page sentence: "Everyone who can open a board sees the usernames of the people invited to it." Narrowing the list is a `policy.ts` change for the builder. |
| F18 | Low | Board and space addresses reach PostHog and Cloud Run's request log (P7, DEP-7) | `app/web/src/analytics.ts:41-55`, `:104` (only `/u/` is rewritten) | Later | Rewrite `/b/`, `/v/`, `/c/` and `/s/` segments in `before_send`, add a test beside the `/u/` one, and say on the privacy page that request logs hold the addresses visited. |
| F19 | Low | Each signed-out Google sign-in start writes a database row, with no limit (AUTH-ROW-1) | `server/src/app.ts:309-314`; `server/src/sign-in.ts:205-212` | Later | Add a separate, looser per-network limit for `/sign-in/social`, for example 60 an hour. Reusing the code window would starve a shared campus network. It is a new limits row, so the builder decides. |
| F20 | Low | Neither site sends Strict-Transport-Security, so a first visit over http can be intercepted (WEB-2, TB-8) | `server/src/app.ts:234-237` | Later | Send `strict-transport-security: max-age=31536000` beside the CSP when `APP_ORIGIN` is https, without `includeSubDomains` yet. Extend `security-headers.test.ts`, then check staging with `curl -I`. |
| F21 | Low | Google sign-in links to an existing account on any address Google marks verified, including addresses Google isn't authoritative for (AUTH-1) | `server/src/sign-in.ts:163`, `:421-429` | Later | Link only for `@gmail.com` or tokens with an `hd` claim, and otherwise ask the person to sign in with a code. It narrows F7 of the feature list, so the builder decides; record it in #105 if it waits. |
| F22 | Low | No one can end their other sessions, and changing email leaves them all signed in (AUTH-2) | `server/src/sign-in.ts:50-63`, `:114`, `:329-341` | Later | Delete the account's other sessions in `afterEmailChanged`. "Sign out of other devices" would be a new feature row for the builder. |
| F23 | Low | Usernames and space names can pose as Steelman, because reserved names match only exactly (AUTH-3) | `shared/src/inputs.ts:52`, `:97-114` | Later (before M3d-26) | Refuse usernames and space names containing "steelman", and usernames whose first word is admin, mod, staff, support, or official. Match "mod" only as a whole word, so "modern_ux" still passes. |
| F24 | Low | The sign-in code email doesn't tell people not to share the code (AUTH-4) | `server/src/email.ts:54-67` | Later (alongside) | Add "Enter this code only on steelman-argument.com. Don't share it with anyone, including people who say they're from Steelman." to both code emails. |
| F25 | Low | better-auth 1.7.14 is inside the range of GHSA-2f9c-7xj7-gh55 for the change-email setting Steelman uses, and `npm audit` can't see it (DEP-2) | `app/server/package.json:12`; `server/src/sign-in.ts:276`; `.github/workflows/nightly.yml:43` | Later (soon) | Bump better-auth to 1.7.16 or later in one pull request and run `npm run check`. Add a test with two colliding address pairs. Watching the repository's security alerts and auditing at `moderate` are the builder's calls. |
| F26 | Low | Space names accept bidi-override and zero-width characters (DEP-6) | `shared/src/inputs.ts:37-39`, `:51-53` | Later | Strip Unicode categories Cc and Cf, apart from ordinary whitespace, or render names in `<bdi>`. Showing the Owner's username on each Find spaces card does more against a fake "POD 6". |
| F27 | Low | The agent's admin token can add `builder-approved`, and the guard judges a pull request with that pull request's own copy (TB-2) | `.github/workflows/guards.yml:17-23`, `:53`; `app/scripts/guards/protected-files.ts:44-51` | Later (before M3d-26) | See section 5. |
| F28 | Low | Repository admins can still bypass the production approval (TB-3) | Trust-boundary review, decision 3; `.github/workflows/release.yml:35-38` | Later | See section 5. |
| F29 | Low | Staging never runs the daily retention job, but it holds real people's data and promises daily deletion (TB-5) | `infra/modules/steelman/main.tf:550-553`; `.github/workflows/deploy-staging.yml:86-89`; `web/src/Privacy.tsx:93`, `:102-103` | Later | After `deploy-staging.yml` line 89, run `gcloud run jobs execute steelman-daily --project "$PROJECT" --region "$REGION" --wait`. It is a workflow change, so it needs `builder-approved`. |
| F30 | Low | Third-party actions in the jobs that get deploy tokens are pinned to tags, not commit SHAs (TB-6) | `.github/workflows/release.yml:50`, `:54`, `:67`, `:71`; `deploy-staging.yml:50`, `:54` | Later | Pin every `uses:` to a full SHA with the tag in a comment, and add a Dependabot entry for `github-actions`. It needs `builder-approved`. |
| F31 | Low | Staging and production almost certainly share one Resend account and its 100-a-day allowance (TB-7) | `infra/modules/steelman/variables.tf:31-35`; `plans/architecture.md:595`, `:603` | Later | Add a daily cap on sign-in emails for each environment, counted in Postgres, with a low cap on staging. A separate Resend account for staging is a new sign-up, so it is on the Ask me first list. |

Evidence, one line each:

- **F1.** Locally, Member joe's `POST /api/boards` into the space returned 200, and the board appeared in Member mel's list as contributor. After Admin ada removed joe (200), mel still opened it at 200, the space Owner's `PUT /space {space:null}` and the Admin's `PUT /access` both returned 403 `not_allowed`, and the board row still held the space's ID.
- **F2.** Locally, Ana owned a space with no Admin and an invited-only board in it with Eve as Editor. Before Ana's `POST /api/account/delete`, Member Sam's `GET /api/boards/:id` answered 403 `no_access`. After it, Sam answered 200 as owner, could `PUT /access` to share it with the whole space, and became the space's Owner. A control run with a pre-existing Admin left Sam at 403.
- **F3.** Locally, re-adding joe as a Member after his removal restored his board as owner and every space-shared board. A grep of `server/src` and the migrations for ban, block, or suspend finds nothing relevant.
- **F4.** Locally, after the space Owner removed ana (200), her board still read `general_access: space, link_role: contributor`, and both a remaining Member and a Member added later opened it at 200 contributor.
- **F5.** `accessHint` and `generalLabel` take only the access and the space name, and the board's space data carries no visibility (`shared/src/api.ts:361-364`).
- **F6.** Locally, a new Member's `GET /api/spaces/:s/people` returned 200 with `{id, name, role}` for every member, and the Owner's invite of an existing username returned 200 and listed the space in that account's `GET /api/spaces` at once.
- **F7.** Locally, with two instances on one database and one forwarded address, 60 addresses each asked for a code and signed in, all 200. `dig AAAA staging.steelman-argument.com` returns an IPv6 address, so a /48 gives 65,536 networks. The realistic rate from one IPv4 address is 30 accounts an hour, and Resend's 100 a day caps the email path for the whole site.
- **F8.** A grep of `server/src` for suspend, ban, takedown, disable, and deactivat finds only unrelated hits. The only code that ends someone's sessions is the person's own account deletion (`account.ts:292`).
- **F9.** No listing in `list.ts` or `spaces.ts` has a limit or paging, and the member count is a subquery per space. One account can make 20 to 60 spaces an hour across three instances.
- **F10.** Staging's bundle `/assets/index-Nmy0rIKk.js` contains "No one outside the space sees either.", which becomes false when the member count opens to every account.
- **F11.** `comments.test.ts:53` shows a Viewer's comment returning 200, and only `/versions/:id/report` exists, so comments can't be reported.
- **F12.** Staging's `GET /assets/index-Nmy0rIKk.js` returned 200 with `content-length: 604626` and no `content-encoding`, with and without `accept-encoding: gzip, br`. Locally the file is 176,672 bytes with gzip and 149,087 with brotli.
- **F13.** `SpaceFacts({ members })` renders the lock and "Private space" whatever `space.visibility` is.
- **F14.** The page says "A board you own passes to its longest-standing contributor." The code passes a board in a space to the space's Owner or an Admin first, then to its editor, then contributor, and never mentions spaces.
- **F15.** `accessInput` caps the link role at viewer, voter, or contributor, and contributor is the default on both the form and the server.
- **F16.** Locally, a "BUY NOW scam.example" space re-invited a victim after they left (200), and the space reappeared in the victim's list. Board invites already do the same, so public spaces add bulk usernames, not the forced add.
- **F17.** `space-boards.test.ts:306-317` asserts that a member let in through the space sees the board's invited people.
- **F18.** `withoutProfileNames` rewrites only `PROFILE_ADDRESS`, and staging's `GET /api/config` returns a live PostHog key.
- **F19.** Locally, 200 signed-out `POST /api/auth/sign-in/social` requests all answered 200 and wrote 200 rows (86,400 bytes). On staging, one such request answered 200 with no rate-limit header.
- **F20.** `curl -I http://staging.steelman-argument.com/` answers `302 Found`, and the https responses carry a CSP and `nosniff` but no `strict-transport-security`.
- **F21.** `acceptGoogleIdentity` checks only `email_verified`, `sub`, and the `@`, and there is no `hd` or domain check.
- **F22.** On staging, `/api/auth/revoke-other-sessions`, `/revoke-sessions`, and `/list-sessions` answer 404.
- **F23.** A Node 22 run of the real module accepted `steelman_support`, `admin_1`, and `SteelmanOfficial`, and `spaceNameInput` accepted "Steelman Support".
- **F24.** The email body says the code, its 10 minutes, and "nobody can sign in without the code", and nothing about sharing it.
- **F25.** Under the installed zod, the pairs (`x@a.bb`, `c.com-v@target.com`) and (`x@a.bb-c.com`, `v@target.com`) give the same code key. `npm audit` reports 0 vulnerabilities.
- **F26.** Locally, `POST /api/spaces` with a name starting with U+202E answered 200.
- **F27 to F31.** These are read from the workflow and Terraform files at the lines cited. F31's shared account is inferred from one Resend DKIM key at `resend._domainkey.steelman-argument.com`.

**For information.** TB-4: merging M3d-20 makes public spaces available at once on staging, which has open sign-up and holds classmates' accounts. No space opens until its Owner chooses Make public, so this is for the builder to accept in writing, not to fix. AUTH-5: a persistent attacker who knows an address can guess about 25 codes an hour against it, and the victim would get about 120 emails a day. Public spaces expose usernames, not emails, so this ties to #105 and needs nothing now.

## 4. "Before public communities", item by item

The plan's T4 list (`plans/build-plan.md`, "Before public communities") names four things that may have to come first.

| Item | Needed before M3d-20? | Why |
|---|---|---|
| The global load balancer with Cloud Armor | No. It goes before M3d-26 or any promotion beyond the class. | M3d-20 adds no signed-out route. On staging, signed-out `GET /api/spaces` and `/api/spaces/public` answer 401 `signed_out`. Every abuse path this review found goes through a signed-in account, which a per-address edge rule can't tell apart from real use. When the load balancer arrives, set ingress to `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` and change `callerNetwork` in the same pull request (`main.ts:73-77`, `app.ts:818-822`). Otherwise Cloud Armor protects nothing, and every caller shares one sign-in limit. |
| New-member holds and spam checks | The full version waits until before M3d-26. Its cheap stand-ins are needed now. | The stand-ins are: Admins decide which boards are in a public space (F1), removal sticks (F3), a daily new-account cap or an account-age gate and join cap (F7), and a bounded Find spaces (F9). With those in place, a review queue or a hold at Voter is optional at class-plus-public scale. M3d-26 puts public spaces in front of every new account, so the full version belongs before it. |
| A larger database and 2+ Cloud Run instances | No. | It is capacity, not security. M3d-20 adds one list query, and F9 bounds it. A `db-f1-micro` with at most three instances is also what keeps a flood's cost low. Revisit it for load. |
| The privacy page reviewed by someone qualified | No, on conditions. It is needed before M3d-26 or any promotion beyond the class, whichever comes first. | At class-trial scale, a public space is still something a classmate opts into. The conditions are that section 6's text is live and the builder confirms it, that there is no promotion outside the class, and that no space holds sensitive or graded material. Make M3d-26's "Ready when" column depend on the qualified review or on the builder's written waiver. |

## 5. The three gaps accepted on Nov 18

The builder kept all three for the class trial and asked for them to be reviewed again now. None of them lets a stranger who joins a public space do anything, because fork pull requests get a read-only token and strangers have no path to GitHub or Google. What changes with public spaces is the consequence of a mistake: it would now reach strangers' accounts and self-joined readers, not only the class.

| Gap | Change now | Can still wait |
|---|---|---|
| 1. Agents act as the builder on GitHub and Google | Nothing has to change before M3d-20 merges. M3d-20 edits `policy.ts`, so the builder reads it before adding `builder-approved` anyway. | **GitHub (F27):** before M3d-26 or any wider invitation, give agent sessions a fine-grained token for this one repository with Contents, Pull requests, and Issues read and write, and no Workflows or Administration permission. **Google:** signing out between Terraform applies (`gcloud auth revoke --all` and `gcloud auth application-default revoke`) is cheap and worth doing. Re-rate this to medium if agents ever get a staging test login, because they would then read stranger-written text. |
| 2. The protected-files check runs the pull request's own copy | Nothing has to change before M3d-20 merges. | Before M3d-26, make the review's prepared switch of `guards.yml` to `pull_request_target`, add `app/scripts/guards/` and `infra/` to the protected list, and have the guard check that the builder sent the `builder-approved` label event. Adding `access.ts` to the protected list is not proportionate, because every space pull request would then wait for the label, and its tests are already protected. |
| 3. Admins can bypass the release approval and `main`'s rules (F28) | Nothing has to change before M3d-20 merges, because a merge reaches staging only. | When access widens, untick "Allow administrators to bypass configured protection rules" on the production environment. It costs nothing, because the builder is the required reviewer and self-review is allowed. It stops casual bypass but not an admin account takeover, since an admin can change the rule back. Closing takeover means 2FA or SSO on the organization, or removing the owners' admin role, which is the organization's call. Leave `enforce_admins` on `main` off for now. |

## 6. What the privacy page must say before public spaces

The M3d-20 row already changes the privacy page and needs the builder to confirm it. Its planned sentence covers only a public space's name, about text, and member count. Today's line 46 ("No one outside the space sees either.") becomes false. These sentences, each a full sentence (AGENTS.md rule 13), make the page true. Update the page's date when they land.

1. "Anyone can make a Steelman account, so anyone can find a public space and join it."
2. "Every signed-in account sees a public space's name, about text, canvas, and how many members it has."
3. "Joining a public space shows you the usernames of its members, and its members see yours." Change this to match the rule the builder picks in F6.
4. "Everyone in a space opens the steelmen shared with the space, with their history, comments, and the names of the people on them."
5. "When the owner makes a private space public, everything above opens to anyone who joins, including what members wrote before."
6. "Your profile shows anyone who joins a public space what you wrote on that space's steelmen."
7. "Leaving a space doesn't remove what you wrote on its steelmen."
8. "We keep the spaces you make, the spaces you join and leave, and when."
9. The corrected deletion sentence (F14), written after F2 lands. If F2 lands as recommended, it reads: "A board you own in a space passes to the space's owner or longest-standing admin. Otherwise it passes to its longest-standing editor, and then to its longest-standing contributor. A space you own passes to its longest-standing admin, or else to a member the space invited, and a space with no one left to take it is deleted."

Two more sentences are worth adding in the same pull request, though they don't block it: "Everyone who can open a board sees the usernames of the people invited to it." (F17), and a line saying that the server's request logs also hold the address of each page visited (F18).

`docs/privacy.html:53` is stale, but it describes the Build 1 prototype, and AGENTS.md says `docs/` stays as it is. It is not a gate for M3d-20.

## 7. Checked and sound

- **Board roles through a space stay capped.** "Everyone in the space" can only be Viewer, Voter, or Contributor (`shared/src/api.ts:72`, `access.ts:58-59`, `:138`). A space role gives no board powers beyond that.
- **Joiners can't manage a space.** Invite, settings, roles, removal, and visibility are checked in `SPACE_POLICY` before anything is looked up, and visibility is the Owner's alone. The space-roles, space-access-matrix, space-boards, and spaces tests pass locally (4 files, 204 tests).
- **Unshared boards stay closed.** A board in a space that isn't shared with it stays closed to members, link boards included (`space-boards.test.ts:171`). Someone outside gets 403 and never sees it listed.
- **Leaving ends access at once.** `entryTo` reads `space_member` on every request and never records a board membership. The list, profiles, and statistics reuse `spaceBoards`.
- **Private spaces stay unfindable.** Every read and write by a non-member answers 404, as for an unknown or malformed ID. M3d-20's Join must give a private space the same 404 and should check visibility while holding the space's row lock (`writeToSpace`'s `forUpdate`, `spaces.ts:56`). The known `409 id_taken` gap is unchanged.
- **Signed-out requests are refused on staging.** `/api/spaces`, `/api/spaces/:id`, `/api/spaces/:id/people`, `/api/spaces/public`, and `/api/people/:name` answer 401 `signed_out`.
- **No one sees anyone else's votes.** `read.ts` sends only totals and the reader's own vote, and statistics are shown only to their owner.
- **Emails stay private.** The space and board people lists return only id, username, and role. Download your data holds only the person's own rows, and a space's name and about text only for its creator.
- **Reports can't remove legitimate content.** Reports never hide anything on their own, only an Editor or the Owner hides, and hide and restore have no rate limit.
- **Sign-in emails per address are counted exactly.** The count is kept in Postgres under an advisory lock (`sign-in.ts:440-455`). The network address is the last `X-Forwarded-For` entry, and IPv6 is counted per /64.
- **No XSS path was found.** `app/web/src` has no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`, and React renders all user text as text. Source links render only for http(s) addresses with `rel="noopener noreferrer nofollow ugc"`.
- **Headers, CORS, and CSRF hold on staging.** The CSP has no inline script, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, and `form-action 'self'`. A foreign Origin gets no CORS headers. Every cookie-carrying write needs `Origin` equal to `APP_ORIGIN`, so M3d-20's Join and Leave get this for free as long as they aren't GET.
- **Sign-in redirects are checked.** Better Auth's origin check refused every open-redirect variant tried offline, and `?error=` is never rendered.
- **Cookies are safe.** They are HttpOnly, SameSite=Lax, and Secure with the `__Secure-` prefix, and sessions are checked in the database on every request.
- **The test-user header is off when deployed.** Staging answers 403 `test_users_off`.
- **Replays and search stay private.** Space names sit in `ph-no-capture`, and `e2e/spaces.spec.ts:414-419` scans for any that don't. Home's search stays in the browser and out of the address, which is the right precedent for "Search spaces".
- **The deploy boundary is as it was on Nov 18.** Google accepts only this repository's runs on `main`, and production also requires the `production` environment (`main.tf:269`, asserted by `deploy-trust.test.ts`). No service account has a key, the deploy account reads no secret, Cloud SQL has no authorized networks, and production has deletion protection, backups, and a weekly export.
- **Dependencies and secrets are clean.** `npm audit` reports 0 vulnerabilities, apart from F25, which it can't see. A search of every commit since Nov 22 found no keys, and the only real-looking address strings are fixtures.
- **Logs keep little.** The service logs method, route pattern, status, and duration only, Better Auth's errors mask every `@` word, and sessions store no IP or user agent.
- **Migrations 0015 to 0017 grant only what they need.** 0017's insert on `board_member` adds no right the service login lacks. The risk is the hand-over logic it enables (F2), not the grant.
- **Inputs are bounded.** A local fuzz of 80+ odd inputs across the space, username, and profile routes produced no 500, and every body is a strict object with bounded strings.

## 8. Refuted during verification

- **TB-1** (agents' Google login becomes urgent because agents will read strangers' text) is refuted: agents check staging signed out, and signed-out Find spaces shows nothing.
- **TB-4 as a blocker** is refuted: no space opens until its Owner acts, and the row's own gate already treats the merge as the moment access widens.
- **INVITE-1 as new with public spaces, and as a blocker**, is refuted: board invites already add anyone with no Accept step.
- **DEP-2 as a blocker** is refuted: it needs crafted addresses at two domains, public spaces don't change it, and the attempt-limit race reaches no exposed route.
- **DEP-3's "keeps no record"** is refuted: a `member_removed` change row is written, and what's missing is a block Join checks.
- **DEP-3 and MOD-1's "removal is the only tool"** is refuted: the Owner can make the space private first and then remove the person.
- **AC-1, P1, and DEP-1 at high** were lowered: P1 and DEP-1 to medium because the attacker can't trigger an account deletion, and AC-1 stays high only at the top of the range.
- **AC-3 and P1's fix "hand a board over only when it is shared with the space"** is refuted as the required fix: it contradicts `space-boards.test.ts:374`, which rule 9 protects, so it is optional and the builder's call.
- **SYBIL-1's "90 accounts an hour from one address"** is refuted as the realistic rate: it is 30, and quota drain and sock-puppet voting predate public spaces.
- **FIND-1's "uncounted visibility toggles grow the list"** is refuted: every space is counted when it's made, and flooding the list needs no sock puppets.
- **TB-2's "add `access.ts` to the protected list"** is refuted as disproportionate.
- **TB-3's fix "stops an admin takeover"** is refuted: an admin can tick the bypass box again.
- **COST-1's budget kill switch as an agent item** is refuted: it needs IAM changes, which stay with the builder.
- **AUTH-ROW-1's "reuse the sign-in code window"** is refuted: it would let Google sign-ins on a shared network starve classmates' codes, and disk growth is bounded by the peak day.
- **AUTH-4's wording "Steelman never asks you for it"** is refuted: Steelman's own sign-in page asks for the code.
- **P2's Slack comparison** is doubtful: Slack admins can convert a private channel to public, so GitHub's warning is the better precedent.
- **P8's item about `docs/privacy.html`** is refuted as a gate: that page describes the Build 1 prototype.
- **DEP-6's "bidi lets a space pose as POD 6"** adds little, because space names aren't unique and anyone can already use "POD 6".
