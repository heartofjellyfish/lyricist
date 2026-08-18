// ── Rhyme Finder ────────────────────────────────────────────────────
// Walk the CMU pronouncing dictionary (already loaded via pronunciation.js)
// and return candidates grouped by Pattison rhyme type.
//
// Quality filters (loaded once, lazily):
//   • realWords  — set of WordNet entries, for filtering out proper nouns,
//                  surnames, and abbreviations (Aimee, Brault, ANSI).
//   • commonRank — Map<word, rank> from a top-10k common-English-words list,
//                  used to surface lyric-friendly words first.

import {
  classifyRhymeAnalyzed,
  analyzeWord,
  analyzeFromPhonemes,
  phonemesFor,
  rhymeAnchorIndex,
} from "./rhymeClassifier.js";
import { generateMosaics, assemblePhrase } from "./mosaicRhyme.js";
import {
  PRONUNCIATION_MAP,
  ensurePronunciation,
} from "./pronunciation.js";

let CORPUS_ENTRIES = null;
let WORD_LEX = null;          // Map<word, "common"|"name"|"place">
let WORD_DISPLAY = null;      // Map<word, "Madonna"|"FBI"> — the proper-name spelling
let COMMON_RANK = null;
let LYRIC_FREQ = null;
let MOSAIC_VERBS = null;      // Map<form, objMask> — verb gate + object-class for mosaic heads
let MOSAIC_PHRASES = null;    // { "bought her": {n, q:[…]} } — corpus attestation
let WORDLISTS_PROMISE = null;

const WORDLISTS_BASE = new URL("../wordlists/", import.meta.url);
// lyric-frequency.json lives at the repo-root /wordlists/, not the
// rhyme-finder-local /rhyme-finder/wordlists/, so it shares the index file
// with the lyric-library quote viewer (lyricLibrary.js).
const ROOT_WORDLISTS_BASE = new URL("../../wordlists/", import.meta.url);

