#!/usr/bin/env python3
"""Build plans/feature-audit.xlsx from plans/features.csv.

The CSV is the record: one row per feature, edited by hand or by an agent,
reviewed as a normal diff. The workbook is a generated view with formatting,
derived columns (priority score, next step), a summary, and a legend. Don't
edit the workbook; change the CSV and run:

    python3 scripts/build-feature-audit.py

Needs openpyxl (pip install openpyxl). Only this script needs it; the
prototype and the Product Page stay buildless.
"""
import csv
import sys
from pathlib import Path

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.formatting.rule import CellIsRule
    from openpyxl.utils import get_column_letter
    from openpyxl.workbook.properties import CalcProperties
except ImportError:
    sys.exit("This script needs openpyxl: pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "plans" / "features.csv"
OUT = ROOT / "plans" / "feature-audit.xlsx"

TIERS = [  # (label, meaning, score weight)
    ("T1 Core", "The core loop: without it, a group can't collaborate on creating a steelman (write arguments and versions, judge them three ways, see the strongest case).", 10),
    ("T2 Launch", "Not the loop itself, but real people can't responsibly use it without this: safety, privacy, trust in your own contributions, access, measurement.", 7),
    ("T3 Enhance", "Makes collaboration noticeably better; the loop works without it. First wave after launch.", 4),
    ("T4 Scale", "Needed once groups, boards, or communities grow: spaces, roles and modes, navigation at volume, AI cost control.", 1),
    ("T5 Later", "PRD later experiments, deferred features, and polish.", 0),
    ("N/A", "Prototype-only testing tool; not a product feature.", -10),
]
TIER_NAMES = [t[0] for t in TIERS]
STATUSES = ["Built", "Partly built", "Simulated", "Planned only", "Not built", "Prototype tool"]
COMPLEXITY = [
    (1, "Frontend only or reuse as-is."),
    (2, "Simple CRUD on one or two entities with basic validation."),
    (3, "Several entities, permission checks, or intricate UI ported from the prototype."),
    (4, "Needs shared infrastructure: email, realtime, background jobs, metering, invite tokens."),
    (5, "Hard or novel: vote-merge and rollback rules, LLM quality and cost, concurrent live editing."),
]
READINESS = [
    (1, "Not designed: an idea in a plan or the PRD."),
    (2, "Concept or simulated: flow sketched, key states (errors, empty, conflict) missing."),
    (3, "Built in the prototype; open design decisions or edge states remain."),
    (4, "Built and polished in the prototype; not yet tested with users."),
    (5, "Tested with real users and ready to build."),
]
INFRA = ["DB", "API", "Auth", "Permissions", "Realtime", "Email", "Jobs", "Notifications", "History", "LLM", "Billing", "Frontend"]
COLUMNS = ["id", "area", "feature", "description", "status", "tier", "tier_why", "complexity",
           "complexity_why", "readiness", "design_gaps", "needs", "changed", "evidence"]


def load():
    with SRC.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != COLUMNS:
            sys.exit(f"{SRC.name}: columns must be exactly {', '.join(COLUMNS)}")
        rows = list(reader)
    problems, seen = [], set()
    for n, row in enumerate(rows, 2):
        where = f"{SRC.name} line {n} ({row['id'] or 'no id'})"
        if not row["id"] or row["id"] in seen:
            problems.append(f"{where}: missing or duplicate id")
        seen.add(row["id"])
        if row["tier"] not in TIER_NAMES:
            problems.append(f"{where}: tier must be one of {', '.join(TIER_NAMES)}")
        if row["status"] not in STATUSES:
            problems.append(f"{where}: status must be one of {', '.join(STATUSES)}")
        for key in ("complexity", "readiness"):
            if row[key] not in {"1", "2", "3", "4", "5"}:
                problems.append(f"{where}: {key} must be 1–5")
        if not row["feature"] or not row["area"]:
            problems.append(f"{where}: feature and area are required")
    if problems:
        sys.exit("\n".join(problems))
    for row in rows:
        row["complexity"] = int(row["complexity"])
        row["readiness"] = int(row["readiness"])
    return rows


FONT = "Arial"
def font(**k): return Font(name=FONT, size=k.pop("size", 10), **k)
def fill(hexc): return PatternFill("solid", fgColor=hexc, bgColor=hexc)
INK = "1F1F1F"
HDR_FILL = PatternFill("solid", fgColor="2B2B2B")
JUDGMENT_FILL = PatternFill("solid", fgColor="FFF6D5")
BORDER = Border(bottom=Side(style="thin", color="D0CCC4"))
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="top", wrap_text=True)


