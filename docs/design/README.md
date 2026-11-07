# Steelman identity brief

A short record of how Steelman should look and feel, and why. Change it when a decision changes.

## Files

- [`tokens.css`](tokens.css): every color, typeface, and texture value. The product page links it; `scripts/sync-prototype.py` copies it into the prototype.
- [`index.html`](index.html): the specimen. It shows each token and component using the prototype's real stylesheet, and lets you try new color values live. Serve `docs/` over HTTP to view it (see `AGENTS.md`).

## Principles

1. **Remove text wherever it is not necessary.** If a position, shape, or mark can carry the meaning, don't add a label. Labels that would need a person or a model to invent them (summaries, version names) don't belong.
2. **The three judgments are the visual language.** Credibility, importance, and articulation each have one control and one place:
   - credibility is the evidence mark in a card's footer;
   - importance runs top to bottom, voted beside each row;
   - articulation runs left to right, voted under each version.
   Importance and articulation share one vote control, a quarter turn apart, and one arrowhead.
3. **Everything stays physically inside the diagram.** Detail unfolds in place (a stack fans out, a card extends downward) rather than opening a new view.
4. **Black and white first.** Paper, ink, and hairlines carry the structure. Color has not been assigned yet. Decide what color *means* before choosing colors (see below).
5. **Editorial, not app-like.** Inspiration: NYT graphics and maps, early FiveThirtyEight. Serif for questions and axis labels, a clean sans for claims and controls, generous whitespace, thin rules.

## Current choices

| Area | Choice |
| --- | --- |
| Type | Source Serif 4 (questions, headings; light italic lowercase for axis labels). Libre Franklin (claims, interface). |
| Surfaces | Light gray paper with a fine grain; near-white cards with soft shadows and rounded corners. |
| Lines | Hairline axes with a swept arrowhead; gray connector wires between question, options, and arguments. |
| Motion | Physical and short: columns widen, stacks fan out, cards extend. Reduced-motion users get instant changes. |

## Open questions

- **What is color for?** Options: one hue per axis; one accent for "your vote"; or color only for evidence quality. Pick one meaning, then a palette.
- **Product page type.** The product page still uses Georgia and Helvetica; the prototype uses Source Serif 4 and Libre Franklin. Align them once the identity settles.
- **Background texture.** Plain paper grain today. Anything richer should stay behind the content and not compete with the three axes.

## Tried and set aside

- **November 7, 2026: topographic background and a five-color palette.** Interactive contour lines on the canvas, with rose, sage, and navy gradients on the axes. A follow-up direction was sketched but not built: a dark, dense, static map whose lines lighten under the cursor, with red → blue credibility, white → green importance, and white → black articulation. The first version was reverted and the second set aside in favor of setting up these tokens and deciding what color means first. Either direction can be retried in the specimen.

## How to try a change

1. Open the specimen and adjust a swatch, or edit `tokens.css` directly.
2. Check the result in the specimen, then in the prototype.
3. Run `python3 scripts/sync-prototype.py`, record what you checked in `tests/build-1-manual.md`, and note the decision here.
