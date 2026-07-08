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
| Rhyme Finder | **`rhyme.land/`** (apex, DNS on Cloudflare) + legacy `songwriter.qi.land/rhyme-finder/` | `rhyme-finder/` |

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
│   ├── cmu-dict.json          ← 4.1 MB, CMU dict + synthesized regular inflections
│   ├── cmu-overrides.json     ← hand-curated patches over CMU mis-transcriptions
│   ├── cmu-entries.json       ← derived index (NOT deployed; .vercelignore'd)
│   └── ...
├── stress-workshop/           ← stress.qi.land  (subdomain not yet attached)
│   └── index.html             (loads /src/main.js, /styles.css from root)
├── line-craft/                ← line.qi.land  (subdomain not yet attached)
│   ├── index.html
│   ├── styles.css
│   └── src/main.js
├── rhyme-finder/              ← rhyme.land  ✅ attached (apex domain, Cloudflare DNS)
│   ├── index.html             (uses ABSOLUTE paths /rhyme-finder/...)
│   ├── styles.css
│   ├── xuan-bg.png
│   ├── src/{main.js, rhymeFinder.js, rhymeClassifier.js, pronunciation.js}
│   ├── wordlists/             ← rhyme-finder-only wordlists (wordnet, common-10k)
│   └── README.md              ← design reference (tokens, type, painting, interactions)
├── api/                       ← Vercel serverless functions
│   └── openai.js              ← proxies OpenAI for line-craft / stress-workshop
├── scripts/                   ← build-time scripts (run manually, not on deploy)
│   └── buildCmuDict.mjs       ← regenerates wordlists/cmu-dict.json (npm pkg + inflection synthesis)
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
     '/rhyme-finder/styles.css', but on rhyme.land/ the URL bar shows
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
  with `rhyme.land/` which rewrites to `/rhyme-finder/index.html`)
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
    { "source": "/", "has": [{"type":"host","value":"rhyme.land"}], "destination": "/rhyme-finder/index.html" },
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

4.1 MB JSON, ~139k entries. Built by `scripts/buildCmuDict.mjs` from
the npm package `cmu-pronouncing-dictionary` (~126k) PLUS ~12.5k
**synthesized regular inflections** (July 2026): CMU's -s/-ed/-ing
coverage is spotty (cream but not creaming; no furl at all), which made
rhyme-finder's recall trail RhymeZone. The suffix phonemes are fully
predictable from the stem (voicing-dependent: D/T/IH0-D, Z/S/IH0-Z,
IH0-NG), so the build generates any form whose stem is in CMU +
overrides, gated against junk by WordNet POS (verbs get -ed/-ing;
common/science nouns get -s; irregular-lemma lists block runned/womans;
pure person/place lemmas are excluded so no plural surnames). Native
CMU entries are never overwritten. Boundary fixtures live in
`test/rhymeClassifier.test.js` ("synth:" tests).

Used by:
- `src/pronunciation.js` (stress-workshop, line-craft)
- `rhyme-finder/src/pronunciation.js` (rhyme-finder, self-contained)

Both load the SAME static JSON via `fetch()` (see Rule 2). Don't
introduce a third copy or a third loader.

### CMU overrides (`wordlists/cmu-overrides.json`)

Hand-curated patches for words where CMU 0.7b is genuinely wrong (not
just inconsistent). ~30 entries in five classes — see the `_comment`
field inside the file for the taxonomy. Notable batches: outright
transcription errors (typology), Pattison worksheet words (jezebel,
fibber, twerp), and the July 2026 word-final stress-digit batch
(grandma, envoy, viceroy, monday–saturday, cacti, ally, dehumidify,
tissue, statue…) that rejoins rhyme families CMU had split by marking
one member V0 while its siblings got V2 (grandma/grandpa,
monday/sunday/away, tissue/issue).

To add an override:
1. Look up the word on Wiktionary US IPA, e.g. `/taɪˈpɑːlədʒi/`
2. Convert to ARPAbet (`AY` + `AA1` + `L` + …)
3. Sanity-check against other words in the same suffix family
4. Add a line to `wordlists/cmu-overrides.json`
5. No code change needed — both pronunciation modules apply
   overrides at load time.