def features_sheet(ws, rows):
    # Derived columns (M, N) sit right after the CSV's rating columns so formulas stay stable.
    headers = [("ID", 7), ("Area", 18), ("Feature", 32), ("What it does in the prototype", 52),
               ("Prototype status", 14), ("MVP tier", 13), ("Why this tier", 36),
               ("Dev complexity (1–5)", 12), ("What makes it complex", 40),
               ("Design readiness (1–5)", 12), ("Design gaps / open questions", 40),
               ("Real-version needs", 22), ("Priority score", 10), ("Suggested next step", 24),
               ("Last changed", 12), ("Evidence", 30)]
    centered = {1, 5, 6, 8, 10, 13, 15}
    for i, (h, w) in enumerate(headers, 1):
        c = ws.cell(row=1, column=i, value=h)
        c.font = font(bold=True, color="FFFFFF")
        c.fill = HDR_FILL
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center" if i in centered else "left")
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[1].height = 32

    tier_range = f"Legend!$A$5:$A${4 + len(TIERS)}"
    weight_range = f"Legend!$C$5:$C${4 + len(TIERS)}"
    for r, row in enumerate(rows, 2):
        values = [row[k] for k in COLUMNS[:12]] + [
            f'=IFERROR(INDEX({weight_range},MATCH(F{r},{tier_range},0))+(5-H{r})+J{r},"")',
            (f'=IF(F{r}="N/A","Drop (prototype tool)",'
             f'IF(OR(F{r}="T1 Core",F{r}="T2 Launch"),'
             f'IF(J{r}<=2,"Design first",IF(H{r}>=4,"Spike / architecture decision","Ready to build")),'
             f'IF(F{r}="T3 Enhance","Next after launch",IF(F{r}="T4 Scale","Scale backlog","Later"))))'),
            row["changed"], row["evidence"]]
        for ci, v in enumerate(values, 1):
            c = ws.cell(row=r, column=ci, value=v)
            c.font = font(color=INK, bold=(ci == 3))
            c.alignment = CENTER if ci in centered else WRAP
            c.border = BORDER
            if ci in (6, 8, 10):
                c.fill = JUDGMENT_FILL
                c.font = font(color="0000FF", bold=True)
    last = len(rows) + 1

    ws.freeze_panes = "D2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{last}"
    for formula, ref in ((f'"{",".join(TIER_NAMES)}"', f"F2:F{last}"),
                         (f'"{",".join(STATUSES)}"', f"E2:E{last}")):
        dv = DataValidation(type="list", formula1=formula)
        ws.add_data_validation(dv)
        dv.add(ref)
    dv = DataValidation(type="whole", operator="between", formula1="1", formula2="5")
    ws.add_data_validation(dv)
    dv.add(f"H2:H{last}")
    dv.add(f"J2:J{last}")

    tier_colors = dict(zip(TIER_NAMES, ["B7DFC0", "DDEFD9", "DCEBF7", "EEEEEE", "F7F7F7", "F2DEDE"]))
    for k, col in tier_colors.items():
        ws.conditional_formatting.add(f"F2:F{last}", CellIsRule(operator="equal", formula=[f'"{k}"'], fill=fill(col)))
    warm, cool = fill("F6D3C8"), fill("DDEFD9")
    ws.conditional_formatting.add(f"H2:H{last}", CellIsRule(operator="greaterThanOrEqual", formula=["4"], fill=warm))
    ws.conditional_formatting.add(f"H2:H{last}", CellIsRule(operator="lessThanOrEqual", formula=["2"], fill=cool))
    ws.conditional_formatting.add(f"J2:J{last}", CellIsRule(operator="lessThanOrEqual", formula=["2"], fill=warm))
    ws.conditional_formatting.add(f"J2:J{last}", CellIsRule(operator="greaterThanOrEqual", formula=["4"], fill=cool))
    for k, col in {"Ready to build": "C9E7CF", "Design first": "FBE3B5", "Spike / architecture decision": "F6D3C8"}.items():
        ws.conditional_formatting.add(f"N2:N{last}", CellIsRule(operator="equal", formula=[f'"{k}"'], fill=fill(col)))
    return last


