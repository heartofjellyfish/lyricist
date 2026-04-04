import { dictionary as cmuDictionary } from "../node_modules/cmu-pronouncing-dictionary/index.js";
import { WORDNET_SEMANTIC_MAP } from "./generatedWordnetMap.js";
import { LYRIC_CONCEPTS, conceptMembers } from "./lyricConcepts.js";

const CANONICAL_TOKENS = {
  dum: "dum",
  da: "da",
};

const PATTERN_WEIGHT = {
  DUM: 5,
  dum: 3,
  da: 1,
};

const VOWEL_LABELS = {
  AA: "ah",
  AE: "a",
  AH: "uh",
  AO: "aw",
  AW: "ow",
  AY: "eye",
  EH: "eh",
  ER: "er",
  EY: "ay",
  IH: "ih",
  IY: "ee",
  OW: "oh",
  OY: "oy",
  UH: "uu",
  UW: "oo",
};

const RHYME_ALIASES = {
  oon: "oo",
  ood: "oo",
  eep: "ee",
  eet: "ee",
  eed: "ee",
  ight: "eye",
  ide: "eye",
  ake: "ay",
  ame: "ay",
  own: "oh",
  old: "oh",
};

const PATTERN_GROUP_REGEX = /DUM|Dum|dum|da|Da/gu;

const CLICHE_FRAGMENTS = [
  "broken heart",
  "fire in the dark",
  "midnight rain",
  "endless night",
  "faded light",
  "empty road",
  "chasing shadows",
  "frozen time",
];

const SEED_ENTRY_SPECS = [
  { text: "stars", pos: "noun", type: "content", tags: ["night", "wonder"] },
  { text: "hearts", pos: "noun", type: "content", tags: ["love", "heartbreak"] },
  { text: "heart", pos: "noun", type: "content", tags: ["love", "body", "heart"] },
  { text: "dreams", pos: "noun", type: "content", tags: ["hope", "night"] },
  { text: "ghosts", pos: "noun", type: "content", tags: ["memory", "heartbreak"] },
  { text: "hands", pos: "noun", type: "content", tags: ["love", "touch"] },
  { text: "roads", pos: "noun", type: "content", tags: ["journey", "freedom"] },
  { text: "lights", pos: "noun", type: "content", tags: ["city", "night"] },
  { text: "waves", pos: "noun", type: "content", tags: ["ocean", "freedom"] },
  { text: "tides", pos: "noun", type: "content", tags: ["sea", "ocean", "rising"] },
  { text: "sea", pos: "noun", type: "content", tags: ["sea", "ocean"] },
  { text: "ocean", pos: "noun", type: "content", tags: ["sea", "ocean"] },
  { text: "breeze", pos: "noun", type: "content", tags: ["sea", "summer", "nature"] },
  { text: "pulse", pos: "noun", type: "content", tags: ["body", "heart", "motion"] },
  { text: "glass", pos: "noun", type: "content", tags: ["texture", "fragile", "light"] },
  { text: "flames", pos: "noun", type: "content", tags: ["passion", "power"] },
  { text: "dust", pos: "noun", type: "content", tags: ["road", "memory"] },
  { text: "night", pos: "noun", type: "content", tags: ["night", "mystery"] },
  { text: "dawn", pos: "noun", type: "content", tags: ["hope", "rebirth"] },
  { text: "storm", pos: "noun", type: "content", tags: ["conflict", "power"] },
  { text: "grace", pos: "noun", type: "content", tags: ["spiritual", "love"] },
  { text: "truth", pos: "noun", type: "content", tags: ["confession", "clarity"] },
  { text: "june", pos: "noun", type: "content", tags: ["summer", "love"] },
  { text: "moon", pos: "noun", type: "content", tags: ["night", "romance"] },
  { text: "home", pos: "noun", type: "content", tags: ["belonging", "nostalgia"] },
  { text: "river", pos: "noun", type: "content", tags: ["nature", "journey"] },
  { text: "shadow", pos: "noun", type: "content", tags: ["memory", "mystery"] },
  { text: "glimmer", pos: "noun", type: "content", tags: ["hope", "night"] },
  { text: "fire", pos: "noun", type: "content", tags: ["passion", "power"] },
  { text: "fever", pos: "noun", type: "content", tags: ["desire", "body"] },
  { text: "moonlight", pos: "noun", type: "content", tags: ["night", "romance"] },
  { text: "daybreak", pos: "noun", type: "content", tags: ["hope", "rebirth"] },
  { text: "heartbeats", pos: "noun", type: "content", tags: ["love", "body"] },
  { text: "beats", pos: "noun", type: "content", tags: ["music", "pop", "dance"] },
  { text: "songs", pos: "noun", type: "content", tags: ["music", "pop"] },
  { text: "crowds", pos: "noun", type: "content", tags: ["music", "fame", "city"] },
  { text: "kids", pos: "noun", type: "content", tags: ["children", "youth", "pop"] },
  { text: "girls", pos: "noun", type: "content", tags: ["children", "youth"] },
  { text: "screens", pos: "noun", type: "content", tags: ["city", "pop", "modern"] },
  { text: "streets", pos: "noun", type: "content", tags: ["city", "summer"] },
  { text: "clubs", pos: "noun", type: "content", tags: ["city", "dance", "night"] },
  { text: "neon", pos: "noun", type: "content", tags: ["city", "night", "pop"] },
  { text: "stage", pos: "noun", type: "content", tags: ["music", "pop", "fame"] },
  { text: "stars", pos: "noun", type: "content", tags: ["fame", "night", "wonder"] },
  { text: "city", pos: "noun", type: "content", tags: ["city", "night"] },
  { text: "summer", pos: "noun", type: "content", tags: ["summer", "warmth"] },
  { text: "children", pos: "noun", type: "content", tags: ["children", "youth"] },
  { text: "burn", pos: "verb", type: "content", tags: ["passion", "conflict"] },
  { text: "run", pos: "verb", type: "content", tags: ["freedom", "escape"] },
  { text: "rise", pos: "verb", type: "content", tags: ["hope", "power"] },
  { text: "swell", pos: "verb", type: "content", tags: ["sea", "ocean", "rising"] },
  { text: "surge", pos: "verb", type: "content", tags: ["sea", "power", "rising"] },
  { text: "break", pos: "verb", type: "content", tags: ["conflict", "heartbreak"] },
  { text: "chase", pos: "verb", type: "content", tags: ["desire", "journey"] },
  { text: "hold", pos: "verb", type: "content", tags: ["love", "memory"] },
  { text: "keep", pos: "verb", type: "content", tags: ["promise", "hope"] },
  { text: "find", pos: "verb", type: "content", tags: ["search", "hope"] },
  { text: "pull", pos: "verb", type: "content", tags: ["gravity", "desire"] },
  { text: "dance", pos: "verb", type: "content", tags: ["music", "pop", "youth"] },
  { text: "sing", pos: "verb", type: "content", tags: ["music", "pop"] },
  { text: "shine", pos: "verb", type: "content", tags: ["city", "night", "fame"] },
  { text: "glow", pos: "verb", type: "content", tags: ["city", "night"] },
  { text: "drift", pos: "verb", type: "content", tags: ["sea", "motion", "dream"] },
  { text: "scream", pos: "verb", type: "content", tags: ["music", "crowd", "youth"] },
  { text: "watch", pos: "verb", type: "content", tags: ["fandom", "pop"] },
  { text: "falling", pos: "verb", type: "content", tags: ["heartbreak", "gravity"] },
  { text: "racing", pos: "verb", type: "content", tags: ["desire", "city"] },
  { text: "wild", pos: "adj", type: "content", tags: ["freedom", "youth"] },
  { text: "cold", pos: "adj", type: "content", tags: ["heartbreak", "distance"] },
  { text: "bright", pos: "adj", type: "content", tags: ["hope", "city"] },
  { text: "deep", pos: "adj", type: "content", tags: ["sea", "ocean", "mystery"] },
  { text: "free", pos: "adj", type: "content", tags: ["freedom", "escape"] },
  { text: "slow", pos: "adj", type: "content", tags: ["memory", "intimate"] },
  { text: "young", pos: "adj", type: "content", tags: ["youth", "freedom"] },
  { text: "alone", pos: "adj", type: "content", tags: ["heartbreak", "distance"] },
  { text: "awake", pos: "adj", type: "content", tags: ["night", "restless"] },
  { text: "reckless", pos: "adj", type: "content", tags: ["youth", "conflict"] },
  { text: "golden", pos: "adj", type: "content", tags: ["nostalgia", "warmth"] },
  { text: "open", pos: "adj", type: "content", tags: ["confession", "hope"] },
  { text: "blue", pos: "adj", type: "content", tags: ["sadness", "heartbreak"] },
  { text: "famous", pos: "adj", type: "content", tags: ["fame", "pop"] },
  { text: "loud", pos: "adj", type: "content", tags: ["music", "city", "crowd"] },
  { text: "sweet", pos: "adj", type: "content", tags: ["love", "pop", "summer"] },
  { text: "inside", pos: "adv", type: "content", tags: ["intimate", "confession"] },
  { text: "higher", pos: "adv", type: "content", tags: ["power", "hope"] },
  { text: "into", pos: "prep", type: "function", tags: [] },
  { text: "over", pos: "prep", type: "function", tags: [] },
  { text: "under", pos: "prep", type: "function", tags: [] },
  { text: "after", pos: "prep", type: "function", tags: [] },
  { text: "through", pos: "prep", type: "function", tags: [] },
  { text: "for", pos: "prep", type: "function", tags: [] },
  { text: "to", pos: "prep", type: "function", tags: [] },
  { text: "in", pos: "prep", type: "function", tags: [] },
  { text: "on", pos: "prep", type: "function", tags: [] },
  { text: "at", pos: "prep", type: "function", tags: [] },
  { text: "with", pos: "prep", type: "function", tags: [] },
  { text: "and", pos: "conj", type: "function", tags: [] },
  { text: "the", pos: "article", type: "function", tags: [] },
  { text: "a", pos: "article", type: "function", tags: [] },
  { text: "your", pos: "pron", type: "function", tags: [] },
  { text: "my", pos: "pron", type: "function", tags: [] },
  { text: "we", pos: "pron", type: "function", tags: [] },
  { text: "you", pos: "pron", type: "function", tags: [] },
  { text: "i", pos: "pron", type: "function", tags: [] },
  { text: "she", pos: "pron", type: "function", tags: [] },
];

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
const CONJUNCTIONS = new Set(["and", "or", "but", "nor", "yet", "so", "because"]);
const PRONOUNS = new Set([
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "him",
  "her",
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
]);

const COMMON_VERBS = new Set([
  "watch",
  "dance",
  "play",
  "sing",
  "smile",
  "show",
  "hide",
  "lean",
  "drink",
  "close",
  "hear",
  "see",
  "let",
  "relax",
  "warm",
  "draw",
  "sketch",
  "circle",
  "drift",
  "flash",
  "gleam",
  "run",
  "burn",
  "rise",
  "hold",
  "keep",
  "find",
  "pull",
  "surge",
  "swell",
  "break",
  "chase",
]);

const COMMON_ADJECTIVES = new Set([
  "popular",
  "young",
  "bright",
  "cold",
  "deep",
  "free",
  "slow",
  "blue",
  "wild",
  "perfect",
  "late",
  "full",
  "dark",
]);

const FAMILIAR_PROMPT_WORDS = new Set(
  [
    ...SEED_ENTRY_SPECS.map((spec) => spec.text),
    ...COMMON_VERBS,
    ...COMMON_ADJECTIVES,
    ...PREPOSITIONS,
    ...ARTICLES,
    ...PRONOUNS,
    ...AUXILIARIES,
    ...CONJUNCTIONS,
    "light",
    "mind",
    "world",
    "depths",
    "soul",
    "sky",
    "stars",
    "silence",
    "shadow",
    "inside",
    "beyond",
    "within",
    "below",
    "awake",
    "alone",
    "control",
    "regret",
    "mistake",
    "revenge",
    "desire",
    "release",
    "become",
    "open",
    "hidden",
    "golden",
    "silent",
    "falling",
    "slipping",
    "breaking",
    "drifting",
    "fading",
    "wander",
    "wandering",
    "dreaming",
    "floating",
    "daybreak",
    "moonlight",
  ].map((word) => normalizeWordKey(word)),
);

const LYRIC_PATTERN_OVERRIDES = {
  into: {
    preferredLyricPatterns: [["dum", "da"]],
    allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  after: {
    preferredLyricPatterns: [["dum", "da"]],
    allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  over: {
    preferredLyricPatterns: [["dum", "da"]],
    allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  under: {
    preferredLyricPatterns: [["dum", "da"]],
    allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  during: {
    preferredLyricPatterns: [["dum", "da"]],
    allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  onto: {
    preferredLyricPatterns: [["dum", "da"]],
    allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]],
  },
  within: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  without: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  above: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  about: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  across: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  before: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  between: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  against: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  beyond: {
    preferredLyricPatterns: [["da", "dum"]],
    allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]],
  },
  i: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  she: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  we: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  you: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  my: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  your: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  is: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  are: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  am: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  was: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  were: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  be: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  been: {
    preferredLyricPatterns: [["da"]],
    allowedLyricPatterns: [["da"], ["dum"], ["DUM"]],
  },
  being: {
    preferredLyricPatterns: [["DUM", "da"]],
    allowedLyricPatterns: [["DUM", "da"], ["dum", "da"]],
  },
};

function normalizeWordKey(word) {
  return word.toLowerCase();
}

function normalizeRhymeTarget(rhymeTarget) {
  const normalized = rhymeTarget.trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "any") {
    return "";
  }

  if (LEXICON_BY_WORD?.has(normalized)) {
    return LEXICON_BY_WORD.get(normalized).rhyme;
  }

  return RHYME_ALIASES[normalized] ?? normalized;
}

export function resolveRhymeTarget(rhymeTarget) {
  return normalizeRhymeTarget(rhymeTarget);
}

function buildPronunciationMap() {
  const pronunciationMap = new Map();

  for (const [rawWord, rawPhonemes] of Object.entries(cmuDictionary)) {
    const normalizedWord = rawWord.toLowerCase().replace(/\(\d+\)$/u, "");
    if (!pronunciationMap.has(normalizedWord)) {
      pronunciationMap.set(normalizedWord, rawPhonemes.split(" "));
    }
  }

  return pronunciationMap;
}

const PRONUNCIATION_MAP = buildPronunciationMap();

function extractStressToken(phoneme) {
  const match = phoneme.match(/([A-Z]{2})([012])/u);
  if (!match) {
    return null;
  }

  const [, vowel, stress] = match;
  return {
    vowel,
    stressToken: stress === "1" ? "DUM" : stress === "2" ? "dum" : "da",
  };
}

function buildPattern(phonemes) {
  return phonemes.map(extractStressToken).filter(Boolean).map((item) => item.stressToken);
}

function deriveCompactPattern(pattern) {
  return pattern.join("");
}

function deriveRhymeInfo(phonemes) {
  let lastStressedIndex = -1;

  for (let index = 0; index < phonemes.length; index += 1) {
    if (/[12]/u.test(phonemes[index])) {
      lastStressedIndex = index;
    }
  }

  if (lastStressedIndex === -1) {
    lastStressedIndex = phonemes.findIndex((phoneme) => /\d/u.test(phoneme));
  }

  const tail = lastStressedIndex === -1 ? phonemes : phonemes.slice(lastStressedIndex);
  const vowel = extractStressToken(tail[0] ?? "");

  return {
    rhymeTail: tail,
    rhymeKey: tail.join(" "),
    rhymeVowel: vowel ? VOWEL_LABELS[vowel.vowel] ?? vowel.vowel.toLowerCase() : "",
  };
}

function isUsableWord(word, phonemes) {
  const syllableCount = buildPattern(phonemes).length;
  const isFunctionWord =
    PREPOSITIONS.has(word) ||
    ARTICLES.has(word) ||
    CONJUNCTIONS.has(word) ||
    PRONOUNS.has(word) ||
    AUXILIARIES.has(word);

  return (
    /^[a-z]+$/u.test(word) &&
    word.length <= 12 &&
    (word.length > 1 || isFunctionWord) &&
    syllableCount >= 1 &&
    syllableCount <= 4
  );
}

function guessPos(word, lexicalPattern) {
  if (PREPOSITIONS.has(word)) {
    return { pos: "prep", type: "function" };
  }
  if (ARTICLES.has(word)) {
    return { pos: "article", type: "function" };
  }
  if (CONJUNCTIONS.has(word)) {
    return { pos: "conj", type: "function" };
  }
  if (PRONOUNS.has(word)) {
    return { pos: "pron", type: "function" };
  }
  if (AUXILIARIES.has(word)) {
    return { pos: "aux", type: "function" };
  }

  if (word.endsWith("ly")) {
    return { pos: "adv", type: "content" };
  }
  if (COMMON_VERBS.has(word)) {
    return { pos: "verb", type: "content" };
  }
  if (COMMON_ADJECTIVES.has(word)) {
    return { pos: "adj", type: "content" };
  }
  if (/(ing|ed|ize|ise|fy|ate|en)$/u.test(word)) {
    return { pos: "verb", type: "content" };
  }
  if (/(ous|ful|less|ive|ic|ish|able|ible|al|ary|ory|ent|ant|y)$/u.test(word)) {
    return { pos: "adj", type: "content" };
  }
  if (/(tion|sion|ment|ness|ity|ism|ist|ship|hood|dom|age|er|or)$/u.test(word)) {
    return { pos: "noun", type: "content" };
  }
  if (lexicalPattern.length === 1) {
    return { pos: "noun", type: "content" };
  }
  if (lexicalPattern[0] === "da" && lexicalPattern.at(-1) === "DUM") {
    return { pos: "verb", type: "content" };
  }
  return { pos: "noun", type: "content" };
}

function defaultLyricPatternsForWord(pattern, guessed, override) {
  if (override.preferredLyricPatterns) {
    return {
      preferredLyricPatterns: override.preferredLyricPatterns,
      allowedLyricPatterns: override.allowedLyricPatterns ?? override.preferredLyricPatterns,
    };
  }

  if (guessed.type === "function" && pattern.length === 1) {
    return {
      preferredLyricPatterns: [["da"]],
      allowedLyricPatterns: override.allowedLyricPatterns ?? [["da"], ["dum"], ["DUM"]],
    };
  }

  const preferredLyricPatterns = [pattern];
  return {
    preferredLyricPatterns,
    allowedLyricPatterns: override.allowedLyricPatterns ?? preferredLyricPatterns,
  };
}

