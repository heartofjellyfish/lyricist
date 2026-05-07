// Rebuild rhyme-finder/wordlists/wordnet-categories.json from WordNet data.
// Replaces the flat wordnet-words.json with a four-bucket categorized list:
//
//   common  — verbs / adjectives / adverbs / common nouns. The default tier.
//   person  — first names, last names, and other person lemmas (noun.person).
//   place   — cities, countries, regions (noun.location).
//   science — substances, plants, animals, body parts (noun.substance/plant/
//             animal/body) — only when not already in top-10k or lyric corpus.
//
// Override rule: any lemma in top-10k spoken or lyric corpus is forced to
// "common" regardless of WordNet category — "cat" lives in noun.animal but
// it's a perfectly common word. Songwriters use it freely.
//
// Output: { common: [...], person: [...], place: [...], science: [...] }

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import wndb from "wordnet-db";

// WordNet lex_filenum values for the noun categories we care about.
// Full list is in WordNet's lexnames file. We only special-case four:
const PERSON_LEX = 18;  // noun.person
const PLACE_LEX = 15;   // noun.location
const SCIENCE_LEX = new Set([
  5,   // noun.animal
  8,   // noun.body
  20,  // noun.plant
  27,  // noun.substance
]);

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");

function parseWordnetData(text) {
  const lemmaToLex = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(" ") || line.startsWith("/")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;
    const lexFilenum = parseInt(parts[1], 10);
    const wCnt = parseInt(parts[3], 16);
    if (Number.isNaN(wCnt)) continue;
    for (let i = 0; i < wCnt; i += 1) {
      const raw = parts[4 + i * 2];
      if (!raw) continue;
      const word = raw.toLowerCase();
      if (word.includes("_")) continue; // skip multi-word lemmas
      if (!lemmaToLex.has(word)) lemmaToLex.set(word, new Set());
      lemmaToLex.get(word).add(lexFilenum);
    }
  }
  return lemmaToLex;
}

function classifyLemma(lexSet) {
  // If any synset is in a "common" noun category (anything not in
  // person/place/science), classify as common — the word has at least
  // one ordinary use (e.g., "miller" the occupation alongside "Miller"
  // the surname → common, the surname role is incidental).
  for (const lex of lexSet) {
    if (lex !== PERSON_LEX && lex !== PLACE_LEX && !SCIENCE_LEX.has(lex)) {
      return "common";
    }
  }
  // All synsets are in special categories. Pick the dominant one:
  if (lexSet.size === 1) {
    if (lexSet.has(PERSON_LEX)) return "person";
    if (lexSet.has(PLACE_LEX)) return "place";
  }
  // Mixed within special categories OR all in science
  if ([...lexSet].every((x) => SCIENCE_LEX.has(x))) return "science";
  // Mixed person+place+science — rare; default to common to be safe
  return "common";
}

console.log("Reading data.noun…");
const nounLex = parseWordnetData(readFileSync(join(wndb.path, "data.noun"), "utf8"));
console.log(`  ${nounLex.size} noun lemmas`);

console.log("Reading data.verb / data.adj / data.adv…");
const verbLex = parseWordnetData(readFileSync(join(wndb.path, "data.verb"), "utf8"));
const adjLex = parseWordnetData(readFileSync(join(wndb.path, "data.adj"), "utf8"));
const advLex = parseWordnetData(readFileSync(join(wndb.path, "data.adv"), "utf8"));
const verbAdjAdvWords = new Set([
  ...verbLex.keys(), ...adjLex.keys(), ...advLex.keys(),
]);
console.log(`  ${verbAdjAdvWords.size} verb/adj/adv lemmas`);

console.log("Loading override sources (top-10k, lyric corpus)…");
const top10k = new Set(
  readFileSync(join(REPO, "rhyme-finder", "wordlists", "common-10k.txt"), "utf8")
    .split(/\r?\n/u).filter(Boolean).map((w) => w.toLowerCase())
);
const lyricFreq = JSON.parse(readFileSync(join(REPO, "wordlists", "lyric-frequency.json"), "utf8"));
const lyricWords = new Set(Object.keys(lyricFreq));

const buckets = { common: [], person: [], place: [], science: [] };
const allLemmas = new Set([
  ...nounLex.keys(), ...verbAdjAdvWords, ...top10k, ...lyricWords,
]);

const TOKEN_OK = /^[a-z][a-z'\-]*$/u;
for (const word of allLemmas) {
  if (!TOKEN_OK.test(word)) continue;
  let lex;
  if (top10k.has(word) || lyricWords.has(word)) {
    lex = "common"; // corpus override
  } else if (verbAdjAdvWords.has(word)) {
    lex = "common";
  } else if (nounLex.has(word)) {
    lex = classifyLemma(nounLex.get(word));
  } else {
    continue;
  }
  buckets[lex].push(word);
}

for (const k of Object.keys(buckets)) buckets[k].sort();

console.log("\nResult:");
const total = Object.values(buckets).reduce((s, arr) => s + arr.length, 0);
for (const [k, v] of Object.entries(buckets)) {
  const pct = (v.length / total * 100).toFixed(1);
  console.log(`  ${k.padEnd(8)} ${String(v.length).padStart(6)}  (${pct}%)`);
}
console.log(`  ${"total".padEnd(8)} ${String(total).padStart(6)}`);

const outPath = join(REPO, "rhyme-finder", "wordlists", "wordnet-categories.json");
const json = JSON.stringify(buckets);
writeFileSync(outPath, json);
console.log(`\nWrote ${outPath} (${(json.length / 1024).toFixed(1)} KB)`);

// Sample a few entries from each non-common bucket to sanity check
console.log("\nSamples:");
for (const cat of ["person", "place", "science"]) {
  const sample = buckets[cat].slice(0, 15);
  console.log(`  ${cat}: ${sample.join(", ")}`);
}
