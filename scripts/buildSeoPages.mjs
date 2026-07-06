#!/usr/bin/env node
// ── Programmatic SEO page generator — rhyme.land/rhymes/{word}/ ──────
// Design doc: rhyme-finder/SEO-PLAN.md.
//
// v3 architecture: RENDER, DON'T REIMPLEMENT. The generator launches a
// headless Chrome against a local static server, drives the REAL app
// (rhyme-finder/index.html + main.js), submits each word in the real
// search box, waits for the real render, and serializes the resulting
// DOM. Nothing about the app's markup is duplicated here — change the
// UI however you like, then just rerun this script; the snapshots
// follow automatically. The app source carries ZERO SEO-specific code.
//
// Per-page post-processing (the only string surgery, all on OUR output):
//   * head: title / description / canonical / OG / twitter swaps,
//     breadcrumb JSON-LD, seo.css link
//   * wordmark h1 → div; source-word span → h1 with a small kicker
//     ("words that rhyme with") — the page's real heading
//   * a tiny inline boot script that adds ?q={word} via replaceState so
//     the app's OWN deep-link code hydrates the snapshot in place, and
//     that hides the extras block when the user searches another word
//   * an extras section before the epigraphs: corpus quotes, tier
//     explainers, related-page links (the crawlable differentiators)
//
// Requirements: Google Chrome installed locally (or CHROME_PATH env).
//
// Usage:
//   node scripts/buildSeoPages.mjs           # pilot batch (~100 words, ~3 min)
//   node scripts/buildSeoPages.mjs --full    # full derived batch (hours)
//   node scripts/buildSeoPages.mjs --prune   # also delete orphaned pages
//
// Rerun after corpus expansion, classifier/override changes, or any UI
// change you want reflected in the static snapshots.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = path.join(ROOT, "rhyme-finder", "rhymes");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const SITEMAP_DIR = path.join(ROOT, "rhyme-finder");

// Shim fetch → local filesystem BEFORE importing the engine modules
// (same pattern as test/rhymeClassifier.test.js). The engine is used
// for word SELECTION and meta-description numbers only — all rendering
// happens in the real browser.
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

// Profanity-adjacent exclusions. Applied three ways: no landing pages
// for these words, they're scrubbed from rendered candidate lists
// before capture (SafeSearch / advertiser filters), and lyric lines
// containing them are never quoted.
const EXCLUDED_PROFANITY = new Set([
  "fuck", "fucked", "fucking", "shit", "bitch", "bitches", "cunt",
  "dick", "cock", "pussy", "whore", "slut", "nigger", "nigga", "niggas",
  "faggot", "fag", "tits", "cum", "jizz", "rape", "rapist",
]);
const PROFANE_LINE_RE =
  /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|nigga\w*|nigger\w*|faggot\w*|pussy|dick\w*|cock|whore\w*|slut\w*)\b/iu;

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

// ── Static data (build-time reads) ───────────────────────────────────

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const LYRIC_FREQ = readJson(path.join(ROOT, "wordlists", "lyric-frequency.json"));
const RHYMED_DIR = path.join(ROOT, "wordlists", "lyric-library", "rhymed");

const COMMON_RANK = new Map();
fs.readFileSync(path.join(ROOT, "rhyme-finder", "wordlists", "common-10k.txt"), "utf8")
  .split(/\r?\n/u)
  .filter(Boolean)
  .forEach((w, i) => COMMON_RANK.set(w.toLowerCase(), i));

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

function pairMapFor(word) {
  const key = rhymeKeyOf(PRONUNCIATION_MAP.get(word));
  return rhymedBucket(key)?.[word] ?? null;
}

const isCleanQuote = (q) =>
  !PROFANE_LINE_RE.test(q.line) && !PROFANE_LINE_RE.test(q.partner.line);

// Up to `max` quotes for a source word, one per rhyme partner, partners
// with the most corpus evidence first.
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

// ── SEO extras (crawlable text the app keeps behind popovers/tabs) ──

const SITE = "https://rhyme.land";
const RELATED_N = 12;

