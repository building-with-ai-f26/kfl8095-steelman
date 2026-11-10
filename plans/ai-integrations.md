# Plan: AI integrations

**Status:** proposal, not built. **Scope:** the browser-local prototype. Build 1 has no live model calls (AGENTS.md), so every AI result here is **simulated**: canned output after a short delay. One feature (evidence checking, A2) is the natural candidate for a real model call in Build 2.

## The key idea: AI is a clearly labeled participant, not a new system

Each AI workflow fits a slot that people already fill on the board:

| AI workflow | Human equivalent it mirrors | Where it shows |
|---|---|---|
| 1. **Draft** a steelman, or a missing argument | Writing an argument or version | An ochre card in a column or stack |
| 2. **Check evidence** against the claim | A credibility assessment | An ochre mark beside the support meter |
| 3. **Give its opinion** on importance and articulation | Importance and articulation votes | An ochre marker on the axes (hidden until revealed) |
| 4. **Audit duplicates** (should rows combine or separate?) | A combine suggestion | The existing suggestion line under a card, in ochre |

Because of this, AI needs no new mechanics: one visual rule ("ochre means AI") applied to things people already understand.

## Visual language: ochre always means "AI did this"

- The token already exists: `--sm-ai: #C9952B` and `--sm-ai-ink: #6b4a0e` in `docs/design/tokens.css`. The design README says ochre is always paired with a **dotted** treatment, so color never carries the meaning alone. (PRD v0.4 proposed light blue; the tokens have since replaced it with ochre.)
- **Every AI mark is an ochre robot icon** (Lucide `bot`) with a small verdict dot (full / half / empty / dashed, like the people's meter), because with AI checks on it appears on every card. It sits inside the component it's about: after the evidence meter, on a source row, on an AI draft's tag. Hovering it (tap on touch screens) explains *what it concluded, what it based that on, and its limitations*. There is no separate AI panel. PRD v0.4: "'AI checked' alone is insufficient." *(Built in A0; the sketches below predate the briefer version.)*
- **Ochre is reserved.** Nothing else in the product may use it. That's what makes "take it with a grain of salt" become instinctive.

### Sketches

AI-drafted argument in a column:
```
┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐   ← dotted ochre border
┊ [AI] draft                        ┊   ← ochre tag; click → how it was drafted
┊ Open weights let Chinese labs     ┊
┊ recruit global contributors...    ┊
┊                                   ┊
┊ ▢▢▢▢ unreviewed   ⧉ 0   💬        ┊   ← normal footer: human votes start at zero
└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
```

Evidence check beside the human meter (never inside it):
```
▮▮▮▯  supported · 14 people     ◆ AI: partly supports
                                  ┊ "The filing shows losses, but not that
                                  ┊  open weights caused them."  ▸ basis · limits
```

AI's take on the axes (only after **Show AI's take**):
```
 ▲ more important
 │  ● crowd               ◇ AI would rank this #1 (crowd: #3)
 │
```

Duplicate audit, using the existing suggestion line:
```
◆ AI: same point as “Nobody abroad will trust a Chinese AI service…”   Combine · Dismiss
```

## Rules that keep AI honest

1. **AI never casts counted votes.** Human totals stay human-only. AI's opinion is a separate marker (PRD v0.4: human vote counts remain separate from AI; AI starting votes are off).
2. **AI never reorders anything.** Order stays vote-driven (the same principle as [permissions.md](permissions.md)).
3. **AI proposes; people decide.** Drafts start at zero votes and unreviewed. Combine suggestions need a human to accept. In Edited mode, AI drafts go through the review queue like anyone else's.
4. **People see the AI's opinion only if they ask.** To reduce anchoring, AI's take on importance and articulation is hidden by default and shown per viewer.
5. **Provenance survives edits.** If someone substantially rewrites an AI draft, it becomes theirs, with a small note: *"started from an AI draft"*. Adopting it unchanged keeps it ochre.

## The four workflows

### A1. Draft
- **New steelman sheet:** a **Draft with AI** option. After creating the board, each option fills with 2–4 ochre draft arguments. A banner says: "These are AI drafts. Vote, revise, or remove them."
- **Fill a thin side:** on an option with fewer than two arguments (the dashed "add to this" state), **Ask AI for the strongest case for this side**. This fits the product's goal well: it covers the side nobody in the room holds.
- **Suggest a wording:** in a card's ⋯ menu, **AI: suggest a clearer version** adds an ochre version to the stack, where it competes in articulation votes.

