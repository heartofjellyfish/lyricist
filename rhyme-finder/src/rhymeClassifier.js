// ── Rhyme Classifier ────────────────────────────────────────────────
// Deterministic rhyme-type classifier grounded in Pat Pattison's
// "Songwriting: Essential Guide to Rhyming" (Berklee, 2nd ed. 2014).
//
// Given two words, returns:
//   { type, stability, masculine, vowelMatch, codaRelation, explanation, ... }
//
// Types: perfect | family | additive | subtractive | assonance | consonance
//      | identity | partial | mismatched | none
//
// Uses ARPAbet phonemes from the CMU pronouncing dictionary (via
// src/pronunciation.js). The phonetic family tables mirror
// data/rhyme-framework.json — kept in sync as constants here to avoid
// runtime JSON loading in tools that consume this module.

import { PRONUNCIATION_MAP, normalizeWordKey } from "./pronunciation.js";

// ── Phonetic family tables (from Pattison, mirrored in rhyme-framework.json)

const VOICED_PLOSIVES = new Set(["B", "D", "G"]);
const UNVOICED_PLOSIVES = new Set(["P", "T", "K"]);
const VOICED_FRICATIVES = new Set(["V", "DH", "Z", "ZH", "JH"]);
const UNVOICED_FRICATIVES = new Set(["F", "TH", "S", "SH", "CH"]);
const NASALS = new Set(["M", "N", "NG"]);
const LIQUIDS = new Set(["L", "R"]);

// Partners: same position, different voicing (closest family link for plosives).
const PARTNER_PAIRS = [
  ["B", "P"], ["D", "T"], ["G", "K"],
  ["V", "F"], ["DH", "TH"], ["Z", "S"], ["ZH", "SH"], ["JH", "CH"],
];

// Companions: same voicing, same family, different position.
const COMPANION_PAIRS = [
  // Plosives
  ["B", "D"], ["B", "G"], ["D", "G"],
  ["P", "T"], ["P", "K"], ["T", "K"],
  // Voiced fricatives
  ["V", "DH"], ["V", "Z"], ["V", "ZH"], ["V", "JH"],
  ["DH", "Z"], ["DH", "ZH"], ["DH", "JH"],
  ["Z", "ZH"], ["Z", "JH"], ["ZH", "JH"],
  // Unvoiced fricatives
  ["F", "TH"], ["F", "S"], ["F", "SH"], ["F", "CH"],
  ["TH", "S"], ["TH", "SH"], ["TH", "CH"],
  ["S", "SH"], ["S", "CH"], ["SH", "CH"],
  // Nasals (all voiced — only companions exist)
  ["M", "N"], ["M", "NG"], ["N", "NG"],
];

