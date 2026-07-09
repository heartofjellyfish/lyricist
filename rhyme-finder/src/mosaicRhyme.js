// ── Mosaic (compound) rhyme ─────────────────────────────────────────
// A mosaic rhyme is a MULTI-WORD combination that rhymes with a single
// word: poet / know it, letter / get her, water / bought her, city / hit
// me. Pattison's standard technique for manufacturing feminine rhymes
// when the single-word supply runs dry.
//
// Two directions, both served here:
//   A — phrase input.  assemblePhrase("bought her") → phonemes for the
//       whole phrase, fed to the normal search as one pseudo-word.
//   B — mosaic generation.  generateMosaics(analyzeWord("water"), …) →
//       "bought her", "got her", "shot her", each graded on the real
//       Pattison scale by the real classifier.
//
// KEY DESIGN PROPERTY (see MOSAIC-PLAN.md §3): mosaics are pseudo-words
// fed through the EXISTING classifier, not a parallel taxonomy. This
// module implements NO anchoring, NO phoneme normalization, and NO
// trailing COMPARISON of its own — every phonetic decision is delegated
// to rhymeClassifier.js / pronunciation.js. The only derived strings it
// computes are Map lookup KEYS (headKey/tailKey — digit-stripped joins of
// already-anchored tails), which are formatting transforms, not new
// phonetic logic, and never touch bucket filenames or storage.

import { normalizePhonemes } from "./pronunciation.js";
import {
  phonemesFor,
  analyzeFromPhonemes,
  classifyRhymeAnalyzed,
  trailingsMatch,
  rhymeAnchorIndex,
} from "./rhymeClassifier.js";

// ── Function-word tail table (§5.3) ─────────────────────────────────
// display word + ordered pronunciation variants. STRESS DIGITS ALL 0 —
// a variant carrying a 1/2 digit would steal the pseudo-word's anchor
// away from the head word's stressed vowel. Variants are citation
// ARPAbet; normalizePhonemes() is applied once at module init so the
// cot/caught merger (and its pre-R exception) is already baked in.
//
// Table order = ranking priority. First variant = the canonical reduced
// form (also used by phrase input, §6). `weak: true` marks a variant
// that differs from citation (h-drop, "'em", "ya") so the UI can hint
// the reduced pronunciation. Data, not code — prune/extend freely; an
// edit only needs a new fixture if it exercises a new MECHANISM.
//
// Deliberately excluded: he/she/we (subject pronouns — "hit he" is junk),
// the/an (never line-final). See MOSAIC-PLAN.md §5.3.
//
// `obj` marks OBJECT-PRONOUN tails: the head verb must be able to take that
// object ("person" → somebody-frames, "thing" → something-frames, per the
// masks baked into mosaic-verbs.json). Without it the verb gate alone ships
// "weekend her" (intransitive), "pretend her" / "spend her" (no person
// object). Non-object tails (particles, determiners, auxiliaries) stay
// ungated — "her" as a possessive reading is NOT credited because a
// line-final "her" reads as the object.
//
// `aux` marks copula/auxiliary tails whose natural line-ending reading is
// SUBJECT + aux ("muses are", "father did", "love is" — corpus-attested
// heads are all nouns); after a VERB head they're a stretch ("pretend
// are"). They rank behind every object/particle reading so they never
// occupy un-attested preview slots — without this, gating "pretend her"
// just promotes its same-sound twin "pretend are" into the freed slot
// (weak 'er and are are both bare ER0).
const FUNCTION_WORDS = [
  { word: "it",   obj: "thing",  variants: [["IH0 T"]] },
  { word: "her",  obj: "person", variants: [["ER0", true], ["HH ER0"]] },
  { word: "them", obj: "person", variants: [["AH0 M", true], ["DH AH0 M"]] },
  { word: "him",  obj: "person", variants: [["IH0 M", true], ["HH IH0 M"]] },
  { word: "his",  variants: [["IH0 Z", true], ["HH IH0 Z"]] },
  { word: "me",   obj: "person", variants: [["M IY0"]] },
  { word: "you",  obj: "person", variants: [["Y AH0", true], ["Y UW0"]] },
  { word: "us",   obj: "person", variants: [["AH0 S"]] },
  { word: "a",    variants: [["AH0"]] },
  { word: "of",   variants: [["AH0 V"], ["AH0", true]] },
  { word: "to",   variants: [["T UW0"], ["T AH0", true]] },
  { word: "and",  variants: [["AH0 N", true], ["AH0 N D"]] },
  { word: "in",   variants: [["IH0 N"]] },
  { word: "on",   variants: [["AA0 N"]] },
  { word: "at",   variants: [["AH0 T"], ["AE0 T"]] },
  { word: "up",   variants: [["AH0 P"]] },
  { word: "out",  variants: [["AW0 T"]] },
  { word: "off",  variants: [["AA0 F"]] },
  { word: "all",  variants: [["AA0 L"]] },
  { word: "is",   aux: true, variants: [["IH0 Z"]] },
  { word: "as",   variants: [["AH0 Z"]] },
  { word: "was",  aux: true, variants: [["W AH0 Z"]] },
  { word: "are",  aux: true, variants: [["ER0"]] },
  { word: "or",   aux: true, variants: [["ER0"]] },
  { word: "for",  variants: [["F ER0"]] },
  { word: "your", variants: [["Y ER0"]] },
  { word: "from", variants: [["F R AH0 M"]] },
  { word: "one",  variants: [["W AH0 N"]] },
  { word: "some", variants: [["S AH0 M"]] },
  { word: "my",   variants: [["M AY0"]] },
  { word: "by",   variants: [["B AY0"]] },
  { word: "so",   variants: [["S OW0"]] },
  { word: "do",   aux: true, variants: [["D UW0"], ["D AH0"]] },
  { word: "did",  aux: true, variants: [["D IH0 D"]] },
  { word: "can",  aux: true, variants: [["K AH0 N"]] },
  { word: "will", aux: true, variants: [["W AH0 L"]] },
  { word: "not",  aux: true, variants: [["N AA0 T"]] },
  { word: "what", variants: [["W AH0 T"]] },
  { word: "that", variants: [["DH AH0 T"]] },
  { word: "this", variants: [["DH IH0 S"]] },
  { word: "there", variants: [["DH ER0", true]] },
];

