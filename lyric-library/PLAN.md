# Lyric Corpus — execution plan

This is a **fresh-session plan document**. Drop into a new Claude Code
session and start at Phase 1. The repo's `/CLAUDE.md` covers
architecture; this doc covers only this feature.

---

## What we're building

A **personal lyric reference module** for the Rhyme Finder (and
eventually Line Craft). When a songwriter sees a candidate rhyme word,
they can instantly see how 49 lyricists they admire used that word in
their actual songs — both at line-end (rhyme-relevant) and line-middle.

This deliberately **isn't** a comprehensive lyrics database. It's a
curated corpus of ~1,200 songs across 49 lyricists the user picked,
explicitly for craft study. Snippets only, attributed, fair-use scope.

### Why (vs RhymeZone-style mass corpus)

- RhymeZone removed their "in song" feature, almost certainly for
  copyright reasons. Building a generic 1M-song corpus is a multi-year
  legal & engineering project.
- A 49-artist curated corpus is **3-5 days of focused work** with
  much lower legal exposure (small scale, short snippets, clear
  educational/critical use).
- The user's actual need is taste-driven: "how does *Lenker* use
  river" — not "give me 5,000 random uses of river".
- This positions the tool as **a Pattison + curated voices reference**,
  unique in the songwriting tool landscape.

---

## The 49 lyricists (user's list)

```
Adrianne Lenker, Sufjan Stevens, Roger Waters, Laura Marling,
Joni Mitchell, Bob Dylan, Neil Young, Paul Simon, Paul McCartney,
John Lennon, Leonard Cohen, Jason Isbell, Thom Yorke, Tom Waits,
Lou Reed, David Bowie, Lucinda Williams, Mount Eerie, Cass McCombs,
Eden Ahbez, Big Thief, Radiohead, Pink Floyd, Elliott Smith, Dr. Dog,
Bill Callahan, Wilco, Jeff Tweedy, Men I Trust, Bahamas, Arcade Fire,
Fiona Apple, Cassandra Jenkins, Andy Shauf, Mark Knopfler, Weyes Blood,
Bon Iver, Lana Del Rey, Tori Amos, Mitski, Ray LaMontagne,
Neutral Milk Hotel, Gillian Welch, Magnolia Electric Co., Nick Cave,
Keren Ann, Damien Rice, Dire Straits, Black Box Recorder
```

49 names. Note overlaps: **Pink Floyd / Roger Waters** both in list (use
Waters as the lyricist credit; mark Pink Floyd songs by Waters as
Waters). **Wilco / Jeff Tweedy** same — credit to Tweedy. **Big Thief /
Adrianne Lenker** same — credit her.

For Phase 1 pilot, do these **10 first** (covers the user's strongest
preferences across genres):

1. Adrianne Lenker
2. Sufjan Stevens
3. Joni Mitchell
4. Leonard Cohen
5. Bob Dylan
6. Tom Waits
7. Fiona Apple
8. Mitski
9. Big Thief (separate from Lenker — band-mode lyrics)
10. David Bowie

---

## Architecture summary

```
lyric-library/
├── PLAN.md                    ← this file
├── scripts/
│   ├── fetch.mjs              ← Phase 2: pull lyrics via lyricsgenius
│   ├── build-index.mjs        ← Phase 3: tokenize + lemmatize + invert
│   └── stopwords.json         ← words to skip during indexing
├── raw/                       ← Phase 2 output, NOT shipped to web
│   ├── adrianne-lenker.json   (full lyrics, internal use only)
│   ├── joni-mitchell.json
│   └── ...
└── (no web-served files here — see /wordlists/lyric-library/)

/wordlists/lyric-library/       ← Phase 3 output, IS shipped
├── a.json                     ← all words starting with 'a' → quotes
├── b.json
├── ...
└── meta.json                  ← artist roster + stats
```

The `/wordlists/lyric-library/raw/` directory should be in
`.vercelignore` — we don't ship full lyrics publicly, only the
inverted index with short snippets.

### Index entry shape

```json
{
  "river": [
    {
      "artist": "joni-mitchell",
      "song": "a-case-of-you",
      "year": 1971,
      "line": "Oh I am a lonely painter / I live in a box of paints",
      "lineIdx": 8,
      "wordPos": "middle"
    },
    {
      "artist": "bruce-springsteen",
      "song": "the-river",
      "year": 1980,
      "line": "we'd go down to the river / and into the river we'd dive",
      "lineIdx": 14,
      "wordPos": "end"
    }
  ]
}
```

