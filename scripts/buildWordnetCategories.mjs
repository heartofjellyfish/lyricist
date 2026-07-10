// Rebuild rhyme-finder/wordlists/wordnet-categories.json from WordNet data.
//
// The file carries ONE axis: proper name vs common word. Not semantic domain,
// not familiarity. See rhyme-finder/LEX-TAXONOMY-PLAN.md for the audit that
// killed the old design; the short version:
//
//   • WordNet's lexname is unreliable for proper names — venus/vanessa carry
//     clam/butterfly-genus senses, so a "dominant lexname" vote called them
//     science words; colorado/africa came out as objects.
//   • The old "any corpus word is common" override swallowed 1097 real proper
//     names (madonna, cuba), so the Names/Places chips couldn't hide them.
//   • Familiarity (nitrogen vs telomere) is a continuum the ranking system
//     already handles (lyricScore → "show more"). It is not a chip.
//
// The reliable signals are per-SENSE capitalization (WordNet capitalizes
// proper-noun senses) and the `@i` instance-hypernym pointer. A lemma is
// "truly proper" only when EVERY sense is capitalized-or-instance; one
// lowercase non-instance sense means it has an ordinary use (baker the
// occupation alongside Baker the surname → common).
//
//   common  — verbs / adjectives / adverbs + any noun with a common sense.
//             Includes ordinary nature words (nitrogen, mongoose) and obscure
//             ones (telomere, feldspar) — ranking sinks those, not a chip.
//   place   — cities, countries, regions, and the landform instances WordNet
//             files under noun.object rather than noun.location (africa, asia,
//             the alps, everest). Told apart from celestial instances
//             (betelgeuse, cygnus) by the instance hypernym. Accepted
//             casualty: logan, a first name that is also Mount Logan and
//             carries no WordNet person sense to outvote it.
//   name    — every other proper name: people, deities, nationalities, brands,
//             organizations, acronyms, mythology, languages, works.
//   (dropped) — Latin taxonomic genera, and two-letter proper tokens (chemical
//             symbols, initials, abbreviations). Dictionary residue, not
//             candidates. Dropping them from this file removes them from
//             rhymeFinder's candidate pool (it doubles as the real-word gate).
//
// ── Where WordNet lacks the common word, and what we do about it ──
// WordNet has no pronouns, no auxiliaries, no interjections, and no inflected
// forms. So a lemma whose ONLY noun sense is a capitalized homograph looks
// "truly proper" even when the lowercase string is an everyday word: IT (info
// tech) vs it, WHO (the agency) vs who, LED vs led, Sat vs sat, Laws (the
// dialogue) vs laws. Frequency cannot separate these from real names — fbi,
// cia and dna sit in the same top-7k band as it, who and am. What separates
// them is FORM: it/who/am are closed-class words, and laws/led/sat are
// inflections of common lemmas. Both are decidable, so both get a rescue.
//
// Output: { common: [...], name: [...], place: [...], display: {word: Spelling} }

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import wndb from "wordnet-db";

// WordNet lex_filenum values. Full list is in WordNet's lexnames file.
const PLACE_LEX = 15; // noun.location
const PERSON_LEX = 18; // noun.person
// The three lexnames a Latin genus name can live in. noun.body (8) is
// deliberately absent — no taxon lands there, and every body-part word is a
// common word anyway.
const TAXON_LEX = new Set([5 /* animal */, 20 /* plant */, 27 /* substance */]);

// An `@i` instance whose hypernym is one of these is a place on Earth. Without
// it, africa / europe / asia / the alps / everest all missed the Places chip:
// WordNet files continents and mountains under noun.object, not noun.location.
//
// Two neighbouring kinds are deliberately absent. The SKY (constellation,
// star, planet, asteroid, galaxy, moon, crater) shares the same pointer and
// stays in Names — betelgeuse is not a place. And so does WATER (river, lake,
// bay, strait): rivers are named after people, so every familiar hydrographic
// instance is really a surname — charles, james, hudson, clyde, lena, murray,
// chang. The ones that are genuinely places (kansas, jordan) carry a
// noun.location sense of their own and never reach this test.
const GEO_HYPERNYM = new Set([
  "mountain_peak", "mountain", "hill", "range", "massif", "ridge", "pass",
  "promontory", "cape", "peninsula", "isthmus", "island", "isle",
  "archipelago", "continent", "valley", "rift_valley", "gorge", "canyon",
  "cave", "cavern", "tableland", "plateau", "prairie", "plain", "forest",
  "desert", "glacier", "Piedmont_glacier", "fault", "geological_formation",
  "land", "territory", "region", "country", "city", "town", "village",
]);

