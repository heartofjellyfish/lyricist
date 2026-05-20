// Lyric Library loader — phonetic-bucket model (May 2026 redesign).
//
// Storage layout (built by scripts/buildLyricBuckets.mjs):
//   /wordlists/lyric-library/existence.json
//       Flat sorted array of every word that has at least one quote AND a
//       CMU pronunciation. ~120 KB raw / ~25 KB compressed. Loaded once on
//       page init, drives the `hasQuotes()` sync gate used for badges.
//
//   /wordlists/lyric-library/buckets/{rhymeKey}.json
//       Per-rhyme-key shard, format { word: quote[] }. Words sharing a
//       bucket are perfect rhymes — searches for "future" pull only the
//       handful of buckets matching the source word's tier; the rest of
//       the alphabet never touches the network.
//
// Each quote keeps the shape established in Phase 1.6:
//   { artist, credit, song, songTitle, year, surface,
//     line, linePrev, lineNext, lineIdx,
//     stanza: string[], stanzaLineIdx,
//     section_label, position, partner }

import { PRONUNCIATION_MAP } from "./pronunciation.js";
import { rhymeKeyOf } from "./rhymeClassifier.js";

const BUCKETS_BASE = new URL("../../wordlists/lyric-library/buckets/", import.meta.url);
const EXISTENCE_URL = new URL("../../wordlists/lyric-library/existence.json", import.meta.url);

let existenceSet = null; // Set<string> of words with quotes
let existentBuckets = null; // Set<string> of rhyme keys that have a bucket file
let existencePromise = null;
const bucketCache = new Map(); // key -> { word: quote[] }
const bucketInflight = new Map(); // key -> Promise

// ── Existence index ──────────────────────────────────────────────────
// existence.json shape: { words: string[], buckets: string[] }
//   words   — every word that has at least one corpus quote
//   buckets — every rhyme key with at least one bucket file (used to gate
//             fetches so candidates whose rhyme key has no corpus presence
//             don't trigger 404s)
export function ensureExistence() {
  if (existenceSet) return Promise.resolve();
  if (existencePromise) return existencePromise;
  existencePromise = fetch(EXISTENCE_URL)
    .then((r) => (r.ok ? r.json() : { words: [], buckets: [] }))
    .catch(() => ({ words: [], buckets: [] }))
    .then((obj) => {
      existenceSet = new Set(obj.words ?? []);
      existentBuckets = new Set(obj.buckets ?? []);
    });
  return existencePromise;
}

// Sync — only useful after ensureExistence() has resolved. Falls back to
// "false" before the index loads, which is the safe default (no spurious
// badge or popover scaffold until we actually know).
export function hasQuotes(word) {
  if (!existenceSet) return false;
  const w = word.toLowerCase();
  return existenceSet.has(w) || existenceSet.has(clientLemma(w));
}

// ── Bucket fetch ─────────────────────────────────────────────────────
function bucketKeyForWord(word) {
  const phonemes = PRONUNCIATION_MAP.get(word.toLowerCase());
  return rhymeKeyOf(phonemes);
}

function fetchBucket(key) {
  if (bucketCache.has(key)) return Promise.resolve(bucketCache.get(key));
  if (bucketInflight.has(key)) return bucketInflight.get(key);
  // Skip the network for rhyme keys with no corpus presence (the classifier
  // happily returns candidates like "futurist" whose key UW1_CH_ER0_IH0_S_T
  // matches nothing in the library — fetching would just 404).
  if (existentBuckets && !existentBuckets.has(key)) {
    bucketCache.set(key, {});
    return Promise.resolve({});
  }
  const p = fetch(new URL(`${key}.json`, BUCKETS_BASE))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((data) => {
      bucketCache.set(key, data);
      bucketInflight.delete(key);
      return data;
    });
  bucketInflight.set(key, p);
  return p;
}

// Async — returns the quotes for `word`, fetching its bucket if not cached.
// Tries the input word and its lemma in parallel (they may land in different
// buckets if the surface form has its own CMU entry).
export async function getQuotes(word) {
  const w = word.toLowerCase();
  const lemma = clientLemma(w);
  const keys = new Set();
  const kw = bucketKeyForWord(w);
  const kl = bucketKeyForWord(lemma);
  if (kw) keys.add(kw);
  if (kl) keys.add(kl);
  if (keys.size === 0) return [];
  await Promise.all([...keys].map(fetchBucket));
  // Index is keyed by lemma; surface form is a fallback for entries
  // that the build kept verbatim (rare — most quotes lemmatize).
  for (const k of keys) {
    const bucket = bucketCache.get(k) ?? {};
    const direct = bucket[w] ?? bucket[lemma];
    if (direct && direct.length) return direct;
  }
  return [];
}

// Bulk prefetch — fires off bucket fetches for every distinct bucket the
// given words land in, in parallel. Used to warm the cache for visible
// candidates before the user hovers. Resolves when all buckets are ready.
export function prefetchBucketsFor(words) {
  const keys = new Set();
  for (const w of words) {
    const wl = w.toLowerCase();
    const kw = bucketKeyForWord(wl);
    const kl = bucketKeyForWord(clientLemma(wl));
    if (kw) keys.add(kw);
    if (kl) keys.add(kl);
  }
  return Promise.all([...keys].map(fetchBucket));
}

// Per-word bucket key (exported so the caller can group DOM elements by
// bucket and re-decorate progressively as buckets resolve).
export function bucketKeyFor(word) {
  const w = word.toLowerCase();
  return bucketKeyForWord(w) ?? bucketKeyForWord(clientLemma(w));
}

// Lightweight lemmatizer — same suffix collapses that build-index.mjs uses
// upstream. If the input is itself a lemma the rules no-op.
function clientLemma(w) {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  return w;
}
