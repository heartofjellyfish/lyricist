#!/usr/bin/env node
// ── Programmatic SEO page generator — rhyme.land/rhymes/{word}/ ──────
// Design doc: rhyme-finder/SEO-PLAN.md. Key decisions:
//   * imports the REAL engine (findRhymes) — never reimplements
//     classification; one engine, three consumers (app, tests, SEO).
//   * static HTML output committed to rhyme-finder/rhymes/{word}/index.html,
//     served on rhyme.land via the /rhymes/:path* rewrite in vercel.json.
//   * incremental: a page is rewritten only when its content changes;
//     lastmod (kept in rhyme-finder/rhymes/manifest.json) stays honest.
//
// Usage:
//   node scripts/buildSeoPages.mjs           # pilot batch (~100 words)
//   node scripts/buildSeoPages.mjs --full    # full derived batch (slow)
//   node scripts/buildSeoPages.mjs --prune   # also delete orphaned pages
//
// Rerun after corpus expansion (quotes/cliché/frequency change) or any
// classifier/override change — same trigger as buildLyricBuckets.mjs.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = path.join(ROOT, "rhyme-finder", "rhymes");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const SITEMAP_DIR = path.join(ROOT, "rhyme-finder");

// Shim fetch → local filesystem BEFORE importing the engine modules
// (same pattern as test/rhymeClassifier.test.js). Lets the browser
// modules load cmu-dict.json / wordnet-categories.json / etc. from disk.
globalThis.fetch = async (url) => {
  const p = fileURLToPath(url);
  let buf;
  try {
    buf = fs.readFileSync(p);
  } catch {
    return { ok: false, status: 404 };
  }
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString()),
    text: async () => buf.toString(),
  };
};

const { ensurePronunciation, PRONUNCIATION_MAP } = await import(
  "../rhyme-finder/src/pronunciation.js"
);
const { analyzeWord, rhymeKeyOf } = await import(
  "../rhyme-finder/src/rhymeClassifier.js"
);
const { findRhymes, TYPE_ORDER } = await import(
  "../rhyme-finder/src/rhymeFinder.js"
);

await ensurePronunciation();

// ── Selection gates (SEO-PLAN.md §3) ─────────────────────────────────

const MIN_CANDIDATES = 30; // density gate, across all rhyme tiers (identity excluded)
const COMMON_RANK_MAX = 5000; // general-English fallback gate
const PILOT_CAP = 100;

// Words nobody searches rhymes for — single letters + the app's
// SHORT_ALLOWED function-word list (kept in sync by hand; it changes
// about never).
const EXCLUDED_FUNCTION = new Set([
  "i", "a",
  "be", "we", "he", "me", "do", "go", "no", "so", "to", "up", "am", "an",
  "at", "by", "in", "is", "it", "my", "of", "or", "us", "if", "as", "on",
  "ah", "oh", "ow", "hi", "ya", "ye",
]);

// Profanity-adjacent exclusions — we don't want these as indexed
// landing pages even though the app itself will happily rhyme them.
const EXCLUDED_PROFANITY = new Set([
  "fuck", "fucked", "fucking", "shit", "bitch", "bitches", "cunt",
  "dick", "cock", "pussy", "whore", "slut", "nigger", "nigga", "niggas",
  "faggot", "fag", "tits", "cum", "jizz", "rape", "rapist",
]);

// Pilot batch — ~120 high-volume "words that rhyme with X" heads;
// the gates below trim this to ≤100. Full batch (--full) derives the
// list from the dictionary instead.
const PILOT_WORDS = [
  "love", "heart", "night", "time", "fire", "life", "day", "eyes",
  "world", "home", "away", "alone", "rain", "pain", "sky", "blue",
  "dream", "girl", "baby", "man", "way", "name", "mind", "soul",
  "road", "light", "dark", "star", "sun", "moon", "sea", "free",
  "cry", "die", "fly", "high", "smile", "cold", "gold", "old",
  "run", "fun", "gone", "song", "long", "strong", "wrong", "down",
  "town", "sound", "ground", "back", "black", "face", "place", "hand",
  "stand", "land", "head", "bed", "dead", "red", "friend", "end",
  "mine", "line", "shine", "true", "you", "new", "know", "low",
  "show", "slow", "grow", "feel", "real", "believe", "leave", "stay",
  "play", "say", "today", "tonight", "right", "bright", "white",
  "kiss", "miss", "forever", "together", "never", "better", "more",
  "door", "floor", "deep", "sleep", "keep", "tears", "years", "fear",
  "here", "close", "lost", "heaven", "again", "rose", "bones", "water",
  "stone", "one", "side", "ride", "inside", "crazy", "money", "honey",
  "lonely", "body", "sorry", "city", "pretty", "little", "trouble",
];

