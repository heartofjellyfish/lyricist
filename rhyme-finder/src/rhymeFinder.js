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

// Roman numerals length≥2 (lxi, viii, mcmlxv) — wordnet has these as
// noun entries but they're useless lyric candidates. The single-letter
// "i"/"v"/"x"/"l"/"c"/"d"/"m" forms are handled by SHORT_ALLOWED (only "i"
// and "a" pass; the rest fail the length<2 check anyway via the consonant
// cluster filter).
const ROMAN_NUMERAL_RE = /^[ivxlcdm]+$/u;

// Tokens that pass isAcceptableWord (in wordnet/top-10k/lyric-corpus) but
// are useless lyric candidates: surnames-as-noun-entries, transliterations,
// loanword fragments, dictionary residue. Edited as-found, not derived.
const JUNK_TOKENS = new Set([
  // Loanword fragments / transliterations CMU & wordnet have
  "sie", "naif", "klee", "fae", "che", "ya",
  // Random surnames passing as wordnet entries
  "brunn", "chun", "jun", "kai", "doi", "foy", "hoy", "loy",
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
  if (ROMAN_NUMERAL_RE.test(word)) return false;
  if (JUNK_TOKENS.has(word)) return false;
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
      trailingSame: cls.trailingSame ?? true, // foot-level rhyme integrity for feminine pairs
      commonRank,
      score: lyricScore(entry.text, commonRank),
    });
  }

  // The "default visible" cap. UI shows this many candidates per bucket up
  // front; remaining candidates are tagged tier="lower" and revealed when
  // the user clicks a "show lower-quality" button. The cap formula is
  // dynamic per source: cap = clamp(strong × 2, MIN, MAX).
  //
  //   * sparse buckets (strong < 10): cap = MIN, show whatever's available
  //   * proportional middle: cap = strong × 2, every strong word brings
  //     one weak slot; rescues real-but-lyric-rare words like gleaming,
  //     mainland, combined, refined
  //   * abundant (strong > 100): cap = MAX, opinionated ceiling for huge
  //     buckets like memory-assonance (~900 strong)
  //
  // The MULT=2 ratio matches the empirical median strong/total ratio
  // (47.5%) across a 236-source survey — every strong candidate is paired
  // with one weak slot, on average.
  const DEFAULT_CAP_MIN = 20;
  const DEFAULT_CAP_MAX = 200;
  const DEFAULT_CAP_MULT = 2;

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
    // 2. Foot integrity (feminine sources only). A matching trailing means
    //    the WHOLE foot rhymes (dreaming/meaning); a mismatched trailing
    //    means only the stressed syllable echoes (dreaming/demon, the
    //    passion/ashes pattern). The full foot rhyme always sounds stronger
    //    to the ear, so it sorts first regardless of stressed-coda closeness.
    if (!source.masculine) {
      const trailA = a.trailingSame ? 0 : 1;
      const trailB = b.trailingSame ? 0 : 1;
      if (trailA !== trailB) return trailA - trailB;
    }
    // 3. Family closeness (family bucket only). Within the same family
    //    type, tight (partner) > medium (companion) > loose (cross).
    if (type === "family") {
      const closeA = FAMILY_CLOSENESS_ORDER[a.familyCloseness] ?? 1;
      const closeB = FAMILY_CLOSENESS_ORDER[b.familyCloseness] ?? 1;
      if (closeA !== closeB) return closeA - closeB;
    }
    // 4. Lyric-familiarity score: lyric corpus appearances dominate;
    //    top-7000 commonRank is fallback for words the corpus undercovers.
    if (a.score !== b.score) return b.score - a.score;
    // 5. Alphabetical for stable ordering on ties.
    return a.word.localeCompare(b.word);
  }

  for (const type of types) {
    const all = collected[type];

    // Step 1 — group by syllable count + sort. No score>0 hard filter:
    // every candidate that passed isAcceptableWord is a real word; the
    // score is a sort-priority signal, not a gate. Junk has been rejected
    // upstream by ROMAN_NUMERAL_RE / JUNK_TOKENS / isLikelyAcronym.
    const bySyll = [[], [], [], []]; // 1, 2, 3, 4+
    for (const e of all) {
      const idx = Math.min(4, Math.max(1, e.syllables ?? 1)) - 1;
      bySyll[idx].push(e);
    }
    for (const group of bySyll) group.sort((a, b) => compareWithin(type, a, b));

    // Step 2 — compute the "default visible" cap with the dynamic formula.
    const strongCount = all.reduce((n, e) => n + (e.score > 0 ? 1 : 0), 0);
    const defaultCap = Math.min(
      DEFAULT_CAP_MAX,
      Math.max(DEFAULT_CAP_MIN, strongCount * DEFAULT_CAP_MULT),
    );
    const cap = Math.min(defaultCap, all.length);

    // Step 3 — apply per-syllable quotas to the default tier (so the
    // default-visible candidates have variety across syllable counts, not
    // 200 1-syll near-duplicates).
    const targetPerSyll = SYLLABLE_QUOTAS.map((q) => Math.floor(cap * q));
    const takes = bySyll.map((g, i) => Math.min(g.length, targetPerSyll[i]));
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

    // Step 4 — emit default tier first, then lower tier. Within each
    // tier, candidates stay in syllable order. The UI renders default
    // immediately and reveals lower behind a "show more" button.
    const defaultTier = [];
    const lowerTier = [];
    for (let i = 0; i < bySyll.length; i += 1) {
      const g = bySyll[i];
      const t = takes[i];
      for (let j = 0; j < g.length; j += 1) {
        const tagged = { ...g[j], tier: j < t ? "default" : "lower" };
        if (j < t) defaultTier.push(tagged);
        else lowerTier.push(tagged);
      }
    }
    buckets[type] = [...defaultTier, ...lowerTier];
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
