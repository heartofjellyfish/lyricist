#!/usr/bin/env node
// ── Programmatic SEO page generator — rhyme.land/rhymes/{word}/ ──────
// Design doc: rhyme-finder/SEO-PLAN.md. Key decisions:
//   * imports the REAL engine (findRhymes) — never reimplements
//     classification; one engine, three consumers (app, tests, SEO).
//   * each page is the app's own index.html with the word's results
//     PRE-RENDERED into #source-summary/#results (same DOM classes the
//     app renders, same styles.css) — so the landing page looks exactly
//     like the product. The app's main.js (loaded by the template)
//     recognizes /rhymes/{word}/ paths and re-renders in place, turning
//     the static snapshot into the fully interactive app.
//   * crawlers get complete static HTML; humans get the live product.
//   * incremental: a page is rewritten only when its content changes;
//     lastmod (kept in rhyme-finder/rhymes/manifest.json) stays honest.
//
// Usage:
//   node scripts/buildSeoPages.mjs           # pilot batch (~100 words)
//   node scripts/buildSeoPages.mjs --full    # full derived batch (slow)
//   node scripts/buildSeoPages.mjs --prune   # also delete orphaned pages
//
// Rerun after corpus expansion, any classifier/override change, OR any
// index.html / main.js render-markup change (the static markup below
// mirrors main.js renderTier/renderWord — keep them in sync).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = path.join(ROOT, "rhyme-finder", "rhymes");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const SITEMAP_DIR = path.join(ROOT, "rhyme-finder");

// Shim fetch → local filesystem BEFORE importing the engine modules
// (same pattern as test/rhymeClassifier.test.js).
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
// landing pages (nor in their word lists) even though the app itself
// will happily rhyme them.
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
const TEMPLATE = fs.readFileSync(path.join(ROOT, "rhyme-finder", "index.html"), "utf8");

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
const wordCounts = (w) => LIB_INDEX.words?.[w] ?? null; // [appearances, rhymed, notRhymed, rhymeWords]

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