// ── Static data loaded directly (build-time, no fetch shim needed) ──

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const LYRIC_FREQ = readJson(path.join(ROOT, "wordlists", "lyric-frequency.json"));
const LIB_INDEX = readJson(path.join(ROOT, "wordlists", "lyric-library", "index.json"));
const CLICHE_PAIRS = readJson(path.join(ROOT, "wordlists", "cliche-pairs.json"));
const RHYMED_DIR = path.join(ROOT, "wordlists", "lyric-library", "rhymed");

const COMMON_RANK = new Map();
fs.readFileSync(path.join(ROOT, "rhyme-finder", "wordlists", "common-10k.txt"), "utf8")
  .split(/\r?\n/u)
  .filter(Boolean)
  .forEach((w, i) => COMMON_RANK.set(w.toLowerCase(), i));

const CLICHE_INDEX = new Map();
for (const [a, b] of CLICHE_PAIRS) {
  if (!CLICHE_INDEX.has(a)) CLICHE_INDEX.set(a, new Set());
  if (!CLICHE_INDEX.has(b)) CLICHE_INDEX.set(b, new Set());
  CLICHE_INDEX.get(a).add(b);
  CLICHE_INDEX.get(b).add(a);
}
const isCliche = (a, b) => CLICHE_INDEX.get(a)?.has(b) ?? false;

// Corpus-attested = the word appears at line-end in the lyric library
// (same signal as the app's hasQuotes badge gate).
const isAttested = (w) => Object.hasOwn(LIB_INDEX.words ?? {}, w);

// ── Quote lookup (tier-1 rhymed buckets, read from disk) ────────────

const bucketCache = new Map();
function rhymedBucket(key) {
  if (!key) return null;
  if (bucketCache.has(key)) return bucketCache.get(key);
  let data = null;
  try {
    data = readJson(path.join(RHYMED_DIR, `${key}.json`));
  } catch {
    data = null;
  }
  bucketCache.set(key, data);
  return data;
}

// Lyric lines containing these don't get quoted on an indexed page —
// same SafeSearch concern as the word gate above.
const PROFANE_LINE_RE =
  /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|nigga\w*|nigger\w*|faggot\w*|pussy|dick\w*|cock|whore\w*|slut\w*)\b/iu;
const isCleanQuote = (q) =>
  !PROFANE_LINE_RE.test(q.line) && !PROFANE_LINE_RE.test(q.partner.line);

// Up to `max` quotes for a source word, one per rhyme partner, partners
// with the most corpus evidence first. Each item: { quote, partner }.
function quotesFor(word, max = 3) {
  const key = rhymeKeyOf(PRONUNCIATION_MAP.get(word));
  const bucket = rhymedBucket(key);
  const entry = bucket?.[word];
  if (!entry) return [];
  const partners = Object.entries(entry)
    .filter(([, v]) => Array.isArray(v?.q) && v.q.length > 0)
    .sort((a, b) => (b[1].n ?? 0) - (a[1].n ?? 0));
  const out = [];
  for (const [partner, { q }] of partners) {
    const quote = q.find((x) => x?.line && x?.partner?.line && isCleanQuote(x));
    if (!quote) continue;
    out.push({ partner, quote });
    if (out.length >= max) break;
  }
  return out;
}

// ── Gates ────────────────────────────────────────────────────────────

function passesWordGate(word) {
  if (!/^[a-z][a-z-]*$/u.test(word)) return false;
  if (word.length < 2) return false;
  if (EXCLUDED_FUNCTION.has(word)) return false;
  if (EXCLUDED_PROFANITY.has(word)) return false;
  if (!analyzeWord(word)) return false; // must be in CMU dict
  const inLyrics = (LYRIC_FREQ[word] ?? 0) > 0;
  const rank = COMMON_RANK.get(word) ?? Infinity;
  return inLyrics || rank < COMMON_RANK_MAX;
}

const RHYME_TIERS = TYPE_ORDER.filter((t) => t !== "identity");

