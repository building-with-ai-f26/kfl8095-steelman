# Steelman prototype

Open **index.html** in a modern browser. No installation or server is required. An internet connection loads the fonts and supporting browser assets.

Argument cards use a grayscale paper texture, rounded corners, and soft shadows; the question and option headers are inverted (near-black boxes, white serif). Each card is judged on three axes:

- **Credibility:** a four-segment support meter in the card's footer. Filled segments are the share of assessments that find the wording supported, colored red (unsupported) → gray (contested) → green (supported). Dashed empty segments mean fewer than five assessments; an empty gray meter means unreviewed.
- **Importance:** the vertical vote beside each row, with an axis down the left column's edge.
- **Articulation:** the horizontal vote above each version, right under the axis of an unfolded row.

Importance and articulation share one vote control, turned a quarter turn, and their axes use map-style halos. After a vote, a word ("Important.", "Less important.", "Well articulated.", "Weaker articulation.") appears beside the arrow and fades, repeating the axis direction. Behind each column, a faint texture of filled hexagons carries the same two votes: importance sets how many cells are present (a full honeycomb behind the most important row, a scattering behind the least), and tone fades across an unfolded row from the best-articulated version.

Colors, type, and texture come from [`../design/tokens.css`](../design/tokens.css). After editing the source or the tokens, run `python3 scripts/sync-prototype.py` from the repository root to update the standalone export; the script copies the tokens in, because the sandboxed prototype cannot load local files. The original supplied prototype remains in Git history.

## Try it

- Click the paper stack to the right of a card (its small number is how many versions there are). The versions unfold in place, best articulated on the left; the column widens, the row scrolls sideways if needed, and the wires stay attached.
- Vote on articulation with the arrows above each version, and on importance with the arrows beside the row.
- Click a card's wording or its chevron to reveal context and evidence; click again to collapse. The meter and source count in the footer are information only. A card with no comments shows its comment button on hover.
- Click the dashed card at the end of a row to write a better version directly in the row. A dashed paper edge means an argument has only one version so far.
- Fold the row with the button at the end of the articulation axis, or press Escape (Escape first closes a menu, pick mode, a reply, the side panel, a source form, an edit, a draft argument or version, or an expanded card).
- Click **Add an argument** at the bottom of a column to write a new argument in place, with optional context. It joins the bottom of that column as its own row: importance 0, unreviewed, no sources, and a dashed stack edge inviting other versions. Escape or × keeps the draft for later.
- Each card has a **⋯** menu. On your own versions: **Edit wording and context** (in place), **Combine with another argument** (pick mode: the other arguments in that option show **Move here**; Escape cancels), **Make it a separate argument**, and **Delete**. Votes and comments travel with a moved version; a row left empty disappears; an Undo bar appears where the change happened for ten seconds. On other people's versions the menu says only they can change it and offers **Suggest a revised version**, which opens a new version in the same row starting from that wording.
- Options are editable too. The **⋯** on an option's header renames it in place (Enter saves, Escape keeps the old name) or deletes it, which is allowed only when it has no arguments and the question keeps at least two options; Undo is available. The dashed **+ Option** after the last column adds an option (up to four): name it and press Enter; leaving it unnamed removes it.
- In an expanded card, **Add a source** opens a short form: the source, where to find it, and what it shows; **Backs up & limits** adds two optional fields. Sources you added carry a "You" tag and can be edited or removed (with Undo). Anyone can choose **Can't open it?** to report a source; it is marked Unavailable on every version that cites it, and "Yes" needs at least one available source. Changing the evidence on a card that already has assessments adds a note that the evidence changed.
- Every question, option, and version has a speech-bubble icon with its open-comment count. Click it to open the comments panel next to that item; the item gets a dark ring. Comment, reply, resolve or reopen a thread, and delete your own comments (⌘/Ctrl + Enter also posts). Resolved threads fold under "Resolved". On wide screens the board makes room for the panel; on narrower ones it floats on the side away from the item, or just below it.
- Under the question: the author, the date, and who can see it ("POD 6 only", "Private", or "Anyone with link"; the organization is listed separately when the question isn't limited to it). The cog opens settings beside the board: rename the question and choose the organization and visibility. Choosing who can contribute and vote is marked **Coming soon**. **Reset to the original example** (click twice) restores the example board; **Simulate a reorder** in the bottom bar previews a change in the shared order.

Everything a contributor can edit (the question, options, arguments, versions, and sources) is saved as one document in the browser, so later edits can change any part of it. The claims, sources, and votes are illustrative. Interactions are local to the prototype; there is no shared backend.
