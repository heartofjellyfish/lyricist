// Lyric Library loader — tiered model (May 2026 redesign).
//
// Storage layout (built by scripts/buildLyricBuckets.mjs):
//   index.json
//       { words: { word: [appearances, rhymed, notRhymed, rhymeWords] },
//         buckets: { rhymed: [key…], notRhymed: [key…] } }
//       Loaded once on init. Drives the sync hasQuotes() gate, the headline
//       counts, and the fetch presence-gate (no 404s for empty keys).
//
//   rhymed/{rhymeKey}.json        TIER 1 — { word: { rhymeWord: { q: [≤5 quotes], n } } }
//       Loaded on search. Top-K per rhyme (artist-diverse, favorites first).
//       `n` is the honest pair count (word↔rhymeWord across the corpus).
//   rhymed-more/{rhymeKey}.json   TIER 2 — { word: { rhymeWord: [overflow quotes] } }
//       Lazy, on "show N more". Paginated client-side.
//   not-rhymed/{rhymeKey}.json    TIER 3 — { word: [quotes] }
//       Opt-in "inspiration" layer (off by default).
//
// Each quote: { artist, credit, song, songTitle, year, line, lineIdx,
//   section_label, partner?, surface, position,
//   stanza?+stanzaLineIdx? (real verse) | linePrev?+lineNext? (giant fallback) }

import { PRONUNCIATION_MAP } from "./pronunciation.js";
import { rhymeKeyOf } from "./rhymeClassifier.js";

const INDEX_URL = new URL("../../wordlists/lyric-library/index.json", import.meta.url);
const RHYMED_BASE = new URL("../../wordlists/lyric-library/rhymed/", import.meta.url);
const MORE_BASE = new URL("../../wordlists/lyric-library/rhymed-more/", import.meta.url);
const NOT_RHYMED_BASE = new URL("../../wordlists/lyric-library/not-rhymed/", import.meta.url);

const PAGE = 5; // matches the build's per-rhyme tier-1 size

let words = null;             // Map<string, number[]>  (word → counts)
let pairsByWord = null;       // { word: { rhymeWord: n } }  (pair counts — first-paint badges, no fetch)
let rhymedKeys = null;        // Set<string>
let notRhymedKeys = null;     // Set<string>
let indexPromise = null;

const cache = { rhymed: new Map(), more: new Map(), notRhymed: new Map() };
const inflight = { rhymed: new Map(), more: new Map(), notRhymed: new Map() };

// ── Index (presence + counts) ────────────────────────────────────────
export function ensureExistence() {
  if (words) return Promise.resolve();
  if (indexPromise) return indexPromise;
  indexPromise = fetch(INDEX_URL)
    .then((r) => (r.ok ? r.json() : { words: {}, buckets: {} }))
    .catch(() => ({ words: {}, buckets: {} }))
    .then((obj) => {
      words = new Map(Object.entries(obj.words ?? {}));
      pairsByWord = obj.pairs ?? {};
      rhymedKeys = new Set(obj.buckets?.rhymed ?? []);
      notRhymedKeys = new Set(obj.buckets?.notRhymed ?? []);
    });
  return indexPromise;
}
export const ensureIndex = ensureExistence; // preferred new name

// Sync — false until the index loads (safe default: no badge/scaffold yet).
export function hasQuotes(word) {
  if (!words) return false;
  const w = word.toLowerCase();
  return words.has(w) || words.has(clientLemma(w));
}

// Headline numbers for a word, or null. { appearances, rhymed, notRhymed, rhymeWords }
export function getCounts(word) {
  if (!words) return null;
  const w = word.toLowerCase();
  const c = words.get(w) ?? words.get(clientLemma(w));
  if (!c) return null;
  return { appearances: c[0], rhymed: c[1], notRhymed: c[2], rhymeWords: c[3] };
}

// ── Tier fetch (cache + inflight, presence-gated) ────────────────────
function fetchTier(tier, base, presence, key) {
  const c = cache[tier];
  if (c.has(key)) return Promise.resolve(c.get(key));
  const inf = inflight[tier];
  if (inf.has(key)) return inf.get(key);
  if (presence && !presence.has(key)) { c.set(key, {}); return Promise.resolve({}); }
  const p = fetch(new URL(`${key}.json`, base))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((data) => { c.set(key, data); inf.delete(key); return data; });
  inf.set(key, p);
  return p;
}
const fetchRhymed = (key) => fetchTier("rhymed", RHYMED_BASE, rhymedKeys, key);
const fetchMore = (key) => fetchTier("more", MORE_BASE, rhymedKeys, key);
const fetchNotRhymed = (key) => fetchTier("notRhymed", NOT_RHYMED_BASE, notRhymedKeys, key);