function countRhymes(buckets) {
  return RHYME_TIERS.reduce((n, t) => n + (buckets[t]?.length ?? 0), 0);
}

// ── Page rendering ───────────────────────────────────────────────────

const SITE = "https://rhyme.land";
const TOP_N = 20; // words shown per rhyme tier
const IDENTITY_N = 8; // identity is an anti-example, keep it short
const RELATED_N = 12;

const TIER_COPY = {
  perfect: {
    label: "Perfect rhymes",
    subtitle: "full resolution · stability 5",
    explainer:
      "Same stressed vowel, same sounds after it, different beginning. This is full resolution — the strongest closure a rhyme can give a line.",
  },
  family: {
    label: "Family rhymes",
    subtitle: "close resolution · stability 4",
    explainer:
      "The consonants after the vowel are swapped for phonetic siblings — T↔D, M↔N, S↔Z. Nearly as stable as perfect rhyme, with far more word choices.",
  },
  additive: {
    label: "Additive rhymes",
    subtitle: "trailing resolution · stability 3",
    explainer:
      "Same vowel, but one word carries an extra consonant after the shared ending. The added sound softens the landing slightly.",
  },
  subtractive: {
    label: "Subtractive rhymes",
    subtitle: "clipped resolution · stability 3",
    explainer:
      "Same vowel, but one word stops a consonant early. A slightly clipped, softer resolution than perfect rhyme.",
  },
  assonance: {
    label: "Assonance",
    subtitle: "loose resolution · stability 2",
    explainer:
      "Only the stressed vowel matches; the consonants after it are unrelated. Loose and open — useful when a section should stay unresolved.",
  },
  consonance: {
    label: "Consonance",
    subtitle: "faint resolution · stability 1",
    explainer:
      "The vowels differ but the ending consonants match. The faintest echo of all — texture rather than closure.",
  },
  identity: {
    label: "Identity — sounds like a rhyme, isn't one",
    subtitle: "echo, not rhyme · stability 0",
    explainer:
      "The whole stressed syllable repeats, beginning included. That's repetition, not rhyme — the line echoes instead of resolving.",
  },
};

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// Bold the rhyme word inside a lyric line (last whole-word occurrence,
// case-insensitive). Falls back to the untouched line when not found.
function highlightWord(line, word) {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, "giu");
  const matches = [...line.matchAll(re)];
  if (matches.length === 0) return esc(line);
  const m = matches[matches.length - 1];
  return (
    esc(line.slice(0, m.index)) +
    `<b class="rw">${esc(m[0])}</b>` +
    esc(line.slice(m.index + m[0].length))
  );
}

function wordItem(cand, sourceWord, linkable) {
  const w = cand.word;
  const inner = isAttested(w) ? `<strong>${esc(w)}</strong>` : esc(w);
  const linked = linkable.has(w)
    ? `<a href="${SITE}/rhymes/${encodeURIComponent(w)}/">${inner}</a>`
    : inner;
  const flag = isCliche(sourceWord, w) ? `<sup class="cliche">cliché</sup>` : "";
  return `<li>${linked}${flag}</li>`;
}

function renderTier(type, candidates, sourceWord, linkable) {
  if (!candidates || candidates.length === 0) return "";
  const cap = type === "identity" ? IDENTITY_N : TOP_N;
  const shown = candidates.slice(0, cap);
  const meta = TIER_COPY[type];
  const more = candidates.length > shown.length
    ? `<p class="sp-more"><a href="${SITE}/?q=${encodeURIComponent(sourceWord)}">+ ${candidates.length - shown.length} more ${esc(meta.label.toLowerCase())} in the interactive finder →</a></p>`
    : "";
  return `
  <section class="sp-tier" data-t="${type}">
    <h2>${esc(meta.label)}<span class="sp-sub">${esc(meta.subtitle)}</span></h2>
    <p class="sp-exp">${esc(meta.explainer)}</p>
    <ul class="sp-words">
      ${shown.map((c) => wordItem(c, sourceWord, linkable)).join("\n      ")}
    </ul>${more}
  </section>`;
}

