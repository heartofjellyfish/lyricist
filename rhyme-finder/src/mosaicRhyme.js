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
// object). "her" as a possessive reading is NOT credited because a
// line-final "her" reads as the object.
//
// Every tail WITHOUT `obj` (particle, preposition, determiner, possessive,
// conjunction) is subject to the attestation gate (§5.3b): it only surfaces
// when a real song ends a line that way. There's no grammatical model for
// whether "spend for" reads as a natural line-ending — corpus evidence is
// the only signal, unlike object-pronoun tails which the verb-frame gate
// clears.
//
// LINE-FINAL REDUCIBILITY (2026-07-09) — every row must be a word that
// stays PHONETICALLY REDUCED in line-final position, because rhyme position
// IS line-final. Clitic object pronouns (know it, get 'er), stranded
// prepositions (die for, made of, wanted to), post-verbal locative "there"
// (end there) and enjambment "a/and/your/or" qualify. Pro-forms and
// particles do NOT: line-final "that/what/this/so/do/did/one/not" (pronoun
// or pro-verb) and "up/out/on/in/off/at/all" (phrasal particles) take
// phrase-final stress, so the reduced reading the mosaic needs never occurs
// where a rhyme sits. The corpus's own partner detection certified this
// before the July 2026 prune: lines ending "can do" rhymed with you/too/
// true (stressed UW1, not a banana/"CAN-duh" feminine), "been that"/"hear
// that" with at/flag/ass (stressed AE1 T), "get in"/"give in" with win/thin/
// skin (stressed IH1 N). Those rows were removed rather than kept as
// badge-bearing false rhymes; "there" stays on the strength of feminine
// partner evidence (end there ↔ pretender). Casualties accepted with the
// usual trade (rainbow/elbow): rare genuinely-reduced line-finals like
// "lived in / forgiven" go down with the overwhelmingly-stressed majority.
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
  { word: "or",   variants: [["ER0"]] },
  { word: "for",  variants: [["F ER0"]] },
  { word: "your", variants: [["Y ER0"]] },
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

function buildHeadIndex(corpusEntries, isAcceptableWord, scoreOf, verbObjectMask) {
  const index = new Map();
  for (const entry of corpusEntries) {
    if (!entry.rhymeTail || entry.rhymeTail.length === 0) continue;
    if (!isAcceptableWord(entry.text, entry.syllables)) continue;
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
      // Object-class bits (person/thing) from mosaic-verbs.json — checked
      // against the TAIL's requirement at pair time, since the same head
      // serves many tails. 0 for non-verbs AND for verbs with no bare-object
      // frame (weekend, depend): both can still head a mosaic, but only an
      // ATTESTED one (§5.3c) — the mask is the speculative-generation
      // license, not a head gate. This is what admits "before me / glory",
      // "to you / hallelujah", "behind her / reminder" once the corpus
      // attests them, while "oh it" / "scott her" stay dead (never attested).
      objMask: verbObjectMask(entry.text),
    });
  }
  // Pre-sort each bucket by score desc so ranking ties are pre-broken.
  for (const bucket of index.values()) {
    bucket.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  }
  return index;
}

function ensureHeadIndex(corpusEntries, isAcceptableWord, scoreOf, verbObjectMask) {
  if (HEAD_INDEX && HEAD_INDEX_SRC === corpusEntries) return HEAD_INDEX;
  HEAD_INDEX = buildHeadIndex(corpusEntries, isAcceptableWord, scoreOf, verbObjectMask);
  HEAD_INDEX_SRC = corpusEntries;
  return HEAD_INDEX;
}

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
 * A candidate surfaces through exactly one of two evidence paths:
 *   SPECULATIVE — object-pronoun tail + head verb whose WordNet frames
 *     accept that object class ("bought her", "know it"). Grammar is the
 *     evidence.
 *   ATTESTED — any other (head, tail) combination, but ONLY when the exact
 *     phrase ends a real song line in the corpus ("die for", "before me",
 *     "to you"). Usage is the evidence.
 * Everything else stays dead ("oh it", "spend for", "scott her").
 *
 * @param {object} source           analysis object (analyzeWord / analyzeFromPhonemes)
 * @param {object[]} corpusEntries  the finder's CORPUS_ENTRIES (reused, not rebuilt)
 * @param {object} deps
 * @param {(word:string, syll:number)=>boolean} deps.isAcceptableWord
 * @param {(word:string)=>number} deps.scoreOf   lyric-familiarity score
 * @param {(word:string)=>number} [deps.verbObjectMask]  WordNet object-frame bits (0 = no speculative license)
 * @param {(display:string)=>boolean} [deps.isAttested]  phrase ends a real song line
 * @param {Set<string>} [deps.exclude]           head words to reject (source + phrase constituents)
 * @returns {object[]} emitted mosaic rows (see §5.5 shape)
 */