// Object-class bitmask, mirrored by scripts/buildMosaicVerbs.mjs.
const OBJ_PERSON = 1;
const OBJ_THING = 2;

// Realized table: variants split + normalized once, priority index attached.
const FW_TABLE = FUNCTION_WORDS.map((row, priority) => ({
  word: row.word,
  priority,
  objMask: row.obj === "person" ? OBJ_PERSON : row.obj === "thing" ? OBJ_THING : 0,
  aux: !!row.aux,
  variants: row.variants.map(([ph, weak]) => ({
    phonemes: normalizePhonemes(ph).split(" "),
    weak: !!weak,
  })),
}));
const FW_MAP = new Map(FW_TABLE.map((r) => [r.word, r]));

export function isFunctionWord(word) {
  return FW_MAP.has(word.toLowerCase());
}

// ── Key-string transforms (formatting only — NOT phonetic comparison) ─
// headKey/tailKey exist solely as Map lookup strings inside this module.
// They are digit-stripped joins of an ALREADY-ANCHORED tail; they never
// become bucket filenames or storage keys (that's rhymeKeyOf's job) and
// never decide a rhyme tier (that's classifyRhymeAnalyzed's job). The
// IH→AH mapping mirrors the classifier's §4b weak-vowel merger so the
// key layer agrees with the tolerance the classifier actually uses.

const Y_SUFFIX_VOWELS = new Set(["IH0", "IH2", "IY0", "IY2"]);

// Head key: whole tail joined, digit-blind, IH→AH at every position
// EXCEPT the first (the anchor — stressed IH1 must stay distinct from
// AH1). Two words share a headKey iff one can serve as the head for the
// other's split — i.e. their rhyme tails are equal up to the merger.
function headKey(phonemes) {
  return phonemes
    .map((ph, idx) => {
      const base = ph.replace(/[012]$/u, "");
      return idx > 0 && base === "IH" ? "AH" : base;
    })
    .join("_");
}

