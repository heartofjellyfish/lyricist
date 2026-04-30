// ── Rhyme Finder ────────────────────────────────────────────────────
// Local candidate search: given a source word, walk the CMU pronouncing
// dictionary (already loaded via pronunciation.js) and return candidates
// grouped by Pattison rhyme type. No network fetch needed — works on
// Vercel where the data/ folder is excluded.

import { classifyRhyme, analyzeWord } from "./rhymeClassifier.js";
import { PRONUNCIATION_MAP, deriveRhymeInfo } from "../../src/pronunciation.js";

let CORPUS_ENTRIES = null;

function buildCorpus() {
  if (CORPUS_ENTRIES) return CORPUS_ENTRIES;
  const entries = [];
  for (const [word, phonemes] of PRONUNCIATION_MAP.entries()) {
    if (!isUsableWord(word)) continue;
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

// A word is "rhyme-worthy" if it's plausibly used in lyrics.
// Filter out ALL-CAPS abbreviations, proper nouns obvious from corpus keys,
// and words that look like acronyms. Tolerate apostrophes and hyphens.
const SKIP_PATTERN = /^[a-z][a-z'\-]*$/u;

function isUsableWord(word) {
  return SKIP_PATTERN.test(word);
}

// The phonemes in CMU end with stressed digits (e.g. "AH0", "AE1"). Strip
// the digits to compare against analyzeWord output (which exposes the bare
// vowel like "AE").
function strippedLastCoda(rhymeTail) {
  if (!rhymeTail || rhymeTail.length === 0) return null;
  const last = rhymeTail[rhymeTail.length - 1];
  if (/\d/u.test(last)) return null; // last is a vowel, not a coda consonant
  return last;
}

/**
 * Find rhyme candidates for a source word.
 *
 * @param {object} opts
 * @param {string} opts.word           source word
 * @param {number} [opts.perBucket=60] max candidates per rhyme-type bucket
 * @param {string[]} [opts.types]      restrict to these types
 * @returns {Promise<object>} { source: analyzed, buckets: {type: [candidates]}}
 */
export async function findRhymes({ word, perBucket = 60, types = TYPE_ORDER } = {}) {
  const source = analyzeWord(word);
  if (!source) {
    throw new Error(`"${word}" not in pronouncing dictionary.`);
  }

  const entries = buildCorpus();
  const buckets = Object.fromEntries(types.map((t) => [t, []]));
  const sourceLastCoda = source.coda[source.coda.length - 1];
  const sourceVowel = source.stressedVowel;

  for (const entry of entries) {
    if (entry.text === word.toLowerCase()) continue;

    // Quick prefilter: candidate must share either the stressed vowel OR
    // the final coda consonant. Keeps the scan from doing 100k+ classifies.
    const entryStressedVowel = vowelOfPhoneme(entry.rhymeTail?.[0]);
    const stressedSame = entryStressedVowel && entryStressedVowel === sourceVowel;
    const codaSame = !!sourceLastCoda && strippedLastCoda(entry.rhymeTail) === sourceLastCoda;
    if (!stressedSame && !codaSame) continue;

    const cls = classifyRhyme(word, entry.text);
    if (!buckets[cls.type]) continue;
    if (!cls.isRhyme) continue;
    if (buckets[cls.type].length >= perBucket) continue;

    buckets[cls.type].push({
      word: entry.text,
      stability: cls.stability,
      explanation: cls.explanation,
      masculine: cls.masculineB,
      syllables: entry.syllables,
      codaRelation: cls.codaRelation,
    });
  }

  // Sort each bucket: same stress class first, then by syllable count asc.
  for (const type of types) {
    buckets[type].sort((a, b) => {
      const classA = a.masculine === source.masculine ? 0 : 1;
      const classB = b.masculine === source.masculine ? 0 : 1;
      if (classA !== classB) return classA - classB;
      return (a.syllables ?? 1) - (b.syllables ?? 1);
    });
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

function vowelOfPhoneme(phoneme) {
  if (!phoneme) return null;
  const m = phoneme.match(/^([A-Z]{2})\d?$/u);
  return m ? m[1] : null;
}

export { TYPE_ORDER };