`wordPos` ∈ {`start`, `middle`, `end`} — based on whether the queried
word is the FIRST, LAST, or middle word in its line. Rhyme Finder
defaults to `end` for relevance; user can flip to "all positions".

Lemmatize the search index keys: `running` and `runs` both index
under `run`. But preserve the original word in `line`.

Cap each word's quote list at **30** entries to keep payload size
sane. Rank by: `wordPos == "end"` first, then by artist popularity
(popularity score from Genius), then by line length (shorter
preferred — better for popovers).

---

## Five phases

### Phase 1 — Pilot (3 hours)

**Goal:** Validate the pipeline + the UX feel before doing all 49.

1. Get a Genius API token from the user (free at
   https://genius.com/api-clients).
2. `npm install --save-dev lyricsgenius` (Python lib via uv) OR use
   the JS lib `genius-lyrics`. JS preferred to keep the toolchain
   homogeneous.
3. Fetch top 10 songs each for 3 artists: Adrianne Lenker, Joni
   Mitchell, Leonard Cohen. Save to `lyric-library/raw/`.
4. Write `scripts/build-index.mjs`:
   - Read all raw artist JSONs
   - Tokenize each line, lemmatize via `wink-lemmatizer` (already a
     dep neighbor — check `package.json`)
   - Build inverted index, slice by first letter
   - Write to `wordlists/lyric-library/[a-z].json`
5. In Rhyme Finder, hack a quick popover for ONE tier showing
   examples for very-common words. Just enough UI to feel it.
6. Show the user a screenshot. Decide: keep going, or kill.

**Deliverable:** working pilot with 30 songs indexed and a popover.

### Phase 2 — Full acquisition (1 day, mostly elapsed time)

**Goal:** Pull 25 songs each for all 49 artists.

- Run the fetch script artist-by-artist (don't parallelize hard,
  Genius rate-limits you to ~1 request/sec).
- Total: 1,225 songs × ~1 sec = ~20 min compute, but Genius rate
  limits in practice mean 3-5 hours wall clock. Run overnight.
- Sanity check: each artist's JSON should have ~25 songs with
  reasonable lyrics (some have intermissions / instrumentals that
  return empty).
- Manual cleanup: spot-check 2 random artists, look for obvious
  bad fetches (HTML noise, duplicate songs).

**Deliverables:** 49 raw JSONs in `lyric-library/raw/`.

### Phase 3 — Indexing (half day)

**Goal:** Build the production-grade inverted index.

1. Tokenize: split on whitespace + punctuation. Preserve apostrophes
   inside words (`don't`, `I'll`).
2. Lemmatize: `wink-lemmatizer` for verbs/nouns/adjectives.
3. Skip stopwords: load `lyric-library/scripts/stopwords.json`
   (50-100 words: the, a, of, to, …). Don't index these.
4. For each occurrence record:
   - artist (slug, lowercase-hyphen)
   - song (slug)
   - year (int, from Genius)
   - line (raw text, max 80 chars per quote — truncate longer with `…`)
   - lineIdx (int, 0-based)
   - wordPos (`start` / `middle` / `end`)
5. Build per-letter inverted index. Cap quote count per word at 30,
   ranked: `end` first, then by Genius popularity, then by line length.
6. Compress with gzip on disk OR rely on Vercel CDN edge gzip
   (recommended — simpler).
7. Write `wordlists/lyric-library/meta.json` with the artist roster +
   total counts + last-updated date.

**Deliverable:** 26 JSON files, total ~3-5 MB.

### Phase 4 — UX integration (1-2 days)

**Goal:** Wire into Rhyme Finder.

- Each candidate word in tier results: if there are ≥1 quotes,
  show a small vermilion suffix `· N` (e.g. `dove · 4`).
- Hover the word: popover with first 1-3 quotes (cap at 3 in
  popover).
- Click: modal with full list, filterable by artist, position
  (`start` / `middle` / `end` / `all`).
- Quote rendering:
  - Italic Cormorant for the line
  - Em-dash + artist + song + year in mono uppercase tracking
  - Match the existing design language (see `rhyme-finder/styles.css`,
    `--display`, `--mono`, `--vermilion` tokens).
- Lazy load: only fetch `wordlists/lyric-library/r.json` when user
  searches a word starting with R. Cache in memory.
- Empty state: words without quotes show no badge, no popover. Don't
  draw attention to the absence.

**Deliverable:** the feature visible on rhyme.qi.land.

### Phase 5 — Polish & ship (half day)

1. Performance: confirm lazy-load is < 200 KB per word, < 100 ms after cache.
2. Mobile UX: popover becomes bottom-sheet on narrow viewports.
3. Robots / SEO: add robots.txt disallow on `/wordlists/lyric-library/`.
4. About page or footer credit: "Lyric snippets © respective
   rightsholders. Used here under fair-use educational scope. Email
   [contact] for any takedown request."
5. Vercel Analytics custom event for "lyric quote opened" — to see
   which words / which artists draw the most engagement.
6. Refresh job: a manual `npm run lyrics:rebuild` script that re-runs
   Phases 2 + 3, for when the user wants to expand the corpus.

**Deliverable:** ready for production.

---

## Decisions the user needs to make upfront

When the new session starts, ask the user these BEFORE coding:

1. **Genius API token** — needed for any acquisition. Free.
2. **Pilot scope** — 3 artists × 10 songs (Phase 1), or jump to all
   49 artists × 25 songs (Phase 2)? Default: pilot first.
3. **JS or Python toolchain for fetching?** Default: JS
   (`genius-lyrics` npm package). Keeps everything in one runtime.
4. **Per-artist song count target.** Default: 25 (top by popularity).
   Could be 15 (smaller / faster) or 40 (bigger / slower). The
   user said "20-50" range earlier; go with 25.
5. **Lemmatize aggressiveness.** Default: lemmatize verbs + nouns.
   Don't lemmatize adjectives (preserves "loving" vs "love" if user
   searches for the noun form). Discuss before coding.
