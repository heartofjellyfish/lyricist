// Build phonetically-sharded lyric-library buckets for Rhyme Finder.
//
// INPUT  — wordlists/lyric-library/{a..z,_}.json   (per-letter source index,
//          produced by lyric-library/scripts/build-index.mjs)
// OUTPUT — wordlists/lyric-library/buckets/{rhymeKey}.json  (one per rhyme key)
//          wordlists/lyric-library/existence.json            (flat array of
//                                                            words with quotes)
//
// Bucket key = phonemes from the last stressed vowel onward, joined by "_"
// (so "future" → F Y UW1 CH ER0 → "UW1_CH_ER0"). Two words share a bucket
// iff they are perfect rhymes by Pattison's definition. The client looks up
// the bucket the same way at runtime via rhymeKeyOf() in rhymeClassifier.js
// — single source of truth.
//
// Words without a CMU pronunciation (proper nouns, foreign words, etc.) are
// dropped: the classifier can't surface them as candidates either way, so
// keeping them would only bloat the deploy. The build prints a summary so
// you can audit which words got pruned.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rhymeKeyOf } from "../rhyme-finder/src/rhymeClassifier.js";
import { normalizePhonemes } from "../rhyme-finder/src/pronunciation.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const LIB_DIR = path.join(ROOT, "wordlists/lyric-library");
const OUT_DIR = path.join(LIB_DIR, "buckets");
const EXISTENCE_PATH = path.join(LIB_DIR, "existence.json");
const CMU_PATH = path.join(ROOT, "wordlists/cmu-dict.json");
const OVERRIDES_PATH = path.join(ROOT, "wordlists/cmu-overrides.json");

// ── Load CMU dict (apply overrides) ──────────────────────────────────
const cmu = JSON.parse(fs.readFileSync(CMU_PATH, "utf8"));
const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"));
const PRON = new Map();
for (const w in cmu) PRON.set(w, normalizePhonemes(cmu[w]).split(" "));
for (const w in overrides) {
  if (w.startsWith("_")) continue;
  PRON.set(w.toLowerCase(), normalizePhonemes(overrides[w]).split(" "));
}

// ── Walk the per-letter source index ─────────────────────────────────
const letterFiles = fs
  .readdirSync(LIB_DIR)
  .filter((f) => /^[a-z_]\.json$/u.test(f));

const buckets = new Map(); // rhymeKey -> { word: quote[] }
const existence = []; // words that survived the rhyme-key filter
const dropped = []; // {word, reason}

for (const file of letterFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(LIB_DIR, file), "utf8"));
  for (const [word, quotes] of Object.entries(data)) {
    const phonemes = PRON.get(word.toLowerCase());
    if (!phonemes) {
      dropped.push({ word, reason: "no-cmu" });
      continue;
    }
    const key = rhymeKeyOf(phonemes);
    if (!key) {
      dropped.push({ word, reason: "no-stressed-vowel" });
      continue;
    }
    if (!buckets.has(key)) buckets.set(key, {});
    buckets.get(key)[word] = quotes;
    existence.push(word);
  }
}

// ── Write buckets ────────────────────────────────────────────────────
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [key, bucket] of buckets) {
  fs.writeFileSync(path.join(OUT_DIR, `${key}.json`), JSON.stringify(bucket));
}

// Sort both lists for stable diffs across builds (set semantics on the client).
// `buckets` is the set of rhyme keys that have at least one corpus word — the
// client uses it to gate bucket fetches so candidates whose rhyme key has no
// corpus presence don't trigger 404s.
existence.sort();
const bucketKeysSorted = [...buckets.keys()].sort();
fs.writeFileSync(
  EXISTENCE_PATH,
  JSON.stringify({ words: existence, buckets: bucketKeysSorted }),
);

// ── Report ───────────────────────────────────────────────────────────
const sizes = [...buckets.values()].map((b) => Object.keys(b).length).sort((a, b) => b - a);
const totalBytes = [...fs.readdirSync(OUT_DIR)].reduce(
  (n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size,
  0,
);
console.log(`Built ${buckets.size} buckets, ${existence.length} words indexed.`);
console.log(
  `Dropped ${dropped.length} words (no CMU pronunciation or no stressed vowel).`,
);
console.log(`Bucket size — max ${sizes[0]} words, median ${sizes[Math.floor(sizes.length / 2)]}.`);
console.log(`Total bucket bytes (raw JSON): ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Existence index: ${(fs.statSync(EXISTENCE_PATH).size / 1024).toFixed(1)} KB`);
