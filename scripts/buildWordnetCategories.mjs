// Rebuild rhyme-finder/wordlists/wordnet-categories.json from WordNet data.
//
// The file carries ONE axis: proper name vs common word. Not semantic
// domain, not familiarity. See rhyme-finder/LEX-TAXONOMY-PLAN.md for the
// audit that killed the old design; the short version:
//
//   • WordNet's lexname is unreliable for proper names — venus/vanessa
//     carry clam/butterfly-genus senses, so a "dominant lexname" vote
//     called them science words; colorado/africa came out as objects.
//   • The old "any corpus word is common" override swallowed 1097 real
//     proper names (madonna, cuba), so the Names/Places chips couldn't
//     hide them.
//   • Familiarity (nitrogen vs telomere) is a continuum the ranking
//     system already handles (lyricScore → "show more"). It is not a chip.
//
// The reliable signals are per-SENSE capitalization (WordNet capitalizes
// proper-noun senses) and the `@i` instance-hypernym pointer. A lemma is
// "truly proper" only when EVERY sense is capitalized-or-instance; one
// lowercase non-instance sense means it has an ordinary use (baker the
// occupation alongside Baker the surname → common).
//
//   common  — verbs / adjectives / adverbs + any noun with a common sense.
//             Includes ordinary nature words (nitrogen, mongoose) and
//             obscure ones (telomere, feldspar) — ranking sinks those.
//   name    — truly proper + has a noun.person sense (people, deities,
//             nationalities).
//   place   — truly proper + has a noun.location sense.
//   proper  — every other truly-proper lemma: brands, organizations,
//             acronyms, mythological objects, religions, languages, works.
//   (dropped) — Latin taxonomic genera: truly proper, every sense in
//             {animal, plant, substance}, absent from both frequency
//             sources. abies/accipiter/pseudomonas are dictionary residue,
//             not candidates. Dropping them from this file removes them
//             from rhymeFinder's candidate pool (it doubles as the
//             real-word gate).
//
// Output: { common: [...], name: [...], place: [...], proper: [...] }

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import wndb from "wordnet-db";

// WordNet lex_filenum values. Full list is in WordNet's lexnames file.
const PERSON_LEX = 18; // noun.person
const PLACE_LEX = 15; // noun.location
// The three lexnames a Latin genus name can live in. noun.body (8) is
// deliberately absent — no taxon lands there, and every body-part word is
// a common word anyway.
const TAXON_LEX = new Set([
  5, // noun.animal
  20, // noun.plant
  27, // noun.substance
]);

// Calendar words are proper nouns that sing like common ones ("September",
// "Sunday morning", "December"). A closed, hand-checked set — the one
// hardcoded list this classifier gets.
const CALENDAR = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "spring", "summer", "autumn", "fall", "winter",
  "christmas", "xmas", "easter", "halloween", "thanksgiving", "hanukkah",
  "passover", "ramadan", "noel", "yule", "sabbath", "advent", "lent",
]);

// person ∩ location overlaps default to `place` (see §6 decision 1 of the
// plan: among the 46 frequent overlaps the states and cities dominate).
// These are the ones a songwriter means as a person. washington / lincoln /
// monroe / madison / jackson stay Places — the city reading is at least as
// strong as the surname.
const NAME_OVERRIDE = new Set([
  "kennedy", "hamilton", "clinton", "lawrence", "victoria",
  "constantine", "judah", "molotov", "sherman", "tyler",
]);

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");

// Parse data.{noun,verb,adj,adv} into lemma → [{cap, instance, lex}].
// CRITICAL: keep the original casing of each sense's lemma. The old
// builder lowercased on the way in, which threw away the single most
// reliable proper-name signal in the whole file.
function parseSenses(text) {
  const lemmaToSenses = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(" ") || line.startsWith("/")) continue;
    const head = line.split(" | ")[0];
    const parts = head.split(/\s+/u);
    if (parts.length < 5) continue;
    const lex = parseInt(parts[1], 10);
    const wCnt = parseInt(parts[3], 16);
    if (Number.isNaN(wCnt)) continue;
    const instance = / @i /u.test(` ${head} `);
    for (let i = 0; i < wCnt; i += 1) {
      const raw = parts[4 + i * 2];
      if (!raw) continue;
      if (raw.includes("_")) continue; // skip multi-word lemmas
      const cap = raw[0] !== raw[0].toLowerCase();
      const word = raw.toLowerCase();
      if (!lemmaToSenses.has(word)) lemmaToSenses.set(word, []);
      lemmaToSenses.get(word).push({ cap, instance, lex });
    }
  }
  return lemmaToSenses;
}