// Errors the VISITOR caused — the word isn't in CMU, the phrase is malformed.
// Tagged so runSearch can tell them apart from a failed wordlist/dict fetch:
// both used to surface as `found:false`, which hid a real ~5% error rate on
// the SEO landing pages inside the dictionary-miss stats (PostHog, Aug 2026).
function inputError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function loadWordlists() {
  if (WORD_LEX && COMMON_RANK && LYRIC_FREQ && MOSAIC_VERBS && MOSAIC_PHRASES) return;
  if (!WORDLISTS_PROMISE) {
    WORDLISTS_PROMISE = (async () => {
      const [catResp, commonResp, freqResp, verbResp, phraseResp] = await Promise.all([
        fetch(new URL("wordnet-categories.json", WORDLISTS_BASE)),
        fetch(new URL("common-10k.txt", WORDLISTS_BASE)),
        fetch(new URL("lyric-frequency.json", ROOT_WORDLISTS_BASE)),
        fetch(new URL("mosaic-verbs.json", WORDLISTS_BASE)),
        fetch(new URL("mosaic-phrases.json", ROOT_WORDLISTS_BASE)),
      ]);
      if (!catResp.ok) throw new Error(`wordnet-categories.json ${catResp.status}`);
      if (!commonResp.ok) throw new Error(`common-10k.txt ${commonResp.status}`);
      if (!freqResp.ok) throw new Error(`lyric-frequency.json ${freqResp.status}`);
      // mosaic-verbs / mosaic-phrases are non-fatal, and both fail CLOSED:
      // without the verb file no head carries an object-frame license (no
      // speculative mosaics); without the phrase file nothing is attested.
      // Both missing → zero mosaics; the app otherwise works.
      MOSAIC_VERBS = verbResp.ok
        ? new Map(Object.entries(await verbResp.json()))
        : new Map();
      MOSAIC_PHRASES = phraseResp.ok ? await phraseResp.json() : {};
      // wordnet-categories.json is the source of truth for "real word"
      // membership AND lex category. Built by scripts/buildWordnetCategories.mjs,
      // which also hands us the capitalized spelling of every proper name
      // (madonna → Madonna, fbi → FBI). Everything is keyed lowercase; the
      // spelling is for display only and never reaches a rhyme key.
      const cats = await catResp.json();
      WORD_LEX = new Map();
      for (const lex of ["common", "name", "place"]) {
        for (const w of cats[lex] ?? []) WORD_LEX.set(w, lex);
      }
      WORD_DISPLAY = new Map(Object.entries(cats.display ?? {}));
      const commonText = await commonResp.text();
      LYRIC_FREQ = await freqResp.json();
      COMMON_RANK = new Map();
      const commonLines = commonText.split(/\r?\n/u).filter(Boolean);
      commonLines.forEach((w, i) => {
        COMMON_RANK.set(w.toLowerCase(), i);
      });
    })();
    // A rejected promise stays cached forever otherwise, so ONE flaky fetch
    // would poison every later search in the session — and the caller can
    // only report it as "word not found". Clear it so a retry re-fetches.
    WORDLISTS_PROMISE.catch(() => { WORDLISTS_PROMISE = null; });
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
    // Anchor with the classifier's own artifact-aware logic. The old
    // deriveRhymeInfo anchor ignored CMU fake-secondary artifacts, so the
    // prefilter below dropped candidates (agronomy for economy, borrow for
    // sorrow) before classifyRhyme ever ran on them.
    const anchorIdx = rhymeAnchorIndex(phonemes);
    const rhymeTail = anchorIdx === -1 ? phonemes : phonemes.slice(anchorIdx);
    const syllables = phonemes.filter((p) => /\d/u.test(p)).length || 1;
    entries.push({
      text: word,
      phonemes,
      syllables,
      rhymeTail,
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

// WordNet lists lemmas, not most regular inflections — "hurled", "swirled",
// "whirled", "unfurled" are all absent though "hurl"/"swirl"/… are present.
// Without a fallback these get dropped as candidates, so a search for "world"
// surfaced only "curled" (the one -ed form WordNet happens to list) out of a
// large perfect family. Recover a candidate whose regularly-inflected form
// reduces to a lemma that IS in WORD_LEX. Conservative by construction: the
// stem must itself be a lexicon entry, so real inflections get in without
// opening the door to CMU's surname/fragment residue. Pairs with
// buildCmuDict.mjs's inflection synthesis, which creates the pronunciations
// (furled, creaming) this gate then admits.
function inflectionStems(word) {
  const out = [];
  const push = (s) => { if (s.length >= 3) out.push(s); };
  if (word.length > 4 && (word.endsWith("ies") || word.endsWith("ied"))) {
    push(word.slice(0, -3) + "y"); // tries/tried → try
  }
  if (word.length > 5 && word.endsWith("ing")) {
    const s = word.slice(0, -3);
    push(s); push(s + "e"); // hoping → hope
    if (s.length >= 3 && s[s.length - 1] === s[s.length - 2]) push(s.slice(0, -1)); // running → run
  }
  if (word.length > 4 && word.endsWith("ed")) {
    const s = word.slice(0, -2);
    push(s); push(word.slice(0, -1)); // hurled → hurl, hoped → hope
    if (s.length >= 3 && s[s.length - 1] === s[s.length - 2]) push(s.slice(0, -1)); // stopped → stop
  }
  if (word.length > 4 && word.endsWith("es")) {
    push(word.slice(0, -2)); push(word.slice(0, -1)); // boxes → box, notes → note
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    push(word.slice(0, -1)); // dreams → dream
  }
  return out;
}

function hasInflectedStemInLex(word) {
  for (const stem of inflectionStems(word)) {
    if (WORD_LEX.has(stem)) return true;
  }
  return false;
}

function isAcceptableWord(word, syllables) {
  if (word.length <= 2) return SHORT_ALLOWED.has(word);
  if (isLikelyAcronym(word, syllables)) return false;
  if (ROMAN_NUMERAL_RE.test(word)) return false;
  if (JUNK_TOKENS.has(word)) return false;
  if (!WORD_LEX.has(word) && !hasInflectedStemInLex(word)) return false;
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

  // Phrase (Direction A) vs single word. A phrase — whitespace-separated,
  // 2–4 words, all in the dict — is assembled into one pseudo-word and
  // analyzed via analyzeFromPhonemes; a single word takes the dictionary
  // path. Both yield a `source` analysis + an `exclude` set of constituent
  // words that can't be their own rhymes.
  const raw = String(word).trim();
  const parts = raw.split(/\s+/u).filter(Boolean);
  let source;
  let exclude;
  if (parts.length > 1) {
    if (parts.length > 4) {
      throw inputError("Phrases max out at four words.", "BAD_INPUT");
    }
    const lowered = parts.map((p) => p.toLowerCase());
    for (const w of lowered) {
      if (!phonemesFor(w)) {
        throw inputError(`Couldn't find “${w}” in the dictionary — is it spelled right?`, "NOT_IN_DICT");
      }
    }
    const phon = assemblePhrase(lowered);
    source = phon ? analyzeFromPhonemes(lowered.join(" "), phon) : null;
    if (!source) {
      throw inputError(`Couldn't make sense of “${raw}”.`, "BAD_INPUT");
    }
    exclude = new Set(lowered);
  } else {
    source = analyzeWord(raw);
    if (!source) {
      throw inputError(`Couldn't find “${raw}” in the dictionary — is it spelled right?`, "NOT_IN_DICT");
    }
    exclude = new Set([raw.toLowerCase()]);
  }
  const entries = buildCorpus();
  const buckets = Object.fromEntries(types.map((t) => [t, []]));
  const sourceLastCoda = source.coda[source.coda.length - 1];
  const sourceVowel = source.stressedVowel;

  // First pass: collect ALL passing candidates per type with quality info.
  const collected = Object.fromEntries(types.map((t) => [t, []]));

  for (const entry of entries) {
    if (exclude.has(entry.text)) continue;
    if (!isAcceptableWord(entry.text, entry.syllables)) continue;

    const entryStressedVowel = vowelOfPhoneme(entry.rhymeTail?.[0]);
    const stressedSame = entryStressedVowel && entryStressedVowel === sourceVowel;
    const codaSame = !!sourceLastCoda && strippedLastCoda(entry.rhymeTail) === sourceLastCoda;
    if (!stressedSame && !codaSame) continue;

    // Analyzed path (single code path for words + phrases): the source was
    // analyzed once above; classify it against each entry's analysis. For a
    // single-word source this is exactly equivalent to classifyRhyme(word,
    // entry.text) — the goldens verify the equivalence.
    const cls = classifyRhymeAnalyzed(source, analyzeFromPhonemes(entry.text, entry.phonemes));
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
      lex: WORD_LEX.get(entry.text) ?? "common",  // common | name | place
      // How the word is spelled for a reader. `word` stays lowercase — it keys
      // quotes, mosaics and rhyme lookups everywhere downstream.
      display: WORD_DISPLAY.get(entry.text) ?? entry.text,
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

  // Mosaic rhymes (Direction B, §5). Generated at runtime from the same
  // in-memory corpus + the same classifier — no derived artifact. Empty for
  // masculine sources (mosaic rhyme is a feminine-ending phenomenon).
  const scoreOf = (w) => lyricScore(w, COMMON_RANK.get(w) ?? Infinity);
  const mosaics = generateMosaics(source, entries, {
    isAcceptableWord,
    scoreOf,
    // Speculative license: WordNet object-frame bits (0 for non-verbs and
    // frameless verbs — they can still surface via attestation).
    verbObjectMask: (w) => MOSAIC_VERBS.get(w) ?? 0,
    // Attestation: the phrase ends a real song line in the corpus. Serves
    // both as the non-speculative evidence path (die for, before me, to
    // you) and the ranking signal (attested rows sort first).
    isAttested: (display) =>
      Object.prototype.hasOwnProperty.call(MOSAIC_PHRASES, display),
    exclude,
  });
  // Corpus attestation: a mosaic phrase that actually ends lines in real
  // songs is everyday (surfaced first) and carries a real song-reference
  // badge. `songs` = 0 for un-attested phrases (folded in the UI).
  for (const m of mosaics) {
    const att = MOSAIC_PHRASES[m.display];
    m.songs = att ? att.n : 0;
    m.quotes = att ? att.q : [];
  }

  return {
    source: {
      word: source.word,
      stressedVowel: source.stressedVowel,
      coda: source.coda,
      masculine: source.masculine,
    },
    buckets,
    mosaics,
  };
}

export { TYPE_ORDER };

// Fire-and-forget warmup — load CMU dict + wordnet/frequency lists in the
// background so the first search doesn't have to wait for ~5 MB of network
// + parse. Idempotent; safe to call repeatedly. Call from main.js at module
// load so the user's reading time covers the dict load.
export function prewarm() {
  return Promise.all([ensurePronunciation(), loadWordlists()]);
}

// ── Vocabulary hash (shared with scripts/buildRhymeCounts.mjs) ──────
// rhyme-counts.json is a POSITIONAL artifact: counts packed in the
// alphabetical order of this vocabulary, with no word keys (that packing is
// what keeps it at ~186 KB brotli instead of ~340 KB). Positional means a
// vocabulary drift silently shifts every number onto the wrong word, so the
// file carries this hash of the exact word list it was built from and the
// loader refuses to use a file whose hash doesn't match. One implementation,
// imported by the build script — never a second copy.
export function vocabularyHash(sortedWords) {
  let h = 0x811c9dc5;                       // FNV-1a, 32-bit
  for (const w of sortedWords) {
    for (let i = 0; i < w.length; i += 1) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 10;                                // the "\n" separator
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ── Input autocomplete index ────────────────────────────────────────
// The suggestion list is the SAME vocabulary the classifier can return —
// buildCorpus() gated by isAcceptableWord — so the box never proposes a word
// the search would then reject. Ranked by the SAME lyricScore the results use,
// so "lo" offers love/long/low before lobotomy.
//
// Costs nothing on the network: every input (PRONUNCIATION_MAP, WORD_LEX,
// COMMON_RANK, LYRIC_FREQ) is already in memory after prewarm(). The only new
// work is one pass to bucket + sort, done once, off the typing path.
let SUGGEST_BUCKETS = null;   // Map<firstLetter, row[]>, each list score-sorted
let SUGGEST_BY_WORD = null;   // Map<word, row> — O(1) exact lookup
let SUGGEST_PROMISE = null;

export function ensureSuggestIndex() {
  if (SUGGEST_BUCKETS) return Promise.resolve();
  if (!SUGGEST_PROMISE) {
    SUGGEST_PROMISE = (async () => {
      await Promise.all([ensurePronunciation(), loadWordlists()]);
      const buckets = new Map();
      const byWord = new Map();
      for (const entry of buildCorpus()) {
        if (!isAcceptableWord(entry.text, entry.syllables)) continue;
        const row = {
          text: entry.text,
          display: WORD_DISPLAY.get(entry.text) ?? entry.text,
          syllables: entry.syllables,
          score: lyricScore(entry.text, COMMON_RANK.get(entry.text) ?? Infinity),
        };
        const k = entry.text[0];
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(row);
        if (!byWord.has(entry.text)) byWord.set(entry.text, row);
      }
      for (const list of buckets.values()) {
        list.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
      }
      SUGGEST_BUCKETS = buckets;
      SUGGEST_BY_WORD = byWord;
      await attachRhymeCounts(byWord);
    })();
    SUGGEST_PROMISE.catch(() => { SUGGEST_PROMISE = null; });
  }
  return SUGGEST_PROMISE;
}

// Per-word rhyme-tier counts for the autocomplete's perfect/near columns.
// Precomputed by scripts/buildRhymeCounts.mjs because the live figure is a
// full uncapped findRhymes — 30–150 ms per word, i.e. up to 1.2 s for the
// eight rows a keystroke shows.
//
// The file packs its counts POSITIONALLY, in the alphabetical order of this
// same vocabulary (no word keys — that is what keeps it small). So it is only
// meaningful against the exact word list it was built from, and this loader
// fails CLOSED: a missing file, a wrong length or a mismatched vocabulary hash
// leaves every row's `counts` null and the columns simply don't render. Wrong
// numbers are worse than no numbers.
async function attachRhymeCounts(byWord) {
  try {
    const resp = await fetch(new URL("rhyme-counts.json", WORDLISTS_BASE));
    if (!resp.ok) return;
    const data = await resp.json();
    const sorted = [...byWord.keys()].sort();
    if (data.n !== sorted.length) {
      console.warn(`rhyme-counts.json is stale (${data.n} words vs ${sorted.length}); columns disabled`);
      return;
    }
    if (data.hash !== vocabularyHash(sorted)) {
      console.warn("rhyme-counts.json was built from a different vocabulary; columns disabled");
      return;
    }
    const tiers = data.tiers;
    for (let i = 0; i < sorted.length; i += 1) {
      const c = data.counts[i];
      const row = byWord.get(sorted[i]);
      if (!row || !c) continue;
      const by = {};
      tiers.forEach((t, j) => { by[t] = c[j]; });
      // `near` = every tier a songwriter can still use, minus identity, which
      // is not in the file at all (a homophone is not a rhyme).
      row.counts = {
        ...by,
        near: tiers.reduce((sum, t, j) => (t === "perfect" ? sum : sum + c[j]), 0),
      };
    }
  } catch {
    // No counts is a fine state — the box still suggests words.
  }
}

/**
 * Prefix lookup for the input box. Synchronous and cheap: the first-letter
 * bucket is already score-sorted, so we stop at `limit` matches (worst case —
 * a prefix with no hits in the biggest bucket — is a ~7k scan, under half a
 * millisecond). Returns [] until ensureSuggestIndex() has resolved.
 *
 * The exact match is never filtered out — finishing a real word must not make
 * the panel vanish — but it is NOT hoisted either: hoisting floated the
 * obscure "wat" above "water". It keeps its natural rank, and is appended as
 * the last row when it would fall past `limit`.
 */
export function suggestWords(prefix, limit = 8) {
  if (!SUGGEST_BUCKETS) return [];
  const p = String(prefix || "").trim().toLowerCase();
  if (!p) return [];
  const arr = SUGGEST_BUCKETS.get(p[0]);
  if (!arr) return [];
  const out = [];
  let hasExact = false;
  for (const row of arr) {
    if (!row.text.startsWith(p)) continue;
    out.push(row);
    if (row.text === p) hasExact = true;
    if (out.length === limit) break;
  }
  if (!hasExact && SUGGEST_BY_WORD.has(p)) {
    if (out.length === limit) out.pop();
    out.push(SUGGEST_BY_WORD.get(p));
  }
  return out;
}
