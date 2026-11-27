"""Generate the seamless topographic contour tile used as the canvas texture.

The height field is a sum of sine waves whose periods divide the tile size, so
the tile repeats with no seam. Contours are traced with marching squares,
joined into polylines, and written to docs/design/contours.svg.

As on a topographic map, the lines come in three sets, each one <path>:
every fifth level is an index contour, drawn heavier (1.5 px at about twice
the opacity); the other levels are drawn as before; and a fine set halfway
between neighbouring levels is drawn at half the opacity.

Run from the repository root:  python3 scripts/make-contours.py
Then run:                       python3 scripts/sync-prototype.py
"""

from pathlib import Path
import math
import random

TILE = 480      # tile size in px
STEP = 6        # sampling grid in px
LEVELS = 22     # contour levels across the field's range
OPACITY = .2    # white lines a little above the canvas color: quiet but legible
INDEX = 5       # every fifth level (k = 0, 5, 10, ...) is an index contour
INDEX_OPACITY, INDEX_WIDTH = .4, 1.5
FINE_OPACITY = OPACITY / 2
SIMPLIFY = .15  # px: points closer than this to a straight run are dropped, keeping the tile small
SEED = 5280

root = Path(__file__).resolve().parents[1]
rng = random.Random(SEED)

# Low-frequency waves with integer wave numbers keep the field periodic over TILE.
waves = []
for m in range(-4, 5):
    for n in range(-4, 5):
        if (m, n) == (0, 0) or m * m + n * n > 17:
            continue
        waves.append((m, n, rng.uniform(0, 2 * math.pi), rng.uniform(.4, 1) / math.hypot(m, n) ** 1.2))


def height(x, y):
    return sum(a * math.sin(2 * math.pi * (m * x + n * y) / TILE + p) for m, n, p, a in waves)


cells = TILE // STEP
field = [[height(i * STEP, j * STEP) for i in range(cells + 1)] for j in range(cells + 1)]
lo = min(min(r) for r in field)
hi = max(max(r) for r in field)
levels = [lo + (hi - lo) * (k + .5) / LEVELS for k in range(LEVELS)]


def key(p):
    return (round(p[0], 2), round(p[1], 2))


def simplify(line, tolerance=SIMPLIFY):
    """Drops points that lie within the tolerance of the line through their neighbours
    (Ramer-Douglas-Peucker). The ends stay where they are, so edges still meet."""
    if len(line) < 3:
        return line
    (x0, y0), (x1, y1) = line[0], line[-1]
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    far, at = 0, 0
    for i in range(1, len(line) - 1):
        px, py = line[i]
        gap = abs(dy * (px - x0) - dx * (py - y0)) / length if length else math.hypot(px - x0, py - y0)
        if gap > far:
            far, at = gap, i
    if far <= tolerance:
        return [line[0], line[-1]]
    return simplify(line[:at + 1], tolerance)[:-1] + simplify(line[at:], tolerance)


def trace(t):
    """The contour at height t, as SVG path data: one polyline per M."""
    paths = []
    segments = []
    for j in range(cells):
        for i in range(cells):
            a, b = field[j][i], field[j][i + 1]
            c, d = field[j + 1][i + 1], field[j + 1][i]
            x0, y0 = i * STEP, j * STEP
            pts = []
            if (a > t) != (b > t):
                pts.append((x0 + STEP * (t - a) / (b - a), y0))
            if (b > t) != (c > t):
                pts.append((x0 + STEP, y0 + STEP * (t - b) / (c - b)))
            if (d > t) != (c > t):
                pts.append((x0 + STEP * (t - d) / (c - d), y0 + STEP))
            if (a > t) != (d > t):
                pts.append((x0, y0 + STEP * (t - a) / (d - a)))
            if len(pts) == 2:
                segments.append(tuple(pts))
            elif len(pts) == 4:
                segments += [(pts[0], pts[1]), (pts[2], pts[3])]
    # Join segments that share endpoints into polylines.
    ends = {}
    for idx, (p, q) in enumerate(segments):
        ends.setdefault(key(p), []).append(idx)
        ends.setdefault(key(q), []).append(idx)
    used = [False] * len(segments)
    for idx in range(len(segments)):
        if used[idx]:
            continue
        used[idx] = True
        line = list(segments[idx])
        for forward in (True, False):
            while True:
                tip = key(line[-1] if forward else line[0])
                nxt = next((s for s in ends.get(tip, []) if not used[s]), None)
                if nxt is None:
                    break
                used[nxt] = True
                p, q = segments[nxt]
                point = q if key(p) == tip else p
                if forward:
                    line.append(point)
                else:
                    line.insert(0, point)
        paths.append('M' + 'L'.join(f'{x:.1f} {y:.1f}'.replace('.0 ', ' ') for x, y in simplify(line)))
    return "".join(paths)


index = "".join(trace(t) for k, t in enumerate(levels) if k % INDEX == 0)
regular = "".join(trace(t) for k, t in enumerate(levels) if k % INDEX != 0)
fine = "".join(trace((a + b) / 2) for a, b in zip(levels, levels[1:]))


def path(d, opacity, width):
    return (f'<path fill="none" stroke="#fff" stroke-opacity="{opacity}" stroke-width="{width}" '
            f'stroke-linejoin="round" stroke-linecap="round" d="{d}"/>')


# Faintest first, so the heavier lines are drawn over the finer ones where they meet.
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{TILE}" height="{TILE}" viewBox="0 0 {TILE} {TILE}">'
       + path(fine, FINE_OPACITY, 1) + path(regular, OPACITY, 1) + path(index, INDEX_OPACITY, INDEX_WIDTH) + '</svg>\n')
out = root / "docs/design/contours.svg"
out.write_text(svg)
print(f"Wrote {out.relative_to(root)} ({len(svg) // 1024} KB; polylines: {index.count('M')} index, {regular.count('M')} regular, {fine.count('M')} fine)")

# The sandboxed prototype cannot load files, so the tile is also embedded in tokens.css as a data URI.
tokens = root / "docs/design/tokens.css"
start, end = "/* contours:start */", "/* contours:end */"
text = tokens.read_text()
if text.count(start) != 1 or text.count(end) != 1:
    raise SystemExit("Expected one contours marker pair in tokens.css")
uri = svg.strip().replace('"', "'").replace("#", "%23").replace("<", "%3C").replace(">", "%3E")
before, rest = text.split(start)
_, after = rest.split(end)
tokens.write_text(before + start + f'\n  --sm-contours:url("data:image/svg+xml,{uri}");\n  ' + end + after)
print("Updated --sm-contours in docs/design/tokens.css")