console.log("Reading data.noun…");
const nounSenses = parseSenses(readFileSync(join(wndb.path, "data.noun"), "utf8"));
console.log(`  ${nounSenses.size} noun lemmas`);

console.log("Reading data.verb / data.adj / data.adv…");
const verbAdjAdvWords = new Set();
for (const f of ["data.verb", "data.adj", "data.adv"]) {
  for (const k of parseSenses(readFileSync(join(wndb.path, f), "utf8")).keys()) {
    verbAdjAdvWords.add(k);
  }
}
console.log(`  ${verbAdjAdvWords.size} verb/adj/adv lemmas`);

console.log("Loading frequency sources (top-10k, lyric corpus)…");
const top10k = readFileSync(
  join(REPO, "rhyme-finder", "wordlists", "common-10k.txt"), "utf8",
).split(/\r?\n/u).filter(Boolean).map((w) => w.toLowerCase());
const top10kSet = new Set(top10k);
// Mirrors lyricScore()'s rank<7000 cutoff in rhymeFinder.js — past that the
// top-10k tail is noisy enough that we don't call a word familiar.
const top7k = new Set(top10k.slice(0, 7000));
const lyricFreq = JSON.parse(
  readFileSync(join(REPO, "wordlists", "lyric-frequency.json"), "utf8"),
);
const lyricWords = new Set(Object.keys(lyricFreq));

// Only ever used to rescue a taxon-shaped lemma that a real corpus attests
// (§5: never to decide common vs proper).
const familiar = (w) => lyricWords.has(w) || top7k.has(w);

const DROP = Symbol("drop");

function classify(word) {
  if (verbAdjAdvWords.has(word)) return "common";
  const senses = nounSenses.get(word);
  if (!senses || senses.length === 0) {
    // No WordNet entry at all. Corpus attestation makes it a real word
    // (gonna, ok) — and a common one. Otherwise it isn't a word.
    return top10kSet.has(word) || lyricWords.has(word) ? "common" : null;
  }
  if (senses.some((s) => !s.cap && !s.instance)) return "common";
  // ── from here: truly proper (every sense capitalized or an instance) ──
  if (senses.every((s) => TAXON_LEX.has(s.lex)) && !familiar(word)) return DROP;
  if (CALENDAR.has(word)) return "common";
  if (NAME_OVERRIDE.has(word)) return "name";
  if (senses.some((s) => s.lex === PLACE_LEX)) return "place";
  if (senses.some((s) => s.lex === PERSON_LEX)) return "name";
  return "proper";
}

const buckets = { common: [], name: [], place: [], proper: [] };
const allLemmas = new Set([
  ...nounSenses.keys(), ...verbAdjAdvWords, ...top10kSet, ...lyricWords,
]);

const TOKEN_OK = /^[a-z][a-z'\-]*$/u;
let dropped = 0;
for (const word of allLemmas) {
  if (!TOKEN_OK.test(word)) continue;
  const lex = classify(word);
  if (lex === DROP) { dropped += 1; continue; }
  if (!lex) continue;
  buckets[lex].push(word);
}

for (const k of Object.keys(buckets)) buckets[k].sort();

console.log("\nResult:");
const total = Object.values(buckets).reduce((s, arr) => s + arr.length, 0);
for (const [k, v] of Object.entries(buckets)) {
  const pct = ((v.length / total) * 100).toFixed(1);
  console.log(`  ${k.padEnd(8)} ${String(v.length).padStart(6)}  (${pct}%)`);
}
console.log(`  ${"total".padEnd(8)} ${String(total).padStart(6)}`);
console.log(`  ${"dropped".padEnd(8)} ${String(dropped).padStart(6)}  (latin taxa)`);

const outPath = join(REPO, "rhyme-finder", "wordlists", "wordnet-categories.json");
const json = JSON.stringify(buckets);
writeFileSync(outPath, json);
console.log(`\nWrote ${outPath} (${(json.length / 1024).toFixed(1)} KB)`);

console.log("\nSpot checks:");
const lexOf = (w) => {
  for (const [k, v] of Object.entries(buckets)) if (v.includes(w)) return k;
  return "(absent)";
};
for (const w of [
  "madonna", "cuba", "baker", "venus", "monday", "dane", "nitrogen",
  "feldspar", "telomere", "fbi", "tylenol", "abies", "borough", "mongoose",
  "paris", "kennedy",
]) console.log(`  ${w.padEnd(10)} → ${lexOf(w)}`);