function buildEntry(spec) {
  const key = normalizeWordKey(spec.text);
  const phonemes = PRONUNCIATION_MAP.get(key);
  if (!phonemes) {
    throw new Error(`Missing CMUdict pronunciation for "${spec.text}"`);
  }

  const pattern = buildPattern(phonemes);
  const rhyme = deriveRhymeInfo(phonemes);
  const override = LYRIC_PATTERN_OVERRIDES[key] ?? {};
  const guessed = guessPos(key, pattern);
  const { preferredLyricPatterns, allowedLyricPatterns } = defaultLyricPatternsForWord(
    pattern,
    guessed,
    override,
  );

  return {
    ...guessed,
    ...spec,
    text: key,
    phonemes,
    pattern,
    lexicalPattern: pattern,
    preferredLyricPatterns,
    allowedLyricPatterns,
    spacedPattern: pattern.join(" "),
    compactPattern: deriveCompactPattern(pattern),
    syllables: pattern.length,
    rhyme: rhyme.rhymeVowel,
    rhymeKey: rhyme.rhymeKey,
    rhymeTail: rhyme.rhymeTail,
  };
}

const SEED_SPEC_MAP = new Map(SEED_ENTRY_SPECS.map((spec) => [normalizeWordKey(spec.text), spec]));

const THEME_ALIASES = {
  children: ["kids", "young", "schoolgirl"],
  child: ["kids", "young"],
  kids: ["children", "young"],
  kpop: ["pop", "music", "dance", "stage", "crowds", "kids"],
  pop: ["music", "dance", "stage", "crowds", "beats"],
  music: ["songs", "beats", "dance", "sing", "stage"],
  popular: ["famous", "crowds", "bright", "loud"],
  city: ["lights", "streets", "screens", "neon"],
  summer: ["june", "sea", "breeze", "sweet"],
  sea: ["tides", "waves", "breeze", "shoreline"],
  rising: ["rise", "swell", "surge"],
  love: ["hearts", "hands", "sweet", "june"],
  heart: ["heart", "hearts", "pulse", "heartbeats", "grace"],
  jellyfish: ["sea", "ocean", "drift", "glimmer", "blue", "glass"],
};

function lexicalVariants(word) {
  const variants = new Set([word]);
  if (word === "children") {
    variants.add("child");
  } else if (word === "kids") {
    variants.add("kid");
  } else if (word.endsWith("ies") && word.length > 3) {
    variants.add(`${word.slice(0, -3)}y`);
  } else if (word.endsWith("s") && word.length > 3) {
    variants.add(word.slice(0, -1));
  }
  return [...variants];
}

function buildCanonicalLexicon() {
  const entries = [];
  const seen = new Set();

  for (const [word, phonemes] of PRONUNCIATION_MAP.entries()) {
    if (seen.has(word) || !isUsableWord(word, phonemes)) {
      continue;
    }

    const seedSpec = SEED_SPEC_MAP.get(word);
    entries.push(buildEntry(seedSpec ?? { text: word, tags: [], source: "cmu" }));
    seen.add(word);
  }

  return entries;
}

const LEXICON = buildCanonicalLexicon();
const LEXICON_BY_WORD = new Map(LEXICON.map((entry) => [entry.text, entry]));
const LYRIC_LEXICON_BY_PATTERN = new Map();
const LYRIC_LEXICON_BY_COMPACT_PATTERN = new Map();
const RAW_LEXICON_BY_PATTERN = new Map();
const RAW_LEXICON_BY_COMPACT_PATTERN = new Map();

for (const entry of LEXICON) {
  const rawSpacedKey = entry.lexicalPattern.join(" ");
  if (!RAW_LEXICON_BY_PATTERN.has(rawSpacedKey)) {
    RAW_LEXICON_BY_PATTERN.set(rawSpacedKey, []);
  }
  RAW_LEXICON_BY_PATTERN.get(rawSpacedKey).push(entry);

  const rawCompactKey = entry.compactPattern;
  if (!RAW_LEXICON_BY_COMPACT_PATTERN.has(rawCompactKey)) {
    RAW_LEXICON_BY_COMPACT_PATTERN.set(rawCompactKey, []);
  }
  RAW_LEXICON_BY_COMPACT_PATTERN.get(rawCompactKey).push(entry);

  for (const pattern of entry.allowedLyricPatterns) {
    const key = pattern.join(" ");
    if (!LYRIC_LEXICON_BY_PATTERN.has(key)) {
      LYRIC_LEXICON_BY_PATTERN.set(key, []);
    }
    LYRIC_LEXICON_BY_PATTERN.get(key).push(entry);

    const compactKey = deriveCompactPattern(pattern);
    if (!LYRIC_LEXICON_BY_COMPACT_PATTERN.has(compactKey)) {
      LYRIC_LEXICON_BY_COMPACT_PATTERN.set(compactKey, []);
    }
    LYRIC_LEXICON_BY_COMPACT_PATTERN.get(compactKey).push(entry);
  }
}

function coverageBand(count) {
  if (count === 0) {
    return "none";
  }
  if (count <= 3) {
    return "tiny";
  }
  if (count <= 12) {
    return "narrow";
  }
  if (count <= 60) {
    return "medium";
  }
  if (count <= 250) {
    return "broad";
  }
  return "huge";
}

function coverageExamples(entries, limit = 5) {
  return [...new Set((entries ?? []).map((entry) => entry.text))].slice(0, limit);
}

function lyricEntriesForPattern(tokens, { compact = false, pos = "", preferredWords = [] } = {}) {
  const spacedKey = tokens.join(" ");
  const exactEntries = LYRIC_LEXICON_BY_PATTERN.get(spacedKey) ?? [];
  const relaxedEntries = compact
    ? compactRelaxationPatterns(tokens, true).flatMap((pattern) => LYRIC_LEXICON_BY_PATTERN.get(pattern.join(" ")) ?? [])
    : [];

  let entries = [...new Map([...exactEntries, ...relaxedEntries].map((entry) => [entry.text, entry])).values()];
  if (pos) {
    entries = entries.filter((entry) => entry.pos === pos);
  }

  const preferred = new Map(preferredWords.map((word, index) => [normalizeWordKey(word), index]));
  return entries.sort((a, b) => {
    const aPref = preferred.has(a.text) ? preferred.get(a.text) : Number.POSITIVE_INFINITY;
    const bPref = preferred.has(b.text) ? preferred.get(b.text) : Number.POSITIVE_INFINITY;
    if (aPref !== bPref) {
      return aPref - bPref;
    }
    return a.text.localeCompare(b.text);
  });
}

function shapeCoverageForSlot(slot) {
  const spacedKey = slot.tokens.join(" ");
  const compactKey = deriveCompactPattern(slot.tokens);
  const lyricExactEntries = LYRIC_LEXICON_BY_PATTERN.get(spacedKey) ?? [];
  const rawExactEntries = RAW_LEXICON_BY_PATTERN.get(spacedKey) ?? [];
  const relaxedKeys = slot.compact ? compactRelaxationPatterns(slot.tokens, true).map((pattern) => pattern.join(" ")) : [];
  const relaxedEntries = relaxedKeys.flatMap((key) => LYRIC_LEXICON_BY_PATTERN.get(key) ?? []);
  const totalEntries = [...new Map([...lyricExactEntries, ...relaxedEntries].map((entry) => [entry.text, entry])).values()];
  const rawCompactEntries = RAW_LEXICON_BY_COMPACT_PATTERN.get(compactKey) ?? [];
  const lyricCompactEntries = LYRIC_LEXICON_BY_COMPACT_PATTERN.get(compactKey) ?? [];

  return {
    spacedKey,
    compactKey,
    rawExactCount: rawExactEntries.length,
    lyricExactCount: lyricExactEntries.length,
    relaxedKeys,
    relaxedCount: [...new Set(relaxedEntries.map((entry) => entry.text))].length,
    totalCount: totalEntries.length,
    rawCompactCount: rawCompactEntries.length,
    lyricCompactCount: lyricCompactEntries.length,
    band: coverageBand(totalEntries.length),
    examples: coverageExamples(totalEntries),
  };
}

const FAMILIAR_COVERAGE_SCORE_CACHE = new Map();

function familiarEntryCountForSlice(slice, compact = false, maxCount = 17) {
  const exactPool = (LYRIC_LEXICON_BY_PATTERN.get(slice.join(" ")) ?? []).map((entry) => ({
    entry,
    compactRelaxed: false,
  }));
  const relaxedPools = lyricSliceVariants(slice, compact)
    .filter((variant) => variant.join(" ") !== slice.join(" "))
    .flatMap((relaxedSlice) =>
      (LYRIC_LEXICON_BY_PATTERN.get(relaxedSlice.join(" ")) ?? []).map((entry) => ({
        entry,
        compactRelaxed: true,
      })),
    );

  const seen = new Set();
  let count = 0;
  for (const { entry } of [...exactPool, ...relaxedPools]) {
    if (seen.has(entry.text)) {
      continue;
    }
    seen.add(entry.text);
    if (entry.type === "function" || (entry.tags?.length ?? 0) > 0) {
      count += 1;
      if (count >= maxCount) {
        return count;
      }
    }
  }
  return count;
}

function familiarCoverageScoreForSlot(slot) {
  const cacheKey = `${slot.compact ? "compact" : "loose"}::${slot.tokens.join(" ")}`;
  if (FAMILIAR_COVERAGE_SCORE_CACHE.has(cacheKey)) {
    return FAMILIAR_COVERAGE_SCORE_CACHE.get(cacheKey);
  }

  const count = familiarEntryCountForSlice(slot.tokens, slot.compact);

  let score = 9;
  if (slot.compact && count === 0) score = -18;
  else if (slot.mergedLoose && slot.tokens.length >= 3 && count === 0) score = -20;
  else if (count === 0) score = -10;
  else if (count <= 2) score = -5;
  else if (count <= 6) score = 1;
  else if (count <= 16) score = 5;

  FAMILIAR_COVERAGE_SCORE_CACHE.set(cacheKey, score);
  return score;
}

function planRealizabilityScore(slots = []) {
  return slots.reduce((total, slot) => total + familiarCoverageScoreForSlot(slot), 0);
}

const SLOT_POS_COVERAGE_CACHE = new Map();

function slotPosCoverageCount(slot, posList = []) {
  const cacheKey = `${slot.compact ? "compact" : "loose"}::${slot.tokens.join(" ")}::${posList.join(",")}`;
  if (SLOT_POS_COVERAGE_CACHE.has(cacheKey)) {
    return SLOT_POS_COVERAGE_CACHE.get(cacheKey);
  }

  const spacedKey = slot.tokens.join(" ");
  const exactEntries = LYRIC_LEXICON_BY_PATTERN.get(spacedKey) ?? [];
  const relaxedEntries = slot.compact
    ? compactRelaxationPatterns(slot.tokens, true).flatMap((pattern) => LYRIC_LEXICON_BY_PATTERN.get(pattern.join(" ")) ?? [])
    : [];
  const entries = [...new Map([...exactEntries, ...relaxedEntries].map((entry) => [entry.text, entry])).values()];
  const count = entries.filter((entry) => posList.includes(entry.pos)).length;
  SLOT_POS_COVERAGE_CACHE.set(cacheKey, count);
  return count;
}

function resolveLexiconEntry(word) {
  const normalized = normalizeWordKey(word);
  return LEXICON_BY_WORD.get(normalized) ?? null;
}

function deriveProgressiveForms(word) {
  const normalized = normalizeWordKey(word);
  if (!/^[a-z]+$/u.test(normalized) || normalized.length < 2) {
    return [];
  }

  const variants = new Set();

  if (normalized.endsWith("ie")) {
    variants.add(`${normalized.slice(0, -2)}ying`);
  } else if (normalized.endsWith("e") && !normalized.endsWith("ee")) {
    variants.add(`${normalized.slice(0, -1)}ing`);
  } else {
    variants.add(`${normalized}ing`);
  }

  if (/[^aeiou][aeiou][^aeiouwxy]$/u.test(normalized)) {
    variants.add(`${normalized}${normalized.at(-1)}ing`);
  }

  return [...variants];
}

export function filterUsableSeedWords(seedWords) {
  return [...new Set(seedWords.map((word) => normalizeWordKey(word)))]
    .filter(Boolean)
    .filter((word) => resolveLexiconEntry(word));
}

export function filterUsableSeedPool(seedPool = {}) {
  const normalizeBucket = (items) => filterUsableSeedWords(Array.isArray(items) ? items : []);
  const slotTargets = seedPool.slotTargets && typeof seedPool.slotTargets === "object" && !Array.isArray(seedPool.slotTargets)
    ? Object.fromEntries(
        Object.entries(seedPool.slotTargets).map(([key, items]) => [key, normalizeBucket(items)]),
      )
    : {};

  return {
    singleWords: normalizeBucket(seedPool.singleWords),
    compactWords: normalizeBucket(seedPool.compactWords),
    verbs: normalizeBucket(seedPool.verbs),
    nouns: normalizeBucket(seedPool.nouns),
    adjectives: normalizeBucket(seedPool.adjectives),
    slotTargets,
  };
}

function normalizeStressToken(token) {
  const lowered = token.toLowerCase();

  if (lowered === "dum") {
    return token === "dum" ? "dum" : "DUM";
  }

  if (lowered === "da") {
    return "da";
  }

  throw new Error("Pattern must contain only DUM, dum, and da tokens.");
}

function parsePatternGroup(groupText) {
  const matches = groupText.match(PATTERN_GROUP_REGEX) ?? [];
  if (matches.length === 0 || matches.join("") !== groupText) {
    throw new Error("Pattern must contain only DUM, dum, and da tokens.");
  }

  const tokens = matches.map(normalizeStressToken);
  return {
    text: groupText,
    tokens,
    compact: tokens.length > 1,
  };
}

export function parsePatternDetailed(patternText) {
  const groups = patternText.match(/[A-Za-z]+/gu) ?? [];

  if (groups.length === 0) {
    throw new Error("Pattern must contain only DUM, dum, and da tokens.");
  }

  const parsedGroups = groups.map(parsePatternGroup);
  return {
    groups: parsedGroups,
    tokens: parsedGroups.flatMap((group) => group.tokens),
  };
}

export function parsePattern(patternText) {
  return parsePatternDetailed(patternText).tokens;
}

function matchesAnyPattern(candidatePatterns, slice) {
  return candidatePatterns.some((pattern) => matchesPattern(pattern, slice));
}

function lyricPatternPenalty(entry, slice) {
  if (matchesAnyPattern(entry.preferredLyricPatterns, slice)) {
    return 0;
  }

  if (entry.pos === "prep") {
    return 4;
  }

  if (entry.type === "function") {
    return 5;
  }

  if (entry.type === "content") {
    return 2;
  }

  return 3;
}

function slotTypePenalty(entry, slotKind) {
  if (["function", "leadWeak", "articleLeadWeak", "linkWeak", "auxWeak", "preCompactWeak", "postCompactWeak"].includes(slotKind)) {
    return entry.type === "function" ? 0 : 4;
  }

  return entry.type === "content" ? 0 : 5;
}

const FOUR_GROUP_TEMPLATES = [
  ["noun", "verb", "prep", "noun"],
  ["adj", "noun", "prep", "noun"],
  ["verb", "noun", "prep", "noun"],
];

const TEMPLATE_BONUS = {
  "noun verb prep noun": 6,
  "adj noun prep noun": 5,
  "verb noun prep noun": 3,
};

function slotMatches(entry, slotKind) {
  if (slotKind === "function" || slotKind === "content") {
    return true;
  }

  if (slotKind === "articleLeadWeak") {
    return entry.type === "function" && ["article", "pron"].includes(entry.pos);
  }

  if (slotKind === "leadWeak") {
    return entry.type === "function" && ["pron", "article", "prep"].includes(entry.pos);
  }

  if (slotKind === "auxWeak") {
    return entry.type === "function" && ["aux", "prep", "article"].includes(entry.pos);
  }

  if (slotKind === "linkWeak") {
    return entry.type === "function" && ["prep", "article", "conj", "aux"].includes(entry.pos);
  }

  if (slotKind === "preCompactWeak" || slotKind === "postCompactWeak") {
    return entry.type === "function" && ["prep", "article", "pron"].includes(entry.pos);
  }

  if (slotKind === "compactFunction") {
    return (
      (entry.type === "function" && ["prep", "adv"].includes(entry.pos)) ||
      (entry.pos === "prep")
    );
  }

  if (slotKind === "compactContent") {
    return entry.type === "content";
  }

  if (slotKind === "article") {
    return entry.pos === "article";
  }

  if (entry.pos === slotKind) {
    return true;
  }

  if (slotKind === "function" && entry.type === "function") {
    return true;
  }

  return false;
}

function slotMatchPenalty(entry, slotKind) {
  if (slotKind === "function" || slotKind === "content") {
    return slotTypePenalty(entry, slotKind);
  }

  if (slotKind === "articleLeadWeak") {
    if (entry.pos === "article") {
      return 0;
    }
    if (entry.pos === "pron") {
      return 2;
    }
    return 8;
  }

  if (slotKind === "leadWeak") {
    if (entry.pos === "pron") {
      return 0;
    }
    if (entry.pos === "article") {
      return 1;
    }
    if (entry.pos === "prep") {
      return 3;
    }
    return 8;
  }

  if (slotKind === "auxWeak") {
    if (entry.pos === "aux") {
      return 0;
    }
    if (entry.pos === "prep") {
      return 4;
    }
    if (entry.pos === "article") {
      return 6;
    }
    return 9;
  }

  if (slotKind === "linkWeak") {
    if (entry.pos === "prep") {
      return 0;
    }
    if (entry.pos === "aux") {
      return 1;
    }
    if (entry.pos === "article") {
      return 2;
    }
    if (entry.pos === "conj") {
      return 3;
    }
    return 8;
  }

  if (slotKind === "preCompactWeak" || slotKind === "postCompactWeak") {
    if (entry.pos === "prep") {
      return 0;
    }
    if (entry.pos === "article") {
      return 2;
    }
    if (entry.pos === "pron") {
      return 3;
    }
    return 8;
  }

  if (slotKind === "compactFunction") {
    if (entry.pos === "prep") {
      return 0;
    }
    if (entry.pos === "adv") {
      return 2;
    }
    if (entry.type === "function") {
      return 3;
    }
    return 9;
  }

  if (slotKind === "compactContent") {
    return entry.type === "content" ? 0 : 9;
  }

  if (entry.pos === slotKind) {
    return 0;
  }

  if (slotKind === "article" && entry.type === "function") {
    return 3;
  }

  return 6;
}