function renderQuotes(word, quotes) {
  if (quotes.length === 0) return "";
  const figures = quotes.map(({ partner, quote }) => {
    const surface = quote.surface || word;
    // Show the two rhyming lines in song order when we know it.
    const qIdx = quote.stanzaLineIdx ?? 0;
    const pIdx = quote.partner.stanzaLineIdx ?? qIdx + 1;
    const lines =
      pIdx < qIdx
        ? [
            [quote.partner.line, quote.partner.word],
            [quote.line, surface],
          ]
        : [
            [quote.line, surface],
            [quote.partner.line, quote.partner.word],
          ];
    return `
    <figure>
      <blockquote>
        ${lines.map(([l, w]) => `<span class="ql">${highlightWord(l, w)}</span>`).join("\n        ")}
      </blockquote>
      <figcaption>— ${esc(quote.credit)}, “${esc(quote.songTitle)}”${partner ? ` · rhymes ${esc(surface)} / ${esc(quote.partner.word)}` : ""}</figcaption>
    </figure>`;
  });
  return `
  <section class="sp-quotes">
    <h2>“${esc(word)}” at line end — from real songs</h2>
    ${figures.join("\n")}
  </section>`;
}

function renderPage({ word, source, buckets, quotes, linkable }) {
  const canonical = `${SITE}/rhymes/${encodeURIComponent(word)}/`;
  const total = countRhymes(buckets);
  const perfectCount = buckets.perfect?.length ?? 0;
  // Example words for the meta description — skip function words ("of")
  // that read poorly as showcased rhymes.
  const examples = (buckets.perfect ?? [])
    .map((c) => c.word)
    .filter((w) => !EXCLUDED_FUNCTION.has(w) && w.length >= 3)
    .slice(0, 2);
  const exampleText = examples.length > 0 ? ` like ${examples.join(" and ")}` : "";

  const title = `Words that rhyme with ${word} — ${total} rhymes by quality | Rhyme Finder`;
  const description =
    `Words that rhyme with ${word}: ${total} rhymes sorted by strength — ` +
    `${perfectCount} perfect rhymes${exampleText}, plus family rhymes, assonance and consonance. ` +
    `With cliché warnings and real lyric examples from songs.`;

  const codaText = source.coda.length > 0 ? source.coda.join("·") : "—";
  const stressLabel = source.masculine ? "masculine" : "feminine";

  // Related pages: perfect-bucket neighbors first (same rhyme sound),
  // then strongest cross-tier candidates that have pages of their own.
  const related = [];
  for (const t of TYPE_ORDER) {
    for (const c of buckets[t] ?? []) {
      if (t === "identity") continue;
      if (related.includes(c.word)) continue;
      if (!linkable.has(c.word)) continue;
      related.push(c.word);
      if (related.length >= RELATED_N) break;
    }
    if (related.length >= RELATED_N) break;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonical,
        url: canonical,
        name: title,
        description,
        isPartOf: { "@type": "WebSite", name: "Rhyme Finder", url: `${SITE}/` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Rhyme Finder", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: `Rhymes with ${word}`, item: canonical },
        ],
      },
    ],
  };

  const tierSections = TYPE_ORDER.map((t) =>
    renderTier(t, buckets[t], word, linkable),
  ).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Rhyme Finder" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${SITE}/rhyme-finder/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" type="image/svg+xml" href="/rhyme-finder/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@400;500&family=Inter:wght@400;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/rhyme-finder/rhymes/seo.css" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<main class="sp">
  <nav class="sp-crumb"><a href="${SITE}/">Rhyme Finder</a> › rhymes › ${esc(word)}</nav>
  <header>
    <h1>Words that rhyme with <em>${esc(word)}</em></h1>
    <p class="sp-pron"><span class="tag">${stressLabel}</span> <span class="tag">vowel <b>${esc(source.stressedVowel)}</b></span> <span class="tag">coda <b>${esc(codaText)}</b></span></p>
    <p class="sp-lede">${total} rhymes for “${esc(word)}”, organized the way Pat Pattison teaches it — from perfect rhyme down to consonance. <strong>Bold</strong> words appear at line end in real songs; overworked pairs carry a <sup class="cliche">cliché</sup> flag. <a href="${SITE}/?q=${encodeURIComponent(word)}">Open “${esc(word)}” in the interactive finder →</a></p>
  </header>
${tierSections}
${renderQuotes(word, quotes)}
  <section class="sp-cta">
    <a class="sp-btn" href="${SITE}/?q=${encodeURIComponent(word)}">See all ${total} rhymes for “${esc(word)}”</a>
    <p>The interactive finder adds the full stability spectrum, syllable filters, and line-end quotes from the lyric corpus. Free, no signup.</p>
  </section>