function keyForPair(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const PARTNER_SET = new Set(PARTNER_PAIRS.map(([a, b]) => keyForPair(a, b)));
const COMPANION_SET = new Set(COMPANION_PAIRS.map(([a, b]) => keyForPair(a, b)));

// ── Phoneme helpers ──────────────────────────────────────────────────

const VOWEL_RE = /^([A-Z]{2})([012])$/u;

function isVowel(phoneme) {
  return VOWEL_RE.test(phoneme);
}

function vowelStress(phoneme) {
  const m = phoneme.match(VOWEL_RE);
  return m ? m[2] : null;
}

function vowelBase(phoneme) {
  const m = phoneme.match(VOWEL_RE);
  return m ? m[1] : phoneme;
}

function isStressed(phoneme) {
  const s = vowelStress(phoneme);
  return s === "1" || s === "2";
}

export function phoneticFamilyOf(consonant) {
  if (VOICED_PLOSIVES.has(consonant)) return "plosive-voiced";
  if (UNVOICED_PLOSIVES.has(consonant)) return "plosive-unvoiced";
  if (VOICED_FRICATIVES.has(consonant)) return "fricative-voiced";
  if (UNVOICED_FRICATIVES.has(consonant)) return "fricative-unvoiced";
  if (NASALS.has(consonant)) return "nasal";
  if (LIQUIDS.has(consonant)) return "liquid";
  return "other";
}

// Broad phonetic group, ignoring voicing. Pattison's table at the end of
// Ch 4 lumps all plosives (b/d/g/p/t/k) into one family, all fricatives
// (v/TH/z/zh/j/f/th/s/sh/ch) into one family, and the nasals (m/n/ng).
// Cross-axis pairs (different position AND different voicing) are still
// "family rhymes" per Pattison — just looser ones, the "further away" cases.
function broadGroupOf(consonant) {
  const f = phoneticFamilyOf(consonant);
  if (f === "plosive-voiced" || f === "plosive-unvoiced") return "plosive";
  if (f === "fricative-voiced" || f === "fricative-unvoiced") return "fricative";
  return f; // nasal, liquid, other — these don't extend further.
}

export function arePartners(a, b) {
  return PARTNER_SET.has(keyForPair(a, b));
}

export function areCompanions(a, b) {
  return COMPANION_SET.has(keyForPair(a, b));
}

// Cross-axis: same broad family group, but neither partners nor companions.
// E.g., T↔B (both plosives, different position AND voicing), F↔Z, P↔D.
// The "2-hop" family relation Pattison treats as family-but-further-away.
export function areCross(a, b) {
  if (a === b) return false;
  if (arePartners(a, b) || areCompanions(a, b)) return false;
  const g = broadGroupOf(a);
  if (g !== broadGroupOf(b)) return false;
  return g === "plosive" || g === "fricative" || g === "nasal";
}

// Same phonetic family — partners, companions, OR cross-axis (all part of
// Pattison's broad family groups). Closeness within family is exposed
// via the per-position "kind" labels (same/partners/companions/cross).
export function sameFamily(a, b) {
  if (a === b) return true;
  return arePartners(a, b) || areCompanions(a, b) || areCross(a, b);
}

// ── Look up phonemes ────────────────────────────────────────────────

export function phonemesFor(word) {
  if (!word) return null;
  return PRONUNCIATION_MAP.get(normalizeWordKey(word)) ?? null;
}

// ── Split phonemes into the anatomy needed for classification ───────
//
// We want:
//   onsetBeforeStress  — consonants immediately preceding the last stressed vowel
//                         (inside the stressed syllable)
//   stressedVowel      — the last stressed vowel
//   coda               — consonants after the stressed vowel, up to either end
//                         (masculine) or up to the next vowel (feminine)
//   trailing           — for feminine rhymes: the unstressed syllable(s) after
//                         the stressed coda (vowel + any consonants)
//   masculine          — boolean: does the word END on a stressed syllable?

// CMU sometimes attaches secondary stress (digit 2) to an unstressed
// suffix syllable — most often "-y" / "-ic" / "-ish" / "-ed". The
// artifact is detectable by these properties:
//   1. The 2-stress sits on a "weak" vowel (IH, IY, AH, ER) — the
//      family of vowels English uses for reduced suffix syllables.
//   2. The 2-stressed vowel is the WORD-FINAL phoneme (i.e., the
//      suffix has no coda consonant inside the word).
//   3. The word has a primary stress somewhere else (so we have an
//      alternative anchor).
// Compound words like "candlestick" → ...IH2 K, "blackboard" → ...AO2 R D,
// "lullaby" → ...AY2 are NOT artifacts: their 2-stress either has a
// coda after it or sits on a full vowel — both patterns survive this
// filter and remain valid rhyme anchors.
const SUFFIX_ARTIFACT_VOWELS = new Set(["IH", "IY", "AH", "ER"]);

function isSuffixArtifact(phoneme, index, phonemes) {
  if (vowelStress(phoneme) !== "2") return false;
  if (index !== phonemes.length - 1) return false; // must be the last phoneme
  if (!SUFFIX_ARTIFACT_VOWELS.has(vowelBase(phoneme))) return false;
  // Only treat as artifact if a primary 1-stress exists earlier.
  for (let i = 0; i < phonemes.length; i += 1) {
    if (i !== index && vowelStress(phonemes[i]) === "1") return true;
  }
  return false;
}

function lastStressedVowelIndex(phonemes) {
  // Anchor on the LAST stressed vowel — primary OR secondary — but skip
  // CMU's "fake" secondary stresses on word-final unstressed suffixes.
  for (let i = phonemes.length - 1; i >= 0; i -= 1) {
    const ph = phonemes[i];
    if (vowelStress(ph) === "1") return i;
    if (vowelStress(ph) === "2" && !isSuffixArtifact(ph, i, phonemes)) return i;
  }
  // Fallback 1: artifact-only words with no primary (rare). Use the artifact.
  for (let i = phonemes.length - 1; i >= 0; i -= 1) {
    if (isStressed(phonemes[i])) return i;
  }
  // Fallback 2: any vowel (function words like "the" all-zero-stress).
  for (let i = phonemes.length - 1; i >= 0; i -= 1) {
    if (isVowel(phonemes[i])) return i;
  }
  return -1;
}

// English onset clusters that the stressed-syllable extractor will accept.
// Used by maxOnsetStart to decide where the previous syllable's coda ends
// and the stressed syllable's onset begins.
const VALID_ONSETS_2 = new Set([
  // Plosive + liquid
  "P R", "B R", "T R", "D R", "K R", "G R",
  "P L", "B L", "K L", "G L",
  // Plosive + W (as in "twin", "quick" /kw/)
  "T W", "D W", "K W", "G W",
  // Fricative + liquid
  "F R", "TH R", "SH R", "F L", "S L",
  // S + sonorant/plosive
  "S P", "S T", "S K", "S M", "S N", "S W",
  "TH W", "HH W",
  // Consonant + palatal Y (CMU writes "few" as F Y UW)
  "P Y", "B Y", "T Y", "D Y", "K Y", "G Y",
  "M Y", "N Y", "L Y", "F Y", "V Y", "S Y", "Z Y", "HH Y",
]);
const VALID_ONSETS_3 = new Set([
  "S P R", "S P L", "S T R", "S K R", "S K W",
]);

// Find the start index of the stressed-syllable onset cluster using the
// Maximum Onset Principle: take the LONGEST valid English onset cluster
// at the right edge of the inter-vowel consonant run. Anything left of
// that belongs to the previous syllable's coda.
//
// Examples:
//   confuse  N-F-Y → "N F Y" invalid, "F Y" valid → onset [F, Y]
//   haystack S-T   → "S T" valid → onset [S, T]
//   birthplace TH-P-L → "TH P L" invalid, "P L" valid → onset [P, L]
//   attention T    → single consonant → onset [T]
//
// Compound-vs-prefix ambiguity (e.g. misplace = MIS|PLACE morphologically,
// but max-onset gives MI|SPLACE) is resolved separately by the
// phoneme-suffix-with-different-syllable-count rule in the identity check.
function maxOnsetStart(phonemes, stressIdx) {
  let firstConsIdx = stressIdx - 1;
  while (firstConsIdx >= 0 && !isVowel(phonemes[firstConsIdx])) {
    firstConsIdx -= 1;
  }
  const clusterStart = firstConsIdx + 1;
  const clusterLen = stressIdx - clusterStart;
  if (clusterLen === 0) return stressIdx;
  // No previous vowel: the whole word starts with this cluster — all onset.
  if (firstConsIdx < 0) return clusterStart;
  // Single intervocalic consonant: V.CV pattern, consonant goes to onset.
  if (clusterLen === 1) return clusterStart;
  // Try the longest valid onset cluster at the right edge.
  if (clusterLen >= 3) {
    const c3 = phonemes.slice(stressIdx - 3, stressIdx).join(" ");
    if (VALID_ONSETS_3.has(c3)) return stressIdx - 3;
  }
  if (clusterLen >= 2) {
    const c2 = phonemes.slice(stressIdx - 2, stressIdx).join(" ");
    if (VALID_ONSETS_2.has(c2)) return stressIdx - 2;
  }
  // Fall back: only the last consonant is onset, rest goes to previous coda.
  return stressIdx - 1;
}

export function analyzeWord(word) {
  const phonemes = phonemesFor(word);
  if (!phonemes || phonemes.length === 0) {
    return null;
  }

  const stressIdx = lastStressedVowelIndex(phonemes);
  if (stressIdx === -1) return null;

  // Onset: consonants forming the stressed syllable's onset cluster.
  // Apply Maximum Onset Principle (rising sonority) so cross-syllable
  // clusters like the "N" in "con-fuse" stay with the previous syllable.
  const onsetStart = maxOnsetStart(phonemes, stressIdx);
  const onset = phonemes.slice(onsetStart, stressIdx);

  // Coda: consonants immediately after the stressed vowel, up to the next vowel (if any).
  let afterIdx = stressIdx + 1;
  while (afterIdx < phonemes.length && !isVowel(phonemes[afterIdx])) afterIdx += 1;
  const coda = phonemes.slice(stressIdx + 1, afterIdx);

  // Trailing = everything after the stressed coda (another vowel + its coda, etc.)
  const trailing = phonemes.slice(afterIdx);
  const masculine = trailing.length === 0;

  return {
    word,
    phonemes,
    stressedVowel: vowelBase(phonemes[stressIdx]),
    stressedVowelFull: phonemes[stressIdx],
    onset,
    coda,
    trailing,
    masculine,
  };
}

// ── Coda comparison ─────────────────────────────────────────────────
//
// Returns one of:
//   { relation: "same" }
//   { relation: "family", notes: [...pairwise notes] }
//   { relation: "additive", extra: [...consonants], side: "A" | "B" }
//   { relation: "unrelated" }

// Compare two consonant sequences position-by-position. Each position
// must be same / partners / companions / cross (all four count as "in
// the same broad family group"). Returns null if any position is unrelated.
function alignCodas(codaA, codaB) {
  if (codaA.length !== codaB.length) return null;
  const notes = [];
  let anyDifferent = false;
  for (let i = 0; i < codaA.length; i += 1) {
    const a = codaA[i];
    const b = codaB[i];
    if (a === b) {
      notes.push({ a, b, kind: "same" });
    } else if (arePartners(a, b)) {
      notes.push({ a, b, kind: "partners" });
      anyDifferent = true;
    } else if (areCompanions(a, b)) {
      notes.push({ a, b, kind: "companions" });
      anyDifferent = true;
    } else if (areCross(a, b)) {
      notes.push({ a, b, kind: "cross" });
      anyDifferent = true;
    } else {
      return null;
    }
  }
  return { notes, anyDifferent };
}

function compareCodas(codaA, codaB) {
  if (codaA.length === 0 && codaB.length === 0) {
    return { relation: "same" };
  }

  if (codaA.join(" ") === codaB.join(" ")) {
    return { relation: "same" };
  }

  // Family: same length, each position same-or-family.
  const aligned = alignCodas(codaA, codaB);
  if (aligned && aligned.anyDifferent) {
    return { relation: "family", notes: aligned.notes };
  }

  // Additive/subtractive: one side has 1-2 extra consonants. The "base" after
  // removing the extras should align with the other coda as same-or-family.
  // (This captures Pattison's "fast/as" = subtractive with S↔Z partners, and
  // "him/wind" = family/additive with M↔N companion + extra D.)
  const lenDiff = Math.abs(codaA.length - codaB.length);
  if (lenDiff >= 1 && lenDiff <= 2) {
    const [shorter, longer, side] =
      codaA.length < codaB.length
        ? [codaA, codaB, "B"]
        : [codaB, codaA, "A"];

    // Try every way of placing `shorter` inside `longer`; the unmatched
    // positions become the "extra" consonants.
    for (let offset = 0; offset <= longer.length - shorter.length; offset += 1) {
      const slice = longer.slice(offset, offset + shorter.length);
      const sub = alignCodas(shorter, slice);
      if (sub) {
        const extra = [
          ...longer.slice(0, offset),
          ...longer.slice(offset + shorter.length),
        ];
        return {
          relation: "additive",
          extra,
          side,
          baseNotes: sub.notes,
          baseHasFamilyDiff: sub.anyDifferent,
        };
      }
    }
  }

  return { relation: "unrelated" };
}

// Is one phoneme sequence a suffix of the other? (Used for identity detection:
// `fuse` is a suffix of `confuse`, `place` is a suffix of `replace`.)
// CMU is inconsistent about the WORD-FINAL "happy vowel" (the unstressed
// /i/ in -y / -ic / -ish suffixes). The same English sound is spelled
// IH0 / IH2 / IY0 / IY2 across different entries, e.g.:
//   agronomy  → ...M IH2     (CMU 0.7b)
//   autonomy  → ...M IY0
//   economy   → ...M IY0
//   library   → ...R IY2
//   happy     → ...P IY0
// For rhyme matching, treat all four as the same canonical token at
// the end of a trailing.
const Y_SUFFIX_VOWELS = new Set(["IH0", "IH2", "IY0", "IY2"]);

function trailingsMatch(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    let pa = a[i];
    let pb = b[i];
    if (i === a.length - 1) {
      if (Y_SUFFIX_VOWELS.has(pa)) pa = "_Y";
      if (Y_SUFFIX_VOWELS.has(pb)) pb = "_Y";
    }
    if (pa !== pb) return false;
  }
  return true;
}

