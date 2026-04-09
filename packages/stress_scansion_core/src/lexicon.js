import { dictionary as cmuDictionary } from "../../../node_modules/cmu-pronouncing-dictionary/index.js";
import { normalizeWord } from "./text.js";
import { buildStressPattern, joinStressPattern } from "./stressTokens.js";

const PREPOSITIONS = new Set([
  "into",
  "after",
  "over",
  "under",
  "during",
  "onto",
  "minus",
  "versus",
  "within",
  "without",
  "upon",
  "above",
  "about",
  "along",
  "below",
  "among",
  "beneath",
  "except",
  "across",
  "around",
  "beside",
  "before",
  "between",
  "against",
  "behind",
  "beyond",
  "until",
  "till",
  "til",
  "despite",
  "throughout",
  "aboard",
  "amidst",
  "amid",
  "toward",
  "towards",
  "with",
  "through",
  "for",
  "to",
  "in",
  "on",
  "at",
  "from",
  "off",
  "of",
  "by",
]);

const ARTICLES = new Set(["a", "an", "the"]);

// Determiners and quantifiers. Like articles, these are function words that
// modify nouns and are typically unstressed in natural speech. Keeping them
// separate from ARTICLES preserves grammatical accuracy while applying the
// same "prefer da" rule via the function-word branch in deriveLyricStressPatterns.
const DETERMINERS = new Set([
  "some", "any", "each", "every", "no", "all", "both", "few", "many",
  "much", "more", "most", "less", "least", "either", "neither", "several",
]);
const CONJUNCTIONS = new Set([
  "and", "or", "but", "nor", "yet", "so", "because",
  "as", "if", "once", "since", "than", "though",
  "although", "unless", "while", "whereas",
]);
const RELATIVE_PRONOUNS = new Set([
  "who",
  "whom",
  "whose",
  "which",
  "that",
  "when",
  "where",
  "why",
  "what",
  "how",
]);
const PRONOUNS = new Set([
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "him",
  "his",
  "her",
  "hers",
  "us",
  "them",
  "my",
  "your",
  "our",
  "their",
  "mine",
  "yours",
  "ours",
  "theirs",
  "it",
  "its",
  "this",
  "these",
  "those",
]);

// Pronoun+auxiliary contractions where both components are function words,
// so the contraction as a whole should also prefer da (unstressed).
// Excludes negation contractions (isn't, can't, won't…) — the negation
// can carry stress and CMU handles those reasonably.
// Excludes possessives (Jane's, Cohen's) — base noun keeps its stress.
const CONTRACTIONS = new Set([
  // pronoun + be
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're", "there's",
  // pronoun + have
  "i've", "you've", "we've", "they've",
  // pronoun + will
  "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  // pronoun + would / had
  "i'd", "you'd", "he'd", "she'd", "we'd", "they'd",
  // interrogative / demonstrative pronoun + is/has
  // both components are function words, so the contraction prefers da
  "what's", "that's", "here's", "where's", "who's", "how's", "when's", "why's",
]);
const AUXILIARIES = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "can",
  "could",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "let",
  "lets",
]);

