import { getStressLexiconEntry } from "../lexicon.js";

export function applyFunctionWordLexicon(wordStates = []) {
  return wordStates.map((state) => {
    const entry = getStressLexiconEntry(state.word);

    if (!entry) {
      return state;
    }

    return {
      ...state,
      found: true,
      phonemes: entry.phonemes,
      pos: entry.pos,
      wordType: entry.wordType,
      cmuRawStressPattern: entry.cmuRawStressPattern,
      preferredLyricStressPattern: entry.preferredLyricStressPatterns[0] ?? [],
      acceptedLyricStressPattern: entry.acceptedLyricStressPatterns[0] ?? [],
      functionWordHint: entry.wordType === "function" ? entry.pos : null,
    };
  });
}
