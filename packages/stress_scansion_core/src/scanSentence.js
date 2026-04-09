import { getStressLexiconEntry, getStressLexiconSnapshot } from "./lexicon.js";
import { applySplitIntoWords } from "./pipeline/applySplitIntoWords.js";
import { applyFunctionWordLexicon } from "./pipeline/applyFunctionWordLexicon.js";
import { applyContractionHandling } from "./pipeline/applyContractionHandling.js";
import { applyContextRuleHandling } from "./pipeline/applyContextRuleHandling.js";
import { applyStressDecision } from "./pipeline/applyStressDecision.js";

export function lookupWordStress(word) {
  return getStressLexiconEntry(word);
}

export function scanSentenceToStressPattern(sentence, options = {}) {
  const wordStates = applySplitIntoWords(sentence);
  const withLexicon = applyFunctionWordLexicon(wordStates);
  const withContractions = applyContractionHandling(withLexicon);
  const withContextRules = applyContextRuleHandling(withContractions);
  const stressResult = applyStressDecision(withContextRules, options);

  return {
    input: sentence,
    ...stressResult,
  };
}

export { getStressLexiconSnapshot };