// The source word's tier-1 pair map: { partnerWord: { q, n } } — the
// same data the app's corpus tab and pair-count badges read.
function pairMapFor(word) {
  const key = rhymeKeyOf(PRONUNCIATION_MAP.get(word));
  return rhymedBucket(key)?.[word] ?? null;
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
  const entry = pairMapFor(word);
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

// ── Static results markup ────────────────────────────────────────────
// ⚠️ Mirrors the app's renderTier / renderSubgroup / renderWord DOM in
// rhyme-finder/src/main.js — if those change classes/structure, change
// this too and rerun. The hydrated app replaces all of it at runtime,
// so drift shows up only pre-hydration / for crawlers.

const SITE = "https://rhyme.land";
const STATIC_CAP = 36; // default-tier words pre-rendered per rhyme tier
const IDENTITY_CAP = 8; // identity is an anti-example, keep it short
const RELATED_N = 12;

// label/subtitle/stability match the app's TIER_META (main.js).
// explainer is SEO-page-only copy (the app puts this in popovers).
const TIER_COPY = {
  perfect: {
    label: "Perfect rhyme",
    subtitle: "full resolution",
    stability: 5,
    explainer:
      "Same stressed vowel, same sounds after it, different beginning. Full resolution — the strongest closure a rhyme can give a line.",
  },
  family: {
    label: "Family rhyme",
    subtitle: "close resolution",
    stability: 4,
    explainer:
      "The consonants after the vowel are swapped for phonetic siblings — T↔D, M↔N, S↔Z. Nearly as stable as perfect rhyme, with far more word choices.",
  },
  additive: {
    label: "Additive",
    subtitle: "trailing resolution",
    stability: 3,
    explainer:
      "Same vowel, but one word carries an extra consonant after the shared ending. The added sound softens the landing slightly.",
  },
  subtractive: {
    label: "Subtractive",
    subtitle: "clipped resolution",
    stability: 3,
    explainer:
      "Same vowel, but one word stops a consonant early. A slightly clipped, softer resolution than perfect rhyme.",
  },
  assonance: {
    label: "Assonance",
    subtitle: "loose resolution",
    stability: 2,
    explainer:
      "Only the stressed vowel matches; the consonants after it are unrelated. Loose and open — useful when a section should stay unresolved.",
  },
  consonance: {
    label: "Consonance",
    subtitle: "faint resolution",
    stability: 1,
    explainer:
      "The vowels differ but the ending consonants match. The faintest echo of all — texture rather than closure.",
  },
  identity: {
    label: "Identity",
    subtitle: "echo, not rhyme",
    stability: 0,
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

// main.js recommendationTier()
const scoreTier = (c) =>
  (c.score ?? 0) >= 5000 ? "very-common" : (c.score ?? 0) >= 1000 ? "common" : "uncommon";

function staticWord(c, source, pairMap) {
  const classes = ["rf-word", `rf-c-${scoreTier(c)}`];
  const cliche = isCliche(source.word, c.word);
  if (cliche) classes.push("rf-cliche");
  if (c.masculine !== source.masculine) classes.push("rf-mismatch");

  // Badge logic mirrors decorateWithLyrics(): filled dot + pair count
  // when the pair is corpus-attested; hollow dot + own rhymed count
  // when the word merely lives in the corpus.
  const pairN = pairMap?.[c.word]?.n ?? 0;
  const counts = wordCounts(c.word);
  let badge = "";
  if (pairN > 0) {
    classes.push("rf-has-lyrics");
    badge = `<span class="rf-lyric-badge"><span class="rf-lyric-badge-count">${pairN}</span></span>`;
  } else if (counts) {
    classes.push("rf-has-lyrics");
    badge = `<span class="rf-lyric-badge rf-lyric-badge--corpus"><span class="rf-lyric-badge-count">${counts[1] || counts[0] || ""}</span></span>`;
  }
  const flag = cliche ? `<span class="rf-word-flag">cliché</span>` : "";
  return `<span class="${classes.join(" ")}" data-lex="${esc(c.lex ?? "common")}">${esc(c.word)}${flag}${badge}</span>`;
}

function staticTier(type, candidates, source, pairMap) {
  if (!candidates || candidates.length === 0) return "";
  const meta = TIER_COPY[type];
  const cap = type === "identity" ? IDENTITY_CAP : STATIC_CAP;
  const shown = candidates.filter((c) => c.tier !== "lower").slice(0, cap);
  if (shown.length === 0) return "";

  const bySyll = new Map();
  for (const c of shown) {
    const s = Math.max(1, c.syllables ?? 1);
    if (!bySyll.has(s)) bySyll.set(s, []);
    bySyll.get(s).push(c);
  }
  const groups = [...bySyll.keys()]
    .sort((a, b) => a - b)
    .map((s) => {
      const label = s === 1 ? "1 syllable" : `${s} syllables`;
      const words = bySyll.get(s).map((c) => staticWord(c, source, pairMap)).join("");
      return `<div class="rf-subgroup"><div class="rf-subgroup-label">${label}</div><div class="rf-words">${words}</div></div>`;
    })
    .join("");

  return `<article class="rf-tier" data-tier="${type}" data-stability="${meta.stability}">
<header class="rf-tier-head" data-stability="${meta.stability}">
<button class="rf-tier-titlebox" type="button" aria-label="What is ${esc(meta.label)}?">
<span class="rf-tier-title-row"><span class="rf-tier-title">${esc(meta.label)}</span><span class="rf-tier-info" aria-hidden="true">?</span></span>
<span class="rf-tier-subtitle">${esc(meta.subtitle)}</span>
</button>
<span class="rf-tier-count" data-total="${candidates.length}">${candidates.length}</span>
</header>
<div class="rf-tier-body">${groups}</div>
</article>`;
}

// ── SEO extras (below the results — the crawlable differentiators the
// app keeps behind popovers/tabs: quotes, tier explainers, page links) ──

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

function extrasHtml({ word, buckets, quotes, related, total }) {
  const figures = quotes
    .map(({ quote }) => {
      const surface = quote.surface || word;
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
      return `<figure>
<blockquote>${lines.map(([l, w]) => `<span class="ql">${highlightWord(l, w)}</span>`).join("")}</blockquote>
<figcaption>— ${esc(quote.credit)}, “${esc(quote.songTitle)}” · rhymes ${esc(surface)} / ${esc(quote.partner.word)}</figcaption>
</figure>`;
    })
    .join("\n");

  const tierDefs = TYPE_ORDER.filter((t) => (buckets[t]?.length ?? 0) > 0)
    .map(
      (t) =>
        `<div class="sp-def"><dt>${esc(TIER_COPY[t].label)} <span class="sp-def-n">${buckets[t].length}</span></dt><dd>${esc(TIER_COPY[t].explainer)}</dd></div>`,
    )
    .join("");

  const relatedLinks = related
    .map((w) => `<li><a href="${SITE}/rhymes/${encodeURIComponent(w)}/">Words that rhyme with ${esc(w)}</a></li>`)
    .join("");

  return `<section class="sp-extra">
${quotes.length > 0 ? `<div class="sp-block sp-quotes">
<h2>“${esc(word)}” at line end — from real songs</h2>
${figures}
</div>` : ""}
<div class="sp-block">
<h2>How to read the ${total} results</h2>
<p class="sp-note">Tiers follow Pat Pattison's stability scale — pick the resolution your line needs, not just the closest sound. <strong>Bold</strong> words are common in lyrics; a struck-through <span class="sp-strike">word</span> with a <span class="sp-flag">cliché</span> flag is an overworked pair; a vermilion dot counts how often the pair appears at line end in our corpus of real songs.</p>
<dl class="sp-defs">${tierDefs}</dl>
</div>
${related.length > 0 ? `<nav class="sp-block sp-related" aria-label="More rhyme pages">
<h2>More rhyme pages</h2>
<ul>${relatedLinks}</ul>
</nav>` : ""}
</section>
`;
}

// ── Page assembly: transform the app's index.html ────────────────────

function mustReplace(html, anchor, replacement) {
  if (!html.includes(anchor)) {
    throw new Error(`index.html template anchor missing: ${anchor.slice(0, 70)}…`);
  }
  return html.replace(anchor, replacement);
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

  // Related pages: strongest candidates (stability order) that have
  // pages of their own.
  const related = [];
  for (const t of TYPE_ORDER) {
    if (t === "identity") continue;
    for (const c of buckets[t] ?? []) {
      if (related.includes(c.word)) continue;
      if (!linkable.has(c.word)) continue;
      related.push(c.word);
      if (related.length >= RELATED_N) break;
    }
    if (related.length >= RELATED_N) break;
  }

  const pairMap = pairMapFor(word);

  // Source summary — mirrors main.js renderSource(), with the word
  // promoted to the page's h1 (the wordmark h1 is demoted below).
  const codaText = source.coda.length > 0 ? source.coda.join("·") : "—";
  const stressLabel = source.masculine ? "masculine" : "feminine";
  // Inline kicker keeps the h1 on one line box, so the flex row's
  // baseline alignment against the tags stays identical to the app.
  const sourceSummary =
    `<h1 class="rf-source-word"><span class="sp-kicker">Words that rhyme with</span>${esc(word)}</h1>` +
    `<span class="rf-source-tag rf-source-tag-stress" tabindex="0">${stressLabel}</span>` +
    `<span class="rf-source-tag">vowel <span class="rf-tag-val">${esc(source.stressedVowel)}</span></span>` +
    `<span class="rf-source-tag">coda <span class="rf-tag-val">${esc(codaText)}</span></span>`;

  // Tab counts — mirror main.js updateTabCounts().
  let tierCount = 0;
  let wordCount = 0;
  for (const t of TYPE_ORDER) {
    const n = buckets[t]?.length ?? 0;
    if (n > 0) {
      tierCount += 1;
      wordCount += n;
    }
  }
  const c = wordCounts(word);
  const partnerCount = c?.[3] ?? 0;
  const songCount = c?.[1] ?? 0;
  const dictCounts = `<b>${tierCount}</b> tier${tierCount === 1 ? "" : "s"} · <b>${wordCount}</b> word${wordCount === 1 ? "" : "s"}`;
  const corpusCounts = partnerCount
    ? `<b>${partnerCount}</b> partner${partnerCount === 1 ? "" : "s"} · <b>${songCount}</b> song${songCount === 1 ? "" : "s"}`
    : `no paired uses yet`;

  const resultsHtml = TYPE_ORDER.map((t) =>
    staticTier(t, buckets[t], source, pairMap),
  ).join("\n");

  const breadcrumbLd = {
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

  let html = TEMPLATE;

  // Head: title / description / canonical / OG / twitter.
  html = mustReplace(
    html,
    "<title>Rhyme Finder — a rhyming dictionary for songwriters</title>",
    `<title>${esc(title)}</title>`,
  );
  html = mustReplace(
    html,
    `<meta name="description" content="A rhyming dictionary for songwriters — organized by Pat Pattison's stability tiers, with cliché flags and line-end examples from real songs." />`,
    `<meta name="description" content="${esc(description)}" />`,
  );
  html = mustReplace(
    html,
    `<link rel="canonical" href="https://rhyme.land/" />`,
    `<link rel="canonical" href="${canonical}" />`,
  );
  html = mustReplace(
    html,
    `<meta property="og:url" content="https://rhyme.land/" />`,
    `<meta property="og:url" content="${canonical}" />`,
  );
  html = mustReplace(
    html,
    `<meta property="og:title" content="Rhyme Finder — a rhyming dictionary for songwriters" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
  );
  html = mustReplace(
    html,
    `<meta property="og:description" content="Organized by Pat Pattison's stability tiers, with cliché flags and line-end examples from real songs." />`,
    `<meta property="og:description" content="${esc(description)}" />`,
  );
  html = mustReplace(
    html,
    `<meta name="twitter:title" content="Rhyme Finder — a rhyming dictionary for songwriters" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
  );
  html = mustReplace(
    html,
    `<meta name="twitter:description" content="Organized by Pat Pattison's stability tiers, with cliché flags and line-end examples from real songs." />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  );
  // Extras stylesheet + per-page JSON-LD, appended to the head.
  html = mustReplace(
    html,
    `<link rel="stylesheet" href="/rhyme-finder/styles.css" />`,
    `<link rel="stylesheet" href="/rhyme-finder/styles.css" />\n    <link rel="stylesheet" href="/rhyme-finder/rhymes/seo.css" />`,
  );
  html = mustReplace(
    html,
    "</head>",
    `  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>\n  </head>`,
  );

  // Body: demote the wordmark h1 (the page h1 is the source word),
  // prefill the search box, inject source summary / tab counts / results.
  html = mustReplace(html, `<h1 class="rf-title">`, `<div class="rf-title">`);
  html = mustReplace(html, `</h1>`, `</div>`); // the wordmark h1's only close tag
  html = mustReplace(
    html,
    `placeholder="give me an english word"`,
    `placeholder="give me an english word"\n                value="${esc(word)}"`,
  );
  html = mustReplace(
    html,
    `<div id="source-summary" class="rf-source-summary"></div>`,
    `<div id="source-summary" class="rf-source-summary">${sourceSummary}</div>`,
  );
  html = mustReplace(
    html,
    `<div id="cd-tabs" class="cd-tabs" role="tablist" hidden>`,
    `<div id="cd-tabs" class="cd-tabs" role="tablist">`,
  );
  html = mustReplace(
    html,
    `<span class="cd-tab-counts" data-counts="dict"></span>`,
    `<span class="cd-tab-counts" data-counts="dict">${dictCounts}</span>`,
  );
  html = mustReplace(
    html,
    `<span class="cd-tab-counts" data-counts="corpus"></span>`,
    `<span class="cd-tab-counts" data-counts="corpus">${corpusCounts}</span>`,
  );
  html = mustReplace(
    html,
    `<div id="results" class="rf-results"></div>`,
    `<div id="results" class="rf-results">${resultsHtml}</div>`,
  );
  // SEO extras go right before the epigraphs footer (which the app's
  // CSS hides whenever results are present).
  html = mustReplace(
    html,
    `<footer class="rf-epigraphs"`,
    `${extrasHtml({ word, buckets, quotes, related, total })}<footer class="rf-epigraphs"`,
  );

  return html;
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
