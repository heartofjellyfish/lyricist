import { THEME_ALIASES } from "./stressConstants.js";
import { normalizeWordKey, normalizeText } from "./pronunciation.js";
import { LEXICON, LEXICON_BY_WORD, lexicalVariants } from "./lexicon.js";
import { WORDNET_SEMANTIC_MAP } from "./generatedWordnetMap.js";
import { conceptMembers } from "./lyricConcepts.js";

export function parseThemeTags(ideaText, extraSeedWords = []) {
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
    if (knownVocabulary.has(word)) return true;
    if ((THEME_ALIASES[word] ?? []).some((item) => knownVocabulary.has(item))) return true;
    if (conceptMembers(word).some((item) => knownVocabulary.has(item))) return true;
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