// Calendar words are proper nouns that sing like common ones ("September",
// "Sunday morning", "December"). A closed, hand-checked set.
const CALENDAR = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "spring", "summer", "autumn", "fall", "winter",
  "christmas", "xmas", "easter", "halloween", "thanksgiving", "hanukkah",
  "passover", "ramadan", "noel", "yule", "sabbath", "advent", "lent",
]);

// Lowercase readings WordNet has no entry for, so the word looks "truly
// proper" on the strength of a capitalized homograph alone. Each group is a
// class WordNet structurally excludes, not a list of exceptions we noticed.
const COMMON_HOMOGRAPHS = new Set([
  // Closed classes — pronouns, determiners, conjunctions, auxiliaries. WordNet
  // holds no such POS, only IT (info tech), WHO (the agency), AN, AM.
  "it", "me", "us", "who", "an", "or", "am", "isn", "mister",
  // Interjections and vocables, the stuff of choruses. Ha, Ho and Na exist
  // only as a laugh-in-a-novel, holmium and sodium.
  "oh", "ah", "ha", "er", "ho", "na", "la", "yay", "ew", "amen",
  // Irregular inflections. wordnet-db ships no noun.exc/verb.exc, so the
  // suffix-peeling rescue below can't reach these: they collide with SAT,
  // LED, ATE, the Fed, the Sung dynasty, Drew the surname.
  "ate", "sat", "led", "drew", "fed", "sung",
  // Orthography: a common noun WordNet spells with a capital.
  "t-shirt",
]);

// person ∩ location overlaps default to `place` (§6 decision 1: among the
// frequent overlaps the states and cities dominate). These are the ones a
// songwriter means as a person. washington / lincoln / monroe / madison /
// jackson stay Places — the city reading is at least as strong as the surname.
const NAME_OVERRIDE = new Set([
  "kennedy", "hamilton", "clinton", "lawrence", "victoria",
  "constantine", "judah", "molotov", "sherman", "tyler",
]);

// WordNet's only sense of `sam` is SAM, the surface-to-air missile, so the
// spelling it hands us shouts. In a rhyme list the reader means the name.
const DISPLAY_OVERRIDE = { sam: "Sam" };

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");