function matchesCompactGroups(patternGroups, matchedEntryPatterns) {
  const tokenToEntryIndex = [];

  matchedEntryPatterns.forEach((entryPattern, entryIndex) => {
    for (let index = 0; index < entryPattern.length; index += 1) {
      tokenToEntryIndex.push(entryIndex);
    }
  });

  let tokenOffset = 0;
  for (const group of patternGroups) {
    const groupEntryIndexes = tokenToEntryIndex.slice(tokenOffset, tokenOffset + group.tokens.length);
    if (groupEntryIndexes.length !== group.tokens.length) {
      return false;
    }

    if (group.compact && new Set(groupEntryIndexes).size !== 1) {
      return false;
    }

    tokenOffset += group.tokens.length;
  }

  return true;
}

export function matchesPattern(wordPattern, slice) {
  return (
    wordPattern.length === slice.length &&
    wordPattern.every((token, index) => token === slice[index])
  );
}

function compactRelaxationPatterns(slice, compact) {
  if (!compact) {
    return [];
  }

  const relaxedPatterns = new Map();
  const queue = [slice];

  while (queue.length > 0) {
    const current = queue.shift();
    current.forEach((token, index) => {
      if (token !== "dum") {
        return;
      }
      const relaxed = [...current];
      relaxed[index] = "da";
      const key = relaxed.join(" ");
      if (!relaxedPatterns.has(key)) {
        relaxedPatterns.set(key, relaxed);
        queue.push(relaxed);
      }
    });
  }

  return [...relaxedPatterns.values()];
}

function lyricSliceVariants(slice, compact) {
  const variants = new Map();
  const queue = [slice];
  variants.set(slice.join(" "), slice);

  while (queue.length > 0) {
    const current = queue.shift();

    current.forEach((token, index) => {
      if (token === "dum") {
        const relaxed = [...current];
        relaxed[index] = "da";
        const key = relaxed.join(" ");
        if (!variants.has(key)) {
          variants.set(key, relaxed);
          queue.push(relaxed);
        }
      }

      if (compact && token === "dum") {
        const promoted = [...current];
        promoted[index] = "DUM";
        const key = promoted.join(" ");
        if (!variants.has(key)) {
          variants.set(key, promoted);
          queue.push(promoted);
        }
      }
    });
  }

  return [...variants.values()];
}

