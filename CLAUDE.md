# CLAUDE.md — operations & architecture for songwriter.qi.land

Read this before touching anything. It captures architectural decisions
that aren't obvious from the code, and three classes of bugs we already
hit + fixed. Future you (or future Claude) should not relearn them the
hard way.

---

## What this repo is

A monorepo of small songwriting tools. Each tool is a static page +
vanilla JS + a folder. They share a CMU pronouncing dictionary and a
small library of phonetic helpers. Hosted on Vercel.

Active tools (Apr 2026):

| Tool | URL | Folder |
|---|---|---|
| Landing | `songwriter.qi.land/` | `landing.html` (root) |
| Stress Lyric Workshop | `songwriter.qi.land/stress-workshop/` | `stress-workshop/` |
| Line Craft | `songwriter.qi.land/line-craft/` | `line-craft/` |
| Rhyme Finder | **`rhyme.qi.land/`** + legacy `songwriter.qi.land/rhyme-finder/` | `rhyme-finder/` |

Plan is to grow to ~5–6 tools, each on its own subdomain, all in
this single repo.

---

## Repo layout

```
/                              ← Vercel project root
├── landing.html               ← songwriter.qi.land/  (the index that lists tools)
├── landing.css
├── styles.css                 ← stress-workshop's stylesheet (legacy at root)
├── src/                       ← stress-workshop's logic + shared helpers
│   ├── pronunciation.js       ← shared: CMU dict loader, derives rhyme info
│   ├── stressConstants.js     ← shared: VOWEL_LABELS, RHYME_ALIASES, etc.
│   └── (rest is stress-workshop-specific)
├── wordlists/                 ← shared static data (large JSON / TXT)
│   ├── cmu-dict.json          ← 3.7 MB, full CMU dict with our overrides applied
│   ├── cmu-overrides.json     ← hand-curated patches over CMU mis-transcriptions
│   ├── cmu-entries.json       ← derived index (NOT deployed; .vercelignore'd)
│   └── ...
├── stress-workshop/           ← stress.qi.land  (subdomain not yet attached)
│   └── index.html             (loads /src/main.js, /styles.css from root)
├── line-craft/                ← line.qi.land  (subdomain not yet attached)
│   ├── index.html
│   ├── styles.css
│   └── src/main.js
├── rhyme-finder/              ← rhyme.qi.land  ✅ attached
│   ├── index.html             (uses ABSOLUTE paths /rhyme-finder/...)
│   ├── styles.css
│   ├── xuan-bg.png
│   ├── src/{main.js, rhymeFinder.js, rhymeClassifier.js, pronunciation.js}
│   ├── wordlists/             ← rhyme-finder-only wordlists (wordnet, common-10k)
│   ├── README.md              ← Claude Design handoff doc, kept for reference
│   └── design_handoff…/       ← (currently empty; was the handoff drop folder)
├── api/                       ← Vercel serverless functions
│   └── openai.js              ← proxies OpenAI for line-craft / stress-workshop
├── scripts/                   ← build-time scripts (run manually, not on deploy)
│   └── buildCmuDict.mjs       ← regenerates wordlists/cmu-dict.json from npm pkg
├── packages/                  ← npm workspace packages (currently 1)
│   └── stress_scansion_core/
├── test/                      ← node --test tests for stress-workshop logic
├── vercel.json                ← rewrite rules for subdomains + landing
├── .vercelignore              ← what to exclude from deploy bundle
├── package.json
└── books/, data/, sentence_to_stress_pattern/, etc. (not deployed)
```

---

## ⚠️ Three rules that must NEVER be broken

These each correspond to a real bug we shipped. Re-breaking them costs
hours of debugging.

### Rule 1 — Tool HTML uses **absolute paths**, never relative