def legend_sheet(lg):
    lg.sheet_view.showGridLines = False
    lg.column_dimensions["A"].width = 16
    lg.column_dimensions["B"].width = 70
    lg.column_dimensions["C"].width = 14
    row = 1
    def heading(text, size=12):
        nonlocal row
        lg.cell(row=row, column=1, value=text).font = font(bold=True, size=size)
        row += 1
    def line(a, b, *, c=None, note=False):
        nonlocal row
        if a is not None:
            cell = lg.cell(row=row, column=1, value=a)
            cell.font = font(bold=True)
            cell.alignment = Alignment(horizontal="left", vertical="top")
        cell = lg.cell(row=row, column=2, value=b)
        cell.font = font(italic=note, color="666666" if note else INK)
        cell.alignment = WRAP
        if c is not None:
            cell = lg.cell(row=row, column=3, value=c)
            cell.font = font(color="0000FF")
            cell.fill = JUDGMENT_FILL
            cell.alignment = CENTER
        row += 1

    heading("Steelman feature audit — how to read and update", 14)
    intro = lg.cell(row=row, column=1, value=(
        "Generated from plans/features.csv by scripts/build-feature-audit.py. Change the CSV, then rerun "
        "the script; edits made here are overwritten. Yellow cells on Features are judgments (tier, "
        "complexity, readiness); priority score, next step, and Summary are derived."))
    intro.font = font(italic=True)
    intro.alignment = WRAP
    lg.merge_cells(start_row=row, start_column=1, end_row=row, end_column=3)
    lg.row_dimensions[row].height = 42
    row += 2

    assert row == 4, "tier table must start at row 5; formulas on Features point there"
    heading("MVP tier (MVP = T1 + T2)")
    lg.cell(row=4, column=3, value="Score weight").font = font(bold=True)
    for name, meaning, weight in TIERS:
        line(name, meaning, c=weight)
    row += 1
    heading("Dev complexity (real version)")
    for n, text in COMPLEXITY:
        line(n, text)
    line(None, "Assumes a conventional stack: web frontend, API, Postgres, hosted auth, transactional email.", note=True)
    row += 1
    heading("Design readiness")
    for n, text in READINESS:
        line(n, text)
    line(None, "Design-ready means 4. A 5 needs outside user testing, which the prototype hasn't had yet.", note=True)
    row += 1
    heading("Derived and tracking columns")
    line("Priority score", "Tier weight (column C above) + (5 − complexity) + design readiness. A sorting aid, not a verdict.")
    line("Next step", "T1/T2 with readiness ≤ 2 → Design first; else complexity ≥ 4 → Spike / architecture decision; "
         "else Ready to build. T3 → Next after launch; T4 → Scale backlog; T5 → Later; N/A → Drop. Tiers are judged "
         "by role in the core loop, not by whether the prototype already has the feature.")
    line("Real-version needs", "Infrastructure each feature depends on: " + ", ".join(INFRA) + ".")
    line("Last changed", "Date the row last changed in features.csv.")
    line("Evidence", "What last moved the row: a dated entry in tests/build-1-manual.md, a PR, or a decision.")
    row += 1
    heading("Sources")
    for s in ["docs/prototype/README.md (feature walkthrough)",
              "plans/permissions.md, plans/ai-integrations.md (built vs. planned)",
              "docs/reference/steelman-prd-v0.4.md §5–7 (trial rules, later experiments)",
              "docs/index.html (PRD v2 non-goals)"]:
        line(None, s)


