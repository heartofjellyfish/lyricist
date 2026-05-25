// Build tiered, rhyme-key-sharded lyric files for Rhyme Finder (May 2026 redesign).
//
// INPUT  — wordlists/lyric-library/{a..z,_}.json   per-letter dedup'd index
//          wordlists/cmu-dict.json + cmu-overrides  (for rhymeKeyOf)
//          lyric-library/curated/songs.jsonl        (artist → tier, favorite weighting)
//
// OUTPUT — wordlists/lyric-library/
//   index.json                  { words: { word: [appearances, rhymed, notRhymed, rhymeWords] },
//                                 buckets: [rhymeKey, …] }   — one upfront fetch; the
//                                 hasQuotes() gate + the headline numbers. Replaces existence.json.
//   rhymed/{key}.json           { word: { rhymeWord: { q: [≤PAGE quotes], n: total } } }
//                                 TIER 1 — loaded on search. Top-K per rhyme, artist-diversified,
//                                 favorites surfaced. `n` is the honest pair count (word↔rhymeWord).
//   rhymed-more/{key}.json      { word: { rhymeWord: [overflow quotes] } }
//                                 TIER 2 — lazy, on "show N more". Client paginates PAGE at a time.
//   not-rhymed/{key}.json       { word: [quotes] }
//                                 TIER 3 — opt-in "inspiration" layer (off by default).
//
// NOTHING is capped. Every deduped quote is preserved across the three tiers.
// First-paint latency is bounded by PAGE, independent of corpus size — so the
// corpus can grow freely (backend + build-time cost, not user latency).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rhymeKeyOf } from "../rhyme-finder/src/rhymeClassifier.js";
import { normalizePhonemes } from "../rhyme-finder/src/pronunciation.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const LIB = path.join(ROOT, "wordlists/lyric-library");
const CMU_PATH = path.join(ROOT, "wordlists/cmu-dict.json");
const OVR_PATH = path.join(ROOT, "wordlists/cmu-overrides.json");
const CURATED = path.join(ROOT, "lyric-library/curated/songs.jsonl");

const PAGE = 5; // top-K per rhyme in tier 1 (= client pagination size)
const TIER_WEIGHT = { mirror: 2, canon: 1, stretch: 0 }; // favorite-artist preference
const LEN_MIN = 15, LEN_LO = 18, LEN_HI = 64; // display-length sweet spot

// ── pronunciation (apply overrides last) ─────────────────────────────
const cmu = JSON.parse(fs.readFileSync(CMU_PATH, "utf8"));
const ovr = JSON.parse(fs.readFileSync(OVR_PATH, "utf8"));
const PRON = new Map();
for (const w in cmu) PRON.set(w, normalizePhonemes(cmu[w]).split(" "));
for (const w in ovr) if (!w.startsWith("_")) PRON.set(w.toLowerCase(), normalizePhonemes(ovr[w]).split(" "));

// ── artist → favorite tier (mirror/canon/stretch) ────────────────────
const norm = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const tierOf = new Map();
for (const line of fs.readFileSync(CURATED, "utf8").split("\n")) {
  const t = line.trim(); if (!t) continue;
  try { const e = JSON.parse(t); if (e.artist && e.tier) tierOf.set(norm(e.artist), TIER_WEIGHT[e.tier] ?? 0); } catch {}
}
const tierWeight = (q) => tierOf.get(norm(q.credit)) ?? 0;

// ── quote scoring + artist diversity ─────────────────────────────────
const displayLen = (line) => (line ?? "").replace(/…$/u, "").trim().length;
function score(q) {
  let s = 0;
  if (q.partner?.type === "perfect") s += 1.5;       // perfect rhyme > assonance
  const L = displayLen(q.line);
  if (L < LEN_MIN) s -= 3; else if (L >= LEN_LO && L <= LEN_HI) s += 1; // readable length
  if (q._songOrder < 10) s += 0.5;                   // popular song — mild
  s += tierWeight(q);                                // favorite artist — surfaced first
  return s;
}
// Round-robin by artist: any prefix (esp. the first PAGE) spans distinct
// artists, while favorites (higher score → their best lands earlier) lead.
// Avoids "all 5 are Roger Waters" while still preferring him.
function diversify(quotes) {
  const byArtist = new Map();
  for (const q of quotes) {
    if (!byArtist.has(q.artist)) byArtist.set(q.artist, []);
    byArtist.get(q.artist).push(q);
  }
  for (const g of byArtist.values()) g.sort((a, b) => b._s - a._s);
  const groups = [...byArtist.values()].sort((a, b) => b[0]._s - a[0]._s);
  const out = [];
  for (let round = 0; ; round++) {
    let any = false;
    for (const g of groups) if (g[round]) { out.push(g[round]); any = true; }
    if (!any) break;
  }
  return out;
}
const strip = (q) => { const { _songOrder, _s, ...rest } = q; return rest; };