export function generateMosaics(source, corpusEntries, deps) {
  if (!source || !source.phonemes) return [];
  // Mosaic rhyme is inherently a feminine-ending phenomenon — the tail
  // word carries post-stress material. Masculine sources get zero mosaics.
  if (!source.trailing || source.trailing.length === 0) return [];

  const { isAcceptableWord, scoreOf } = deps;
  // Speculative-generation license (§5.3): permissive default for tests
  // without the verb file — every head may pair with object-pronoun tails.
  const verbObjectMask = deps.verbObjectMask ?? (() => OBJ_PERSON | OBJ_THING);
  // Attestation gate (§5.3b/c): permissive default mirrors verbObjectMask's.
  const isAttested = deps.isAttested ?? (() => true);
  const exclude = deps.exclude ?? new Set();
  const index = ensureHeadIndex(corpusEntries, isAcceptableWord, scoreOf, verbObjectMask);

  const anchorIdx = rhymeAnchorIndex(source.phonemes);
  if (anchorIdx === -1) return [];
  const R = source.phonemes.slice(anchorIdx); // stressed vowel onward

  // Winner-per-key map: (headWord | matched-tail token) → best row.
  const byKey = new Map();
  // Identity-pair suppression: when a (head, function-word) pair's NATURAL
  // reduced reading classifies as identity — "mind her" ≡ reminder,
  // "let her" ≡ letter, "spied her" ≡ spider — its citation variant (the
  // audible-H reading, one inserted consonant) must not resurrect the pair
  // as "additive": the ear still hears repetition, and the design excludes
  // identity mosaics outright (§2). Variants are ordered canonical-reduced
  // first and the head loop nests inside the variant loop, so the identity
  // reading is always seen before the citation reading of the same pair.
  // Pairs whose EVERY reading carries real contrast stay: "forget me" /
  // spaghetti and "sit me" / city share the source's stressed syllable but
  // the tail's M contributes an honest additive consonant in all readings —
  // the classifier, not a head-level rule, is the judge (§3 invariant).
  const identityPairs = new Set();

  for (let i = 1; i < R.length; i += 1) {
    const head = R.slice(0, i);
    const tail = R.slice(i);
    const prevPhoneme = R[i - 1]; // head's last phoneme, for geminate detection

    const bucket = index.get(headKey(head));
    if (!bucket || bucket.length === 0) continue;

    for (const fw of FW_TABLE) {
      for (const variant of fw.variants) {
        const m = matchTail(variant.phonemes, tail, prevPhoneme);
        if (!m) continue;
        const dedupTail = tailKey(
          m.joinType === "geminate" ? variant.phonemes.slice(1) : variant.phonemes,
        );

        for (const headEntry of bucket) {
          if (exclude.has(headEntry.text)) continue;
          const label = `${headEntry.text} ${fw.word}`;
          if (identityPairs.has(label)) continue;
          // Evidence gate: speculative path (object-pronoun tail + a head
          // verb frame-licensed for that object class), else corpus
          // attestation. Non-verbs and frameless verbs have objMask 0, so
          // they ride the attestation path only.
          const speculative = fw.objMask && headEntry.objMask & fw.objMask;
          const attested = isAttested(label);
          if (!speculative && !attested) continue;
          // Assembly (§5.4): use the MATCHED variant, not citation. Geminate
          // joins degeminate (drop the variant's initial consonant — English
          // collapses the doubled boundary consonant).
          const tailPart =
            m.joinType === "geminate" ? variant.phonemes.slice(1) : variant.phonemes;
          const phonemes = [...headEntry.phonemes, ...tailPart];
          const analysis = analyzeFromPhonemes(label, phonemes);
          if (!analysis) continue;
          const cls = classifyRhymeAnalyzed(source, analysis);
          if (cls.type === "identity") {
            identityPairs.add(label); // poison the citation twin too
            continue;
          }
          if (!cls.isRhyme || !KEEP_TYPES.has(cls.type)) continue;

          const dedupKey = `${headEntry.text}|${dedupTail}`;
          const row = {
            words: [headEntry.text, fw.word],
            display: label,
            type: cls.type,
            joinType: m.joinType,
            weakForm: variant.weak,
            attested,
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

  // Rank (§5.5): tier → attested → joinType → head score desc → tail
  // priority → alpha. Attested-before-speculative within a tier both puts
  // corpus-proven rows first ("know it" over "grow it") and guarantees the
  // MOSAIC_CAP can never truncate an attested row in favor of speculation.
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

  return rows.slice(0, MOSAIC_CAP).map((row) => {
    const { priority, ...rest } = row; // drop the internal sort key
    return rest;
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
  if (a.attested !== b.attested) return a.attested ? -1 : 1;
  const j = (JOIN_RANK[a.joinType] ?? 9) - (JOIN_RANK[b.joinType] ?? 9);
  if (j !== 0) return j;
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