// Words where CMU stores the verb pronunciation (da-DUM) but are equally
// common as nouns/adjectives (DUM-da). When CMU gives da-DUM for one of
// these, both patterns are accepted with DUM-da preferred.
// Source: English "initial-stress-derived nouns" (Wikipedia) — ~170 pairs.
// Each entry: CMU stores verb form (da-DUM); noun/adj form is DUM-da.
// Condition in buildEntry: only fires when CMU pattern IS ["da","DUM"],
// so words where CMU already gives the noun form are silently skipped.
// Covers the full inventory of English 2-syllable initial-stress-derived
// nouns documented in linguistics literature (~170 pairs; 3-syllable pairs
// like "attribute" are excluded — they'd need a separate da-DUM-da flip).
const STRESS_SHIFTING_HETERONYMS = new Set([
  // AB- / AD- / AF-
  "absent", "abstract", "accent", "addict", "address", "affect", "affix",
  // AL- / AN- / AS- / AU-
  "alloy", "ally", "annex", "assay", "augment",
  // BE- / BO-
  "belay", "bombard",
  // COM- / CON-  (largest group — Latin con- prefix verbs)
  "combat", "combine", "commune", "compact", "compound", "compress",
  "concert", "conduct", "confect", "confine", "conflict", "conscript",
  "conserve", "consort", "construct", "consult", "content", "contest",
  "contract", "contrast", "converse", "convert", "convict",
  // DE- / DI- / DIS-
  "decrease", "default", "defect", "detail", "dictate", "digest",
  "discard", "discharge", "discount", "dismount", "dispute",
  // ES- / EX-
  "escort", "essay", "excise", "exploit", "export", "extract",
  // FER- / FI- / FOR- / FRAG- / FRE-
  "ferment", "finance", "foretaste", "fragment", "frequent",
  // IM-
  "impact", "implant", "import", "impress", "imprint", "impound",
  // IN-
  "incense", "incline", "increase", "indent", "inlay", "insert",
  "insult", "intern", "intrigue", "invert",
  // MAN- / MIS-
  "mandate", "mismatch", "misprint",
  // OB- / OFF-
  "object", "offset",
  // PER-
  "perfect", "perfume", "permit", "pervert",
  // PRE-
  "prefix",
  // PRO-
  "present", "produce", "progress", "project", "protest", "purport",
  // RE-
  "rebel", "recall", "recap", "recess", "recoil", "record", "recount", "redress",
  "refill", "refund", "refuse", "regress", "rehash", "reject", "relapse",
  "relay", "remake", "reprint", "research", "reset", "retake", "rewrite",
  // SEG- / SUB- / SUR- / SUS-
  "segment", "subject", "survey", "suspect",
  // TOR- / TRAV- / TRANS-
  "torment", "transfer", "transplant", "transport", "traverse",
  // UP-
  "upgrade", "uplift", "upset",
]);

