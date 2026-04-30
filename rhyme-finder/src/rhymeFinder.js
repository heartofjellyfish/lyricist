// ── Rhyme Finder ────────────────────────────────────────────────────
// Walk the CMU pronouncing dictionary (already loaded via pronunciation.js)
// and return candidates grouped by Pattison rhyme type.
//
// Quality filters (loaded once, lazily):
//   • realWords  — set of WordNet entries, for filtering out proper nouns,
//                  surnames, and abbreviations (Aimee, Brault, ANSI).
//   • commonRank — Map<word, rank> from a top-10k common-English-words list,
//                  used to surface lyric-friendly words first.

import { classifyRhyme, analyzeWord } from "./rhymeClassifier.js";
import {
  PRONUNCIATION_MAP,
  deriveRhymeInfo,
  ensurePronunciation,
} from "./pronunciation.js";

let CORPUS_ENTRIES = null;
let REAL_WORDS = null;
let COMMON_RANK = null;
let WORDLISTS_PROMISE = null;

const WORDLISTS_BASE = new URL("../wordlists/", import.meta.url);

async function loadWordlists() {
  if (REAL_WORDS && COMMON_RANK) return;
  if (!WORDLISTS_PROMISE) {
    WORDLISTS_PROMISE = (async () => {
      const [wordnetResp, commonResp] = await Promise.all([
        fetch(new URL("wordnet-words.json", WORDLISTS_BASE)),
        fetch(new URL("common-10k.txt", WORDLISTS_BASE)),
      ]);
      if (!wordnetResp.ok) throw new Error(`wordnet-words.json ${wordnetResp.status}`);
      if (!commonResp.ok) throw new Error(`common-10k.txt ${commonResp.status}`);
      const wordnetArr = await wordnetResp.json();
      const commonText = await commonResp.text();
      REAL_WORDS = new Set(wordnetArr);
      COMMON_RANK = new Map();
      const commonLines = commonText.split(/\r?\n/u).filter(Boolean);
      commonLines.forEach((w, i) => {
        COMMON_RANK.set(w.toLowerCase(), i);
        REAL_WORDS.add(w.toLowerCase()); // top-10k is also valid English
      });
    })();
  }
  await WORDLISTS_PROMISE;
}

function buildCorpus() {
  if (CORPUS_ENTRIES) return CORPUS_ENTRIES;
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
  CORPUS_ENTRIES = entries;
  return entries;
}

const TYPE_ORDER = ["perfect", "family", "additive", "subtractive", "assonance", "consonance"];

// Exclude obviously useless tokens before any quality filter. Possessives,
// abbreviations like "abc", and tokens with stray numbers / punctuation.
const TOKEN_OK = /^[a-z][a-z\-]*$/u;

// Allowlist for 1-2 letter words. WordNet is missing some pronouns/function
// words ("we", "she") and includes some acronyms ("tv", "dvd"); this list
// is the only path through for very short tokens.
const SHORT_ALLOWED = new Set([
  "i", "a",
  "be", "we", "he", "me", "do", "go", "no", "so", "to", "up", "am", "an",
  "at", "by", "in", "is", "it", "my", "of", "or", "us", "if", "as", "on",
  "ah", "oh", "ow", "hi", "ya", "ye",
]);

function isWellFormedToken(word) {
  if (!TOKEN_OK.test(word)) return false;
  if (word.length < 2 && !SHORT_ALLOWED.has(word)) return false;
  if (word.endsWith("'s")) return false;
  return true;
}

function isLikelyAcronym(word, syllables) {
  // Letter-by-letter acronyms have one syllable per letter (DVD = D-V-D = 3).
  if (word.length >= 2 && syllables >= word.length) return true;
  // Consonant-cluster tokens like "hp", "tv", "cd", "pc": short, no vowel letters.
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

/**
 * Find rhyme candidates for a source word.
 *
 * @param {object} opts
 * @param {string} opts.word          source word
 * @param {number} [opts.perBucket]   max candidates per rhyme-type bucket (default 40)
 * @param {string[]} [opts.types]     restrict to these types
 * @returns {Promise<{source, buckets}>}
 */
export async function findRhymes({ word, perBucket = 40, types = TYPE_ORDER } = {}) {
  // Pronunciation dict and wordlists must be loaded before any classifier
  // call (analyzeWord reads PRONUNCIATION_MAP synchronously).
  await Promise.all([ensurePronunciation(), loadWordlists()]);

  const source = analyzeWord(word);
  if (!source) {
    throw new Error(`"${word}" not in pronouncing dictionary.`);
  }
  const entries = buildCorpus();
  const buckets = Object.fromEntries(types.map((t) => [t, []]));
  const sourceLastCoda = source.coda[source.coda.length - 1];
  const sourceVowel = source.stressedVowel;

  // First pass: collect ALL passing candidates per type with quality info.
  const collected = Object.fromEntries(types.map((t) => [t, []]));

  for (const entry of entries) {
    if (entry.text === word.toLowerCase()) continue;
    if (!isAcceptableWord(entry.text, entry.syllables)) continue;

    const entryStressedVowel = vowelOfPhoneme(entry.rhymeTail?.[0]);
    const stressedSame = entryStressedVowel && entryStressedVowel === sourceVowel;
    const codaSame = !!sourceLastCoda && strippedLastCoda(entry.rhymeTail) === sourceLastCoda;
    if (!stressedSame && !codaSame) continue;

    const cls = classifyRhyme(word, entry.text);
    if (!collected[cls.type]) continue;
    if (!cls.isRhyme) continue;

    collected[cls.type].push({
      word: entry.text,
      stability: cls.stability,
      explanation: cls.explanation,
      masculine: cls.masculineB,
      syllables: entry.syllables,
      codaRelation: cls.codaRelation,
      commonRank: COMMON_RANK.get(entry.text) ?? Infinity,
    });
  }

  // Sort and trim each bucket:
  //   1. matching stress class first (mas/fem agreement)
  //   2. lower commonRank first (most-common songwriter words first)
  //   3. fewer syllables first
  //   4. alphabetical
  for (const type of types) {
    const sorted = collected[type].sort((a, b) => {
      const stressA = a.masculine === source.masculine ? 0 : 1;
      const stressB = b.masculine === source.masculine ? 0 : 1;
      if (stressA !== stressB) return stressA - stressB;

      if (a.commonRank !== b.commonRank) return a.commonRank - b.commonRank;

      const syllA = a.syllables ?? 1;
      const syllB = b.syllables ?? 1;
      if (syllA !== syllB) return syllA - syllB;

      return a.word.localeCompare(b.word);
    });
    buckets[type] = sorted.slice(0, perBucket);
  }

  return {
    source: {
      word,
      stressedVowel: source.stressedVowel,
      coda: source.coda,
      masculine: source.masculine,
    },
    buckets,
  };
}

export { TYPE_ORDER };
