import { joinStressPattern } from "../stressTokens.js";

function selectStressPattern(state, mode) {
  if (mode === "cmu_raw") {
    return state.cmuRawStressPattern;
  }

  if (mode === "accepted_lyric") {
    return state.acceptedLyricStressPattern;
  }

  return state.preferredLyricStressPattern;
}

export function applyStressDecision(wordStates = [], options = {}) {
  const mode = options.mode ?? "preferred_lyric";
  const decidedWords = wordStates.map((state) => ({
    ...state,
    selectedStressPattern: selectStressPattern(state, mode) ?? [],
  }));

  const sentenceStressPattern = decidedWords.flatMap((state) => state.selectedStressPattern);

  return {
    mode,
    words: decidedWords,
    unknownWords: decidedWords.filter((state) => !state.found).map((state) => state.word),
    sentenceStressPattern,
    sentenceStressPatternText: joinStressPattern(sentenceStressPattern),
  };
}