6. BUT rerun `node scripts/buildCmuDict.mjs` and commit the dict:
   overrides feed the inflection synthesis as stems (furl → furled),
   and a synthesized entry bakes the stem's phonemes — the load-time
   override application never reaches derived entries.

### Lyric corpus & derived wordlists

Rhyme Finder uses four artifacts derived from the lyric library
(`wordlists/lyric-library/*.json`). All four are committed as static
assets and **must be rebuilt whenever the lyric library expands**.

| derived file | builder | purpose |
|---|---|---|
| `wordlists/lyric-frequency.json` | `scripts/buildLyricFrequency.mjs` | word → song-appearance count, drives the lyric-familiarity score |
| `wordlists/cliche-pairs.json` | `scripts/buildClicheList.mjs` | top-50 most-co-occurring rhyme pairs at line-end, drives the cliché flag |
| `wordlists/lyric-library/index.json` + `rhymed/`, `rhymed-more/`, `not-rhymed/` tier dirs | `scripts/buildLyricBuckets.mjs` | per-rhyme-key quote files (~4,100 tier-1) + upfront index — what rhyme-finder fetches at runtime. See "Lyric library on-the-wire" below. |
| `rhyme-finder/wordlists/common-10k.txt` | `scripts/buildCommonTopK.mjs` | general-English fallback frequency (subtitle corpus, NOT derived from lyric library — only rebuild when the source list updates) |
| `rhyme-finder/rhymes/{word}/index.html` + `rhyme-finder/sitemap*.xml` + `rhymes/manifest.json` | `scripts/buildSeoPages.mjs` | programmatic SEO pages (`rhyme.land/rhymes/{word}/`) — headless-Chrome snapshots of the REAL app rendering each word (needs local Chrome; puppeteer-core). Pages hydrate back into the live app via a generator-injected `?q=` boot script; app source carries no SEO code. Rerun after UI changes you want reflected (not required for function). Design doc: `rhyme-finder/SEO-PLAN.md`. Incremental (content-hashed, honest lastmod); pilot batch by default, `--full` for the whole derived set |

**Re-run protocol after corpus expansion:**

```sh
# 1. Re-index raw lyrics (if you've added new song JSONs)
node lyric-library/scripts/build-index.mjs

# 2. Rebuild the derived wordlists from the new index
node scripts/buildLyricFrequency.mjs
node scripts/buildClicheList.mjs
node scripts/buildLyricBuckets.mjs

# 3. Regenerate the SEO pages (quotes/cliché/frequency baked into them)
node scripts/buildSeoPages.mjs

# 4. Commit the regenerated JSONs (and the underlying lyric-library/*.json)
git add wordlists/lyric-frequency.json wordlists/cliche-pairs.json \
        wordlists/lyric-library/ rhyme-finder/rhymes/ rhyme-finder/sitemap*.xml
git commit -m "Corpus expansion: <which artists/songs added>"
```

⚠️ The bucket layout is keyed by `rhymeKeyOf()` — **any change to the
classifier's anchor logic (artifact rules, overrides) also requires
`node scripts/buildLyricBuckets.mjs` AND `node scripts/buildSeoPages.mjs`**,
or quote lookups miss for the words whose keys moved and the static SEO
pages keep serving the old classification.

This is machine-enforced since July 2026: `buildLyricBuckets.mjs` stamps
a hash of the FULL derived-input set — `rhymeClassifier.js` +
`pronunciation.js` (the code) AND `cmu-dict.json` + `cmu-overrides.json`
(the data) — into `wordlists/lyric-library/index.json`, and
`test/derivedConsistency.test.js` recomputes it. Touch the phonetic layer
OR expand the dict (inflection synthesis, override edits) without
rebuilding and the suite goes red with the exact rebuild commands in the
failure message. (The data files were added to the hash after the
inflection-synthesis batch shipped with stale buckets while a
code-only hash stayed green — a dict expansion changes bucket contents
without touching the code.)

Changes to the phonetic layer ALSO require re-running
`lyric-library/scripts/build-index.mjs` first (needs `lyric-library/raw/`,
which is gitignored — it lives only in the main working copy): the
indexer's rhymed/not-rhymed tags are computed with the same shared
anchor + normalization, so they move together with the keys.

