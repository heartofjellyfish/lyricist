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
let LYRIC_FREQ = null;
let WORDLISTS_PROMISE = null;

const WORDLISTS_BASE = new URL("../wordlists/", import.meta.url);
// lyric-frequency.json lives at the repo-root /wordlists/, not the
// rhyme-finder-local /rhyme-finder/wordlists/, so it shares the index file
// with the lyric-library quote viewer (lyricLibrary.js).
const ROOT_WORDLISTS_BASE = new URL("../../wordlists/", import.meta.url);

async function loadWordlists() {
  if (REAL_WORDS && COMMON_RANK && LYRIC_FREQ) return;
  if (!WORDLISTS_PROMISE) {
    WORDLISTS_PROMISE = (async () => {
      const [wordnetResp, commonResp, freqResp] = await Promise.all([
        fetch(new URL("wordnet-words.json", WORDLISTS_BASE)),
        fetch(new URL("common-10k.txt", WORDLISTS_BASE)),
        fetch(new URL("lyric-frequency.json", ROOT_WORDLISTS_BASE)),
      ]);
      if (!wordnetResp.ok) throw new Error(`wordnet-words.json ${wordnetResp.status}`);
      if (!commonResp.ok) throw new Error(`common-10k.txt ${commonResp.status}`);
      if (!freqResp.ok) throw new Error(`lyric-frequency.json ${freqResp.status}`);
      const wordnetArr = await wordnetResp.json();
      const commonText = await commonResp.text();
      LYRIC_FREQ = await freqResp.json();
      REAL_WORDS = new Set(wordnetArr);
      COMMON_RANK = new Map();
      const commonLines = commonText.split(/\r?\n/u).filter(Boolean);
      commonLines.forEach((w, i) => {
        COMMON_RANK.set(w.toLowerCase(), i);
        REAL_WORDS.add(w.toLowerCase()); // top-10k is also valid English
      });
      // Lyric library entries are themselves a real-word signal: any token
      // attested in a curated song lyric is a real lyric word, even if
      // wordnet doesn't know it (slang, contractions like "ain't").
      for (const w of Object.keys(LYRIC_FREQ)) REAL_WORDS.add(w);
    })();
  }
  await WORDLISTS_PROMISE;
}