function patternsCompatible(wordPattern, slice, compact) {
  return lyricSliceVariants(slice, compact).some((variant) => matchesPattern(wordPattern, variant));
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9'\s]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

function parseThemeTags(ideaText, extraSeedWords = []) {
  const tags = new Set();

  for (const word of normalizeText(ideaText)) {
    for (const variant of lexicalVariants(word)) {
      tags.add(variant);
      for (const related of conceptMembers(variant).filter((item) => LEXICON_BY_WORD.has(item))) {
        tags.add(related);
      }
      for (const alias of THEME_ALIASES[variant] ?? []) {
        tags.add(alias);
      }
      for (const related of (WORDNET_SEMANTIC_MAP[variant] ?? []).filter((item) => LEXICON_BY_WORD.has(item))) {
        tags.add(related);
      }
    }
  }

  for (const seed of extraSeedWords) {
    for (const variant of lexicalVariants(normalizeWordKey(seed))) {
      tags.add(variant);
      for (const related of conceptMembers(variant).filter((item) => LEXICON_BY_WORD.has(item))) {
        tags.add(related);
      }
      for (const alias of THEME_ALIASES[variant] ?? []) {
        tags.add(alias);
      }
      for (const related of (WORDNET_SEMANTIC_MAP[variant] ?? []).filter((item) => LEXICON_BY_WORD.has(item))) {
        tags.add(related);
      }
    }
  }

  return tags;
}

function getKnownThemeVocabulary() {
  return new Set(LEXICON.flatMap((entry) => [entry.text, ...entry.tags]));
}

export function analyzeIdeaCoverage(ideaText) {
  const ideaWords = normalizeText(ideaText).filter(
    (word) => word.length > 2 && !["the", "and", "for", "with"].includes(word),
  );
  const knownVocabulary = getKnownThemeVocabulary();
  const recognized = ideaWords.filter((word) => {
    if (knownVocabulary.has(word)) {
      return true;
    }

    if ((THEME_ALIASES[word] ?? []).some((item) => knownVocabulary.has(item))) {
      return true;
    }

    if (conceptMembers(word).some((item) => knownVocabulary.has(item))) {
      return true;
    }

    return (WORDNET_SEMANTIC_MAP[word] ?? []).some((item) => knownVocabulary.has(item));
  });
  const missing = ideaWords.filter((word) => !recognized.includes(word));

  return {
    ideaWords,
    recognized,
    missing,
    coverageRatio: ideaWords.length === 0 ? 1 : recognized.length / ideaWords.length,
  };
}

function sliceWeight(tokens) {
  return tokens.reduce((sum, token) => sum + PATTERN_WEIGHT[token], 0);
}

function rhymeScore(entry, desiredRhyme) {
  if (!desiredRhyme) {
    return 0;
  }

  return entry.rhyme === desiredRhyme ? 8 : -20;
}

function themeScore(entry, themeTags) {
  const tagHits = entry.tags.reduce((sum, tag) => sum + (themeTags.has(tag) ? 4 : 0), 0);
  const exactHit = themeTags.has(entry.text) ? 10 : 0;
  const semanticItems = Array.isArray(WORDNET_SEMANTIC_MAP[entry.text]) ? WORDNET_SEMANTIC_MAP[entry.text] : [];
  const semanticHits = semanticItems.reduce(
    (sum, related) => sum + (themeTags.has(related) ? 2 : 0),
    0,
  );
  return tagHits + exactHit + semanticHits;
}

function densityPenalty(text) {
  return /[bcdfghjklmnpqrstvwxyz]{4,}/iu.test(text) ? 2 : 0;
}

export function detectCliches(lineText) {
  const lowerLine = lineText.toLowerCase();
  return CLICHE_FRAGMENTS.filter((fragment) => lowerLine.includes(fragment));
}

export function validateLine(lineText, patternText) {
  const parsedPattern = parsePatternDetailed(patternText);
  const { tokens, groups } = parsedPattern;
  const words = normalizeText(lineText);
  const entries = [];

  for (const word of words) {
    const entry = resolveLexiconEntry(word);
    if (!entry) {
      return {
        isValid: false,
        reason: `Unknown word in pronunciation lexicon: "${word}"`,
        tokens,
        entries: [],
      };
    }
    entries.push(entry);
  }

  const lexicalFlattened = entries.flatMap((entry) => entry.lexicalPattern);
  let matchedTokens = [];
  const matchedEntryPatterns = [];
  let usedCompactRelaxation = false;
  for (const entry of entries) {
    let matched = false;
    for (const allowedPattern of entry.allowedLyricPatterns) {
      const nextSlice = tokens.slice(matchedTokens.length, matchedTokens.length + allowedPattern.length);
      const compactGroup = groups.find((group, index) => {
        const tokenStart = groups.slice(0, index).reduce((sum, item) => sum + item.tokens.length, 0);
        return tokenStart === matchedTokens.length;
      });
      const compact = compactGroup?.compact ?? false;

      if (patternsCompatible(allowedPattern, nextSlice, compact)) {
        matchedTokens = matchedTokens.concat(nextSlice);
        matchedEntryPatterns.push(allowedPattern);
        if (!matchesPattern(allowedPattern, nextSlice)) {
          usedCompactRelaxation = true;
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      matchedTokens = [];
      break;
    }
  }

  const hasCompactGroups = groups.some((group) => group.compact);
  const compactGroupMismatch =
    hasCompactGroups &&
    matchedEntryPatterns.length > 0 &&
    !matchesCompactGroups(groups, matchedEntryPatterns);

  if (matchesPattern(lexicalFlattened, tokens) && !compactGroupMismatch) {
    return {
      isValid: true,
      reason: "Exact stress match.",
      tokens,
      groups,
      entries,
    };
  }

  if (matchesPattern(matchedTokens, tokens) && !compactGroupMismatch) {
    return {
      isValid: true,
      reason: usedCompactRelaxation
        ? "Acceptable compact fallback match."
        : "Acceptable lyric placement match.",
      tokens,
      groups,
      entries,
    };
  }

  if (compactGroupMismatch) {
    return {
      isValid: false,
      reason: "Compact stress groups should stay together inside a single lexical unit.",
      tokens,
      groups,
      entries,
    };
  }

  return {
    isValid: false,
    reason: `Stress pattern mismatch. Expected ${tokens.join(" ")}, got ${lexicalFlattened.join(" ")}.`,
    tokens,
    groups,
    entries,
  };
}

function chooseCandidatesForSlot(
  slotKind,
  slice,
  themeTags,
  usedWords,
  isLastSlot,
  desiredRhyme,
  compact = false,
  aiSeedWords = [],
  aiSeedBuckets = {},
) {
  const aiSeedSet = new Set(aiSeedWords.map((word) => normalizeWordKey(word)));
  const slotTargetKey = `${slotKind}|${slice.join(" ")}`;
  const bucketSets = {
    singleWords: new Set((aiSeedBuckets.singleWords ?? []).map((word) => normalizeWordKey(word))),
    compactWords: new Set((aiSeedBuckets.compactWords ?? []).map((word) => normalizeWordKey(word))),
    verbs: new Set((aiSeedBuckets.verbs ?? []).map((word) => normalizeWordKey(word))),
    nouns: new Set((aiSeedBuckets.nouns ?? []).map((word) => normalizeWordKey(word))),
    adjectives: new Set((aiSeedBuckets.adjectives ?? []).map((word) => normalizeWordKey(word))),
    slotTargets: new Set(((aiSeedBuckets.slotTargets ?? {})[slotTargetKey] ?? []).map((word) => normalizeWordKey(word))),
  };
  const seedBonusForEntry = (entry) => {
    if (!aiSeedSet.has(entry.text) || slotKind === "function" || slotKind.endsWith("Weak")) {
      return bucketSets.slotTargets.has(entry.text) ? 20 : 0;
    }

    if (bucketSets.slotTargets.has(entry.text)) {
      return 26;
    }

    if (slotKind === "compactContent" && bucketSets.compactWords.has(entry.text)) {
      return 18;
    }

    if (slotKind === "verb" && bucketSets.verbs.has(entry.text)) {
      return 16;
    }

    if (slotKind === "noun" && bucketSets.nouns.has(entry.text)) {
      return 16;
    }

    if (slotKind === "adj" && bucketSets.adjectives.has(entry.text)) {
      return 16;
    }

    if (bucketSets.singleWords.has(entry.text)) {
      return 10;
    }

    return 8;
  };
  const familiarityBonusForEntry = (entry) => {
    if (entry.type === "function") {
      return 0;
    }

    const seeded = aiSeedSet.has(entry.text);
    const themed = themeScore(entry, themeTags) > 0;
    const tagged = (entry.tags?.length ?? 0) > 0;
    let score = 0;

    if (tagged) {
      score += 8;
    } else {
      score -= 6;
    }

    if (seeded) {
      score += 10;
    }

    if (themed) {
      score += 8;
    }

    if (slice.length >= 2 && !tagged && !seeded && !themed) {
      score -= 18;
    }

    if ((slotKind === "noun" || slotKind === "content") && slice.join(" ") === "da DUM" && !tagged && !seeded && !themed) {
      score -= 14;
    }

    return score;
  };
  const localThemeScore = aiSeedSet.size > 0 ? () => 0 : themeScore;
  const exactPool = (LYRIC_LEXICON_BY_PATTERN.get(slice.join(" ")) ?? []).map((entry) => ({
    entry,
    compactRelaxed: false,
  }));
  const relaxedPools = lyricSliceVariants(slice, compact)
    .filter((variant) => variant.join(" ") !== slice.join(" "))
    .flatMap((relaxedSlice) =>
    (LYRIC_LEXICON_BY_PATTERN.get(relaxedSlice.join(" ")) ?? []).map((entry) => ({
      entry,
      compactRelaxed: true,
    })),
  );
  const pool = [...exactPool, ...relaxedPools];
  const sourcePool = pool;

  const ranked = sourcePool
    .filter(({ entry }) => !usedWords.has(entry.text))
    .filter(({ entry }) => slotMatches(entry, slotKind))
    .filter(({ entry }) => !isLastSlot || !desiredRhyme || entry.rhyme === desiredRhyme)
    .map(({ entry, compactRelaxed }) => ({
      entry,
      score:
        localThemeScore(entry, themeTags) +
        seedBonusForEntry(entry) +
        familiarityBonusForEntry(entry) +
        sliceWeight(slice) -
        densityPenalty(entry.text) +
        -slotMatchPenalty(entry, slotKind) +
        -lyricPatternPenalty(entry, slice) +
        rhymeScore(entry, isLastSlot ? desiredRhyme : "") +
        (compactRelaxed ? -4 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0 && slotKind === "prep" && slice.every((token) => token === "da")) {
    const functionFallback = chooseCandidatesForSlot(
      "function",
      slice,
      themeTags,
      usedWords,
      isLastSlot,
      desiredRhyme,
      compact,
      [],
      {},
    ).filter(({ entry }) => entry.pos === "prep");

    if (functionFallback.length > 0) {
      return functionFallback;
    }
  }

  return ranked;
}

function deriveSlotsFromPattern(parsedPattern) {
  const contentGroups = parsedPattern.groups.filter((group) => !group.tokens.every((token) => token === "da"));
  let contentIndex = 0;

  return parsedPattern.groups.map((group, index, allGroups) => {
    if (group.tokens.every((token) => token === "da")) {
      let kind = "linkWeak";
      if (index === 0) {
        kind = "leadWeak";
      } else if (allGroups[index + 1]?.compact) {
        kind = "preCompactWeak";
      } else if (allGroups[index - 1]?.compact) {
        kind = "postCompactWeak";
      }

      return {
        tokens: group.tokens,
        compact: group.compact,
        kind,
      };
    }

    const currentContentIndex = contentIndex;
    contentIndex += 1;
    const isLastContent = currentContentIndex === contentGroups.length - 1;
    const kind = group.compact
      ? "compactContent"
      : currentContentIndex === 0 && allGroups[0]?.tokens.every((token) => token === "da")
        ? "verb"
        : isLastContent
          ? "noun"
          : "content";

    return {
      tokens: group.tokens,
      compact: group.compact,
      kind,
    };
  });
}

function deriveSlotKindForPlanSlot(slot, index, allSlots) {
  const allDa = slot.tokens.every((token) => token === "da");
  if (allDa) {
    const previous = allSlots[index - 1];
    const next = allSlots[index + 1];

    if (index === 0) {
      const nextSlot = allSlots[index + 1];
      if (nextSlot && !nextSlot.tokens.every((token) => token === "da")) {
        return "articleLeadWeak";
      }
      return "leadWeak";
    }
    if (allSlots[index + 1]?.compact) {
      return "preCompactWeak";
    }
    if (allSlots[index - 1]?.compact) {
      return "postCompactWeak";
    }

    if (
      previous &&
      next &&
      !previous.tokens.every((token) => token === "da") &&
      !next.tokens.every((token) => token === "da") &&
      previous.tokens.at(-1) === "DUM" &&
      next.tokens[0] === "DUM" &&
      next.tokens.length >= 2
    ) {
      return "auxWeak";
    }

    return "linkWeak";
  }

  const contentSlots = allSlots.filter((item) => !item.tokens.every((token) => token === "da"));
  const contentIndex = contentSlots.findIndex((item) => item === slot);
  const isLastContent = contentIndex === contentSlots.length - 1;

  if (slot.compact) {
    if (!slot.tokens.includes("DUM")) {
      return "compactFunction";
    }
    return "compactContent";
  }

  if (slot.tokens.length >= 2) {
    const next = allSlots[index + 1];
    const nextAllDa = Boolean(next?.tokens?.every((token) => token === "da"));
    const nextNext = allSlots[index + 2];
    const nextNextContent = Boolean(nextNext && !nextNext.tokens.every((token) => token === "da"));

    if (index === 0 && nextAllDa) {
      if (slot.tokens[0] === "da" && slot.tokens[1] === "DUM") {
        return "noun";
      }
      if (nextNextContent) {
        return "noun";
      }
    }

    if (index === 0 && next && !nextAllDa) {
      return "content";
    }

    return isLastContent ? "noun" : "verb";
  }

  if (isLastContent) {
    return "noun";
  }

  if (index === 1 && allSlots[0]?.tokens.every((token) => token === "da")) {
    return "noun";
  }

  return "content";
}

function hasPlanSyntaxGap(slots) {
  const kinds = slots.map((slot) => slot.kind);

  for (let index = 0; index < kinds.length; index += 1) {
    const current = kinds[index];
    const next = kinds[index + 1];
    const previous = kinds[index - 1];

    if (current === "articleLeadWeak" && next !== "noun") {
      return true;
    }

    if (current === "postCompactWeak" && next && next !== "noun") {
      return true;
    }

    if (current === "auxWeak") {
      if (!next || ["compactFunction", "postCompactWeak"].includes(next)) {
        return true;
      }
    }

    if (current === "compactFunction") {
      if (!previous || !["verb", "content", "noun", "compactContent"].includes(previous)) {
        return true;
      }
      if (!next || !["postCompactWeak", "noun"].includes(next)) {
        return true;
      }
    }
  }

  return false;
}

function buildLooseSlotSegmentations(parsedPattern) {
  const results = [];
  const maxPlans = 128;

  function backtrack(groupIndex, slots) {
    if (results.length >= maxPlans) {
      return;
    }

    if (groupIndex >= parsedPattern.groups.length) {
      results.push(slots);
      return;
    }

    const group = parsedPattern.groups[groupIndex];
    if (group.compact) {
      backtrack(groupIndex + 1, slots.concat([{ ...group }]));
      return;
    }

    let mergedTokens = [];
    let mergedText = "";
    for (let nextIndex = groupIndex; nextIndex < parsedPattern.groups.length; nextIndex += 1) {
      const nextGroup = parsedPattern.groups[nextIndex];
      if (nextGroup.compact) {
        break;
      }

      mergedTokens = mergedTokens.concat(nextGroup.tokens);
      mergedText = mergedText ? `${mergedText} ${nextGroup.text}` : nextGroup.text;

      backtrack(
        nextIndex + 1,
        slots.concat([
          {
            text: mergedText,
            tokens: mergedTokens,
            compact: false,
            mergedLoose: nextIndex > groupIndex,
          },
        ]),
      );
    }
  }

  backtrack(0, []);

  return results
    .sort((a, b) => {
      const aMerged = a.filter((slot) => slot.mergedLoose).length;
      const bMerged = b.filter((slot) => slot.mergedLoose).length;
      return bMerged - aMerged;
    })
    .slice(0, maxPlans);
}

function segmentationPlanKey(slots) {
  return slots
    .map((slot) => `${slot.text}${slot.mergedLoose ? "*" : ""}`)
    .join(" | ");
}

function enumerateSegmentationPlans(parsedPattern, limit = 64) {
  const results = [];

  function backtrack(groupIndex, slots) {
    if (results.length >= limit) {
      return;
    }

    if (groupIndex >= parsedPattern.groups.length) {
      results.push(slots);
      return;
    }

    const group = parsedPattern.groups[groupIndex];
    if (group.compact) {
      backtrack(groupIndex + 1, slots.concat([{ ...group }]));
      return;
    }

    let mergedTokens = [];
    let mergedText = "";
    for (let nextIndex = groupIndex; nextIndex < parsedPattern.groups.length; nextIndex += 1) {
      const nextGroup = parsedPattern.groups[nextIndex];
      if (nextGroup.compact) {
        break;
      }

      mergedTokens = mergedTokens.concat(nextGroup.tokens);
      mergedText = mergedText ? `${mergedText} ${nextGroup.text}` : nextGroup.text;
      backtrack(
        nextIndex + 1,
        slots.concat([
          {
            text: mergedText,
            tokens: mergedTokens,
            compact: false,
            mergedLoose: nextIndex > groupIndex,
          },
        ]),
      );
    }
  }

  backtrack(0, []);

  return results;
}

function expandSlotKindVariants(plannedSlots) {
  const variants = [plannedSlots];

  for (let index = 0; index < plannedSlots.length; index += 1) {
    const slot = plannedSlots[index];
    if (slot.compact || slot.tokens.length < 2 || slot.tokens.every((token) => token === "da")) {
      continue;
    }

    const alternateKinds = [];
    const firstToken = slot.tokens[0];
    const lastToken = slot.tokens.at(-1);

    if (firstToken === "da" && lastToken === "DUM") {
      alternateKinds.push("noun", "content");
    } else if (firstToken === "DUM" && lastToken === "da") {
      alternateKinds.push("verb", "content", "noun");
    } else {
      alternateKinds.push("content");
    }

    const uniqueAlternates = [...new Set(alternateKinds)].filter((kind) => kind !== slot.kind);
    for (const kind of uniqueAlternates) {
      if (variants.length >= 4) {
        break;
      }
      const nextSlots = plannedSlots.map((item, slotIndex) =>
        slotIndex === index ? { ...item, kind } : item,
      );
      variants.push(nextSlots);
    }
  }

  return variants;
}

function buildGenerationTemplates(parsedPattern) {
  if (parsedPattern.groups.length === 4 && parsedPattern.groups.every((group) => group.tokens.length === 1)) {
    return FOUR_GROUP_TEMPLATES.map((template, indexTemplate) => ({
      slots: template.map((kind, indexGroup) => {
        const slot = {
          kind,
          text: parsedPattern.groups[indexGroup].text,
          compact: parsedPattern.groups[indexGroup].compact,
          tokens: parsedPattern.groups[indexGroup].tokens,
          templateIndex: indexTemplate,
        };
        return {
          ...slot,
          coverage: shapeCoverageForSlot(slot),
        };
      }),
      baseScore: TEMPLATE_BONUS[template.join(" ")] ?? 0,
    }));
  }

  return buildLooseSlotSegmentations(parsedPattern)
    .flatMap((slots) => {
      const basePlannedSlots = slots.map((slot, index, allSlots) => ({
        ...slot,
        kind: deriveSlotKindForPlanSlot(slot, index, allSlots),
      }));

      return expandSlotKindVariants(basePlannedSlots).map((plannedSlots) => {
        if (hasPlanSyntaxGap(plannedSlots)) {
          return null;
        }
        const slotsWithCoverage = plannedSlots.map((slot) => ({
          ...slot,
          coverage: shapeCoverageForSlot(slot),
        }));
        const kinds = slotsWithCoverage.map((slot) => slot.kind);
        let baseScore = slots.filter((slot) => slot.mergedLoose).length * 3;

        // Prefer sentence skeletons like:
        // weak lead -> noun-like subject -> weak linker -> verb phrase.
        if ((kinds[0] === "leadWeak" || kinds[0] === "articleLeadWeak") && kinds[1] === "noun") {
          baseScore += 10;
        }

        // Also allow an opening loose da DUM to act like one noun-like unit.
        if (slotsWithCoverage[0]?.mergedLoose && slotsWithCoverage[0]?.tokens.join(" ") === "da DUM" && kinds[0] === "noun") {
          baseScore += 9;
        }

        if (kinds.includes("linkWeak")) {
          baseScore += 4;
        }

        if (kinds.includes("auxWeak")) {
          baseScore += 8;
        }

        if (kinds.at(-2) === "postCompactWeak" && kinds.at(-1) === "noun") {
          baseScore += 6;
        }

        for (let index = 0; index < kinds.length - 1; index += 1) {
          const current = kinds[index];
          const next = kinds[index + 1];

          if (current === "verb" && next === "verb") {
            baseScore -= 18;
          }

          if ((current === "leadWeak" || current === "articleLeadWeak") && next === "verb") {
            baseScore -= 10;
          }

          if (current === "verb" && next === "compactFunction") {
            baseScore -= 6;
          }
        }

        for (const slot of slotsWithCoverage) {
          const totalCount = slot.coverage.totalCount;
          if (totalCount === 0) {
            baseScore -= slot.compact ? 40 : slot.mergedLoose ? 24 : 12;
            continue;
          }

          if (slot.compact && totalCount <= 3) {
            baseScore -= 12;
          } else if (slot.compact && totalCount <= 12) {
            baseScore -= 6;
          }

          if (slot.mergedLoose && slot.tokens.length >= 3 && totalCount <= 12) {
            baseScore -= 14;
          } else if (slot.mergedLoose && slot.tokens.length >= 3 && totalCount <= 60) {
            baseScore -= 6;
          }

          if (slot.kind === "noun" || slot.kind === "verb" || slot.kind === "content" || slot.kind === "compactContent") {
            if (totalCount >= 250) {
              baseScore += 8;
            } else if (totalCount >= 60) {
              baseScore += 4;
            } else if (totalCount >= 12) {
              baseScore += 2;
            }
          }

          baseScore += familiarCoverageScoreForSlot(slot);
        }

        return {
          slots: slotsWithCoverage,
          baseScore,
        };
      }).filter(Boolean);
    })
    .sort((a, b) => b.baseScore - a.baseScore)
    .slice(0, 96);
}

function slotPlanKey(slots) {
  return slots
    .map((slot) => `${slot.text ?? slot.tokens.join(" ")}${slot.mergedLoose ? "*" : ""}->${slot.kind}`)
    .join(" | ");
}

function realizePattern(parsedPattern, themeTags, desiredRhyme, options = {}) {
  const results = [];
  const templates = buildGenerationTemplates(parsedPattern);
  const allowRepeatedFunctionWords = options.allowRepeatedFunctionWords ?? false;
  const broadSearch = options.broadSearch ?? false;
  const maxResults = options.maxResults ?? (broadSearch ? 120 : 240);
  const maxVisits = options.maxVisits ?? (broadSearch ? 1500 : 3000);
  const maxPerTemplate = options.maxPerTemplate ?? Math.max(6, Math.ceil(maxResults / Math.min(templates.length || 1, 8)));
  const aiSeedWords = options.aiSeedWords ?? [];
  const aiSeedBuckets = options.aiSeedBuckets ?? {};
  let visitCount = 0;

  function backtrack(slots, slotIndex, words, score, usedWords, templateResults) {
    if (results.length >= maxResults || templateResults.length >= maxPerTemplate || visitCount >= maxVisits) {
      return true;
    }
    visitCount += 1;

    if (slotIndex === slots.length) {
      templateResults.push({
        words,
        score,
        templateKey: slotPlanKey(slots),
      });
      return results.length >= maxResults || templateResults.length >= maxPerTemplate;
    }

    const slot = slots[slotIndex];
    const isLastSlot = slotIndex === slots.length - 1;
    const candidates = chooseCandidatesForSlot(
      slot.kind,
      slot.tokens,
      themeTags,
      usedWords,
      isLastSlot,
      desiredRhyme,
      slot.compact,
      aiSeedWords,
      aiSeedBuckets,
    );
    const candidateLimit = broadSearch
      ? slot.compact
        ? 6
        : slot.kind === "function" || slot.kind.endsWith("Weak")
          ? 8
          : 5
      : slot.kind === "function" || slot.kind.endsWith("Weak")
        ? 8
        : 6;

    for (const candidate of candidates.slice(0, candidateLimit)) {
      const nextUsedWords =
        allowRepeatedFunctionWords && candidate.entry.type === "function"
          ? new Set(usedWords)
          : new Set([...usedWords, candidate.entry.text]);
      const shouldStop = backtrack(
        slots,
        slotIndex + 1,
        words.concat(candidate.entry),
        score + candidate.score,
        nextUsedWords,
        templateResults,
      );
      if (shouldStop) {
        return true;
      }
    }

    return false;
  }

  for (const template of templates) {
    const templateResults = [];
    const shouldStop = backtrack(template.slots, 0, [], template.baseScore, new Set(), templateResults);
    results.push(...templateResults);
    if (shouldStop) {
      break;
    }
  }
  return results;
}

export function rhymeMaster(lastWord, desiredRhyme) {
  if (!desiredRhyme) {
    return { ok: true, message: "No rhyme target set." };
  }

  const normalizedRhyme = normalizeRhymeTarget(desiredRhyme);

  const entry = resolveLexiconEntry(lastWord);
  if (!entry) {
    return { ok: false, message: "Last word is not in the pronunciation lexicon." };
  }

  return entry.rhyme === normalizedRhyme
    ? { ok: true, message: `Matches rhyme family "${desiredRhyme}".` }
    : { ok: false, message: `Expected rhyme family "${desiredRhyme}", got "${entry.rhyme}".` };
}

export function tasteGuardian() {
  return {
    score: 0,
    notes: ["Local taste ranking is off. Use AI prompt quality and your own judgment."],
  };
}

export function clicheChecker() {
  const hits = [];
  return {
    hasCliche: false,
    hits,
  };
}

export function storyWeaver(lineText, ideaText) {
  return {
    score: 0,
    note: "Local story ranking is off. Use the AI prompt and your own judgment for theme fit.",
  };
}

function chooseDefaultRhyme(themeTags) {
  if (themeTags.has("night") || themeTags.has("love")) {
    return "oo";
  }
  if (themeTags.has("hope")) {
    return "ay";
  }
  return "";
}

function lineToText(words) {
  return words.map((entry) => entry.text).join(" ");
}

function hasWeakEnding(words) {
  const last = words.at(-1);
  if (!last) {
    return false;
  }
  return last.type === "function";
}

function hasFunctionWordPile(words) {
  let run = 0;
  for (const entry of words) {
    if (entry.type === "function") {
      run += 1;
      if (run >= 3) {
        return true;
      }
    } else {
      run = 0;
    }
  }
  return false;
}

function hasBasicSyntaxGap(words) {
  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    const next = words[index + 1];
    const previous = words[index - 1];

    if (current.pos === "article") {
      if (!next || next.pos !== "noun") {
        return true;
      }
    }

    if (current.pos === "conj") {
      if (!previous || !next || previous.type !== "content" || next.type !== "content") {
        return true;
      }
    }

    if (current.pos === "prep") {
      if (!next || ["prep", "conj", "aux"].includes(next.pos)) {
        return true;
      }
    }
  }

  return false;
}

function hasAwkwardVerbChain(words) {
  const first = words[0];
  const second = words[1];
  const third = words[2];

  if (
    first?.pos === "pron" &&
    second?.pos === "verb" &&
    third?.pos === "verb"
  ) {
    return true;
  }

  return false;
}

function composeStructuredHybridLines(
  parsedPattern,
  themeTags,
  desiredRhyme,
  ideaText,
  aiSeedWords,
  aiSeedBuckets,
) {
  const maxPerPlan = 4;
  const maxTotalResults = 24;
  const compactShape = parsedPattern.groups[5]?.tokens.join(" ");
  const templates = buildGenerationTemplates(parsedPattern).slice(0, 20);
  const aiSeedSet = new Set(aiSeedWords.map((word) => normalizeWordKey(word)));

  const groups = parsedPattern.groups;
  const directSentenceTemplate = null;

  if (directSentenceTemplate) {
    templates.unshift(directSentenceTemplate);
  }

  const results = [];
  const planCounts = new Map();

  const canAcceptForPlan = (planKey) => (planCounts.get(planKey) ?? 0) < maxPerPlan;
  const recordPlanCandidate = (candidate) => {
    const planKey = candidate.planKey ?? candidate.diagnostics?.structure ?? "unknown";
    if (!canAcceptForPlan(planKey)) {
      return false;
    }
    results.push(candidate);
    planCounts.set(planKey, (planCounts.get(planKey) ?? 0) + 1);
    return true;
  };

  const restrictStructuredEntriesForSlot = (slotKind, entries, slotIndex = -1, slots = []) => {
    const unique = entries.filter(
      (entry, index, allEntries) => allEntries.findIndex((item) => item.text === entry.text) === index,
    );
    const isFamiliarContentEntry = (entry) =>
      entry.type !== "content" ||
      aiSeedSet.has(entry.text) ||
      (entry.tags?.length ?? 0) > 0;

    const byPos = (allowed) => unique.filter((entry) => allowed.includes(entry.pos));
    const determinerPronouns = unique.filter((entry) => ["my", "your", "his", "her", "our", "their"].includes(entry.text));
    const previousKind = slotIndex > 0 ? slots[slotIndex - 1]?.kind : "";

    if (slotKind === "articleLeadWeak") {
      const articles = byPos(["article"]);
      return articles.length > 0 ? articles : determinerPronouns.length > 0 ? determinerPronouns : unique;
    }

    if (slotKind === "auxWeak") {
      const auxiliaries = byPos(["aux"]);
      const preferred = auxiliaries.filter((entry) => ["is", "was"].includes(entry.text));
      return preferred.length > 0 ? preferred : auxiliaries.length > 0 ? auxiliaries : unique;
    }

    if (slotKind === "linkWeak") {
      const preps = byPos(["prep"]);
      const conjs = byPos(["conj"]);
      return preps.length > 0 ? [...preps, ...conjs] : conjs.length > 0 ? conjs : unique;
    }

    if (slotKind === "preCompactWeak" || slotKind === "postCompactWeak") {
      const articles = byPos(["article"]);
      return [...articles, ...determinerPronouns].length > 0 ? [...articles, ...determinerPronouns] : unique;
    }

    if (slotKind === "compactFunction") {
      const preps = byPos(["prep"]);
      const preferredPrepOrder = new Map(["into", "under", "over", "after", "onto", "during"].map((word, index) => [word, index]));
      return preps.length > 0
        ? [...preps].sort((a, b) => {
            const aPref = preferredPrepOrder.has(a.text) ? preferredPrepOrder.get(a.text) : Number.POSITIVE_INFINITY;
            const bPref = preferredPrepOrder.has(b.text) ? preferredPrepOrder.get(b.text) : Number.POSITIVE_INFINITY;
            if (aPref !== bPref) {
              return aPref - bPref;
            }
            return a.text.localeCompare(b.text);
          })
        : unique;
    }

    if (slotKind === "content" && previousKind === "auxWeak") {
      const verbs = byPos(["verb"]);
      const adjectives = byPos(["adj"]);
      const nouns = byPos(["noun"]);
      const filtered = [...verbs, ...adjectives, ...nouns].filter(isFamiliarContentEntry);
      return filtered.length > 0 ? filtered : [...verbs, ...adjectives, ...nouns].length > 0 ? [...verbs, ...adjectives, ...nouns] : unique;
    }

    if (["noun", "verb", "content"].includes(slotKind) && slots[slotIndex]?.tokens?.length >= 2) {
      const filtered = unique.filter(isFamiliarContentEntry);
      if (slotKind === "noun" && slotIndex === slots.length - 1) {
        return filtered;
      }
      return filtered.length > 0 ? filtered : unique;
    }

    return unique;
  };

  const makeEntries = (words) =>
    words
      .map((word) => resolveLexiconEntry(word))
      .filter(Boolean);

  if (directSentenceTemplate) {
    const directPlanKey = slotPlanKey(
      [
        { ...directSentenceTemplate.slots[0], text: groups[0].text },
        { ...directSentenceTemplate.slots[1], text: groups[1].text },
        { ...directSentenceTemplate.slots[2], text: groups[2].text },
        { ...directSentenceTemplate.slots[3], text: `${groups[3].text} ${groups[4].text}`, mergedLoose: true },
        { ...directSentenceTemplate.slots[4], text: groups[5].text },
        { ...directSentenceTemplate.slots[5], text: groups[6].text },
        { ...directSentenceTemplate.slots[6], text: groups[7].text },
      ],
    );
    const startEntries = makeEntries(["the", "my", "a"]);
    const auxEntries = makeEntries(["is", "are", "was"]);
    const articleEntries = makeEntries(["the", "my", "a"]);
    const compactEntries =
      compactShape === "dum da"
        ? lyricEntriesForPattern(["dum", "da"], {
            compact: true,
            pos: "prep",
            preferredWords: ["into", "under", "over", "after", "onto"],
          }).slice(0, 6)
        : [
            ...lyricEntriesForPattern(directSentenceTemplate.slots[4].tokens, {
              compact: true,
              pos: "prep",
              preferredWords: ["into", "under", "over", "after", "onto"],
            }).slice(0, 6),
            ...chooseCandidatesForSlot(
              "compactFunction",
              directSentenceTemplate.slots[4].tokens,
              themeTags,
              new Set(),
              false,
              desiredRhyme,
              true,
              aiSeedWords,
              aiSeedBuckets,
            )
              .slice(0, 4)
              .map((candidate) => candidate.entry),
          ].filter((entry, index, allEntries) => allEntries.findIndex((item) => item.text === entry.text) === index);

    const subjectEntries = [...new Set([...(aiSeedBuckets.nouns ?? []), ...(aiSeedBuckets.singleWords ?? [])])]
      .map((word) => resolveLexiconEntry(word))
      .filter((entry) => entry && entry.pos === "noun" && entry.syllables === 1);

    const verbSourceWords = [...new Set([...(aiSeedBuckets.verbs ?? []), ...(aiSeedBuckets.singleWords ?? [])])];
    const derivedVerbWords = verbSourceWords.flatMap((word) => deriveProgressiveForms(word));
    const verbEntries = [...new Set([...verbSourceWords, ...derivedVerbWords])]
      .map((word) => resolveLexiconEntry(word))
      .filter((entry) => entry && entry.pos === "verb" && entry.syllables === 2);

    const endEntries = [...new Set([...(aiSeedBuckets.nouns ?? []), ...(aiSeedBuckets.singleWords ?? [])])]
      .map((word) => resolveLexiconEntry(word))
      .filter((entry) => entry && entry.pos === "noun" && entry.syllables === 1);

    const frameGroups = [];
    for (const subject of subjectEntries) {
      for (const verb of verbEntries) {
        for (const start of startEntries) {
          for (const aux of auxEntries) {
            for (const compact of compactEntries) {
              for (const article of articleEntries) {
                const frameEndings = [];
                for (const ending of endEntries) {
                  if (ending.text === subject.text) {
                    continue;
                  }
                  const words = [start, subject, aux, verb, compact, article, ending];
                  if (
                    hasWeakEnding(words) ||
                    hasFunctionWordPile(words) ||
                    hasBasicSyntaxGap(words) ||
                    hasAwkwardVerbChain(words)
                  ) {
                    continue;
                  }

                  const lineText = words.map((entry) => entry.text).join(" ");
                  const candidate = evaluateCandidateLine({
                    lineText,
                    patternText: parsedPattern.groups.map((group) => group.text).join(" "),
                    ideaText,
                    rhymeTarget: desiredRhyme,
                    source: "hybrid-structure",
                    planKey: directPlanKey,
                    aiSeedWords,
                    aiSeedBuckets,
                  });
                  if (candidate) {
                    frameEndings.push(candidate);
                  }
                }

                if (frameEndings.length > 0) {
                  frameGroups.push(frameEndings);
                }
              }
            }
          }
        }
      }
    }

    for (let depth = 0; depth < 4 && canAcceptForPlan(directPlanKey); depth += 1) {
      for (const group of frameGroups) {
        if (group[depth]) {
          recordPlanCandidate(group[depth]);
        }
        if (!canAcceptForPlan(directPlanKey)) {
          break;
        }
      }
    }
  }

  for (const template of templates) {
    const templatePlanKey = slotPlanKey(template.slots);
    if (!canAcceptForPlan(templatePlanKey)) {
      continue;
    }
    const templateResults = [];
    const pools = template.slots.map((slot, index) =>
      restrictStructuredEntriesForSlot(
        slot.kind,
        chooseCandidatesForSlot(
          slot.kind,
          slot.tokens,
          themeTags,
          new Set(),
          index === template.slots.length - 1,
          desiredRhyme,
          slot.compact,
          aiSeedWords,
          aiSeedBuckets,
        )
          .slice(0, slot.kind.endsWith("Weak") || slot.kind === "articleLeadWeak" || slot.kind === "auxWeak" ? 6 : 8)
          .map((candidate) => candidate.entry),
        index,
        template.slots,
      ).slice(0, slot.kind.endsWith("Weak") || slot.kind === "articleLeadWeak" || slot.kind === "auxWeak" ? 4 : 6),
    );

    const backtrack = (index, words, usedWords) => {
      if (results.length >= maxTotalResults || templateResults.length >= maxPerPlan) {
        return;
      }
      if (index === pools.length) {
        if (
          hasWeakEnding(words) ||
          hasFunctionWordPile(words) ||
          hasBasicSyntaxGap(words) ||
          hasAwkwardVerbChain(words)
        ) {
          return;
        }

        const lineText = words.map((entry) => entry.text).join(" ");
        const candidate = evaluateCandidateLine({
          lineText,
          patternText: parsedPattern.groups.map((group) => group.text).join(" "),
          ideaText,
          rhymeTarget: desiredRhyme,
          source: "hybrid-structure",
          planKey: templatePlanKey,
          aiSeedWords,
          aiSeedBuckets,
        });
        if (candidate) {
          templateResults.push(candidate);
        }
        return;
      }

      for (const entry of pools[index]) {
        if (usedWords.has(entry.text) && entry.type !== "function") {
          continue;
        }
        const nextUsedWords =
          entry.type === "function" ? new Set(usedWords) : new Set([...usedWords, entry.text]);
        backtrack(index + 1, words.concat(entry), nextUsedWords);
      }
    };

    backtrack(0, [], new Set());
    const rankedTemplateResults = templateResults
      .sort((a, b) => b.score - a.score)
      .filter((candidate, index, allCandidates) => {
        const lastWord = normalizeText(candidate.text).at(-1) ?? "";
        return allCandidates.findIndex((other) => (normalizeText(other.text).at(-1) ?? "") === lastWord) === index;
      });

    for (const candidate of rankedTemplateResults) {
      recordPlanCandidate(candidate);
      if (results.length >= maxTotalResults) {
        break;
      }
    }
    if (results.length >= maxTotalResults) {
      break;
    }
  }

  return results;
}

function matchesSentenceHybridPattern(parsedPattern) {
  const groups = parsedPattern.groups;
  return (
    groups.length === 8 &&
    !groups[0].compact &&
    groups[0].tokens.join(" ") === "da" &&
    !groups[1].compact &&
    groups[1].tokens.join(" ") === "DUM" &&
    !groups[2].compact &&
    groups[2].tokens.join(" ") === "da" &&
    !groups[3].compact &&
    groups[3].tokens.join(" ") === "DUM" &&
    !groups[4].compact &&
    groups[4].tokens.join(" ") === "da" &&
    groups[5].compact &&
    groups[5].tokens.join(" ") === "dum da" &&
    !groups[6].compact &&
    groups[6].tokens.join(" ") === "da" &&
    !groups[7].compact &&
    groups[7].tokens.join(" ") === "DUM"
  );
}

function composeSupplementalSentenceHybridLines(
  parsedPattern,
  desiredRhyme,
  ideaText,
  aiSeedWords,
  aiSeedBuckets,
  targetCount = 12,
) {
  if (!matchesSentenceHybridPattern(parsedPattern)) {
    return [];
  }

  const makeEntries = (words) =>
    words
      .map((word) => resolveLexiconEntry(word))
      .filter(Boolean);

  const startEntries = makeEntries(["the", "my"]);
  const auxEntries = makeEntries(["is", "are", "was"]);
  const tailEntries = makeEntries(["the", "my"]);
  const compactEntries =
    parsedPattern.groups[5]?.tokens.join(" ") === "dum da"
      ? lyricEntriesForPattern(["dum", "da"], {
          compact: true,
          pos: "prep",
          preferredWords: ["into", "under", "over", "after", "onto"],
        }).slice(0, 6)
      : lyricEntriesForPattern(parsedPattern.groups[5].tokens, {
          compact: true,
          pos: "prep",
          preferredWords: ["into", "under", "over", "after", "onto"],
        }).slice(0, 6);

  const subjectEntries = [...new Set([...(aiSeedBuckets.nouns ?? []), ...(aiSeedBuckets.singleWords ?? [])])]
    .map((word) => resolveLexiconEntry(word))
    .filter((entry) => entry && entry.pos === "noun" && entry.syllables === 1);

  const verbSourceWords = [...new Set([...(aiSeedBuckets.verbs ?? []), ...(aiSeedBuckets.singleWords ?? [])])];
  const derivedVerbWords = verbSourceWords.flatMap((word) => deriveProgressiveForms(word));
  const verbEntries = [...new Set([...verbSourceWords, ...derivedVerbWords])]
    .map((word) => resolveLexiconEntry(word))
    .filter((entry) => entry && entry.pos === "verb" && entry.syllables === 2);

  const endEntries = [...new Set([...(aiSeedBuckets.nouns ?? []), ...(aiSeedBuckets.singleWords ?? [])])]
    .map((word) => resolveLexiconEntry(word))
    .filter((entry) => entry && entry.pos === "noun" && entry.syllables === 1);

  const candidates = [];
  const seenFrames = new Set();
  const supplementalPlanKey = slotPlanKey([
    { text: "da", kind: "articleLeadWeak", mergedLoose: false, tokens: ["da"] },
    { text: "DUM", kind: "noun", mergedLoose: false, tokens: ["DUM"] },
    { text: "da", kind: "auxWeak", mergedLoose: false, tokens: ["da"] },
    { text: "DUM da", kind: "verb", mergedLoose: true, tokens: ["DUM", "da"] },
    { text: "dumda", kind: "compactFunction", mergedLoose: false, tokens: ["dum", "da"] },
    { text: "da", kind: "postCompactWeak", mergedLoose: false, tokens: ["da"] },
    { text: "DUM", kind: "noun", mergedLoose: false, tokens: ["DUM"] },
  ]);

  for (const subject of subjectEntries) {
    for (const verb of verbEntries) {
      for (const start of startEntries) {
        for (const compact of compactEntries) {
          for (const tail of tailEntries) {
            const possibleEndings = endEntries.filter((ending) => ending.text !== subject.text);
            for (const ending of possibleEndings) {
              const aux = auxEntries.find((entry) => entry.text === (subject.text.endsWith("s") ? "are" : "is")) ?? auxEntries[0];
              const words = [start, subject, aux, verb, compact, tail, ending];
              if (
                hasWeakEnding(words) ||
                hasFunctionWordPile(words) ||
                hasBasicSyntaxGap(words) ||
                hasAwkwardVerbChain(words)
              ) {
                continue;
              }

              const lineText = words.map((entry) => entry.text).join(" ");
              const candidate = evaluateCandidateLine({
                lineText,
                patternText: parsedPattern.groups.map((group) => group.text).join(" "),
                ideaText,
                rhymeTarget: desiredRhyme,
                source: "hybrid-structure",
                planKey: supplementalPlanKey,
                aiSeedWords,
                aiSeedBuckets,
              });
              if (!candidate) {
                continue;
              }

              const frameKey = [start.text, subject.text, aux.text, verb.text, compact.text, tail.text].join("|");
              if (seenFrames.has(frameKey)) {
                continue;
              }
              seenFrames.add(frameKey);
              candidates.push(candidate);
              if (candidates.length >= targetCount) {
                return candidates;
              }
            }
          }
        }
      }
    }
  }

  return candidates;
}

function composeFallbackLines(parsedPattern, themeTags, desiredRhyme, ideaText) {
  if (parsedPattern.groups.length !== 6 || !parsedPattern.groups.at(-1)?.compact) {
    return [];
  }

  const slotTemplates = [
    ["adj", "noun", "function", "noun", "function", "noun"],
    ["noun", "noun", "function", "noun", "function", "noun"],
    ["adj", "noun", "function", "noun", "function", "adj"],
  ];

  const slotPoolsByTemplate = slotTemplates.map((template) =>
    template.map((kind, index) =>
      chooseCandidatesForSlot(
        kind,
        parsedPattern.groups[index].tokens,
        themeTags,
        new Set(),
        index === template.length - 1,
        desiredRhyme,
        parsedPattern.groups[index].compact,
      )
        .slice(0, index === template.length - 1 ? 4 : 3)
        .map((candidate) => candidate.entry),
    ),
  );

  const fallbackLines = [];

  for (const pools of slotPoolsByTemplate) {
    const [a, b, c, d, e, f] = pools;
    for (const first of a) {
      for (const second of b) {
        if (second.text === first.text) continue;
        for (const third of c) {
          for (const fourth of d) {
            if (fourth.text === first.text || fourth.text === second.text) continue;
            for (const fifth of e) {
              for (const sixth of f) {
                if ([first.text, second.text, fourth.text].includes(sixth.text)) continue;
                const lineText = [first, second, third, fourth, fifth, sixth].map((entry) => entry.text).join(" ");
                const candidate = evaluateCandidateLine({
                  lineText,
                  patternText: parsedPattern.groups.map((group) => group.text).join(" "),
                  ideaText,
                  rhymeTarget: desiredRhyme,
                  source: "fallback",
                });
                if (candidate) {
                  fallbackLines.push(candidate);
                }
                if (fallbackLines.length >= 24) {
                  return fallbackLines;
                }
              }
            }
          }
        }
      }
    }
  }

  return fallbackLines;
}

export function debugComposeFallback({ patternText, ideaText, rhymeTarget = "" }) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget) || chooseDefaultRhyme(themeTags);
  return composeFallbackLines(parsedPattern, themeTags, desiredRhyme, ideaText);
}

export function debugStructuredHybridCandidates({
  patternText,
  ideaText,
  rhymeTarget = "",
  aiSeedWords = [],
  aiSeedBuckets = {},
}) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const candidates = composeStructuredHybridLines(
    parsedPattern,
    themeTags,
    desiredRhyme,
    ideaText,
    aiSeedWords,
    aiSeedBuckets,
  );

  const grouped = new Map();
  for (const candidate of candidates) {
    const planKey = candidate.planKey ?? candidate.diagnostics?.structure ?? "unknown";
    if (!grouped.has(planKey)) {
      grouped.set(planKey, []);
    }
    grouped.get(planKey).push(candidate.text);
  }

  return [...grouped.entries()].map(([planKey, texts]) => ({
    planKey,
    count: texts.length,
    texts: texts.slice(0, 10),
  }));
}

export function debugSlotCandidates({ patternText, ideaText, rhymeTarget = "", slotKinds = [] }) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget) || chooseDefaultRhyme(themeTags);
  return parsedPattern.groups.map((group, index) => ({
    index,
    group: group.text,
    kind: slotKinds[index] ?? (group.tokens.every((token) => token === "da") ? "function" : "content"),
    candidates: chooseCandidatesForSlot(
      slotKinds[index] ?? (group.tokens.every((token) => token === "da") ? "function" : "content"),
      group.tokens,
      themeTags,
      new Set(),
      index === parsedPattern.groups.length - 1,
      desiredRhyme,
      group.compact,
    )
      .slice(0, 12)
      .map((item) => ({ text: item.entry.text, score: item.score, pos: item.entry.pos })),
  }));
}

