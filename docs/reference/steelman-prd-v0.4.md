# Steelman — PRD v0.4

*Working name · November 5, 2026 · For product feedback and a focused card prototype.*

**Changes from v0.3:** preserves the public-forum vision; separates commitments from experiments; resolves conditional importance; defines the credibility display; moves evidence assessment into the expanded card; specifies grouping and vote inheritance; replaces misleading metrics; scopes the next prototype to the card and its immediate context.

## 1. Product and purpose

Steelman is a public forum where people collectively build the strongest credible case for each answer to a question. A **steelman** is the whole debate: a living document containing opposing cases, each made of concise, distinct ideas with inspectable reasoning and evidence.

The goal is to make disagreement easy to understand, examine, and improve. Readers should quickly grasp the strongest case for each option. Contributors should improve a shared argument rather than repeatedly restate it in separate comments.

Public communities are the primary audience. The same document can support restricted groups, classrooms, and companies: “Let’s make a steelman” becomes a quick way to structure a decision.

The public product includes a discovery feed, contribution, and sharing. Votes on a whole steelman affect discovery separately from judgments inside it. These features remain in the vision; the next prototype tests the card interaction.

## 2. Core model and commitments

| Object | Meaning |
|---|---|
| Steelman | The complete debate document |
| Question | The decision or question being explored |
| Option | A possible answer, represented by a column |
| Idea | A distinct reason for an option, represented by a row |
| Card | One articulation of that idea, with its explanation and evidence |
| Lead card | The preferred card in a row, shown by default |
| Revision | A recorded change to a card; distinct from a competing alternative card |

A steelman supports two or more options. Each option contains idea rows. Alternative cards within a row make the same underlying case through different wording, qualifications, or supporting evidence.

| Judgment | Question being answered | Applies to | Visible result |
|---|---|---|---|
| Importance | If true, how much would this idea change the answer? | Idea | Vertical position within its option |
| Preference | Which version expresses this idea most clearly, precisely, and fairly? | Card | Horizontal position within its row |
| Credibility | Does the cited evidence support this card’s factual claims as worded? | Card revision | Credibility indicator |

**The judgments stay independent.** A consequential but poorly supported claim is an important uncertainty to investigate. Promoting it on importance is not, by itself, suspicious behavior. A clear articulation can still have weak evidence; a well-supported claim can be peripheral.

**One shared document.** Readers see the same published order for a given document revision. A vote expresses a judgment, not an immediate instruction to move a card one slot. There are no personal document orderings. A pending update may be held while someone reads an earlier revision.

**Default reading view.** Show the most important ideas first and each row’s lead card. Keep alternatives collapsed. Both opposing cases receive fair representation; their evidence need not be equally strong. Leftmost means preferred only *within an idea’s alternatives*, never that the leftmost option is better.

## 3. The card experience

### Collapsed card

Present one concise claim, normally one or two sentences. Necessary qualifications take priority over a rigid character limit. The surrounding row owns importance controls. The card exposes:

- its claim;
- a credibility indicator and compact participation count, or a value-judgment marker;
- a linked-source affordance and count;
- a stack edge and count indicating alternatives.

Opening the card reveals its explanation and evidence. Opening the stack reveals alternatives. These actions must be distinguishable.

### Comparing alternatives

Keep the idea and option context visible. Show enough of the competing cards to compare their wording and qualifications. Preference actions are distinct from importance arrows. Navigation through alternatives never casts a vote.

A voter can prefer a version, revise that preference, or suggest a new articulation. A contribution that introduces a different underlying reason belongs in a new row.

### Expanded card

Show the exact claim, explanation, evidence mappings, assessment controls, and revision history. Each evidence mapping contains:

1. Source identity and a usable link or locator: page, section, table, or relevant passage.
2. The relevant finding, accurately quoted or paraphrased.
3. The specific premise it supports and why.
4. What remains uncertain, including material limitations or counterevidence.

A linked source is not automatically supporting evidence. Credibility assessment happens here, after the evidence is available for inspection. Opening a source does not automatically mark it checked or cast a vote.

## 4. Credibility: exact meaning

For the initial experiment, the indicator shows the **unweighted share of current human assessments that say “Supported as worded.”**

`Supported assessments / (Supported + Not supported as worded assessments)`

Each participant has one active assessment per card revision and can change or withdraw it. “Haven’t assessed this” skips voting and does not enter the denominator. “Not supported as worded” means the evidence does not justify the factual claim; it does not necessarily mean the claim is false.

A Supported assessment requires at least one cited source to inspect and applies to all material factual premises. A source supporting one part does not validate the rest. Missing evidence can be challenged. Pure value judgments receive a distinct marker and no factual credibility vote. Mixed cards identify their factual premises; evidence assessment does not certify their values or conclusions.

The compact ring is the current design candidate. A bar may be compared in the prototype without changing the underlying measure.

| State | Required interpretation |
|---|---|
| No assessments | Unreviewed; visually distinct from 0% supported |
| Few assessments | Proportion and count remain visible, with a distinct low-participation treatment |
| More assessments | Same proportion calculation; count remains available on the card |
| Value judgment | No credibility score |
| Material revision | Fresh assessment required; previous results remain in history |

