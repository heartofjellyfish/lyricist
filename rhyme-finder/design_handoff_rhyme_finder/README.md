# Handoff: Rhyme Finder

A songwriter's rhyme dictionary, designed in the visual language of a Wang Shimin landscape painting (Qing-dynasty 山水画) — warm xuan-paper background, sumi-ink typography in Cormorant Garamond, a single vermilion 朱印-style accent, and a brushed shanshui motif paired with the wordmark.

---

## About the Design Files

The files in this bundle (`index-v2.html`, `styles-v2.css`, `xuan-bg.png`) are **design references created in HTML** — a working prototype showing intended look and behavior. They are not production code to copy directly.

Your task is to **recreate this design in your existing codebase** using whatever framework, component library, and patterns are already established (React, Vue, Svelte, native, etc.). If no environment exists yet, choose what fits the project best.

The HTML file is fully working — you can open it in a browser to see exact spacing, hover states, animations, and the results-page layout in action.

---

## Fidelity

**High-fidelity.** Pixel-perfect mockups with final colors, typography, spacing, and interactions. Recreate the UI as closely as possible to what the prototype shows.

---

## Two Screen States

The app is a single page with two states, switched by `:has()` selectors based on whether `#results` and `#source-summary` have content.

### State 1 — **Hero / search input** (empty state)

What the user sees on first load. The painting-and-title composition sits centered vertically; the input field sits below.

- **Eyebrow:** *(removed — was "— A Songwriter's Companion —"; user requested removal)*
- **Painting:** inline SVG of a 写意 (xieyi) shanshui — three layered mountain ridges (faint to bold), three tiny pine silhouettes on the foremost ridge, a small boat with a vermilion sail in the lower-left, and two short water-strokes lower-right. Sized 360×220px, opacity 0.92. Sits directly above the wordmark with `gap: 8px`.
- **Wordmark:** "Rhyme Finder" in Cormorant Garamond, weight 500, font-size `clamp(54px, 8vw, 88px)`, with a vermilion 韵 seal floating after the "r" of "Finder". The seal is a 38×38px square, `transform: rotate(-3deg)`, with an inset highlight to look stamped.
- **Input row:** italic Cormorant placeholder ("give me an english word"), thin 1px ink-colored bottom border, vermilion `→` button to the right. On focus the border turns vermilion. On hover the arrow translates 4px right and turns vermilion.

### State 2 — **Results** (after Find)

When a word is submitted, the hero shrinks (smaller padding-top) and a results section appears below.

- **Source summary:** the typed word in big italic display ("loud" 32–42px), followed by uppercase letter-spaced tags: `masculine` / `feminine`, `vowel · aʊ`, `coda · d`. Separated by middot with reduced opacity.
- **Tiers (5 of them):** each tier is a card with:
  - **Tier title** (italic display, 24px) + **rule** in tiny uppercase tracking
  - **Pattison stability spectrum:** a 5-cell horizontal indicator (`unstable` ← five small bars, one filled at the tier's stability rank → `stable`)
  - **Count badge** — small uppercase number on the right
  - **Word grid** rendered as syllable-grouped rows. Each word is `.rf-word` span; classes `rf-c-very-common` (bold), `rf-c-common` (italic), `rf-c-uncommon` (italic + faded). Mismatch words get dotted underline; clichés get strikethrough plus a vermilion superscript `cliché` flag.
- **Hover state:** any `.rf-word` turns vermilion with a 1px vermilion underline (offset 4px).

---

## Design Tokens

All defined in `:root` of `styles-v2.css`. Copy these exactly.

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

Cormorant Garamond is doing nearly all the visible work. Sans-serif is body fallback only. Mono is unused in the current design.

Load Cormorant Garamond from Google Fonts (weights 400, 500, 600; italic + roman). The `Songti SC` fallback is what makes the 韵 seal render correctly on systems without a CJK font.

### Type sizes used

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
- Included in this bundle as `xuan-bg.png` (800×800).

---

## The Shanshui Painting

Inline SVG, viewBox `0 0 320 200`. All strokes are `#1a140e` with varying opacity. Reproduce verbatim from the HTML — copy the entire `<svg class="rf-mg rf-mg-shanshui">` block. Three layered ridges (opacities 0.32, 0.55, 0.78), three pine triangles, the boat (hull is a curved path; mast is a line; sail is a curved triangle filled `#b13b2c` with a darker stroke on top), and two faint horizontal water strokes.

It must sit in normal flow inside the title row — `position: static` is critical because there's a `.rf-mg { position: absolute }` base class that needs to be overridden when the painting is part of the hero.

---

## Interactions

### Input → Results transition

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

## Behavior / State

The prototype uses a phonetic dictionary loaded from `wordlists/` to compute rhyme tiers using the Pattison stability framework. For the production app, you'll need:

- **Endpoint to look up rhymes for a word.** Returns: stressed vowel, coda, masculine/feminine flag, and tiered rhyme buckets (5 tiers). The tier order/labels/rules are defined in the prototype's `src/main.js` as `TIER_META` and `TYPE_ORDER` — copy that taxonomy.
- **Per-word metadata:** commonness rank (very-common / common / uncommon), syllable count, mismatch flag, cliché pairs (e.g., `love/above`).
- **State machine:** `ready` → `searching` → `results` (or `error` / `not-found`).
- **No persistence required** for v1, though the search box could remember the last query.

If your codebase hits a real rhymes API instead of a local corpus, the response shape should still feed into the same tier-card UI.

---

## Responsive

The current design is desktop-first with a breakpoint at 980px and 640px. On small screens:

- Painting scales from 360×220 → it stays inline above the title; consider shrinking to ~260×160 if needed.
- Wordmark uses `clamp()` so it auto-scales.
- Hero `padding-top` reduces to `12vh` at ≤640px.
- Tier head row becomes vertical (gap 8px), count badge `margin-left: 0`.

---

## Files in This Bundle

- `index-v2.html` — full HTML with the inline shanshui SVG, hero, search form, and results scaffold
- `styles-v2.css` — all design tokens + every component class used above
- `xuan-bg.png` — the paper texture (tile this as `background-image`)
- `README.md` — this file

The prototype's JS lives in the source project under `src/main.js` — it implements the rhyming logic but is not part of the visual handoff. Reimplement in your stack using the API/data approach above.

---

## Things to Get Right

1. **The painting must be inline SVG, not an `<img>`.** It uses the same ink color as the text and needs to scale crisply.
2. **The seal is a real visual element with the inset shadow.** Don't substitute a flat color block.
3. **Cormorant Garamond italic is load-bearing** — the entire wordmark hierarchy (title, source word, tier title, input) leans on it. Make sure italic weights actually load.
4. **Vermilion is rationed.** If you find yourself adding vermilion to a fourth or fifth element, stop and reconsider — it should remain the rare accent that draws the eye.
5. **No drop shadows, no rounded corners larger than ~2px** outside the seal. The aesthetic is paper-and-ink, not Material.