### A2. Evidence check *(strongest Build 2 candidate)*
- On an expanded card, **Check with AI** reads each available source against the wording and returns: *supports / partly supports / doesn't support / couldn't open*, plus a short basis and limitations for each.
- It shows as an ochre mark beside the human support meter, never as a meter segment.
- If it couldn't open a source, it offers to mark it Unavailable, which a person confirms.
- An optional space setting re-checks automatically when a card's evidence changes.

### A3. AI's opinion
- A column-header lens beside Highlight: **AI's take**. When on, ochre markers show where AI would rank each argument and which wording it thinks is clearest, next to the crowd's position.
- **Disagreements** filter: only the rows where AI and the crowd differ most. This is a good prompt for discussion.
- Strongest case can add an optional ochre "AI's pick" line under each side, never replacing the crowd's.
- Fits the PRD non-goal (`docs/index.html`): "AI acting on its own. AI suggests, clearly labeled; people decide, and can always override it." AI's take is a suggestion beside the crowd's order, never a replacement for it.

### A4. Duplicate audit
- **Before posting** (most valuable): when someone adds an argument, AI checks it against existing rows. *"This looks like the same point as 'X'. Add it as a version there instead?"* Offers **Add as a version** and **Keep separate**. This stops duplicates before they exist.
- **Board audit:** the owner or an editor runs **Check for duplicates**. AI posts combine suggestions (and "this row holds two different reasons — separate?") through the existing suggestion line, in ochre. People with permission accept or dismiss them.

## Settings and credits

**Who enables it:** the space admin, in a new **Space settings → AI** panel:
- Turn on each of the four workflows separately.
- Set who can run them (owner / editors / contributors).
- Choose whether evidence checks run automatically.

The board owner can turn each workflow off for their board but can't turn on anything the space hasn't allowed.

**Who pays — recommendation:** credits come from the **space's pool** when it has one, and otherwise from the **board owner**. The person who clicks is never billed directly, because billing them would make contributors hesitate. Their permission to run AI is controlled by the role setting above.
- Companies and classes fund AI centrally (their space), which matches how they buy software.
- Personal boards and small teams without a space budget use the owner's credits, as you suggested.
- Public communities: AI is moderator-run only, or automatic evidence checks with a monthly cap. A community open to anyone can't have unmetered triggers.

**In the UI:**
- Every AI button shows its cost before it runs: *Draft steelman · ~20 credits*.
- Space settings shows the balance and a monthly cap.
- When credits run out, AI buttons stay visible but disabled, with a note: *"Out of AI credits for POD 6 — ask a space admin."*

## Components (build one at a time, confirming each)

| # | Component | Depends on |
|---|---|---|
| A0 | Ochre visual system + Steelman AI as a participant in the fixtures (one AI draft and one evidence check on the open-weights board) + specimen entry in `docs/design/` | — |
| A1 | Space settings → AI panel with simulated credits and cost previews *(board-level toggles, costs, and credits built in “How it runs”; space admin panel not yet)* | P1 (roles) for "who can run" |
| A2 | Evidence check on an expanded card *(built Nov 10, simulated: automatic on new wordings and evidence changes, on request from an opened card, Mark unavailable offer, 1 credit each)* | A0 |
| A3 | Draft: in the New steelman sheet and as "fill this side" | A0, A1 |
| A4 | Duplicate check before posting + board audit as suggestions | A0 |
| A5 | AI's take lens + Disagreements filter | A0 |

## Suggested order across both plans

1. **P1** View-as switcher + enforced roles
2. **A0** Ochre visual system
3. **P2** Board rules preset
4. **A2** Evidence check
5. **A1** Space settings → AI + credits
6. **P3** Editors and review queue (AI drafts flow through it)
7. **A3 / A4**, then **P4–P6**, and **A5** last

## Open questions
- Should AI drafts count toward an option's "needs help" threshold? (Probably not: two AI drafts shouldn't make a side look covered.)
- Should AI be able to comment, e.g. explain a duplicate suggestion in a thread, or only act through its own marks?
- What does a reader see on a public board where some arguments are AI drafts nobody has voted on? Should they fold away by default?