```html
<!-- WRONG: '/rhyme-finder' on the URL bar means './styles.css' becomes
     '/rhyme-finder/styles.css', but on rhyme.qi.land/ the URL bar shows
     '/' and './styles.css' becomes '/styles.css' — which is a DIFFERENT
     file (the songwriter root stylesheet). -->
<link rel="stylesheet" href="./styles.css" />

<!-- RIGHT: explicit, host-independent. -->
<link rel="stylesheet" href="/rhyme-finder/styles.css" />
```

**Why:** Vercel's `rewrites` in `vercel.json` are applied AFTER the
filesystem check, so any path that exists at root is served directly.
A tool whose HTML resolves a relative path to a root-level conflict
(`/styles.css`, `/index.html`, `/src/main.js`) gets the wrong file with
the same name.

Apply to: `<link>`, `<script>`, `<img>`, etc. inside every tool's HTML.

The CSS file's own `url()` references (e.g. `background-image:
url("./xuan-bg.png")`) resolve relative to the **stylesheet URL**, not
the page URL — so those stay relative, no problem.

### Rule 2 — Vercel **strips `node_modules`** from deploys

Despite `.vercelignore` claiming to keep it, `node_modules/` is missing
from the deployed bundle. This breaks any code path that imports from
`../node_modules/<pkg>/...` at runtime.

**Symptom:** clicks do nothing in production, page loads but JS doesn't
attach event listeners. Console shows a 404 on
`/node_modules/<pkg>/index.js` and a downstream module-load failure.

**Fix pattern (already applied for `cmu-pronouncing-dictionary`):** at
build time, run `scripts/buildCmuDict.mjs` to bake the npm package's
data into a static JSON in `/wordlists/`. At runtime, `fetch()` that
JSON instead of importing the package.

If you add another runtime npm dep, do the same — bake to JSON, ship in
`wordlists/` (or another deployed folder).

### Rule 3 — Avoid root-level filename collisions with tool paths

Examples that already burned us:
- Root `/index.html` collides with the tool's `./styles.css` desire
  for `/`
- Root `/src/main.js` collides with `./src/main.js` from a tool
- Root `/styles.css` ditto

**Fix pattern (already applied):**
- Renamed root `/index.html` → `/landing.html` (no longer collides
  with `rhyme.qi.land/` which rewrites to `/rhyme-finder/index.html`)
- Tool HTML uses absolute paths (Rule 1), so they reach into
  `/rhyme-finder/styles.css` etc. and never request `/styles.css`.

Long-term: when refactoring, consider moving stress-workshop's
root-level `src/` and `styles.css` into `stress-workshop/src/` and
`stress-workshop/styles.css`. Right now those still live at root for
historical reasons. Anything truly shared (e.g. `src/pronunciation.js`,
`src/stressConstants.js`) stays at root.

---

## Hosting model: subdomains via vercel.json rewrites

Each tool gets its own subdomain (cleaner URL, separable analytics).
Routing is via host-conditional rewrites in `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/", "has": [{"type":"host","value":"rhyme.qi.land"}], "destination": "/rhyme-finder/index.html" },
    { "source": "/", "destination": "/landing.html" }
  ]
}
```

For each new tool, add ONE rule. The first matching rule wins.

The default (last) rule maps the bare `/` for any unmatched host to
`/landing.html`. This is what `songwriter.qi.land/` and
`songwriter-mocha.vercel.app/` (the Vercel default URL) hit.

**Why `/landing.html` instead of `/index.html`:** see Rule 3. We
deliberately removed root `/index.html` so the bare `/` path has no
filesystem hit and Vercel must consult rewrites.

---

## Adding a new tool — runbook

Say you're adding `melody.qi.land` for a new "Melody Lab" tool.

1. **Create the folder + files:**
   ```
   melody-lab/
     index.html       ← uses absolute paths /melody-lab/...
     styles.css
     src/main.js
     ...
   ```

2. **In the HTML, use absolute paths for every asset** (Rule 1):
   ```html
   <link rel="stylesheet" href="/melody-lab/styles.css" />
   <script type="module" src="/melody-lab/src/main.js"></script>
   ```

3. **Add a SEO canonical tag** so the eventual subdomain is the
   canonical version, not the path-based URL:
   ```html
   <link rel="canonical" href="https://melody.qi.land/" />
   ```

4. **Add the tool to `landing.html`** as a new card.

5. **Add ONE rewrite to `vercel.json`:**
   ```json
   { "source": "/", "has": [{"type":"host","value":"melody.qi.land"}], "destination": "/melody-lab/index.html" }
   ```
   Order it before the catch-all `/` → `/landing.html`.

6. **Push to main.** Vercel auto-deploys. The path-based URL
   (`songwriter.qi.land/melody-lab/`) works immediately.

7. **Attach the subdomain in Vercel + DNS:**
   - Vercel dashboard → project → Settings → Domains → Add `melody.qi.land`
   - In Squarespace DNS (or wherever qi.land's DNS lives): add
     CNAME `melody` → `cname.vercel-dns.com`. **Host field is just
     `melody`, not `melody.qi.land`** (Squarespace appends the suffix).
   - Wait 5–30 min for DNS propagation.

8. **Verify:**
   ```bash
   curl -sS "https://melody.qi.land/" | grep -o '<title>[^<]*</title>'
   # Should match the Melody Lab title, not "Songwriter"
   ```

9. **(Optional but recommended)** Enable Vercel Analytics on the
   subdomain to track usage independently.

---

## Shared resources

### CMU pronouncing dictionary (`wordlists/cmu-dict.json`)

3.7 MB JSON, ~126k entries. Built from the npm package
`cmu-pronouncing-dictionary` via `scripts/buildCmuDict.mjs`.

Used by:
- `src/pronunciation.js` (stress-workshop, line-craft)
- `rhyme-finder/src/pronunciation.js` (rhyme-finder, self-contained)

Both load the SAME static JSON via `fetch()` (see Rule 2). Don't
introduce a third copy or a third loader.

### CMU overrides (`wordlists/cmu-overrides.json`)

Hand-curated patches for words where CMU 0.7b is genuinely wrong (not
just inconsistent).

Current entries:
- `typology` — CMU has `T AY2 P OW1 L AH0 G IH2`; correct is `T AY2 P
  AA1 L AH0 JH IY0` (every other -ology word uses AA1 + JH, only
  typology was wrong).

To add an override:
1. Look up the word on Wiktionary US IPA, e.g. `/taɪˈpɑːlədʒi/`
2. Convert to ARPAbet (`AY` + `AA1` + `L` + …)
3. Sanity-check against other words in the same suffix family
4. Add a line to `wordlists/cmu-overrides.json`
5. No code change needed — both pronunciation modules apply
   overrides at load time.

### Lyric corpus & derived wordlists

Rhyme Finder uses three wordlists derived from the lyric library
(`wordlists/lyric-library/*.json`). All three are committed as static
assets and **must be rebuilt whenever the lyric library expands**.

| derived file | builder | purpose |
|---|---|---|
| `wordlists/lyric-frequency.json` | `scripts/buildLyricFrequency.mjs` | word → song-appearance count, drives the lyric-familiarity score |
| `wordlists/cliche-pairs.json` | `scripts/buildClicheList.mjs` | top-50 most-co-occurring rhyme pairs at line-end, drives the cliché flag |
| `rhyme-finder/wordlists/common-10k.txt` | `scripts/buildCommonTopK.mjs` | general-English fallback frequency (subtitle corpus, NOT derived from lyric library — only rebuild when the source list updates) |

**Re-run protocol after corpus expansion:**

```sh
# 1. Re-index raw lyrics (if you've added new song JSONs)
node lyric-library/scripts/build-index.mjs

# 2. Rebuild the derived wordlists from the new index
node scripts/buildLyricFrequency.mjs
node scripts/buildClicheList.mjs

# 3. Commit the regenerated JSONs (and the underlying lyric-library/*.json)
git add wordlists/lyric-frequency.json wordlists/cliche-pairs.json wordlists/lyric-library/
git commit -m "Corpus expansion: <which artists/songs added>"
```

The cliché list in particular is only as good as the corpus it's derived
from — pairs that show up a lot in your curated artists become "cliché" in
the tool. When you add new artists, the list should reflect their cliché
landscape too.

`common-10k.txt` is independent — it's derived from OpenSubtitles 2018,
not from your lyric library. Only rebuild via `buildCommonTopK.mjs` if
you swap the source frequency list.

### Common known CMU bugs that DON'T need overrides

The classifier already handles these patterns algorithmically:

- **Word-final IH2/IY2/AH2/ER2 on `-y` suffix words** (agronomy,
  library, typology) — CMU inconsistently marks these. Treated as
  artifact in `lastStressedVowelIndex` (only when it's the last
  phoneme + word has a primary stress earlier).
- **IH ↔ IY confusion at end of trailing** (agronomy/autonomy: same
  sound, different ARPAbet symbols) — normalized to a canonical
  token in `trailingsMatch`.
- **Suffix-identity false positives** for vowel-initial shorter
  words (action/fraction, eyes/lies) — `isSuffixOfOther` requires
  the shorter word to start with a consonant.

If you find a NEW class of CMU bug, prefer fixing the algorithm
over adding individual overrides. Save overrides for one-off
data errors.

### Phonetic helpers (`src/pronunciation.js`, `rhyme-finder/src/pronunciation.js`)

Two near-identical modules right now (stress-workshop uses one,
rhyme-finder uses the other). They diverge slightly:

- Root one is loaded via top-level `await` so all consumers wait for
  PRONUNCIATION_MAP to be populated.
- rhyme-finder's exposes `ensurePronunciation()` and lets the caller
  decide when to await.

If you ever consolidate, the cleaner one to adopt is rhyme-finder's
explicit `ensurePronunciation()` pattern — no top-level await
spreading through every importer's promise chain.

---

## Vercel-specific quirks summary

| Quirk | What to do |
|---|---|
| Rewrites apply AFTER filesystem | Use absolute paths in tool HTML; avoid root-level filename collisions |
| `node_modules` stripped from deploy | Bake npm-package data to static JSON at build time |
| `data/` in `.vercelignore` | Don't put runtime data there. Use `/wordlists/` (not ignored) |
| Hobby plan caps Analytics at 2.5k events/month | Filter by path or upgrade to Pro for custom events |
| `:has()` CSS works on Vercel | Used heavily in rhyme-finder for empty/results state transitions |

---

## Test commands

```bash
# Run stress-workshop tests
node --test test/lyricEngine.test.js test/openaiDrafts.test.js

# Build the CMU dict from npm pkg (only when upgrading the npm pkg)
node scripts/buildCmuDict.mjs

# Local dev server (path-based URLs only — subdomain rewrites don't run locally)
npm run dev    # python3 -m http.server 5173
# Then open http://localhost:5173/rhyme-finder/  (must include the path)
```

Subdomain rewrites only fire on Vercel (or any host doing the same
host-based routing). Locally, always use the path-based URL.

---

## When to outgrow this architecture

The single-repo, single-Vercel-project setup is fine up to ~6 tools
and as long as:

- Tools share a tech stack (vanilla JS + static files)
- Tools share most of their codebase
- One deploy cycle for everything is acceptable
- No tool needs separate staging / preview branches

**Outgrow signals:**
- Different framework per tool (one wants React, another stays vanilla)
- A tool needs independent release cadence (A/B tests, paid
  preview tier, etc.)
- vercel.json rewrites cross 20 lines
- Shared code starts feeling tangled / circular

When that happens: split into a monorepo with multiple Vercel
projects, share code via npm workspace packages.
