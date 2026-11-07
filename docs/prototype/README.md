# Steelman prototype

Open **index.html** in a modern browser. No installation or server is required. An internet connection loads the fonts and supporting browser assets.

Argument cards use a grayscale paper texture, rounded corners, and soft shadows; the question and option headers are inverted (near-black boxes, white serif). Each card is judged on three axes:

- **Credibility:** a four-segment support meter in the card's footer. Filled segments are the share of assessments that find the wording supported, colored red (unsupported) → gray (contested) → green (supported). Dashed empty segments mean fewer than five assessments; an empty gray meter means unreviewed.
- **Importance:** the vertical vote beside each row, with an axis down the left column's edge.
- **Articulation:** the horizontal vote under each version, with an axis above an unfolded row.

Importance and articulation share one vote control, turned a quarter turn, and their axes use map-style halos. Behind each column, a faint outlined hex texture carries the same two votes: cell size follows importance, and darkness fades across an unfolded row from the best-articulated version.

Colors, type, and texture come from [`../design/tokens.css`](../design/tokens.css). After editing the source or the tokens, run `python3 scripts/sync-prototype.py` from the repository root to update the standalone export; the script copies the tokens in, because the sandboxed prototype cannot load local files. The original supplied prototype remains in Git history.

## Try it

- Click the paper stack to the right of a card. Its versions unfold in place, best articulated on the left; the column widens to make room and the wires stay attached.
- Vote on articulation with the arrows beneath each version, and on importance with the arrows beside the row.
- Click a card's chevron to reveal context and evidence inside the card; click it again to collapse.
- Click the dashed card at the end of a row to write a better version directly in the row. A dashed paper edge means an argument has only one version so far.
- Fold the row with the button at the end of the articulation axis, or press Escape (Escape first closes a draft or an expanded card).

The claims, sources, and votes are illustrative. Interactions are local to the prototype; there is no shared backend.