// Explainer copy is SEO-page-only (the app's equivalents live in the
// tier popovers). Labels mirror the app's TIER_META for reader
// continuity but nothing here feeds the rendered results.
const TIER_COPY = {
  perfect: {
    label: "Perfect rhyme",
    explainer:
      "Same stressed vowel, same sounds after it, different beginning. Full resolution — the strongest closure a rhyme can give a line.",
  },
  family: {
    label: "Family rhyme",
    explainer:
      "The consonants after the vowel are swapped for phonetic siblings — T↔D, M↔N, S↔Z. Nearly as stable as perfect rhyme, with far more word choices.",
  },
  additive: {
    label: "Additive",
    explainer:
      "Same vowel, but one word carries an extra consonant after the shared ending. The added sound softens the landing slightly.",
  },
  subtractive: {
    label: "Subtractive",
    explainer:
      "Same vowel, but one word stops a consonant early. A slightly clipped, softer resolution than perfect rhyme.",
  },
  assonance: {
    label: "Assonance",
    explainer:
      "Only the stressed vowel matches; the consonants after it are unrelated. Loose and open — useful when a section should stay unresolved.",
  },
  consonance: {
    label: "Consonance",
    explainer:
      "The vowels differ but the ending consonants match. The faintest echo of all — texture rather than closure.",
  },
  identity: {
    label: "Identity",
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

// Inline boot script (classic script — runs during parse, BEFORE the
// deferred main.js module executes). Three jobs:
//   1. replaceState ?q={pathWord} so the app's own deep-link code
//      re-renders/hydrates the snapshot with zero app changes.
//   2. Hide the static extras when the app shows anything but the
//      path word.
//   3. Keep the URL honest as the user searches on: /rhymes/{word}/
//      only while that word is showing; {appRoot}?q={other} after a
//      new search; {appRoot} on home-reset. appRoot is derived from
//      the path prefix, so it's "/" on rhyme.land and "/rhyme-finder/"
//      on the legacy host / local dev.
const BOOT_SCRIPT = `<script>
(() => {
  var m = location.pathname.match(/^(.*)\\/rhymes\\/([^/]+)\\/?$/);
  if (!m) return;
  var root = (m[1] || "") + "/";
  var cleanPath = location.pathname;
  var w = decodeURIComponent(m[2]).toLowerCase();
  if (!new URLSearchParams(location.search).get("q")) {
    history.replaceState(null, "", cleanPath + location.search + (location.search ? "&" : "?") + "q=" + encodeURIComponent(w));
  }
  var summary = document.getElementById("source-summary");
  if (!summary) return;
  new MutationObserver(() => {
    var el = summary.querySelector(".rf-source-word");
    var ex = document.querySelector(".sp-extra");
    var cur = el ? el.textContent.trim().toLowerCase() : "";
    if (ex) ex.hidden = cur !== w;
    if (!cur) history.replaceState(null, "", root);
    else if (cur !== w) history.replaceState(null, "", root + "?q=" + encodeURIComponent(cur));
    else history.replaceState(null, "", cleanPath);
  }).observe(summary, { childList: true, subtree: true });
})();
</script>`;

// ── Post-processing of the captured page ─────────────────────────────
// Regex-based so we tolerate serializer differences (self-closing vs
// not); each must match or we throw — a miss means the app template
// changed shape and the generator needs a look.

function mustSub(html, re, replacement, what) {
  if (!re.test(html)) throw new Error(`captured page: cannot find ${what} (${re})`);
  return html.replace(re, replacement);
}

function postProcess(html, { word, title, description, canonical, extras, breadcrumbLd }) {
  let out = html;

  out = mustSub(out, /<title>[\s\S]*?<\/title>/u, `<title>${esc(title)}</title>`, "title");
  out = mustSub(
    out,
    /<meta name="description" content="[^"]*"\s*\/?>/u,
    `<meta name="description" content="${esc(description)}">`,
    "meta description",
  );
  out = mustSub(
    out,
    /<link rel="canonical" href="[^"]*"\s*\/?>/u,
    `<link rel="canonical" href="${canonical}">`,
    "canonical",
  );
  out = mustSub(
    out,
    /<meta property="og:url" content="[^"]*"\s*\/?>/u,
    `<meta property="og:url" content="${canonical}">`,
    "og:url",
  );
  out = mustSub(
    out,
    /<meta property="og:title" content="[^"]*"\s*\/?>/u,
    `<meta property="og:title" content="${esc(title)}">`,
    "og:title",
  );
  out = mustSub(
    out,
    /<meta property="og:description" content="[^"]*"\s*\/?>/u,
    `<meta property="og:description" content="${esc(description)}">`,
    "og:description",
  );
  out = mustSub(
    out,
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/u,
    `<meta name="twitter:title" content="${esc(title)}">`,
    "twitter:title",
  );
  out = mustSub(
    out,
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/u,
    `<meta name="twitter:description" content="${esc(description)}">`,
    "twitter:description",
  );
  out = mustSub(
    out,
    /(<link rel="stylesheet" href="\/rhyme-finder\/styles\.css"\s*\/?>)/u,
    `$1<link rel="stylesheet" href="/rhyme-finder/rhymes/seo.css">`,
    "styles.css link",
  );
  out = mustSub(
    out,
    /<\/head>/u,
    `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script></head>`,
    "</head>",
  );

  // Heading surgery: the page's h1 is the source word, not the wordmark.
  out = mustSub(out, /<h1 class="rf-title">/u, `<div class="rf-title">`, "wordmark h1");
  out = mustSub(out, /<\/h1>/u, `</div>`, "wordmark h1 close"); // only h1 in the app
  out = mustSub(
    out,
    /<span class="rf-source-word">([^<]*)<\/span>/u,
    `<h1 class="rf-source-word"><span class="sp-kicker">Words that rhyme with</span>$1</h1>`,
    "source word span",
  );

  // The epigraph rotation timer may fire between render and capture —
  // pin its state here (post-capture) so page hashes are deterministic.
  out = out.replace(
    /(<footer class="rf-epigraphs"[^>]*data-active=")\d+(")/u,
    "$10$2",
  );
  out = mustSub(out, /<footer class="rf-epigraphs"/u, `${extras}<footer class="rf-epigraphs"`, "epigraphs footer");
  out = mustSub(out, /<\/body>/u, `${BOOT_SCRIPT}</body>`, "</body>");

  return out;
}