// Tail key: mirrors trailingToken (digit-blind, final happy-vowel → _Y,
// otherwise IH→AH). Used only to DEDUP function-word variants that reduce
// to the same sound (her/are/or → ER0; it/at → …AH_T via §4b). It is a
// formatting transform for the dedup Map, not a comparator — the actual
// tail MATCH is done by the imported trailingsMatch.
function tailKeyToken(ph, isLast) {
  if (isLast && Y_SUFFIX_VOWELS.has(ph)) return "_Y";
  const m = ph.match(/^([A-Z]{2})[012]$/u);
  if (!m) return ph;
  return m[1] === "IH" ? "AH" : m[1];
}
function tailKey(phonemes) {
  return phonemes
    .map((ph, i) => tailKeyToken(ph, i === phonemes.length - 1))
    .join("_");
}

function isVowelPhoneme(ph) {
  return /^[A-Z]{2}[012]$/u.test(ph);
}

// ── Head index (§5.2) ───────────────────────────────────────────────
// One-time lazy index over the finder's corpus entries: headKey → the
// acceptable, lyric-familiar words that END with that tail. Cached on the
// corpusEntries reference so it's built once per session (rebuilt only if
// the caller ever passes a different corpus array).
let HEAD_INDEX = null;
let HEAD_INDEX_SRC = null;

function buildHeadIndex(corpusEntries, isAcceptableWord, scoreOf, isVerb, verbObjectMask) {
  const index = new Map();
  for (const entry of corpusEntries) {
    if (!entry.rhymeTail || entry.rhymeTail.length === 0) continue;
    if (!isAcceptableWord(entry.text, entry.syllables)) continue;
    // Grammatical head gate (§5.3): a mosaic reads as English only when the
    // head is a VERB — "know it", "bought her", "hit me", "run me" — because
    // the tail (a pronoun or particle) attaches to a verb. Without this the
    // generator floods with grammatical nonsense: "oh it", "not are",
    // "scott her", "apricot her". isVerb is backed by mosaic-verbs.json.
    if (!isVerb(entry.text)) continue;
    const score = scoreOf(entry.text);
    if (score <= 0) continue; // quality gate — a junk head kills the feel
    const key = headKey(entry.rhymeTail);
    let bucket = index.get(key);
    if (!bucket) index.set(key, (bucket = []));
    bucket.push({
      text: entry.text,
      phonemes: entry.phonemes,
      syllables: entry.syllables,
      score,
      // Object-class bits (person/thing) — checked against the TAIL's
      // requirement at pair time, since the same head serves many tails.
      objMask: verbObjectMask(entry.text),
    });
  }
  // Pre-sort each bucket by score desc so per-split take is a cheap slice.
  for (const bucket of index.values()) {
    bucket.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  }
  return index;
}

function ensureHeadIndex(corpusEntries, isAcceptableWord, scoreOf, isVerb, verbObjectMask) {
  if (HEAD_INDEX && HEAD_INDEX_SRC === corpusEntries) return HEAD_INDEX;
  HEAD_INDEX = buildHeadIndex(corpusEntries, isAcceptableWord, scoreOf, isVerb, verbObjectMask);
  HEAD_INDEX_SRC = corpusEntries;
  return HEAD_INDEX;
}

const HEADS_PER_SPLIT = 60;
const MOSAIC_DEFAULT = 16;
const MOSAIC_CAP = 48;

const KEEP_TYPES = new Set(["perfect", "family", "additive", "subtractive"]);
const TIER_RANK = { perfect: 0, family: 1, additive: 2, subtractive: 3 };
const JOIN_RANK = { exact: 0, geminate: 1, "additive-onset": 2 };

