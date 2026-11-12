# Build 1 verification record

Date: November 5, 2026 (New York time). Checks performed by the coding agent in a browser, not by research participants.

## Supplied prototype checks completed before packaging

| Check | Observed result |
| --- | --- |
| Initial board | Two options and six ideas; example claims, evidence, and votes labeled |
| Importance upvote and withdrawal | First idea changed 42 → 43 → 42; row stayed in place |
| Open alternative stack | Three versions; 75%/32, 0%/8, and 75%/4 with low-participation labeling |
| Wording preference | Qualified version changed 26 → 27; evidence support stayed 75%/32 |
| Open source | Survey finding, supported premise, and voluntary-sample limitation were inspectable |
| Support assessment and withdrawal | 24/32 (75%) → 25/33 (76%) → 24/32 (75%) |

## Final packaged checks

| Check | Observed result |
| --- | --- |
| Suggestion validation | Empty form reports that a claim and explanation are required |
| Preview and add version | Draft text and explanation preview correctly; fourth version starts at preference 0, unreviewed, with no sources |
| Idea identity retained | Original idea retains importance 42 after adding a version |
| Keyboard Escape / close | Returns to the diagram and restores focus to the origin control |
| Unavailable source | Explanation says missing evidence does not prove falsity; Supported is disabled; challenge remains available |
| Explicit order update | Button moves study and evening ideas above their former leaders using example scores 51 and 45 |
| Reload | Added fourth version and applied order restored from browser-local storage; this corrected an initial assumption that refresh reset the demo |
| Narrow prototype | At 390 px, options stack vertically and source evidence remains readable |
| Product Page | Visually checked at 390 px and 1280 px; no horizontal page overflow; screenshot loads |
| Product navigation | PRD anchor changes the URL; all internal anchor targets exist |

Repository checks passed: the initial 16 Product Page links/assets resolve to existing local targets or external URLs; internal anchor targets exist; `git diff --check` is clean. The supplied prototype HTML, editable source, and original PRD match the ZIP contents byte-for-byte. A targeted scan found no private-key/token patterns or machine-local paths in the published files. Production verification: GitHub Pages reported the November 6 redesign build successful. The public Product Page loaded with its screenshot, and its prototype link opened the working six-idea board.

## November 6 revision

Rechecked the simplified Product Page at 390 px and 1280 px. The screenshot loads, the page has no horizontal overflow, and all three non-goals remain present. Corrected the mobile sentence spacing where the desktop line break is hidden. Rechecked all 11 revised page links/assets and the three non-goals; all local targets exist. Prototype behavior is unchanged from the checks above.

## November 6 — Card disclosure revision

| Check | Observed result |
| --- | --- |
| Expand a version | Claim and footer keep identical screen coordinates, width, font, and line height; only the card extends downward |
| Neighboring versions | Opening the middle card leaves both neighbors visible and collapsed; switching cards closes the previous disclosure |
| Keyboard collapse and return | Enter collapses the chevron; Escape closes the row and restores the originating board control |
| Source details | Survey finding, supported premise, and limitation remain readable; opened source state survives navigation and reload |
| Assessment and preference | Support 75%/32 → 76%/33 → 75%/32; wording preference 26 → 27 → 26; navigation casts no vote |
| Suggestion | Empty validation works; preview/add produces a fourth, unreviewed card with preference 0 and no sources; reload restores it |
| Unavailable evidence | Supported remains disabled; challenge remains available |
| Value judgment | Context is shown without factual assessment controls |
| Responsive row | At 390 px the active card has neighboring peeks and horizontal scrolling; no horizontal page overflow at 390 or 320 px |
| Browser errors | No error-level console entries during the revised workflow |

The source and standalone export are now intentionally revised together. Initial byte-for-byte preservation above describes the original packaging, not this revision.

JavaScript syntax and `git diff --check` passed. The embedded source matches the editable fragment exactly, and running the sync script again produces no changes.

## November 7 — Articulation axis revision

Checked by the coding agent at 1280 px and 390 px. Clicks were driven with scripted DOM events on a direct copy of the source fragment, because pointer clicks through the sandboxed standalone wrapper did not reach the iframe reliably in the agent's browser pane.

| Check | Observed result |
| --- | --- |
| Generated labels removed | No version labels (Qualified, Broader claim, More specific) or idea titles appear; screen-reader labels use the claim text |
| Unfold in place | Stack opens inside its column; column widens, the other column narrows; the lead card stays first and wires stay connected; no dialog or backdrop |
| Articulation axis | Versions ordered by shared preference (26, 8, 4); “best articulation ↔ weaker” arrow above the row; it opens with the row, and the importance vote stays level with the lead card |
| Shared vote control | Importance (vertical) and articulation (horizontal) use the same element; articulation vote 26 → 27, own vote does not reorder cards |
| Importance axis | “more important ↕ less important” arrow between columns; on phones, “↑ more important” under each column head. Both axes use light lowercase italic serif labels and swept hairline arrowheads |
| Expand in row | Only the chosen card shows context and evidence; assessment 0%/8 → 0%/9 → 0%/8 |
| Suggest a version | Dashed + card opens an inline draft; empty submit marks both fields and announces the requirement; adding produces a fourth card with preference 0, unreviewed, no sources; idea keeps importance 42 |
| Single-version ideas | Dashed stack edge opens the row with the draft card focused; Escape folds it back |
| Escape order | Draft → expanded card → fold; focus returns to the paper stack |
| Explicit order update | Study moves above access and back |
| Narrow | At 390 px the row scrolls sideways with the next card peeking; no horizontal page overflow |
| Browser errors | No console errors |

### Design tokens and specimen

| Check | Observed result |
| --- | --- |
| Revert | After removing the topography and palette work, the regenerated export matched the earlier export byte-for-byte |
| Shared tokens | `docs/design/tokens.css` holds all prototype color, type, and texture values; the sync script inlines it and is idempotent |
| Prototype | Renders as before at 1280 px; no console errors |
| Product page | Links the tokens; ink and muted text resolve to the same colors as before |
| Specimen | `docs/design/` loads the prototype's own stylesheet; axes, vote states, credibility marks, and cards render. Changing a swatch recolors components live and lists the override; Reset restores the original values |

### Specimen studies (interview decisions)

| Check | Observed result |
| --- | --- |
| Board study | Each column draws one hex grid; cell size follows row importance (42/31/12 and 39/25/8) and darkness steps down across the unfolded row's versions (26/8/4) |
| Live votes | Voting importance on a row changed its score (12 → 13) and the texture redrew, without animation |
| Header variants | Current, Inverted (near-black box, white serif), and Sharp + ruled (square corners, 4px top rule) switch correctly |
| Tuning | Cell size and contrast sliders redraw the grid and appear in the copyable overrides; Reset restores them |
| Credibility study | Marks tint rose (0%) → gray (50%) → navy (100%); unreviewed and value judgments stay gray |
| AI study | Ochre dashed card with dotted texture and a "Suggested" tag; dotted ochre underline for an AI phrase |
| Widths | No horizontal overflow at 390 px or desktop width; no console errors |

Follow-up: headers locked to inverted (toggle removed). Hexagons default to outlined, with a Filled toggle for comparison. A new articulation-range control (default 60%) keeps the weakest version at 60% of the row's tone, and the best version matches single-version rows. Checked at 1280 px; no console errors.

Steeper importance gradient: sizes now run from pinpoints (least important idea on the board) to touching cells (most important), on a tunable curve (default 1.8), with tone following slightly. Checked at 1280 px; no console errors.

Subtlety pass: hex outline opacity lowered from 0.3 to 0.12; axis labels darkened to #555 and axis lines/arrowheads to #8a8a8a (also applies to the prototype's axes through the shared tokens). Checked at 1280 px; no console errors.

Second subtlety pass: hex opacity 0.12 → 0.07; articulation fade steepened so the weakest version drops to 15% of the row's tone (was 60%). Checked at 1280 px; no console errors.

Third pass: hex opacity 0.07 → 0.10. Importance arrow moved inside the left column's left edge (the middle gap no longer holds it). New "Credibility icon options" table compares a support pie, a support meter, and filled Phosphor seal, shield, and check-circle icons across 0–100%, few, and unreviewed; Phosphor options switch to a warning glyph below 50%. Checked at 1280 px; no console errors.

Evidence mark decision: the support meter (option B) now appears on every specimen card; the scale is red → gray → green (navy dropped). 0% shows four empty red cells, 100% four filled green cells, few assessments use dashed empty cells, unreviewed is an empty gray meter. Checked at 1280 px; no console errors.

Axis legibility: each axis (labels, line, and arrowheads) now sits in one paper box with a hairline border, replacing separate label boxes. This lives in the prototype's shared stylesheet, so the prototype's axes get the boxes too. Checked on the specimen at 1280 px and on the prototype; no console errors.

Axis legibility comparison: the board study has an Axes toggle with five variants: Box (shared prototype style), Halo (default; regular-weight labels with a paper text halo, haloed line and arrowheads), Clear lane (hexagons skipped within ~5 px of each axis, fading out over 8 px), Outside (vertical axis moved outside the left column onto plain paper; texture cleared in a band behind the horizontal axis), and Fade (hexagons fade to zero within 30 px of each axis). Each was checked at 1280 px with no console errors and no horizontal overflow.

Decision: Halo. It is now the shared axis style (prototype and specimen); the Axes toggle and the other four variants were removed.

Value judgment mark: replaced the scales icon and "Value judgment" text with a gray, unsegmented meter-shaped bar with a center mark and the word "Value" (tooltip and screen-reader label keep the full meaning). Checked in the credibility row and on the board study card; no console errors.

These are design studies on the specimen only; the prototype is otherwise unchanged.

### Studies merged into the prototype

| Check | Observed result |
| --- | --- |
| Headers | Question and option headers render inverted (near-black, white serif) |
| Support meter | Every card shows the four-segment meter: 75%/32 three green cells, 0%/8 four empty red cells, 75%/4 dashed empty cell, unreviewed empty gray meter, 100%/18 four green cells |
| No value judgments | The library-purpose card is an ordinary claim: unreviewed, evidence panel with "No sources yet", Supported disabled, Not supported available; a No assessment shows 0% · 1 · few and withdraws cleanly. No "Value judgment" text remains |
| Importance axis | Runs down the left column's left edge; the gap between columns is narrower and empty; hidden on phones, where each column keeps its "more important" label |
| Hex texture | Each column draws a faint outlined hex texture; an importance vote and an articulation vote each redraw it |
| Unfold and fold | Stack unfolds with the texture following the widened column; Escape collapses the expanded card, then folds, returning focus to the stack |
| Widths | No horizontal overflow at 390 px; standalone page loads at 1280 px; no console errors |

Interactions were scripted on a direct copy of the synced source; the sandboxed standalone page was checked visually.

Follow-up: connector wires darkened (`#aaa` → `#767676`); the canvas briefly used a graph-paper background, then a mottled paper texture, and now quiet white topographic contours on warm gray (tightened to a 480 px tile with 22 levels for a denser map), then softened twice: background `#d9d8d4` → `#e0dfdb` → `#e7e6e3` and line opacity 0.8 → 0.6 → 0.45 (a seamless generated tile embedded as a token; axis halos and column panels share a new panel color) from shared tokens, on the prototype and the specimen. Checked at 1280 px; no console errors. Drop shadows added from elevation tokens to headers, option columns, cards, vote controls, and the fold button; the unfolded row's scroll area got extra padding so card shadows are not cut off at its edges. Shadows were later strengthened (roughly double the opacity) so they read on the contour canvas. Checked on the standalone page at 1280 px; no console errors.