def summary_sheet(sm, rows, last):
    sm.sheet_view.showGridLines = False
    sm.column_dimensions["A"].width = 26
    for col in range(2, 11):
        sm.column_dimensions[get_column_letter(col)].width = 12
    sm.cell(row=1, column=1, value="Summary").font = font(bold=True, size=14)
    rng = lambda col: f"Features!${col}$2:${col}${last}"
    FA, FR, FH, FJ, FN, FL = (rng(c) for c in "BFHJNL")

    def header(r, labels):
        for i, t in enumerate(labels, 1):
            c = sm.cell(row=r, column=i, value=t)
            c.font = font(bold=True, color="FFFFFF")
            c.fill = HDR_FILL
            c.alignment = Alignment(horizontal="left" if i == 1 else "center", wrap_text=True, vertical="center")
        sm.row_dimensions[r].height = 30

    def body(r, ncols, bold=False):
        for col in range(1, ncols + 1):
            c = sm.cell(row=r, column=col)
            c.border = BORDER
            c.font = font(bold=bold)
            if col > 1:
                c.alignment = Alignment(horizontal="center")

    areas = list(dict.fromkeys(r["area"] for r in rows))
    header(3, ["Area"] + TIER_NAMES + ["Total", "Avg complexity", "Avg readiness"])
    for i, area in enumerate(areas):
        r = 4 + i
        sm.cell(row=r, column=1, value=area)
        for j, t in enumerate(TIER_NAMES):
            sm.cell(row=r, column=2 + j, value=f'=COUNTIFS({FA},$A{r},{FR},"{t}")')
        sm.cell(row=r, column=8, value=f"=SUM(B{r}:G{r})")
        sm.cell(row=r, column=9, value=f'=IFERROR(AVERAGEIFS({FH},{FA},$A{r},{FR},"<>N/A"),"")')
        sm.cell(row=r, column=10, value=f'=IFERROR(AVERAGEIFS({FJ},{FA},$A{r},{FR},"<>N/A"),"")')
        body(r, 10)
    total = 4 + len(areas)
    sm.cell(row=total, column=1, value="Total")
    for col in range(2, 9):
        L = get_column_letter(col)
        sm.cell(row=total, column=col, value=f"=SUM({L}4:{L}{total - 1})")
    sm.cell(row=total, column=9, value=f'=AVERAGEIFS({FH},{FR},"<>N/A")')
    sm.cell(row=total, column=10, value=f'=AVERAGEIFS({FJ},{FR},"<>N/A")')
    body(total, 10, bold=True)
    for r in range(4, total + 1):
        for col in (9, 10):
            sm.cell(row=r, column=col).number_format = "0.0"

    r0 = total + 2
    header(r0, ["MVP scope (T1 + T2)", "T1 Core", "T2 Launch", "Both"])
    for i, step in enumerate(["Ready to build", "Design first", "Spike / architecture decision"]):
        r = r0 + 1 + i
        sm.cell(row=r, column=1, value=step)
        sm.cell(row=r, column=2, value=f'=COUNTIFS({FN},$A{r},{FR},"T1 Core")')
        sm.cell(row=r, column=3, value=f'=COUNTIFS({FN},$A{r},{FR},"T2 Launch")')
        sm.cell(row=r, column=4, value=f"=B{r}+C{r}")
        body(r, 4)
    r = r0 + 4
    sm.cell(row=r, column=1, value="Not yet design-ready (< 4)")
    sm.cell(row=r, column=2, value=f'=COUNTIFS({FR},"T1 Core",{FJ},"<4")')
    sm.cell(row=r, column=3, value=f'=COUNTIFS({FR},"T2 Launch",{FJ},"<4")')
    sm.cell(row=r, column=4, value=f"=B{r}+C{r}")
    body(r, 4, bold=True)

    r1 = r0 + 6
    header(r1, ["Infrastructure needed by", "T1 Core", "T2 Launch", "Both"])
    for i, item in enumerate(INFRA):
        r = r1 + 1 + i
        sm.cell(row=r, column=1, value=item)
        sm.cell(row=r, column=2, value=f'=COUNTIFS({FL},"*"&$A{r}&"*",{FR},"T1 Core")')
        sm.cell(row=r, column=3, value=f'=COUNTIFS({FL},"*"&$A{r}&"*",{FR},"T2 Launch")')
        sm.cell(row=r, column=4, value=f"=B{r}+C{r}")
        body(r, 4)
    note = sm.cell(row=r1 + len(INFRA) + 1, column=1, value="Counts features whose 'Real-version needs' mention each item.")
    note.font = font(italic=True, color="666666")
    sm.freeze_panes = "A4"


def main():
    rows = load()
    wb = Workbook()
    ws = wb.active
    ws.title = "Features"
    last = features_sheet(ws, rows)
    summary_sheet(wb.create_sheet("Summary"), rows, last)
    legend_sheet(wb.create_sheet("Legend"))
    wb.calculation = CalcProperties(fullCalcOnLoad=True)  # Excel and Numbers compute formulas on open
    wb.save(OUT)
    print(f"{len(rows)} features → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