export function explainSlotPlanning(patternText, limit = 12) {
  const parsedPattern = parsePatternDetailed(patternText);
  return buildGenerationTemplates(parsedPattern).slice(0, limit).map((template, index) => ({
    index,
    baseScore: template.baseScore,
    key: template.slots.map((slot) => slot.kind).join(" "),
    slots: template.slots.map((slot) => ({
      text: slot.text,
      tokens: slot.tokens,
      compact: slot.compact,
      mergedLoose: Boolean(slot.mergedLoose),
      kind: slot.kind,
      coverage: slot.coverage,
    })),
  }));
}

export function debugPlanAssembly({
  patternText,
  ideaText,
  rhymeTarget = "",
  aiSeedWords = [],
  aiSeedBuckets = {},
  planIndex = 0,
  candidateLimit = 6,
}) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const templates = buildGenerationTemplates(parsedPattern);
  const template = templates[planIndex];

  if (!template) {
    return null;
  }

  const restrictStructuredEntriesForSlot = (slotKind, entries, slotIndex = -1, slots = []) => {
    const unique = entries.filter(
      (entry, index, allEntries) => allEntries.findIndex((item) => item.text === entry.text) === index,
    );

    const byPos = (allowed) => unique.filter((entry) => allowed.includes(entry.pos));
    const determinerPronouns = unique.filter((entry) => ["my", "your", "his", "her", "our", "their"].includes(entry.text));
    const previousKind = slotIndex > 0 ? slots[slotIndex - 1]?.kind : "";

    if (slotKind === "articleLeadWeak") {
      const articles = byPos(["article"]);
      return articles.length > 0 ? articles : determinerPronouns.length > 0 ? determinerPronouns : unique;
    }

    if (slotKind === "auxWeak") {
      const auxiliaries = byPos(["aux"]);
      const preferred = auxiliaries.filter((entry) => ["is", "are", "was"].includes(entry.text));
      return preferred.length > 0 ? preferred : auxiliaries.length > 0 ? auxiliaries : unique;
    }

    if (slotKind === "linkWeak") {
      const preps = byPos(["prep"]);
      const conjs = byPos(["conj"]);
      return preps.length > 0 ? [...preps, ...conjs] : conjs.length > 0 ? conjs : unique;
    }

    if (slotKind === "preCompactWeak" || slotKind === "postCompactWeak") {
      const articles = byPos(["article"]);
      return [...articles, ...determinerPronouns].length > 0 ? [...articles, ...determinerPronouns] : unique;
    }

    if (slotKind === "compactFunction") {
      const preps = byPos(["prep"]);
      return preps.length > 0 ? preps : unique;
    }

    if (slotKind === "content" && previousKind === "auxWeak") {
      const verbs = byPos(["verb"]);
      const adjectives = byPos(["adj"]);
      const nouns = byPos(["noun"]);
      return [...verbs, ...adjectives, ...nouns].length > 0 ? [...verbs, ...adjectives, ...nouns] : unique;
    }

    return unique;
  };

  const slotPools = template.slots.map((slot, index) => {
    const rawCandidates = chooseCandidatesForSlot(
      slot.kind,
      slot.tokens,
      themeTags,
      new Set(),
      index === template.slots.length - 1,
      desiredRhyme,
      slot.compact,
      aiSeedWords,
      aiSeedBuckets,
    );
    const rawEntries = rawCandidates.map((candidate) => candidate.entry);
    const restrictedEntries = restrictStructuredEntriesForSlot(slot.kind, rawEntries, index, template.slots);
    const cappedEntries = restrictedEntries.slice(
      0,
      slot.kind.endsWith("Weak") || slot.kind === "articleLeadWeak" || slot.kind === "auxWeak" ? 4 : candidateLimit,
    );

    return {
      slot: {
        text: slot.text,
        tokens: slot.tokens,
        compact: slot.compact,
        mergedLoose: Boolean(slot.mergedLoose),
        kind: slot.kind,
      },
      rawTop: rawCandidates.slice(0, candidateLimit).map((candidate) => ({
        text: candidate.entry.text,
        pos: candidate.entry.pos,
        score: candidate.score,
      })),
      restrictedTop: cappedEntries.map((entry) => ({
        text: entry.text,
        pos: entry.pos,
      })),
    };
  });

  const seenTexts = new Set();
  const survivors = [];
  const failures = {
    weakEnding: [],
    functionPile: [],
    syntaxGap: [],
    awkwardVerbChain: [],
    exactValidation: [],
    duplicateText: [],
  };

  const backtrack = (index, words, usedWords) => {
    if (survivors.length >= 20) {
      return;
    }
    if (index === slotPools.length) {
      const lineText = words.map((entry) => entry.text).join(" ");
      if (hasWeakEnding(words)) {
        failures.weakEnding.push(lineText);
        return;
      }
      if (hasFunctionWordPile(words)) {
        failures.functionPile.push(lineText);
        return;
      }
      if (hasBasicSyntaxGap(words)) {
        failures.syntaxGap.push(lineText);
        return;
      }
      if (hasAwkwardVerbChain(words)) {
        failures.awkwardVerbChain.push(lineText);
        return;
      }
      const validation = validateLine(lineText, patternText);
      if (!validation.isValid) {
        failures.exactValidation.push(`${lineText} -> ${validation.reason}`);
        return;
      }
      if (seenTexts.has(lineText)) {
        failures.duplicateText.push(lineText);
        return;
      }
      seenTexts.add(lineText);
      survivors.push(lineText);
      return;
    }

    for (const entry of slotPools[index].restrictedTop) {
      if (usedWords.has(entry.text) && resolveLexiconEntry(entry.text)?.type !== "function") {
        continue;
      }
      const lexEntry = resolveLexiconEntry(entry.text);
      if (!lexEntry) {
        continue;
      }
      const nextUsedWords =
        lexEntry.type === "function" ? new Set(usedWords) : new Set([...usedWords, lexEntry.text]);
      backtrack(index + 1, words.concat(lexEntry), nextUsedWords);
    }
  };

  backtrack(0, [], new Set());

  return {
    planIndex,
    planKey: slotPlanKey(template.slots),
    baseScore: template.baseScore,
    slots: template.slots.map((slot) => ({
      text: slot.text,
      kind: slot.kind,
      tokens: slot.tokens,
      compact: slot.compact,
      mergedLoose: Boolean(slot.mergedLoose),
      coverage: slot.coverage,
    })),
    slotPools,
    survivors,
    failureCounts: Object.fromEntries(
      Object.entries(failures).map(([key, values]) => [key, values.length]),
    ),
    failureSamples: Object.fromEntries(
      Object.entries(failures).map(([key, values]) => [key, values.slice(0, 10)]),
    ),
  };
}