// ── Tail matching (§5.3) ────────────────────────────────────────────
// For a split tail T and a function-word variant V, decide whether V is a
// usable tail and how it joins. All actual phoneme comparison is the
// imported trailingsMatch (digit-blind, final IH/IY canonicalized,
// weak-vowel IH↔AH tolerant after §4b). `prevPhoneme` is the head's last
// phoneme (R[i-1]) — used only to detect a geminate (shared boundary
// consonant). Returns { joinType } or null.
function matchTail(variantPhonemes, tail, prevPhoneme) {
  if (trailingsMatch(variantPhonemes, tail)) {
    return { joinType: "exact" };
  }
  // onset-added: variant carries exactly one extra leading consonant.
  if (
    variantPhonemes.length === tail.length + 1 &&
    !isVowelPhoneme(variantPhonemes[0]) &&
    trailingsMatch(variantPhonemes.slice(1), tail)
  ) {
    // Geminate: the extra consonant REUSES the head word's final
    // consonant (felt to → [fɛltə], one T). Else it's a genuine additive
    // onset (hit me → city; the classifier grades the pair additive).
    if (variantPhonemes[0] === prevPhoneme) return { joinType: "geminate" };
    return { joinType: "additive-onset" };
  }
  return null;
}

/**
 * Generate mosaic rhymes for a source analysis (§5).
 *
 * @param {object} source           analysis object (analyzeWord / analyzeFromPhonemes)
 * @param {object[]} corpusEntries  the finder's CORPUS_ENTRIES (reused, not rebuilt)
 * @param {object} deps
 * @param {(word:string, syll:number)=>boolean} deps.isAcceptableWord
 * @param {(word:string)=>number} deps.scoreOf   lyric-familiarity score
 * @param {Set<string>} [deps.exclude]           head words to reject (source + phrase constituents)
 * @returns {object[]} emitted mosaic rows (see §5.5 shape)
 */
export function generateMosaics(source, corpusEntries, deps) {
  if (!source || !source.phonemes) return [];
  // Mosaic rhyme is inherently a feminine-ending phenomenon — the tail
  // word carries post-stress material. Masculine sources get zero mosaics.
  if (!source.trailing || source.trailing.length === 0) return [];

  const { isAcceptableWord, scoreOf } = deps;
  const isVerb = deps.isVerb ?? (() => true); // grammatical head gate (§5.3)
  // Object-class gate (§5.3): permissive default mirrors isVerb's.
  const verbObjectMask = deps.verbObjectMask ?? (() => OBJ_PERSON | OBJ_THING);
  const exclude = deps.exclude ?? new Set();
  const index = ensureHeadIndex(corpusEntries, isAcceptableWord, scoreOf, isVerb, verbObjectMask);

  const anchorIdx = rhymeAnchorIndex(source.phonemes);
  if (anchorIdx === -1) return [];
  const R = source.phonemes.slice(anchorIdx); // stressed vowel onward

  // Winner-per-key map: (headWord | matched-tail token) → best row.
  const byKey = new Map();

  for (let i = 1; i < R.length; i += 1) {
    const head = R.slice(0, i);
    const tail = R.slice(i);
    const prevPhoneme = R[i - 1]; // head's last phoneme, for geminate detection

    const bucket = index.get(headKey(head));
    if (!bucket || bucket.length === 0) continue;

    // Head candidates: skip excluded words, cap at HEADS_PER_SPLIT.
    const heads = [];
    for (const h of bucket) {
      if (exclude.has(h.text)) continue;
      heads.push(h);
      if (heads.length >= HEADS_PER_SPLIT) break;
    }
    if (heads.length === 0) continue;

    for (const fw of FW_TABLE) {
      for (const variant of fw.variants) {
        const m = matchTail(variant.phonemes, tail, prevPhoneme);
        if (!m) continue;
        const dedupTail = tailKey(
          m.joinType === "geminate" ? variant.phonemes.slice(1) : variant.phonemes,
        );

        for (const headEntry of heads) {
          // Object gate (§5.3): an object-pronoun tail needs a head verb
          // that can take that object class — kills "weekend her"
          // (no object), "pretend her" / "spend her" (thing-only) while
          // keeping "send her", "pretend it".
          if (fw.objMask && !(headEntry.objMask & fw.objMask)) continue;
          // Assembly (§5.4): use the MATCHED variant, not citation. Geminate
          // joins degeminate (drop the variant's initial consonant — English
          // collapses the doubled boundary consonant).
          const tailPart =
            m.joinType === "geminate" ? variant.phonemes.slice(1) : variant.phonemes;
          const phonemes = [...headEntry.phonemes, ...tailPart];
          const label = `${headEntry.text} ${fw.word}`;
          const analysis = analyzeFromPhonemes(label, phonemes);
          if (!analysis) continue;
          const cls = classifyRhymeAnalyzed(source, analysis);
          if (!cls.isRhyme || !KEEP_TYPES.has(cls.type)) continue;

          const dedupKey = `${headEntry.text}|${dedupTail}`;
          const row = {
            words: [headEntry.text, fw.word],
            display: `${headEntry.text} ${fw.word}`,
            type: cls.type,
            joinType: m.joinType,
            aux: fw.aux,
            weakForm: variant.weak,
            stability: cls.stability,
            explanation: cls.explanation,
            syllables: phonemes.filter(isVowelPhoneme).length || 1,
            score: headEntry.score,
            priority: fw.priority,
          };
          const prev = byKey.get(dedupKey);
          if (!prev || better(row, prev)) byKey.set(dedupKey, row);
        }
      }
    }
  }

  // Rank (§5.5): tier → joinType → non-aux first → head score desc →
// tail priority → alpha.
  const ranked = [...byKey.values()].sort(compareRows);

  // Suppress twin surfaces: the same phrase can arise as a perfect (weak
  // "'er") AND a lower additive (audible "her"). They read identically on
  // the page, so keep only the best-ranked reading per display string.
  const seenDisplay = new Set();
  const rows = ranked.filter((r) => {
    if (seenDisplay.has(r.display)) return false;
    seenDisplay.add(r.display);
    return true;
  });

  // Default/lower tiering, mirroring the main lists' convention.
  return rows.slice(0, MOSAIC_CAP).map((row, idx) => {
    const { priority, ...rest } = row; // drop the internal sort key
    return { ...rest, tier: idx < MOSAIC_DEFAULT ? "default" : "lower" };
  });
}