// Identity per Pattison (Ch 1): the ear hears repetition, not tension.
// Two routes converge here, both fired by checkIdentity():
//
//   Route A — stressed-syllable match. The analyzed onset, stressed
//     vowel, and coda are all equal. Catches command/commanding (mas vs
//     fem, same stressed syll), attention/detention/intention (different
//     unstressed prefixes, identical stressed-syll-onward content).
//
//   Route B — phoneme-suffix with different syllable count. The shorter
//     word's phonemes (ignoring stress digit) appear as the tail of the
//     longer word's phonemes, and the syllable counts differ. Catches
//     fuse/confuse, place/replace, place/birthplace, place/misplace —
//     where the longer word adds an unstressed prefix syllable, so the
//     onset clusters don't compare cleanly under the "drop first
//     intervocalic consonant" heuristic but the suffix relation is
//     unambiguous.
//
// The syllable-count guard on Route B is what keeps scare/care, stop/top,
// spice/ice from false-firing as identity — those have matching tails but
// the same syllable count, so they're real rhymes (different cluster
// onsets in the stressed syllable).

function syllableCount(phonemes) {
  let n = 0;
  for (const p of phonemes) {
    if (VOWEL_RE.test(p)) n += 1;
  }
  return n;
}

function sameStressedSyllable(a, b) {
  if (a.onset.length !== b.onset.length) return false;
  for (let i = 0; i < a.onset.length; i += 1) {
    if (a.onset[i] !== b.onset[i]) return false;
  }
  if (a.stressedVowel !== b.stressedVowel) return false;
  if (a.coda.length !== b.coda.length) return false;
  for (let i = 0; i < a.coda.length; i += 1) {
    if (a.coda[i] !== b.coda[i]) return false;
  }
  return true;
}

