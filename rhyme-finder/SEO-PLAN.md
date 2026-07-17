# Programmatic SEO engine — rhyme.land/rhymes/{word}/

Last updated: 2026-07-17 (FULL batch generated — **4,657 pages**, 611 MB,
plus a 27-page browse hub, IndexNow, and snapshot slimming, all described
below. Pilot ran 2026-07-10→17 with Search Console attached.)

## Post-pilot additions (2026-07-17)

- **Search-worthiness gate** (added to `passesWordGate`): common-English
  top-5k rank OR ≥5 corpus songs. The original "appears in lyrics at
  all" admitted 10,843 words / 1.3 GB — a long tail (phylum, walkman,
  barns) with no "words that rhyme with X" search volume, which also
  pushed the deploy past Vercel's 15k-file limit (the corpus quote
  buckets alone are ~8.8k files; total is now ~13.7k). Loosen via
  `MIN_SONG_FREQ` / `COMMON_RANK_MAX`; any change = full rerun.
- **Memory-compact selection**: the full-batch gate pass visits ~15k
  candidates; holding every `findRhymes` bucket OOM'd node's default
  heap. `selected` keeps only tier counts + a 40-word cap + quotes,
  and the quote-bucket cache is cleared periodically. Keep it that way.
- **Prune-safe related links**: with `--prune`, `linkable` is the
  current selection only — stale manifest words are about to be
  deleted and must not be link targets (verified 55k links, 0 dead).

- **Snapshot slimming**: pre-capture cleanup also strips `title` and
  `data-lex` attributes inside `#results` — tooltip/filter data that
  crawlers can't use and hydration re-renders anyway (~12%/page).
