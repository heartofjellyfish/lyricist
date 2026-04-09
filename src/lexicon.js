import {
  SEED_ENTRY_SPECS,
  PREPOSITIONS,
  ARTICLES,
  DETERMINERS,
  CONJUNCTIONS,
  PRONOUNS,
  CONTRACTIONS,
  AUXILIARIES,
  COMMON_VERBS,
  COMMON_ADJECTIVES,
  STRESS_SHIFTING_HETERONYMS,
  LYRIC_PATTERN_OVERRIDES,
  RHYME_ALIASES,
  THEME_ALIASES,
} from "./stressConstants.js";
import {
  normalizeWordKey,
  PRONUNCIATION_MAP,
  buildPattern,
  deriveCompactPattern,
  deriveRhymeInfo,
} from "./pronunciation.js";
import {
  compactRelaxationPatterns,
  lyricSliceVariants,
  matchesPattern,
} from "./patternParser.js";

// ── Word classification ─────────────────────────────────────────

function isUsableWord(word, phonemes) {
  const syllableCount = buildPattern(phonemes).length;
  const isFunctionWord =
    PREPOSITIONS.has(word) ||
    ARTICLES.has(word) ||
    DETERMINERS.has(word) ||
    CONJUNCTIONS.has(word) ||
    PRONOUNS.has(word) ||
    CONTRACTIONS.has(word) ||
    AUXILIARIES.has(word);

  return (
    /^[a-z]+$/u.test(word) &&
    word.length <= 12 &&
    (word.length > 1 || isFunctionWord) &&
    syllableCount >= 1 &&
    syllableCount <= 4
  );
}