export function summarizeSlotPlanNeeds(patternText, limit = 12) {
  return explainSlotPlanning(patternText)
    .slice(0, limit)
    .map((plan) => {
      const needMap = new Map();

      for (const slot of plan.slots) {
        const key = `${slot.kind}|${slot.tokens.join(" ")}`;
        if (!needMap.has(key)) {
          needMap.set(key, {
            kind: slot.kind,
            tokenShape: slot.tokens.join(" "),
            compact: slot.compact,
            mergedLoose: slot.mergedLoose,
            count: 0,
          });
        }
        needMap.get(key).count += 1;
      }

      return {
        index: plan.index,
        baseScore: plan.baseScore,
        key: plan.key,
        slots: plan.slots.map((slot) => ({
          text: slot.text,
          tokenShape: slot.tokens.join(" "),
          kind: slot.kind,
          compact: slot.compact,
          mergedLoose: slot.mergedLoose,
          coverage: slot.coverage,
        })),
        needs: [...needMap.values()],
      };
    });
}

function lineIdeaScore(words, ideaText, aiSeedWords = []) {
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const aiSeedSet = new Set(aiSeedWords.map((word) => normalizeWordKey(word)));
  let score = 0;
  let offThemeContentCount = 0;

  for (const entry of words) {
    if (entry.type !== "content") {
      continue;
    }

    const localTheme = themeScore(entry, themeTags);
    const aiBonus = aiSeedSet.has(entry.text) ? 8 : 0;
    score += Math.min(localTheme, 12) + aiBonus;

    if (localTheme === 0 && aiBonus === 0) {
      offThemeContentCount += 1;
    }
  }

  return score - offThemeContentCount * 4;
}

function lineFamiliarityScore(words) {
  let score = 0;
  let coldCount = 0;

  for (const entry of words) {
    if (entry.type === "function") {
      score += 1;
      continue;
    }

    if (FAMILIAR_PROMPT_WORDS.has(entry.text) || SEED_SPEC_MAP.has(entry.text) || (entry.tags?.length ?? 0) > 0) {
      score += 10;
      continue;
    }

    if (COMMON_VERBS.has(entry.text) || COMMON_ADJECTIVES.has(entry.text)) {
      score += 8;
      continue;
    }

    if (entry.syllables <= 2 && entry.text.length <= 6) {
      score += 3;
    } else {
      coldCount += 1;
      score -= 8;
    }
  }

  return score - coldCount * 4;
}

function hasRepeatedWordEntries(words) {
  const seen = new Set();
  for (const entry of words) {
    if (seen.has(entry.text)) {
      return true;
    }
    seen.add(entry.text);
  }
  return false;
}

function hasTooManyColdWords(words) {
  let coldCount = 0;
  for (const entry of words) {
    if (entry.type === "function") {
      continue;
    }
    if (FAMILIAR_PROMPT_WORDS.has(entry.text) || SEED_SPEC_MAP.has(entry.text) || (entry.tags?.length ?? 0) > 0) {
      continue;
    }
    if (COMMON_VERBS.has(entry.text) || COMMON_ADJECTIVES.has(entry.text)) {
      continue;
    }
    if (entry.syllables <= 2 && entry.text.length <= 6) {
      continue;
    }
    coldCount += 1;
  }
  return coldCount >= 2;
}

function planStructureScore(templateKey = "") {
  let score = 0;

  if (
    templateKey.includes("auxWeak") &&
    templateKey.includes("->verb") &&
    templateKey.includes("compactFunction") &&
    templateKey.includes("postCompactWeak") &&
    templateKey.endsWith("DUM->noun")
  ) {
    score += 18;
  }

  if (templateKey.includes("auxWeak") && templateKey.includes("DUM da*->noun")) {
    score -= 18;
  }

  if (templateKey.includes("da DUM*->noun")) {
    score -= 24;
  }

  if (!templateKey.includes("auxWeak") && templateKey.includes("compactFunction")) {
    score -= 8;
  }

  if (!templateKey.startsWith("da->articleLeadWeak")) {
    score += 10;
  } else {
    score -= 2;
  }

  return score;
}

function scoreCandidate(words, ideaText, desiredRhyme, baseScore = 0, templateKey = "", aiSeedWords = []) {
  const text = lineToText(words);
  const rhyme = rhymeMaster(words.at(-1)?.text ?? "", desiredRhyme);

  return {
    text,
    planKey: templateKey || words.map((entry) => entry.pos).join(" "),
    score:
      baseScore +
      planStructureScore(templateKey) +
      lineFamiliarityScore(words) +
      lineIdeaScore(words, ideaText, aiSeedWords) +
      (rhyme.ok ? 4 : -10),
    diagnostics: {
      rhyme: rhyme.message,
      taste: ["Local taste ranking is off."],
      story: "Local story ranking is off.",
      cliche: [],
      structure: templateKey || words.map((entry) => entry.pos).join(" "),
    },
  };
}

function lexicalOverlapScore(a, b) {
  const aWords = new Set(normalizeText(a));
  const bWords = new Set(normalizeText(b));
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) {
      overlap += 1;
    }
  }
  return overlap;
}

function contentWordsForLine(lineText) {
  return normalizeText(lineText).filter((word) => {
    const entry = resolveLexiconEntry(word);
    return entry && entry.type === "content";
  });
}

function contentOverlapScore(a, b) {
  const aWords = new Set(contentWordsForLine(a));
  const bWords = new Set(contentWordsForLine(b));
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) {
      overlap += 1;
    }
  }
  return overlap;
}

function sameContentSet(a, b) {
  const aWords = [...new Set(contentWordsForLine(a))].sort();
  const bWords = [...new Set(contentWordsForLine(b))].sort();
  return aWords.length === bWords.length && aWords.every((word, index) => word === bWords[index]);
}

function frameSignature(lineText) {
  const words = normalizeText(lineText);
  if (words.length <= 2) {
    return words.join(" ");
  }
  return words.slice(0, -1).join(" ");
}

function anchorSignature(lineText) {
  const words = normalizeText(lineText);
  if (words.length <= 4) {
    return words.join(" ");
  }
  return [words[0], words[1], words[2], words[3]].join(" ");
}

function planKindsFromKey(planKey = "") {
  return planKey
    .split(" | ")
    .map((part) => part.split("->")[1] ?? "")
    .filter(Boolean);
}

function planFrameSignature(planKey = "") {
  const kinds = planKindsFromKey(planKey);
  return kinds.slice(0, 4).join("|");
}

function planStartKind(planKey = "") {
  return planKindsFromKey(planKey)[0] ?? "";
}

function planShapesFromKey(planKey = "") {
  return planKey
    .split(" | ")
    .map((part) => (part.split("->")[0] ?? "").replaceAll("*", "").trim())
    .filter(Boolean);
}

function classifyPlanLengthMode(planKey = "") {
  const shapes = planShapesFromKey(planKey);
  const lengths = shapes.map((shape) => (shape.match(/DUM|dum|da/gu) ?? []).length);
  const compactCount = lengths.filter((length) => length >= 2).length;
  const longCount = lengths.filter((length) => length >= 3).length;
  const oneCount = lengths.filter((length) => length === 1).length;

  if (compactCount === 1 && longCount === 0) {
    return "short_words";
  }

  if (longCount >= 1) {
    return "long_flow";
  }

  if (compactCount >= Math.ceil(lengths.length / 2)) {
    return "multi_syllable_heavy";
  }

  if (oneCount >= 4) {
    return "mostly_short";
  }

  return "mixed_lengths";
}

function planStartShape(planKey = "") {
  return planShapesFromKey(planKey)[0] ?? "";
}

function planLengthProfile(plan) {
  return plan.slots.map((slot) => slot.tokens.length).join("-");
}

function compactNeighborhoodSignature(plan) {
  const index = plan.slots.findIndex((slot) => slot.compact);
  if (index < 0) {
    return "";
  }
  const previous = plan.slots[index - 1]?.text ?? "";
  const next = plan.slots[index + 1]?.text ?? "";
  return `${previous}|${plan.slots[index].text}|${next}`;
}

function planNaturalnessScore(plan) {
  const kinds = plan.slots.map((slot) => slot.kind ?? "");
  let score = 0;

  const first = kinds[0] ?? "";
  if (first === "articleLeadWeak") score += 10;
  else if (first === "noun") score += 8;
  else if (first === "content") score += 5;
  else if (first === "verb") score += 2;

  for (let index = 0; index < kinds.length; index += 1) {
    const kind = kinds[index];
    const next = kinds[index + 1] ?? "";
    const nextTwo = kinds[index + 2] ?? "";

    if (kind === "auxWeak" && (next === "verb" || next === "content")) {
      score += 10;
    }

    if (kind === "linkWeak" && (next === "noun" || next === "content" || next === "verb")) {
      score += 6;
    }

    if (kind === "compactFunction") {
      const previous = kinds[index - 1] ?? "";
      if (previous === "preCompactWeak") {
        score -= 32;
      } else if (previous === "verb" || previous === "content" || previous === "noun") {
        score += 8;
      }

      if (next === "postCompactWeak" && nextTwo === "noun") {
        score += 10;
      } else if (next === "noun") {
        score += 8;
      } else if (next === "postCompactWeak") {
        score += 2;
      }
    }
  }

  const weakKinds = new Set(["articleLeadWeak", "leadWeak", "auxWeak", "linkWeak", "preCompactWeak", "postCompactWeak"]);
  const singletonWeakCount = plan.slots.filter(
    (slot, index) => slot.tokens.length === 1 && weakKinds.has(kinds[index]),
  ).length;
  if (singletonWeakCount >= 4) {
    score -= 10 + (singletonWeakCount - 4) * 4;
  }
  if (singletonWeakCount >= 3 && !kinds.includes("auxWeak")) {
    score -= 12;
  }
  if (singletonWeakCount >= 4 && !kinds.includes("linkWeak")) {
    score -= 8;
  }

  if (
    kinds[0] === "articleLeadWeak" &&
    kinds[1] === "noun" &&
    (kinds[2] === "linkWeak" || kinds[2] === "auxWeak") &&
    (kinds[3] === "verb" || kinds[3] === "content")
  ) {
    score += 10;
  }

  if (
    kinds[0] === "articleLeadWeak" &&
    (kinds[1] === "verb" || kinds[1] === "content") &&
    weakKinds.has(kinds[2] ?? "")
  ) {
    score -= 10;
  }

  const longMerged = plan.slots.filter((slot) => slot.mergedLoose && slot.tokens.length >= 3).length;
  score += longMerged * 3;

  for (let index = 0; index < plan.slots.length; index += 1) {
    const slot = plan.slots[index];
    const nextSlot = plan.slots[index + 1];
    const nextNounCoverage = nextSlot ? slotPosCoverageCount(nextSlot, ["noun"]) : 0;
    const nextContentCoverage = nextSlot ? slotPosCoverageCount(nextSlot, ["noun", "verb", "adj"]) : 0;

    if (slot.kind === "articleLeadWeak" && nextSlot && nextNounCoverage === 0) {
      score -= 24;
    }

    if (slot.kind === "auxWeak" && nextSlot && nextContentCoverage === 0) {
      score -= 22;
    }

    if (slot.kind === "compactFunction" && nextSlot && nextNounCoverage === 0) {
      score -= 20;
    }

    if (slot.kind === "verb" && slotPosCoverageCount(slot, ["verb"]) === 0) {
      score -= 18;
    }

    if (slot.kind === "noun" && slotPosCoverageCount(slot, ["noun"]) === 0) {
      score -= 18;
    }

    if (slot.kind === "noun" && slotPosCoverageCount(slot, ["noun"]) <= 3) {
      score -= 8;
    }

    if (slot.kind === "verb" && slotPosCoverageCount(slot, ["verb"]) <= 3) {
      score -= 6;
    }

    if (slot.kind === "compactFunction" && slotPosCoverageCount(slot, ["prep"]) <= 2) {
      score -= 8;
    }
  }

  return score;
}

function promptBankEntriesForSlot(slot, limit = 6, index = -1, slots = []) {
  return promptExamplesForSlot(slot, limit, index, slots)
    .map((word) => resolveLexiconEntry(word))
    .filter(Boolean)
    .filter((entry) =>
      entry.allowedLyricPatterns.some((pattern) =>
        patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
      ),
    )
    .filter((entry) => slotMatches(entry, slot.kind))
    .filter((entry, index, allEntries) => allEntries.findIndex((item) => item.text === entry.text) === index);
}

