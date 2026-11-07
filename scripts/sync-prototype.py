"""Copy the editable fragment, with the shared design tokens, into its standalone, sandboxed browser export."""

from pathlib import Path
import html
import re

root = Path(__file__).resolve().parents[1]
export = root / "docs/prototype/index.html"
source = (root / "docs/prototype/source/steelman-refined.html").read_text()
# The sandboxed prototype cannot load local stylesheets, so the shared tokens are inlined here.
tokens_marker = "/* @tokens: docs/design/tokens.css is inserted here by scripts/sync-prototype.py */"
if source.count(tokens_marker) != 1:
    raise SystemExit("Expected one design-tokens marker in the prototype source")
tokens = (root / "docs/design/tokens.css").read_text().strip()
source = source.replace(tokens_marker, tokens_marker + "\n" + tokens)
outer = export.read_text()
match = re.search(r'data-srcdoc="([^"]*)"', outer)
if not match:
    raise SystemExit("Missing prototype iframe")
document = html.unescape(match[1])
start, end = "<!-- steelman-source:start -->", "<!-- steelman-source:end -->"
if document.count(start) != 1 or document.count(end) != 1:
    raise SystemExit("Expected one marked prototype source fragment")
before, rest = document.split(start)
_, after = rest.split(end)
document = before + start + "\n" + source + "\n" + end + after
export.write_text(outer[:match.start(1)] + html.escape(document, quote=True) + outer[match.end(1):])
print("Synced prototype source → standalone index.html")