function keyForWord(word) {
  const w = word.toLowerCase();
  const lemma = clientLemma(w);
  // Resolve the bucket key from the SAME corpus identity the index uses
  // (words.get(w) ?? words.get(lemma)). An inflected candidate with no entry
  // of its own — swirled, curled — is stored under its LEMMA, and the lemma's
  // rhyme key differs because the inflection changes the coda (swirl → ER1_L,
  // swirled → ER1_L_D). Keying off the surface word would fetch the ER1_L_D
  // bucket, which has no swirl data, and return zero quotes — while the badge
  // and popover header, resolved via the lemma, already promised N songs
  // (the "4 songs, 0 shown" popover bug). So when the surface word isn't a
  // corpus entry but its lemma is, key off the lemma.
  if (words && !words.has(w) && words.has(lemma)) {
    return rhymeKeyOf(PRONUNCIATION_MAP.get(lemma)) ?? rhymeKeyOf(PRONUNCIATION_MAP.get(w));
  }
  return (
    rhymeKeyOf(PRONUNCIATION_MAP.get(w)) ??
    rhymeKeyOf(PRONUNCIATION_MAP.get(lemma))
  );
}

// Resolve a word's entry inside a fetched tier object (surface or lemma key).
function entryOf(bucket, word) {
  const w = word.toLowerCase();
  return bucket[w] ?? bucket[clientLemma(w)] ?? null;
}

// ── Word's rhyme map: { rhymeWord: { q: [≤5], n } } (one tier-1 fetch) ──
// The source of pair counts (badges) AND the source-panel rhyme list.
export async function getRhymeMap(word) {
  const key = keyForWord(word);
  if (!key) return {};
  const bucket = await fetchRhymed(key);
  return entryOf(bucket, word) ?? {};
}

// Sync pair count word↔rhymeWord — read straight from index.json (loaded once
// at init), so first paint can show badges with NO bucket fetch. 0 if the pair
// has no corpus precedent. The honest, search-relative count.
export function pairCount(word, rhymeWord) {
  if (!pairsByWord) return 0;
  const w = word.toLowerCase();
  const m = pairsByWord[w] ?? pairsByWord[clientLemma(w)];
  return m?.[rhymeWord] ?? 0;
}

// ── Compat: flat quote[] for a word (top-K across its rhymes) ─────────
// Lets the legacy popover keep working until main.js adopts the pair API.
export async function getQuotes(word) {
  const entry = await getRhymeMap(word);
  const out = [];
  for (const rw in entry) for (const q of entry[rw].q) out.push(q);
  return out;
}

// ── Paginated quotes for ONE pair (tier-1 then lazy tier-2 overflow) ──
export async function getPairQuotes(word, rhymeWord, page = 0, pageSize = PAGE) {
  const key = keyForWord(word);
  if (!key) return { quotes: [], total: 0, hasMore: false };
  const entry = entryOf(await fetchRhymed(key), word);
  const pair = entry?.[rhymeWord];
  if (!pair) return { quotes: [], total: 0, hasMore: false };
  const total = pair.n;
  let all = pair.q;
  // Pull tier-2 overflow only once we page past what tier-1 holds.
  if (total > all.length && (page + 1) * pageSize > all.length) {
    const overflow = entryOf(await fetchMore(key), word)?.[rhymeWord] ?? [];
    all = pair.q.concat(overflow);
  }
  const start = page * pageSize;
  return { quotes: all.slice(start, start + pageSize), total, hasMore: start + pageSize < total };
}

// ── Not-rhymed "inspiration" uses for a word (opt-in tier 3) ──────────
export async function getNotRhymed(word) {
  const key = keyForWord(word);
  if (!key || (notRhymedKeys && !notRhymedKeys.has(key))) return [];
  return entryOf(await fetchNotRhymed(key), word) ?? [];
}

// ── Prefetch tier-1 buckets for a set of words (warm the cache) ───────
export function prefetchBucketsFor(words_) {
  const keys = new Set();
  for (const w of words_) { const k = keyForWord(w); if (k) keys.add(k); }
  return Promise.all([...keys].map(fetchRhymed));
}

// Per-word bucket key (for grouping DOM by bucket).
export const bucketKeyFor = (word) => keyForWord(word);

// Lightweight lemmatizer — same suffix collapses build-index.mjs uses.
function clientLemma(w) {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  return w;
}