const LYRIC_STRESS_OVERRIDES = {
  into: {
    preferredLyricStressPatterns: [["dum", "da"]],
    acceptedLyricStressPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  after: {
    preferredLyricStressPatterns: [["dum", "da"]],
    acceptedLyricStressPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  over: {
    preferredLyricStressPatterns: [["dum", "da"]],
    acceptedLyricStressPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  under: {
    preferredLyricStressPatterns: [["dum", "da"]],
    acceptedLyricStressPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  during: {
    preferredLyricStressPatterns: [["dum", "da"]],
    acceptedLyricStressPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  onto: {
    preferredLyricStressPatterns: [["dum", "da"]],
    acceptedLyricStressPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  within: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  without: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  above: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  about: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  across: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  before: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  between: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  against: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  beyond: {
    preferredLyricStressPatterns: [["da", "dum"]],
    acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  i: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  she: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  we: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  you: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  my: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  your: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  is: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  are: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  am: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  was: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  were: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  be: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  been: {
    preferredLyricStressPatterns: [["da"]],
    acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
  },
  being: {
    preferredLyricStressPatterns: [["DUM", "da"]],
    acceptedLyricStressPatterns: [["DUM", "da"], ["dum", "da"]],
  },
  // "our" is monosyllabic in lyrics despite CMU giving 2 syllables
  our: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  // "every" is 3 syllables in CMU (EH1 V ER0 IY0) but virtually always
  // reduced to 2 syllables in song (EV-ry). Prefer DUM-da; accept DUM-da-da.
  every: { preferredLyricStressPatterns: [["DUM", "da"]], acceptedLyricStressPatterns: [["DUM", "da"], ["DUM", "da", "da"]] },
  // Demonstratives default to da
  this: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  these: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  those: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  // Relative/interrogative pronouns
  who: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  what: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  which: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  where: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  when: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  how: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  // Auxiliaries and modals
  do: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  does: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  did: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  have: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  has: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  had: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  can: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  could: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  would: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  should: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  will: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  shall: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  may: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  might: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  must: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  let: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  lets: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  // Personal pronouns
  it: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  its: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  he: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  him: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  her: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  them: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  they: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  me: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  us: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  // Conjunctions
  as: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  if: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  than: { preferredLyricStressPatterns: [["da"]], acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]] },
  // "forward" — adverb (DUMda) more common in lyrics than preposition (dumda)
  forward: {
    preferredLyricStressPatterns: [["DUM", "da"]],
    acceptedLyricStressPatterns: [["DUM", "da"], ["dum", "da"]],
  },
  // Additional prepositions missing from LYRIC_STRESS_OVERRIDES
  along: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  among: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  around: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  beside: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  beneath: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  behind: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  below: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  upon: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  until: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
  despite: { preferredLyricStressPatterns: [["da", "dum"]], acceptedLyricStressPatterns: [["da", "dum"], ["da", "DUM"]] },
};

function buildPronunciationMap() {
  const pronunciationMap = new Map();

  for (const [rawWord, rawPhonemes] of Object.entries(cmuDictionary)) {
    const normalizedWord = normalizeWord(rawWord).replace(/\(\d+\)$/u, "");
    if (!pronunciationMap.has(normalizedWord)) {
      pronunciationMap.set(normalizedWord, rawPhonemes.split(" "));
    }
  }

  return pronunciationMap;
}

function guessPartOfSpeech(word, cmuRawStressPattern) {
  if (PREPOSITIONS.has(word)) return { pos: "prep", type: "function" };
  if (ARTICLES.has(word)) return { pos: "article", type: "function" };
  if (DETERMINERS.has(word)) return { pos: "det", type: "function" };
  if (CONJUNCTIONS.has(word)) return { pos: "conj", type: "function" };
  if (RELATIVE_PRONOUNS.has(word)) return { pos: "relpron", type: "function" };
  if (PRONOUNS.has(word)) return { pos: "pron", type: "function" };
  if (CONTRACTIONS.has(word)) return { pos: "contraction", type: "function" };
  if (AUXILIARIES.has(word)) return { pos: "aux", type: "function" };
  if (word.endsWith("ly")) return { pos: "adv", type: "content" };
  if (/(ing|ed|ize|ise|fy|ate|en)$/u.test(word)) return { pos: "verb", type: "content" };
  if (/(ous|ful|less|ive|ic|ish|able|ible|al|ary|ory|ent|ant|y)$/u.test(word)) {
    return { pos: "adj", type: "content" };
  }
  if (/(tion|sion|ment|ness|ity|ism|ist|ship|hood|dom|age|er|or)$/u.test(word)) {
    return { pos: "noun", type: "content" };
  }
  if (cmuRawStressPattern.length === 1) return { pos: "noun", type: "content" };
  if (cmuRawStressPattern[0] === "da" && cmuRawStressPattern.at(-1) === "DUM") {
    return { pos: "verb", type: "content" };
  }

  return { pos: "noun", type: "content" };
}

function deriveLyricStressPatterns(cmuRawStressPattern, guessed, override = {}) {
  if (override.preferredLyricStressPatterns) {
    return {
      preferredLyricStressPatterns: override.preferredLyricStressPatterns,
      acceptedLyricStressPatterns:
        override.acceptedLyricStressPatterns ?? override.preferredLyricStressPatterns,
    };
  }

  if (guessed.type === "function" && cmuRawStressPattern.length === 1) {
    return {
      preferredLyricStressPatterns: [["da"]],
      acceptedLyricStressPatterns: [["da"], ["dum"], ["DUM"]],
    };
  }

  // 2-syllable content words with DUM-DUM are typically compound words (e.g. baseball).
  // English compounds carry primary stress on the first element, secondary on the second.
  if (
    guessed.type === "content" &&
    cmuRawStressPattern.length === 2 &&
    cmuRawStressPattern[0] === "DUM" &&
    cmuRawStressPattern[1] === "DUM"
  ) {
    const compoundPattern = ["DUM", "dum"];
    return {
      preferredLyricStressPatterns: [compoundPattern],
      acceptedLyricStressPatterns: [compoundPattern, cmuRawStressPattern],
    };
  }

  // CMU assigns secondary stress (dum) to post-primary syllables in 3+
  // syllable words (e.g. "nobody's" → DUM-dum-dum, "enemy" → DUM-da-dum).
  // In lyric scansion those trailing dum syllables read as da. We restrict
  // this to 3+ syllable words: in 2-syllable words the secondary stress is
  // real (RAIN-coat, AB-stract) and should be preserved as DUM-dum.
  // Pre-primary dum (e.g. "afternoon" = dum-da-DUM) is always kept because
  // it represents genuine secondary stress before the ictus.
  const lastDumIdx = cmuRawStressPattern.lastIndexOf("DUM");
  const hasPostPrimaryDum =
    cmuRawStressPattern.length >= 3 &&
    lastDumIdx >= 0 &&
    cmuRawStressPattern.slice(lastDumIdx + 1).includes("dum");
  if (hasPostPrimaryDum) {
    const lyricPattern = cmuRawStressPattern.map((token, i) =>
      i > lastDumIdx && token === "dum" ? "da" : token,
    );
    return {
      preferredLyricStressPatterns: [lyricPattern],
      acceptedLyricStressPatterns: [lyricPattern, cmuRawStressPattern],
    };
  }

  return {
    preferredLyricStressPatterns: [cmuRawStressPattern],
    acceptedLyricStressPatterns: [cmuRawStressPattern],
  };
}

function isScannableWord(word, phonemes) {
  const syllableCount = buildStressPattern(phonemes).length;

  return (
    /^[a-z]+(?:'[a-z]+)?$/u.test(word) &&
    word.length <= 20 &&
    syllableCount >= 1 &&
    syllableCount <= 6
  );
}

function buildEntry(word, phonemes) {
  const cmuRawStressPattern = buildStressPattern(phonemes);
  const guessed = guessPartOfSpeech(word, cmuRawStressPattern);
  let override = LYRIC_STRESS_OVERRIDES[word] ?? {};
  // Stress-shifting heteronyms: CMU stores the verb form (da-DUM) but
  // noun/adjective use (DUM-da) is equally valid. Offer both; prefer DUM-da.
  if (
    !override.preferredLyricStressPatterns &&
    STRESS_SHIFTING_HETERONYMS.has(word) &&
    cmuRawStressPattern.length === 2 &&
    cmuRawStressPattern[0] === "da" &&
    cmuRawStressPattern[1] === "DUM"
  ) {
    override = {
      preferredLyricStressPatterns: [["DUM", "da"]],
      acceptedLyricStressPatterns: [["DUM", "da"], ["da", "DUM"]],
    };
  }
  const { preferredLyricStressPatterns, acceptedLyricStressPatterns } = deriveLyricStressPatterns(
    cmuRawStressPattern,
    guessed,
    override,
  );

  return {
    text: word,
    phonemes,
    pos: guessed.pos,
    wordType: guessed.type,
    cmuRawStressPattern,
    preferredLyricStressPatterns,
    acceptedLyricStressPatterns,
    cmuRawStressPatternText: joinStressPattern(cmuRawStressPattern),
    preferredLyricStressPatternText: joinStressPattern(preferredLyricStressPatterns[0] ?? []),
    acceptedLyricStressPatternText: joinStressPattern(acceptedLyricStressPatterns[0] ?? []),
  };
}

const PRONUNCIATION_MAP = buildPronunciationMap();
const STRESS_LEXICON = new Map();

for (const [word, phonemes] of PRONUNCIATION_MAP.entries()) {
  if (!isScannableWord(word, phonemes)) {
    continue;
  }

  STRESS_LEXICON.set(word, buildEntry(word, phonemes));
}

export function getStressLexiconEntry(word) {
  return STRESS_LEXICON.get(normalizeWord(word)) ?? null;
}

export function getStressLexiconSnapshot() {
  return [...STRESS_LEXICON.values()];
}