function phonemeSuffixDifferentSyll(phA, phB) {
  if (phA.length === phB.length) return false;
  const sylA = syllableCount(phA);
  const sylB = syllableCount(phB);
  if (sylA === sylB) return false;
  const [shorter, longer] = phA.length < phB.length ? [phA, phB] : [phB, phA];
  const offset = longer.length - shorter.length;
  for (let i = 0; i < shorter.length; i += 1) {
    if (vowelBase(shorter[i]) !== vowelBase(longer[offset + i])) return false;
  }
  return true;
}

// ── Main classifier ─────────────────────────────────────────────────

/**
 * Classify the rhyme relationship between two words.
 *
 * @param {string} wordA
 * @param {string} wordB
 * @returns {object} classification
 */
export function classifyRhyme(wordA, wordB) {
  const a = analyzeWord(wordA);
  const b = analyzeWord(wordB);

  if (!a || !b) {
    return {
      type: "unknown",
      stability: 0,
      wordA,
      wordB,
      explanation: "One or both words are not in the pronouncing dictionary.",
    };
  }

  // Identity per Pattison (Ch 1): the ear hears repetition, not tension.
  // Three cases all collapse to the same rule:
  //   (1) Same spelled word — literal repetition.
  //   (2) Identical phoneme sequences — homophones (peace/piece).
  //   (3) Stressed syllables share the same onset + vowel + coda
  //       (fuse/confuse, place/birthplace, attention/detention,
  //       command/commanding). Trailing may differ (mas vs fem with
  //       same stressed syll = identity, no rhyme to find).
  const sameSpelling = normalizeWordKey(wordA) === normalizeWordKey(wordB);
  const phonemesEqual =
    a.phonemes.length === b.phonemes.length &&
    a.phonemes.every((p, i) => p === b.phonemes[i]);
  const sameStressed =
    !phonemesEqual &&
    (sameStressedSyllable(a, b) ||
      phonemeSuffixDifferentSyll(a.phonemes, b.phonemes));

  if (sameSpelling || phonemesEqual || sameStressed) {
    return {
      type: "identity",
      stability: 0,
      isRhyme: false,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      explanation: sameSpelling
        ? "Same word — repetition, not rhyme."
        : phonemesEqual
        ? "Homophones — identical pronunciation. The ear hears echo, not tension."
        : "Identity — stressed syllables share the same onset, vowel, and coda. The ear hears repetition, not tension/resolution.",
    };
  }

  // Masculine / feminine mismatch check.
  // Partial rhyme = masculine pairs with the stressed syllable of a feminine
  // word, leaving the feminine's trailing syllable unrhymed.
  if (a.masculine !== b.masculine) {
    // Partial rhyme (Pattison): the masculine word pairs with the STRESSED
    // syllable of the feminine word; the feminine's trailing unstressed
    // syllable is left unrhymed. The stressed-syllable pairing can be at any
    // level (perfect/family/additive/assonance). Minimum bar: vowels match.
    const vowelMatch = a.stressedVowel === b.stressedVowel;
    const codaCmp = compareCodas(a.coda, b.coda);

    if (vowelMatch) {
      const codaLevel =
        codaCmp.relation === "same"
          ? "perfect"
          : codaCmp.relation === "family"
          ? "family"
          : codaCmp.relation === "additive"
          ? "additive"
          : "assonance";
      return {
        type: "partial",
        stability: 2,
        isRhyme: true,
        wordA,
        wordB,
        masculineA: a.masculine,
        masculineB: b.masculine,
        stressedVowelA: a.stressedVowel,
        stressedVowelB: b.stressedVowel,
        codaA: a.coda,
        codaB: b.coda,
        codaRelation: codaCmp,
        innerLevel: codaLevel,
        explanation:
          `Partial rhyme. The masculine word pairs with the stressed syllable of the feminine word (${codaLevel}-level match); the feminine's trailing unstressed syllable stays unrhymed. Good for preventing closure, keeping motion into the next section.`,
      };
    }

    // Different vowels across a mas/fem pair — falls back to consonance-partial
    // if codas match, else mismatched.
    if (codaCmp.relation === "same" && (a.coda.length > 0 || b.coda.length > 0)) {
      return {
        type: "partial",
        stability: 1,
        isRhyme: true,
        wordA,
        wordB,
        masculineA: a.masculine,
        masculineB: b.masculine,
        stressedVowelA: a.stressedVowel,
        stressedVowelB: b.stressedVowel,
        codaA: a.coda,
        codaB: b.coda,
        codaRelation: codaCmp,
        innerLevel: "consonance",
        explanation:
          "Partial rhyme at consonance level — the masculine word's coda matches the feminine's stressed-syllable coda, but the vowels differ. Very unstable, but binds the lines sonically.",
      };
    }

    return {
      type: "mismatched",
      stability: 0,
      isRhyme: false,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      explanation:
        "Masculine ↔ feminine mismatch. The stresses don't align, and the stressed syllables don't rhyme closely enough for a partial rhyme.",
    };
  }

  // From here: same class (both masculine or both feminine).
  const vowelMatch = a.stressedVowel === b.stressedVowel;
  const codaCmp = compareCodas(a.coda, b.coda);

  // Feminine rhymes: per Pattison, the unstressed trailing is "usually
  // identity, but [doesn't] have to be." We only enforce trailing identity
  // for the resolved tiers (perfect / family / additive) — there the
  // mismatch genuinely breaks the rhyme. For weaker tiers (assonance,
  // consonance, partial), Pattison's worksheets explicitly use feminine
  // pairs with mismatched trailings (lonely/voting, lonely/solely) as
  // valid feminine assonance; rejecting those would be wrong.
  const trailingSame = trailingsMatch(a.trailing, b.trailing);
  const bothFeminine = !a.masculine && !b.masculine;
  const femTrailingMismatch = bothFeminine && !trailingSame;
  const femNote =
    a.masculine
      ? ""
      : trailingSame
      ? " (Feminine — trailing syllables match, extending the resolution.)"
      : " (Feminine — trailings differ, weakening the resolution.)";

  // Now the main decision tree:
  if (vowelMatch && codaCmp.relation === "same") {
    // Feminine pair with mismatched trailings (passion/ashes type) —
    // the stressed syllable is a full perfect match but the unstressed
    // tail diverges, so the rhyme doesn't slam the door shut. Pattison
    // calls these "not perfect rhymes, but their sonic connection is
    // undeniable" — that's family-strength territory.
    if (femTrailingMismatch) {
      return {
        type: "family",
        stability: 4,
        familyCloseness: "tight",
        isRhyme: true,
        wordA,
        wordB,
        masculineA: a.masculine,
        masculineB: b.masculine,
        stressedVowelA: a.stressedVowel,
        stressedVowelB: b.stressedVowel,
        codaA: a.coda,
        codaB: b.coda,
        codaRelation: codaCmp,
        trailingSame,
        explanation:
          "Feminine pair — perfect on the stressed syllable but the unstressed tails differ. Strong sonic link without the full slam-the-door close." +
          femNote,
      };
    }
    return {
      type: "perfect",
      stability: 5,
      isRhyme: true,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      codaA: a.coda,
      codaB: b.coda,
      codaRelation: codaCmp,
      trailingSame,
      explanation:
        "Perfect rhyme — same vowel, same coda, different onset. Maximum resolution; certainty, commitment, slamming the door shut." +
        femNote,
    };
  }

  if (vowelMatch && codaCmp.relation === "family") {
    // Closeness within the family tier. Three sub-tiers, exposed only as
    // a sort key (no UI label) — let the user scan tightest matches first
    // without having to learn Pattison's vocabulary. The whole pair's
    // closeness is the loosest single position (the bottleneck the ear hears).
    //   tight   — every position is same or partners
    //   medium  — at least one companion, no cross
    //   loose   — at least one cross-axis swap (Pattison's "further away")
    const hasCross = codaCmp.notes.some((n) => n.kind === "cross");
    const hasCompanion = codaCmp.notes.some((n) => n.kind === "companions");
    const familyCloseness = hasCross
      ? "loose"
      : hasCompanion
      ? "medium"
      : "tight";
    return {
      type: "family",
      stability: 4,
      familyCloseness,
      isRhyme: true,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      codaA: a.coda,
      codaB: b.coda,
      codaRelation: codaCmp,
      trailingSame,
      explanation:
        `Family rhyme — same vowel, coda consonants in the same phonetic family. ${
          familyCloseness === "tight"
            ? "Tight link — close to a perfect rhyme."
            : familyCloseness === "medium"
            ? "Solid family link with a fresh edge."
            : "Looser family link — phonetically further away but still in the same family."
        } Mostly resolved; an escape from cliché-prone perfect pairs.` +
        femNote,
    };
  }

  if (vowelMatch && codaCmp.relation === "additive") {
    const extraStr = codaCmp.extra.join("");
    // Liquids (R, L) make extra consonants easiest to hide.
    const liquidMask =
      a.coda.some((c) => LIQUIDS.has(c)) || b.coda.some((c) => LIQUIDS.has(c));
    return {
      type: codaCmp.side === "B" ? "additive" : "subtractive",
      stability: 3,
      isRhyme: true,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      codaA: a.coda,
      codaB: b.coda,
      codaRelation: codaCmp,
      trailingSame,
      explanation:
        `Additive / subtractive — same vowel, one side adds "${extraStr}" to the otherwise-matching coda. ${
          liquidMask
            ? "Liquid (R/L) endings hide the added consonant well."
            : "Still resolves, with a small catch."
        }` + femNote,
    };
  }

  if (vowelMatch && codaCmp.relation === "unrelated") {
    const strong = !a.masculine; // feminine assonance is much stronger than masculine
    return {
      type: "assonance",
      stability: 2,
      isRhyme: true,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      codaA: a.coda,
      codaB: b.coda,
      codaRelation: codaCmp,
      trailingSame,
      explanation:
        `Assonance — same vowel, unrelated coda consonants. Rings but hangs, doesn't close. ${
          strong
            ? "Feminine assonance carries weight — can pass for perfect rhyme."
            : "Masculine assonance is weak; use feminine for real strength."
        }`,
    };
  }

  // Consonance: different vowel, same coda
  if (!vowelMatch && codaCmp.relation === "same" && (a.coda.length > 0 || b.coda.length > 0)) {
    const heldCoda =
      a.coda.some((c) => LIQUIDS.has(c) || NASALS.has(c)) ||
      a.coda.length >= 2;
    return {
      type: "consonance",
      stability: 1,
      isRhyme: true,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      codaA: a.coda,
      codaB: b.coda,
      codaRelation: codaCmp,
      trailingSame,
      explanation:
        `Consonance — different vowels, same coda consonants. Unresolved, suspended, aching. ${
          heldCoda
            ? "The coda (liquid/nasal/multi-consonant) holds the sound so the rhyme lands."
            : "Easy to miss — Pattison's 'back of the hand rule' (would the line allow 'Alas!'?)."
        }`,
    };
  }

  // Consonance with coda in family (loose consonance)
  if (!vowelMatch && codaCmp.relation === "family") {
    return {
      type: "consonance",
      stability: 1,
      isRhyme: true,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      codaA: a.coda,
      codaB: b.coda,
      codaRelation: codaCmp,
      trailingSame,
      explanation:
        "Loose consonance — different vowels, coda consonants in the same phonetic family. Very suspended; risks missing entirely.",
    };
  }

  // Consonance with R/L color (word/card, snarl/curl): vowels differ,
  // codas differ by exactly one liquid (R or L), and the BASE codas after
  // removing the liquid match identically. Pattison treats these as
  // consonance — the L/R colors the cluster but the terminating consonant
  // still matches at the end of the line.
  if (
    !vowelMatch &&
    codaCmp.relation === "additive" &&
    codaCmp.extra.length === 1 &&
    LIQUIDS.has(codaCmp.extra[0]) &&
    codaCmp.baseHasFamilyDiff === false
  ) {
    return {
      type: "consonance",
      stability: 1,
      isRhyme: true,
      wordA,
      wordB,
      masculineA: a.masculine,
      masculineB: b.masculine,
      stressedVowelA: a.stressedVowel,
      stressedVowelB: b.stressedVowel,
      codaA: a.coda,
      codaB: b.coda,
      codaRelation: codaCmp,
      trailingSame,
      explanation:
        "Consonance with R/L color — different vowels, the codas terminate on the same consonant but one side carries an extra liquid (R/L) before it. The shared ending consonant lands the rhyme.",
    };
  }

  return {
    type: "none",
    stability: 0,
    isRhyme: false,
    wordA,
    wordB,
    masculineA: a.masculine,
    masculineB: b.masculine,
    stressedVowelA: a.stressedVowel,
    stressedVowelB: b.stressedVowel,
    codaA: a.coda,
    codaB: b.coda,
    codaRelation: codaCmp,
    explanation: "Not a rhyme — vowels don't match and codas aren't related.",
  };
}

