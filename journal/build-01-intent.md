# Build 1 — Product Page & Prototype

**Date:** November 5, 2026 (New York time) · **Builder:** Kieran LaMee · **Pod:** 6

## Delivered in this build

- Created `building-with-ai-f26/kfl8095-steelman` from the public class template.
- Preserved the supplied runnable prototype, editable source fragment, and original PRD v0.4 without changes.
- Reframed the class PRD around a reachable Pod 6 tester and one workflow: read, compare, inspect, improve.
- Added an editorial Product Page, actual prototype screenshot, run instructions, and verification notes.
- Kept example votes separate from user evidence. No user study has been run.

## Scope and learning

The broader public-forum concept remains in the original PRD. The class brief's three non-goals defer the full social network, reputation/governance engine, and automated truth judge. The prototype tests the card interaction using a fictional library question.

Technical observations: the static prototype runs without a backend or model call; publishing a static page does not make local interactions collaborative; Git stores history while GitHub hosts the repository and Pages serves `docs/`.

Known limits: fonts/icons load externally; the export stores state locally in the browser, with no server synchronization; no persistent collaboration or material-revision history. The participant comprehension hypothesis remains untested.

## Time and costs — builder-reported

- About 2 hours brainstorming, plus 2–3 hours prototyping and working on the PRD: approximately 4–5 active hours before this packaging session.
- About two five-hour ChatGPT usage windows, reported separately; not counted as ten additional active hours.
- Work used the existing ChatGPT Pro subscription. No incremental API or hosting charges reported. Subscription allocation to this project is unknown, not zero.
- This packaging/publication session adds time that has not yet been tallied by the builder.
- Prototype runtime model/API spend: $0; the app makes no model/API calls.

## Verification

See `tests/build-1-manual.md`. Agent browser checks are functional checks, not pod critique or real-user research.

## November 6 — Product Page revision

Kieran requested much less explanatory text and a sparse black-and-white design matching the prototype. Reduced the page to about 220 words, retaining the required user, before/after workflow, core workflow, three non-goals, screenshot, and build log. Removed colored panels and explanatory sections. Kept the original prototype intact.

## November 6 — Card disclosure revision

Kieran asked for expanded cards to retain their identity and keep neighboring versions visible. Replaced the separate reading panel with a disclosure below the same claim and footer, with a visible expand/collapse chevron. Version rows stay horizontal on narrow screens. Added subtle grayscale paper grain, rounded corners, and layered shadows. Updated the screenshot and added a source-to-export sync script. The original supplied prototype remains in Git history; the long PRD is unchanged.

Browser checks covered fixed card-face geometry, neighboring cards, keyboard collapse/return, source details, assessment/preference withdrawal, suggestion validation and addition, browser-local persistence, and layouts at 1280, 390, and 320 px. These are agent checks, not participant research. Builder time for this revision has not been tallied.

## Remaining builder tasks

- [ ] Create a PostHog account; install and verify analytics in Build 2.
- [x] Meaningful commits pushed on November 5 (initial build) and November 6 (editorial redesign). Continue this cadence each week.
- [ ] Ask a Pod 6 classmate to try the prototype and record actual feedback.
- [ ] Read the Week 1 memo and complete Terminus Episodes 1 and 2.
- [ ] Submit https://building-with-ai-f26.github.io/kfl8095-steelman/ in Icerynk's Link field, with https://github.com/building-with-ai-f26/kfl8095-steelman in the note, before November 9 at noon New York time.
- [ ] Rehearse the two-minute demo for November 10.

## Two-minute demo outline

1. **0:00–0:20:** The problem: useful arguments are scattered, repeated, or confused with agreement.
2. **0:20–0:50:** Open the stack. Compare “everyone” with the qualified “some” version; explain wording preference.
3. **0:50–1:20:** Open the survey evidence. Explain the voluntary sample limitation and assess support as worded.
4. **1:20–1:45:** Show the suggestion flow and how a new version starts unreviewed.
5. **1:45–2:00:** Explain the next question: can a podmate distinguish all three judgments without coaching?

No Terminus completion, pod feedback, or personal learning reflection has been invented on the builder's behalf.