${related.length > 0 ? `  <nav class="sp-related">
    <h2>More rhyme pages</h2>
    <ul>
      ${related.map((w) => `<li><a href="${SITE}/rhymes/${encodeURIComponent(w)}/">Words that rhyme with ${esc(w)}</a></li>`).join("\n      ")}
    </ul>
  </nav>` : ""}
  <footer class="sp-foot">
    <a href="${SITE}/">Rhyme Finder</a> — a rhyming dictionary for songwriters, organized by Pat Pattison's stability tiers, with cliché flags and line-end examples from real songs.
  </footer>
</main>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
}

// ── Sitemaps ─────────────────────────────────────────────────────────

function writeSitemaps(manifest) {
  const today = new Date().toISOString().slice(0, 10);
  const pages = Object.entries(manifest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([w, m]) => `  <url>
    <loc>${SITE}/rhymes/${encodeURIComponent(w)}/</loc>
    <lastmod>${m.lastmod}</lastmod>
  </url>`,
    )
    .join("\n");

  fs.writeFileSync(
    path.join(SITEMAP_DIR, "sitemap-pages.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages}
</urlset>
`,
  );

  fs.writeFileSync(
    path.join(SITEMAP_DIR, "sitemap-home.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>2026-07-04</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
  );

  fs.writeFileSync(
    path.join(SITEMAP_DIR, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE}/sitemap-home.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${SITE}/sitemap-pages.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>
`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────

const FULL = process.argv.includes("--full");
const PRUNE = process.argv.includes("--prune");

let candidates;
if (FULL) {
  candidates = [...PRONUNCIATION_MAP.keys()].filter(passesWordGate).sort();
} else {
  candidates = PILOT_WORDS.filter(passesWordGate);
}

console.log(`${FULL ? "full" : "pilot"} mode — ${candidates.length} words past the word gate`);

// Per-word engine gates: density (≥30 candidates) + differentiation
// (≥1 tier-1 corpus quote). Run findRhymes once per word and keep the
// result for rendering.
const selected = new Map(); // word → { source, buckets, quotes }
for (const word of candidates) {
  if (!FULL && selected.size >= PILOT_CAP) break;
  let result;
  try {
    result = await findRhymes({ word });
  } catch {
    continue;
  }
  // Scrub profanity from every bucket — fine in the app, wrong on an
  // indexed landing page (SafeSearch / advertiser filters).
  for (const t of Object.keys(result.buckets)) {
    result.buckets[t] = result.buckets[t].filter(
      (c) => !EXCLUDED_PROFANITY.has(c.word),
    );
  }
  if (countRhymes(result.buckets) < MIN_CANDIDATES) continue;
  const quotes = quotesFor(word);
  if (quotes.length === 0) continue;
  selected.set(word, { source: result.source, buckets: result.buckets, quotes });
}

console.log(`${selected.size} words past the density + quote gates`);

// Link mesh: pages from this run + pages that already exist from
// previous runs (manifest) are all linkable.
let manifest = {};
try {
  manifest = readJson(MANIFEST_PATH);
} catch {
  manifest = {};
}
const linkable = new Set([...Object.keys(manifest), ...selected.keys()]);

const today = new Date().toISOString().slice(0, 10);
let written = 0;
let unchanged = 0;

for (const [word, data] of selected) {
  const html = renderPage({ word, ...data, linkable });
  const hash = crypto.createHash("sha256").update(html).digest("hex").slice(0, 16);
  const prev = manifest[word];
  const outPath = path.join(OUT_DIR, word, "index.html");
  if (prev && prev.hash === hash && fs.existsSync(outPath)) {
    unchanged += 1;
    continue;
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  manifest[word] = { hash, lastmod: today };
  written += 1;
}

// Prune orphans (pages in the manifest that no longer pass the gates)
// only when asked — pilot runs shouldn't delete full-batch pages.
if (PRUNE) {
  for (const word of Object.keys(manifest)) {
    if (selected.has(word)) continue;
    fs.rmSync(path.join(OUT_DIR, word), { recursive: true, force: true });
    delete manifest[word];
    console.log(`pruned /rhymes/${word}/`);
  }
}

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 1)}\n`);
writeSitemaps(manifest);

console.log(`${written} pages written, ${unchanged} unchanged, ${Object.keys(manifest).length} total in sitemap`);