// ── Convenience: classify the end-rhymes of two lyric lines ─────────

function lastWordOfLine(line) {
  if (!line) return "";
  const tokens = line
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
  return tokens[tokens.length - 1] ?? "";
}

export function classifyLineEndRhyme(lineA, lineB) {
  const a = lastWordOfLine(lineA);
  const b = lastWordOfLine(lineB);
  return {
    lineA,
    lineB,
    lastWordA: a,
    lastWordB: b,
    ...classifyRhyme(a, b),
  };
}

// ── Batch: classify a scheme across multiple lines ──────────────────
//
// Given lines + a scheme like "abab", returns the rhyme classification
// for each letter's pair(s).

export function classifyScheme(lines, scheme) {
  if (lines.length !== scheme.length) {
    throw new Error("lines.length must equal scheme.length");
  }

  const groups = new Map();
  for (let i = 0; i < scheme.length; i += 1) {
    const letter = scheme[i];
    if (letter === "x") continue; // unrhymed
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push({ index: i, line: lines[i] });
  }

  const results = [];
  for (const [letter, members] of groups) {
    for (let i = 1; i < members.length; i += 1) {
      const cls = classifyLineEndRhyme(members[0].line, members[i].line);
      results.push({
        letter,
        indexA: members[0].index,
        indexB: members[i].index,
        ...cls,
      });
    }
  }
  return results;
}