- **Browse hub**: `/rhymes` (index) + `/rhymes/{letter}` pages, written
  by `writeBrowsePages()` from the manifest. Internal-link path from
  the homepage into every word page — sitemap-only discovery ranks
  poorly. Single-letter dirs can never collide with word pages (word
  gate requires length ≥ 2). Self-contained document pages with inline
  CSS in the xuan palette — deliberately NOT app-markup-coupled.
  Their lastmod bookkeeping lives in `rhymes/browse-manifest.json`;
  they're listed in `sitemap-home.xml`. The app homepage links the hub
  via a quiet `.rf-browse` nav inside the epigraphs footer (hidden in
  workspace mode, present in every snapshot's markup); each word
  page's extras nav links back to the hub.
- **IndexNow** (Bing/DuckDuckGo/Yandex family): key file committed at
  `rhyme-finder/badd805108ef2b535f120c5a5b8549d4.txt`, served at
  `rhyme.land/{key}.txt` via a vercel.json rewrite. After a deploy
  that adds/changes pages: `node scripts/pingIndexNow.mjs` (idempotent,
  ~once per deploy; `--dry` to inspect). Google ignores IndexNow —
  it's covered by the sitemap + Search Console.

## Ops runbook — keeping it fresh (the "set and forget" part)

1. Corpus/classifier/UI change → `node scripts/buildSeoPages.mjs --full
   --prune` (incremental: unchanged pages keep their lastmod; takes
   hours on the full set — `caffeinate -i` it).
2. Commit `rhyme-finder/rhymes/` + `sitemap*.xml`, push (one deploy).
3. `node scripts/pingIndexNow.mjs` after the deploy is live. (First
   ping on a brand-new key 403s with `SiteVerificationNotCompleted` —
   normal; the key file just needs a few minutes to be crawlable.
   Re-run and it returns 200.)
4. Nudge Google — see the Search Console section below.

## Search Console — per-deploy nudge & what to actually expect

Property is `rhyme.land` (domain property). Verification is **persistent**
— the `google46169d289ad3d09a.html` file (served via a vercel.json
rewrite) keeps the property verified across deploys forever. You never
re-verify or "re-activate."

**After a deploy that changed the page set, do this once (~2 min):**

1. **Re-submit the sitemap.** GSC only re-reads a sitemap on its own
   schedule (the "Last read" date lags — it was Jul 16, a day *before*
   the Jul 17 full deploy, so GSC still showed the old 101-page count).
   Sitemaps → re-enter `sitemap.xml` → Submit. Forces an immediate
   re-read so Google discovers the new URLs.
2. **Seed a few flagship pages.** URL Inspection → inspect
   `rhyme.land/rhymes/love` (and ~5–10 other high-volume words) →
   Request indexing. There's a small daily quota — do NOT try to
   request all ~4.7k pages; seeding the top handful is the point.

**What to expect — set expectations honestly, don't panic:**

- **"Discovered – currently not indexed" will balloon.** After GSC
  re-reads the big sitemap, this bucket jumps from ~90 to potentially
  thousands. That is a **crawl queue, not a rejection.** A young domain
  with few backlinks gets little crawl budget; Google indexes a large
  page set gradually (weeks→months), not all at once.
- **On-site is necessary but not sufficient.** Everything on-site that
  helps indexing is DONE: internal-link hub (`/rhymes`), unique
  per-page content (quotes + tiers, so pages aren't thin), clean
  self-referencing canonicals, sitemap with honest lastmod. The
  remaining lever is **domain authority = external links**, which lives
  in the GTM plan ([[project-launch-plan]]: Reddit maker posts, Show HN,
  Pattison ecosystem), NOT in this generator. A handful of real
  backlinks moves indexing *rate* more than any technical change. Be
  candid about this: "generate pages and wait" builds the foundation
  but does not manufacture the authority that gets them crawled fast.
- **"Page with redirect" (a few URLs) is harmless.** Those are
  trailing-slash / legacy-host variants Google found on its own. Our
  sitemap URLs are slash-less and return 200 with zero redirects
  (`trailingSlash: false` 308-redirects `/rhymes/love/` → `/rhymes/love`),
  and canonicals are self-referencing. Nothing to fix.

**Monitor (no action, just watch over weeks):** Sitemaps → "Discovered
pages" climbs toward the sitemap total; Pages → "Indexed" count rises in
batches; Performance → impressions on "rhymes with X" queries grow (4–8
weeks). Baseline at 2026-07-17: 70 impressions / 2 clicks / avg pos 22
over the prior 3 months, all on `land`-family queries (the domain name).

## v3 architecture (2026-07-06): render, don't reimplement

v1 (standalone document pages) looked like a foreign site and showed
none of the product — rejected on review. v2 (hand-mirroring the app's
render markup in the generator) duplicated `main.js` DOM knowledge and
sprinkled SEO hooks into app source — rejected: every future UI change
would need a matching generator change. v3 replaces both:

- **The generator runs the real app.** `buildSeoPages.mjs` starts a
  local static server, drives headless Chrome (puppeteer-core + your
  installed Chrome; `CHROME_PATH` to override) through the actual
  search box for each word, waits for the real render, and serializes
  the DOM. The snapshot IS the app's own output — change the UI
  freely, rerun the script (or don't: pages still hydrate and work,
  they just show the previous look until regenerated).
- **Zero SEO code in app source.** `main.js` / `index.html` untouched.
  A generator-injected inline boot script adds `?q={word}` via
  `replaceState` before `main.js` runs, so the app's own existing
  deep-link code hydrates the snapshot into the full interactive app;
  the same script hides the extras block when a different word is
  searched (MutationObserver on `#source-summary`). Only app change:
  two already-dead `:first-of-type` rules removed from styles.css.
- Post-processing on the CAPTURED page only: head swaps (title /
  description / canonical / OG), breadcrumb JSON-LD, wordmark h1→div +
  source-word span→h1 with a "words that rhyme with" kicker, extras
  section (corpus quotes, tier explainers, related links — styled by
  `rhymes/seo.css`), analytics stripped from generation runs.
- Pre-capture the page is slimmed: CSS-hidden lower-tier words, empty
  lazy popover shells, and the corpus gallery are removed (crawlers
  can't see them; hydration rebuilds them), and profanity is scrubbed
  from candidate lists (SafeSearch). Pages hash deterministically —
  incremental lastmod stays honest.
- Tradeoffs accepted: pages are the app's real rendered size (~17–25 KB
  gzipped, vs the original <15 KB target); the visible h1 exists in
  the static HTML but reverts to the app's span after hydration.
  Note for `--full` (2–4k pages): at ~160 KB avg raw the committed set
  would be ~300–500 MB — revisit slimming or build-on-deploy before
  running it.

This supersedes decision 4's "NO app JS" and the rejection of
client-side rendering: the crawl-cost objection applied to JS-ONLY
rendering. Static-first + hydration keeps the static guarantee and
adds retention.

The single biggest acquisition lever for this tool. Rhyme-dictionary
traffic is almost entirely long-tail search ("words that rhyme with
love"); RhymeZone owns those SERPs with thin, phoneme-only pages. We
have three things it doesn't: Pattison tier organization, cliché flags,
and real line-end quotes from the lyric corpus. Every generated page
must visibly contain all three — that's the ranking thesis AND the
thin-content defense.

## Decisions (made 2026-07-05, after Vercel-quirk review)

1. **URL**: `rhyme.land/rhymes/{word}/`. Files live at
   `rhyme-finder/rhymes/{word}/index.html` (tool-owned, respects
   CLAUDE.md Rule 3 — nothing new at repo root). Serving needs ONE
   wildcard rewrite in vercel.json, ordered before the catch-all:
   ```json
   { "source": "/rhymes/:word*", "destination": "/rhyme-finder/rhymes/:word*" }
   ```
   (No host condition — the path is unambiguous, and the pages carry
   `<link rel="canonical" href="https://rhyme.land/rhymes/{word}/">` so
   the songwriter.qi.land path duplicates don't split ranking.)

2. **Generator**: `scripts/buildSeoPages.mjs`, run manually like the
   other build scripts (repo stays a static deploy, no Vercel build
   step). It imports the REAL engine — `findRhymes` from
   `rhyme-finder/src/rhymeFinder.js` with the fetch→fs shim pattern
   already proven in `test/rhymeClassifier.test.js`. Never reimplement
   classification in the generator; one engine, three consumers
   (app, tests, SEO pages).

3. **Word selection** (build-time gate, list is derived not curated):
   - in CMU dict AND (common-10k rank < 5000 OR in ≥5 corpus songs)
     *(2026-07-17: was "lyricScore > 0 OR rank < 5000" — see
     Post-pilot additions for why that overshot)*
   - ≥ 30 candidates across all tiers (density gate)
   - ≥ 1 tier-1 corpus quote available (differentiation gate)
   - excluded: profanity-adjacent + single-letter + SHORT_ALLOWED
     function words (to/of/it… — nobody searches rhymes for "of")
   Expected yield: ~2–4k pages. The gate thresholds live as constants
   at the top of the generator; loosening them later = rerun.

4. **Page anatomy** (static HTML, NO app JS, no 3.7 MB dict — target
   < 15 KB gzipped/page; reuse the xuan-paper look via a small
   dedicated stylesheet, not the app's styles.css):
   - `<h1>` "Words that rhyme with {word}" + pron summary (vowel,
     mas/fem, coda) — mirrors the app's source-word header
   - One section per Pattison tier, in stability order, top ~20 words
     each, bold = corpus-attested, cliché superscript flag preserved
   - 2–3 real lyric line-end quotes with song/artist attribution
     (tier-1 bucket data; this is what no competitor page has)
   - A 2-sentence tier explainer — SHARED copy kept short so the
     word-specific data dominates the byte ratio
   - Internal links: same-bucket neighbors + ~10 related word pages +
     prominent CTA into `https://rhyme.land/?q={word}` (the live app)
   - JSON-LD (WebPage + breadcrumb), OG tags, canonical
   - Vercel Insights snippet only (skip PostHog here; one `seo_cta`
     event can come later if needed)

5. **Sitemap**: generator rewrites `rhyme-finder/sitemap.xml` as a
   sitemap index → `sitemap-pages.xml` (the /rhymes/ set, real
   lastmod from content hash) + the existing single-URL entry.
   Ping Search Console after deploy.

6. **Rollout**: pilot batch of ~100 high-volume words first (love,
   heart, night, time, fire…), verify rendering + Search Console
   indexing for a week, then full batch. Git-committed output is fine
   at this scale (2–4k × ~12 KB ≈ 30–50 MB); if the corpus of pages
   ever 10×es, revisit build-on-deploy instead of committed output.

7. **Incremental rebuilds**: content-hash per page; only rewrite
   changed files so `git status` stays readable and lastmod stays
   honest. Corpus expansion → rerun generator (add to the CLAUDE.md
   corpus re-run protocol once implemented).

## Explicitly rejected

- **Per-pair pages** (/rhymes/love/dove) — thin-content trap, no
  search volume worth the crawl budget.
- **Client-side rendering the SEO pages with the app engine** —
  Google renders JS but 3.7 MB dict per crawl is hostile; static HTML
  is also what makes <15 KB pages possible.
- **Generating all 126k CMU words** — 95% would be thin/junk;
  the density+quote gates ARE the quality bar.

## Success metrics

Search Console: impressions on "rhyme with X" queries within 4–8
weeks; CTR of the app CTA measurable via `?q=` deep-link searches
originating from /rhymes/ referrers (PostHog `search_submitted`
already captures the word).
