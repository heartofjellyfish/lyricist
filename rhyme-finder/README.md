# Rhyme Finder — design reference

A songwriter's rhyme dictionary, designed in the visual language of a Wang Shimin landscape painting (Qing-dynasty 山水画) — warm xuan-paper background, sumi-ink typography in Cormorant Garamond, a single vermilion 朱印-style accent, and a brushed shanshui motif paired with the wordmark.

This doc is the **visual + interaction reference** for the tool. When adding new UI (footer, support area, additional surfaces, etc.), match the tokens and principles below so the feel stays coherent. The tool itself lives in [`index.html`](index.html), [`styles.css`](styles.css), and [`src/`](src/); architecture and deploy rules are in [`/CLAUDE.md`](../CLAUDE.md).

---

## Colophon — feedback + support (added 2026-05-13)

In place of a footer strip, the go-to-market touchpoints live in a single **colophon** in the top-right corner of the page. The trigger is a small anonymous pictogram. Clicking it opens a card with a feedback form + a quiet support line.

**Shipped defaults** (swap via data-attributes in `index.html`):

- Trigger pictogram — `data-trigger="envelope"` on `.rf-colophon`. Options: `notes` (italic Cormorant + vermilion dot), `envelope` (ink-line SVG with vermilion wax seal — **default**), `brush` (vermilion 笔 seal).
- Form field style — `data-variant="soft-card"` on `.rf-colophon-form`. Options: `soft-card` (rounded paper-tinted cards — **default**), `notebook` (no card, bottom-rule lines only), `tagged` (asymmetric tag cards with corner mark).

**Card contents**, in deliberate order:

1. **Maker's note.** Two-line prose framing the tool as a one-person work.
2. **Feedback form.** Textarea (required) + optional name + optional email. POSTs to **Formspree** so the user never sees an email client. On success the form fades and an over-sized vermilion 谢 seal stamps onto the card with a bounce-press animation; a single "Sent. The note's on its way." line and a `send another` reset link follow. On failure the form flips to an inline error with a `mailto:liuqi627@gmail.com` fallback so the note is never stranded.
3. **Quiet support line.** *"Or, if you'd care to — leave a coffee."* with a single Buy Me a Coffee link. Tucked after the form so the page never reads as a donation prompt; offered, never demanded.

Support is international-only (Buy Me a Coffee). WeChat / Alipay 赞赏码 were considered but dropped — kept the scope tighter and removed the QR-image asset pipeline. Revisit if Chinese audience signal asks for it.

### Before launch — your todo

