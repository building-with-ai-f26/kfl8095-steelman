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
- Fold the row with the button at the end of the articulation axis, or press Escape (Escape first closes a reply, the side panel, a draft, or an expanded card).
- Every question, option, and version has a speech-bubble icon with its open-comment count. Click it to open the comments panel next to that item; the item gets a dark ring. Comment, reply, resolve or reopen a thread, and delete your own comments (⌘/Ctrl + Enter posts). Resolved threads fold under "Resolved". On wide screens the board makes room for the panel; on narrower ones it floats on the side away from the item, or just below it.
- Under the question, a light line shows who posted it, when, the organization, and who can see it. The cog opens settings beside the board: rename the question, choose the organization and visibility, and decide who can contribute and vote. **Reset to the original example** (click twice) restores the example board.

Everything a contributor can edit (the question, options, arguments, versions, and sources) is saved as one document in the browser, so later edits can change any part of it. The claims, sources, and votes are illustrative. Interactions are local to the prototype; there is no shared backend.
