# Programmatic SEO engine — rhyme.land/rhymes/{word}/

Last updated: 2026-07-05 (design approved, not yet implemented)

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
   - in CMU dict AND (lyricScore > 0 OR common-10k rank < 5000)
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
