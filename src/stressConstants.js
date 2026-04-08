// ── Stress token types and weights ──────────────────────────────

export const CANONICAL_TOKENS = {
  dum: "dum",
  da: "da",
};

export const PATTERN_WEIGHT = {
  DUM: 5,
  dum: 3,
  da: 1,
};

// ── Vowel and rhyme mappings ────────────────────────────────────

export const VOWEL_LABELS = {
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

export const RHYME_ALIASES = {
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

// ── Pattern parsing ─────────────────────────────────────────────

export const PATTERN_GROUP_REGEX = /DUM|Dum|dum|da|Da/gu;

// ── Cliché detection ────────────────────────────────────────────

export const CLICHE_FRAGMENTS = [
  "broken heart",
  "fire in the dark",
  "midnight rain",
  "endless night",
  "faded light",
  "empty road",
  "chasing shadows",
  "frozen time",
];

// ── Seed entries ────────────────────────────────────────────────

export const SEED_ENTRY_SPECS = [
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

// ── Word class sets ─────────────────────────────────────────────

export const PREPOSITIONS = new Set([
  "into", "after", "over", "under", "during", "onto", "minus", "versus",
  "within", "without", "upon", "above", "about", "along", "below", "among",
  "beneath", "except", "across", "around", "beside", "before", "between",
  "against", "behind", "beyond", "until", "despite", "throughout", "aboard",
  "amidst", "amid", "toward", "towards", "with", "through", "for", "to",
  "in", "on", "at", "from", "off", "of", "by",
]);

export const ARTICLES = new Set(["a", "an", "the"]);
export const CONJUNCTIONS = new Set([
  "and", "or", "but", "nor", "yet", "so", "because",
  "as", "if", "once", "since", "than", "that", "though",
  "although", "unless", "while", "whereas",
]);

export const PRONOUNS = new Set([
  "i", "you", "he", "she", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "our", "their", "mine", "yours", "ours", "theirs",
  "it", "its", "this", "that", "these", "those",
  "who", "whom", "whose", "which", "what", "where", "when", "how",
]);

export const AUXILIARIES = new Set([
  "am", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had",
  "can", "could", "will", "would", "shall", "should",
  "may", "might", "must", "let", "lets",
]);

export const COMMON_VERBS = new Set([
  "watch", "dance", "play", "sing", "smile", "show", "hide", "lean",
  "drink", "close", "hear", "see", "let", "relax", "warm", "draw",
  "sketch", "circle", "drift", "flash", "gleam", "run", "burn", "rise",
  "hold", "keep", "find", "pull", "surge", "swell", "break", "chase",
]);

export const COMMON_ADJECTIVES = new Set([
  "popular", "young", "bright", "cold", "deep", "free", "slow", "blue",
  "wild", "perfect", "late", "full", "dark",
]);

// ── Lyric pattern overrides for function words ──────────────────

export const LYRIC_PATTERN_OVERRIDES = {
  into: { preferredLyricPatterns: [["dum", "da"]], allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]] },
  after: { preferredLyricPatterns: [["dum", "da"]], allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]] },
  over: { preferredLyricPatterns: [["dum", "da"]], allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]] },
  under: { preferredLyricPatterns: [["dum", "da"]], allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]] },
  during: { preferredLyricPatterns: [["dum", "da"]], allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]] },
  onto: { preferredLyricPatterns: [["dum", "da"]], allowedLyricPatterns: [["dum", "da"], ["DUM", "da"]] },
  within: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  without: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  above: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  about: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  across: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  before: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  between: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  against: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  beyond: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  i: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  she: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  we: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  you: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  my: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  your: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  is: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  are: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  am: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  was: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  were: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  be: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  been: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  being: { preferredLyricPatterns: [["DUM", "da"]], allowedLyricPatterns: [["DUM", "da"], ["dum", "da"]] },
  // "our" is typically monosyllabic in lyrics despite CMU giving 2 syllables
  our: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  // Demonstratives default to da but can take stress for contrast
  this: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  that: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  these: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  those: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  // Relative/interrogative pronouns
  who: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  what: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  which: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  where: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  when: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  how: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  // Additional auxiliaries and function words
  do: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  does: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  did: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  has: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  had: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  have: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  can: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  could: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  would: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  should: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  will: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  shall: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  may: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  might: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  must: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  let: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  lets: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  // Additional pronouns
  it: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  its: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  he: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  him: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  her: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  them: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  they: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  me: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  us: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  // Additional conjunctions
  as: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  if: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  than: { preferredLyricPatterns: [["da"]], allowedLyricPatterns: [["da"], ["dum"], ["DUM"]] },
  // "perfect" — CMU only has verb form (da-DUM); adjective is DUM-da
  perfect: { preferredLyricPatterns: [["DUM", "da"]], allowedLyricPatterns: [["DUM", "da"], ["da", "DUM"]] },
  // Additional prepositions with secondary stress
  along: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  among: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  around: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  beside: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  beneath: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  behind: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  below: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  upon: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  until: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  despite: { preferredLyricPatterns: [["da", "dum"]], allowedLyricPatterns: [["da", "dum"], ["da", "DUM"]] },
  // "forward" is ambiguous (adverb=DUMda, preposition=dumda). Allow both;
  // prefer DUMda since adverbial use is more common in lyrics.
  forward: { allowedLyricPatterns: [["DUM", "da"], ["dum", "da"]] },
};

// ── Theme aliases ───────────────────────────────────────────────

export const THEME_ALIASES = {
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

// ── Generation templates ────────────────────────────────────────

export const FOUR_GROUP_TEMPLATES = [
  ["noun", "verb", "prep", "noun"],
  ["adj", "noun", "prep", "noun"],
  ["verb", "noun", "prep", "noun"],
];

export const TEMPLATE_BONUS = {
  "noun verb prep noun": 6,
  "adj noun prep noun": 5,
  "verb noun prep noun": 3,
};
