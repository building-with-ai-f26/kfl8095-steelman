# Plan: permissions and board rules

**Status:** proposal, not built. **Scope:** the browser-local prototype (`docs/prototype/source/steelman-refined.html`). Everything stays simulated: no accounts and no backend.

## Why

Steelman has to work for three kinds of group:

1. **Public or large-scale debate**, where no single person has much direct editing control.
2. **Small team debate**, where everyone can edit everything.
3. **Somewhere in between**, with one or more designated editors.

Today the Share panel offers **can view / can vote / can contribute**, plus an owner and general access. In the code, though, roles only control combining arguments (`canMove` and `canSuggest`). A "can view" user can still vote, assess evidence, and write. You are also always `kieran_lamee`, so a tester can only experience the board as one user. The permission model is visible but can't be tried out.

## The key idea: three modes, four settings

Steelman already avoids the hardest editing problem. Nobody overwrites anyone: a better wording becomes a new version in the stack, and votes decide which leads. So "editing control" comes down to four separate settings:

| Setting | Public community | Edited (designated editors) | Open team |
|---|---|---|---|
| **Who can add content** (arguments, versions, sources) | Anyone who joins | Anyone; non-editors' additions are **held for review** | Everyone, publishes immediately |
| **Who can change structure** (options, combine, separate, delete) | Moderators; everyone else suggests | Editors | Everyone |
| **Who can edit someone else's wording** | No one; only a new version | Editors, for small fixes, logged | Everyone, with history |
| **Who decides the order** | Votes | Votes; editors can *feature* but not reorder | Votes |

**Principle: votes always set the order, in every mode.** Editors control what gets in and the structure. The crowd controls what leads. If curated order is ever tested, it has to be disclosed (PRD v0.4, section 7).

### Role ladder

`Viewer → Voter → Contributor → Editor → Owner`, plus **Moderator** on public boards and **Space admin** for space-wide settings (including AI; see [ai-integrations.md](ai-integrations.md)).

| Can… | Viewer | Voter | Contributor | Editor | Owner |
|---|---|---|---|---|---|
| Read, comment, report | ✓ | ✓ | ✓ | ✓ | ✓ |
| Vote, assess evidence | | ✓ | ✓ | ✓ | ✓ |
| Add arguments, versions, sources | | | ✓ (held for review in Edited mode) | ✓ | ✓ |
| Accept or decline held items | | | | ✓ | ✓ |
| Combine, separate, edit options | | | suggest | ✓ | ✓ |
| Change rules, sharing, editors | | | | | ✓ |

## How well each user is served today

**Public community: mostly not served.**
- *Lurker / first-time reader:* no signed-out or view-only state, and nothing says what they're allowed to do.
- *Drive-by contributor:* posting works, but there's no introduction to the community's rules and no feedback after posting.
- *Moderator:* missing entirely. Only sources can be reported. There's no hide-with-reason, no "removed by moderator" placeholder, no audit log, and no rollback. PRD v0.4 requires all of these for the public trial.
- *Bad actor / brigade:* no defense, and the board owner has unlimited power to combine.

**Open team: partly served, with friction.**
- Fixing a teammate's typo means suggesting a whole new version, which clutters the stack.
- There's no ending: no deadline, no "close", and no record of what was decided and why.
- There's no "who hasn't weighed in yet" view for a facilitator.

**Edited: not modeled.**
- There's no editor role and no review queue.
- There's no per-option stewardship, where each side's best advocate curates its own case.
- Contributors get no "awaiting review" or "declined, here's why" feedback.

**Cross-cutting gaps:**
- No visible list of what you're allowed to do on a board.
- No way to request more access.
- Ownership can't be transferred.
- No history panel.
- No notice of pending items for editors.

## Components (build one at a time, confirming each)

### P1. View-as switcher + enforced roles *(first; everything else depends on it)*
- A persona menu in the top bar: **Owner, Contributor, Voter, Viewer, Signed out** (Editor joins with P3, when the role exists). It's labeled as a prototype tool so testers don't mistake it for a real feature.
- Every control respects the role. Viewers see vote arrows disabled, with a tooltip on why. "Add an argument" becomes **Request access** for viewers and voters. Signed-out users get **Sign in to vote**.
- A small "You can: read · comment · vote" line in the board header.
- **Done when:** every action in `tests/build-1-manual.md` behaves correctly for each of the six personas.

### P2. Board rules preset *(built Nov 10, with the create sheet: “How it runs”)*
- In Settings, choose **Open team / Edited / Public community**. Each preset sets the four settings above; **Customize** reveals them individually.
- A one-line summary under the question, e.g. *"Edited · 2 editors · new arguments are reviewed"*. Clicking it opens the rules.
- New steelman sheet: the space suggests a default (a public community → Public; a private space → Open team).

### P3. Editors and the review queue *(built Nov 10: can edit role, held arguments and wordings, Accept / Decline with reason, Withdraw, the "to review" stepper. Not yet: held sources, Ask for changes, per-option stewards)*
- Share gains a **can edit** role. Editors can optionally be assigned to one option ("Steward of *Why it makes sense*").
- In Edited mode, a non-editor's argument, version, or source is held. Its author and the editors see it as a faint card with a dashed border, marked *Awaiting review*. Nobody else sees it.
- An editor's queue (a badge in the header showing the pending count) offers **Accept**, **Decline with reason**, and **Ask for changes**. The author sees the outcome on the card. This extends the existing combine-suggestion pattern.

### P4. Moderation (public communities)
- **Report** on arguments, versions, and comments, in addition to sources.
- Moderators can **Hide with reason**. A placeholder ("Removed by a moderator: off-topic") keeps the row's position and history; **Restore** brings it back.
- A **History** panel per board: who did what, when, and why, with Undo for structural changes.

### P5. Lifecycle (open teams)
- Optional deadline. **Close the board** makes it read-only.
- A closed board shows a short **Decision** block above the columns: the chosen option, why, and who decided, linked to the arguments that mattered.
- A **Who's weighed in** view for the owner (voted / contributed / not yet).

### P6. Edit anyone's wording (open teams)
- Direct edits with revision history, using the PRD rule. A **minor fix** (typo or formatting) keeps votes and assessments. A **change of meaning** resets that version's articulation and credibility. The editor picks which, and the history records it.

## Open questions
- Should the per-option steward (P3) be a separate role or an editor with a scope? A scope is simpler.
- Does a held contribution count toward the board's "Needs help" status? (Probably not until accepted.)
- In public communities, should brand-new members be held for review automatically, as a lightweight anti-spam measure, even when the community is otherwise open?