#### Lyric library on-the-wire (May 2026 redesign; tiered June 2026)

The per-letter index files (`wordlists/lyric-library/[a-z_].json`) are
NO LONGER fetched by the runtime client. They're build inputs only,
`.vercelignore`d from deploys (saves ~83 MB).

At runtime the client fetches:

1. `wordlists/lyric-library/index.json` once on init. Carries
   `{ words, buckets }` — `words` drives the sync `hasQuotes()` badge
   gate (appearance/rhymed counts per word); `buckets` records which
   rhyme keys exist as files, short-circuiting fetches for classifier
   candidates with no corpus presence.

2. Per-rhyme-key quote files lazily (e.g. `UW1_CH_ER0.json` holds
   quotes for "future", "creature", etc.), in three tiers:
   `rhymed/{key}.json` on search (top-K per rhyme pair),
   `rhymed-more/{key}.json` on "show more" (overflow pages),
   `not-rhymed/{key}.json` opt-in (inspiration layer). Each fetch is
   small; first-paint cost is bounded by the page size, not corpus
   size.

A search of "future" no longer downloads the entire corpus — it
fetches the existence index once + a handful of small bucket files on
demand. The canonical bucket key for a word is `rhymeKeyOf(phonemes)`
exported from `rhyme-finder/src/rhymeClassifier.js`; the build script
and the client share that single helper so the layout is always
consistent.

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
- **Word-final OW2 after a stressed syllable** (July 2026). CMU marks
  the unstressed -ow/-o of trochee-tail words randomly: meadow/borrow/
  shadow/tomorrow/potato got OW2 (552 words), window/follow/sorrow/
  tomato got OW0 (4,185) — same sound. An OW2 anchor made go/meadow a
  fake PERFECT and broke borrow/sorrow + potato/tomato entirely. Rule:
  final OW2 whose preceding vowel is stressed = artifact (demote to
  trailing); dactyl tails (radio, mexico, buffalo, afterglow) keep the
  anchor, so radio/go survives. Accepted casualties: rainbow, elbow,
  tiptoe (true compounds — separating them from borrow, which also
  ends in the word "row", needs morphology CMU doesn't have). UW was
  audited and deliberately NOT rule-fixed: its trochee list is mostly
  real compounds (breakthrough, preview, horseshoe, hairdo); the four
  true artifacts (tissue, statue, devalue, revalue) are overrides.
- **Stress digits inside trailings are noise** — borrow's trailing is
  `OW2`, sorrow's is `OW0`. `trailingsMatch` / `trailingNucleiCompatible`
  compare digit-blind.
- **IH ↔ IY confusion at end of trailing** (agronomy/autonomy: same
  sound, different ARPAbet symbols) — normalized to a canonical
  token in `trailingsMatch`.
- **Suffix-identity false positives** for vowel-initial shorter
  words (action/fraction, eyes/lies) — `isSuffixOfOther` requires
  the shorter word to start with a consonant.
- **16 entries carry `" # comment"` suffixes** (aalborg → `…G # place,
  danish`). Both the runtime loader and `buildLyricBuckets.mjs` strip
  them before splitting into phonemes; keep that if you touch a loader.
- **Cot/caught merger is scoped to NON-RHOTIC position** (July 2026).
  `normalizePhonemes` collapses AO→AA (dawn/john, talk/rock — merged
  for most American speakers) but MUST NOT touch AO before R: pre-rhotic
  AO is the NORTH/FORCE vowel (born, corn, storm, more, door, war),
  distinct from START = AA-R (barn, arm, car, far) for ALL American
  speakers. The original blanket `\bAO→AA` regex made born/barn, star/
  store, far/for, farmer/former literal HOMOPHONES (362 false-homophone
  groups; 5,676 entries mispronounced) and poured every AO-R word into
  AA-vowel rhyme lists for two months before a user screenshot caught
  it. The merger being a destructive load-time rewrite is a frozen
  design decision: it contaminates `rhymeKeyOf()` and therefore the
  bucket filenames and SEO page content — changing merger scope means
  a FULL derived rebuild (see the re-run protocol above).
- **-ire smoothing is collapsed to the schwa spelling** (July 2026).
  CMU randomly syllabifies the AY+R rime: fire/higher/wire/desire/choir
  get `AY1 ER0` (r-colored schwa, "2-syllable"), dire/admire/retire/
  inquire/spire get `AY1 R` (bare tap, "1-syllable") — identical sound,
  every American rhymes fire/dire. `normalizePhonemes` rewrites
  SYLLABLE-FINAL `AY R` (R at word end or before a consonant) → `AY ER0`
  so both land on the `AY1_ER0` key. Guard: `AY R` before a VOWEL is a
  true onset (iris `AY1 R AH0 S`, virus, iron) and stays. Left split,
  "fire" — one of the highest-frequency lyric rimes (fire/desire/higher)
  — missed dire/admire/retire/inquire entirely. Found by the Datamuse
  recall-diff eval (see below). Like the merger, this is a destructive
  load-time rewrite that contaminates `rhymeKeyOf()` → a scope change
  needs a FULL derived rebuild.
  - **Audited siblings deliberately NOT merged** (the OW2 "accepted
    casualties" lesson — don't merge look-alikes with real contrasts):
    **AW** (hour/power) is already unified as `AW1_ER0` in CMU, nothing
    to do. **EY** player/layer (`EY1_ER0`, 2-syll) vs air/prayer
    (`EH1_R`, 1-syll) are genuinely different — merging would make
    player=air. **IY** beer/deer (`IH1_R`) vs here/seer (`IY1_R`) vs
    freer (`IY1_ER0`) is a separate NEAR-vowel IH/IY mess with a fuzzy
    1-vs-2-syllable boundary (seer, freer go either way) — left for its
    own audit. **UW** tour/sure (`UH1_R` CURE) vs poor/amour (`UW1_R`)
    vs bluer/newer (`UW1_ER0`) keep real vowel/syllable contrasts. Only
    AY is a clean same-sound split.

⚠️ **The corpus prefilter must share the classifier's anchor.**
`rhymeFinder.js` anchors candidates via `rhymeAnchorIndex()` exported
from `rhymeClassifier.js`. It previously used `deriveRhymeInfo` (no
artifact filtering), which silently dropped agronomy from economy's
results before the classifier ever saw it. Same rule for the lyric
indexer: `lyric-library/scripts/build-index.mjs` used to carry its own
raw-CMU rhymeKey (no merger, no artifact filter) and silently mistagged
cross-class pairs — gone/on, dawn/john sat in the not-rhymed tier until
July 2026 (+1,134 quotes recovered by unifying). Never reintroduce a
second anchor or normalization implementation anywhere.

All of the above is locked in by **`test/rhymeClassifier.test.js`** —
golden fixtures from Pattison's textbook plus these regressions. Run
after ANY classifier/pronunciation/override change:

```bash
node --test test/rhymeClassifier.test.js test/derivedConsistency.test.js
```

If you find a NEW class of CMU bug, prefer fixing the algorithm
over adding individual overrides. Save overrides for one-off
data errors — and add a golden fixture either way.

⚠️ **Dict-wide transforms ship with fixtures in the SAME commit.** The
merger bug's real lesson: a one-line regex that rewrites 5,676 dict
entries went in with zero assertions, and 49 golden tests stayed green
for two months while star/store were "homophones" — because fixtures
were only ever written for bug classes already found. Any change that
sweeps the dictionary (normalization, merger scope, anchor rules) must
land with fixtures for BOTH sides of its boundary (what merges + what
must stay distinct), in the same commit.

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

# Build the CMU dict: npm pkg + synthesized regular inflections
# (rerun after editing cmu-overrides.json — overrides feed the synthesis)
node scripts/buildCmuDict.mjs

# Recall regression probe vs Datamuse (NOT a data source — a diff tool).
# Reports rhymes Datamuse has that pass our OWN wordnet/10k gate yet don't
# surface = our bugs (dict holes or CMU-artifact family splits like -ire).
# Run after any classifier/pronunciation/dict change. Free API, no key.
node scripts/evalDatamuse.mjs                 # default 20-word probe
node scripts/evalDatamuse.mjs fire beer here  # explicit sources

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