// Lyric-familiarity score. Two signals, both grounded in real data —
// no wordnet baseline, no length heuristics, no special cases. As the
// lyric corpus expands, real lyric vocabulary accumulates apps and
// borderline survivors (ye, dee, qui at 1-6 apps today) get out-ranked
// out of buckets automatically.
//
//   * lyricApps × 200 — direct evidence from curated song lyrics. 1 app
//     ≈ rank 6800, 5 apps ≈ rank 6000, 30 apps (corpus cap) ≈ rank 4000.
//   * top-7000 commonRank — general-English fallback for words the lyric
//     corpus hasn't yet attested. Past rank 7000, the top-10k tail is
//     dominated by tech/business jargon and proper nouns — credit nothing.
//
// Words scoring 0 are filtered out as likely listener-confusing tokens.
function lyricScore(word, commonRank) {
  const apps = LYRIC_FREQ[word] || 0;
  const appsBoost = apps * 200;
  const rankBoost = commonRank < 7000 ? 7000 - commonRank : 0;
  return appsBoost + rankBoost;
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

const TYPE_ORDER = ["perfect", "family", "additive", "subtractive", "assonance", "consonance", "identity"];

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
    // Identity entries have isRhyme=false but should still be surfaced —
    // Pattison's textbook includes them as "(oops! Identity.)" annotations
    // in walkthrough lists, so users learn why a candidate doesn't work.
    if (!cls.isRhyme && cls.type !== "identity") continue;

    const commonRank = COMMON_RANK.get(entry.text) ?? Infinity;
    collected[cls.type].push({
      word: entry.text,
      stability: cls.stability,
      explanation: cls.explanation,
      masculine: cls.masculineB,
      syllables: entry.syllables,
      codaRelation: cls.codaRelation,
      familyCloseness: cls.familyCloseness, // tight | medium | loose (family only)
      commonRank,
      score: lyricScore(entry.text, commonRank),
    });
  }

  // Per-type ceilings. Sized to the natural shape of each rhyme type:
  // identity is always small (a few exact-suffix matches); perfect/family
  // are mid-sized; additive/assonance/consonance are structurally huge for
  // vowel-ending sources (every English consonant is a candidate). A
  // bucket caps at min(TYPE_MAX, # of quality candidates) — when the
  // corpus is sparse, the bucket shrinks honestly rather than padding
  // with junk.
  const TYPE_MAX = {
    identity: 50,
    perfect: 200,
    family: 300,
    additive: 350,
    subtractive: 200,
    assonance: 350,
    consonance: 350,
  };

  // Per-syllable quotas. Within a bucket, reserve roughly these shares
  // for 1, 2, 3, and 4+ syllable words so the user sees variety, not
  // 200 1-syll near-duplicates. Underflow in any group flows to the next
  // (1-syll first) — single-syllable words are lyric staples and most
  // valuable when available.
  const SYLLABLE_QUOTAS = [0.4, 0.3, 0.2, 0.1];

  const FAMILY_CLOSENESS_ORDER = { tight: 0, medium: 1, loose: 2 };

  function compareWithin(type, a, b) {
    // 1. Mas/fem stress agreement — pairs that match the source's stress
    //    class come first; mas-vs-fem mismatches are usable but weaker.
    const stressA = a.masculine === source.masculine ? 0 : 1;
    const stressB = b.masculine === source.masculine ? 0 : 1;
    if (stressA !== stressB) return stressA - stressB;
    // 2. Family closeness (family bucket only). Within the same family
    //    type, tight (partner) > medium (companion) > loose (cross).
    if (type === "family") {
      const closeA = FAMILY_CLOSENESS_ORDER[a.familyCloseness] ?? 1;
      const closeB = FAMILY_CLOSENESS_ORDER[b.familyCloseness] ?? 1;
      if (closeA !== closeB) return closeA - closeB;
    }
    // 3. Lyric-familiarity score: lyric corpus appearances dominate;
    //    top-7000 commonRank is fallback for words the corpus undercovers.
    if (a.score !== b.score) return b.score - a.score;
    // 4. Alphabetical for stable ordering on ties.
    return a.word.localeCompare(b.word);
  }

  for (const type of types) {
    const all = collected[type];
    const max = TYPE_MAX[type] ?? perBucket;

    // Step 1 — quality filter. score === 0 means: not in top-7000 AND
    // zero lyric appearances. These are corpus gaps the user will trip
    // over (lxi, sie, klee, naif…). Drop them.
    const filtered = all.filter((e) => e.score > 0);

    // Step 2 — group by syllable count (capping at 4+ as a single bucket).
    // Sort within each group by the shared rule.
    const bySyll = [[], [], [], []]; // 1, 2, 3, 4+
    for (const e of filtered) {
      const idx = Math.min(4, Math.max(1, e.syllables ?? 1)) - 1;
      bySyll[idx].push(e);
    }
    for (const group of bySyll) group.sort((a, b) => compareWithin(type, a, b));

    // Step 3 — apply per-syllable quotas with overflow. Dynamic scaling:
    // cap = min(TYPE_MAX, available_after_filter); short corpora produce
    // short buckets, padded with nothing.
    const cap = Math.min(max, filtered.length);
    const targetPerSyll = SYLLABLE_QUOTAS.map((q) => Math.floor(cap * q));
    const takes = bySyll.map((g, i) => Math.min(g.length, targetPerSyll[i]));

    // Distribute remaining slots greedily — earlier syllable groups
    // (1-syll first) preferred since most lyric staples live there.
    let remaining = cap - takes.reduce((a, b) => a + b, 0);
    while (remaining > 0) {
      let progress = false;
      for (let i = 0; i < bySyll.length && remaining > 0; i += 1) {
        if (takes[i] < bySyll[i].length) {
          takes[i] += 1;
          remaining -= 1;
          progress = true;
        }
      }
      if (!progress) break;
    }

    // Step 4 — combine in syllable order (UI groups by syllables anyway).
    buckets[type] = bySyll.flatMap((g, i) => g.slice(0, takes[i]));
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