// Winner within a dedup key: best join quality, then table priority.
function better(a, b) {
  if (JOIN_RANK[a.joinType] !== JOIN_RANK[b.joinType]) {
    return JOIN_RANK[a.joinType] < JOIN_RANK[b.joinType];
  }
  return a.priority < b.priority;
}

function compareRows(a, b) {
  const t = (TIER_RANK[a.type] ?? 9) - (TIER_RANK[b.type] ?? 9);
  if (t !== 0) return t;
  const j = (JOIN_RANK[a.joinType] ?? 9) - (JOIN_RANK[b.joinType] ?? 9);
  if (j !== 0) return j;
  if (a.aux !== b.aux) return a.aux ? 1 : -1;
  if (a.score !== b.score) return b.score - a.score;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.display.localeCompare(b.display);
}

// ── Phrase assembly (Direction A, §6) ───────────────────────────────
// Concatenate a phrase's words into one phoneme array to be analyzed as a
// single pseudo-word. Function words contribute their canonical reduced
// variant (variants[0]) so they don't steal the anchor; content words
// contribute citation phonemes. All-function-word fallback: if destressing
// leaves no primary/secondary stress anywhere, the LAST word keeps its
// citation form so an anchor exists (of it → …IH1 T).
//
// Caller (findRhymes) must validate every word is in the dictionary first;
// returns null if any word is missing (defensive — phonemesFor → null).
export function assemblePhrase(words) {
  const phonemesOf = (w, reduced) => {
    const row = FW_MAP.get(w);
    if (row && reduced) return row.variants[0].phonemes;
    return phonemesFor(w);
  };
  const out = [];
  for (const w of words) {
    const ph = phonemesOf(w, true);
    if (!ph) return null;
    out.push(...ph);
  }
  const hasStress = out.some((p) => /[12]$/u.test(p));
  if (hasStress) return out;

  // All-function fallback: rebuild with the last word in citation form.
  const out2 = [];
  words.forEach((w, idx) => {
    const reduced = idx !== words.length - 1;
    const ph = phonemesOf(w, reduced);
    if (ph) out2.push(...ph);
  });
  return out2.length ? out2 : null;
}

export { FW_TABLE };