6. **Should Big Thief and Adrianne Lenker be merged or kept
   separate?** The user listed both. Default: keep separate; Big
   Thief songs credited to "Big Thief", Lenker solo to "Adrianne
   Lenker". Even if the lyric author is the same.

## Things to NOT do

- Don't make a public download of the full corpus.
- Don't expose any endpoint that returns full lyrics.
- Don't display more than 2 lines per quote.
- Don't put the corpus on the front page or give it billing as a
  "lyrics search" — it's a *reference inside* Rhyme Finder.
- Don't use lemmatization on the displayed `line` (only on the
  search key).

---

## Files / paths to know

- `/CLAUDE.md` — overall repo arch, gotchas, conventions. Read first.
- `/rhyme-finder/styles.css` — design tokens to reuse for the popover.
- `/rhyme-finder/src/main.js` — where the UX integration goes.
- `/wordlists/cmu-dict.json` — example of a static-data shipping
  pattern; lyric-library follows the same pattern.
- `/scripts/buildCmuDict.mjs` — example of a build-time data script;
  `lyric-library/scripts/build-index.mjs` should follow its style.
- `/.vercelignore` — must add `lyric-library/raw/` here.
- `/package.json` — check existing deps (`wink-lemmatizer`,
  `wink-nlp`, `wordnet-db` already present).

---

## Estimated total effort

| Phase | Active work | Wall clock |
|---|---|---|
| 1. Pilot | 3 h | 3 h |
| 2. Acquisition | 1 h scripting + 4 h waiting | 1 day |
| 3. Indexing | 4 h | half day |
| 4. UX integration | 8-12 h | 1-2 days |
| 5. Polish | 4 h | half day |
| **Total** | **~24-30 h** | **3-5 days** |

If the user wants to do this on weekends, expect 2-3 weekends of
focused work.

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Genius blocks the API token mid-acquisition | Medium | Switch to a second token; or use lyricsgenius Python lib (different rate-limit envelope); or fetch over a longer span |
| One or two artists have terrible coverage on Genius | Low | Skip them. Note in `meta.json`. User can manually paste a few key songs later. |
| Copyright takedown after launch | Low | Mitigations above (1-2 line snippets, attribution, robots.txt, contact email). Comply immediately if it happens. |
| Index file too large for browser | Low | Split further (a-1.json, a-2.json) if any letter file > 1 MB. |
| Lemmatizer wrong (stems "rosés" → "rose") | Low-medium | Fall back to no-lemmatize for ambiguous; spot-check during Phase 3 |
