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

Saved state from the previous build (version 2) restores votes and added versions but starts with every stack folded.

## Limits

- No participant comprehension study or retention evidence.
- No claim of full screen-reader, cross-browser, or device coverage.
- Standalone state persists in browser local storage when available; it does not sync with other users or devices. Fonts and icons need internet access.
- Material revision history and shared collaboration are not implemented.
- The order-update control simulates a change; it does not validate an aggregation algorithm.

## Re-run manually

Serve `docs/`, open `/prototype/`, and follow the workflow in `README.md`. Check changing and withdrawing all three judgments, unfolding and folding a stack in place, empty suggestion validation, adding a local version, Escape order, unavailable-source behavior, explicit order updates, and local-state restoration on reload. Check the Product Page at wide and narrow widths, including anchor navigation, image loading, and prototype/source links.