function promptBankExemplarSearch(slots = [], candidateLimit = 3) {
  const pools = slots.map((slot, index) =>
    promptBankEntriesForSlot(slot, slot.tokens.length === 1 ? 6 : 5, index, slots).slice(0, 5),
  );
  if (pools.some((pool) => pool.length === 0)) {
    return [];
  }

  const patternText = slots.map((slot) => slot.text).join(" ");
  let states = [{ entries: [], usedContent: new Set(), score: 0 }];
  const maxStatesPerStep = 48;

  for (let index = 0; index < pools.length; index += 1) {
    const nextStates = [];
    for (const state of states) {
      for (const entry of pools[index]) {
        if (entry.type !== "function" && state.usedContent.has(entry.text)) {
          continue;
        }

        const entries = state.entries.concat(entry);
        const entryWords = entries.map((item) => item.text);
        if (hasRepeatedWordEntries(entries) || hasTooManyColdWords(entries)) {
          continue;
        }

        let score = state.score;
        const previous = state.entries[state.entries.length - 1];
        if (entry.type === "content") {
          score += 3;
        }
        if (previous?.type === "function" && entry.type === "function") {
          score -= 6;
        }
        if (previous?.pos === "prep" && entry.pos === "prep") {
          score -= 10;
        }
        if (previous?.pos === "article" && entry.pos !== "noun") {
          score -= 14;
        }
        if (previous?.pos === "aux" && !["verb", "adj", "noun"].includes(entry.pos)) {
          score -= 12;
        }
        if (index === entries.length - 1 && hasWeakEnding(entries)) {
          score -= 20;
        }
        if (entries.length >= 3) {
          if (hasFunctionWordPile(entries)) score -= 18;
          if (hasBasicSyntaxGap(entries)) score -= 18;
          if (hasAwkwardVerbChain(entries)) score -= 18;
        }
        score += lineFamiliarityScore(entryWords);

        const nextUsedContent = new Set(state.usedContent);
        if (entry.type !== "function") {
          nextUsedContent.add(entry.text);
        }

        nextStates.push({
          entries,
          usedContent: nextUsedContent,
          score,
        });
      }
    }

    nextStates.sort((a, b) => b.score - a.score);
    states = nextStates.slice(0, maxStatesPerStep);
    if (states.length === 0) {
      return [];
    }
  }

  const candidates = states
    .map((state) => {
      const text = lineToText(state.entries);
      if (
        hasWeakEnding(state.entries) ||
        hasFunctionWordPile(state.entries) ||
        hasBasicSyntaxGap(state.entries) ||
        hasAwkwardVerbChain(state.entries)
      ) {
        return null;
      }
      if (!matchesSegmentationPlan(text, slots)) {
        return null;
      }
      const candidate = evaluateCandidateLine({
        lineText: text,
        patternText,
        ideaText: "",
        rhymeTarget: "",
        source: "prompt-example",
        planKey: segmentationPlanKey(slots),
      });
      return candidate ? { text, score: candidate.score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates
    .filter((item, index, allItems) => allItems.findIndex((other) => other.text === item.text) === index)
    .slice(0, candidateLimit);
}

const PROMPT_EXAMPLE_CACHE = new Map();

function promptExampleCandidates(slots = []) {
  const key = segmentationPlanKey(slots);
  if (!PROMPT_EXAMPLE_CACHE.has(key)) {
    PROMPT_EXAMPLE_CACHE.set(key, promptBankExemplarSearch(slots, 3));
  }
  return PROMPT_EXAMPLE_CACHE.get(key) ?? [];
}

function modePreferenceScore(plan, mode) {
  const lengths = plan.slots.map((slot) => slot.tokens.length);
  const ones = lengths.filter((length) => length === 1).length;
  const twos = lengths.filter((length) => length === 2).length;
  const threesPlus = lengths.filter((length) => length >= 3).length;
  const maxLength = Math.max(...lengths);
  const merged = plan.slots.filter((slot) => slot.mergedLoose).length;
  const startShape = plan.slots[0]?.text ?? "";
  let score = plan.baseScore ?? 0;

  if (mode === "short_words") {
    score += ones * 10 - twos * 4 - threesPlus * 12;
    if (startShape === "da DUM") score -= 8;
  } else if (mode === "mostly_short") {
    score += ones * 7 + Math.min(twos, 1) * 10 - Math.max(twos - 1, 0) * 3 - threesPlus * 10;
    if (twos === 0) score -= 10;
  } else if (mode === "mixed_lengths") {
    score += ones * 3 + twos * 8 + threesPlus * 4;
    if (ones === 0 || twos === 0) score -= 10;
  } else if (mode === "multi_syllable_heavy") {
    score += twos * 8 + threesPlus * 12 - ones * 3;
    if (twos + threesPlus < 2) score -= 18;
    if (startShape === "da") score -= 6;
    if (maxLength >= 5) score -= 20;
  } else if (mode === "long_flow") {
    score += threesPlus * 16 + merged * 5 - ones * 4;
    if (threesPlus === 0) score -= 25;
    if (startShape === "da") score -= 8;
    if (maxLength >= 5) score -= 8;
  }

  return score;
}

function segmentationSignature(slots = []) {
  return slots.map((slot) => slot.text).join(" | ");
}

function planPromptBankScore() {
  return 0;
}

export function summarizeModePlans(patternText, limit = 5) {
  const parsedPattern = parsePatternDetailed(patternText);
  const planningLimit = Math.max(48, limit * 20);
  const coarsePlans = enumerateSegmentationPlans(parsedPattern, planningLimit).map((rawSlots, index) => {
    const slots = rawSlots.map((slot) => ({ ...slot }));
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      slots[slotIndex].kind = deriveSlotKindForPlanSlot(slots[slotIndex], slotIndex, slots);
    }
    return {
      index,
      slots,
      baseScore: 0,
      planKey: segmentationPlanKey(slots),
      mode: classifyPlanLengthMode(segmentationPlanKey(slots)),
      segmentation: segmentationSignature(slots),
      realizabilityScore: planRealizabilityScore(slots),
      naturalnessScore: planNaturalnessScore({ slots }),
      promptabilityScore: slots.reduce(
        (total, slot, slotIndex) => total + Math.min(promptCandidateBankForSlot(slot, 6, slotIndex, slots).length, 4),
        0,
      ),
      promptBankScore: 0,
      promptExamples: [],
    };
  });

  const coarseRanked = [...coarsePlans].sort(
    (a, b) =>
      b.realizabilityScore + b.naturalnessScore + b.promptabilityScore - (a.realizabilityScore + a.naturalnessScore + a.promptabilityScore),
  );

  const promptCandidateLimit = Math.max(limit * 6, 24);
  const promptRankableKeys = new Set(coarseRanked.slice(0, promptCandidateLimit).map((plan) => plan.planKey));

  const plans = coarseRanked.map((plan) => {
    if (!promptRankableKeys.has(plan.planKey)) {
      return plan;
    }

    const promptExamples = promptExampleCandidates(plan.slots);
    const promptBankScore =
      promptExamples.length > 0
        ? promptExamples.reduce((best, item, index) => Math.max(best, item.score - index * 3), Number.NEGATIVE_INFINITY)
        : -40;

    const selectionExample = promptExamples[0]?.text
      ?.split(/\s+/u)
      .map((piece) => piece.trim())
      .filter(Boolean);

    return {
      ...plan,
      promptExamples,
      promptBankScore,
      promptExampleCount: promptExamples.length,
      selectionExample: Array.isArray(selectionExample) && selectionExample.length === plan.slots.length
        ? selectionExample
        : undefined,
    };
  });

  const selected = [];
  const seenSegmentation = new Set();
  const seenStarts = new Set();
  const seenProfiles = new Set();
  const seenCompactNeighborhoods = new Set();
  const pool = [...plans].sort(
    (a, b) =>
      b.realizabilityScore +
        b.naturalnessScore +
        b.promptabilityScore +
        b.promptBankScore -
        (a.realizabilityScore + a.naturalnessScore + a.promptabilityScore + a.promptBankScore),
  );

  while (selected.length < limit) {
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const plan of pool) {
      if (seenSegmentation.has(plan.segmentation)) {
        continue;
      }

      const startShape = planStartShape(plan.planKey);
      const profile = planLengthProfile(plan);
      const compactNeighborhood = compactNeighborhoodSignature(plan);
      let score = plan.realizabilityScore + plan.naturalnessScore + plan.promptabilityScore * 2 + plan.promptBankScore * 2;

      if (plan.naturalnessScore < 0) {
        score -= 40;
      } else if (plan.naturalnessScore >= 20) {
        score += 12;
      } else if (plan.naturalnessScore >= 10) {
        score += 6;
      }

      if (plan.promptabilityScore < plan.slots.length * 2) {
        score -= 20;
      }

      if ((plan.promptExamples?.length ?? 0) === 0) {
        score -= 50;
      } else if ((plan.promptExamples?.length ?? 0) >= 2) {
        score += 10;
      }
      if ((plan.promptExampleCount ?? 0) > 0 && (plan.promptBankScore ?? 0) < 18) {
        score -= 16;
      }
      if ((plan.promptExampleCount ?? 0) === 0 && plan.promptabilityScore < plan.slots.length * 2.5) {
        score -= 32;
      }

      if (startShape && !seenStarts.has(startShape)) score += 6;
      if (profile && !seenProfiles.has(profile)) score += 8;
      if (compactNeighborhood && !seenCompactNeighborhoods.has(compactNeighborhood)) score += 5;

      if (best === null || score > bestScore) {
        best = plan;
        bestScore = score;
      }
    }

    if (!best) {
      break;
    }

    selected.push(best);
    seenSegmentation.add(best.segmentation);
    const startShape = planStartShape(best.planKey);
    const profile = planLengthProfile(best);
    const compactNeighborhood = compactNeighborhoodSignature(best);
    if (startShape) seenStarts.add(startShape);
    if (profile) seenProfiles.add(profile);
    if (compactNeighborhood) seenCompactNeighborhoods.add(compactNeighborhood);
  }

  return selected;
}

function selectPlanRepresentatives(eligible, candidateCount) {
  const grouped = new Map();

  for (const candidate of eligible) {
    const planKey = candidate.planKey ?? candidate.diagnostics?.structure ?? "unknown";
    if (!grouped.has(planKey)) {
      grouped.set(planKey, []);
    }
    grouped.get(planKey).push(candidate);
  }

  const planGroups = [...grouped.entries()]
    .map(([planKey, candidates]) => ({
      planKey,
      mode: classifyPlanLengthMode(planKey),
      candidates: candidates.sort((a, b) => b.score - a.score),
    }))
    .sort((a, b) => b.candidates[0].score - a.candidates[0].score);

  const modeOrder = [
    "short_words",
    "mostly_short",
    "mixed_lengths",
    "multi_syllable_heavy",
    "three_plus_focus",
    "long_flow",
  ];

  const selected = [];
  const seenTexts = new Set();
  const seenFrames = new Set();
  const seenStarts = new Set();
  const seenModes = new Set();

  function trySelectGroup(group, strictNoOverlap = false) {
    const representative = group.candidates[0];
    if (!representative) {
      return;
    }

    if (
      strictNoOverlap &&
      selected.some(
        (prior) =>
          contentOverlapScore(representative.text, prior.text) > 0 ||
          anchorSignature(representative.text) === anchorSignature(prior.text),
      )
    ) {
      return;
    }

    const frame = planFrameSignature(group.planKey);
    const startKind = planStartKind(group.planKey);
    if (strictNoOverlap && frame && seenFrames.has(frame)) {
      return;
    }
    if (strictNoOverlap && startKind === "articleLeadWeak" && seenStarts.has("articleLeadWeak")) {
      return;
    }

    if (seenTexts.has(representative.text)) {
      return;
    }

    selected.push({
      ...representative,
      planKey: group.planKey,
      planMode: group.mode,
      planAlternatives: group.candidates.map((candidate) => candidate.text),
      planCandidateCount: group.candidates.length,
    });
    seenTexts.add(representative.text);
    if (frame) {
      seenFrames.add(frame);
    }
    if (startKind) {
      seenStarts.add(startKind);
    }
    if (group.mode) {
      seenModes.add(group.mode);
    }
  }

  for (const mode of modeOrder) {
    const group = planGroups.find((item) => item.mode === mode);
    if (!group) {
      continue;
    }
    trySelectGroup(group, true);
    if (selected.length >= candidateCount) {
      break;
    }
  }

  if (selected.length < candidateCount) {
    for (const group of planGroups) {
      if (selected.some((item) => item.planKey === group.planKey)) {
        continue;
      }
      if (seenModes.has(group.mode)) {
        continue;
      }
      trySelectGroup(group, false);
      if (selected.length >= candidateCount) {
        break;
      }
    }
  }

  return selected.slice(0, candidateCount);
}

export function generateLyrics({
  patternText,
  ideaText,
  rhymeTarget = "",
  candidateCount = 5,
  aiSeedWords = [],
  aiSeedBuckets = {},
}) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const rawCandidates = [];

  let realizations = realizePattern(parsedPattern, themeTags, desiredRhyme);
  if (realizations.length === 0 && parsedPattern.groups.length > 4) {
    realizations = realizePattern(parsedPattern, themeTags, desiredRhyme, {
      broadSearch: true,
      allowRepeatedFunctionWords: true,
      aiSeedWords,
      aiSeedBuckets,
    });
  } else if (aiSeedWords.length > 0) {
    realizations = realizePattern(parsedPattern, themeTags, desiredRhyme, {
      aiSeedWords,
      aiSeedBuckets,
    });
  }
  for (const realization of realizations) {
    if (
      hasWeakEnding(realization.words) ||
      hasFunctionWordPile(realization.words) ||
      hasBasicSyntaxGap(realization.words) ||
      hasAwkwardVerbChain(realization.words)
    ) {
      continue;
    }
    rawCandidates.push(
      scoreCandidate(
        realization.words,
        ideaText,
        desiredRhyme,
        realization.score,
        realization.templateKey,
      ),
    );
  }

  if (aiSeedWords.length > 0 && rawCandidates.length < candidateCount) {
    rawCandidates.push(
      ...composeStructuredHybridLines(
        parsedPattern,
        themeTags,
        desiredRhyme,
        ideaText,
        aiSeedWords,
        aiSeedBuckets,
      ),
    );
  }

  if (rawCandidates.length === 0) {
    rawCandidates.push(...composeFallbackLines(parsedPattern, themeTags, desiredRhyme, ideaText));
  }
  const eligible = [];
  const seen = new Set();
  for (const candidate of rawCandidates.sort((a, b) => b.score - a.score)) {
    if (seen.has(candidate.text)) {
      continue;
    }

    const validation = validateLine(candidate.text, patternText);
    if (!validation.isValid) {
      continue;
    }

    seen.add(candidate.text);
    eligible.push({
      ...candidate,
      validation,
      desiredRhyme: desiredRhyme || "none",
      source: aiSeedWords.length > 0 ? "hybrid" : "local",
      aiSeedWords,
      aiSeedBuckets,
    });
  }
  let selected = selectPlanRepresentatives(eligible, candidateCount);

  if (selected.length < candidateCount && aiSeedWords.length > 0) {
    const supplemental = composeSupplementalSentenceHybridLines(
      parsedPattern,
      desiredRhyme,
      ideaText,
      aiSeedWords,
      aiSeedBuckets,
      candidateCount * 3,
    );

    for (const candidate of supplemental) {
      if (selected.some((prior) => prior.planKey === (candidate.planKey ?? candidate.diagnostics?.structure))) {
        continue;
      }
      if (selected.some((prior) => anchorSignature(candidate.text) === anchorSignature(prior.text))) {
        continue;
      }
      selected.push({
        ...candidate,
        planKey: candidate.planKey ?? candidate.diagnostics?.structure ?? "unknown",
        planAlternatives: [candidate.text],
        planCandidateCount: 1,
      });
      if (selected.length >= candidateCount) {
        break;
      }
    }
  }

  return selected.sort((a, b) => b.score - a.score);
}

export function matchesSegmentationPlan(lineText, planSlots = []) {
  const normalizedLine = String(lineText || "").trim();
  if (!normalizedLine || !Array.isArray(planSlots) || planSlots.length === 0) {
    return false;
  }

  const words = normalizeText(normalizedLine);
  if (words.length !== planSlots.length) {
    return false;
  }

  for (let index = 0; index < planSlots.length; index += 1) {
    const slot = planSlots[index];
    const entry = resolveLexiconEntry(words[index]);
    if (!entry) {
      return false;
    }
    const compatible = entry.allowedLyricPatterns.some((pattern) =>
      patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
    );
    if (!compatible) {
      return false;
    }
  }

  return true;
}

function singleEntryFamiliarityScore(entry, slot = null) {
  if (!entry) {
    return -999;
  }

  let score = 0;

  if (entry.type === "function") {
    score += 5;
  }

  if (SEED_SPEC_MAP.has(entry.text) || (entry.tags?.length ?? 0) > 0) {
    score += 10;
  } else if (COMMON_VERBS.has(entry.text) || COMMON_ADJECTIVES.has(entry.text)) {
    score += 8;
  } else if (entry.syllables <= 2 && entry.text.length <= 8) {
    score += 4;
  } else {
    score -= 8;
  }

  if (slot?.tokens?.length === 1) {
    if (slot.tokens[0] === "da" && entry.type === "function") {
      score += 5;
    }
    if (slot.tokens[0] === "DUM" && entry.type === "content") {
      score += 5;
    }
  }

  return score;
}

function strictSlotKindMatch(entry, currentSlot) {
  const kind = currentSlot?.kind ?? "";
  if (kind === "articleLeadWeak") {
    return entry.type === "function" && ["article", "pron"].includes(entry.pos);
  }
  if (kind === "leadWeak") {
    return entry.type === "function" && ["pron", "article"].includes(entry.pos);
  }
  if (kind === "auxWeak") {
    return entry.pos === "aux";
  }
  if (kind === "linkWeak" || kind === "preCompactWeak") {
    return entry.type === "function" && ["prep", "conj"].includes(entry.pos);
  }
  if (kind === "postCompactWeak") {
    return entry.type === "function" && ["article", "pron"].includes(entry.pos);
  }
  if (kind === "compactFunction") {
    return entry.pos === "prep";
  }
  if (kind === "noun") {
    return entry.pos === "noun";
  }
  if (kind === "verb") {
    return entry.pos === "verb";
  }
  if (kind === "adj") {
    return entry.pos === "adj";
  }
  if (kind === "content") {
    return entry.type === "content";
  }
  return slotMatches(entry, kind);
}

function promptSlotCompatibility(entry, slot) {
  if (!entry || !slot?.tokens?.length) {
    return false;
  }
  if (!entry.allowedLyricPatterns.some((pattern) => patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)))) {
    return false;
  }

  const shape = slot.tokens.join(" ");
  if (shape === "da") {
    return entry.type === "function";
  }
  if (slot.compact && shape === "dum da") {
    return entry.pos === "prep";
  }
  return entry.type === "content";
}

function promptContextScore(entry, slot, index = -1, allSlots = []) {
  if (!entry || !slot?.tokens?.length) {
    return Number.NEGATIVE_INFINITY;
  }

  const shape = slot.tokens.join(" ");
  const previous = index > 0 ? allSlots[index - 1] : null;
  const next = index >= 0 && index < allSlots.length - 1 ? allSlots[index + 1] : null;
  const previousShape = previous?.tokens?.join(" ") ?? "";
  const nextShape = next?.tokens?.join(" ") ?? "";
  let score = singleEntryFamiliarityScore(entry, slot);

  if (shape === "da") {
    if (index === 0) {
      if (["article", "pron"].includes(entry.pos)) score += 18;
      else score -= 30;
    } else if (nextShape === "dum da" || previous?.compact) {
      if (["article", "pron"].includes(entry.pos)) score += 16;
      else score -= 24;
    } else if (previousShape === "da DUM" || previousShape === "da DUM da") {
      if (["prep", "conj"].includes(entry.pos)) score += 14;
      else if (entry.pos === "aux") score += 6;
    } else if (nextShape === "DUM da" || nextShape === "da DUM") {
      if (entry.pos === "aux") score += 12;
      if (["prep", "conj"].includes(entry.pos)) score += 10;
    } else {
      if (["article", "pron", "prep", "conj", "aux"].includes(entry.pos)) score += 6;
    }
    return score;
  }

  if (shape === "DUM") {
    if (entry.pos === "noun") score += 12;
    if (index === allSlots.length - 1) {
      if (entry.pos === "noun") score += 8;
      if (entry.pos === "verb") score -= 10;
    }
    return score;
  }

  if (shape === "DUM da") {
    if (nextShape === "dum da") {
      if (entry.pos === "verb") score += 14;
      if (entry.pos === "noun") score += 8;
    }
    if (previousShape === "da" && previous?.kind === "linkWeak") {
      if (entry.pos === "noun") score += 16;
      if (entry.pos === "verb") score -= 6;
    }
    if (entry.pos === "verb") score += 6;
    if (entry.pos === "noun") score += 4;
    return score;
  }

  if (shape === "da DUM") {
    if (index === 0) {
      if (["noun", "adj"].includes(entry.pos)) score += 12;
    }
    if (previousShape === "dum da") {
      if (["noun", "adj"].includes(entry.pos)) score += 18;
      if (entry.pos === "verb") score -= 12;
    }
    if (index === allSlots.length - 1) {
      if (["noun", "adj"].includes(entry.pos)) score += 10;
      if (entry.pos === "verb") score -= 10;
    }
    return score;
  }

  if (shape === "da DUM da") {
    if (nextShape === "dum da") {
      if (["verb", "adj"].includes(entry.pos)) score += 12;
      if (entry.pos === "noun") score -= 6;
    }
    if (entry.pos === "verb") score += 4;
    return score;
  }

  return score;
}

