// ── Rhyme Finder ────────────────────────────────────────────────────
// Local candidate search: given a source word, scan the CMU-derived
// corpus (data/cmu-entries.json) and return candidates grouped by
// Pattison rhyme type. No LLM call needed.

import { classifyRhyme, analyzeWord } from "./rhymeClassifier.js";

let CMU_ENTRIES = null;

async function loadCmuEntries() {
  if (CMU_ENTRIES) return CMU_ENTRIES;
  const response = await fetch("../data/cmu-entries.json");
  if (!response.ok) throw new Error(`Failed to load CMU entries: ${response.status}`);
  CMU_ENTRIES = await response.json();
  return CMU_ENTRIES;
}

const TYPE_ORDER = ["perfect", "family", "additive", "subtractive", "assonance", "consonance"];

// Heuristic: a word is "rhyme-worthy" if it's plausibly used in lyrics.
// Filter out ALL-CAPS abbreviations, proper nouns obvious from corpus keys,
// and words that look like acronyms. Tolerate apostrophes.
const SKIP_PATTERN = /^[a-z][a-z'\-]*$/u;

function isUsableWord(entry) {
  return SKIP_PATTERN.test(entry.text);
}

/**
 * Find rhyme candidates for a source word.
 *
 * @param {object} opts
 * @param {string} opts.word           source word
 * @param {number} [opts.perBucket=40] max candidates per rhyme-type bucket
 * @param {string[]} [opts.types]      restrict to these types
 * @returns {Promise<object>} { source: analyzed, buckets: {type: [candidates]}}
 */
export async function findRhymes({ word, perBucket = 40, types = TYPE_ORDER } = {}) {
  const source = analyzeWord(word);
  if (!source) {
    throw new Error(`"${word}" not in pronouncing dictionary.`);
  }

  const entries = await loadCmuEntries();
  const buckets = Object.fromEntries(types.map((t) => [t, []]));

  for (const entry of entries) {
    if (!isUsableWord(entry)) continue;
    if (entry.text === word.toLowerCase()) continue;

    // Quick filter: stressed vowel match OR coda match (consonance). Skip anything
    // else to keep the scan fast.
    const stressedSame = entry.rhymeVowel === sourceRhymeVowel(source);
    const lastPh = entry.rhymeTail?.[entry.rhymeTail.length - 1];
    const sourceLastCoda = source.coda[source.coda.length - 1];
    const codaTail = lastPh && sourceLastCoda && lastPh === sourceLastCoda;
    if (!stressedSame && !codaTail) continue;

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

  // Sort each bucket: same-class first (mas→mas or fem→fem), then by syllable count asc.
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

function sourceRhymeVowel(analyzed) {
  const vowelMap = {
    AA: "ah", AE: "a", AH: "uh", AO: "aw", AW: "ow", AY: "eye",
    EH: "eh", ER: "er", EY: "ay", IH: "ih", IY: "ee",
    OW: "oh", OY: "oy", UH: "uu", UW: "oo",
  };
  return vowelMap[analyzed.stressedVowel] ?? analyzed.stressedVowel.toLowerCase();
}

export { TYPE_ORDER };
