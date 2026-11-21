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

## November 12 — Soak run and the guards (B-01, B-02, M-02)

`npm run test:soak` (`app/server/test/soak/`) runs scripted voters against the real service over HTTP, in real time, each also a reader that polls for changes as the browser does. Afterwards each catches up, presses Update, and is compared with a fresh reader, and the stored counts are recounted from the vote tables. `npm run check` runs a short version (6 voters, 25 actions each, no pauses). Two guards: the protected-files check on every pull request (`.github/workflows/guards.yml`) and the feature-to-test check in `npm run check`.

| Check | Observed result |
| --- | --- |
| Soak, 30 voters, 5 minutes (seed 1598295344, Docker) | 8,499 requests, 4,866 writes, 166 refused as needing evidence; 0 errors, 0 rows drifted, 0 readers disagreeing with a fresh one |
| Recount can fail | A count raised by one in a stamped write is reported as drifted |
| Protected files, throwaway repository | Flagged: an existing test edited, deleted, or moved; `test.skip` in a new file; a saved screenshot replaced; the policy table; a merged migration; a workflow; a plan, including a build-plan edit beyond marking an item done. Not flagged: code, new tests, new screenshots, new migrations, marking an item done, `plans/features.csv` |
| Protected files, this repository | Against `m0-5-simulation`, the M0-6 branch is flagged for `.github/workflows/check.yml` only |
| Feature-to-test | M0's features (B-01, B-02, B-03, B-05, M-02, M-01) each have a test named with the ID; a feature without one is reported |
| Not checked | The guards and nightly workflows on GitHub (they run once merged: the nightly needs the default branch, and the `builder-approved` label doesn't exist yet). Mutation testing (architecture §8, nightly; not in M0) |

## November 13 — Mutation testing (M1-1)

`npm run test:mutation` (Stryker 10.1) makes small deliberate breaks in `app/shared/src/` and the server's write path (`write-path.ts`, `votes.ts`, `writing.ts`, `order.ts`) and runs the tests against each. A break no test notices is a hole in the tests. It runs every night as its own job in `.github/workflows/nightly.yml`, and the breaks it finds go into one open issue, kept current. `scripts/mutation/survivors.ts` turns Stryker's report into the score and that list.

| Check | Observed result |
| --- | --- |
| A planted break the tests miss is reported | `app/test/mutation-run.test.ts` runs Stryker on a tiny planted project (`test/fixtures/mutation/`) whose test never tries the boundary: `age >= 18` → `age > 18` is listed as missed. Runs in `npm run check` (a few seconds) |
| The report | Score counts killed and timed-out breaks out of those that ran; breaks that don't compile don't count; an empty report has no score. Each missed break shows its file, line, and change |
| Full run on this branch (embedded Postgres, 4 runners) | 1,032 breaks in 9 min 47 s. Score **87.6%**: 904 caught, 97 ran past the tests, 31 in code no test reaches. Per file: `policy.ts` 81%, `sync.ts` 77%, `ids.ts` 71%, `writing.ts` 87%, `order.ts` (server) 85%; the rest 89–98% |
| Fixed on the way: shared code wasn't mutated for the server's tests | Stryker works in a copy whose `node_modules` links back to the original, so `@steelman/shared` loaded the unchanged code: `policy.ts` and `api.ts` scored 0%. `vitest.mutation.config.ts` points it at the copy; `api.ts` went to 93–100% |
| Fixed on the way: leaked databases | Stryker kills a runner whose tests hang on a break, which skipped its database cleanup. After about 40 such kills, macOS had no shared memory left and Postgres couldn't start, so half the breaks errored. The run now starts one Postgres for the whole run (`scripts/mutation/run.ts`) and every runner connects to it. Afterwards: no leftover shared memory or temp folders |
| Left out: the simulation and soak tests | With them a run took 15 h 23 min (each break re-ran 300 random sequences). They are random, so their catches vary night to night; 57 breaks are caught only by them. They still run in `npm run check` |
| Guards | The protected-files check flags a new `// Stryker disable` comment (in code or a new file) and a change to what `stryker.config.json` mutates; not the words quoted in a test, nor `Stryker restore`. The feature-to-test check now requires what the plan says is built: a finished milestone's features, and the features named in done items, so M1's list isn't required from its first item |
| `SIMULATION_RUNS=50` | The simulation's own coverage checks fail at 50 runs (some refusals never come up), so the nightly leaves it at 300 |
| Not checked | The nightly job on GitHub until it runs. Docker locally: Docker Desktop stopped responding during this work (`docker ps` hung), so local runs used the embedded Postgres. The 128 missed breaks are not yet fixed: the first nightly run lists them in an issue |

## November 13 — Sign-in by email code (L-01)

The service signs people in with a 6-digit code sent by email, through Better Auth 1.7.14 (`app/server/src/sign-in.ts`): a session cookie, and a username picked once after the first sign-in. Tests keep emails in memory; `npm run dev` prints the code in the terminal; a deployed service runs without sign-in until it can send email (M1-14). No screens yet (M1-4).

| Check | Observed result |
| --- | --- |
| A code | Six digits, emailed, signs the person in; works once; at 9 min 59 s it works, at 10 min 1 s it doesn't (test clock); four wrong tries then the right code works, five wrong tries cancel it; asking again cancels the old code; stored hashed |
| Sign-in emails | Five to one address in an hour are sent; the sixth is refused (429) and not sent; another address isn't affected; an hour later it's allowed again. Counted in Postgres by a hash of the address |
| Same person | The same address in other capitals signs in to the same account |
| Session cookie | `HttpOnly`, `Secure` (the site is https), `SameSite=Lax`, 30 days. Unused for 30 days it ends; in use it's extended. Signing out deletes the session and the cookie stops working. No IP address or browser kept |
| Usernames | None until picked; kept in lower case; taken in other capitals, too short, too long, a space, a symbol, and reserved names (`deleted_account`, `steelman`, `admin`, `moderator`…) are refused; once picked it doesn't change |
| Writing | A vote is made as the signed-in person. Before picking a username: reading works, writing is refused (`needs_username`). A write with the cookie from another site, from http instead of https, or with no Origin is refused (`wrong_origin`). The test-user switch still works in development and tests, and is still refused in production |
| Better Auth's other routes | Signing up with a password, deleting an account, changing email, password reset, listing sessions: 404. Only the five routes in `SIGN_IN_ROUTES` answer |
| Logs | Through a whole sign-in, wrong code and too many emails included, nothing printed holds the address or the code |
| Database | Sign-in's tables are in schema `sign_in` (session, sign_in_method, sign_in_code, sent_email); the service's role may add and delete their rows; a session needs a real account; one account per email whatever its capitals; an account can exist without a username or email |
| `npm run dev` wiring (main.ts, development, embedded Postgres) | A code request answers 200 and the code is printed; signing in with it answers 200 and sets the cookie, not `Secure` over http. In production mode the same request answers 404 and the service says sign-in is off |
| Decided with the builder (architecture Q26) | Better Auth keeps session tokens as they are, not hashed, and reads the system clock; the sign-in tests move Vitest's fake system time with the test clock |
| Not checked | A real email (no sender until M1-14). Docker locally (Docker Desktop not responding; runs used the embedded Postgres). A real browser: there are no sign-in screens until M1-4 |

## November 14 — Google sign-in (L-01)

The service signs people in with Google through OpenID Connect (`app/server/src/sign-in.ts`, Better Auth's generic OpenID Connect provider), reading Google's addresses and keys from its discovery document. The tests point the same code at a stand-in for Google running inside them (`app/server/test/support/fake-google.ts`): a discovery document, an authorization page, a token endpoint that checks the client secret, the code, the redirect address, and the PKCE proof, and the keys that sign its ID tokens. No screens yet (M1-4).

| Check | Observed result |
| --- | --- |
| Signing in | A Google-verified email makes an account (no username yet), signs it in, and goes back to the page that asked; again, it's the same account, with one Google sign-in method |
| One person | An email-code account, then Google with the same email in other capitals: one account, its username kept, a Google sign-in method added, and codes still work. Google first, then a code: one account |
| What's kept | Google's ID for the person (`provider_subject`) and the email. Not the Google name or picture (the account's name stays empty, its image null) and none of Google's tokens. Only `openid` and `email` are asked for, and a start that asks for more scopes is refused. Nothing of the sign-in is left in `sign_in_code` afterwards |
| Refused, with no session | An email Google hasn't verified (no account made; not joined to the account with that email). ID tokens signed by another key, made for another site, from another issuer, from another sign-in (nonce), or expired. Finishing in a browser that didn't start the sign-in (login forgery). Google's answer used a second time. A return address on another site (403 before Google). A start carrying anything but the provider and where to go afterwards: an ID token posted straight to the service, more Google scopes, data to keep until Google answers, a login hint (400, nothing stored). Each refusal lands back on our site with `?error=` |
| The acceptance rule | Only `email_verified: true` exactly; `false`, missing, or the string `"true"` refuse. A missing, empty, or non-string `sub`, or an email without `@`, refuse |
| Better Auth's other routes | Linking another provider, unlinking, listing accounts, Google's tokens, and a POST to the Google callback: 404 |
| No call to Google | Every request the service made during the tests went to the stand-in |
| Logs | Through Google sign-ins, refused ones included, nothing printed holds the email |
| Better Auth's origin check | Better Auth turns its own origin and return-address checks off when `NODE_ENV` is `test`; `sign-in.ts` turns them on, so tests run what's deployed. The 27 email-code tests still pass with it on |
| Second reader | A fresh agent reviewed the pull request against M1-3 and Better Auth's source: nothing blocking. Its findings were fixed here (the start's fields allowed, the scope tested, Google's own `email_verified` passed on) or listed below |
| Not checked | Real Google: the staging client's secret stays with the builder, and there are no sign-in screens until M1-4. A school Google Workspace account (architecture §8: the builder's check). Whether Google's ID tokens name their issuer as `https://accounts.google.com`, the form its discovery document gives and the only one accepted; if they say `accounts.google.com`, every Google sign-in is refused (safely) until that's allowed. The first real sign-in on staging shows which |

## November 14 — The sign-in screens (L-01, M-04)

Designed in the prototype first, one screen at a time, each approved by the builder before the next: Sign in, Check your email, and Choose a username (docs/prototype/source/steelman-refined.html). Then built in the app (`app/web/src/signIn/`), using the prototype's own CSS classes. A board now asks a signed-out person to sign in first, and someone signed in without a username to choose one. A tab acting as a test account (development and tests only) skips both, so the board's own tests and screenshots are unchanged.

| Check | Observed result |
| --- | --- |
| Design, in the prototype | Sign in: the blue dotted canvas, "Sign in" as the form's heading, Google's own G, "Email me a code", "By continuing, you agree to Steelman's Terms and Privacy Policy" (no terms yet: M-11, Planned only), and a Simulate box below the form. Check your email: the code in six boxes over one input. Choose a username: suggested from the email, lower case as typed. The builder asked for each change shown here: canvas, shadow, heading, logo, Simulate box placement, terms line, six boxes, and usernames of at most 20 characters |
| The prototype's frame | The page around the prototype sizes its frame to its content, and full-height pages used `100vh`, which inside the frame is the frame: after a window resize the frame shrank step by step and uncovered the page behind it (dark in dark mode). They now use the window's height. The cause was found and fixed; the shrinking itself wasn't seen in the browser pane, only reported by the builder |
| Browser tests (`app/e2e/sign-in.spec.ts`, 18) | Signed out, a board shows Sign in and nothing of the board, and the page asks the API for nothing of it. By email: code, username suggested from the email, the board, and a vote that's still there after a reload. A second sign-in with a username goes straight to the board. Wrong code; fifth wrong try cancels it; a new code works. A new code cancels the old, and the cursor stays in the code field, which is described by "We sent a code to …". An expired code (aged in the database) says so, and keeps saying so when typed again, until a new code is sent. A code pasted as "123 456" signs in. If the service can't say who is signed in, the page says "Couldn't reach Steelman" with Try again, instead of asking to sign in. Use a different email keeps the address. The sixth email in an hour is refused and not sent. A blank or malformed email is refused before sending. Google through the stand-in, back to the board's address, with a username suggested from the Google email. Google refusing an unverified email: back at Sign in with the message, the cursor in Email, and the address cleaned. Cancelling at Google: back at Sign in with no message. Google unavailable (the service's 404 stood in for): "Google sign-in isn't available. Use a code instead." Usernames: too short, a dot, reserved, taken; capitals become lower case |
| Accessibility and screenshots | Each screen passes the axe scan at desktop width and at 375 px, and is saved as a screenshot at both, for macOS and for Linux (the Linux set written by CI's Docker job, run 43616987949, and checked by eye, as in M0) |
| `npm run dev` (Chrome, the local database) | Asking for a code printed it in the terminal; typing it into the boxes and picking the suggested username opened the board; a vote went through with the session cookie and was still there after a reload. No console errors |
| Usernames | 3 to 20 characters, down from 30 (`app/shared/test/username.test.ts`): 20 is accepted, 21 refused. The service and the screen share the rule |
| Second reader | A fresh agent reviewed the pull request: nothing blocking. Fixed: the cursor after Send a new code, the expired test made end to end, an expired or cancelled code's message kept, a failed session check no longer shown as signed out, Use a different email disabled during a resend, pasted codes with a space, the README's sentence on a deployed service, and three paths it found untested. Its point about reserved names being suggested was checked and doesn't hold (`isAllowedUsername` refuses them) |
| Real Google, by the builder | On the builder's laptop under `npm run dev`, with the staging OAuth client: Continue with Google signed in with a real Google account. So Google's real ID tokens pass the issuer check that M1-3 listed as unchecked. (A first try failed with "Failed to validate authorization code" in the log: `.env` still held the placeholder for the secret.) |
| Not checked | A school Google Workspace account (the builder's check, architecture §8). A real phone's code autofill from Mail. A screen reader. There's no Sign in or Sign out in the top bar yet, and no invite landing (M1-5). A Google sign-in that fails on Google's side in a rare way (for example, more than ten minutes spent at Google) lands on the home page with `?error=` and no message. The saved screenshots include the development-only "Acting as" switch |

## November 14 — Roles and link sharing (H-02, H-03)

M1-5. Boards now have members and roles (Owner, Contributor, Voter), and are open either only to the people on them or also to anyone with the link, as Voter or Contributor. The server asks the policy table before every read and write (`app/shared/src/policy.ts`, `app/server/src/access.ts`). The pill under the question says who can get in and opens the prototype's Share panel, cut to what M1 has: General access and Copy link. Migration 0008 adds `board_member`, general access, and the link role; boards made before it are open only to their owner. Two decisions by the builder this session: existing tests that read signed out now read as the owner (signed-out reads are refused now), and people who came by the link follow later changes to the link role.

| Check | Observed result |
| --- | --- |
| The role matrix (`app/server/test/api/roles.test.ts`) | One test per action × role, for Owner, Contributor, Voter, signed out, and non-member, on 10 actions: read the board, read its changes, the two votes, assess, add an argument, add a wording, edit and delete one's own wording, and change who can get in. Signed out: 401. Non-member: 403, no access. Role too low: 403, not allowed. Each refused write leaves the change number as it was; each allowed write takes one. A refused read is sent only its reason. Written first and seen to fail (34 of 68, every refusal and the new setting) before the code |
| Link access | A confirmed email gets in by the link and is recorded once, by the link, with the link's role. An unconfirmed email gets nothing and isn't recorded. An invited-only board lets no one else in. Turning the link off removes link members and keeps invited ones and the owner; turning it on again doesn't bring them back until they open it. A new link role changes link members' roles and no one invited. Through real sign-in by code too |
| The setting | Only the owner; saved with a change number and an `access_changed` row in the change log (before and after, no text); sent twice, changed once; any value outside invited/link and Voter/Contributor refused. The snapshot and every poll carry the board's access and the reader's role |
| Browser tests (`app/e2e/sharing.spec.ts`, 8) | The pill opens Share; the owner's change shows at once, is saved, and reaches another browser on its next poll; a contributor sees the setting disabled with "Only the owner can change who can get in."; Copy link copies the board's address; Escape closes and puts the cursor back on the pill, as does a click elsewhere; someone who came by the link is shown "You don't have access to this steelman." after the owner turns the link off. Axe scan and screenshots at desktop width and 375 px, for macOS and for Linux (the Linux set from CI's Docker job, run 43633720377, checked by eye) |
| Found by the tests while building | The Share panel's lower half sat under the board's cards, so Copy link couldn't be clicked (the question card's layer is below the board's); it's brought forward while the panel is open. At 375 px the panel's rows ran off the screen; the link role now wraps below |
| Old tests changed, with the builder's approval | `reading`, `writing`, and `order-tick` tests read as the board's owner instead of signed out; the schema test's table list gains `board_member`; the reading test's empty answer now includes access and role. The board's saved screenshots (desktop and 375 px) were replaced, also with the builder's approval: the pill adds a row under the question, and the board below it is the same, about 35 px lower |
| Second reader | A fresh agent reviewed the pull request. Blocking, and fixed: someone opening a link board at the moment the owner turned the link off could be recorded as a member just after the link's members were removed, and keep access. Recording a link member is now one statement that holds the board's row and checks the link again; a test holds the owner's change open in the database while the visitor opens the board, and failed (200) before the fix. Also fixed: two quick changes in the panel are sent one at a time, only the latest, so they can't land out of order; a poll that started before a change no longer puts the old access back; Escape closes the panel only when the cursor is in it; the browser tests' console check ignores a 403 only on reading a board, not on a write; a stray build file. Tests added for the gaps it found: a deleted account and an unknown stored role get no access, asking for changes records a link member too, a refused reader gets nothing from either read, and a closed board refuses every write, the owner's sharing included. Left for the builder: the closed-board rule means an owner can't turn the link off once a board is closed |
| Not checked | `npm run dev` against the builder's own database (it needs `npm run db:migrate`, after which its demo board is owner-only until changed). A screen reader. Not built: Viewer and Editor (M2), faded controls by role (a Voter who writes is told only after sending), the people-with-access list and invites (H-01), a top bar with Share in it |

## November 14 — New steelman (F-01)

M1-6. The home page is now the New steelman sheet, from the prototype's, revised with the builder screen by screen: white; the options side by side like the board's columns, scrolling sideways on a phone; under them the settings, each an icon and a name: Permissions (works: anyone with the link as Contributor by default, the builder's choice), Space and Collaboration rules (shown where they'll be, marked Later); a + on Create steelman. Boards get + New steelman in the top bar. Creating a board makes its maker the Owner. `npm run db:seed` also adds the prototype's seven example boards and their 17 people.

| Check | Observed result |
| --- | --- |
| API (`app/server/test/api/new-board.test.ts`, 21) | Written first and seen to fail (14 of 15 at first; the ID test passed already, since M0 made the IDs). A question and two to four options make a board; the answer names it; its maker opens it at once as Owner, with the options in order and no arguments; a board starts open to anyone with the link as Contributor, or as its maker chooses; the change log holds `board_created` with no text; text is tidied; each board gets its own ID; signed out is refused. Refused, making nothing: no question, a question over 200 characters, one option, five options, two options with the same name in other capitals or spacing, an empty option, one over 80 characters, any other field (the ID is the service's), access outside invited/link and Voter/Contributor. The ID is 72 random bits from the system's random numbers (1,000 made, all different, 12 characters) |
| A non-member | A test account (no confirmed email) can't open a new board: 403, no access. With the builder's default, anyone signed in with a confirmed email can, as the link intends |
| The seed (`app/server/test/api/example-boards.test.ts`, 10) | Written after the seed, against the tests-first rule; to check them, three breaks were planted in the seed one at a time (no importance votes, boards added twice, the private board shared) and each made a test fail. Seven boards at fixed links, each one the sheet could have made; each opens for its owner with the prototype's question, options, and wordings; importance is the prototype's score in votes, one per four points; each option's arguments keep the prototype's order; open boards are link/Contributor and Denver is its owner's alone; the demo board's people aren't made twice; the prototype's "you" is `riley_park`, not the builder's name; running it again adds nothing |
| Browser tests (`app/e2e/new-steelman.spec.ts`, 12) | The home page is the sheet, cursor in the question; Enter moves to the first option; making a board opens it, with the options as columns, owned by its maker (the Share setting is enabled); + New steelman on a board leads to the sheet; Permissions set to Invited only makes a board whose pill says so; Space and Collaboration rules marked Later; options added up to four and removed; the sheet says what's missing (question, second option, a repeated name) and puts the cursor there, and nothing is made. Axe scan and screenshots at desktop width and 375 px |
| Old test changed, with the builder's approval | `app/web/test/app.test.tsx` checked the placeholder home page's "Steelman" heading, which this replaces; it now checks the home page renders with the top bar's wordmark |
| Saved screenshots | The board and Share screenshots (desktop and 375 px) were retaken to show + New steelman, with the builder's approval: the button changed under 1% of their pixels, so they still passed, but no longer showed the real top bar. Retaking them showed the button's text underlined like a link; fixed. The Linux set (New steelman, board, Share) came from CI's Docker job, runs 43646334171 and 43648599525, checked by eye |
| Second reader | A fresh agent reviewed the pull request: nothing blocking. Fixed: the seed now finds test accounts whatever their capitals, and refuses (checking every name before writing) to write as a real account that has one of its usernames; Enter while an input method is composing no longer jumps out of the question (a test dispatching that Enter failed before the fix); the field an error is about is marked invalid and described by the message, which is announced again on each try; an answer the app can't read no longer leaves Create stuck; tests added for a board made Invited only refusing a confirmed stranger, for making a board over a real session (from another site, or before a username, refused), for being offline, and for the seed's two fixes. The builder decided making a board stays not safe to send twice, and `plans/architecture.md` ("Links and IDs") now says so. Left: a seed run that fails partway leaves that board half-made (start from a fresh database); option names aren't compared after Unicode normalization; the "Acting as" switch (development only) makes the top bar scroll sideways at 320 px |
| Not checked | `npm run db:seed` against the builder's own database (the seed function is tested; the command around it isn't). A screen reader. Not built: question hints (F-02), drafts (F-03), spaces and their canvases in the sheet, collaboration rules. Sending Create twice (a lost answer and a retry) makes two boards |

## November 14 — Product Page: how the app works, and the Build 2 log

Checked by the coding agent in a browser at 1024 px and 375 px, served from `docs/` on `127.0.0.1:8000`. No feature changed.

| Check | Observed result |
| --- | --- |
| App screenshot | `docs/assets/app-vote.jpg` is the app from `npm run dev` on `main` (after M1-6), board `example-0001`, acting as the test account `dev_tester`. Pressing "More important if true" on the first argument sent `PUT /api/boards/example-0001/arguments/…/importance` with `{"value":1}`; the service answered 200 `{"status":"done","seq":135}` in 37 ms and the count read 12. The vote was withdrawn afterwards |
| Architecture diagram | `docs/assets/architecture.svg` loads; it is the drawing from `plans/architecture-diagrams.html` with its styles inside. At 375 px it scrolls sideways inside its frame and the page doesn't; the link opens it at full size |
| Build log | Build 2 entry (November 7–14) above Build 1's. Its counts come from `git log origin/main --since=2026-11-07T00:00` (89 commits without merges, on seven days), `gh pr list --state merged` (36), and M1-6's `npm run check` (461 tests, 54 browser tests) |
| Page | No horizontal overflow at either width; no console errors |

Not checked: the published page (this isn't merged yet). The screenshot shows the dev-only "Acting as" switch, not a real sign-in. The build log's hours are an estimate: the builder's 363 typed messages in the local Claude Code session files from November 7 to 14, grouped into sittings with gaps up to 20 minutes, come to 23.7 hours (31.1 with gaps up to 45 minutes). The costs are as the builder reported them.

## November 14 — Analytics on the app (M-08)

Analytics on the app, brought forward from M1-13 for Build 2: the first-visit notice, Global Privacy Control, Do Not Track, and masked typed text. The privacy page rewrite and the Content Security Policy stay in M1-13.

| Check | Observed result |
| --- | --- |
| Tests first | `server/test/api/config.test.ts` (2), `web/test/analytics.test.ts` (5), and `e2e/analytics.spec.ts` (6) were written first and all failed (404 on `/api/config`; no notice), then passed |
| Real PostHog, locally | With `POSTHOG_KEY` in `app/.env`, `npm run dev`, board `example-0001` acting as `dev_tester`: the notice showed; PostHog loaded from `us-assets.i.posthog.com`, with `environment: local`; session recording started; two clicks sent events to `us.i.posthog.com/e/` and replay to `/s/`. No console errors |
| Turn off, real PostHog | Turn off opted PostHog out and stopped recording at once, and stored `off`. After a reload, `window.posthog` was undefined and no request went to PostHog |
| No key | A service with no key: no notice, and no request to any other address (browser test) |

Not checked: the events in PostHog's own dashboard (needs the builder's PostHog account); Safari and Firefox; a deployed service (M1-14).

## November 14 — PRD v2: biggest risk and cost per run

Checked by the coding agent in a browser at 1024 px and 375 px, served from `docs/`: both sections render, no horizontal overflow, no console errors. No feature changed.

The risk's evidence is from M0's records (the simulation's 9 checks over 300 sequences; the 30-voter, 5-minute soak and recount). The costs are estimates: hosting from `plans/architecture.md` "What it costs" (the database figure not yet confirmed in Google's calculator); the AI check assumes about 5,000 tokens in and 1,000 out, at Anthropic's list prices on Nov 14 (Haiku 5.5 $0.10/$0.50, Opus 5.5 $4/$20 per million tokens).

Revised the same day: the risk is named "Technical complexity of live collaboration"; Other risks lists two Legal and one Cost risk, each labeled; Cost details (folded under the summary) breaks the cost down by month and by action. Rechecked at 1024 px and 375 px: the two detail tables' columns line up, the rows stack on a phone, no horizontal overflow, no console errors. The free-plan behaviours (PostHog drops data over its free tier; Resend refuses sends over its quota) are from their pricing and quota pages, Nov 14.

## November 14 — Product Page: PostHog screenshots; README

The builder's two PostHog screenshots, cropped to drop PostHog's "invite your team" banner, are on the Product Page under Analytics: product analytics for the last 7 days (12 active users, 27 sessions) and a session replay of the Product Page. Checked at 1024 px (side by side) and 375 px (stacked): both load, no horizontal overflow, no console errors.

The root `README.md` is rewritten for Build 2: the app and how to run it, the Product Page and prototype, and a current project map. It no longer says there is no backend or carries Build 1's hand-in notes.

## November 14 — Product Page: Google sign-in recording

The builder's screen recording of signing in to the local app with Google is on the Product Page, first under How the app works. Made from the 18.5-second original: cut to the first 10 seconds (before a macOS screenshot panel appears at about 14 s), the browser's tab strip cropped off, sound removed, scaled to 1440 px wide (H.264, 190 KB). Google's account list showed five of the builder's email addresses, so it is blurred for exactly the time Google's page is on screen (2.08–6.3 s, found from the frames' brightness); every frame at both edges was checked and none shows the list. Checked on the page at 1024 px and 375 px: the video loads (10 s), no horizontal overflow, no console errors.

## November 14 — Product Page: a shorter build log

The build log now runs oldest first: Build 1, then Build 2 by date, each with short rows for what was learned, problems, time, and cost. Build 1's entry keeps what it said, shorter. Build 2's counts are from `git log origin/main --since=2026-11-07T00:00 --no-merges` (95 commits on seven days) and `gh pr list --state merged` (39 since Nov 7). The footer's "Run locally" link now points at the README's "Run the app". Checked at 1024 px and 375 px: no horizontal overflow, no console errors.

## November 14 — Links (M-06, A-02, A-12)

M1-7. Every board and version has an address: `/b/<board>` and `/b/<board>/v/<version>`, paths rather than the prototype's `#b=…&v=…`, so Google sign-in (which is sent the path) comes back to the very version. A card opens by its wording, as in the prototype, showing its context (evidence comes with M1-9); the open version is what the address follows. Each card has the prototype's ⋯ menu, holding only Copy link for now (the rest comes with M1-10).

| Check | Observed result |
| --- | --- |
| Tests first | `app/web/test/links.test.ts` (5) and `app/e2e/links.spec.ts` (15) were written first: the unit tests failed (no `links.ts`), and 14 of the 15 browser tests failed; the one that passed already was a board's link opening the board. Two more came with the second reader's fixes (17 now) |
| Address follows | Opening a card's wording → `/b/<board>/v/<version>`; closing it, or folding the row it's in → `/b/<board>`, and unfolding the row again doesn't reopen it; on a phone, switching to the other side closes it. One version open at a time. The address changes in place (`history.replaceState`), as the prototype's does when a card opens |
| Open a version link | A row's second wording: the row unfolds, the card opens, comes into view, and rings for 1.4 s (the tests record the ring as it happens, so a slow run can't miss it); the status line says "Opened “…”." A row's leading wording opens in place, row folded. On a phone (375 px), the link shows the version's option's column |
| Reload, Back, Forward | Home → board → open a card: reload keeps the card open; Back goes to New steelman (`/`); Forward comes back to the board with the card open |
| Copy link | ⋯ → menu "Version options", cursor on Copy link; it copies `http://…/b/<board>/v/<version>`, says "Link copied.", closes, and puts the cursor back on ⋯; the address stays the board's. Escape, or a click elsewhere, closes the menu; Tab closes it and moves on from ⋯ to the card's wording; scrolling the row sideways or resizing the window closes it |
| Deleted version | A version its author deleted, and an ID never on the board: the board opens with "That version was deleted." and Dismiss under the question, the cursor on Dismiss, the status line saying "That version was deleted. Opened “…”.", and the address cleaned to `/b/<board>`. Dismiss puts the cursor on the question |
| Unknown board | `/b/nosuchboard1`, `/b/nosuchboard1/v/x`, and `/b/x/y/z` → "This steelman doesn’t exist", with New steelman (M1 has no list of boards, so not the prototype's "Go to your steelmen") |
| Signed out, invited-only board | A version's link: Sign in, nothing of the board shown and nothing asked of the board's API; after the email code, the board, the address kept, the version open and ringed |
| Accessibility | Axe scan with a version's menu open, with the deleted-version note, and on the missing board, at desktop and 375 px: no violations, no sideways overflow. The menu hangs from the board's `main` region (the prototype hangs it from the page root, outside any landmark, which axe flags) |
| By eye, `npm run dev` | The builder's local demo board (invited only; acting as `maya.chen`, the one account it lets in; nothing changed): card opens with "Context · No context yet.", address follows, menu under ⋯; the note and the missing-board page as above. No console errors besides the expected 403s and 404s |
| Analytics | A card's wording is now a button, and PostHog's autocapture sends a clicked button's text, which here is what someone wrote. The button is marked `ph-no-capture`, so clicking it sends nothing that clicking the old text didn't (a browser test checks the mark) |
| Second reader | A fresh agent reviewed the pull request: nothing blocking. Fixed: Tab didn't close the menu; the menu stayed put when its row scrolled sideways; a version closed by folding its row came back when the row unfolded, and on a phone stayed in the address while its side was hidden; Dismiss left the cursor nowhere, and opening a link announced nothing; the test fixture's allowance for a missing board's 404 applied to every board test (now only to those that ask, `missingBoards`); the ring was checked after the fact, which a slow run could miss. Left: the menu has no arrow keys (it has one item); a malformed `/b/…` address asks a signed-out person to sign in before saying the board doesn't exist, as for any board link |
| `npm run check` | All unit, API, and browser tests pass, the saved screenshots included |
| Saved screenshots | The ⋯ on every card changed under 1% of the board and Share screenshots (desktop and 375 px), so they still passed but no longer showed it. Retaken with the builder's approval (Nov 14), as in M1-6: the macOS set locally, checked by eye (the ⋯ on every card, nothing else changed); the Linux set from CI's Docker job (run 43663188362), checked by eye |
| Not checked | Safari and Firefox; a screen reader. A deployed service: it must send the page for any `/b/…` path (M1-14). Whether PostHog's `history_change` page views count each card opened as a page view, now that the address changes with it: the address carries board and version IDs, as it already carried the board's. The builder accepted this on Nov 14 |

## November 14 — Sources, on the server (C-01, C-03)

M1-8. Sources through the API, with no screens yet (the card's evidence and source form come with M1-9). Four writes, each through the one write path: add a new source to a wording (`POST …/versions/<id>/sources`), cite a source already on the board on another wording (`PUT …/versions/<id>/sources/<source>`), take one off a wording (`DELETE` the same address), and edit one (`PUT …/sources/<source>`). As in the prototype, anyone who can contribute adds a source, and only the person who added it edits it. Taking a source off a wording is for whoever added it, the wording's author, or the Owner: the prototype has no citing, so anyone could put a source on someone else's wording, and the builder chose this on Nov 14 (the Editor takes the Owner's place when M2 adds it). That is a new row in the policy table (`uncite`), with `anyoneFrom` for the least role that may do it to anyone's item. Nothing leaves a board, so a source taken off its last wording stays, cited by nothing.

| Check | Observed result |
| --- | --- |
| Tests first | `app/server/test/api/sources.test.ts` (58 tests, 62 after the second reader and the builder's decision) was written first: 56 failed (no routes); the 2 that passed were "not found" cases, which a missing route also answers |
| New revision | Adding, citing, or taking off a source saves revision n + 1 of the wording, with the same text and `why` = `sources_changed`; its yes and no go to 0 and the reader's own assessment is gone, while importance and articulation votes stay |
| Shared source (Q10) | Changing its finding, where to find it, what it backs up, or its limits gives every wording whose current revision cites it a new revision (`source_changed`), each starting over; a wording that cites nothing, one that cited it only in an earlier revision, and a deleted one are left alone. Fixing only the name changes the source and starts nothing over |
| History | The old revision's assessments stay in the `assessment` table, keyed to the revision they judged, and stop counting. An assessment sent for the old revision is refused with the wording as it is now (`revision_changed`) |
| "Yes" needs evidence | Refused on a wording that cites no source, and after its only source is taken off (`needs_evidence`); "no" is accepted. Adding a source makes "yes" possible |
| Sent twice | Each write sent again answers "already done" and uses no change number: a new source by its ID (also after it was taken off: a repeat doesn't put it back), citing, taking off, and an edit (including one only tidied to what the source already says). An ID someone else used is refused (`id_taken`) |
| Links | Where to find it is kept as typed. It is a link only when it is an http or https address: `javascript:…`, `data:…`, `ftp://…`, "Chapter 3, page 41", and empty all come back with `link` null. Text is tidied as the prototype does; a missing name or finding, anything too long, or a field nobody defined is refused (400) |
| Roles | One test per action × persona: owner and contributor may, a voter may not (`not_allowed`), signed out (401) and a non-member (403) may not, and a refused write uses no change number. On a closed board all four are refused. Editing someone else's source: `not_author`. Taking one off: the wording's author may, when someone else cited it there; the person who cited it, having added neither, may not; the Owner may on any wording |
| Author and editor rules | A pass over every editing action, at the builder's request: a wording is edited or deleted only by its author, a source edited only by whoever added it, as in the prototype, where an Editor's powers over others' content are hiding, restoring, and held contributions (M2), never editing or deleting it. Nothing else needed changing |
| Change log | `source_added`, `source_cited`, `source_removed`, `source_edited`, by ID and revision number only; a test checks the source's text isn't in the row |
| Live updates | Readers asking for changes after an edit get the source and every wording it revised |
| Edits around a source change | Changing a wording's sources saves revisions too, so an author's edit is now refused only when another edit came after the revision it started from, not when someone added a source meanwhile. The "edited" mark shows the wording before the latest edit, not the revision before this one (a sources change has the same text, so it shows no mark). The existing edit tests pass unchanged |
| Second reader | A fresh agent reviewed the pull request: nothing blocking. Fixed: a hidden wording had no tests (now: it takes no new source, and still starts over when a source it cites changes); `source_edited` now logs each revised wording's new revision number, not only its ID. It asked who may take off a source someone cited on a wording they didn't add it to; the builder answered (above). Left: the offline queue assumes its edit saves revision `baseRev + 1`, which a sources change in between now breaks; that is safe (the next queued action is refused and comes back) and matters once the web app edits offline. Two boards using the same new source ID at the same instant would give the second a server error rather than `id_taken`, as new arguments already can |
| `npm run check` | Types, lint, and all 535 unit, API, and simulation tests pass. Browser tests: all 77 passed before the policy change; after it, 76 passed and `leave-prompt.spec.ts` "Leaving with nothing waiting brings up no prompt" failed once, then passed run alone. Nothing it covers changed (the web app doesn't read the policy table), so it looks flaky; reported here, not counted as passing |
| Not checked | The simulation doesn't yet play source actions (its oracle for edits assumes no other kind of revision); adding them changes an existing test, so it needs the builder. Reporting a source unavailable (C-02, T3) has no route yet; its rule for "yes" is tested with the database flag. Sources aren't in the example boards yet (with M1-9, when cards show them) |

## November 15 — Guards: a pending status instead of a failed run

At the builder's request, to cut GitHub's failure emails (6 of the last 9 were this check failing on purpose before the label was added). The protected-files check now passes as a job and posts a commit status, "builder approval": pending until the builder adds `builder-approved`, success after or when nothing protected changed. `main` requires that status instead of the job.

| Check | Observed result |
| --- | --- |
| On its own pull request (#46) | The job passed (so no failure email) and listed `guards.yml`, `architecture.md`, and `build-plan.md`; the commit status "builder approval" is pending: "Protected files changed: the builder reads the list and adds builder-approved." |
| Not checked by the agent | Adding the label turning it to success: agents never add it. A run where the check can't run, which fails the job and posts no status |
| The builder's part | Add "builder approval" to `main`'s required checks before merging; afterwards, remove "protected files", which now always passes |

## November 15 — Card details: evidence, credibility, assessing (A-02, B-03, B-04, C-01, C-03)

M1-9. An open card shows its evidence, the form to add or edit a source, and the yes/no assessment; the meter on its face counts the reader's own assessment as soon as it's made. With the builder, Nov 14 and 15, three things changed from the prototype: "Backs up" and "Limits" are gone and who added each source is shown instead; the form asks for a Link (http or https, with a link icon), a Title, and an optional Description, in that order, as Google Docs' Insert link and Wikipedia's citation tool lead with the link (these two from memory, not checked live); and reset warnings say the "credibility score resets", not "N assessments start over". The assessment asks "Does the evidence back this wording?" with plain Yes and No buttons, as GOV.UK asks a yes/no question (checked on its design system's question-pages pattern); the prototype's hidden labels ("Supported as worded") were dropped so what a screen reader says matches the button. The first example board now carries the prototype's sources and assessments.

| Check | Observed result |
| --- | --- |
| Tests first | `app/e2e/card-details.spec.ts` was written a piece at a time, each before its component: the evidence list, then the form, then assessing. The five assessing tests failed but one: a source edit resetting every card citing it passed already, since the server does it (M1-8). 26 now. The seed's three new tests were written after its data |
| Evidence | An open card lists its sources, each with who added it ("You" for your own); one opens to its link (`target=_blank`, `rel="noopener noreferrer nofollow ugc"`) and description. Text that isn't an http or https address (`javascript:…`, "Chapter 3, page 41") shows as text. No sources: "No sources yet." and no count on the face. A source someone else adds shows with the next poll |
| Source form | Link, Title, Description (optional), in that order. Link and title are required, and a link must start with http:// or https://; problems show in red text in the form ("Links start with http:// or https://. Add a title."), the fields are marked and described by it, the cursor goes to the first, and nothing is sent. Cancel and Escape close it and put the cursor back on Add a source. A new source arrives open, with the cursor on it |
| Reset warnings | On an assessed wording the form says "The credibility score resets when you save."; editing a source warns only once its link or description differs from what it was, since only those reset the score, and a source cited on two assessed wordings then says "Credibility scores reset on 2 wordings when you save."; none on a wording nobody assessed. A source kept from before the form asked for links (text where the link goes, as on the example board) can have its title fixed without adding one, and nothing resets. Remove on an assessed wording asks for a second click ("Remove · credibility score resets") |
| Who may | Edit only on your own source; Remove also for the wording's author and the Owner, nobody else (jordan_w, omar_h, maya.chen, tess.b) |
| Assessing | Yes is off without a source that can be opened; No always works. While the reader's own change to that wording's sources is on its way, Yes, No, and Undo wait, since it makes a new revision and an assessment sent meanwhile would be refused. Yes fills the meter at once (100%, 1, few) and is kept after a reload; No switches it (0%); Undo withdraws it, the cursor going to the button that was pressed |
| Two people | tess.b assesses; jordan_w edits the source's link in his browser; tess.b's meter goes to Unreviewed with the next poll and her Yes is no longer pressed. A source cited on two assessed wordings, edited once: both meters go to Unreviewed |
| Stale assessment | The wording is edited (through the API: editing from the card comes with M1-10) after tess.b opened it; her Yes is refused (`revision_changed`), the card shows the new wording and "This wording changed; take another look.", the meter stays Unreviewed, and the status line says the same. Answering again counts and clears the message. The browser logs the 409; the test expects exactly that one console error and no other |
| Example board | "Is open-weight AI a smart bet for China?" cites the prototype's 18 sources on its 13 wordings, as the prototype words them (its locators are descriptions, so they show as text), each added by the first person whose wording cites it, or riley_park for the prototype's "you". A source cited twice is one source. Its yes and no counts are the prototype's, scaled to the seed's 17 people where they'd need more (14/6 → 12/5). Left out: the prototype's unavailable source, since marking one unavailable comes with M2 |
| Analytics | A source's row is marked `ph-no-capture`, as the card's wording is (M1-7), so a click on its title or link sends PostHog nothing someone wrote (a browser test checks the mark) |
| Saved screenshots | New: an open card with a source open and Yes pressed, and the same card with the source form showing its warning, at desktop and 375 px (`card-open-*`, `card-form-*`). The macOS set made locally and the Linux set from CI's Docker job (run 43769939415), both checked by eye. At 375 px "Add a source" shows its hover underline, the same on both systems, since the last click leaves the pointer there. No existing screenshot changed |
| Accessibility | Axe at desktop and 375 px with a source open, with the form open showing its warning, and with the changed-wording message: no violations, no sideways overflow |
| Second reader | A fresh agent reviewed the pull request. Blocking, fixed: a click on a source sent its title, link, and adder to PostHog; no saved screenshots, which the item asks for. Also fixed: an example board's source (text where the link goes) couldn't have its title fixed without typing a link, which would reset its score; the edit warning showed when nothing would reset, and missed the reader's own pending assessment; an assessment made while the reader's own source change was on its way was refused as if someone else had changed the wording; Remove with the form open lost the cursor; architecture.md still had the old changed-wording text. Left, as recorded under Not checked: Add a source and Yes/No don't hide for a role that can't use them |
| Late answers (found while testing) | "Undo withdraws it" failed twice in about six runs: an answer to a poll asked before Undo was sent cleared Undo from what the reader had sent, so No showed pressed until the next poll. Each answer now clears only what was sent before it was asked. A browser test holds the first answer back and failed every time before the fix; the card and live-change tests then passed twice over |
| `npm run check` | Types, lint, all 540 unit, API, and simulation tests, and all 111 browser tests pass, no existing saved screenshot changed. The first run failed the feature-to-test check: marking M1-9 done needs a test named A-02, and two card tests now carry it |
| Not checked | Safari and Firefox; a screen reader. The simulation and soak test don't play source actions yet: they throw if asked (`world.ts`, `soak.ts`), which needs the builder. Undo after Remove comes with M1-10. Voters still see Add a source, which the service refuses, as with the other forms. The meter's form (bar or ring) is unchanged and still open |

## November 15 — The card menu (A-02, A-05, A-06, A-12)

M1-10. A version's ⋯ menu offers what the reader's role allows, from the shared policy table: everyone gets Copy link first, as GitHub's comment menus have it (from memory), which also leaves M1-7's menu tests as they were; the author then gets Edit wording and context and Delete version (Delete argument on a row's only wording); anyone else who may write gets Suggest a revised version; a voter only Copy link. The Owner can't edit or delete someone else's wording, as the service already refuses. Delete goes last, as GitHub's menus put danger items (checked on Primer's action-list guidelines); the Undo bar is a few words and Undo, like Gmail's "Conversation moved to Trash · Undo" (from memory, not checked live). The prototype's menu notes ("You wrote this version.") were left out, since the byline already says who wrote it. The edit warning says "The credibility score resets when you save.", as the source form does, and only once the text changes.

| Check | Observed result |
| --- | --- |
| Tests first | `app/e2e/card-menu.spec.ts` (18 tests, 20 after the second reader), `app/web/test/card-menu.test.ts` (7), and three `leaveOut` tests in `shared/test/sync.test.ts` were written first and all failed; the browser spec's one other failure was its own bug ("Your version" also matched "What your version improves"), fixed with exact labels |
| What the menu offers | As maya.chen on her own wording: Copy link, Edit wording and context, Delete version; on jordan_w's only wording, as him: Delete argument last; maya.chen (Owner) and jordan_w on someone else's: Copy link, Suggest a revised version. Nothing about combining, separating, reporting, or AI. Arrow keys, Home, and End move between items; Escape and Tab as before (M1-7) |
| Edit | Opens in the card's place with the wording and context, the cursor in the wording. Save shows the new wording at once, marked "edited", with the cursor back on it; jordan_w sees it with the next poll, and "edited" shows the old wording struck through; a reload keeps it and its new context. An assessed wording warns once the text differs, not before or when changed back, and saving resets its meter to Unreviewed while the row keeps its place (importance votes stay). Escape and Cancel discard ("Changes discarded."), the cursor back on ⋯; Save with nothing changed sends nothing ("No changes."); an empty wording can't be saved; a wording in an unfolded row edits in place too |
| Delete and Undo | The wording leaves at once; an Undo bar sits under its row (or where the row was, for Delete argument), the cursor on Undo, the status line saying "Version deleted. Undo is available for ten seconds." Nothing is sent for ten seconds (a test counts DELETE requests), then one DELETE; jordan_w then sees it marked "Deleted by omar_h", while the author's own board neither marks it nor counts it on the pill. Undo at nine seconds puts it back where it was, the cursor on its wording ("Restored."); nothing is sent then or later, and it's there after a reload. A second delete sends the first at once; Undo then takes back only the second |
| Closing the tab | Closing the tab during the ten seconds asks nothing and sends the delete (`fetch` with `keepalive` on `pagehide`); the service has it deleted afterwards. Leaving the board in the app sends it too. Offline, the browser's leave prompt asks first, since it couldn't be sent. When the bar leaves with the cursor on it, the cursor goes to the row it sat under |
| Suggest a revised version | Unfolds the row and opens its draft holding that wording, the cursor in it; adding it puts the new version in the row. A draft already started in that row is kept, not replaced |
| Existing tests | The first full run failed two of M1-7's menu tests (`links.spec.ts`), which expect Copy link first; with Suggest a revised version first, someone else's menu didn't open on it. Copy link now leads every menu, as GitHub's comment menus do; those tests are unchanged and pass |
| Second reader | A fresh agent reviewed the change: nothing blocking. Fixed: a delete made offline was lost if the tab closed (now the leave prompt asks); the cursor fell to the page when the Undo bar left; the bar could vanish if Update took off the row it sat under (it now goes first in the column); the edit warning wasn't tied to Save for screen readers (now its description); a unit test's name. Left, below: the points about a closed board, phones killing a background tab, and the label for an argument with a wording still on its way |
| `npm run check` | Types, lint, all 550 unit, API, and simulation tests, and all 131 browser tests pass on Node 22; no saved screenshot changed. The card menu and leave-prompt tests also passed twice over |
| In the app | Checked in the browser on the demo board as maya.chen and jordan_w: the menu (Delete's icon red, as in the prototype), the edit form with its warning, and the Undo bar, then Undo |
| Accessibility | Axe at desktop and 375 px with the author's menu open, the edit form showing its warning, and the Undo bar: no violations, no sideways overflow |
| Not checked | Safari and Firefox; a screen reader. The bar's ten seconds don't pause while the cursor is on Undo. A phone that ends a background tab without `pagehide` loses a held delete. The menu doesn't know when a board is closed (nothing closes one in M1), so it would offer what the service then refuses. "Argument deleted." is decided from the wordings on screen, so a wording the reader added offline and that hasn't come back yet isn't counted. Opening Suggest or another Edit while editing drops the edit without a word. Undo after removing a source isn't part of this item: Remove still asks for a second click on an assessed wording. The card shows the reader's own edit as revision n + 1 until it's back. If someone changes the wording's sources before it arrives, the service saves the edit as n + 2: the card shows it from the next poll, and an assessment the author makes in between is refused as stale ("This wording changed; take another look.") |

## November 15 — Undo for removing a source, and a dropped answer (C-01, C-03, B-03)

Not a backlog item: the builder asked for it after M1-10 and chose, of three ways offered, that Undo replaces Remove's second click, as Gmail and GitHub use Undo instead of asking first (from memory). Remove now takes the source off at once and holds the removal in the browser for ten seconds with the same Undo bar as a deleted wording, under the wording's row; it's sent after the ten seconds, or at once if the tab closes. On an assessed wording the bar says "Source removed. The credibility score resets."

| Check | Observed result |
| --- | --- |
| Existing tests changed (the builder, Nov 15) | Three tests in `app/e2e/card-details.spec.ts`, each marked with a comment: the second-click test became "Remove takes the source off this wording at once, with Undo…"; "Remove while the form is open" now expects the cursor on Undo, not Add a source; "Yes and No wait" now holds them through the ten seconds as well as while the removal is on its way. All three failed before the change, as did the two new tests |
| Remove | The source leaves the card and its count at once; the cursor goes to Undo; the status line says "Source removed. The credibility score resets. Undo is available for ten seconds." Nothing is sent for nine seconds; then one request, and with the next poll the meter is Unreviewed. On an unassessed wording the bar says "Source removed." |
| Undo | At nine seconds: the source is back, the cursor on its row ("Restored."), nothing sent then or later, still there after a reload |
| Closing the tab | Within the ten seconds, the removal is sent at once (`keepalive`), and the service has the source off the wording |
| Yes and No | Off from Remove until the removal is back, through the ten seconds and while it's on its way |
| Sent and not yet back | After the ten seconds, while the removal is on its way, the source stays off the card (found by the second reader: it came back until the next poll), and when the bar leaves with the cursor on it, the cursor goes to the card's Add a source |
| A dropped answer (found while testing) | "Undo withdraws it" (M1-9) failed twice in full runs: when a new answer replaced one still being sent, the queue dropped the new one once the first was back, by its place in the line, so Undo was never sent and No stayed pressed. A new browser test holds the first answer's request and failed every time; the queue now takes off what was sent by the action itself. Both tests then passed five times over |
| Second reader | A fresh agent reviewed it: nothing blocking. Fixed: the source coming back while the removal was on its way; where the cursor goes when the bar leaves; C-01 and C-03 kept their earlier evidence. Left: Undo after closing the card puts the cursor on the row, not the source |
| `npm run check` | Types, lint, all 550 unit, API, and simulation tests, and all 134 browser tests pass on Node 22, run alone. (A run made while another browser run shared its results folder failed three tests on missing trace files, not counted) |
| Not checked | Safari and Firefox; a screen reader. As for a deleted wording, the ten seconds don't pause while the cursor is on Undo |

## November 15 — Strongest case (E-01)

M1-11. A Board / Strongest case switch in the header shows each option's top three arguments, each in its best wording, with its credibility meter, its importance, and "best of N" when it beat other wordings; choosing one opens it on the board. The two plans disagreed on which order it follows: architecture.md §3 said the board on screen, the build plan the newest shared order. The builder chose the newest shared order, so the case is current even while the board waits for Update, and architecture.md now says so. The markup, wording, and icons are the prototype's. Before building, Primer's segmented control (its file view switches Preview, Raw, and Blame of one file, checked on primer.style) confirmed a two-button switch with icons and labels for two views of the same content; Kialo's tour (checked) ranks arguments by impact but has no separate summary view, so the prototype's own layout stands.

| Check | Observed result |
| --- | --- |
| Tests first | `shared/test/strongest-case.test.ts` (7) and `app/e2e/strongest-case.spec.ts` (6, 8 after the second reader) were written first; the unit tests all failed until `strongestCase` existed |
| The rule | Top three from the newest shared order the reader holds, even when the board on screen is in another order (a test where the two differ); each in the best live wording; deleted, combined, hidden, and emptied arguments left out; what the order hasn't ranked yet comes after, in the order added; the reader's own deletions left out at once |
| The switch | Board is pressed on opening; Strongest case shows "The case for Yes" and "The case for No", ranked 1–3, "Its 3 most important arguments, in the best wording", importance ("Importance: 3" to a screen reader), and "best of 2 wordings" only where there were others; the status line announces each view. Back on Board the rows are as they were |
| Newer order | After three votes and the next order, the board still shows the old order with "1 change · Update"; Strongest case already shows the new top argument, and the pill offers no Update there; back on Board the pill returns |
| Opening one | Choosing an argument goes back to Board with that wording open and the cursor on it; a best wording that isn't first in its row on screen opens with the row unfolded |
| Thin sides | A side with four says "1 more argument on the board."; a side with one says "Only one argument so far. This side needs a stronger case." |
| Phone | At 390 px both cases show, one under the other, within the screen. On a phone the header shows the logo without "steelman." while a board is open, as the prototype does, which makes room for the switch (icons only there, as in the prototype) |
| Second reader | A fresh agent found nothing blocking. Fixed: switching kept a card open (and the address pointing to it) and an edit open whose text was then lost unannounced, so Strongest case now closes what's open, as the prototype does, and says "Your changes were discarded." if an edit was open (drafts of new arguments and wordings are kept); the Undo bar now shows above the cases; importance and wordings read as words to a screen reader; the switch no longer shows on a missing board's page; a test name claimed more than it checked |
| `npm run check` | Types, lint, all 557 unit, API, and simulation tests, and 141 of 142 browser tests pass on Node 22; `git diff --check` is clean. The one failure is H-02's sharing test (`sharing.spec.ts:30`), which this change doesn't touch: the owner's screen shows the new access at once, and the test then reads the service, which can be before the save lands. It passed in the run before, and 20 of 20 times alone on this branch and on main; left as it is for the builder (rule 9). An earlier run failed six 375 px checks because the switch made the header overflow; hiding the wordmark's text there, as the prototype does, fixed them. No saved screenshot was replaced: the header change stays within the 1% the comparisons allow |
| Accessibility | Axe on Strongest case at desktop width: no violations. The 375 px scans of the board, card, menu, and links pass with the switch in the header |
| Not checked | Safari and Firefox; a screen reader. Escape doesn't step back from Strongest case to Board as it does in the prototype, and the prototype's zoom animation between the views isn't built. A source form left open is closed by switching, losing what was typed |

## November 15 — Download your data and Delete account (M-07)

M1-12. A round account button in the header (the prototype's, with a person icon since there's no avatar yet) opens Your account: the username, the email, how they sign in, Download (Your data: what you wrote, voted, and assessed), and Delete account. The card, the delete form, and the page after it are the prototype's. Typing your username to confirm is GitHub's way too (its "Delete account" steps, checked on docs.github.com). The builder decided three things first (Nov 15):
- a board its owner leaves passes to the longest-standing editor (M2), else contributor; with neither, it's deleted with the account (a community admin will come first once communities exist)
- the username is held for 30 days
- PostHog isn't asked to delete anything while analytics are anonymous

| Check | Observed result |
| --- | --- |
| Tests first | `server/test/api/account.test.ts` (18 tests, 21 after the second reader) and `app/e2e/account.spec.ts` (5) were written first and all failed |
| The deletion table | One test per row: email, sign-in methods, sessions, and the codes waiting for their address erased (a lookalike address keeps its code); votes and assessments deleted, the counts recounted, the rows stamped so an open board gets them with its next poll; arguments, wordings, revisions, and sources kept, credited to `deleted_account`; the change log's actor and any mention of them in what it recorded changed to `deleted_account`; the username held 30 days, then released (`releaseHeldUsernames`, which M1-14's daily call will run); a board they own passes to the longest-standing contributor, not an earlier voter; a board whose other members are all voters, or with no other members, is deleted |
| A deleted board | An existing test forbids even the deletion role from deleting change-log rows, so a deleted board is deleted as a wording is: its rows stay with every text erased (question, options, wordings, sources), its members and votes go, and its link answers "This steelman doesn't exist". Writes to it are refused |
| Nothing links them | After deleting a contributor, an owner whose board passed on, and an owner whose board was deleted, a scan of every text and JSON column finds their ID only in their own account row |
| Download your data | steelman-data.json, in the prototype's shape: the account and how they sign in, their votes and assessments by ID, and per board their role, the wordings and sources they wrote, and the question and options only on a board they asked. Nothing anyone else wrote (a test looks for others' wordings, sources, names, and question). Signed out, nothing |
| In the browser | omar_h: the header button opens Your account; Download saves steelman-data.json holding his wording; Delete account opens the form with the cursor in it, a wrong name says "Type omar_h exactly." and keeps the cursor there, Cancel puts it back on Delete account; typing his name shows "Your account is deleted" with the cursor on it, and maya.chen's board shows his wording by deleted_account from her next poll. Axe: no violations, desktop and 375 px |
| Second reader | A fresh agent found nothing that corrupts or leaks data. Fixed: codes for a lookalike address were deleted too; a failed request left the Delete button stuck with no message; the form didn't say what happens to boards they own (now: "A board you own passes to its longest-standing contributor. A board with no other contributor is deleted."); two unused grants; the example-boards seed would have taken a deleted account's held name for a test account; the account row is now locked first; the export names each wording's argument; the client ignores capitals as the service does; three tests didn't prove their names |
| `npm run check` | Types, lint, all 577 unit, API, database, and simulation tests, and all 147 browser tests pass on Node 22 (twice: before and after the second reader's fixes); `git diff --check` is clean; no saved screenshot changed |
| Not checked | Safari and Firefox; a screen reader; a real Google account. **Production needs the service's database user to be a member of `steelman_account_deletion`** (noted in M1-14), or deletion fails. Someone signed in who never picked a username can't reach the page (the app asks for a username first). After deleting, the header still shows the account button and New steelman until the page is left. A tab acting as a deleted test account still acts as it (development and tests only; an existing test expects that). On a phone, the account button steps aside on a board, as in the prototype; it's on every other page. Sign out and the analytics switch aren't on the page yet |

## November 15 — The privacy page and the Content Security Policy (M-07, M-08)

M1-13, drafted for the builder: what the page says, and what's collected, are their call. The analytics half of the item (the first-visit notice, Turn off, Global Privacy Control, Do Not Track, typed text masked in replays) was built on November 14 under M-08 and its tests stand. This adds three things:
- **The privacy page**, at `/privacy`, readable signed out. It covers architecture.md §7's eight points under headings in the order GitHub's privacy statement uses (checked on docs.github.com), and has the Product Page's analytics switch.
- **Links to it**, from the notice and from Your account.
- **A Content Security Policy** on every answer the service sends.

| Check | Observed result |
| --- | --- |
| Tests first | `app/e2e/privacy.spec.ts` (7 tests, 8 after the second reader) and `server/test/api/security-headers.test.ts` (3) were written first and all failed |
| The page | Signed out, `/privacy` shows the date, "Privacy", and nine sections: what we collect, who sees what, who processes it (Google Cloud, Google, Resend, PostHog, and Google Fonts, which the page loads and which sees the visitor's IP address), cookies and analytics, how long we keep it, your choices, children (not under 13), changes, questions. Axe: no violations. It reads well at 390 px |
| The switch | With a PostHog key: "Usage analytics are on in this browser." with Turn off, which stores the choice, stops PostHog, and takes the notice away; Turn on starts it again, and after an opt-out on an earlier page it loads PostHog and tells it to opt in again. With Global Privacy Control: "Usage analytics are off: your browser asks not to be tracked." and no switch. Without a key: "Usage analytics aren’t running here." If storage is blocked, the choice holds for the page |
| Links | The notice's "Privacy" opens the page; Your account has "Privacy notice · Read" |
| Content Security Policy | Every answer carries it: scripts only from the site itself (and PostHog's script host when the service has a key), connections to the site and PostHog, styles from the site and Google Fonts (inline styles allowed: React and the prototype's stylesheet need them), fonts from Google Fonts, images from the site and `data:`, no frames, no plugins, no `<base>`. A script added from another site is refused (`script-src-elem`). Also `X-Content-Type-Options: nosniff`. Every existing browser test, PostHog's included, still passes under it |
| Second reader | A fresh agent found that Your account showed the email as plain text, so a replay would record it: the username and email are now kept out of replays (`ph-no-capture`), and the page says replays show what's on screen but hide typing and the email. Also fixed: Turn on could leave PostHog opted out; the page said one cookie (Google sign-in uses a second for a few minutes; PostHog keeps its ID in a cookie and local storage); the analytics ID groups all visits, not one, and PostHog gets the IP address; the handover and what deletion removes were described too loosely; a test pinned today's date, which every later change to the page would have had to edit; the header test checked one address only |
| `npm run check` | Types, lint, all 580 unit, API, database, and simulation tests, and all 155 browser tests pass on Node 22 (before and after the second reader's fixes); `git diff --check` is clean; no saved screenshot changed |
| Not checked | Safari and Firefox; a screen reader; a real PostHog (its later scripts, such as the recorder, come from the allowed script host, but haven't been seen loading under the policy). **The page describes the deployed product; until M1-14 some of it isn't true yet**: nothing is hosted on Google Cloud, Resend sends nothing, the daily call that deletes unused codes doesn't exist, and the 30 days of request logs is Cloud Logging's default (unverified). "People signed in are told" of changes has nothing behind it yet. In development, Vite serves the page, so the policy isn't sent there; in production it is, once the service serves the web app (M1-14). The page needs a qualified review before public communities (M-07) |

## November 16 — The service in a container (L-01, M-06, M-07)

M1-14a, the first of three parts of M1-14 (the build plan allows splitting it): the service as one container. It needs nothing from the builder. Terraform (M1-14b) and the workflows (M1-14c) follow.

| Check | Observed result |
| --- | --- |
| Tests first | `server/test/deployed.test.ts` (7 tests, 9 after the second reader) and `server/test/api/daily.test.ts` (1) were written first; all failed except the two that check nothing is served where it shouldn't be |
| Serving the web app | Every page address (a board, a version, Your account, privacy, one with a dot in it) gets the app's page, never cached, with the Content Security Policy; built files under `/assets/` come with their type and are cached a year; a missing file and any address under `/api/` (or `/api` itself) are 404s; nothing outside the app's folder is served, however the address is encoded |
| Sign-in email | Codes go through Resend's API (no new package): to the address, from the sending domain, with the code in the subject and the body, and how long it works. A refusal is an error naming neither the address nor the code; a Resend that doesn't answer in 10 seconds is given up on |
| Logs | One JSON line per request for Cloud Logging: severity, time from the service's clock, method, the route's pattern (never a board's ID, the address, the query string, or a body), status, duration. A failure is logged as an error with its stack and nothing else of the error (a database error's details can quote an email) |
| The daily call | Deletes expired codes and sessions, sign-in email records over a day old, and releases usernames held 30 days |
| The container | `docker build -f app/Dockerfile .` from the root (the web app's look comes from `docs/`), on Node 22.23.5 pinned by digest, running as the `node` user. Against the local database: the migration command applied 0009, the service answered `/api/health`, served a board's page with the policy, and wrote JSON log lines; the daily command ran. In a browser, the page loaded with its fonts and nothing blocked. Missing settings stop it at start ("Not starting: APP_ORIGIN, BETTER_AUTH_SECRET, RESEND_API_KEY, EMAIL_FROM not set"); with them, sign-in is on. Image: 516 MB, mostly Node and packages |
| Second reader | A fresh agent found: a failure wasn't logged at all (Fastify's own error line was off with the request lines); the path logged a board's ID, which is its share link; a deploy missing a setting started anyway and passed the health check; no timeout on Resend; the page read on every request; any address with a dot got a 404; zod reached the bundle only by accident; the Node image wasn't pinned. All fixed |
| `npm run check` | Types, lint, and all 590 unit, API, database, and simulation tests pass on Node 22. Of 155 browser tests, 153 pass. The leave-prompt test failed once under load and passed alone. **The Google sign-in test fails every time, on any branch, since 13:00 UTC on November 16**: the browser tests' fake Google signs its tokens with the tests' fixed clock (noon, November 16) and makes them last an hour, but the service checks them against the real clock. The one-line fix is in its own pull request, for the builder (rule 9) |
| Not checked | Cloud Run itself (M1-14b). A real Resend send. Architecture.md said the uptime check would use `/healthz`, but Cloud Run reserves some paths ending in z (its known-issues page, checked Nov 16), so it will use `/api/health`; corrected there |

## November 17 — Terraform for staging and production (M1-14b)

M1-14b, the second of M1-14's three parts: Terraform for both GCP projects (`infra/`), and the service's own database login. Nothing is created until the builder applies it (`infra/README.md`). One module describes an environment; `infra/staging` and `infra/production` give it their settings:
- **The database:** Cloud SQL for Postgres 17, the smallest size, with backups kept 14 days and restore to any moment of the last 7. Staging's is stopped every night; production's is exported weekly to a bucket in the staging project, kept 8 weeks.
- **Secrets:** Terraform makes the database's logins and the sign-in secret. The builder adds Resend's key and Google's client secret over a placeholder, so those two never pass through Terraform.
- **Service accounts:** one per job, each reading only its own secrets. GitHub signs in with no stored key: staging only for runs on main started by a merge, a schedule, or the builder; production only in the protected `production` environment.
- **Cloud Run:** the service (at most 3 instances), the migration job, the daily job, and the address through domain mapping. All start on Google's sample container until M1-14c deploys.
- **Monitoring:** an uptime check on `/api/health`, and budget alerts ($10 staging, $25 production) at 50, 90, and 100%.

| Check | Observed result |
| --- | --- |
| Tests first | `server/test/database/service-login.test.ts` (3) was written first and failed (no `service-login.ts`) |
| The service's own login | The migration job, signed in as the database's owner, creates `steelman_service` with `steelman_app`'s rights inherited and `steelman_account_deletion` only by switching to it; running it again changes only the password. Signed in as it, the real service runs a board from start to deleting an account (create, write, share, vote, cite, assess, edit, read changes, export, delete); deleting content or rewriting the change log is refused. Every other test runs as a superuser, so this is the first proof that the service works with only the rights the migrations grant |
| Terraform | `terraform validate` passes for both environments on hashicorp/google 8.11, with the provider versions locked for macOS and Linux; `terraform fmt` is clean. Each resource's attributes were checked against the provider's own schema. Two permissions were checked on Google's pages (Nov 17): the Cloud Run Invoker role runs a job on a schedule, and Cloud SQL Editor includes export and update. Not applied: nothing exists yet |
| Second reader | A fresh agent found: replacing last week's export needs the right to delete it (now Object Admin, as Cloud SQL's docs give); the README's paste-and-Ctrl-D would have saved each secret with a newline, breaking the Resend header and Google sign-in (now piped from the clipboard with the newline removed, and the service trims both too); staging's daily job would have failed on any night its database was stopped (not scheduled on staging now) and a later plan can't read a stopped database (the README starts it first); the uptime check could run before its API was on; staging's GitHub access also let other kinds of runs on main in (now only a merge, a schedule, or the builder); the database owner couldn't be dropped (now left in place if removed). Also in the README now: the Search Console and billing prerequisites, and running the apply again if a just-granted permission hasn't reached Cloud Run |
| `npm run check` | Types, lint, all 594 unit, API, database, and simulation tests, and all 155 browser tests pass on Node 22; `git diff --check` is clean. The first run failed one existing test, which lists the database server's `steelman_*` roles: the new test's login matched. It's now named apart and removed afterwards |
| Not checked | Applying it: the first apply is the builder's, and its plan is the first check of anything Terraform can't see without credentials. `terraform validate` in CI comes with M1-14c's workflows. Terraform's state holds the database passwords and the sign-in secret, in the private, versioned bucket |

## November 17 — The workflows: deploy to staging, release to production (M1-14c)

M1-14c, the third part of M1-14: what puts Steelman on the infrastructure M1-14b made. The monthly restore test is split off as M1-14d, since it needs a production account that may clone and delete databases, which is new Terraform.

| Check | Observed result |
| --- | --- |
| Tests first | `server/test/api/smoke.test.ts` (3) was written first and failed (no `smoke.ts`) |
| The smoke test | Signed out, by the builder's decision (Nov 17), so it needs no way in that production lacks. Against the service as deployed, on a port of its own: the page loads with its security headers and isn't cached; its built script loads; a board's address gets the app; `/api/health` and `/api/config` answer; sign-in is on; asking for your account or making a board signed out is refused (401). With sign-in off, it says so; with nothing listening, it says the page didn't load |
| On every pull request (`container.yml`) | The container builds from the repository's root; Gitleaks 8.30.1 scans every commit. Its first run on the pull request found 3 items, all false alarms: a made-up signing secret in the smoke test's test, a deliberately invalid Google token in a sign-in test, and PostHog's public project key in `docs/analytics.js`. `.gitleaksignore` accepts exactly those three by fingerprint, with why; anything new still fails. (An earlier local run had read the report through a pipe that came back empty and taken that as no findings; checked again by the scan's own result: 3 without the file, none with it); the Terraform is formatted and valid for both environments. Nothing is pushed or applied |
| On every merge (`deploy-staging.yml`) | Signs in to Google with no stored key; builds the image once and pushes it, reading its digest back from the registry; starts staging's database; updates and runs the migration job; deploys the new version **with no traffic, at a test address of its own**; runs the smoke test there; only then sends everyone to it and gives the daily job its image. A version that fails never serves anyone, so nothing is rolled back. One deploy or release at a time, never cancelled midway |
| Releasing (`release.yml`) | Started by the builder on main, and waits for their approval in GitHub's `production` environment (checked: it requires the builder as reviewer, and only protected branches may deploy to it). Reads the image staging is *serving* (refusing Google's sample), copies it unchanged into production's registry, then migrates and deploys the same way: no traffic until the smoke test passes at the new version's own address. Production's Google login now also requires main (Terraform; the builder re-applies production) |
| actionlint | 1.7.7, with shellcheck: no findings in the three workflows |
| Second reader | A fresh agent found that the first design (deploy, smoke, roll back on failure) went wrong after one failure: rolling back pinned traffic, so every later deploy made a version nobody reached and passed its smoke test against the old one; the rollback target could be the failed version itself; a release could copy the image that had just failed on staging; and a failure while installing the smoke test's tools left an untested version serving. Now: the new version gets no traffic until it passes at its own test address, the release copies the version staging is serving, the tools are installed first, and the deploy and the release share one queue. Also fixed: an empty digest or address now stops the run with a clear message, and the digest is read back from the registry rather than assumed. Checked and fine: the release's GitHub identity satisfies both projects' conditions; a second Google sign-in in one job replaces the first; the deploy account's roles cover every command; deploying a new image keeps Terraform's settings and secrets; nothing secret is printed |
| `npm run check` | Types, lint, all 597 unit, API, database, and simulation tests, and all 155 browser tests pass on Node 22; `git diff --check` is clean. The first run stopped at a type error in the smoke test, fixed |
| Not checked | A real run: the first merge after this one is the first deploy, and the first release is the builder's. The restore test (M1-14d) |

## November 17 — Viewer and Editor, and the full matrix (H-02, H-03)

M2-1, the first item of M2's backlog (approved by the builder Nov 17, with Q27–Q29). The policy table now has five roles, Viewer, Voter, Contributor, Editor, and Owner, and the matrix test covers all seven personas.

| Check | Observed result |
| --- | --- |
| Tests first | `server/test/api/role-matrix.test.ts` was written first: its 30 Viewer and Editor tests failed (no such roles), and every Owner, Contributor, and Voter row passed, showing the test board was set up right |
| The matrix | 15 actions × 7 personas, one test each: read, read changes, both votes, assess, add an argument, add a wording, edit and delete your own wording and someone else's, add a source, edit a source someone else added, take a source someone else added off someone else's wording, and change who can get in. A Viewer reads only. An Editor may do what a Contributor may and also take any source off any wording; editing and deleting a wording or a source stay the author's (Q28). Every refused write leaves the change number where it was |
| Viewer by the link | The owner may set the link role to Viewer; someone who opens the board then becomes a Viewer member and can't vote. Editor and Owner are refused as link roles (400). A stored Editor or Owner link role still gives no access (M1-5's test) |
| Closed board | A Viewer and an Editor may still read and may not write |
| On the screen | Share's link role offers "can view". Removing a source from a card now asks the same `can()` the service does, so an Editor sees the remove button on anyone's source. Fading what a role can't use is M2-2 |
| An existing test changed, with the builder's decision (rule 9) | `roles.test.ts`'s check that a link role can't be Viewer: the Viewer row is removed and the test renamed "Viewer, Voter, or Contributor". Owner and the other refused bodies stay |
| Second reader | A fresh agent found nothing in the code to fix. It noted that the records said the seed makes an Editor (it doesn't: corrected; only tests do until M2-2's people list); that Share had no Viewer option, so a Viewer link showed "can vote" (added); that the matrix left out the source routes (added: the two rows pass with no code change); and that the card copied the uncite rule by hand (now calls `can()`). Left as is: a stored link role the service doesn't know is reported as Contributor, so choosing Contributor answers "already done"; it needs a direct database edit to reach and predates M2 |
| `npm run check` | On Node 22: types, lint, and all 707 unit, API, database, and simulation tests pass; 154 of 155 browser tests pass, with no saved screenshot changed. The one failure, `sharing.spec.ts` "the owner's change shows at once, is saved, and reaches everyone else", is a race in that existing test: Share shows the change before the service has saved it (`session.ts`, `share()`), and the test reads the saved value as soon as the screen changes, so under a full run's load the read can come first. Run alone, eight times over, the file passed all 64. Not edited (rule 9): left to the builder, with a fix proposed on the pull request |
| Not checked | Nobody has been made an Editor through the screens: that's M2-2's people list |

## November 17 — Faded controls that say why (H-03)

M2-2a, the first part of M2-2. The builder dropped the prototype's "You can…" line under the question the same day: Google Docs and Figma have none, and the faded controls already say it.

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12) | The prototype's design follows Google Docs' Share dialog. Google Docs shows view-only readers the full editor, with a "View only" marker ([Workspace Updates, 2015](https://workspaceupdates.googleblog.com/2015/07/clearer-indication-of-and-access-in.html)), so faded controls stay where they are rather than disappearing. Figma's role words, "can view" and "can edit" ([Figma](https://help.figma.com/hc/articles/360039485514)), match the link roles, which the reasons repeat. Left out: Request access, which both have, since M2 has no request flow |
| Tests first | `e2e/roles-on-screen.spec.ts`: six of its first seven tests failed before the change (the Contributor's passed, as nothing was faded yet); the eighth, a demoted author's source, was added after the second reader and failed before its fix |
| What fades | For a Viewer: importance and articulation votes and Yes / No ("Voting and assessing evidence need “can vote” access."), Add an argument, Add a source, and Edit on a source they added before ("Writing and editing need “can contribute” access."). For a Voter: only the writing ones. Each has `aria-disabled`, the prototype's faded `data-blocked` look, the reason as its tooltip and as its accessible description, and stays reachable by the keyboard. Pressed, or Enter on it, sends nothing and opens nothing. Suggest a version isn't offered at all to someone who can't write, as in the prototype. A Contributor sees nothing faded |
| Accessibility and screenshots | No axe violations for a Viewer at desktop and 375 px, folded, with a card open, and unfolded. New saved screenshots `board-viewer-desktop` and `board-viewer-375` (darwin here; CI keeps its linux ones with the run) |
| Second reader | A fresh agent found that a source's Edit wasn't faded for someone who added it and lost the right to write (fixed, with a test). Also acted on: the keyboard test now presses Enter; the articulation test waits for the vote to show unpressed before counting requests; the accessibility scan covers an open card and an unfolded row. Left: a draft or form already open when a role drops stays open and its send is refused (added to M2-2b, where the people list makes it reachable); on a single-wording row a Viewer's ≫ still says "Write another wording", as in the prototype |
| `npm run check` | On Node 22: types, lint, all 707 unit, API, database, and simulation tests, and all 163 browser tests pass; `git diff --check` is clean |
| Not checked | The reason doesn't appear on hover yet: the app has never drawn `data-tooltip` hints (the prototype's hint box lives in its page shell, which the app doesn't load). Found while looking in the browser; the builder chose to build the hint box next, as its own pull request. Screen readers already hear the reason. A role changing while the board is open, through the screens: M2-2b. A real screen reader |
## November 17 — Share's settings faded for non-owners; the importance axis only when there's something to rank (H-02, A-01)

Two things the builder found looking at the board.

| Check | Observed result |
| --- | --- |
| Share | For someone who isn't the owner, General access and the link role were disabled but looked changeable: the prototype's muted grey is dark (darkened for contrast on every label), and the menus' arrows keep their colour. They now fade to 45%, arrows and all, like the board's faded controls, with "Only the owner can change who can get in." under them as before. Disabled controls are exempt from the contrast rule, and axe doesn't check them. The owner's menus are unchanged |
| The axis | "More important / Less important" down the board's left edge crowded and ran past the bottom of a column with one argument or none. It now shows only once some column has two arguments to rank; on a phone, each column's "Most important first" shows only once that column has two |
| Tests first | `e2e/share-and-axis.spec.ts`, 3 tests, each seen to fail first (the phone test was tightened after it passed before the change, finding the line by its class rather than by text) |
| In the browser | Locally: a new board with one argument shows no axis; the demo board's Share, as a contributor, shows both menus faded |
| `npm run check` | On Node 22: types, lint, all 707 unit, API, database, and simulation tests, and all 158 browser tests pass; no saved screenshot changed |

## November 17 — The hint box (M-04, H-03)

Found while checking M2-2a in the browser: the app had never drawn its `data-tooltip` hints, so the faded controls' reasons, and every older hint (the vote arrows, Close, Fold back, …), showed nothing on hover. The prototype's hint box lives in its page shell (`docs/prototype/index.html`), which the app doesn't load. The builder chose to build it.

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12) | GitHub's Primer ([Tooltip](https://primer.style/product/components/tooltip/)) and the W3C's tooltip pattern ([APG](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)): a hint opens on hover after a short delay and on keyboard focus, never takes focus, and closes on Escape or when the pointer or focus leaves. The prototype's own does the same, with a 700 ms delay and the next opening at once after one closes. Its look is the prototype's: a small dark box above the control |
| No new package | The prototype positions with Floating UI. Here it's a few lines in `web/src/Hints.tsx`: above the control, centred; below it if there's no room; never past the window's sides |
| Tests first | `e2e/hints.spec.ts`, 7 tests, all seen to fail first: hover after a moment, above the control, gone on leaving; a Viewer's faded control shows its reason; keyboard focus at once, Escape hides it and keeps the focus; the next opens at once; scrolling; at 375 px it stays inside the window; axe passes with one open, and it never takes the pointer. Two more after the second reader (below): 9 in all, passing three runs over |
| A race found on the way | Moving to a control below the fold scrolls the page just after the pointer arrives, and closing on scroll then cancelled the hint about to open. Scrolling no longer cancels a hint waiting to open |
| Second reader | A fresh agent found two things to fix: closing on scroll would also close a keyboard hint as Tab scrolled its control into view (now the box follows its control while the page scrolls, and goes once the control has left the window; a test at a short window failed with the old behaviour and passes now; Tab to a control below the fold shows its hint, though Chrome didn't reproduce the failure); and a hint could stay after its control left the page, where a browser sends no leave event (now it watches for that, and for its text changing while shown, as the prototype's does; Chrome passed the test either way). Also: the "next opens at once" test now waits 300 ms at most, since the browser's clock still moves with real time; a touch that becomes a scroll, or a click made with the keyboard, no longer counts as a tap. It checked that every hint's text is already its control's name or description, so hiding the box from screen readers loses nothing |
| Screen readers | The box is hidden from them (`aria-hidden`): what it says is already each control's name or description |
| In the browser | Locally, as a Viewer: hovering a faded vote arrow shows "Voting and assessing evidence need “can vote” access." above it, inside the window |
| `npm run check` | On Node 22, after the second reader's fixes and with PR 62 merged in: types, lint, all 707 unit, API, database, and simulation tests, and all 175 browser tests pass; no saved screenshot changed |
| Not checked | A real touch screen (a tap shows the hint until the next tap); a real screen reader |

## November 17 — Share opens without a focus outline; test accounts come in by a link (H-02)

Two things the builder found using the app locally.

| Check | Observed result |
| --- | --- |
| Share's outline | Opening Share put the cursor on its first setting, and the browser drew its blue focus outline round it even after a click. The cursor now goes to the panel itself, whose edge already shows where it is, as the W3C's dialog pattern allows; Tab reaches Close, then General access, and Escape still closes it and returns to the pill |
| Test accounts and the link | A board open to anyone with the link needs a confirmed email (M1-5), and the seed's test accounts had none, so switching "Acting as" to one on a new link board said "You don't have access". The seed now marks its test accounts as confirmed, still with no email (which is how it tells them from real accounts), and brings an older seed's accounts up to date. The seed runs only locally and in tests |
| Tests first | `server/test/api/test-accounts.test.ts` (2) and `e2e/share-open.spec.ts` (2), each seen to fail first. The keyboard test first expected General access straight after the panel; Close comes before it, which is the panel's order, so the test was corrected |
| Locally | After `npm run db:seed`, the 17 seeded test accounts are confirmed; tess.b opens the builder's own link board |
| `npm run check` | On Node 22: types, lint, all 709 unit, API, database, and simulation tests, and all 177 browser tests pass (177 s). Two earlier runs, made while the local app was also running, each timed out one test unrelated to this change (a database test, then a lint test and a role test) and took 188 s and 500 s: the machine was busy. Stopping the local app, the run was clean |

## November 18 — The sign-in email limit under concurrency (L-01)

Build plan M2-6a, from the security follow-up approved Nov 17. The limit of five sign-in emails per address an hour counted the address's recent emails and then added one, as two separate steps, so requests arriving together each counted fewer than five and all got through.

| Check | Observed result |
| --- | --- |
| The race, shown first | `server/test/api/sign-in-limit.test.ts`, 4 tests, through the API with emails kept in memory. Before the fix, 12 requests at once for one address were all let past the limit (none refused); at two copies of the service on one database, 6 of 12 were refused instead of 7 |
| The fix | `mayEmail` in `server/src/sign-in.ts` counts and adds inside one transaction that first takes a Postgres lock on the address (`pg_advisory_xact_lock`, keyed by the address's hash). Requests for one address take turns, at every copy of the service; other addresses take other locks. The lock ends with the transaction, so a crash can't leave it held. No new package, no migration; addresses stay hashed and the daily job still deletes them after 24 hours |
| After | 12 requests at once, in mixed capitals: exactly 5 let through, 7 refused as too many; the same across two copies, and neither copy sends a sixth afterwards; another address asking meanwhile gets its own five; an hour later the address is sent codes again. Five runs over, all pass. The existing test of the sixth email in an hour still passes |
| Second reader | A fresh agent found nothing to change: the lock's key can't overlap the migration runner's (Postgres keeps one-number and two-number locks apart), it can't deadlock (the holder never asks for a second connection), and Better Auth lowercases addresses exactly as the limit does. One comment claimed other addresses never wait; with a 32-bit key two can share a lock, so it now says they rarely do. A burst for one address can briefly hold that copy's five database connections; each turn takes milliseconds |
| `npm run check` | On Node 22: types, lint, all 711 unit, API, database, and simulation tests (4 new), and all 175 browser tests pass; no saved screenshot changed |
| Known limitation | Requests let through at the same moment for the same address can still collide over the one code an address may have: one is sent, and the others answer with a server error (500) and send nothing. The person still gets one working code. Not part of this item |

## November 18 — Sign-in codes asked for together (L-01)

Found while building M2-6a; the builder chose to fix it next. An address has one sign-in code at a time. Better Auth replaces the old code by trying to add the new one and, on failing, deleting the old and adding again, so requests arriving together for one address could fail twice and answer with a server error (500), sending nothing.

| Check | Observed result |
| --- | --- |
| Shown first | A fifth test in `server/test/api/sign-in-limit.test.ts`: 12 requests at once for one address, across two copies of the service. Before the fix, two of the five let past the limit answered 500 |
| The fix | On the two routes that store a code (asking for one; signing in with a wrong one, which puts it back with a try counted), `server/src/sign-in.ts` stores it itself, in one Postgres statement that replaces the address's old code (`insert … on conflict do update`), and Better Auth adds nothing. Of two codes, the one that expires later stays: a new code replaces the old, and a code put back after a wrong try can't replace a newer one sent meanwhile. Other uses of the same table (Google sign-in's state) are untouched. No migration, no package |
| After | All five let past the limit answer 200 and are emailed; the other seven are refused as too many; exactly one of the five codes signs in. Five runs over, all pass. Every existing sign-in test passes, including a new code cancelling the old, the ten-minute expiry, five wrong tries, and Google sign-in |
| Second reader | A fresh agent found nothing to change. It confirmed only the two code routes reach the new step (Google sign-in's state, which needs Better Auth's own insert, never does), that the step stores exactly what Better Auth would have, and that nobody gets more than five tries per code. One comment overstated the rule: two codes that expire at the same millisecond go to the last stored, which it now says. The migration's comment on how Better Auth replaces codes is now out of date and is left alone, since migrations aren't edited |
| `npm run check` | On Node 22: types, lint, all 712 unit, API, database, and simulation tests (1 new), and all 175 browser tests pass; no saved screenshot changed |
| Known limitation | When codes are sent at the same moment, their emails can arrive in either order, and only one code works: the person may type one from an earlier email and need to try the other |

## November 18 — Rate limits (M-12, L-01)

Build plan M2-6, with the limits the builder approved in PR 68 (architecture §7 "Rate limits and abuse"). New feature row M-12.

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12) | GitHub's REST API ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)): over a limit, a 429 (or 403) with `Retry-After` in seconds, and wait a minute when it doesn't say. Taken: 429, `Retry-After`, and one minute as the floor. The wording, "Too many in a row. Try again in a minute.", is the build plan's; Google's sign-in says "Too many attempts. Try again later." (from memory), where ours says how long |
| What's counted | Per account, in each instance's memory: new boards 20 an hour; arguments, wordings, edits, and sources added or cited 60 an hour; importance, articulation, and assessments 300 a minute. Per network, asking for a sign-in code to any address: 30 an hour. Reports' 20 an hour is set, for when reports exist (M2-3). Deleting, undoing, Share settings, and reading aren't counted; nor is a request that saves nothing (invalid, or refused by the person's role): it's counted on arriving, so requests sent together can't all slip under, and given back when it saves nothing |
| The network | Deployed (the container), the last `X-Forwarded-For` entry, which Cloud Run appends; locally, the connection's own address. Fastify's `trustProxy: 1` was tried first and, under the tests' injected requests, still answered the connection's address, so it's read by a few lines of our own. An IPv6 address counts by its first 64 bits, the block one line is given. Held only in the counter, never stored or logged |
| Tests first | `server/test/api/rate-limits.test.ts` and `server/test/api/sign-in-network-limit.test.ts`, each limit seen to fail first: the next past each limit is refused with how long to wait and saves nothing, another person or network isn't affected, and it's allowed once the test clock passes the window; a made-up `X-Forwarded-For` can't dodge it, and run locally the header is ignored; a class of 25 on one network, five asking twice, all sign in. `e2e/rate-limits.spec.ts`, 3 tests, seen to fail with the pages' changes set aside: a vote past the limit waits in the board's pill ("Too many in a row. Try again in a minute. · 1 waiting to send") and is sent once the wait has passed; New steelman and Sign in say how long to wait |
| Second reader | A fresh agent found nothing blocking. Fixed: IPv6 counted by address, so one line could take a new address for every request (now by its /64; a test sends 30 from one /64 and the 31st is refused); a misplaced comment and a doubled import; a comment overstating how soon a counter is forgotten; a note in `main.ts` that a proxy in front of Cloud Run would change which entry is the caller's. Added after it: votes made offline and sent together on coming back stop at the limit and the rest wait (a browser test, which passed at once: the queue already did this) |
| `npm run check` | On Node 22: types, lint, all 724 unit, API, database, and simulation tests (12 new), and all 179 browser tests (4 new) pass; no saved screenshot changed. An earlier run timed out in the simulation, which never goes through the limits, while the machine was under heavy load from other programs |
| Known limitations | Counts are per instance (up to three times too generous across three) and start again on each deploy. The board's queue sends in order, so an action waiting on one limit holds back the ones behind it, votes included, for up to the hour the writing limit lasts; sending around it could send a vote before the argument it's on. Reading the network on staging is still to check, since Google doesn't document it. Resend's free plan's 100 emails a day can still run out across instances |

## November 18 — The deployment trust boundary (M2-13)

Build plan M2-13, from the security follow-up approved Nov 17. A review, not a feature: no feature row changes. The written review is `plans/reviews/deployment-trust-boundary.md`; this entry records how it was checked.

| Check | Observed result |
| --- | --- |
| Read live, read-only | With the builder's logins, Nov 18: each project's IAM policy, its service accounts' policies and keys (none), its secrets' policies, its Workload Identity provider; the export and state buckets' policies; Cloud SQL admin calls by each deploy account over 30 days; the repository's environments, branch protection, rulesets, collaborators, and Actions settings. Nothing in Google or GitHub was changed. The live configuration matches the Terraform |
| Production's Cloud SQL Editor | Its deploy account made no Cloud SQL admin call in 30 days, which include the Nov 17 release; staging's made 24, all `instances.update` (starting the database). The module now grants it on staging only. `terraform plan -lock=false` with the change: production `1 to destroy` (that grant) and nothing else; staging `No changes` |
| Checks for the restrictions | `test/deploy-trust.test.ts`, 6 tests, read the Terraform and the workflows. The two on the deploy account's roles failed against the Terraform before the change. Then each restriction was loosened in turn and the file failed each time: staging accepting `pull_request_target`, production not requiring its environment, `check.yml` asking for a token, the release dropping its environment, the deploy account reading a secret |
| Staging still deploys and migrates | Staging's plan has no changes. PR 69's merge deployed on the current configuration (run 44368472988): migrations, smoke test, and traffic all passed. Production's change waits for the builder's apply and is shown by the next release |
| Second reader | A fresh agent found nothing blocking, and confirmed the roles' permissions and the live settings it re-read. Fixed in the review: the "builder approval" status can be forged by a workflow a pull request adds (any GitHub Actions token may post it), so moving the check to `pull_request_target` isn't enough on its own; the proposed diff now compares the exact commit it marks, doesn't keep the checkout's credentials, and notes the one pull request that needs the builder by hand; a token of the builder's can still add the label, so a separate agent account is the full answer; staging's condition admits a start by any admin, not only the builder. Fixed in the checks: `permissions: write-all` counts as asking for a token; production must not stop its database nightly; a grant to the deploy account in any other resource, by any reference or by address, fails; layout no longer matters. Each new case was seen to fail |
| `npm run check` | On Node 22: types, lint, all 732 unit, API, database, and simulation tests (6 new), and all 181 browser tests pass; no saved screenshot changed. After the second reader's changes to the new test file only: types, lint, and the 48 tooling tests again, all pass |
| Not verified live | That Google refuses a real pull-request run (shown by configuration only); a release without Cloud SQL Editor; organization-level GitHub settings; reads of Cloud SQL settings, which the always-on audit log doesn't record |
| Applied, and the builder's decisions | After PR 70 merged, the builder's production plan showed only that grant to destroy; the apply removed it, and production's policy now lists only the scheduler with Cloud SQL Editor. PR 70's staging deploy (run 44396368827) then passed its migrations, smoke test, and traffic. The builder kept the review's three open points as they are for the class trial (agents act as the builder; the protected-files check unchanged; admins keep their bypass), to be reviewed again before access widens beyond the class |

## November 18 — First users: Pod 6 again, on the Product Page

From the Build 1 grading feedback: the Nov 9 refresh (commit `32233b5`) replaced "First users: Pod 6 classmates … reachable for a first test" with three broad groups (students, companies, online communities). The page's idea section (PRD v3) now opens with First users: Pod 6 classmates deciding something real together, asked in class this week, signing in on the test site, and steelmanning one pod decision. The three broad groups follow under Later.

| Check | Observed result |
| --- | --- |
| Laptop width | Served locally (`python3 -m http.server`); the First users card uses the page's existing statement-and-steps card, with the Later cards below it and Before and after unchanged |
| Phone width | At 375 px the steps and the Later cards stack in one column; the page is 375 px wide, with nothing scrolling sideways |
| Console | No errors |
| Not checked | The published GitHub Pages copy, until this merges; no classmate has been asked yet, so the steps describe the plan, not a result |

## November 18 — The simulation no longer fails by chance (M-02, M0-5)

PR 71's check (Nov 18, embedded-offline) failed in the simulation, though the pull request changed only documents. Every check held; what failed was the test's demand that each kind of stale action be refused at least once in its 300 random sequences. That run had no action on a deleted argument, which needs a reader to act from an old view on an argument whose last wording has since been deleted. Over the 19 runs before it, that refusal came 3 to 10 times a run.

| Check | Observed result |
| --- | --- |
| The fix | `server/test/simulation/world.ts` gives fast-check one fixed sequence to play before the random ones in every run (`EVERY_STALE_REFUSAL`): Ben goes offline and, from his old view, votes on and assesses everything; Cy edits his wording; Ana deletes both of hers, which deletes the argument that had only hers; Ben comes back. fast-check counts that sequence among the runs, so the run count goes up by one: the random sequences are exactly those it played before, and the nine checks are unchanged. The existing test isn't edited; its demand that each refusal happen now rests on the fixed sequence, not on luck |
| Shown first | With 20 random sequences, where the gap is common: 5 runs out of 5 failed as PR 71's did (a refusal missing, "received undefined"); with the fixed sequence, 5 out of 5 passed |
| New test | `server/test/simulation/stale-refusals.test.ts` plays the fixed sequence alone, with all nine checks after each step, and requires an action refused for a deleted argument, a deleted wording, a changed revision, and an assessment without evidence |
| `npm run check` | On Node 22: types, lint, all 733 unit, API, database, and simulation tests (1 new), including both planted-bug tests, and all 181 browser tests pass; no saved screenshot changed |
| Second reader | A fresh agent found nothing blocking, and confirmed the sequence produces each refusal whatever the order on screen (every target is reached, and the offline queue merges none of them). Fixed: fast-check counts the fixed sequence among the runs, so there had been 299 random sequences, not 300 (now one more run); the new test also requires the refusal for an assessment without evidence. The planted skipped-stamp bug is now caught by the fixed sequence, and still shrinks to a one-step example |

## November 19 — Phones (M-03)

Build plan M2-10. The core loop on an emulated phone, and what it found.

| Check | Observed result |
| --- | --- |
| The core loop | `e2e/phone.spec.ts`, as Chrome on an Android phone (375 × 812, touch, a phone's user agent), every press a tap. It signs in by code from a board's link and picks a username. On that board it marks an argument more important, suggests a new wording from the card's menu, rates the new wording better articulated, opens it, adds a source, and says the evidence backs it. Then it switches to Strongest case and back, makes a New steelman from the top bar, and adds an argument and switches sides there. Last come Your account and the privacy page |
| Nothing scrolls sideways | Checked after each screen: the page against a fixed 375 px, and every element fixed in place (the pill, the analytics notice) against the screen's edge. Seen to fail with a 400 px element added, once in the page and once fixed in place. A second test does Share, a card's menu, a deleted version's note, and a missing board at 375 px wide (not phone emulation); a third, the first-visit analytics notice |
| Found and fixed | The prototype hides your account button on a board at 480 px and below, so a phone had no way from a board to Your account. It now shows, in the board and Strongest case views. The test failed there first. The top bar still fits at 375 px with the development-only "Acting as" switch; production has no switch, so more room. The saved 375 px screenshots still pass within their 1% tolerance but don't show the button; retake them if they should |
| Adding an option | The other known gap doesn't apply yet: the app can't add an option to a board after it's made (only New steelman's sheet has options) |
| Second reader | A fresh agent found nothing blocking. Fixed: Strongest case is now checked by its pressed switch and its columns, not by text the board also shows; the width check compares with 375 px, not the window, which a phone may widen by zooming out, and now sees elements fixed in place; the test that isn't emulating a phone says so; the analytics notice is checked |
| `npm run check` | On Node 22: types, lint, all 733 unit, API, database, and simulation tests, and all 183 browser tests pass (2 new); no saved screenshot changed. After the second reader's changes, which touch only `phone.spec.ts`: types, lint, and its 3 tests pass |
| Known limitations | Emulated, not a real phone (the milestone's person check). Not checked on a phone: sign-in errors, Delete account's confirmation, and the list (PR 78, not merged) |
| After the builder's review, Nov 20 | The builder found an unfolded row odd on a phone: its next wording spilled past the column's side. Now, while a row is unfolded, its column opens to the screen's right edge: the gray panel runs off the page with no side or corners there, and the row's wordings scroll on inside it. A new test checks the panel and the row reach the screen's edge only while unfolded, with nothing scrolling sideways, and saves `row-open-375`. The builder also saw General access wrap in Share on a phone, and couldn't leave New steelman: both are fixed where that code changes, in PR 74 (Share's people list) and PR 78 (Cancel back to the list). Types, lint, and all 185 browser tests pass; no other saved screenshot changed |

## November 19 — The list (E-03, F-01)

Build plan M2-7. The home page becomes the list of your steelmen, from the prototype's feed (renderHome and post); New steelman's sheet moves to `/new`.

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12), from memory | GitHub's repository list: each row says "Updated 3 hours ago", most recently updated first, and an empty account offers a Create button in the empty state. Google Docs' home: recent documents, newest activity first, with who owns each. Figma's Recents: "Edited 2 hours ago" under a miniature. Taken: "Updated 3h ago" (GitHub's word, the prototype's short form), last change first, your role where Docs shows the owner, the prototype's miniature, and New steelman inside the empty state |
| What's listed | The boards you're a member of, including those you came into by the link (recorded when you first open one); not a board you haven't opened, a deleted board, or a membership with a role the service doesn't know. Each: your role in Share's words (Owner, can edit, can contribute, can vote, can view), "Updated …" by the service's clock (sent with the list, so a reader's wrong clock can't change it), the question as a link to the board, each option with its live arguments (deleted and combined ones aren't counted; dashed under two, as the prototype), and a miniature of up to three cards per option. The wordmark now leads home |
| Last change | The latest of the board's creation, its change log, new arguments and wordings, and the votes and assessments as they stand. No new column: a `changed_at` set by the write path would have touched every open pull request's calls to it |
| Tests first | `server/test/api/list.test.ts` (14) and `e2e/list.spec.ts` (12), each seen to fail before the route and the page existed; `web/test/list.test.ts` (3) for `/new` and "how long ago" |
| Second reader | A fresh agent found nothing blocking on access or the query. Fixed: the wordmark is a link home (the prototype's), the list asks again when the browser restores it after Back, the date's and counts' tooltips sit above the card's link; added tests for an unknown role, the options' order, the failure state with Try again, and a scan of the empty state. The wordmark's first label ("Your steelmen") failed every page's accessibility scan, since it didn't contain the visible "steelman."; it's now "steelman. Your steelmen" |
| `npm run check` | On Node 22: types, lint, and all 750 unit, API, database, and simulation tests pass; 180 of 193 browser tests pass, and no saved screenshot changed. The 13 that fail are existing tests that open `/` expecting New steelman (12 in `new-steelman.spec.ts` and `links.spec.ts`, 1 in `rate-limits.spec.ts`); rule 9 leaves them to the builder. With the change suggested in the pull request (open `/new` instead), all 33 tests in those three files pass; that change isn't committed |
| After the builder's review, Nov 20 | The builder found the role tag at each board's top left odd. Google Drive's list shows each file's owner ("me" for yours) and Figma's Recents no role at all, so each board now shows its owner ("You" for yours) where the prototype puts the author, then "Updated 3h ago"; the list's own two screenshots were retaken for it. New steelman gained the prototype's Cancel, back to the list (the builder couldn't leave the sheet); its saved screenshots still pass within their 1% tolerance but don't show it. With the builder's approval, the 13 tests that opened `/` for New steelman now open `/new` |
| Known limitations | A withdrawn vote leaves no time behind, so a board's "Updated" can move back. A retried New steelman can still make a second, empty board (architecture.md, Links and IDs), and it now shows in the list. The not-found page still leads to New steelman, where the prototype says "Go to your steelmen". No search, sort, spaces, author, comments, or who's here (T3–T4). The vote tables have no index by board, which is fine at class size |

## November 18 — Report (J-01)

Build plan M2-3. Reports are a new record about people (architecture §7's list): the builder confirms on the pull request.

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12) | From memory: Reddit's report flow lists reasons and, for "Something else", asks for a few words; YouTube's report dialog picks a reason, then optional details; GitHub's Report content is in a comment's ⋯ menu. The prototype (modItems, reasonMenu) already follows them: Report below a rule at the end of ⋯, the menu switching to "Report it as" with Spam, Abusive, Off-topic, Something else and their icons, then Withdraw your report; a red flag with the count for moderators. Taken from the prototype; the note for Something else is the build plan's, asked as "What’s wrong with it?" |
| What it does | Anyone who can read reports someone else's wording; nobody is offered it on their own. One report per person per wording: reporting again replaces the reason, and reporting the same is once. Withdraw takes it out of the count. Editors and the owner see a red flag on the card, with the count of open reports, and the reasons on hover or focus ("Spam ×2, Abusive"); never who, nor the note. The reporter is told "Reported. Editors will see it." A closed board refuses reports, as every write but comments (architecture §7). Reports are rate-limited (20 an hour, set in M2-6) |
| Who learns of a report | A report stamps itself, not the wording, so only an Editor's or the owner's request for changes, and the reporter's own, sends the wording again; anyone else's poll can't tell a report was made. An Editor made while the board is open gets every wording again, with the flags |
| The record | Migration 0010, the `report` table: board, wording, reporter, reason, note, when, withdrawn, and resolved (by, how, when; for M2-4), keyed by wording and reporter like a vote, not the id and target architecture §2 sketches (comment reports, T3, will need their own column or table). Not in the change log. Deleted with the reporter's account, stamping the wordings so moderators' counts update; in Download your data with reason, note, when, and whether withdrawn |
| Tests first | `server/test/api/reports.test.ts`, 13 tests seen to fail first, then 3 added after the second reader: who sees the count and the reasons, the reporter's own report, twice is once, withdraw, a note for Something else, no reporter name, ID, or note in anyone else's answer, a moderator's poll, a deleted wording, a closed board, export, account deletion; then: no one else's poll sends a reported wording, reporting again after withdrawing, withdrawing on a deleted wording. `role-matrix.test.ts` gains "report someone else's wording" (any role that reads). `web/test/card-menu.test.ts` gains 2 (who's offered Report or Withdraw). `e2e/reports.spec.ts`, 6 tests, 5 seen to fail with the card's changes set aside (the sixth, no Report on your own wording, passes either way), then 2 added after the second reader: an Editor made while the board is open sees the flags; Tab past the note form closes it. Accessibility scans with the reasons open, the note open, and the flag shown |
| Existing tests this changes | `server/test/database/schema-shape.test.ts` lists every table the plan names; `report` is added to it, as each new table has been (M1-5 added `board_member`), which also checks it's tied to its board. `e2e/card-menu.spec.ts`'s "someone else's menu has Copy link and Suggest a revised version, and nothing of combining, separating, reporting, or AI" now fails: the menu has Report, as the build plan asks. It is not edited here: the builder's (rule 9) |
| Second reader | A fresh agent found nothing blocking, and confirmed the count and reasons reach only Editors and the owner, the note only the reporter's own export, the deletion role's grants, and the tally. Fixed: each report stamped its wording, so anyone's poll could tell a wording had been reported, and when (now a report stamps itself); an Editor made while the board was open saw no flags until a reload; Tab past the note form left it open with Escape no longer reaching it. Left for M2-4: reporting again after a moderator resolves a report would clear the resolution; hiding from the flag will want the flag to be a button. For the builder: the schema keys reports like votes (above); a report on your own wording is refused only by the menu, not the service; Editors see reasons but not the Something else note, as the build plan says |
| `npm run check` | On Node 22: types, lint, all 758 unit, API, database, and simulation tests (25 new), and 188 of 189 browser tests (8 new) pass. The one that fails is `card-menu.spec.ts`'s, above |
| After the builder's review, Nov 20 | The builder found no sign that a report was sent. The prototype only announces it to screen readers; its comments show "Reported · Undo" in place. So the reporter's card now says "You reported this" where an Editor sees the red flag, from the moment they report until they withdraw it (Withdraw stays in the menu). The builder decided an Editor sees all of a report but who, or none of it: an Editor's and the owner's flag now also says what was written for Something else (`Spam, Something else: “It names a student.”`); nobody else gets the note. With the builder's approval, `card-menu.spec.ts:71` now expects Report in someone else's menu. Types, lint, the 18 report API tests, and the report and menu browser tests pass |

## November 18 — Hide and restore (J-02)

Build plan M2-4, on M2-3's branch (reports), so it waits for that pull request. M2's Done when asks that a report → hide → restore cycle shows in the change log with its reason, and that the simulation includes hide and restore by an editor (Q28).

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12) | From memory: Reddit's moderators remove a post with a reason, and it keeps its place as "Removed by moderator"; GitHub hides a comment with a reason ("Spam", "Off-topic", "Abuse") behind "This comment was marked as…", which its maintainers can show. The prototype (removedCard, modItems, reasonMenu) follows them, and is followed here: Hide below the rule in ⋯, "Hide it as" with the report reasons, "Removed by a moderator · Spam" in its place, its text struck through for moderators, and Restore |
| What it does | An Editor or the owner hides someone else's wording, from its menu or from its report flag, with a reason. It keeps a place in its row: where it was, on a board that's open, and after the live wordings on a fresh one (the shared order leaves it out), so a link to it lands there, saying it was removed. Its text, context, earlier wording, and sources reach only Editors and the owner. Restore brings it back for everyone. Each is a change row with who, and a hide with why; hiding resolves the reports open on it, so the flag goes. A vote, assessment, report, or the author's edit on a hidden wording is dropped, as on a deleted one. It leaves Strongest case and the shared order. Nobody is offered Hide on their own wording, as in the prototype; a closed board refuses it, as every write but comments |
| The simulation | Hide and restore are steps: Ana, the owner, may; Ben and Cy are refused. Ana reads as a moderator. A new check, the tenth, after every step: no hidden text reaches anyone but an Editor or the owner, by a request for changes or a fresh snapshot. 1,500 random sequences passed with 291 hides and 34 restores, before the second reader's fixes; after them, the check's 300. `hide-restore.test.ts` plays a fixed sequence (a queued vote on the hidden wording is dropped; a Contributor's hide refused), and shows the tenth check catching a planted leak |
| Tests first | `server/test/api/moderation.test.ts`, 12 tests seen to fail first, then 3 added after the second reader; `role-matrix.test.ts` gains "hide someone else's wording" (Editor and up). Shared: a hidden wording keeps a place, nothing waits for Update, and it leaves Strongest case; web: who is offered Hide or Restore, and no Report on a hidden wording. `e2e/moderation.spec.ts`, 6 tests with two people: hide with a reason, seen by another without its text; restore; hide from the flag; no Hide for a Contributor or on your own; a link to a hidden wording; accessibility scans |
| Second reader | A fresh agent found one blocking problem, fixed: on a board with a hidden wording the pill said "1 change · Update" for good, since the kept place counted as a change and a move (now neither; two shared tests). Also fixed: the author could edit a hidden wording, changing what the moderator reviewed (now refused, and the simulation expects it); "Delete argument" was offered when the only other wording was hidden, though the service keeps the argument; a hidden wording's sources still reached everyone; Restore of a wording deleted since was done; a row led by a hidden wording was named "Deleted by…". Noted, not changed: the flag's menu returns the cursor to ⋯, not the flag; an owner can't restore their own wording from the menu once an Editor hid it (the service allows it); spam on a closed board can't be hidden |
| `npm run check` | On Node 22: types, lint, all 787 unit, API, database, and simulation tests (29 more than M2-3's), and 194 of 195 browser tests (6 more) pass. The one that fails is M2-3's `card-menu.spec.ts` test, left for the builder |
| After the builder's review, Nov 20 | The builder agreed with the choices: a closed board refuses hiding, and a hidden wording keeps its place in its row. PR 76's changes from the same review are merged in: the reporter's "You reported this", and the note for Something else in an Editor's flag, which here is also the button to Hide. `card-menu.spec.ts:71`, which the builder approved changing for Report, also expects Hide in the owner's menu. Types, lint, the report and moderation API tests, and the report, moderation, and menu browser tests pass |

## November 18 — Share's people list (H-01, H-02, H-03)

Build plan M2-2b, with the builder's answer to Q27 (Nov 17): Share lists the board's members, and the owner sets each one's role, Viewer to Editor. No invites.

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12) | Google Drive's help ([share files](https://support.google.com/drive/answer/2494822), read live): each person in the Share dialog has a menu by their name to change their role or remove them. Figma's help ([sharing and permissions](https://help.figma.com/hc/en-us/articles/1500007609322-Guide-to-sharing-and-permissions), live): "can view" and "can edit". That the owner shows as plain "Owner" text with no menu is from memory of both. The prototype's Share (shareMarkup) already follows them: People with access above General access, initials, "(you)", "Owner", and "can view … can edit". Taken from all three; Remove is left out (see Known limitations) |
| What it does | Everyone who can read the board sees People with access, by username, never email: the owner first, then the others alphabetically, each with their role. Only the owner gets a menu by each name but their own, offering can view, can vote, can contribute, can edit. Choosing one saves it at once, says "jordan_w can edit." and is in the change log (`role_changed`, with the account and the role before and after, by ID). Someone whose role the owner set keeps it whatever the link does afterwards: they count as added by name. Nobody can be made Owner, and the owner's own role can't be set |
| A role lowered while the board is open | On their next poll (3 s), the person's role changes; an open Add an argument or wording draft, or an edit of their own wording, closes, as the prototype's role switch does, and the faded controls say why (both tested). An open source form closes by the same check (not tested on its own) |
| Tests first | `server/test/api/people.test.ts` (9 tests) and two new actions in `role-matrix.test.ts` (see who's on the board: any role; set someone's role: Owner only), 14 tests across the seven personas, plus the closed-board case, all seen to fail first. Account deletion takes the person's ID out of the role changes that named it (the existing scrub). `e2e/people-list.spec.ts`, 7 tests, seen to fail with the code changes set aside: the list's order and roles; the owner makes someone an Editor and the service has it; a non-owner sees no menus; a lowered role closes an open draft, and an open edit (that one seen to fail with only the closing turned off); the accessibility scan, with saved screenshots, at desktop and 375 px |
| Existing tests this changes, left for the builder (rule 9) | Three existing browser tests now fail, because the panel they check has the list: the `share-desktop` and `share-375` screenshots (`e2e/sharing.spec.ts`), and `e2e/share-open.spec.ts`'s "Tab then reaches Close and General access", since the people list's menus now come between, above General access as in the prototype and Google's dialog. Neither is retaken or edited here. The new `share-people-*` screenshots show the panel as it now is |
| Second reader | A fresh agent found nothing blocking in the code, and confirmed: only the owner can set roles; no link gives Editor; another board's member, the owner's own row, and a deleted account can't be set; no email is sent; turning the link off and setting a role take turns on the board's lock; account deletion's scrub covers the new rows; an Editor stands ahead of a Contributor to inherit a board. Fixed: a role the service didn't take stayed shown in the menu (now it goes back); an older read of the list could replace a newer one; a failed read showed Loading… for good (now it says so); ties in the order (now by ID); the owner choosing the role a link member already has now makes it theirs, without a change-log row (a new test); the edit-closes test above. For the builder: every reader, a Viewer by link included, now sees every member's username |

| `npm run check` | On Node 22: types, lint, all 756 unit, API, database, and simulation tests (23 new), and 185 of 188 browser tests (7 new) pass. The 3 that fail are the existing ones above, left for the builder |
| After the builder's review, Nov 20 | With the builder's approval, the Share screenshots (`share-desktop`, `share-375`) were retaken to show the people list. On a phone, General access no longer wraps its role under the first choice, out of line (the builder saw it at 375 px): the row stays on one line, as a person's row does, and at 400 px and below its globe gives way so "Anyone with the link" isn't cut short. Who sees the list stays everyone on the board: Google Docs and Drive show who has access to anyone who can open the file, read-only for those who can't change it, and Figma does the same (from memory; Google's help pages don't say it outright). With the builder's approval (Nov 20), the Tab-order test in `share-open.spec.ts` now goes from Close through each person's access to General access |
| Known limitations | No Remove: someone who came by the link would come straight back while the link is on, so it waits for invites (H-01). The list is read when the board opens, when Share opens, and after a role change, not on every poll. Someone without a username yet shows as "No username yet" |

## November 18 — "Edited", with the votes before (A-06)

Build plan M2-5, with Q22 (Nov 11): the "edited" mark explains itself on hover, or on a tap on a phone, including how many importance and articulation votes the wording had before the edit. Editing stays the author's (Q28).

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12) | From memory: Reddit's "edited" mark gives when, on hover; GitHub's "edited" on a comment opens the comment's earlier versions. Taken: the mark stays a small link that discloses on hover, and a press keeps it open, as the card's "edited" already did for the earlier wording |
| What it shows | Under the earlier wording, struck through as before: "Before this edit: 2 importance votes · 1 articulation vote", the people with an importance vote on its argument and with an articulation vote on this wording, either way, just before the latest edit. Later votes don't change it. A mouse shows it on hover and hides it on leaving; a press, or a tap on a phone, keeps it open until pressed again. A wording deleted or hidden says nothing |
| No migration needed | The build plan expected one to add the two counts; migration 0003 already has them on each revision (`importance_votes_before`, `articulation_votes_before`), and editing has saved them since M1-10. This sends them with each wording |
| Tests first | `server/test/api/edited-counts.test.ts`, 5 tests seen to fail first, and a sixth added after the second reader (a change of sources before and after an edit): the counts just before the edit, not after later votes; none for a wording never edited; after a second edit, the counts just before it; an edit sent twice keeps one revision and the same counts; none once deleted. `web/test/card-menu.test.ts` gains one: the reader's own edit, before the service has it, shows no counts. `e2e/edited-counts.spec.ts`, 2 tests seen to fail with the card's change set aside (hover and leave with a mouse; tap and tap again on a 375 px touch screen), and 2 added after the second reader: the pointer can move onto what it shows, and Escape hides it; a click keeps it open after the pointer leaves, and a second click closes it |
| Second reader | A fresh agent found nothing blocking, and confirmed the counts are the ones saved just before the edit, a change of sources around an edit picks the right ones, nothing shows for a hidden or deleted wording, live changes carry them, and no saved screenshot shows an edited wording. Fixed: what "edited" showed vanished as the pointer moved onto it, and Escape didn't hide it (WCAG 1.4.13); with a mouse, a click after hovering seemed to do nothing, and `aria-expanded` followed the pointer, not the click; the build plan's row said a migration was needed. Noted: an argument's importance votes belong to the argument, so on an argument with several wordings they include votes cast while another wording led, as the data model decided. M2-4 will show a hidden wording's counts to Editors |
| After the builder's review, Nov 20 | The builder asked for the earlier wording to look designed: inset from the card's edges, a background that says it's the past, and the votes in a different type from the text. It's now a panel inside the card, 18 px from its sides, warm light gray (#f3f1ec) with a hairline border; a small "Before this edit" label in the board's tracked capitals; the wording struck through; and, under a rule, each count in the serif with its words in small sans. The test's expected text changed with it (new in this pull request). Types, lint, and the edited-counts and menu browser tests pass |


## November 21 — Changing your email, by code: the design (L-04)

Build plan M2-8c, drafted in the prototype for the builder's review before it's built (the plan: "The design of the email-change screens, shown before it's built"). The prototype confirmed a new email by a link; the real product confirms with a 6-digit code (Q21).

| Check | Observed result |
| --- | --- |
| Compared first (AGENTS.md rule 12) | From memory: GitHub adds a new email and sends a link to verify it, keeping the old one until then; Google sends a code to the new address before switching. Taken: the old email stays until the code is entered; the code form is the sign-in screen's (six boxes over one input, Send a new code) |
| The steps | Email's Change opens "New email" with Cancel and Send code. Send code shows "Confirm your new email": "We sent a code to x. Your email changes when you enter it.", the code boxes, Send a new code, Cancel, and Change email. Enter submits each step. Success: "Your email is now x." on the Email row |
| Errors | As sign-in's code: "Enter the 6-digit code.", "That code isn’t right.", "That code has expired. Send a new code." (ten minutes), "Too many wrong tries. Send a new code." (five). "Another account already uses this email." is said only once the code is right, so the form can't be used to find out who has an account. A new code cancels the old: "We sent a new code to x. The earlier code no longer works." Cancel: "Your email hasn’t changed." |
| Also reworded | "Email link · Always on" is now "Email code · We email you a code each time you sign in.", and Google's Disconnect says "You can still sign in with a code sent to your email." |
| Checked | In the prototype at 1280 and 375 px: wrong code, another account, Cancel (focus back on Change), and success; no sideways scroll at 375 px |
| Open questions for the builder | Whether to email the old address when the email changes (GitHub and Google do); whether the person must have signed in recently to change it |

## Limits

- No participant comprehension study or retention evidence.
- No claim of full screen-reader, cross-browser, or device coverage.
- Standalone state persists in browser local storage when available; it does not sync with other users or devices. Fonts and icons need internet access.
- Material revision history and shared collaboration are not implemented. Presence, other viewers, spaces, and invitations are simulated.
- Live changes from other people are simulated (Simulate others); they don't validate an aggregation algorithm or a realtime backend.

## Re-run manually

Serve `docs/`, open `/prototype/`, and follow the workflow in `README.md`. Check changing and withdrawing all three judgments, unfolding and folding a stack in place, empty suggestion validation, adding a local version, Escape order, unavailable-source behavior, explicit order updates, and local-state restoration on reload. Check the Product Page at wide and narrow widths, including anchor navigation, image loading, and prototype/source links.