### Logo

The honeycomb mark replaced the black "s" square on the product page, the prototype header, and the specimen header, and is the favicon on all three (as a data URI, which the prototype's security rules allow). Checked at 1280 px: the mark sits beside the wordmark on each page, the dashed cell's corners are even, and there are no console errors.

Saved state from the previous build (version 2) restores votes and added versions but starts with every stack folded.

## November 7 — Editing foundations (batches 0 and 1)

Checked by the coding agent at 1280 px and 390 px. Most interactions were scripted on an unsandboxed copy of the synced page; settings persistence was checked with pointer clicks on the sandboxed standalone page.

| Check | Observed result |
| --- | --- |
| One saved document | The question, options, arguments, versions, and sources load from a single saved document (state version 4); the board renders as before |
| Add a version (regression) | Adding to the study idea produces card `v1`, expanded, at the end of the row; importance stays 31. The old five-version limit is gone |
| Version 3 migration | Saved state with two added versions restores them as `v1`/`v2`; the articulation vote (1), the No assessment, the expanded card, and the access importance vote (43) all follow them |
| Question details | "Posted by Kieran LaMee · Nov 5, 2026 · Pod 6 · Building with AI · Organization" in light type under the title |
| Settings drawer | The cog opens a right-hand panel; on desktop the board reflows beside it; focus moves to the question field |
| Rename question | Typing updates the title live; an empty question shows a red edge, keeps the last title, and reverts when the field loses focus |
| Organization rule | Choosing Personal makes the question Private and disables Organization visibility |
| Persistence | Choosing "Anyone with the link" survived a reload of the standalone page; the drawer starts closed |
| Escape | Escape closes the drawer first and returns focus to the cog |
| Reset | The first click arms the button; the second restores the example question, ideas, and votes |
| Narrow | At 390 px the drawer covers the full width; no horizontal overflow with it open or closed |
| Browser errors | No prototype errors in the console |


## November 7 — Comments (batch 2)

Checked by the coding agent at 390, 1024, 1280 and 1400 px. Thread actions were scripted on an unsandboxed copy of the synced page; placement and persistence were also checked with pointer clicks on the sandboxed standalone page.

| Check | Observed result |
| --- | --- |
| Icons and counts | Question 2, "Sunday hours…" 2, staffing 1; Keep current hours shows none (its only thread is resolved). Counts include replies |
| Open | Clicking an icon opens Comments with the item quoted at the top and a dark ring around it; focus moves to the comment box. Clicking the same icon closes it |
| Add | An empty comment is refused with a red edge; ⌘/Ctrl + Enter posts as "You · Today"; count 2 → 3 |
| Reply | Reply opens an inline box; Escape cancels it (panel stays open, focus returns to Reply); posting a reply raises the count to 4 |
| Resolve and reopen | Resolve drops the count to 1 and folds the thread under "1 resolved"; Reopen restores 4 |
| Delete | Only your comments offer Delete. Deleting a reply removes it; deleting your first comment that has replies leaves "Comment deleted." and keeps the reply |
| Escape | Closes the panel and returns focus to the icon that opened it |
| Persistence | A comment on Keep current hours survived a reload of the standalone page; saved state without comments gets the example comments |
| Placement | The standalone page grows its frame to fit the content, so a screen-fixed panel was off-screen after scrolling. The panel now anchors level with its subject: beside the board at 1200 px and up; below that it floats on the opposite side (no overlap with the card, option, or question at 1024 px), or just below wide subjects and on phones (8 px gap at 390 px). The prototype grows if the panel runs past its end |
| Narrow cards | Footer text no longer overlaps the comment icon; very narrow cards drop the count, then the percentage (meter and tooltip remain) |
| Browser errors | No prototype errors in the console |

## November 7 — Add an argument (batch 3)

Checked by the coding agent at 1280 px and 390 px; scripted on an unsandboxed copy, with the add-and-reload flow repeated by pointer and keyboard on the sandboxed standalone page.

| Check | Observed result |
| --- | --- |
| Slot | Each column ends with a dashed "Add an argument" card, aligned with the cards above it (vote lane left, stack lane right) |
| Draft | Clicking opens a draft card in place with the argument and optional context; focus moves to the argument field |
| Validation | An empty argument is refused with a red edge and announced; context is optional |
| Escape | Closes the draft, keeps its text, and returns focus to the dashed card; reopening restores the text |
| Add | The new row joins the bottom of its column with importance 0, unreviewed, no sources, a dashed stack edge, expanded to show its context (or "No context yet."); the wire connects to it |
| Follow-on | Importance vote 0 → 1 works; the dashed stack edge opens a version draft for the new row |
| Persistence | A new Keep-current-hours argument with context survived a reload of the standalone page |
| Narrow | At 390 px the draft card matches the cards' width and left edge; no horizontal overflow |
| Browser errors | No prototype errors in the console |

## November 7 — Card menu: edit, delete, undo (batch 4)

Checked by the coding agent at 1280 px and 390 px; scripted on an unsandboxed copy, with edit-and-reload and delete-and-reload repeated by pointer and keyboard on the sandboxed standalone page.

| Check | Observed result |
| --- | --- |
| Menu | A quiet ⋯ in each card's top-right corner opens a menu under it; it says who wrote the version. Arrow keys move and wrap, Escape closes and returns focus to ⋯, a click outside closes it |
| Others' versions | "Suggest a revised version" is available; Edit and Delete appear unavailable ("Only the author can…") and do nothing when chosen |
| Suggest a revised version | Unfolds the row with a draft prefilled from that wording and focus in it; an existing draft in that row is kept, not overwritten |
| Edit (your version) | Opens in place with the wording and context; empty wording is refused; whitespace is tidied; saving updates the card and focus returns to it. Escape discards changes and returns focus to ⋯ |
| Delete a version | In a two-version row, deletes only your version; the row stays open with an Undo bar under it |
| Delete an argument | The menu says "Delete argument" for an only version; the row is removed and the Undo bar sits where it was; focus moves to Undo |
| Undo | Restores the card, its row, its articulation vote (1), and its comment (count 1); the bar leaves after ten seconds without re-rendering the board |
| Persistence | An edit and a later delete each survived a reload of the standalone page; the Undo bar does not persist |
| Narrow | At 390 px the menu stays on screen (75–325 px); ⋯ grows to 40 px on touch screens; no horizontal overflow |
| Browser errors | No prototype errors in the console |

Not reachable in this single-person prototype: editing or withdrawing a version that other people have voted on (example cards belong to others; your own cards have only your own votes). The intended rule, a revised version instead of an edit once others have voted, is described in the plan but not built.

## November 7 — Evidence: add, edit, remove, report (batch 5)

Checked by the coding agent at 1280 px and 390 px; scripted on an unsandboxed copy, with add-and-reload repeated by pointer and keyboard on the sandboxed standalone page.

| Check | Observed result |
| --- | --- |
| Add a source | "Add a source" under the evidence list opens a form (source, where to find it, what it shows; supports and limits optional) with focus on the first field. Empty submit marks the two required fields. Enter in a one-line field saves |
| After adding | The source is listed and open, marked "Added by you", with Edit, Remove from this version, and Report as unavailable; the paperclip count goes 0 → 1; "Yes" becomes available on a card that had no sources |
| Edit | The form opens prefilled; adding a limit shows it under the source |
| Others' sources | Only "Report as unavailable" is offered |
| Report and withdraw | Reporting marks the source Unavailable; on a card with another available source, "Yes" stays enabled. Reporting the shared survey from one card marks it on every version citing it and disables "Yes" on a version whose only source it is; "It opens again" restores both |
| Evidence changed | Adding a source to the staffing card (20 assessments) shows "The evidence changed after some people assessed this wording." |
| Remove and undo | Removing your source drops the count 3 → 2, keeps the card expanded, and shows "Source removed. Undo" under the row; Undo restores it and focuses the source |
| Escape | Closes the source form first; collapsing the card or opening another closes it too |
| Persistence | A source added on the standalone page survived a reload, still open |
| Narrow | At 390 px the form stays inside the card; no horizontal overflow |
| Browser errors | No prototype errors in the console |

## November 7 — Move and split versions (batch 6)

Checked by the coding agent at 1280 px on an unsandboxed copy (scripted). Moves and splits change the same saved document as earlier batches; they were not separately reloaded on the standalone page.

| Check | Observed result |
| --- | --- |
| Menu | Your version's menu adds "Move to another argument" and "Split into its own argument"; Split is unavailable for an only version. Others' versions show "Move or split" as unavailable ("Suggest it in a comment") |
| Pick mode | A banner explains the choice; the three other Open-on-Sundays rows show "Move here"; the source row recedes; the other option shows no targets; focus goes to the first target |
| Escape | Leaves pick mode and returns focus to ⋯ |
| Move | The version joins "Sunday hours…" (now four versions), which unfolds with the moved card expanded; its now-empty row disappears; the target keeps importance 42; Undo restores both rows and focuses the card |
| Split | From the four-version row, the version becomes a new row at the bottom (importance 0), keeping its comment; the Undo bar sits under the new row; Undo puts it back in the row |
| Browser errors | No prototype errors in the console |

## November 7 — Add, rename, and remove options (batch 7)

Checked by the coding agent at 1280 px, about 1000 px, and 390 px; scripted on an unsandboxed copy, with add-and-reload repeated by pointer and keyboard on the sandboxed standalone page.

| Check | Observed result |
| --- | --- |
| Layout | The board builds its columns from the options (2–4, with 32 px gaps) instead of assuming two. The importance axis stays on the first column; wires reach every option header |
| Add | The dashed + after the last column adds an option with its name field focused; Enter saves and moves focus to its "Add an argument" slot. Escape, or leaving it empty, removes the new option. At four options the + disappears |
| Rename | ⋯ → Rename option selects the current name in place. Enter saves; Escape and an empty name keep the old name |
| Delete rules | "Delete option" is unavailable for options with arguments ("Move or delete its arguments first.") and when only two options remain ("A question needs at least two options.") |
| Delete and undo | Deleting an empty option shows "Option deleted. Undo" across the board (its column is gone) and brings the + back; Undo restores it and focuses its ⋯ |
| Unfold | With four options, an unfolded row widens its column (about 405 px versus 156 px for the others) |
| Phone | At 390 px, options stack full width with no gap columns; "Add an option" is a full-width dashed bar; no horizontal overflow |
| Persistence | An option added on the standalone page survived a reload |
| Browser errors | No prototype errors in the console |

Known limit: three or more options at about 1000 px squeeze cards to roughly 100 px of text. Horizontal board scrolling (with wires following) would be the likely fix.

Question details restyle: each detail now has its own treatment: an initials avatar with "Posted by **name**", an italic serif date with a calendar icon, the organization in tracked capitals ("POD 6") with its course name muted beside it, and visibility as an outlined pill with its icon (hover shows what it means). Hairlines replace the dots on desktop; on phones the line wraps without dividers. Checked at 800 px and 390 px; no horizontal overflow, no console errors.

## November 7 — Clarity and concision pass

From a review of every feature. Checked by the coding agent at 800, 1024, and 390 px on an unsandboxed copy (scripted); vote labels were checked by freezing their animation midway.

| Change | Observed result |
| --- | --- |
| One way to expand | The meter and source count are information only (with titles); a card's buttons are ⋯, its wording, comments, and the chevron. A card with no sources shows no paperclip |
| Quiet empty comments | On pointer devices, a card's comment button is hidden until hover or focus when it has no comments |
| Version count | Stacks with more versions show a small count (3 on "Sunday hours…") |
| Permissions | The two permission selects are gone; Settings shows "Who can contribute and vote" with a Coming soon tag |
| Question line | "Posted by" dropped; organization is "POD 6"; the pill reads "POD 6 only" when visible to the organization, otherwise the line shows "POD 6" and "Private" or "Anyone with link"; Personal shows only "Private" |
| Backs up | Source label "Backs up"; vote heading "Does the evidence back this wording?"; form field "What it backs up" |
| Source form | Shows Source, Where to find it, What it shows; "Backs up & limits" reveals the other two and focuses the first. Editing a source that has them shows them |
| Source actions | Edit · Remove · Can't open it? · Undo report; your sources carry a "You" tag |
| Menus | Others' versions: one note and "Suggest a revised version". Yours: Edit wording and context, Combine with another argument, Make it a separate argument (only with more than one version), Delete argument ("Removes the row.") or Delete version. The option menu has no note |
| Short text | Move banner "Pick the argument it belongs with."; empty comments "No comments yet."; the shortcut moved to the Comment button's tooltip; settings footer "Saved in this browser only."; toolbar "Simulate a reorder"; add option reads "+ Option" (full "Add an option" on phones) |
| Articulation votes on top | In an unfolded row each version's vote sits above it, under the axis; the importance vote stays level with the lead card (11 px below its top, as before) |
| Vote labels | "Important." above / "Less important." below the importance control; "Well articulated." left / "Weaker articulation." right of the articulation control; "Vote withdrawn." when undone. They fade after about 1.4 seconds |
| Widths | Versions in an unfolded row keep at least 210 px (200 px below 800 px) and the row scrolls; while a row is unfolded, the other column keeps 260 px with two options (200 px with three). At 1024 px: 563 / 260 px columns, other cards 172 px (previously about 140 px) |
| Phone | No horizontal overflow at 390 px |
| Browser errors | No prototype errors in the console |

Hex texture by density: the prototype's background now uses filled hexagons of one size (82% of the lattice, 6% tone, from new tokens `--sm-hex-fill`, `--sm-hex-size`, `--sm-hex-sparse`). Importance sets the share of cells present, from a nearly full honeycomb behind the most important row (42 / 39) to about 4% behind the least important (8); each cell's presence is fixed by its grid position, so redraws don't flicker. Articulation still fades tone across an unfolded row. Checked at 800 px, folded and unfolded; no console errors. The design specimen's board study still shows the earlier outlined, size-based texture.

Bigger hexagons: `--sm-hex-cell` 9 px → 14 px (shared with the design specimen's board study). Checked at 800 px; the density still steps down by importance; no console errors.

Narrower hex gaps: `--sm-hex-size` .82 → .92 (gap between neighbouring cells about 4.4 px → 1.9 px at the 14 px lattice). Checked at 800 px; no console errors.

Larger again: `--sm-hex-cell` 14 px → 18 px. Checked at 800 px; density still steps down by importance; no console errors.

Lighter column panels: `--sm-panel` #f0f0f0 → #f7f7f7 so the hexagons (6% ink, about #e3e3e3 → #e9e9e9) stand apart from the panel; axis halos follow the same token. Checked at 800 px; no console errors.

Cool slate canvas: `--sm-paper` #e7e6e3 → #d8dde0, so the canvas separates from the hex gray (about #e9e9e9) by lightness and temperature; white contours read more clearly. Chosen from a side-by-side of four canvases (current, warm stone #dcd8cf, cool slate, parchment #ece6da). Used by the prototype and the design specimen only. Checked at 800 px; no console errors.

Warm stone and quieter cells: after trying cool slate in context, the canvas is warm stone (`--sm-paper` #dcd8cf). The darkest hex cells drop from 6% to 4% ink (`--sm-hex-fill` .06 → .04) so the texture stays in the background; density and articulation fading are unchanged. Checked at 800 px; no console errors.

Darker axes: labels `--sm-axis` #555 → #2e2e2e (the prototype's hard-coded #444 label color now uses the token) and line and arrowheads `--sm-axis-line` #8a8a8a → #5c5c5c, for both the importance and articulation axes and the phone "more important" label. Checked at 800 px with a row unfolded; no console errors.

## November 9 — Fainter contours and product page refresh

| Check | Observed result |
| --- | --- |
| Contours | `scripts/make-contours.py` now has an `OPACITY` setting (.45 → .12); the regenerated tile has the same lines, barely visible on the warm stone canvas, in the prototype, specimen, and product page |
| Screenshot | New `assets/prototype-board.jpg` (2160 × 1350, 414 KB), captured with headless Chrome at 1440 × 900 @2x with reduced motion: the board with "Sunday hours…" unfolded into three wordings. Replaces the old Build 1 image |
| PRD content | Who it's for (students, companies, online communities), before and after (documents and threads vs. one vote per question: importance, credibility, articulation), one core workflow (compare alternative articulations and vote for the clearest), three non-goals (moderation beyond votes, AI judgments, money or incentives beyond points) |
| Styling | The page uses the prototype's tokens: Source Serif 4 and Libre Franklin, the warm stone canvas with contours, a white header bar, inverted section headers, grain cards with the card shadow, option-style before/after columns, and Lucide icons |
| Widths | At 800 px three-up cards and two columns; at 390 px everything stacks; no horizontal overflow; all 11 icons render; the screenshot loads |
| Browser errors | None |

## November 9 — List, spaces, sharing, presence, zoom, and creating

Checks run by the coding agent in the in-app browser against the decoded prototype page served locally (the sandboxed frame does not accept scripted clicks), at 1360 px, 700 px, and 375–390 px, after `python3 scripts/sync-prototype.py`. Not a user study.

| Check | Observed result |
| --- | --- |
| List | Opens on Home with seven steelmen across six spaces; Hot order; dashed option chips where an option has fewer than two arguments; Personal draft shows "Draft" with no votes |
| Votes | Library upvote 128 → 129, then withdrawn; pressed state shows |
| Sorting and search | Needs help lists the five boards with a thin option; "bike" leaves one result; clearing restores the list |
| Spaces | POD 6 shows two steelmen and its header; Brooklyn Streets Join/Joined toggles and the sidebar follows; space tags on items open their space |
| Narrow list | Below 900 px the ☰ button opens the sidebar over the list; ×, Escape, an outside click, or choosing a space closes it; no horizontal overflow at 375 and 700 px |
| Open and leave a board | Board grows out of its miniature; breadcrumb reads "POD 6"; going back shrinks it into the list and leaves no overlay styles behind |
| Overview | Library board scene drops to about a third of its height; claims clamp to two lines; votes, menus, and Add slots hide; clicking "Sunday opening would require…" returns to Read focused on that card |
| Zoom keys | − and + switch levels; Escape steps Read → Overview → list |
| Presence | Two badges on the library board; top-bar face titles name the card; a "maya.chen writing a version…" cursor appeared within a few seconds; following samr_92 on the capstone board scrolls to and announces their card |
| Share | Opens under the button and focuses the invite field; "te" suggests tess.b; inviting adds them with the chosen role; general access to "Anyone with the link" updates the pill and hint; unknown username explains itself; email invite shows "· invited"; on maya.chen's board general access is locked with a note; Escape and outside click close; Settings links to Share |
| New steelman | Empty submit says "Write the question first."; typing clears it; "clearly" and "Why…" and a "Yes" option show hints; duplicate option names are refused with focus on the second; Escape keeps the draft; Personal changes the access line; creating opens the empty board focused on the first "Add an argument", and the list shows it with score 1, upvoted |
| Browser errors | None in any flow |

Known gaps: animations pause in background tabs (a fallback cleans up the list↔board overlay); inside the published, content-height frame, opening a board from far down the list can play part of the zoom off-screen before the page scrolls up. Presence and list details are illustrative and never change the board. Saved board edits from earlier versions were reset twice as sample data changed (votes kept).

## November 9 — Design audit, batch A

Checked by the coding agent on the decoded prototype at 1440 px after syncing.

| Check | Observed result |
| --- | --- |
| Fonts | No visible text in a system font (option chips, meta rows, comments, and Share rows now use Libre Franklin) |
| Italics | No visible italic text in the list, the board, or comments |
| Dates | List: "2d ago" with the title "November 7, 2026"; board header "4d ago"; comments "3d ago" with the full date |
| Type scale | Sizes in the stylesheet: 10 (initials only), 11, 12, 13, 14, 16, 20, 23 (wordmark), 24, 32 |
| Typing | Within about 40 s a "•••" bubble appeared beside jordan_w's badge; its title reads "jordan_w is writing a version"; no cursor |
| Contrast | "Add an argument" and "Add an option" use `--sm-muted`; the breadcrumb separator is #8a8a8a |
| Small fixes | Share invite placeholder reads "Username or email"; the canvas reaches the bottom of the window on a short board; icons use a 1.75 stroke |
| Browser errors | None |

## November 9 — Design audit, batch B

Checked by the coding agent on the decoded prototype at 1440 px, about 700 px, and 375 px.

| Check | Observed result |
| --- | --- |
| Axes | "MORE IMPORTANT" runs in the canvas margin, left of the first panel. With "Sunday hours…" unfolded, the articulation key is a white pill strip. No holes in the hexagon texture |
| Phone axes | At 375 px the first panel contains its cards (panel left 22 px, card left 78 px). "MORE IMPORTANT" is a pill above the first card. No horizontal overflow |
| Elevation and corners | List items are flat with a hover lift. Headers carry a single small shadow. Radii in the stylesheet are 6, 10, and pill, plus 1.5–3 px in the miniatures |
| List controls | The sort bar is text only. Upvoting "grade on a curve" fills the arrow and makes 897 bold |
| Phone header | On a board: logo mark, POD 6 tag, Share icon, avatar. Back on the list the wordmark returns (the zoom marker is cleared on the list) |
| Comments panel | At 1440 px the canvas runs under and beside the panel, with no white strip |
| Browser errors | None |

## November 9 — Design audit, batch C

Checked by the coding agent on the decoded prototype at 1440 px and 1000 px.

| Check | Observed result |
| --- | --- |
| List background | Plain gray, with no contours |
| Miniatures | Campus Life sage, Brooklyn Streets slate, and POD 6 stone are distinguishable side by side (after raising the tints' saturation once) |
| Sidebar swatches | A 14 px swatch beside each space tag. A flex rule first stretched them into bars; fixed |
| Boards | Campus Life board on sage with linen hatching, Northwind board on cool gray with dots, library board on warm stone with contours |
| Right rail | At 1440 px Home shows four "Needs your help" boards (standups first) and the Denver draft. Campus Life shows its card (sage banner, Public community, 12,406 members, Joined) and "Every option here has at least two arguments." Leaving and rejoining from the card updates the sidebar and keeps focus on the button |
| Narrower | At 1000 px the rail is hidden and the Northwind card sits above the list. No horizontal overflow |
| Browser errors | None |

## November 9 — Phone axes

At 375 px on the library board, with "Sunday hours…" unfolded: the option header reads "Open on Sundays / Most important first". No axis pills or arrows show. The row caption starts at "1 of 3 · best articulated" with the first dot filled. Scrolling the carousel to the second and third versions gives "2 of 3" and "3 of 3 · weakest", with one dot filled each time. No horizontal page overflow and no browser errors. At 1440 px the caption and subline are hidden, and both axes show as before.

## November 9 — Second audit (batch D)

Checked by the coding agent on the decoded prototype at 1440 px and 375 px.

| Check | Observed result |
| --- | --- |
| Hover | Sort buttons, sidebar links, list items, and miniatures transition over 0.12 s (before: 17 of 20 sampled controls changed instantly) |
| Panels | Share and the create sheet animate in with `sm-enter`; the create sheet stays centered |
| Presence | Over 12 s: 3 badges re-inserted, 2 pop animations (before: every badge re-popped on every move, 6 in 9 s with two people) |
| Outside click | With comments open, clicking an importance vote on another card closes the panel and the vote still counts |
| Avatars | Board header: dark "KL" (your board). Comments: light "MC" and "JW". Share: your row dark "KL" |
| Words | Board pill "Everyone in POD 6"; Share's options "Invited only", "Everyone in POD 6", "Anyone with the link"; hint "Everyone in POD 6 can read, comment, vote, and write."; Settings link "Sharing and access →"; rail "Keep five days · 1 argument" |
| Concision | Board meta: author, date, pill (no space name). Miniatures show three blocks per option for every board. Discover is gone |
| Titles | Comments title 16 px; Example board heading in tracked capitals |
| Phone caption | At 375 px "↓ Most important first" sits below the option header, arrow centered over the votes (52 px vs 51 px) |
| Browser errors | None |

Known gap: panels close instantly; only their entrance animates.

## November 10 — PM review changes

Checked by the coding agent in the in-app browser at 1440 × 900 and 375 × 812 with storage cleared. Drag and drop was checked with scripted drag events on an unsandboxed copy of the export, because the sandboxed iframe doesn't receive synthetic mouse drags.

| Check | Observed result |
| --- | --- |
| Presence | Top bar shows MC and JW faces; no badges or typing bubbles on cards |
| Stack badge | Count (3) on the access row and ≫ on single-wording rows, both white on near-black; ≫ opens a draft with the note "Only one wording so far" and no articulation vote |
| Column sort | Open on Sundays → Hot: the newer "Weekend opening…" row rises to the top, the survey-based "For 18 surveyed residents…" wording leads the access row, the caption reads "Hot: recent votes count for more", the axis reads hottest → cooler, and the importance axis is hidden |
| Feed score | Library shows 348 (importance 160 + articulation 94 + evidence 88 + comments 6); no up/down buttons; Personal draft still shows "Draft" |
| Strongest case | Each option shows its top 3 by shared importance, best wording, rank 1–3, importance and "best of 3"; "1 more argument on the board" under Open on Sundays; clicking a card returns to the board on that card |
| Suggested combination (owner) | jordan_w's suggestion shows under "Weekend opening…"; Combine moves it into the access row as a fourth wording with an Undo bar; Undo restores both rows and the suggestion |
| Drag to combine (owner) | Dragging "purpose" onto the study row: targets are labelled "Combine here", the hovered one turns solid; the drop leaves study with two wordings and shows Undo |
| Drag to separate | Dragging that wording onto the column's Add-an-argument slot ("Make it a separate argument") creates a new row; first attempt failed because the drop handler cleared the target's class before reading it, fixed and rechecked |
| Contributor (capstone board) | Handles read "Suggest combining…"; targets read "Suggest combining here"; the drop leaves rows unchanged and shows "You suggested… Withdraw" |
| Voter (bike-lane board) | No merge handles |
| Phone | Sort control collapses to its icon; view switch is icon-only; badges visible |
| Browser errors | None |

Follow-up the same day: the blue accent was removed (badge, merge icon, drop targets, and suggestion are grayscale again), the sort caption now starts at the card edge instead of on the connector line, and the suggestion is one line ("jordan_w: same as “Sunday hours would give some wee…”" with Combine and Dismiss). Rechecked at 1440 × 900.

Known gaps: drag and drop needs a mouse (touch uses the handle's click and the pick mode); the seeded suggestion only appears on a fresh or reset library board, because saved boards keep their earlier document.

## November 10 — Highlight, scale, and hidden columns

Checked by the coding agent on an unsandboxed copy of the export: the library board, and a generated scale-test board (not shipped) with 200 arguments under one option and 60 under the other, four rows of 12 wordings, and random ages.

| Check | Observed result |
| --- | --- |
| Fixed order | Library, Open on Sundays with New, Hot, and Off: rows stay access, study, purpose, weekend |
| New (library) | "2 new wordings": the survey-based access wording and "Weekend opening…"; turning it on opened the access row on its new wording; ↓ moved to "Weekend opening…" |
| Hot (library) | "3 hot wordings": access, its survey-based wording, and "Weekend opening…" |
| Folded match | With the access row folded: "1 new wording inside" on its card and a ring on its badge; rows with no match fade |
| Column fold (scale) | 10 rows per column, then "190 more arguments · less important · show 20" (and "50 more…" in the other); with New on, the fold also reads "99 with new" |
| Stepping (scale) | ↑ from the first match wrapped to 142 of 142 and opened the fold down to row 200 (about 30,000 px of page); the card landed in view. A render with all 200 rows took about 130 ms |
| Row fold (scale) | A 12-wording row shows 5 then "+7 more wordings · 2 new"; stepping to wording 6 opened the fold to 6, scrolled the row 1,014 px sideways, and the card was inside the row and the window |
| Hide columns | Hiding "Keep cars" leaves a 44 px strip (name and "60 arguments"), still wired to the question; "Ban cars" widens to 1,195 px; the last visible column can't be hidden; Show only this column and the strip's click both work |
| Importance axis | A 20 px white pill, nudged into the canvas margin, in the first visible column. Each axis is now one solid arrow toward the weaker end (down to less important, right to weaker); type is 10 px and the articulation strip is 24 px tall. The vertical arrowheads had never shown: a host `svg { max-width:100% }` squashed them to the 1 px line's width. Fixed with `max-width:none`; the head now measures 8 × 12 px |
| Browser errors | None after the fix below |

Fixed while checking: `render()` named its animation parameter `motion`, which hid the `motion()` speed function, so every animated render (unfold, fold, reorder) threw after updating the page. That skipped saving and anything after it. This predates the change; the parameter is now `kind`.

Known gaps: stepping to a match deep in a long column opens every row above it (the list is contiguous), so the page can get very long; drag targets are limited to the rows shown (pick mode shows all); the scale board was generated for testing and isn't in the prototype.

## November 10 — Open-weights example

The core example is now “Is open-weight AI a smart bet for China?”, with two options: “Why it makes sense” and “Why it might not”. It replaces the library board; earlier entries in this record refer to the library board. Saved browser state from before this change (docsVersion 3) is ignored, so returning visitors get the new board.

The arguments came from desk research (November 10). Why it makes sense: independence from American open models; Western distrust of services run from China, which self-hosted weights avoid; China controls AI where it's deployed; influence through adoption. Why it might not: no direct revenue, and others can host the weights; Western distrust of Chinese models wherever they run; rivals can use released weights; the subsidy may not last. Each source names a public document or news report, and its summary sticks to what that source says.

| Check | Observed result |
| --- | --- |
| Rows | Why it makes sense: independence, trust, control, influence, and the suggested duplicate; Why it might not: revenue, backlash, rivals, reversal |
| Versions | Independence has three wordings (main, an overclaim, a narrow factual one); trust has two (main, and a “.cn” wording whose detail is wrong); revenue has two (main, and the blunt “They don’t make any money directly”) |
| Evidence | Control cites the 2023 Interim Measures and the CAC filing counts; influence includes an unavailable attachment |
| Suggestion | “jordan_w: same as “A closed Chinese model could rea…”” with Combine and Dismiss |
| Highlight | New: 2 new wordings |
| Simulate a reorder | Moves “control” and “rivals” to the top of their columns, and back |
| Connector fix | With the first row unfolded and scrolled 214 px sideways, every wire runs from the spine to the row’s edge (none run backwards); before, the wire ran left to the off-screen first card |
| Browser errors | None |

Follow-up the same day: the design specimen and the Product Page screenshot now show the open-weights example.

| Check | Observed result |
| --- | --- |
| Specimen | Type samples, version-count samples, the AI-contribution study, and the board study use the open-weights question, options, and claims; no “library” or “Sunday” text remains; both hex canvases draw |
| Screenshot | New `assets/prototype-board.jpg` (2160 × 1350, 474 KB), captured with headless Chrome at 1440 × 900 @1.5x with reduced motion: the board with the independence argument unfolded into three wordings |
| Product Page | The new image loads (after a cache refresh) with updated alt text naming the open-weights debate |

## November 10 — Fragile-control argument

Added to “Why it might not”: “Anyone can modify open weights and strip out what China’s rules require, so its control over its own models is fragile, however strict the regulations.” It answers the “China controls AI where it’s deployed” argument. Sources: Perplexity’s R1 1776 (DeepSeek-R1 retrained to remove censorship on about 300 topics, February 2025), research on fine-tuning away safeguards (Qi et al., 2023), and the 2023 Interim Measures. The saved-state version moved to 5, so browsers holding the previous board load the updated one.

| Check | Observed result |
| --- | --- |
| Placement | Third in “Why it might not” (importance 28), level with “China controls AI where it’s deployed” |
| Evidence | 82% supported, 9 of 11; three sources open in the card |
| Strongest case | Still the top three per option; “2 more arguments on the board” under “Why it might not” |
| Browser errors | None |

## November 10 — PostHog analytics

`docs/analytics.js` loads PostHog (US cloud; the project was identified by asking each region's endpoint about the key: US accepted it, EU rejected it). It's included on the Product Page and on the prototype's page. The prototype page's security rules now allow PostHog's two hosts, and its frame's sandbox adds `allow-same-origin` so session replays can see inside it. Inside the prototype, `report()` posts each button action (name, board, id, value) and drag-and-drop combines to the page, which sends them as `prototype: <action>`.

| Check | Observed result |
| --- | --- |
| Product Page | PostHog loads, assigns an anonymous id, tags `environment: local` and `page: product`; debug log shows events sent |
| Prototype page | PostHog loads under the page's security rules with no blocked requests; `$pageview`, then `prototype: open-board` and `prototype: unfold` after clicks inside the frame |
| Ingestion | A direct test event to PostHog's capture endpoint returned 200 |
| Session replay | Not recording yet: the project's settings return `sessionRecording: false`, so replay has to be turned on in PostHog |
| Console | Only the browser's expected warning that a frame with `allow-scripts` and `allow-same-origin` can escape its sandbox |

Test events from this check (“setup check”, “setup check 2”, “setup check (direct)”, and the prototype events above) are in the project, tagged `environment: local`.

## November 10 — Roles enforced, and "Preview as" (permissions P1)

Plan: `plans/permissions.md`. Roles from Share now control every action, not only combining. One map in the prototype (`NEEDS`) names the role each action needs. After any render, controls your role can't use fade, take the reason as their tooltip, and explain themselves instead of acting when clicked. Prompts to write a version in a row and **+ Option** are hidden rather than faded. A **Preview as** menu in the top bar (a prototype tool, with a dashed outline) switches between Your access, Owner, Contributor, Voter, Viewer, and Signed out. The board header says what you can do and offers **Request access** (below "can contribute") or **Sign in** (signed out). In Share, you can't invite anyone above your own access, and owner controls follow the previewed role.

| Check | Observed result |
| --- | --- |
| Owner | Nothing blocked; header says "You own this board." |
| Contributor | Only the settings cog is blocked |
| Voter | Adding arguments and options blocked; voting works; "Request access" shown |
| Viewer | Importance and articulation votes, evidence assessment, adding arguments, versions, and sources, and the card menu's "Suggest a revised version" all blocked; the merge handle is gone; comments still work |
| Signed out | As Viewer, plus comments (the box reads "Sign in to comment"), reporting sources, Share, and New steelman on the list; Sign in replaces the avatar and returns to Your access |
| Blocked click | A viewer's importance vote doesn't change; the status line reads the reason |
| Request access | Header changes to "Access requested."; announcement says nothing is sent |
| Phone width (375 px) | "Preview as" label hides and the menu narrows; no horizontal overflow on the board or the list |

## November 10 — AI visual system (AI plan, A0)

Plan: `plans/ai-integrations.md`. Ochre (`--sm-ai`) plus a dotted edge plus the word "AI" marks anything AI did. The fixtures add an AI draft argument (`community`, `by:'ai'`) and an AI evidence check on `influence` (`aiCheck`). Both are simulated. The example board's save version moved from 5 to 6, so returning visitors get the new fixtures (and lose earlier edits to the example boards, as with previous bumps). New tokens: `--sm-ai-wash`, `--sm-ai-hover`, `--sm-ai-rule`. The design specimen's AI section now uses the prototype's own classes.

| Check | Observed result |
| --- | --- |
| AI draft card | Dotted ochre border (`rgb(201, 149, 43)`), "AI draft" tag on the top edge, importance 0, Unreviewed; clicking the tag opens the card |
| AI draft, opened | Ochre section: "AI draft · Suggestion", written 4h ago, Basis and Limits; the human evidence vote is unchanged above it |
| AI draft menu (owner) | "Drafted by AI: a suggestion until people vote on it…", Write a better version, Combine, Remove this AI draft; Remove then Undo restores it |
| AI check | "AI Partly" mark beside the meter (the meter still shows people's 58%); opened card shows the verdict, a note per source (Supports / Doesn't / Couldn't open), Limits, and "Simulated example: no model ran" |
| Design specimen | AI section shows the draft card, the footer mark, and the opened section at 280–320 px each |

Also fixed: Undo after deleting a version restored the board but not the list's copy of it (`docs[]`), so the list's argument count went stale and the restored version could be lost on the next save. `undoDelete` now writes the restored board back. Checked: remove the AI draft, Undo, return to the list: "Why it makes sense" shows 6.

Revision (same day): AI made briefer. The sparkle became a robot (Lucide `bot`); the sparkle read as decoration and already means **New** in the prototype. The "AI Partly" pill and the ochre section in opened cards are gone. Instead, an ochre robot sits right after the people's meter, on each source row AI read, and beside "Does the evidence back this wording?", and each explains itself in a hover tooltip (the prototype's tooltips pin on tap). The AI draft keeps its dotted border and "AI draft" tag, with its basis and limits in the tag's tooltip. Unused tokens `--sm-ai-wash` and `--sm-ai-rule` were removed. Checked: hovering the footer robot shows "AI check: partly supports this wording…"; clicking it opens the card; the three source rows and the evidence question each carry a robot; no separate AI section; no console errors.

Revision (same day): a verdict at a glance. AI checks are meant to be on every card when switched on, so every example card now has one (6 supports, 5 partly, 2 doesn't, 2 nothing to check) and the board's save version moved to 7. The robot gains a 9 px dot that fills like the people's meter: full, half, empty, or dashed. Checked: 11 robots on the board's visible cards with their verdicts in order; the four dots are distinct at 1× and 2× in the specimen; hovering still gives the full sentence; source rows on the influence argument show their own dots; no console errors.

Revision (same day): verdict dots now use the evidence meter's colors (green `--sm-cred-strong`, gray `--sm-cred-mid`, red `--sm-cred-weak`, dashed `--sm-quiet`) while the robot stays ochre. Fill still carries the verdict for colorblind readers.

## November 10 — Polish batch

| Change | Check |
| --- | --- |
| AI tooltips trimmed to the verdict and its reason ("A suggestion, not counted in the meter." and similar removed); AI draft menu note is now "Drafted by AI." | Footer robot tooltip reads only the verdict and summary |
| Canvas textures stronger: contour lines 12% → 20% white (`make-contours.py` rerun), dots 16% → 24%, linen 6%/3% → 10%/5% | Contours visibly clearer on the POD 6 board at 1152 px |
| Byline: each example version has an author (`by`), shown under the claim at 11 px, weight 300, `--sm-quiet` (#707070, about 4.9:1 on white, so it stays readable); "you" for yours; none on AI drafts. Save version moved to 8 | maya.chen, jordan_w, lin.zhao… under the first cards |
| List: option chips are dark (`--sm-ink`) with white serif names, like board option headers; thin options keep a dashed edge in white | Open-weights and bike-lane items; "Keep parking, paint a lane" (1 argument) shows the dashed edge |
| Sidebar: Home, Your spaces, and Communities each sit in a quiet box (`#ffffff0a` fill, `#ffffff1f` border) | Counts keep 7–8 px from the edge, including Northwind Studio |

## November 10 — How it runs (create sheet and Settings; permissions P2, part of AI A1)

One set of controls, `rulesMarkup`, appears folded in **New steelman** and open in Settings. Rules live on `question.rules` (`publish`, `structure`, `editors`, `judgments`, `ai`, `closes`); boards without them get `defaultRules(space)` in `useDoc`. Spaces gained simulated AI permissions and credits (`SPACE_AI`). Menu notes now name the author ("Written by maya.chen.") instead of explaining permissions.

| Check | Observed result |
| --- | --- |
| Defaults | POD 6: "Open team · AI checks"; Brooklyn Streets: "Public · AI checks", with Draft and Duplicates faded ("Off in Brooklyn Streets" on click) |
| Edited | Mode Edited sets New arguments to "Editors review first" and Reorganizing to "Editors"; the Editors row lists POD 6's 8 people; maya.chen toggles on |
| Create with AI drafts + closing date | New board opens with one ochre AI draft per option ("AI draft: the strongest reason for “Live demo”.") and dashed AI dots; header pill "Edited · Closes Nov 20"; credits 480 → 460 |
| Reorganizing enforced | Previewing as Contributor on an Edited board: + Option blocked ("Editors only."); Add an argument still works |
| Votes off | Importance and Evidence off in Settings: vote arrows and meters disappear, cards keep their width (the importance lane stays, empty); Articulation off hides the articulation axis and votes |
| Open-weights board | Pill "Open team"; nothing hidden; 11 AI dots |
| Phone width (375 px) | List, create sheet with How it runs open, and board: no horizontal overflow (the Preview as menu narrowed to 84 px to fix a 6 px overflow) |

Not built: holding new arguments for editors (P3), closing a board on its date (P5), the space admin's AI panel (A1).

Revision (same day): the create sheet's lower half restyled to match Share and Settings. Space and How it runs are two hairline rows (quiet right-aligned selects, the summary and a chevron); the rules sit in groups under 11 px tracked headings: Mode (three tiles, the chosen one outlined in ink, not filled), New arguments and Reorganizing (quiet selects), Editors (initials as in Share; chosen ones inked; names listed under the label), Votes (outlined checks, dashed when off), AI (robot, name, cost underneath, a switch), and Timing (Add a date, then a date field with ×). Settings shows the same groups without a second heading. Checked: Edited mode with two editors, drafts on, articulation off, and a date; created board shows "Edited · Closes Nov 16"; drawer selects stay borderless; no row overflows in the 356 px drawer; no console errors.

## November 10 — Editors and review (permissions P3)

Share gains **can edit** (`RANK` contribute 3 → edit 4 → owner 5); Preview as gains Editor. Board editors are Share's "can edit" people (the create sheet converts its editor picks into them). Under "Editors review first", `held()` routes a below-editor submission into `doc.pending` (kept apart from `ideas` and `cards`, so counts, highlights, and the list never include it) until an editor accepts it. The capstone example runs Edited with two items waiting; the example save version moved to 9.

| Check | Observed result |
| --- | --- |
| Editor view | Top bar "2 to review"; header "Edited", "You can write, review, and reorganize."; omar_h's wording under its row and tess.b's argument at the bottom of its column, each with Accept / Decline |
| Contributor view | Neither held item shown; + Option blocked ("Editors only."); adding an argument shows it to its author as Awaiting review with Withdraw; status "Sent to the editors." |
| Ids | A new held item no longer collides with the example's (fixed: `heldId()` skips ids in use) |
| Step | "to review" steps p2 → p3 → p1, in screen order, focusing Accept |
| Accept | omar_h's wording joins its row: the stack goes from one wording to "Compare 2 wordings"; count drops |
| Decline | Reason field, then Decline: the item leaves the editor's view; its author (previewed as Contributor) sees Declined with the reason and Dismiss |
| Share | Roles: can view / vote / contribute / edit; kieran_lamee listed as "can edit" on capstone |
| Phone width (375 px) | List, open-weights, and capstone boards: no horizontal overflow (top bar gaps and padding tightened, Preview as menu 68 px) |

Not built: holding new sources, "Ask for changes", per-option stewards.

## November 10 — AI evidence checks run (AI plan, A2)

Simulated checks: `simulateCheck` returns a verdict per source (unavailable or no location → couldn't open; otherwise a stable placeholder from the card and source ids) and an overall verdict; `queueCheck` spends one credit, shows a pulsing robot, and fills the result after 1.2 s (immediately with reduced motion). Each check stores the evidence it read (`sig`); after any action, `refreshChecks` re-checks cards whose evidence changed. New and accepted wordings are checked when they're added.

| Check | Observed result |
| --- | --- |
| Report a source on "China controls AI where it's deployed" | Robot pulses, then the verdict changes (supports → partly); the reported source's row shows "couldn't open" |
| Check again | The ochre button beside the evidence question re-runs it (pulse, then verdict) |
| Add a source with no location (on "Releasing weights hands…") | Re-check; that row shows a dashed dot and **Mark unavailable**; clicking it marks the source Unavailable and checks again |
| New argument | Pulses, then a dashed dot (no sources yet) |
| Credits | POD 6: 480 → 477 after three checks |
| Console | No errors |

## November 10 — Moderation and history (permissions P4)

Reports (`reports`), removals (`hidden`), and a per-board log (`doc.log`) on versions and comments. The ⋯ menu gains Report (anyone signed in), and Hide / Restore / Dismiss reports (editors), with a reason picker in the same menu. The bike-lane board in Brooklyn Streets is the public example (save version 10).

| Check | Observed result |
| --- | --- |
| Moderator view | Pill "Public"; "1 to review"; "Spam ×2" flag on the parking-ad argument; the abusive argument shows "Removed by a moderator · Abusive" with its text struck through |
| Hide | Menu: Write a better version, Combine, Report, Hide, Dismiss reports → Hide → reasons → Spam: card becomes a removed note, "to review" disappears, focus stays on its ⋯ |
| History | "You hid “Cheap monthly parking…” Spam · 1m ago" above "rtorres hid “Drivers who complain…” Abusive · 18h ago" |
| Voter view | Removed notes only (no original text), no flags, no review button; ⋯ offers Report; reporting as Off-topic adds a flag and "1 to review" for the moderator |
| Comments | promo_bk's comment shows a flag (1) for moderators; Hide → Spam → "Removed by a moderator · Spam"; Restore brings back the text |
| Phone width (375 px) | No horizontal overflow on the bike-lane board |
| Console | No errors |

## November 10 — Closing and the decision (permissions P5)

`closedOf(board)` is true once the owner closes it (`question.closed`) or its closing date is on or before the prototype's today (Nov 9). Closed boards lock vote, contribute, edit, and structure actions in `can()`; comments stay open. The decision lives on `question.closed.decision` (option, why, cited cards, who, when). The standups example is closed and decided (save version 11).

| Check | Observed result |
| --- | --- |
| List | Standups item shows "Decided: Go async" |
| Decided board (not owner) | Pill "Closed Nov 7"; "Closed: read only."; importance votes, Add an argument, and + Option blocked with "Closed."; comments open; Decision block: Go async, why, one cited argument from each side, "priya_s · Nov 7"; clicking a cited argument opens and focuses its card |
| Close now (owner, open-weights) | Pill "Closed Nov 9"; Timing shows Reopen; decision form appears in the question box |
| Record decision | Option "Why it makes sense", why, two cited arguments → shown with "You · Nov 9 · Edit"; History: "You recorded the decision: “Why it makes sense”", "You closed the board" |
| Reopen | Pill back to "Open team"; votes unblocked; decision cleared |
| Closing date | Setting Closes to Nov 9 closes the board at once (22 vote controls blocked); Reopen clears the past date |
| Who's weighed in | "8 of 9": maya.chen, jordan_w, priya_s, samr_92… Wrote; kieran_lamee Not yet |
| Phone width (375 px) | List and standups board: no horizontal overflow |
| Console | No errors |

## November 10 — Profile and points (Tier 1, component 1)

The profile opens from the avatar in the top bar and from any username (list authors, the question's author, card bylines, comment authors, History). It replaces the list beside the sidebar; back (or Escape) returns to the board or list it came from. `contributionsOf(user)` and `pointsOf(user)` compute everything from the boards, plus `EARLIER` counts for boards outside the prototype. Credits spent are logged in `state.usage` (seeded with `USAGE_SEED`). Example boards changed (sketch boards now have authors; you wrote one open-weights argument and two of its sources), so saves are now version 12.

| Check | Observed result |
| --- | --- |
| Your profile (1440 px) | Dark header: KL, "kieran_lamee you", six space tags, 210 points; Points rows 4 × 25, 5 × 10, 1 × 15, 9 × 5; Contributions: Arguments 4, Wordings 0, Sources 2; Credits and Account on the right |
| Top-three rule | Denver's lone argument and the capstone argument earn nothing (sides under four arguments); "China controls AI where it's deployed" earns +25 |
| Credits | Personal 50, POD 6 480; Recent usage: Draft arguments −20, then evidence checks grouped by board and day, each opening its board |
| Byline → profile | jordan_w on the open-weights board opens his profile without Credits or Account, 470 points; back link names the board; Escape returns to the board |
| List author → profile | Opens kieran_lamee; Escape returns to the list |
| Contribution → card | Sources tab → "US clouds host DeepSeek-R1" opens the open-weights board on the trust card, ringed |
| Change password | Opens with focus in Current password; Save with no new password marks it invalid; with one, closes and announces "Password changed (simulated)." |
| Sign out | Preview as switches to Signed out, the avatar becomes Sign in, the list shows; Sign in restores Your access |
| Phone width (375 px) | Header stacks name, tags, then points; no horizontal overflow |
| Console | No errors |

## November 10 — Create and edit a space (Tier 1, component 2; AI plan A1)

Spaces are now saved state instead of fixed values: `SPACES`, `SPACE_AI` (`budget`, `used` before this visit, `allow`), `PEOPLE` (members), and `SPACE_META` (roles, rules, invites, requests, starting mode). They're seeded from functions, saved as `spaceStore`, and reset by Reset to the original example. `spaceCredits(id)` = budget − used − spent; the seeded balances are unchanged (POD 6 480, Northwind 2000, Personal 50, Brooklyn 1200, Campus 0, Future of Work 800). New space actions need `view`, and settings actions need the new `admin` level (`isSpaceAdmin`).

| Check | Observed result |
| --- | --- |
| POD 6 card | Rules (2), Moderators "you, maya.chen, jordan_w", Settings |
| Settings (1440 px) | Banner, Basics / Members / Rules on the left; AI and New steelmen start as on the right |
| Join requests | Approve kt_nguyen → members 9 → 10, focus moves to the next Approve |
| Invite | Unknown username → "No one is called nobody_here. Try their email."; an email as Moderator → listed as invited |
| Roles | jordan_w → Admin; with you as the only admin, your role menu is disabled |
| Rules | Add a rule focuses the new field; typed text appears on the space card after Escape |
| AI | Drafts off → the open-weights board's How it runs fades Draft arguments; budget 600 → 1,000 shows "880 left" |
| Starting mode | Edited → New steelman in POD 6 opens with Edited |
| Canvas and name | Sage updates the banner and sidebar swatch; renaming updates the sidebar as you type |
| New space | Empty name → "Name the space."; "Brooklyn streets" → "There's already a space with that name."; a public "Park Slope Parents" (lilac) joins Communities, appears in the New steelman picker, opens its settings with you as the only admin; its card shows no Join |
| Roles in Preview as | Viewer: no Settings on POD 6; Signed out: New space blocked; Campus Life (not admin): no Settings |
| Personal | Basics (no access choice), AI, New steelmen start as |
| Phone width (375 px) | List, settings, New space, and profile: no horizontal overflow |
| Console | No errors |

## November 10 — Notifications (Tier 1, component 3)

`notesList()` merges seeded notifications (`NOTES_SEED`), ones worked out from the boards (review, moderate, closing, decision, join requests; their ids include the count or date, so a change makes them unread again), and ones added this visit (`state.notes`, from accepting or declining your own held item). Read state lives in `state.notesRead`. Example boards changed (a comment of yours with a reply, a declined capstone wording, the capstone board closing Nov 10, an accepted bike-lane argument, you among the standups voters), so saves are now version 13.

| Check | Observed result |
| --- | --- |
| Bell | "Notifications, 8 unread", badge 8; hidden when signed out |
| Inbox (1440 px) | Closes tomorrow (Nov 10); 2 contributions waiting for your review; kt_nguyen and bwells asked to join POD 6; lin.zhao replied (quote); maya.chen declined your wording (quote and reason); 2 reports to look at; priya_s recorded the decision: Go async; read: invite to edit, rtorres accepted your argument |
| Reply | Opens the open-weights board with the comments panel on the "China controls AI" card |
| Declined | Opens capstone, rings the declined held card, focus on Dismiss |
| Review / reports | Focus lands on Accept for p2 (capstone) and on the reported card's menu (bike lane) |
| Decision | Opens standups at the Decision block |
| Join request | Opens POD 6 settings with focus on Approve for kt_nguyen |
| Accepted | Opens the bike-lane board and rings the card |
| Read state | Dot toggles unread (2 → 3); Mark all read → no badge and no Mark all read button |
| Close | Escape closes and returns focus to the bell; clicking outside closes |
| Live | As Contributor on capstone, add an argument (held); as Editor, Accept → "Your argument was accepted" appears unread at the top |
| Phone width (375 px) | Inbox spans the width under the top bar; list and boards (capstone, open-weights, bike lane): no horizontal overflow |
| Console | No errors |

## November 10 — Invite landing and onboarding (Tier 1, component 4)

The landing opens from a link hash (`#s=<board>&by=<user>&as=<role>`, read from the page around the prototype frame, and on `hashchange`) or from Share → Preview. While it shows, Preview as is Signed out and the top bar shows only the wordmark. Signing up or in (simulated) clears the hash, sets Preview as to the invited role, opens the board, and starts the tour if `state.toured` isn't set (Preview always does). `tourSteps()` picks its examples from the board; the spotlight is a positioned hole with a page-wide shadow, re-measured after a row finishes unfolding.

| Check | Observed result |
| --- | --- |
| Link (1440 px) | `#s=capstone&by=maya.chen&as=contribute` → "maya.chen invited you to weigh in", POD 6 question box with two option headers and wires, "You can read, comment, vote, and write.", "5 people" |
| Sign up | Empty → "Fill in every field.", focus on Username; filled → capstone board, Preview as Contributor, hash cleared, tour starts with focus on Next |
| Tour (capstone) | Importance (top argument in "Allow it, with disclosure"), then Evidence ("75% of 8"); no Articulation step (every argument has one wording); Done → "Tour done." |
| Tour (open-weights, from profile) | Importance, then Articulation (unfolds the independence row; spotlight covers the axis and all three wordings), then Evidence |
| Skip | Escape → "Tour skipped. Take it again from your profile." |
| Share | Link field shows `http://localhost:8000/prototype/#s=openweights&by=kieran_lamee&as=contribute`; Preview → landing from kieran_lamee, 7 people |
| Look around first | Board opens signed out ("You're signed out: you can read."), no tour |
| Sign in tab + Enter | Signs in; after a first tour, a real link no longer tours |
| Phone width (375 px) | Landing: no overflow, options two across; tour: each note stays fully on screen; Articulation frames only the leading wording |
| Console | No errors |

## November 11 — Feature audit (L-04, M-01)

`plans/features.csv` holds the feature audit (89 rows, fixed IDs); `scripts/build-feature-audit.py` builds `plans/feature-audit.xlsx` from it. L-04 and M-01 gained design-gap notes; no ratings changed.

| Check | Observed result |
| --- | --- |
| Rebuild | "89 features → plans/feature-audit.xlsx" |
| Same content | Features sheet matches the hand-built workbook cell for cell; Summary adds a "Not yet design-ready" row (T1 6, T2 5) |
| Validation | A tier of "T9 Core" stops the build: "features.csv line 2 (A-01): tier must be one of …" |
| Formulas | Not recalculated here (no LibreOffice); the workbook recalculates on open |

## November 11 — Live changes (B-05, M-02)

The order you see is fixed when a board opens (`shownOrder()`); `rowsOf()` and `ordered()` keep that order and put anything new at the end. `staleCount()` counts the fewest moves to reach the live order, plus versions others deleted. **Simulate others** in the bottom bar replaces **Simulate a reorder**.

| Check | Observed result |
| --- | --- |
| Votes | Row order on screen unchanged; status "5 people voted. What you see stays in place until you update."; pill "3 changes · Update" (was 9 before counting fewest moves) |
| New argument | Appended to the column with the fewest rows; earlier rows unchanged |
| New wording | Unfolded single-wording row goes from 1 to 2 wordings, new one last |
| Update | Rows reorder; the first row on screen (control) moved 7 px on screen; pill disappears; status "Board updated." |
| Delete open card | Open version shows "Removed by an editor" in place; pill counts it; gone after Update and after reload |
| Draft on a vanished argument | Writing "My sharper wording" on a single-wording row, then delete + Update → New argument form in the same column with the draft, focus in it, status explains |
| Offline | "Offline" → importance vote → "Offline · 1 waiting to send"; Votes ignored while offline; back → "Back online · 1 sent", then "3 changes · Update" |
| Strongest case | 6 items after a delete + Update; deleted versions skipped |
| Phone width (375 px) | Pill centered 16 px above the bottom of the screen; toolbar wraps; no horizontal overflow |
| Console | No errors after votes, argument, wording, delete, Update, Strongest case |
| Not checked | Pill tracking real scrolling in a visible browser (the pane was hidden; checked by firing scroll events) |

## November 11 — Live changes, structure (M-02)

Others' structural changes are flags applied on Update or load (`applyPending()`): `idea.merged`, `card.split`, `card.gone`. An edit sets `card.prev`. **Simulate others** gains an **Open card** group: Edit, Delete, Combine, Separate.

| Check | Observed result |
| --- | --- |
| Edit | On maya.chen's leading wording: status "maya.chen edited this version…"; byline shows "edited"; clicking it shows the earlier wording struck through |
| Separate | Placeholder "omar_h made this a separate argument" in place; row keeps its wording count; pill "1 change" |
| Combine while writing | With a draft in the open row: one-line placeholder "lin.zhao combined this with '…'. Your draft goes with it." and **Go to it** (rings the other argument); pill "2 changes" |
| Update | Old row gone; the other argument opens with 4 wordings and the draft in its form, focus on it; status "Board updated. Your draft moved with the argument."; the separated wording is a new row (i1) at the end of the column |
| Reload with a combine pending | Applied: no placeholder, no pill |
| Placeholder layout | Combined placeholder spans the card column (first build sat in the vote column; fixed) |
| Phone width (375 px) | Edit, Separate, Combine, Update: no horizontal overflow; placeholder 203 px wide in a 343 px frame |
| Console | No errors |

## November 11 — Sign-in and account (L-01, L-04)

Decisions: sign in with Google or a one-time email link (no passwords); people who join through a link must confirm their email, which both methods do by design. `authCard()` serves the invite landing and `openSignIn()` (top bar and board header). The account card's password rows are replaced by email change and sign-in methods; `state.myEmail` and `state.google` are saved.

| Check | Observed result |
| --- | --- |
| Invite link (capstone, maya.chen) | Landing with Continue with Google, or, Email, Email me a link; focus on Google |
| Bad email | "not-an-email" → "That doesn't look like an email address.", field marked invalid, value kept |
| Link sent (Enter in the field) | "We sent a sign-in link to sam.k@school.edu. It works once, for 15 minutes."; focus on Open the link; Resend → "Sent again" |
| Expired | Open it too late → "That link has expired" → Email me a new link → back to Check your email |
| Username | Prefilled "sam.k"; "jordan_w" → "jordan_w is taken."; "a!" → "Use 3 to 20 letters, numbers, dots, or underscores."; "sam_k" → board as Contributor, tour starts |
| Change email | Same address → "That's already your email."; kieran@school.edu → Confirming row, focus on Resend, Change hidden; Open the link → "Your email is now kieran@school.edu." |
| Google | Disconnect → "Google disconnected. You can still sign in with an email link."; Connect restores |
| Top-bar Sign in, no board | "Sign in to take part"; KIERAN@school.edu (the changed email, any case) → straight in, no username step, no tour |
| Sign in from a board | Signed out on open-weights → panel shows its question → Google → back on the board as you |
| Phone width (375 px) | Start, sent, and username steps: no horizontal overflow |
| Console | No errors |

## November 11 — Privacy, consent, deletion (M-07, M-08)

Decisions: analytics follow common US practice (notice with opt-out; Global Privacy Control and Do Not Track honored). A deleted account's arguments, wordings, and sources stay, credited to deleted_account. `docs/analytics.js` now shows the notice and exposes `window.steelmanAnalytics`; `docs/privacy.html` is new; the prototype's Account card gains a Privacy group and Delete account.

| Check | Observed result |
| --- | --- |
| First visit, Product Page | Notice "Steelman records anonymous usage and screen replays to improve it. Typed text is hidden. Privacy · Turn off · OK"; analytics on |
| Turn off | Stored "off"; PostHog opted out; notice gone |
| Reload with analytics off | Only PostHog library files load; no event, flags, or replay requests |
| Privacy page | Shows "off" and Turn on; Turn on → "on", stored "on"; footer link on the Product Page |
| Account → Usage analytics | Turn off → "Usage analytics off. Nothing more is sent from this browser."; the page's stored choice changes too |
| Download | Saves steelman-data.json: account, sign-in methods, votes, and 4 boards with what you wrote (wording, context, option, date) and comments |
| Privacy notice / sign-in panel Privacy link | Opens /privacy.html in a new tab |
| Delete account | Form lists what's removed and what stays (deleted_account); "kieran" → "Type kieran_lamee exactly."; correct name → "Your account is deleted", Preview as Signed out; Back to Steelman → the list |
| Phone width (375 px) | Notice 16 px from the edges and bottom; account card and delete form: no horizontal overflow |
| Console | No errors |
| Not checked | A browser that sends Global Privacy Control (the test browser sends neither signal) |

## November 11 — Card integrity (A-06, B-03, C-03)

Decisions: edits work like Reddit (allowed any time, labelled "edited"); any edit, and any change to a version's sources, starts its credibility assessments over, with a warning first; importance and articulation votes stay. The value-judgment marker (C-04) is dropped: an unsupported argument can still matter, which is what the separate importance vote is for. `markEvidenceChanged()` now resets `yes`/`no` and your own assessment, and records why (`resetBy`).

| Check | Observed result |
| --- | --- |
| Edit own version (control, 15 of 17 supported) | Form shows "17 assessments start over when you save. Votes stay."; save → "Your version was updated and says “edited”. Its 17 assessments start over; votes stay."; meter Unreviewed; importance unchanged; byline "you · edited"; edited shows the earlier wording; evidence section "This version was edited, so assessments started over." |
| Add a source (1 assessment) | Form warns "1 assessment starts over when you save."; save → Unreviewed; "The evidence changed, so assessments started over." |
| Remove a source (1 assessment) | First click → "Remove · 1 assessment starts over" and an announcement; second click removes, meter Unreviewed; Undo restores 100% of 1 |
| Someone else edits (Simulate others → Edit) | Assessments start over; status says so |
| Phone width (375 px) | Edit form with warning, source form: no horizontal overflow |
| Console | No errors |
| Testing note | With the browser pane hidden, animations never finish and the prototype ignores clicks while one runs; tests finished them by hand |

## November 11 — Links (M-06)

The page's address carries `b` (board), `v` (version), and `c` (comment) after `#`. `syncAddress()` pushes a history step when the board changes and replaces it otherwise; `openLink()` handles incoming links, Back, and Forward; `prepareReveal()` opens whatever hides a version.

| Check | Observed result |
| --- | --- |
| Address follows | Open board → `#b=openweights`; expand independenceNarrow (third wording) → `#b=openweights&v=independenceNarrow` |
| Copy link | Version ⋯ → Copy link copies `…/prototype/?v=c5#b=openweights&v=independenceNarrow`, "Link copied."; comment Link copies `…#b=openweights&c=c-y1` |
| Open a version link | Row unfolds, context and evidence open, card rings |
| Open a comment link | Comments panel opens on its version; comment c-y1 rings |
| Deleted version | `#b=openweights&v=nope` (fresh load) → board with "That version was deleted. · Dismiss", focus on Dismiss; address cleaned to `#b=openweights` |
| Unknown board | `#b=nosuch` → "This steelman doesn't exist", Go to your steelmen |
| Signed out, POD 6 board | `#b=capstone&v=capstone-1-0v` → "Sign in to open this steelman", no question shown; Google → the board, version open, address kept |
| Back / Forward | List → board → wordmark → Back: board (`#b=openweights`); Forward: list (no hash) |
| Phone width (375 px) | Link note 285 px wide; not-found screen: no horizontal overflow |
| Console | No errors |
| Not checked | A version link into a hidden column, or past a column's fold of 10 (no example board has one); the code clears both |

## November 11 — Phones (M-03)

Decision: on phones, tabs switch sides; swiping stays with unfolded rows. `sideTabs()` renders the tabs; CSS hides the other columns at 640 px and below; `placeSides()` pins the bar (the frame grows to its content, so position:sticky can't); `switchSide()` remembers each side's scroll position. Wires skip hidden columns.

| Check | Observed result |
| --- | --- |
| Open-weights at 375 px | Tabs "Why it makes sense 6" (selected) and "Why it might not 5"; only the first side shown; page 2,875 px tall (was 4,549) |
| Pinned | Scrolled into the board: bar at the top of the screen |
| Switch | Tap "Why it might not" → only that side; its top sits just under the bar; status "Why it might not: 5 arguments." |
| Keeps place | Scroll 400 px down "might not", switch away and back → same place (343 px into the column) |
| Link to the other side | `#b=openweights&v=control` while on "might not" → switches to "makes sense", card shown |
| Layout | Bar ends 20 px above the column at rest; no horizontal overflow |
| Desktop (992 px) | No tabs; both columns; Strongest case shows two columns; wires drawn |
| Console | No errors |
| Not checked | Real phones and touch (emulated width only) |

## November 11 — Accessibility pass (M-04)

axe-core 4.10.2 was loaded into the prototype frame and run on each screen; contrast was also computed directly (axe can't see behind the canvas texture). Keyboard checks used real Tab and Enter presses.

| Check | Observed result |
| --- | --- |
| axe, first run | Board: duplicate banner (the question header), content outside landmarks; comments panel: `aside` with role dialog; list: no level-one heading; phone top bar: Board, Strongest case, Share, New steelman without names; inbox and Share: headers counted as banners |
| Fixes | Question header is a labelled section; panel is a div; list has a hidden "Home" (or space) h1; root's stray label removed; icon-only buttons labelled; inbox and Share headers are plain elements |
| axe, final | No violations: list, inbox, New steelman, profile, board, unfolded row + expanded card + comments, Share, Settings, Strongest case (desktop); list, New steelman, inbox, board, other side, profile (375 px) |
| Contrast | Muted text on canvases was 3.3–3.9:1 (removed-card notes on slate, "Add an argument", case caption). Tokens: `--sm-muted` #686868 → #565656, `--sm-quiet` #707070 → #5a5a5a; now at least 4.6:1 on every canvas and 6.9:1 on white. The breadcrumb "/" (decorative, hidden from screen readers) stays lighter |
| Keyboard, board | Order: top bar → question tools → per row: importance ↑↓, stack, menu, wording, author, AI check, combine, comments, expand |
| Keyboard, core loop | Enter on a stack unfolds the row (focus stays on the leading wording); Tab reaches each wording's articulation ↑↓; Enter on expand opens sources, Add a source, AI check, assess Yes/No, Suggest a better version |
| Jump to | Tab from Settings → "Jump to Why it makes sense" (appears), "Jump to Why it might not"; Enter → focus in that side's header; status "Why it might not." |
| Reduced motion | CSS stops transitions and animations; `play()` now skips scripted animations too |
| Console | No errors |
| Not checked | A real screen reader, a keyboard-only user, Windows high-contrast mode |

## November 11 — Architecture (B-05, K-04, M-01, M-02)

A design session, not a prototype change. `plans/architecture.md` (requirements, data model, live updates, components, cloud, delivery, security and privacy), `plans/build-plan.md`, and five decision records in `plans/decisions/` describe the real product. Decisions: one Postgres database with a per-board change log (M-01); polling for changes after the reader's change number, with the shared order recalculated lazily on a 60-second tick (B-05, M-02); GCP; K-04 moves from T4 to T3, because AI costs pass to users through credit purchases.

| Check | Observed result |
| --- | --- |
| MVP coverage | Every T1 and T2 ID appears in build-plan milestones M0–M2; every T3 ID plus K-04 appears in M3 (checked against `features.csv`) |
| Prices and limits | Taken from the providers' own pages on Nov 11; figures from pages that didn't render are marked *unverified* in the documents |
| Diagram | Mermaid in architecture.md §4; not render-checked here (an online renderer was blocked) |
| `git diff --check` | Clean |
| Not checked | No code exists yet: nothing here is tested in a browser. An independent audit of the documents is pending |

## November 11 — Architecture review (B-05, M-01, M-02)

The independent audit of the architecture documents, by a second agent session (Claude Fable 5.2). Documents only; no code and no feature row changed. The builder approved its revisions the same day (architecture.md, Q19) and chose to keep the offline queue in memory while the tab is open rather than save it across a closed tab (Q20). What it changed: live updates read rows stamped with the board's change number, and votes are no longer logged (M-01, M-02); every write is safe to send twice by its shape, replacing `client_op_id`; a pull request never touches staging, and per-pull-request previews are dropped; a new section on automated testing and unattended agent work (architecture.md §8, decision record 006); M0 has an ordered backlog with machine-checkable acceptance tests.

| Check | Observed result |
| --- | --- |
| Contradiction found | The first draft ran each pull request's migrations against staging, while AGENTS.md rule 7 forbids editing a migration that has run in staging: a migration would have been frozen at its first push. Fixed in §6 |
| Contradiction found | Staging's database was "stopped when not in use", but previews and merge deploys needed it running, with nothing to start it. Now started by the deploy workflow and stopped nightly |
| Hidden timers | "No background jobs" sat beside three things that needed one: erasing text ten seconds after a delete (now held in the browser), the weekly export and staging's stop (now scheduled calls to Cloud SQL's own API) |
| Better Auth and Vercel | Confirmed from Vercel's blog: acquisition announced July 7, 2026; the library stays MIT-licensed |
| Cloud Run domain mapping | Confirmed on Google's page: preview, "not production-ready"; `us-central1` is among the ten regions |
| Firebase Hosting as a cheaper custom domain | Ruled out: Firebase's page says only the `__session` cookie reaches Cloud Run |
| Point-in-time recovery | Confirmed in Google's docs: 1–7 days on the Enterprise edition, default 7 |
| Cloud Run to Cloud SQL | Confirmed on Google's page: built-in connection over a socket, no VPC connector; 100 connections per Cloud Run instance |
| `embedded-postgres` | PostgreSQL 17.x builds are published on npm (seen in search results, not installed) |
| MVP coverage | All 49 T1, T2, and T3 IDs in `features.csv` still appear in `plans/build-plan.md` (checked by script) |
| `git diff --check` | Clean |
| Not checked | Cloud SQL's price: Google's pricing page didn't render; $9.37 a month for the smallest instance with 10 GB is Google's worked example as quoted by a search result. The 25-connection limit on the smallest instance comes from a third-party article. Stopped-instance billing comes from Google's support forum. No code exists yet, so none of the tests described in §8 has run |

## November 11 — Open-question interview (A-06, C-03, L-01, L-04)

Decisions the builder made in an interview after the architecture review. Documents only; the prototype is unchanged, so three of these open small design gaps recorded in `features.csv`.

| Question | Decision |
| --- | --- |
| Who merges agents' pull requests (Q18) | The builder merges M0's. From M1 a pull request merges itself when every check is green and nothing protected is touched; production always needs the builder. The course needs no pod sign-off |
| Email sign-in (Q21; L-01, L-04) | A 6-digit code typed into the page, not a link. The prototype shows the link flow; the code-entry screen isn't designed, so L-01 and L-04 go from readiness 4 to 3 |
| "Edited" after votes (Q22; A-06) | The "edited" mark shows, on hover or tap, the importance and articulation votes the wording had before the edit. Not yet in the prototype |
| Editing a shared source (Q10; C-03) | Resets the versions citing it only when the evidence changed (link, finding, backs up, limits), not for its name. The prototype resets on any edit |
| Joining a board in the trial (Q7) | A link that carries a role; no owner approval step |
| Staging's database (Q16) | Cloud SQL, started by each deploy and stopped nightly |
| Domain (Q13) | `steelman-argument.com`, bought by the builder on Nov 11 (the product keeps the name Steelman). Its DNS records for Cloud Run and Resend are still to add. M1 is built and tested without them but isn't shown to classmates until email sign-in works from the domain |
| Public communities (Q3) | Timing unknown; they stay a sketch |
| `python3 scripts/build-feature-audit.py` | Rebuilt the workbook |
| `git diff --check` | Clean |
| Not checked | Nothing here is built or designed in the prototype yet |

## November 12 — App: database, reading a board, votes, writing (M-01, A-03, A-05, A-06, B-01, B-02, B-03, B-05, M-02)

The first working code, in `app/` (pull requests #21–#25). Votes, assessments, and the shared order are saved in Postgres and served by the API; there is no board screen yet (M0-6), so every check here is an automated test, not a browser check. `npm run check` runs them all.

| Check | Observed result |
| --- | --- |
| Database invariants | `app/server/test/database/`: each invariant in architecture §2 is tried with raw SQL and refused; removing any of the 23 rules the schema keeps fails a test |
| Votes and assessments | `app/server/test/api/votes.test.ts`, `assessments.test.ts`: set, change, withdraw; sent twice equals once and takes no second change number; old-revision assessments and "yes" without an available source refused |
| Reading | `app/server/test/api/reading.test.ts`: snapshot; "changes after S" returns only rows stamped after S, one per item however many votes |
| Order tick | `app/server/test/api/order-tick.test.ts`: the order recalculates only once the test clock passes 60 s, and only if it changed |
| Test-user switch | `app/server/test/api/test-user.test.ts`: refused in production mode |
| Writing | `app/server/test/api/writing.test.ts`: add an argument or a wording, edit (a new revision; credibility starts over, votes stay, sources carry over), delete (text erased, row kept; last wording takes its argument); each sent twice equals once; only the author edits or deletes |
| Stale writes | `app/server/test/api/stale-writes.test.ts`: one test per row of the architecture's stale-write table that deleting and editing can reach, plus a closed board refusing every write |
| Not checked | Anything in a browser (M0-6). Stale rows from hiding, combining, separating, and changing sources wait for those features |

## November 12 — Simulation (B-05, M-02)

The browser's sync rules now exist as pure functions in `app/shared/src/sync.ts` (open a board, merge changes, Update, the pill) and `queue.ts` (what the offline queue keeps). `app/server/test/simulation/` runs them together with the real write path and a real database: three readers, random sequences of votes, assessments, new arguments and wordings, edits, deletions, minutes passing, polling, Update, and going offline and back. The nine "always true" checks of architecture §8 run after every step.

| Check | Observed result |
| --- | --- |
| 300 sequences | All nine checks held. One run: 5,604 steps, 2,193 writes done, 625 repeats answered "already done", 174 stale writes refused (128 needing evidence, 23 deleted wordings, 18 changed revisions, 5 deleted arguments), 469 actions queued offline, 394 Update comparisons with a fresh reader, 287 orders published |
| Planted: skipped stamp | Caught on the 2nd sequence. Shrunk to one step: an importance vote. Postgres refused it: "must be stamped with change number 5, not 1" |
| Planted: old revision's assessments counted | Caught on the 48th sequence (fixed seed 2026). Shrunk to five steps ending in an edit and an assessment. Failed check: "Every count equals a recount of the current votes and assessments" |
| Not checked | Hiding, combining, separating, and changing sources (not built). With a random seed, 300 sequences find the old-revision bug in most runs but not all (found after 2 to 675 across five seeds), so the planted test uses a fixed seed and allows up to 1,000 |

## November 12 — Board screen (A-01, A-03, A-05, A-06, B-01, B-02, B-05, M-02, M-03, M-04)

The app's board screen (`app/web/`), in the prototype's own markup and CSS: the question, option columns, rows with their importance vote, unfolded rows with articulation votes, writing a new argument or wording, the pill and Update, polling every 3 s, and the offline queue in memory with the leave prompt. `app/e2e/` runs the November 11 *Live changes* rows and the *Live changes, structure* Edit row in Chromium, each with two people, against the real service and a real database. Every test also fails if any page logs an error.

| Check | Observed result |
| --- | --- |
| Votes | Another person's vote in their browser plus two through the API: "Families…" shows 4 in place, rows don't move, no pill until the next shared order; then "1 change · Update" |
| New argument | Written in the other browser: joins the end of No; Yes and earlier No rows unchanged |
| New wording | Reader's unfolded single-wording row goes from 1 to 2 wordings, the new one last |
| Update | Rows take the shared order; pill gone; status "Board updated." |
| Delete open card | Unfolded row shows "Deleted by omar_h" in place; pill "1 change"; gone after Update and after reload |
| Draft on a vanished argument | Draft "My sharper wording" in a row whose only wording is deleted: kept in place with the pill; after Update, in the New argument form of the same column, focused; status "That argument was deleted. Your draft is now a new argument." |
| Offline | "Offline · 1 waiting to send"; others' votes don't arrive while offline; back → "Back online · 1 sent", counts catch up, then "1 change · Update" |
| Edit (structure) | The author's edit shows in place; byline "omar_h · edited"; clicking "edited" shows the earlier wording struck through |
| Leave prompt | Closing with a vote waiting brings up the browser's leave prompt; with nothing waiting, none |
| Phone width (375 px) | Pill centred, 16 px above the bottom of the screen; no horizontal overflow |
| Accessibility | axe finds nothing at 1280 and 375 px, folded and with a row unfolded |
| Screenshots | Saved at 1280 and 375 px on macOS (`app/e2e/screenshots/*-darwin.png`) and compared on every run |
| Preview (`npm run dev`) | Five votes through the API: counts changed in place, pill after the 60 s tick, Update moved the row to the top of No. Articulation vote, new argument, phone pager: as expected. No console errors |
| Fixed on the way | The prototype's entrance animation undid the pill's centring while it played (it slid in from the right); `app/web/src/app.css` keeps it centred |
| Fixed after CI | In CI's no-network job every browser test failed: with only the loopback network, Chromium's `navigator.onLine` is false although the service on localhost answers, and the board started out "Offline", queuing every vote. The board now learns it is offline only from requests that fail (and the browser's offline event). New test: a browser that says it is offline still sends |
| Not checked | Strongest case (not built in the app). Screenshots on Linux (CI writes its own set the first time). Hidden tabs slowing to 30 s and stopping after ten minutes. A real screen reader or keyboard-only use. Real phones |

## Limits

- No participant comprehension study or retention evidence.
- No claim of full screen-reader, cross-browser, or device coverage.
- Standalone state persists in browser local storage when available; it does not sync with other users or devices. Fonts and icons need internet access.
- Material revision history and shared collaboration are not implemented. Presence, other viewers, spaces, and invitations are simulated.
- Live changes from other people are simulated (Simulate others); they don't validate an aggregation algorithm or a realtime backend.

## Re-run manually

Serve `docs/`, open `/prototype/`, and follow the workflow in `README.md`. Check changing and withdrawing all three judgments, unfolding and folding a stack in place, empty suggestion validation, adding a local version, Escape order, unavailable-source behavior, explicit order updates, and local-state restoration on reload. Check the Product Page at wide and narrow widths, including anchor navigation, image loading, and prototype/source links.
