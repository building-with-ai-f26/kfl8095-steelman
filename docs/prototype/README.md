# Steelman prototype

Open **index.html** in a modern browser. No installation or server is required. An internet connection loads the fonts and supporting browser assets.

Argument cards use a grayscale paper texture, rounded corners, and soft shadows. Each card is judged on three axes: credibility (the evidence mark in its footer), importance (the vertical vote beside it), and articulation (the horizontal vote under each version). Importance and articulation share one vote control, turned a quarter turn. A hairline arrow with light lowercase labels marks each axis: between the columns for importance, above an unfolded row for articulation.

## Files

- `index.html` — runnable standalone prototype.
- [`../reference/steelman-prd-v0.4.md`](../reference/steelman-prd-v0.4.md) — the original PRD, unchanged.
- `source/steelman-refined.html` — editable source fragment used for the inline prototype.

Colors, type, and texture come from [`../design/tokens.css`](../design/tokens.css). After editing the source or the tokens, run `python3 scripts/sync-prototype.py` from the repository root to update the standalone export; the script copies the tokens in, because the sandboxed prototype cannot load local files. The original supplied prototype remains in Git history.

## Try it

- Click the paper stack to the right of a card. Its versions unfold in place, best articulated on the left; the column widens to make room and the wires stay attached.
- Vote on articulation with the arrows beneath each version, and on importance with the arrows beside the row.
- Click a card's chevron to reveal context and evidence inside the card; click it again to collapse.
- Click the dashed card at the end of a row to write a better version directly in the row. A dashed paper edge means an argument has only one version so far.
- Fold the row with the button at the end of the articulation axis, or press Escape (Escape first closes a draft or an expanded card).

The claims, sources, and votes are illustrative. Interactions are local to the prototype; there is no shared backend.