// ── Local static server (serves the repo root, like `npm run dev`) ──

function startServer() {
  const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
  };
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let fsPath = path.normalize(path.join(ROOT, urlPath));
      if (!fsPath.startsWith(ROOT)) {
        res.writeHead(403).end();
        return;
      }
      if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
        fsPath = path.join(fsPath, "index.html");
      }
      if (!fs.existsSync(fsPath)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(fsPath)] || "application/octet-stream",
      });
      res.end(fs.readFileSync(fsPath));
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// ── Headless Chrome ──────────────────────────────────────────────────

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error("No Chrome found. Install Google Chrome or set CHROME_PATH.");
  }
  return found;
}

// Drive the real app: submit the word, wait for the real render.
async function captureWord(page, word) {
  await page.evaluate((w) => {
    const input = document.getElementById("word-input");
    input.value = w;
    document
      .getElementById("finder-form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, word);

  await page.waitForFunction(
    (w) => {
      const src = document.querySelector("#source-summary .rf-source-word");
      const results = document.getElementById("results");
      const status = document.getElementById("status");
      return (
        !!src &&
        src.textContent.trim() === w &&
        !!results &&
        !!results.querySelector(".rf-tier") &&
        !!status &&
        status.textContent === ""
      );
    },
    { timeout: 90_000, polling: 100 },
    word,
  );

  // Pre-capture cleanup, all inside the live page:
  //   * scrub profanity (incl. inflections: fucks, fucked-up) from the
  //     candidate lists — SafeSearch/advertiser filters
  //   * strip what crawlers can't see anyway: CSS-hidden lower-tier
  //     words, dead pre-hydration show-more buttons, empty lazy popover
  //     shells (hydration rebuilds all of it; ~60% of page bytes)
  //   * blank the (hidden, huge) corpus gallery — hydration rebuilds it
  //   * reflect the word into the input's value ATTRIBUTE (serializers
  //     don't write the live property)
  //   * drop analytics script tags injected at runtime
  await page.evaluate((w) => {
    const profane =
      /(?:^|-)(?:fuck|shit|bitch|cunt|nigg|fagg|whore|slut)|^(?:dicks?|cocks?|pussy|tits|cum|jizz)$/u;
    document.querySelectorAll("#results .rf-word").forEach((el) => {
      const text = (el.firstChild?.textContent ?? el.textContent).trim().toLowerCase();
      if (profane.test(text)) el.remove();
    });
    document
      .querySelectorAll("#results .rf-word--lower, #results .rf-subgroup-show-more, .rf-lyric-pop")
      .forEach((el) => el.remove());
    const gallery = document.getElementById("corpus-gallery");
    if (gallery) gallery.innerHTML = "";
    const input = document.getElementById("word-input");
    if (input) input.setAttribute("value", w);
    document
      .querySelectorAll('script[src*="posthog"], script[src*="/_vercel/"]')
      .forEach((s) => s.remove());
  }, word);

  return page.content();
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

// Selection + meta numbers from the engine (density gate ≥30, quote
// gate ≥1). The buckets feed ONLY the description/extras copy — the
// visible results come from the browser render.
const selected = new Map(); // word → { buckets, quotes }
for (const word of candidates) {
  if (!FULL && selected.size >= PILOT_CAP) break;
  let result;
  try {
    result = await findRhymes({ word });
  } catch {
    continue;
  }
  for (const t of Object.keys(result.buckets)) {
    result.buckets[t] = result.buckets[t].filter(
      (c) => !EXCLUDED_PROFANITY.has(c.word),
    );
  }
  if (countRhymes(result.buckets) < MIN_CANDIDATES) continue;
  const quotes = quotesFor(word);
  if (quotes.length === 0) continue;
  selected.set(word, { buckets: result.buckets, quotes });
}

console.log(`${selected.size} words past the density + quote gates`);

let manifest = {};
try {
  manifest = readJson(MANIFEST_PATH);
} catch {
  manifest = {};
}
const linkable = new Set([...Object.keys(manifest), ...selected.keys()]);

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
});

const today = new Date().toISOString().slice(0, 10);
let written = 0;
let unchanged = 0;

try {
  const page = await browser.newPage();
  // Keep generation runs out of the analytics (PostHog autocapture +
  // Vercel insights would otherwise log 100 fake visits per rebuild).
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("posthog") || u.includes("/_vercel/")) req.abort();
    else req.continue();
  });
  await page.goto(`${base}/rhyme-finder/`, { waitUntil: "domcontentloaded" });

  let done = 0;
  for (const [word, data] of selected) {
    const captured = await captureWord(page, word);

    const canonical = `${SITE}/rhymes/${encodeURIComponent(word)}/`;
    const total = countRhymes(data.buckets);
    const perfectCount = data.buckets.perfect?.length ?? 0;
    const examples = (data.buckets.perfect ?? [])
      .map((c) => c.word)
      .filter((w) => !EXCLUDED_FUNCTION.has(w) && w.length >= 3)
      .slice(0, 2);
    const exampleText = examples.length > 0 ? ` like ${examples.join(" and ")}` : "";
    const title = `Words that rhyme with ${word} — ${total} rhymes by quality | Rhyme Finder`;
    const description =
      `Words that rhyme with ${word}: ${total} rhymes sorted by strength — ` +
      `${perfectCount} perfect rhymes${exampleText}, plus family rhymes, assonance and consonance. ` +
      `With cliché warnings and real lyric examples from songs.`;

    const related = [];
    for (const t of TYPE_ORDER) {
      if (t === "identity") continue;
      for (const c of data.buckets[t] ?? []) {
        if (related.includes(c.word)) continue;
        if (!linkable.has(c.word)) continue;
        related.push(c.word);
        if (related.length >= RELATED_N) break;
      }
      if (related.length >= RELATED_N) break;
    }

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

    const extras = extrasHtml({ word, buckets: data.buckets, quotes: data.quotes, related, total });
    const html = `<!doctype html>\n${postProcess(captured.replace(/^<!DOCTYPE html>/iu, "").trim(), {
      word,
      title,
      description,
      canonical,
      extras,
      breadcrumbLd,
    })}\n`;

    const hash = crypto.createHash("sha256").update(html).digest("hex").slice(0, 16);
    const prev = manifest[word];
    const outPath = path.join(OUT_DIR, word, "index.html");
    if (prev && prev.hash === hash && fs.existsSync(outPath)) {
      unchanged += 1;
    } else {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);
      manifest[word] = { hash, lastmod: today };
      written += 1;
    }

    done += 1;
    if (done % 20 === 0) console.log(`  …${done}/${selected.size} rendered`);
  }
} finally {
  await browser.close();
  server.close();
}

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
