// Dogfood harness for RhymeZone comparison — dumps both the curated
// findRhymes output AND the raw "would-be" candidates that the score>0
// filter dropped, so we can see what the filter is throwing away.
//
// Usage:
//   node test/dogfood-rhymezone.mjs <word> [type]
//     dumps perfect (or specified type) bucket: kept + dropped-by-score, plus stats
//   node test/dogfood-rhymezone.mjs --json <word>
//     emits full per-bucket JSON
//
// Re-uses rhymeFinder.js by monkey-patching its internals via a module
// rebuild — easiest path is to reimplement the per-type pipeline here so
// we can introspect intermediate stages.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { classifyRhyme, analyzeWord } from "../rhyme-finder/src/rhymeClassifier.js";
import { PRONUNCIATION_MAP, deriveRhymeInfo, normalizePhonemes } from "../rhyme-finder/src/pronunciation.js";

const here = dirname(fileURLToPath(import.meta.url));
const wlRoot = join(here, "..", "wordlists");
const wlRf = join(here, "..", "rhyme-finder", "wordlists");

const dict = JSON.parse(readFileSync(join(wlRoot, "cmu-dict.json"), "utf8"));
for (const w in dict) PRONUNCIATION_MAP.set(w, normalizePhonemes(dict[w]).split(" "));
const overrides = JSON.parse(readFileSync(join(wlRoot, "cmu-overrides.json"), "utf8"));
for (const w in overrides) {
  if (w.startsWith("_")) continue;
  PRONUNCIATION_MAP.set(w.toLowerCase(), normalizePhonemes(overrides[w]).split(" "));
}

const wordnetArr = JSON.parse(readFileSync(join(wlRf, "wordnet-words.json"), "utf8"));
const commonText = readFileSync(join(wlRf, "common-10k.txt"), "utf8");
const lyricFreq = JSON.parse(readFileSync(join(wlRoot, "lyric-frequency.json"), "utf8"));

const REAL_WORDS = new Set(wordnetArr);
const COMMON_RANK = new Map();
commonText.split(/\r?\n/u).filter(Boolean).forEach((w, i) => {
  COMMON_RANK.set(w.toLowerCase(), i);
  REAL_WORDS.add(w.toLowerCase());
});
for (const w of Object.keys(lyricFreq)) REAL_WORDS.add(w);

const TOKEN_OK = /^[a-z][a-z\-]*$/u;
const SHORT_ALLOWED = new Set([
  "i","a","be","we","he","me","do","go","no","so","to","up","am","an","at","by",
  "in","is","it","my","of","or","us","if","as","on","ah","oh","ow","hi","ya","ye",
]);

function isWellFormedToken(word) {
  if (!TOKEN_OK.test(word)) return false;
  if (word.length < 2 && !SHORT_ALLOWED.has(word)) return false;
  if (word.endsWith("'s")) return false;
  return true;
}
function isLikelyAcronym(word, syllables) {
  if (word.length >= 2 && syllables >= word.length) return true;
  if (word.length <= 3 && !/[aeiouy]/u.test(word)) return true;
  return false;
}
function isAcceptableWord(word, syllables) {
  if (word.length <= 2) return SHORT_ALLOWED.has(word);
  if (isLikelyAcronym(word, syllables)) return false;
  if (!REAL_WORDS.has(word)) return false;
  return true;
}
function vowelOfPhoneme(phoneme) {
  if (!phoneme) return null;
  const m = phoneme.match(/^([A-Z]{2})\d?$/u);
  return m ? m[1] : null;
}
function strippedLastCoda(rhymeTail) {
  if (!rhymeTail || rhymeTail.length === 0) return null;
  const last = rhymeTail[rhymeTail.length - 1];
  if (/\d/u.test(last)) return null;
  return last;
}
function lyricScore(word, commonRank) {
  const apps = lyricFreq[word] || 0;
  const appsBoost = apps * 200;
  const rankBoost = commonRank < 7000 ? 7000 - commonRank : 0;
  return appsBoost + rankBoost;
}