// ── Parse data.* into lemma → [{raw, cap, instance, hypernym, lex}] ──
// CRITICAL: keep the original casing of each sense's lemma. The old builder
// lowercased on the way in, which threw away the single most reliable
// proper-name signal in the file.
function parseSenses(text) {
  const lines = text.split("\n");
  const headWord = new Map(); // synset offset → its first lemma
  for (const line of lines) {
    if (!line || line.startsWith(" ") || line.startsWith("/")) continue;
    const parts = line.split(" | ")[0].split(/\s+/u);
    if (parts.length < 5) continue;
    if (Number.isNaN(parseInt(parts[3], 16))) continue;
    headWord.set(parts[0], parts[4]);
  }

  const lemmaToSenses = new Map();
  for (const line of lines) {
    if (!line || line.startsWith(" ") || line.startsWith("/")) continue;
    const head = line.split(" | ")[0];
    const parts = head.split(/\s+/u);
    if (parts.length < 5) continue;
    const lex = parseInt(parts[1], 10);
    const wCnt = parseInt(parts[3], 16);
    if (Number.isNaN(wCnt)) continue;

    // Pointers follow the word list: p_cnt, then (symbol offset pos src/tgt)*.
    // `@i` is the instance hypernym — "this synset is a named entity of kind X".
    const pCnt = parseInt(parts[4 + wCnt * 2], 10);
    let hypernym = null;
    for (let i = 0; i < (Number.isNaN(pCnt) ? 0 : pCnt); i += 1) {
      const b = 5 + wCnt * 2 + i * 4;
      if (parts[b] === "@i") { hypernym = headWord.get(parts[b + 1]) ?? null; break; }
    }

    for (let i = 0; i < wCnt; i += 1) {
      const raw = parts[4 + i * 2];
      if (!raw) continue;
      if (raw.includes("_")) continue; // skip multi-word lemmas
      const word = raw.toLowerCase();
      if (!lemmaToSenses.has(word)) lemmaToSenses.set(word, []);
      lemmaToSenses.get(word).push({
        raw, lex, hypernym,
        cap: raw[0] !== raw[0].toLowerCase(),
        instance: hypernym !== null,
      });
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
// (§5: never to decide common vs proper — frequency cannot tell fbi from it).
const familiar = (w) => lyricWords.has(w) || top7k.has(w);

const TOKEN_OK = /^[a-z][a-z'\-]*$/u;
const allLemmas = [...new Set([
  ...nounSenses.keys(), ...verbAdjAdvWords, ...top10kSet, ...lyricWords,
])].filter((w) => TOKEN_OK.test(w));

const trulyProper = (senses) => senses.every((s) => s.cap || s.instance);

// ── Pass 1: everything that is plainly a common word ──
// (No inflection rescue yet — that needs this set to already exist.)
const common = new Set();
for (const word of allLemmas) {
  const senses = nounSenses.get(word);
  if (verbAdjAdvWords.has(word)) { common.add(word); continue; }
  if (!senses || senses.length === 0) {
    // No WordNet entry at all. Corpus attestation makes it a real word
    // (gonna, ok) — and a common one.
    if (top10kSet.has(word) || lyricWords.has(word)) common.add(word);
    continue;
  }
  if (!trulyProper(senses)) { common.add(word); continue; }
  if (COMMON_HOMOGRAPHS.has(word) || CALENDAR.has(word)) common.add(word);
}

// A place name, whether WordNet files it under noun.location or hands it to
// noun.object with a geographic instance hypernym. Checked BEFORE the
// inflection rescue: `alps` peels to `alp`, `wales` to `wale`, and a rescue
// that outranked the place test would quietly empty the Places chip of them.
// A noun.location sense settles it (decision 1: location beats person). The
// geo-instance route is weaker and yields to a person sense — Mount Adams,
// Mount Logan and Mount Wilson are named after the men, and the men are who a
// lyric means. Africa, Asia and Europe carry no person sense and stay places.
const isPlace = (senses) =>
  senses.some((s) => s.lex === PLACE_LEX) ||
  (senses.some((s) => s.instance && GEO_HYPERNYM.has(s.hypernym)) &&
    !senses.some((s) => s.lex === PERSON_LEX));

// ── Pass 2: inflection rescue ──
// `laws` looks truly proper (Laws, the Platonic dialogue) but it is law + s.
// Peel the regular suffixes; the stem must itself be common — `judges` is
// rescued by judge, `stations` by station, while `hades` has no stem at all.
// (wordnet-db ships no noun.exc/verb.exc, so irregular pasts that collide with
// an acronym — sat/SAT, led/LED, ate/ATE — are listed in IRREGULAR_FORMS.)
function stemsOf(word) {
  const out = new Set();
  const strip = (suf, ...adds) => {
    if (!word.endsWith(suf) || word.length - suf.length < 3) return null;
    const base = word.slice(0, -suf.length);
    for (const a of ["", ...adds]) out.add(base + a);
    return base;
  };
  strip("s");
  // -es only attaches to a sibilant stem (buses, boxes, churches). Peel it
  // blind and `james` becomes jam, `abies` becomes ab — both walk into common.
  if (/(?:[sxz]|ch|sh)es$/u.test(word) && word.length > 4) out.add(word.slice(0, -2));
  strip("ies", "y");
  strip("ed", "e");
  strip("ing", "e");
  return out;
}
const rescued = [];
for (const word of allLemmas) {
  if (common.has(word)) continue;
  const senses = nounSenses.get(word);
  if (!senses || !trulyProper(senses) || isPlace(senses)) continue;
  for (const stem of stemsOf(word)) {
    if (common.has(stem)) { rescued.push(word); break; }
  }
}
for (const w of rescued) common.add(w);
console.log(`  ${rescued.length} inflection rescues (laws, sat, led, judges…)`);

// ── Pass 3: place the proper names, drop the residue ──
const DROP = Symbol("drop");

function classifyProper(word, senses) {
  // Latin genus names: every sense in {animal, plant, substance}, unattested
  // by either frequency source. Pure dictionary residue.
  if (senses.every((s) => TAXON_LEX.has(s.lex)) && !familiar(word)) return DROP;
  // Two-letter proper tokens are never words: chemical symbols (Ba, Se, Au),
  // initials (Al, Ed), romanization fragments (Wu, Ji, Yi), abbreviations
  // (WA, LF). The vocables that share this shape — oh, ha, ho, na — were
  // taken by COMMON_HOMOGRAPHS above, so nothing singable is lost here.
  if (word.length <= 2) return DROP;

  if (NAME_OVERRIDE.has(word)) return "name";
  if (isPlace(senses)) return "place";
  return "name";
}

// The spelling WordNet itself uses — Madonna, Cuba, FBI. Prefer the most
// frequent raw across senses; an all-caps spelling only wins if every sense
// agrees (so `Am`/`AM` doesn't turn the month-name into an acronym).
function displayOf(word, senses) {
  if (DISPLAY_OVERRIDE[word]) return DISPLAY_OVERRIDE[word];
  const tally = new Map();
  for (const s of senses) tally.set(s.raw, (tally.get(s.raw) ?? 0) + 1);
  const allCaps = senses.every((s) => s.raw === s.raw.toUpperCase());
  const ranked = [...tally].sort((a, b) => b[1] - a[1]);
  if (!allCaps) {
    const mixed = ranked.filter(([raw]) => raw !== raw.toUpperCase());
    if (mixed.length) return mixed[0][0];
  }
  return ranked[0][0];
}

const buckets = { common: [...common], name: [], place: [] };
const display = {};
let droppedTaxa = 0;
let droppedShort = 0;
for (const word of allLemmas) {
  if (common.has(word)) continue;
  const senses = nounSenses.get(word);
  if (!senses || senses.length === 0) continue;
  const lex = classifyProper(word, senses);
  if (lex === DROP) {
    if (word.length <= 2) droppedShort += 1;
    else droppedTaxa += 1;
    continue;
  }
  buckets[lex].push(word);
  const spelling = displayOf(word, senses);
  if (spelling !== word) display[word] = spelling;
}

for (const k of Object.keys(buckets)) buckets[k].sort();

console.log("\nResult:");
const total = Object.values(buckets).reduce((s, arr) => s + arr.length, 0);
for (const [k, v] of Object.entries(buckets)) {
  const pct = ((v.length / total) * 100).toFixed(1);
  console.log(`  ${k.padEnd(8)} ${String(v.length).padStart(6)}  (${pct}%)`);
}
console.log(`  ${"total".padEnd(8)} ${String(total).padStart(6)}`);
console.log(`  dropped: ${droppedTaxa} latin taxa, ${droppedShort} two-letter tokens`);
console.log(`  ${Object.keys(display).length} words carry a capitalized spelling`);

const outPath = join(REPO, "rhyme-finder", "wordlists", "wordnet-categories.json");
const json = JSON.stringify({ ...buckets, display });
writeFileSync(outPath, json);
console.log(`\nWrote ${outPath} (${(json.length / 1024).toFixed(1)} KB)`);

console.log("\nSpot checks:");
const lexOf = (w) => {
  for (const k of ["common", "name", "place"]) if (buckets[k].includes(w)) return k;
  return "(absent)";
};
for (const w of [
  "madonna", "cuba", "baker", "venus", "monday", "dane", "nitrogen", "feldspar",
  "telomere", "fbi", "tylenol", "abies", "borough", "mongoose", "paris",
  "kennedy", "africa", "alps", "betelgeuse", "it", "who", "laws", "sat", "ba",
]) console.log(`  ${w.padEnd(11)} → ${lexOf(w).padEnd(9)} ${display[w] ?? ""}`);