// ── walk per-letter index, build the three tiers ─────────────────────
const letterFiles = fs.readdirSync(LIB).filter((f) => /^[a-z_]\.json$/u.test(f));
const rhymed = new Map();     // key → { word: { rhymeWord: {q, n} } }
const rhymedMore = new Map(); // key → { word: { rhymeWord: [overflow] } }
const notRhymed = new Map();  // key → { word: [quotes] }
const counts = {};            // word → [appearances, rhymed, notRhymed, rhymeWords]
const pairs = {};             // word → { rhymeWord: n }  (pair counts, for first-paint badges with NO bucket fetch)
let dropped = 0;

function put(map, key, word, val) {
  if (!map.has(key)) map.set(key, {});
  map.get(key)[word] = val;
}

for (const f of letterFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(LIB, f), "utf8"));
  for (const [word, quotes] of Object.entries(data)) {
    const phon = PRON.get(word.toLowerCase());
    const key = phon ? rhymeKeyOf(phon) : null;
    if (!key) { dropped++; continue; }

    const partnered = [], alone = [];
    for (const q of quotes) (q.partner ? partnered : alone).push(q);

    // group partnered by rhyme word
    const byRhyme = new Map();
    for (const q of partnered) {
      const rw = q.partner.word;
      if (!byRhyme.has(rw)) byRhyme.set(rw, []);
      byRhyme.get(rw).push(q);
    }

    const page = {}, more = {};
    for (const [rw, arr] of byRhyme) {
      for (const q of arr) q._s = score(q);
      const ordered = diversify(arr);
      page[rw] = { q: ordered.slice(0, PAGE).map(strip), n: ordered.length };
      if (ordered.length > PAGE) more[rw] = ordered.slice(PAGE).map(strip);
    }
    if (Object.keys(page).length) {
      put(rhymed, key, word, page);
      const pm = {};
      for (const rw in page) pm[rw] = page[rw].n; // pair total (n), no quotes
      pairs[word] = pm;
    }
    if (Object.keys(more).length) put(rhymedMore, key, word, more);

    if (alone.length) {
      for (const q of alone) q._s = score(q);
      put(notRhymed, key, word, diversify(alone).map(strip));
    }

    counts[word] = [quotes.length, partnered.length, alone.length, byRhyme.size];
  }
}

// ── write tiers ──────────────────────────────────────────────────────
function writeDir(name, map) {
  const dir = path.join(LIB, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  let bytes = 0, biggest = ["", 0];
  for (const [key, obj] of map) {
    const json = JSON.stringify(obj);
    fs.writeFileSync(path.join(dir, `${key}.json`), json);
    bytes += json.length;
    if (json.length > biggest[1]) biggest = [key, json.length];
  }
  return { files: map.size, bytes, biggest };
}
const r = writeDir("rhymed", rhymed);
const rm = writeDir("rhymed-more", rhymedMore);
const nr = writeDir("not-rhymed", notRhymed);

// index.json (sorted for stable diffs). `buckets` lists which rhyme keys have
// a file in each tier, so the client can gate fetches (no 404s for keys with
// no corpus presence).
const sortedWords = {};
for (const w of Object.keys(counts).sort()) sortedWords[w] = counts[w];
const sortedPairs = {};
for (const w of Object.keys(pairs).sort()) sortedPairs[w] = pairs[w];
const index = {
  words: sortedWords,
  pairs: sortedPairs, // word → {rhymeWord: n} — lets first paint show badges with no bucket fetch
  buckets: { rhymed: [...rhymed.keys()].sort(), notRhymed: [...notRhymed.keys()].sort() },
};
fs.writeFileSync(path.join(LIB, "index.json"), JSON.stringify(index));

// remove superseded artifacts
for (const old of ["buckets", "existence.json"]) {
  const p = path.join(LIB, old);
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true });
}

// ── report ───────────────────────────────────────────────────────────
const MB = (b) => (b / 1024 / 1024).toFixed(2) + " MB";
const KB = (b) => (b / 1024).toFixed(0) + " KB";
const idxBytes = fs.statSync(path.join(LIB, "index.json")).size;
console.log(`Words indexed: ${Object.keys(counts).length} | dropped (no CMU/key): ${dropped}`);
console.log(`index.json: ${KB(idxBytes)}`);
console.log(`TIER 1 rhymed/      : ${r.files} files, ${MB(r.bytes)} — biggest ${r.biggest[0]} ${KB(r.biggest[1])}  ← first-paint load`);
console.log(`TIER 2 rhymed-more/ : ${rm.files} files, ${MB(rm.bytes)} — biggest ${rm.biggest[0]} ${KB(rm.biggest[1])}  (lazy)`);
console.log(`TIER 3 not-rhymed/  : ${nr.files} files, ${MB(nr.bytes)} — biggest ${nr.biggest[0]} ${KB(nr.biggest[1])}  (opt-in)`);
