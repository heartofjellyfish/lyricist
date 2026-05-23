# Design brief — redesign the "In the corpus" section (Rhyme Finder)

> Audience: Claude Design. Read this whole file before sketching.

## TL;DR

The "In the corpus" section sits **above** Rhyme Finder's main feature —
the tiered rhyme dictionary (5 stability tiers, syllable-grouped word
grids). Today it's a flat list of individual song quotes; we want to
restructure it: group quotes by **partner word** (the actual rhyme),
sort groups by **how many songs in our corpus use that exact pair**
(descending), and design a compact, in-flow expansion model that scales
from 1 to 200+ instances per group.

## Forward-looking note (read alongside the constraint below)

This feature is expected to grow in importance over time — more
artists, more corpus depth, more ways to slice the data. So while the
default state today must stay subordinate to the tier list (see
proportionality constraint below), we're open to **ambitious layout
ideas** for the section's deeper / future state. If you see a design
that doesn't fit a "compact sidekick" frame but does fit a "this could
be the page's centerpiece in two iterations" frame, sketch it too.

We want **2–3 variants** to compare:
- One that strictly respects the proportionality constraint (the
  compact, deferential version for today's product).
- One or two more ambitious takes that imagine this section as a
  first-class feature — more navigation, more visualization, more
  reading affordance. Don't be shy with layout; we'll pick.

Each variant should be coherent on its own — not a sliding scale
between minimal and maximal, but distinct design propositions.

## ⚠️ The most important constraint — proportionality (applies to the conservative variant)

**This is a supporting section, not the headline.** The main feature is
the tier list below (5 tiers × syllable-grouped candidate words). The
user comes here to find rhymes; the corpus pane enriches the experience
by showing how the canon has used each rhyme, but it must **not** outrun
the rhyme dictionary visually.

Hard rules:

- **Vertical budget at default state ≤ ~400px** on a 1440×900 desktop.
  After the section header, the user should be able to scroll down two
  swipes and see the tier list. If the default state pushes the tier
  list off the fold, the proportions are wrong.
- **No oversize display headings** inside the section. The tier list
  already uses 24–30px italic headlines. Group-level typography should
  be **smaller or comparable**, never larger.
- **Default-visible instances per group ≤ 2.** Not 5, not 10.
  Expansion is one click away; depth is for users who go looking.
- **Section-level meta line stays a single row.** Two numbers max (e.g.
  "N partners · M songs"). Don't take a header band that competes
  with the tier-list cards.
- **No new typographic flourishes** (big display words for partner
  groups, giant numerals, decorative columns). The aesthetic is paper
  index, not magazine spread.

If you're adding a feature that looks impressive, ask: would this make
the user spend more time here than on the tier list? If yes, cut it.

## Who this is for

A songwriter studying how the canon has rhymed a word — the corpus
section is the "literary cross-reference" tab. They drop in for context,
then scroll down to the tier list to pick a rhyme to use. The redesign
must respect that flow: don't trap them here.

## What exists today

- Section sits inside `#source-panel`, rendered by
  `renderSourcePanel(word)` in
  [rhyme-finder/src/main.js:1246](../src/main.js).
- Styles in [rhyme-finder/styles.css:2294-2570](../styles.css),
  prefixed `.rf-srcpanel-index-*`.
- Visual anatomy per row: vermilion `"` glyph (col 1) · pair lines in
  Spectral italic 500 — context line above (ink-soft), rhyme line
  below (full ink) — both with vermilion-highlighted rhyme words
  (col 2) · artist credit + song title in DM Mono uppercase 11px
  (col 3).
- Click a row → expands an inline stanza (vermilion border-left)
  showing surrounding lyric context. Keep this pattern.
- Section header has eyebrow ("In the corpus"), title ("How
  songwriters rhyme &lt;em&gt;dream&lt;/em&gt;"), and right-side meta
  ("30 PAIRS · 26 WRITERS").

**What's wrong with it**: rows are sorted only by exact-surface and
has-partner; beyond those keys, order is corpus-file-arbitrary. The
user can't tell that `dream/seem` appears in 4 songs while
`dream/routine` appears in 1. Every row reads as equal weight, which
buries the signal — and gives no compact way to scan the rhyme
landscape.

## Data shape

Each quote (from `getQuotes(word)`):

```js
{
  artist, credit, song, songTitle, year,
  surface,         // source word's form in this song, e.g. "dreams"
  line,            // full text of the matched line
  stanza: string[], stanzaLineIdx,  // surrounding lyric context
  position: "end" | "mid",
  partner: { line, stanzaLineIdx, word, type } | null,
}
```

Filtered to `position === "end"` only. Group key:
`partner.word.toLowerCase()`. Quotes without a partner are not part of
this section.

## Assumptions baked in (challenge if you disagree)

1. Sort key = **pair recurrence in this corpus** (how many songs use
   this partner pairing), not the partner word's overall lyric-English
   frequency.
2. **Top 2** groups default-expanded — but each shows **only 2
   instances** by default. Not 5.
3. Instances within a group sort by **year ascending** (genealogy reads
   as influence-forward); alphabetical-by-artist fallback if year
   missing.
4. Batch size for "Show K more" within a group: **3 initial, then 5 per
   click**. Conservative — we want users to taste, not drown.

## Requirements

### 1 · Group + sort

- Group end-position quotes by `partner.word.toLowerCase()`.
- Sort groups by `instances.length` **descending**. Ties →
  alphabetical by partner word.
- Within each group, sort instances by year ascending (oldest first).
- Section meta becomes: `N PARTNERS · M SONGS` (two numbers, one row,
  small mono caps — don't add a writers count, keep it lean).

### 2 · Default expansion — compact

- The top 2 groups default-expanded.
- Each expanded group shows the **first 2 instances** by default
  (not 5, not 10). The third instance onward is behind a "Show K more"
  link.
- All other groups: collapsed by default. The user sees a tight
  one-line summary per partner word, scrollable in a small footprint.
- Default state should fit ~400px vertical including the section
  header.

### 3 · Group collapsed-state row

Each collapsed group is **one row**, comparable in height to a single
quote row today (~40px). Show:

- Partner word (Spectral or Cormorant italic, 17–22px max)
- Song count (small mono numeral)
- Toggle affordance (vermilion +/− or chevron)
- Optionally: 1-line peek of the canonical (oldest/most-cited)
  instance, truncated with ellipsis if needed

Do **not** introduce a big display heading per group.

### 4 · Batch reveal within a group

A group can hold 1 to 200+ instances.

- First expand: show 3 instances.
- "Show K more" reveals the next 5.
- Keep going until exhausted; link disappears.
- Collapsing resets the counter.

### 5 · Nested stanza popout

The existing "click an instance row → inline stanza" pattern stays.
Just make sure it nests cleanly under the group expansion (visual
hierarchy: section &gt; group &gt; instance &gt; stanza).

## Decisions delegated to you

- **Collapsed-row anatomy** — do you peek the canonical instance, or
  just partner+count? Pick what scans fastest in a list of 10–15.
- **Mobile layout** — current desktop is 3-col (glyph / pair / attr);
  mobile collapses to stacked. Group model needs the same compact
  treatment.
- **Toggle affordance** — vermilion +/− glyph (existing pattern in
  `.rf-lyric-more` / `.rf-srcpanel-index-more` around
  [styles.css:2545](../styles.css)) vs. small chevron vs. weighted
  ellipsis. Pick something that doesn't add visual noise.

## Visual constraints — do not violate

- **Palette**: `--paper #dcc28e`, `--ink #1a140e`, `--ink-soft
  #3a2e1f`, `--ink-faded #6e5a3c`, `--vermilion #b13b2c`. No new
  chromatic accents.
- **Type stack**:
  - Cormorant Garamond — display / headlines / wordmark only.
  - Spectral — body text in pair/quote contexts (Cormorant italic is
    too thin at small sizes).
  - DM Mono — labels, counts, attribution.
  - Don't introduce a fourth family.
- **No modals, drawers, offscreen reveal**. Everything in-flow.
- **No drop shadows, gradients, rounded corners &gt; 2px**. The
  aesthetic is paper-and-ink, not Material.
- **Match the existing tier-list expansion pattern** (`+ SHOW K
  MORE` in vermilion + DM Mono uppercase). Don't invent a new idiom.
- **Vermilion is rationed.** README says: if you find yourself adding
  vermilion to a fourth or fifth element, stop and reconsider.

## Edge cases

1. 0 corpus quotes → existing empty state (keep copy: "No line-end
   uses in the corpus yet — try a rhyme below.")
2. 1 partner total → don't make the group ceremony feel excessive.
3. 200+ instances in one group → batch reveal must hold up without
   jank.
4. Group with single instance → group header + 1 row inside.
5. Mobile breakpoint (~720px in this stylesheet).

## What stays the same

- Section position (above tier list).
- Eyebrow + title pattern.
- Per-instance row anatomy (glyph / pair / attr). Just nest it inside
  groups, don't redesign.
- Xuan-paper background, page chrome, color palette.

## What to deliver

**2–3 distinct variants.** We will pick. Each variant should be a
coherent design proposition, not a riff on the others.

Suggested split:

- **Variant 1 (required): the conservative one.** Strictly respects
  the proportionality constraint above. Default state ≤ ~400px
  vertical, no display flourishes, defers to the tier list. This is
  what we'd ship today.
- **Variant 2 (required): the ambitious one.** Imagine the corpus
  section as a first-class feature in 6–12 months — more navigation,
  more visualization, more reading affordance. You can blow past the
  400px budget if the layout earns it (and explain why). Examples:
  frequency-bar overview, partner-word atlas, mini timeline of when
  rhymes entered the canon, side-by-side reading mode.
- **Variant 3 (optional): a wildcard.** Something that doesn't fit
  either bucket but you think we'd want to see.

For each variant, deliver:

1. The `.rf-srcpanel-index-*` CSS block (or a clearly-scoped new
   namespace if you're going somewhere structurally different).
2. The updated `renderSourcePanel(word)` logic in `main.js` — at
   least pseudo-code if a variant needs new data shapes.
3. One screenshot (or rendered HTML) at the default state.
4. One screenshot at a fully-expanded state.
5. A 2–3 sentence note: what is this variant good at, what is it bad
   at, when would we choose it.

Don't ship pixel-perfect mobile for every variant — desktop is enough
for picking. We'll resolve mobile for the chosen direction.

## Files to read first

- [rhyme-finder/README.md](../README.md) — visual language doc.
- [rhyme-finder/styles.css](../styles.css) lines 2294–2570 — current
  `.rf-srcpanel-index-*` rules.
- [rhyme-finder/src/main.js](../src/main.js) lines 1246–1330 —
  `renderSourcePanel`.

## Test against

- `dream` — many partners, several clichéd, several rare → default
  case
- `routine` — handful of partners, mostly singletons → sparse case
- `typology` — 0–1 hits → empty / near-empty case
- Most importantly: **scroll down to the tier list immediately after
  your design. If it feels far away, your section is too big.**