const entries = [];
for (const [word, phonemes] of PRONUNCIATION_MAP.entries()) {
  if (!isWellFormedToken(word)) continue;
  const info = deriveRhymeInfo(phonemes);
  const syllables = phonemes.filter((p) => /\d/u.test(p)).length || 1;
  entries.push({
    text: word,
    phonemes,
    syllables,
    rhymeVowel: info.rhymeVowel,
    rhymeTail: info.rhymeTail,
  });
}

function collect(srcWord) {
  const source = analyzeWord(srcWord);
  if (!source) throw new Error(`"${srcWord}" not in CMU dict`);
  const sourceLastCoda = source.coda[source.coda.length - 1];
  const sourceVowel = source.stressedVowel;

  const collected = {
    perfect: [], family: [], additive: [], subtractive: [],
    assonance: [], consonance: [], identity: [],
  };

  for (const entry of entries) {
    if (entry.text === srcWord.toLowerCase()) continue;
    if (!isAcceptableWord(entry.text, entry.syllables)) continue;
    const entryStressedVowel = vowelOfPhoneme(entry.rhymeTail?.[0]);
    const stressedSame = entryStressedVowel && entryStressedVowel === sourceVowel;
    const codaSame = !!sourceLastCoda && strippedLastCoda(entry.rhymeTail) === sourceLastCoda;
    if (!stressedSame && !codaSame) continue;
    const cls = classifyRhyme(srcWord, entry.text);
    if (!collected[cls.type]) continue;
    if (!cls.isRhyme && cls.type !== "identity") continue;
    const commonRank = COMMON_RANK.get(entry.text) ?? Infinity;
    collected[cls.type].push({
      word: entry.text,
      stability: cls.stability,
      masculine: cls.masculineB,
      syllables: entry.syllables,
      familyCloseness: cls.familyCloseness,
      commonRank,
      apps: lyricFreq[entry.text] || 0,
      score: lyricScore(entry.text, commonRank),
      // For diagnostics:
      inWordnet: wordnetArr.includes ? false : false, // (set always uses .has, see below)
    });
  }
  // wordnet membership flag
  const wnSet = new Set(wordnetArr);
  for (const t of Object.keys(collected)) {
    for (const e of collected[t]) e.inWordnet = wnSet.has(e.word);
  }
  return { source, collected };
}

function reportType(srcWord, type) {
  const { collected } = collect(srcWord);
  const all = collected[type] || [];
  const passing = all.filter((e) => e.score > 0);
  const dropped = all.filter((e) => e.score === 0);
  passing.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  dropped.sort((a, b) => a.word.localeCompare(b.word));

  console.log(`\n=== ${srcWord}  /  type=${type} ===`);
  console.log(`  total candidates: ${all.length}`);
  console.log(`  passing score>0: ${passing.length}`);
  console.log(`  dropped score=0: ${dropped.length}`);
  console.log(`\n  PASSING (top 60 by score):`);
  for (const e of passing.slice(0, 60)) {
    console.log(`    ${e.word.padEnd(20)} score=${String(e.score).padStart(5)} apps=${e.apps} rank=${e.commonRank === Infinity ? '—' : e.commonRank} syll=${e.syllables}${e.inWordnet ? '' : ' [NOT in wordnet]'}`);
  }
  if (passing.length > 60) console.log(`    … +${passing.length - 60} more`);
  console.log(`\n  DROPPED (score=0 — filtered out):`);
  for (const e of dropped) {
    console.log(`    ${e.word.padEnd(20)} apps=${e.apps} rank=${e.commonRank === Infinity ? '—' : e.commonRank} syll=${e.syllables}${e.inWordnet ? '' : ' [NOT in wordnet]'}`);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node test/dogfood-rhymezone.mjs <word> [type]");
  console.error("       node test/dogfood-rhymezone.mjs --json <word>");
  process.exit(1);
}

if (args[0] === "--json") {
  const { collected } = collect(args[1]);
  console.log(JSON.stringify(collected, null, 2));
  process.exit(0);
}

const word = args[0];
const type = args[1] || "perfect";
reportType(word, type);
