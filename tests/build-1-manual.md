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

## Limits

- No participant comprehension study or retention evidence.
- No claim of full screen-reader, cross-browser, or device coverage.
- Standalone state persists in browser local storage when available; it does not sync with other users or devices. Fonts and icons need internet access.
- Material revision history and shared collaboration are not implemented. Presence, other viewers, spaces, and invitations are simulated.
- The order-update control simulates a change; it does not validate an aggregation algorithm.

## Re-run manually

Serve `docs/`, open `/prototype/`, and follow the workflow in `README.md`. Check changing and withdrawing all three judgments, unfolding and folding a stack in place, empty suggestion validation, adding a local version, Escape order, unavailable-source behavior, explicit order updates, and local-state restoration on reload. Check the Product Page at wide and narrow widths, including anchor navigation, image loading, and prototype/source links.