export function filterPlanSegmentCandidates(slot, words = [], limit = 6) {
  if (!slot?.tokens?.length || !Array.isArray(words) || words.length === 0) {
    return [];
  }

  const compatible = words
    .map((word) => resolveLexiconEntry(word))
    .filter(Boolean)
    .filter((entry) =>
        entry.allowedLyricPatterns.some((pattern) =>
          patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
        ),
      )
    .filter((entry) => strictSlotKindMatch(entry, slot))
    .sort((a, b) => singleEntryFamiliarityScore(b, slot) - singleEntryFamiliarityScore(a, slot))
    .filter((entry, index, allEntries) => allEntries.findIndex((item) => item.text === entry.text) === index)
    .slice(0, limit);

  return compatible.map((entry) => entry.text);
}

export function promptCandidateBankForSlot(slot, limit = 6, index = -1, allSlots = []) {
  if (!slot?.tokens?.length) {
    return [];
  }

  const preferred = promptExamplesForSlot(slot, Math.max(limit, 8), index, allSlots);
  const spacedKey = slot.tokens.join(" ");
  const exactEntries = LYRIC_LEXICON_BY_PATTERN.get(spacedKey) ?? [];
  const relaxedEntries = slot.compact
    ? compactRelaxationPatterns(slot.tokens, true).flatMap((pattern) => LYRIC_LEXICON_BY_PATTERN.get(pattern.join(" ")) ?? [])
    : [];
  const previous = index > 0 ? allSlots[index - 1] : null;
  const next = index >= 0 && index < allSlots.length - 1 ? allSlots[index + 1] : null;
  const preferredSet = new Set(preferred.map((word) => normalizeWordKey(word)));

  const scored = [...new Map([...exactEntries, ...relaxedEntries].map((entry) => [entry.text, entry])).values()]
    .filter((entry) => promptSlotCompatibility(entry, slot))
    .map((entry) => {
      let score = promptContextScore(entry, slot, index, allSlots);
      if (preferredSet.has(entry.text)) {
        score += 12;
      }
      if ((next?.kind === "auxWeak" || previous?.kind === "postCompactWeak" || previous?.kind === "compactFunction")) {
        if (["world", "dream", "heart", "mind", "depths", "wave", "soul", "light", "sky", "shadow", "silence"].includes(entry.text)) {
          score += 8;
        }
      }
      if (next?.kind === "compactFunction") {
        if (["falling", "drifting", "slipping", "floating", "fading", "rising", "breaking", "turning", "moving", "coming", "sinking", "leaving", "melting"].includes(entry.text)) {
          score += 8;
        }
      }
      return { entry, score };
    })
    .filter(({ score, entry }) => {
      if (entry.type === "function") {
        return true;
      }
      if (slot.tokens.length >= 3) {
        return score >= 2;
      }
      return score >= 0;
    })
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry.text);

  const familiarOnly = scored.filter((word) => FAMILIAR_PROMPT_WORDS.has(normalizeWordKey(word)));
  const fallbackScored = familiarOnly.length >= Math.min(4, limit) ? familiarOnly : scored;

  const merged = [...new Set([...preferred, ...fallbackScored].map((word) => normalizeWordKey(word)))]
    .filter(Boolean)
    .slice(0, limit);

  return merged;
}

export function realizeSegmentationPlan({
  patternText,
  ideaText,
  rhymeTarget = "",
  plan,
  segmentOptions = [],
  candidateLimit = 12,
}) {
  if (!plan?.slots?.length) {
    return [];
  }

  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);

  const pools = plan.slots.map((slot, index) => {
    const requested = Array.isArray(segmentOptions[index]) ? segmentOptions[index] : [];
    const compatibleEntries = requested
      .map((word) => resolveLexiconEntry(word))
      .filter(Boolean)
      .filter((entry) =>
        entry.allowedLyricPatterns.some((pattern) =>
          patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
        ),
      )
      .filter((entry) => slotMatches(entry, slot.kind));

    const dedupedCompatible = compatibleEntries.filter(
      (entry, entryIndex, allEntries) => allEntries.findIndex((item) => item.text === entry.text) === entryIndex,
    );

    if (dedupedCompatible.length > 0) {
      return dedupedCompatible.slice(0, 6);
    }

    return [];
  });

  if (pools.some((pool) => pool.length === 0)) {
    return [];
  }

  const seenTexts = new Set();
  const lines = [];

  function backtrack(index, entries, usedContent) {
    if (lines.length >= candidateLimit) {
      return;
    }

    if (index === pools.length) {
      const text = lineToText(entries);
      if (
        hasWeakEnding(entries) ||
        hasFunctionWordPile(entries) ||
        hasBasicSyntaxGap(entries) ||
        hasAwkwardVerbChain(entries)
      ) {
        return;
      }
      const validation = validateLine(text, patternText);
      if (!validation.isValid || !matchesSegmentationPlan(text, plan.slots) || seenTexts.has(text)) {
        return;
      }
      seenTexts.add(text);
      lines.push(
        scoreCandidate(entries, ideaText, desiredRhyme, plan.baseScore ?? 0, plan.planKey ?? slotPlanKey(plan.slots)),
      );
      return;
    }

    for (const entry of pools[index]) {
      if (entry.type !== "function" && usedContent.has(entry.text)) {
        continue;
      }
      const nextUsed = new Set(usedContent);
      if (entry.type !== "function") {
        nextUsed.add(entry.text);
      }
      backtrack(index + 1, entries.concat(entry), nextUsed);
      if (lines.length >= candidateLimit) {
        break;
      }
    }
  }

  backtrack(0, [], new Set());

  return lines.sort((a, b) => b.score - a.score);
}

export function evaluateCandidateLine({
  lineText,
  patternText,
  ideaText,
  rhymeTarget = "",
  source = "external",
  planKey = "",
  aiSeedWords = [],
  aiSeedBuckets = {},
}) {
  const normalizedLine = lineText.trim();
  if (!normalizedLine) {
    return null;
  }

  const validation = validateLine(normalizedLine, patternText);
  if (!validation.isValid) {
    return null;
  }

  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const words = normalizeText(normalizedLine);
  const resolvedEntries = words.map((word) => resolveLexiconEntry(word)).filter(Boolean);
  if (resolvedEntries.length !== words.length) {
    return null;
  }
  if (
    hasWeakEnding(resolvedEntries) ||
    hasFunctionWordPile(resolvedEntries) ||
    hasBasicSyntaxGap(resolvedEntries) ||
    hasAwkwardVerbChain(resolvedEntries)
  ) {
    return null;
  }
  if (hasRepeatedWordEntries(resolvedEntries) || hasTooManyColdWords(resolvedEntries)) {
    return null;
  }

  const candidate = scoreCandidate(
    resolvedEntries,
    ideaText,
    desiredRhyme,
    8,
    planKey || `${source} draft`,
    aiSeedWords,
  );
  return {
    ...candidate,
    validation,
    desiredRhyme: desiredRhyme || "none",
    source,
    aiSeedWords,
    aiSeedBuckets,
  };
}

export function getLexiconSnapshot() {
  return LEXICON.map(
    ({
      text,
      phonemes,
      pattern,
      lexicalPattern,
      preferredLyricPatterns,
      allowedLyricPatterns,
      spacedPattern,
      compactPattern,
      rhyme,
      rhymeKey,
      pos,
    }) => ({
      text,
      phonemes,
      pattern,
      lexicalPattern,
      preferredLyricPatterns,
      allowedLyricPatterns,
      spacedPattern,
      compactPattern,
      rhyme,
      rhymeKey,
      pos,
    }),
  );
}

export function promptExamplesForSlot(slot, limit = 5, index = -1, allSlots = []) {
  if (!slot?.tokens?.length) {
    return [];
  }

  const shape = slot.tokens.join(" ");
  const previous = index > 0 ? allSlots[index - 1] : null;
  const previousKind = previous?.kind ?? "";
  const next = index >= 0 && index < allSlots.length - 1 ? allSlots[index + 1] : null;
  const nextKind = next?.kind ?? "";
  const preferredByShape = {
    da: ["i", "the", "my", "in", "to", "of", "and", "a", "your", "our"],
    DUM: ["dream", "heart", "light", "sky", "tide", "sea", "depths", "world", "wave", "soul"],
    "DUM da": ["falling", "drifting", "fading", "floating", "slipping", "breaking", "summer", "shadow", "river", "ember"],
    "da DUM": ["awake", "alone", "within", "below", "beyond", "inside", "desire", "control", "regret", "mistake"],
    "da DUM da": ["forever", "becoming", "forgetting", "awakening", "remembering", "releasing"],
    "dum da": ["into", "under", "over", "after", "onto", "during"],
  };
  const preferredByKind = {
    articleLeadWeak: ["the", "my", "your", "our", "a"],
    leadWeak: ["i", "we", "you", "my", "the"],
    auxWeak: ["is", "was", "am", "are", "be"],
    linkWeak: ["of", "in", "through", "with", "and", "to"],
    preCompactWeak: ["of", "in", "through", "with", "to"],
    postCompactWeak: ["the", "my", "your", "our"],
    compactFunction: ["into", "under", "over", "after", "onto", "during"],
    noun: ["dream", "heart", "mind", "world", "depths", "wave", "ocean", "shadow", "silence"],
    verb: ["falling", "drifting", "fading", "floating", "slipping", "breaking", "coming", "turning", "moving", "sinking"],
    adj: ["silent", "golden", "hidden", "open", "alone", "awake"],
  };

  const preferredWords = preferredByShape[shape] ?? [];
  const kindPreferredWords = preferredByKind[slot.kind] ?? [];
  const compatiblePreferredWords = (words) =>
    words.filter((word) => {
      const entry = resolveLexiconEntry(word);
      if (!entry) {
        return false;
      }
      return entry.allowedLyricPatterns.some((pattern) =>
        patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
      );
    });
  const strictKindBank = (() => {
    if (shape === "da") {
      if (slot.kind === "articleLeadWeak") return ["the", "my", "your", "our", "a"];
      if (slot.kind === "postCompactWeak") return ["the", "my", "your", "our"];
      if (slot.kind === "auxWeak") return ["is", "was", "am", "are", "be"];
      if (slot.kind === "linkWeak" || slot.kind === "preCompactWeak") {
        if (
          previousKind === "noun" &&
          ["noun", "content", "verb"].includes(nextKind)
        ) {
          return ["of", "in", "through", "with"];
        }
        if (previousKind === "noun" && nextKind === "noun") {
          return ["of", "in"];
        }
        if (previousKind === "auxWeak" || nextKind === "verb") {
          return ["to", "and", "through", "with"];
        }
        return ["of", "in", "through", "with", "and", "to"];
      }
      return ["i", "the", "my", "in", "to", "of", "and", "a"];
    }
    if (slot.compact && shape === "dum da") {
      return ["into", "under", "over", "after", "onto", "during"];
    }
    if (shape === "DUM" && slot.kind === "verb") {
      return ["fall", "drift", "glow", "burn", "rise", "break"];
    }
    if (shape === "DUM da" && slot.kind === "noun") {
      return ["summer", "shadow", "river", "ember", "morning", "daybreak"];
    }
    if (shape === "DUM da" && slot.kind === "content" && previousKind === "linkWeak") {
      return ["summer", "shadow", "river", "ember", "morning", "daybreak"];
    }
    if (shape === "DUM da" && (slot.kind === "verb" || slot.kind === "content")) {
      return ["falling", "drifting", "fading", "floating", "slipping", "breaking", "coming", "turning", "moving", "sinking"];
    }
    if (shape === "DUM" && (slot.kind === "noun" || slot.kind === "content")) {
      if (index === allSlots.length - 1 || previousKind === "postCompactWeak") {
        return ["depths", "heart", "world", "light", "sky", "dream", "wave", "soul"];
      }
      return ["dream", "heart", "light", "sky", "wave", "tide", "soul", "world"];
    }
    if (shape === "da DUM" && slot.kind === "noun") {
      return ["revenge", "desire", "control", "regret", "mistake", "release"];
    }
    if (shape === "da DUM" && slot.kind === "content") {
      if (previousKind === "compactFunction") {
        return ["desire", "control", "regret", "mistake", "release", "surprise"];
      }
      return ["awake", "alone", "within", "beyond", "inside", "below"];
    }
    if (shape === "da DUM da") {
      return ["forever", "becoming", "forgetting", "remember", "surrender", "tomorrow"];
    }
    return [];
  })();
  const strictResolved = compatiblePreferredWords(strictKindBank);
  const useStrictOnly =
    strictResolved.length > 0 &&
    ["articleLeadWeak", "auxWeak", "linkWeak", "preCompactWeak", "postCompactWeak", "compactFunction"].includes(
      slot.kind,
    );
  const prioritized = useStrictOnly
    ? [...strictResolved]
    : [
        ...strictResolved,
        ...compatiblePreferredWords(slot.compact && shape === "dum da" ? preferredWords : kindPreferredWords),
        ...compatiblePreferredWords(preferredWords),
      ];

  const uniquePrioritized = [...new Set(prioritized.map((word) => normalizeWordKey(word)))]
    .filter(Boolean)
    .slice(0, limit);

  return uniquePrioritized;
}

export function getLyricShapeCoverageSnapshot() {
  const keys = new Set([
    ...LYRIC_LEXICON_BY_PATTERN.keys(),
    ...RAW_LEXICON_BY_PATTERN.keys(),
  ]);

  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((spacedKey) => {
      const tokens = spacedKey.split(" ");
      const compactKey = deriveCompactPattern(tokens);
      const relaxedKeys = compactRelaxationPatterns(tokens, true).map((pattern) => pattern.join(" "));
      const relaxedEntries = relaxedKeys.flatMap((key) => LYRIC_LEXICON_BY_PATTERN.get(key) ?? []);
      const lyricExactEntries = LYRIC_LEXICON_BY_PATTERN.get(spacedKey) ?? [];
      const rawExactEntries = RAW_LEXICON_BY_PATTERN.get(spacedKey) ?? [];
      const totalEntries = [...new Map([...lyricExactEntries, ...relaxedEntries].map((entry) => [entry.text, entry])).values()];
      return {
        spacedKey,
        compactKey,
        rawExactCount: rawExactEntries.length,
        lyricExactCount: lyricExactEntries.length,
        relaxedKeys,
        relaxedCount: [...new Set(relaxedEntries.map((entry) => entry.text))].length,
        totalCount: totalEntries.length,
        rawCompactCount: (RAW_LEXICON_BY_COMPACT_PATTERN.get(compactKey) ?? []).length,
        lyricCompactCount: (LYRIC_LEXICON_BY_COMPACT_PATTERN.get(compactKey) ?? []).length,
        examples: coverageExamples(totalEntries),
      };
    });
}

export function getThemeAliasSnapshot() {
  return THEME_ALIASES;
}

export function explainCandidateDebug({
  lineText,
  patternText,
  ideaText,
  rhymeTarget = "",
  source = "local",
  aiSeedWords = [],
  aiSeedBuckets = {},
}) {
  const normalizedLine = lineText.trim();
  const parsedPattern = parsePatternDetailed(patternText);
  const validation = validateLine(normalizedLine, patternText);
  const coverage = analyzeIdeaCoverage(ideaText);
  const normalizedIdeaWords = normalizeText(ideaText);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const words = normalizeText(normalizedLine);
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const entries =
    validation.entries ??
    words.map((word) => resolveLexiconEntry(word)).filter(Boolean);
  const story = storyWeaver(normalizedLine, ideaText);
  const taste = tasteGuardian(normalizedLine, ideaText);
  const rhyme = rhymeMaster(words.at(-1) ?? "", desiredRhyme);
  const cliche = clicheChecker(normalizedLine);

  const ideaExpansion = normalizedIdeaWords.map((word) => {
    const variants = lexicalVariants(word);
    const aliases = [...new Set(variants.flatMap((variant) => THEME_ALIASES[variant] ?? []))].filter((item) =>
      LEXICON_BY_WORD.has(item),
    );
    const concepts = [...new Set(variants.flatMap((variant) => conceptMembers(variant)))].filter((item) =>
      LEXICON_BY_WORD.has(item),
    );
    const wordnet = [...new Set(variants.flatMap((variant) => WORDNET_SEMANTIC_MAP[variant] ?? []))].filter((item) =>
      LEXICON_BY_WORD.has(item),
    );
    return {
      word,
      variants,
      aliases,
      concepts,
      wordnet,
    };
  });

  let tokenOffset = 0;
  const slotTrace = entries.map((entry, index) => {
    const slice = parsedPattern.tokens.slice(tokenOffset, tokenOffset + entry.lexicalPattern.length);
    tokenOffset += slice.length;
    const matchedPattern =
      entry.allowedLyricPatterns.find((pattern) => patternsCompatible(pattern, slice, false)) ??
      entry.allowedLyricPatterns[0] ??
      [];
    return {
      index,
      word: entry.text,
      pos: entry.pos,
      type: entry.type,
      tags: entry.tags,
      expected: slice,
      lexicalPattern: entry.lexicalPattern,
      preferredLyricPatterns: entry.preferredLyricPatterns,
      allowedLyricPatterns: entry.allowedLyricPatterns,
      matchedPattern,
      rhyme: entry.rhyme,
      compactPattern: entry.compactPattern,
      spacedPattern: entry.spacedPattern,
    };
  });

  return {
    source,
    input: {
      patternText,
      patternGroups: parsedPattern.groups.map((group) => ({
        text: group.text,
        tokens: group.tokens,
        compact: group.compact,
      })),
      flatTokens: parsedPattern.tokens,
      rhymeTarget,
      normalizedRhyme: desiredRhyme || "none",
      ideaText,
    },
    planning: explainSlotPlanning(patternText),
    ideaExpansion: {
      coverage,
      expandedWords: ideaExpansion,
      finalThemeTags: [...themeTags].sort(),
      aiSeedWords: [...new Set(aiSeedWords.map((word) => normalizeWordKey(word)))].filter(Boolean),
      aiSeedBuckets,
    },
    slotTrace,
    validation: {
      isValid: validation.isValid,
      reason: validation.reason,
      lexicalFlattened: entries.flatMap((entry) => entry.lexicalPattern),
    },
    scoring: {
      rhyme: {
        ok: rhyme.ok,
        message: rhyme.message,
      },
      story,
      taste,
      cliche,
    },
  };
}