For fixtures, “few” means fewer than five assessments. This is a display experiment, not a validated confidence threshold. Three of three and one hundred of one hundred must not appear equally established. The indicator reports judgments, not a probability that the claim is true.

**Cross-side review is separate.** Where participants voluntarily state their perspective, show the assessment breakdown separately. Participation from multiple options does not itself mean agreement. No perspective weighting affects the initial ring, and missing cross-side participation is not a negative assessment.

Community Notes uses historical rating patterns to identify differing perspectives. Self-declared options are a different proxy whose usefulness remains a hypothesis. [Reference](https://communitynotes.x.com/guide/en/contributing/diversity-of-perspectives)

## 5. Identity, grouping, and change

**Same-idea rule:** cards share a row when they express the same underlying reason for the same option. Equally important but unrelated reasons remain separate. Qualifications may refine an idea; a different premise or inference may require another row.

Examples: “Sunday hours improve access for weekday workers” and a carefully qualified version of that reason can share a row. “Sunday opening has low staffing costs” is a separate reason, regardless of its importance score.

The following are **provisional rules for the first collaborative trial**. The card prototype must explain their effects, but need not implement collaborative governance.

| Change | Identity, votes, and credit |
|---|---|
| Add an alternative | Keep the idea identity and its importance votes. The new card starts with no preference or credibility assessments. |
| Group duplicate rows | Retain the oldest idea identity and redirect the others. Keep all cards and attribution. Combine importance votes once per participant; identical votes deduplicate, conflicting votes become pending reassessment. Preserve assessments on unchanged cards. |
| Split a distinct reason into a new row | Give the new idea its own identity and no importance votes. Do not copy the original idea’s votes. Reset the moved card’s preference because its comparison context changed; retain credibility only if its claim and evidence are unchanged. |
| Change a card materially | Keep its history and stable link; create a new revision. Reset current preference and credibility assessments for that card. Retain idea importance only if the underlying reason remains the same. |
| Correct formatting or a typo | Retain assessments only when meaning and evidence are unchanged. Record the edit. |

Grouping and splitting require a preview and a reversible history entry. Undo restores the prior structure and vote associations; later contributions must remain preserved. No change manufactures votes or duplicate contribution credit. Record authorship and provenance; points are deferred.

Changes to evidence support or limitations count as material changes. A structural action that changes the underlying idea also requires its importance to be reassessed.

## 6. Visual language and reading stability

Position and shape carry the primary meaning. Brief labels, onboarding, tooltips, and accessible descriptions clarify unfamiliar actions. The canvas stays focused on content; comprehension determines whether controls need more explanation.

- **Importance:** up/down controls clearly belonging to the row.
- **Preference:** horizontally associated actions within the alternatives view, explicitly distinguished from navigation and importance.
- **Credibility:** a persistent indicator that opens the relevant evidence and assessment context.
- **AI:** a separate light-blue attribution accent. An AI assessment opens its conclusion, basis, and limitations; “AI checked” alone is insufficient.

Color is never the only carrier of meaning. Support keyboard interaction, visible focus, screen-reader labels, and reduced motion.

On phones, alternatives open by tapping the stack. Full-product option switching may use swiping, so a swipe must not also cast a vote or ambiguously select an alternative. The next prototype must be usable without drag gestures.

**Updates never move active content automatically.** Scores may change, but the reader’s layout remains stable until they explicitly apply the available order. Preserve the selected card and context when applying it. In a later batched system, a tick makes a new shared order available; it does not override an active reader’s position. Cadence and a countdown’s engagement value are separate experiments. No five-minute default is committed yet.

## 7. Experiment sequence and scope

### Now: card interaction prototype

Use a small fixture, local state, and labeled example assessments. Test whether people can read, compare, inspect, and contribute at the card level. Section 9 is the implementation brief.

### Next: two small collaborative trials

Retain the two audiences: a few private groups, and one invite-only public community of strangers. Use the same fixed baseline initially:

- One person, one equally weighted active vote per target and judgment; votes are reversible.
- Importance is +1/−1 per idea; preference is +1/−1 per card. Each score is its own vote sum. Changing a vote replaces it; withdrawal removes it. Participants can assess multiple alternatives.
- Assessed items sort by their respective net scores. Ties preserve the existing order. Items with no active assessments remain at the end until assessed.
- Anyone in the trial can contribute and assess any option. Declaring a supporter identity is optional and does not unlock voting rights.
- A designated moderator handles reported abuse and approves structural proposals; ordinary argument ordering remains vote-driven.
- Human vote counts remain separate from AI output. AI starting votes and reputation weighting are off.
- Readers explicitly apply available ordering updates.

Moderator actions have reasons, attribution, and an audit trail. The trial requires reporting, removal/restoration, and structural rollback. Disagreement with AI or high importance paired with low credibility is not an abuse trigger.

### Later experiments

Public discovery and Hot; return visits and card sharing; curated starter topics; copies; threaded comments and response links; supporter-only ordering; stewardship and other editorial modes; reputation and rewards; cross-side weighting; AI ranking priors; automated integrity tools; tick timing; private decision records.

These remain hypotheses or product extensions. Test influential mechanisms separately before combining them. Alternative editorial modes must disclose when order is curated rather than vote-driven. Column shuffling, if tested, stays stable per viewer per steelman rather than changing every visit.

AI drafting can supply a labeled starting point. People may add local knowledge, evidence, better qualifications, and judgments about what matters. Whether this improves the document must be measured; agreement with an AI draft is not evidence of anchoring, and divergence is not evidence of improvement.

## 8. What success means

The central outcome is a clearer, better-supported account of each option’s strongest case.

| Question | Evidence to collect |
|---|---|
| Do people separate the three judgments? | Controlled tasks where importance, articulation quality, credibility, and personal agreement deliberately differ; ask what each action changes and why. |
| Can people assess evidence appropriately? | Cases with direct support, overclaiming, insufficient evidence, and pure values; observe assessment and the explanation behind it. |
| Does the document improve? | Reviewers, blinded to AI/human origin and before/after status, assess support, precision, completeness, and fair representation. |
| Does AI anchoring affect outcomes? | Compare equivalent tasks with different initial orders or AI-visible/hidden conditions; assess both behavior and resulting quality. |
| Is collaboration productive? | Useful revisions, correct grouping, attribution preserved, and contributions across options. |
| Does the public loop work? | Unprompted return and useful contribution in the later community trial; distinguish quality improvements from activity alone. |

Low vote correlation is not a comprehension metric. Source counts are not evidence-quality metrics. Divergence from AI is descriptive until tied to independently assessed quality. Retention, sharing, and resistance to coordinated voting cannot be established by the card prototype.

## 9. Next prototype brief: the card

**Decision to make:** can a new reader distinguish importance, articulation preference, and credibility, then act on the intended object with little instruction?

### Smallest useful scene

One question with two clearly named options. Show three idea rows in the focused option and enough opposing-case context to establish that this is a debate. Give one row three alternative cards. An isolated card is insufficient to explain relative position.

Use an approachable topic such as “Should our library open on Sundays?” Include controlled claims and short evidence packets. Any invented data or assessments must be plainly labeled as examples. Keep fixtures identical when comparing control treatments.

### Required interactions

1. Read a collapsed card and distinguish opening its details from opening its alternatives.
2. Cast and undo an importance vote; show acknowledgement without immediately moving the row.
3. Open alternatives, compare them, cast or change a preference vote, and close them. Distinguish your active vote from the aggregate result.
4. Open evidence, trace a finding to a premise and limitation, assess credibility, change/withdraw that assessment, or skip.
5. Suggest an alternative articulation with a short explanation; preview it as a new card while keeping the idea’s identity.
6. Inspect a material revision, its prior history, and the request for fresh assessment.
7. Simulate a pending shared-order update and explicitly apply it without losing context.

The simulation tests interface behavior, not an aggregation algorithm. Use the trial’s separate positive/negative scores for preference and importance, with distinct controls. Keep navigation arrows neutral. Prototype one primary control treatment; compare another only where observations identify confusion.

### Required fixtures and states

- Important if true, with weak or inconclusive evidence.
- Well-supported but peripheral to the decision.
- A fluent version that overclaims beside a qualified version better matched to the evidence.
- Unreviewed, zero-supported, and split-assessment factual cards.
- The same support proportion with few and many assessments.
- A pure value judgment and a mixed factual/value card.
- A material revision whose old credibility does not carry forward.

Include empty evidence, a broken/unavailable source state, and an optional AI-assessment detail fixture. An unavailable link is not proof that a claim is false; show that limitation and allow the reader to skip or challenge the support. Do not call live AI or populate the scene with fabricated real users.

### Deliberately outside this prototype

Feed, authentication, backend architecture, real-time collaboration, moderation tooling, reputation, AI weighting, full document navigation, and live grouping/splitting. Explain grouping in the contribution flow through a small preview if needed; reserve drag/merge governance for the next stage.

### Review and completion criteria

Run a small formative round with prospective public users and group participants, then revise and repeat. Proposed gates below guide iteration; small samples do not establish population-level success:

- At least 80% correctly identify the target and meaning of all three judgments without facilitator coaching after the brief in-product orientation.
- At least 80% complete comparison and evidence-assessment tasks and give a rationale consistent with the supplied examples. Personal stance is not scored as right or wrong.
- Participants can distinguish unreviewed from poorly supported, low participation from broad participation, and skipped assessment from a negative vote. Repeated confusion blocks progression.
- All required flows work with keyboard and touch; meaning survives loss of color and reduced motion.
- Opening, closing, and applying updates preserve context. No active card moves before an explicit update action.

Observe time and hesitation, but do not impose a ten-second target on evidence assessment. Record comprehension errors, evidence use, accidental actions, and recovery. The output is a tested card interaction and a short findings log, followed by a decision to refine it or proceed to the collaborative trial.
