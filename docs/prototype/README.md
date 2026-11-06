# Steelman prototype

Open **index.html** in a modern browser. No installation or server is required. An internet connection loads the fonts and supporting browser assets.

Argument cards use a grayscale paper texture, rounded corners, and soft shadows. Expanding a version reveals context and evidence beneath the same claim and footer, while neighboring versions stay collapsed in the row.

## Files

- `index.html` — runnable standalone prototype.
- [`../reference/steelman-prd-v0.4.md`](../reference/steelman-prd-v0.4.md) — the original PRD, unchanged.
- `source/steelman-refined.html` — editable source fragment used for the inline prototype.

After editing the source, run `python3 scripts/sync-prototype.py` from the repository root to update the standalone export. The original supplied prototype remains in Git history.

## Try it

- Click the paper stack on the right of the first card to expand its articulations.
- Click a card's downward chevron to reveal context and evidence. Click the upward chevron to collapse it.
- Open a neighboring version to compare it; on narrow screens, scroll the row sideways.
- Click a source to inspect its details; use Yes or No to assess its support.
- Close a view or press Escape to return to the diagram.

The claims, sources, and votes are illustrative. Interactions are local to the prototype; there is no shared backend.