- [ ] **Set up Formspree** (or any equivalent form-to-email service):
      1. Sign up at [formspree.io](https://formspree.io) with `liuqi627@gmail.com`.
      2. Create a new form. Free tier is enough for early traffic (50 submissions / month).
      3. Copy the endpoint URL (looks like `https://formspree.io/f/xpzgnabc`).
      4. In [`index.html`](index.html), replace `REPLACE_FORMSPREE_ID` in the `<form action="...">` attribute with your form id.
      5. Activate the form by sending one test note — Formspree mails you a confirmation link the first time.
      Alternatives: [Web3Forms](https://web3forms.com) (no signup, access-key flow), Netlify Forms.

- [ ] **Sign up at [Buy Me a Coffee](https://www.buymeacoffee.com)** and replace `REPLACE_BMC_URL` in [`index.html`](index.html) with your page URL. If you prefer Ko-fi, PayPal.Me, Stripe Payment Link, or Liberapay, just swap the `href` — the colophon footer holds one link, one label, no code path assumes BMC.

- [ ] **(Optional) Pick the trigger pictogram.** Open the page and try `data-trigger="notes" | "envelope" | "brush"` on `.rf-colophon`. Likewise try `data-variant="soft-card" | "notebook" | "tagged"` on `.rf-colophon-form`. Once a combination feels right, the other CSS variants can be stripped from `styles.css`.

- [ ] **(Optional) Adjust the maker's note prose** in `index.html` if "weekends and quiet evenings" doesn't sit right.

- [ ] **(Optional) Adjust the success-state seal glyph** (currently `谢`). Any single character renders inside the 58×58 vermilion stamp without further CSS work.

---

## Two screen states

The app is a single page with two states, switched by `:has()` selectors based on whether `#results` and `#source-summary` have content.

### State 1 — hero / search input (empty state)

What the user sees on first load. The painting-and-title composition sits centered vertically; the input field sits below.

- **Painting:** inline SVG of a 写意 (xieyi) shanshui — three layered mountain ridges (faint to bold), three tiny pine silhouettes on the foremost ridge, a small boat with a vermilion sail in the lower-left, and two short water-strokes lower-right. Sized 360×220px, opacity 0.92. Sits directly above the wordmark with `gap: 8px`.
- **Wordmark:** "Rhyme Finder" in Cormorant Garamond, weight 500, font-size `clamp(54px, 8vw, 88px)`, with a vermilion 韵 seal floating after the "r" of "Finder". The seal is a 38×38px square, `transform: rotate(-3deg)`, with an inset highlight to look stamped.
- **Input row:** italic Cormorant placeholder, thin 1px ink-colored bottom border, vermilion `→` button to the right. On focus the border turns vermilion. On hover the arrow translates 4px right and turns vermilion.

### State 2 — results (after Find)

When a word is submitted, the hero shrinks (smaller padding-top) and a results section appears below.

- **Source summary:** the typed word in big italic display (32–42px), followed by uppercase letter-spaced tags: `masculine` / `feminine`, `vowel · aʊ`, `coda · d`. Separated by middot with reduced opacity.
- **Tiers:** each tier card has:
  - **Tier title** (italic display, 24px) + **rule** in tiny uppercase tracking
  - **Pattison stability spectrum:** a 5-cell horizontal indicator (`unstable` ← five small bars, one filled at the tier's stability rank → `stable`)
  - **Count badge** — small uppercase number on the right
  - **Word grid** rendered as syllable-grouped rows. Each word is `.rf-word` span; classes `rf-c-very-common` (bold), `rf-c-common` (italic), `rf-c-uncommon` (italic + faded). Clichés get strikethrough plus a vermilion superscript `cliché` flag. (Masculine↔feminine mismatches aren't marked — they're classified as non-rhymes and never enter results; see `rhymeClassifier.js`.)
- **Hover state:** any `.rf-word` turns vermilion with a 1px vermilion underline (offset 4px).

---

## Design tokens

All defined in `:root` of `styles.css`. Treat as canonical — pull from these vars, don't hardcode hex.

### Colors

```css
/* Paper — warm xuan-paper tones */
--paper:        #dcc28e;
--paper-warm:   #d4b67a;
--paper-deep:   #c8a567;

/* Ink — sumi black with warm undertone */
--ink:          #1a140e;            /* primary text */
--ink-soft:     #3a2e1f;
--ink-faded:    #6e5a3c;            /* aged-ink secondary text */
--ink-ghost:    rgba(26, 20, 14, 0.14);
--hair:         rgba(26, 20, 14, 0.22);   /* hairline borders */
--hair-soft:    rgba(26, 20, 14, 0.10);

/* Single accent — vermilion (朱印 red, the seal color) */
--vermilion:        #b13b2c;
--vermilion-deep:   #8a2a1e;

/* Reserved (used sparingly or not at all in current screens) */
--jade:    #4a5a3a;
--indigo:  #2a3a4a;
```

The vermilion is the **only** chromatic accent. Use it for: the 韵 seal, the boat sail in the painting, focus rings on the input, hover state on words/buttons, and the cliché flag superscript. Never introduce other accent hues.

### Typography

```css
--display: "Cormorant Garamond", "Songti SC", "STSong", serif;
--serif:   "Cormorant Garamond", "Songti SC", "STSong", "SimSun", "Times New Roman", serif;
--sans:    "Inter", "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif;
--mono:    "DM Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

Cormorant Garamond does nearly all the visible work. Sans-serif is body fallback only. Mono is unused in the current design.

Cormorant Garamond loads from Google Fonts (weights 400, 500, 600; italic + roman). The `Songti SC` fallback is what makes the 韵 seal render correctly on systems without a CJK font.

### Type sizes

| Element | Size | Weight | Style |
|---|---|---|---|
| Wordmark | `clamp(54px, 8vw, 88px)` | 500 | normal |
| Source word (results) | `clamp(28px, 4vw, 42px)` | 500 | italic |
| Tier title | 24px | 500 | italic |
| Word in grid | 19px | varies by commonness | varies |
| Input placeholder/value | `clamp(22px, 3vw, 32px)` | 400 | italic |
| Source tag, tier rule | 11px | 400 | uppercase, `letter-spacing: 0.16–0.18em` |
| Status text | 11px | 400 | uppercase, `letter-spacing: 0.14em` |
| Cliché flag | 8px | 400 | uppercase, vermilion, superscript |

### Spacing & radii

- Hairline borders only — `1px solid var(--hair)` or `1px solid var(--ink)`. No drop shadows on app surfaces.
- The seal box has `border-radius: 1.5px` (almost square), `box-shadow: inset 0 0 0 1.5px rgba(255,240,220,0.18), inset 0 0 8px rgba(80,10,0,0.4)` — that inset glow is what makes it look stamped, not painted on.
- Input row uses `padding: 14px 4px` and `border-bottom: 1px solid var(--ink)`.

### Background

- `--paper` solid + `xuan-bg.png` tiled at `background-size: 600px 600px`. The PNG provides the woven xuan-paper fiber texture. Don't substitute a solid color or a noise filter — the texture matters.

---

## The shanshui painting

Inline SVG, viewBox `0 0 320 200`. All strokes are `#1a140e` with varying opacity. The full markup lives in the `<svg class="rf-mg rf-mg-shanshui">` block in `index.html` — copy verbatim if reusing elsewhere. Three layered ridges (opacities 0.32, 0.55, 0.78), three pine triangles, the boat (hull is a curved path; mast is a line; sail is a curved triangle filled `#b13b2c` with a darker stroke on top), and two faint horizontal water strokes.

It must sit in normal flow inside the title row — `position: static` is critical because there's a `.rf-mg { position: absolute }` base class that needs to be overridden when the painting is part of the hero.

---

## Interactions

### Input → results transition

Driven by CSS `:has()` selectors on `.rf-app`. When `#results` or `#source-summary` is non-empty:
- Hero `padding-top` shrinks from `9vh` → `56px`
- Hero `margin-bottom` shrinks from `56px` → `28px`
- Both transitions: `0.3s ease`

### Hover states

- `.rf-go-btn`: color `--ink` → `--vermilion`, arrow `transform: translateX(4px)`. 160ms ease.
- `.rf-word`: color → `--vermilion`, `text-decoration: underline`, `text-underline-offset: 4px`, `text-decoration-color: --vermilion`, `text-decoration-thickness: 1px`. 120ms.
- `.rf-input-row:focus-within`: bottom border → `--vermilion`. 160ms.

### Loading state

`<div class="rf-loading"><span class="rf-spinner"></span> Searching the corpus · Pattison's tiers</div>` — the spinner is an 11×11 div with vermilion top-border, spun via `rf-spin` keyframes (`360deg`, 700ms linear, infinite).

---

## Input autocomplete (added 2026-08-17)

Prefix suggestions under the search box. `src/autocomplete.js` owns the DOM +
keyboard; `suggestWords()` / `ensureSuggestIndex()` in `src/rhymeFinder.js` own
the data (they sit next to the wordlists, so `WORD_LEX` / `COMMON_RANK` /
`LYRIC_FREQ` never leak out of that module).

**Why it costs no latency.** Every input is already in memory after
`prewarm()` — the CMU dict, the lex categories, both frequency lists. The only
new work is one pass to bucket + score the vocabulary (~170 ms, done once in
`requestIdleCallback`, off the typing path). Per-keystroke lookup is a scan of
one score-sorted first-letter bucket: 0.005–0.06 ms typical, 0.41 ms worst case
(a no-hit prefix in the 7.3k-word `s` bucket). **No new network request.**

**The two invariants:**

1. *Same vocabulary as the classifier.* The index is `buildCorpus()` gated by
   `isAcceptableWord` — 66,660 words — so the box can never propose a word the
   search would then reject. Not the raw 138k dict.
2. *Same ranking as the results.* `lyricScore`, so `lo` offers love/long/low,
   not lobotomy.

**Decisions that look arbitrary but aren't:**

- **The exact match is kept, and is NOT hoisted.** Finishing a real word must
  not yank the panel away; but hoisting floated the obscure "wat" (a Thai
  temple) above "water". It keeps its natural rank, and is appended as the last
  row when it would fall past the limit.
- **The column labels are a FOOTER caption, not a header.** A header row reads
  as spreadsheet chrome on a dropdown — and with 8 rows the panel never
  scrolls, so the sticky header it started as was dead code.
- **Column widths are px, not em.** Sized in em they follow the 19 px serif
  word, outgrow a 375 px phone panel, and collapse the `1fr` word column to
  zero width — the word literally disappears.
- **The panel is anchored to the `<form>`, not `.rf-panel`.** The latter also
  wraps the status line, which pushed `top: 100%` ~23 px below the input. It
  sits at `calc(100% - 1px)` with a **vermilion** top border, so its edge *is*
  the input's rule (grey hairline there read as a seam of the wrong colour).
- **Picking a row searches**, and searching closes the panel — otherwise it
  covers the results it just produced. Tab completes *without* searching and
  leaves the panel open.
- **Anything that empties the input must dispatch an `input` event**
  (`clear ×`, `goHome()`), or the list hangs over an empty box.
- **The refresh after the index builds is gated on focus.** Deep links and the
  SEO snapshot pages boot with `?q=<word>` pre-filled, and an unconditional
  refresh popped the panel open over results nobody typed.
- **`buildSeoPages.mjs` strips the panel before snapshotting**, and init reuses
  an existing node — otherwise the serialized DOM ships a second element
  carrying the id `aria-controls` points at.

**Columns.** `syl` (syllables) and `songs` (line-end uses in the lyric corpus —
the same figure the results-page red dot shows). Both are free.

**Rhyme counts were considered and left out.** A `perfect` / `near` column per
row can't be computed at runtime: one uncapped `findRhymes` costs 30–150 ms, so
eight visible rows is 0.3–1.2 s. It needs a precomputed table (measured, per
word, whole vocabulary: brotli 341 KB keyed by word; 151 KB packed in word
order with a length+hash guard; `perfect` alone 54 KB). Two findings if this is
ever revived: per-KEY counts would be wrong (love has 6 perfect rhymes, above
8 — same key; same-onset candidates move to identity), and the *total* is a bad
signal (dominated by assonance/consonance, so ninth/depth/orange all look rich,
while `perfect` correctly reads 0 for every famously unrhymable word).

---

## Responsive

Desktop-first with breakpoints at 980px and 640px. On small screens:

- Painting scales from 360×220 → it stays inline above the title; shrinks to ~260×160 if needed.
- Wordmark uses `clamp()` so it auto-scales.
- Hero `padding-top` reduces to `12vh` at ≤640px.
- Tier head row becomes vertical (gap 8px), count badge `margin-left: 0`.

---

## Behavior / data

The tool is fully client-side. `src/main.js` orchestrates input → lookup → render; `src/rhymeFinder.js` and `src/rhymeClassifier.js` produce the tiered rhyme buckets using the Pattison stability framework; `src/pronunciation.js` loads the shared CMU dictionary from `/wordlists/cmu-dict.json`.

The tier taxonomy (5 tiers, their order, labels, rules) is defined in `src/main.js` as `TIER_META` and `TYPE_ORDER`. Per-word metadata includes commonness rank (very-common / common / uncommon), syllable count, and cliché pairs (e.g. `love`/`above`). State flow: `ready` → `searching` → `results` (or `error` / `not-found`). No persistence in v1.

Shared wordlists and the CMU override system are documented in `/CLAUDE.md` under "Shared resources".

---

## Things to get right

1. **The painting must be inline SVG, not an `<img>`.** It uses the same ink color as the text and needs to scale crisply.
2. **The seal is a real visual element with the inset shadow.** Don't substitute a flat color block.
3. **Cormorant Garamond italic is load-bearing** — the entire wordmark hierarchy (title, source word, tier title, input) leans on it. Make sure italic weights actually load.
4. **Vermilion is rationed.** If you find yourself adding vermilion to a fourth or fifth element, stop and reconsider — it should remain the rare accent that draws the eye.
5. **No drop shadows, no rounded corners larger than ~2px** outside the seal. The aesthetic is paper-and-ink, not Material.
