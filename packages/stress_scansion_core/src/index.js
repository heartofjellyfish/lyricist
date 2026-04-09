export {
  normalizeWord,
  lowerCaseWord,
  splitWords,
  splitLowerCaseWords,
  wordLookupForms,
} from "./text.js";
export { extractStressToken, buildStressPattern, joinStressPattern } from "./stressTokens.js";
export {
  parseStressPattern,
  parseStressTokens,
  isExactStressMatch,
  getCompactStressVariants,
  getLyricStressVariants,
  isLyricStressCompatible,
} from "./lyricPatterns.js";
export { getStressLexiconEntry, getStressLexiconSnapshot } from "./lexicon.js";
export { lookupWordStress, scanSentenceToStressPattern } from "./scanSentence.js";
export { applySplitIntoWords } from "./pipeline/applySplitIntoWords.js";
export { applyFunctionWordLexicon } from "./pipeline/applyFunctionWordLexicon.js";
export { applyContractionHandling } from "./pipeline/applyContractionHandling.js";
export { applyContextRuleHandling } from "./pipeline/applyContextRuleHandling.js";
export { applyStressDecision } from "./pipeline/applyStressDecision.js";