export function guessPos(word, lexicalPattern) {
  if (PREPOSITIONS.has(word)) return { pos: "prep", type: "function" };
  if (ARTICLES.has(word)) return { pos: "article", type: "function" };
  if (DETERMINERS.has(word)) return { pos: "det", type: "function" };
  if (CONJUNCTIONS.has(word)) return { pos: "conj", type: "function" };
  if (PRONOUNS.has(word)) return { pos: "pron", type: "function" };
  if (CONTRACTIONS.has(word)) return { pos: "contraction", type: "function" };
  if (AUXILIARIES.has(word)) return { pos: "aux", type: "function" };
  if (word.endsWith("ly")) return { pos: "adv", type: "content" };
  if (COMMON_VERBS.has(word)) return { pos: "verb", type: "content" };
  if (COMMON_ADJECTIVES.has(word)) return { pos: "adj", type: "content" };
  if (/(ing|ed|ize|ise|fy|ate|en)$/u.test(word)) return { pos: "verb", type: "content" };
  if (/(ous|ful|less|ive|ic|ish|able|ible|al|ary|ory|ent|ant|y)$/u.test(word)) return { pos: "adj", type: "content" };
  if (/(tion|sion|ment|ness|ity|ism|ist|ship|hood|dom|age|er|or)$/u.test(word)) return { pos: "noun", type: "content" };
  if (lexicalPattern.length === 1) return { pos: "noun", type: "content" };
  if (lexicalPattern[0] === "da" && lexicalPattern.at(-1) === "DUM") return { pos: "verb", type: "content" };
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

  // 2-syllable content words with DUM-DUM are likely compound words (e.g. baseball,
  // nightfall). English compound nouns carry primary stress on the first element and
  // secondary on the second: DUM-dum, not DUM-DUM.
  if (guessed.type === "content" && pattern.length === 2 && pattern[0] === "DUM" && pattern[1] === "DUM") {
    const compoundPattern = ["DUM", "dum"];
    return {
      preferredLyricPatterns: [compoundPattern],
      allowedLyricPatterns: override.allowedLyricPatterns ?? [compoundPattern, pattern],
    };
  }

  // CMU assigns secondary stress (dum) to post-primary syllables in 3+
  // syllable words (e.g. "nobody's" → DUM-dum-dum, "enemy" → DUM-da-dum).
  // In lyric scansion those trailing dum syllables read as da. We restrict
  // this to 3+ syllable words: in 2-syllable words the secondary stress is
  // real (RAIN-coat, AB-stract) and should be preserved as DUM-dum.
  // Pre-primary dum (e.g. "afternoon" = dum-da-DUM) is always kept because
  // it represents genuine secondary stress before the ictus.
  const lastDumIdx = pattern.lastIndexOf("DUM");
  const hasPostPrimaryDum =
    pattern.length >= 3 &&
    lastDumIdx >= 0 &&
    pattern.slice(lastDumIdx + 1).includes("dum");
  if (hasPostPrimaryDum) {
    const lyricPattern = pattern.map((token, i) =>
      i > lastDumIdx && token === "dum" ? "da" : token,
    );
    return {
      preferredLyricPatterns: [lyricPattern],
      allowedLyricPatterns: override.allowedLyricPatterns ?? [lyricPattern, pattern],
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
  let override = LYRIC_PATTERN_OVERRIDES[key] ?? {};
  // Stress-shifting heteronyms: CMU stores the verb form (da-DUM) but
  // noun/adjective use (DUM-da) is equally valid. Offer both; prefer DUM-da.
  if (
    !override.preferredLyricPatterns &&
    STRESS_SHIFTING_HETERONYMS.has(key) &&
    pattern.length === 2 &&
    pattern[0] === "da" &&
    pattern[1] === "DUM"
  ) {
    override = {
      preferredLyricPatterns: [["DUM", "da"]],
      allowedLyricPatterns: [["DUM", "da"], ["da", "DUM"]],
    };
  }
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

// ── Seed spec lookup ────────────────────────────────────────────

export const SEED_SPEC_MAP = new Map(
  SEED_ENTRY_SPECS.map((spec) => [normalizeWordKey(spec.text), spec]),
);

// ── Build the canonical lexicon ─────────────────────────────────

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

export const LEXICON = buildCanonicalLexicon();
export const LEXICON_BY_WORD = new Map(LEXICON.map((entry) => [entry.text, entry]));

// ── Pattern indices ─────────────────────────────────────────────

export const LYRIC_LEXICON_BY_PATTERN = new Map();
export const LYRIC_LEXICON_BY_COMPACT_PATTERN = new Map();
export const RAW_LEXICON_BY_PATTERN = new Map();
export const RAW_LEXICON_BY_COMPACT_PATTERN = new Map();

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

// ── Familiar words set ──────────────────────────────────────────

export const FAMILIAR_PROMPT_WORDS = new Set(
  [
    ...SEED_ENTRY_SPECS.map((spec) => spec.text),
    ...COMMON_VERBS,
    ...COMMON_ADJECTIVES,
    ...PREPOSITIONS,
    ...ARTICLES,
    ...PRONOUNS,
    ...AUXILIARIES,
    ...CONJUNCTIONS,
    "light", "mind", "world", "depths", "soul", "sky", "stars", "silence",
    "shadow", "inside", "beyond", "within", "below", "awake", "alone",
    "control", "regret", "mistake", "revenge", "desire", "release", "become",
    "open", "hidden", "golden", "silent", "falling", "slipping", "breaking",
    "drifting", "fading", "wander", "wandering", "dreaming", "floating",
    "daybreak", "moonlight",
  ].map((word) => normalizeWordKey(word)),
);

// ── Lookup helpers ──────────────────────────────────────────────

export function resolveLexiconEntry(word) {
  return LEXICON_BY_WORD.get(normalizeWordKey(word)) ?? null;
}

export function lexicalVariants(word) {
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

export function deriveProgressiveForms(word) {
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

// ── Rhyme resolution ────────────────────────────────────────────

export function normalizeRhymeTarget(rhymeTarget) {
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

// ── Coverage analysis ───────────────────────────────────────────

export function coverageBand(count) {
  if (count === 0) return "none";
  if (count <= 3) return "tiny";
  if (count <= 12) return "narrow";
  if (count <= 60) return "medium";
  if (count <= 250) return "broad";
  return "huge";
}

export function coverageExamples(entries, limit = 5) {
  return [...new Set((entries ?? []).map((entry) => entry.text))].slice(0, limit);
}

export function shapeCoverageForSlot(slot) {
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

export function lyricEntriesForPattern(tokens, { compact = false, pos = "", preferredWords = [] } = {}) {
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

// ── Familiarity and coverage scoring ────────────────────────────

const FAMILIAR_COVERAGE_SCORE_CACHE = new Map();

export function familiarEntryCountForSlice(slice, compact = false, maxCount = 17) {
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

export function familiarCoverageScoreForSlot(slot) {
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

export function planRealizabilityScore(slots = []) {
  return slots.reduce((total, slot) => total + familiarCoverageScoreForSlot(slot), 0);
}

const SLOT_POS_COVERAGE_CACHE = new Map();

export function slotPosCoverageCount(slot, posList = []) {
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

// ── Snapshots ───────────────────────────────────────────────────

export function getLexiconSnapshot() {
  return LEXICON.map(
    ({
      text, phonemes, pattern, lexicalPattern,
      preferredLyricPatterns, allowedLyricPatterns,
      spacedPattern, compactPattern, rhyme, rhymeKey, pos,
    }) => ({
      text, phonemes, pattern, lexicalPattern,
      preferredLyricPatterns, allowedLyricPatterns,
      spacedPattern, compactPattern, rhyme, rhymeKey, pos,
    }),
  );
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
