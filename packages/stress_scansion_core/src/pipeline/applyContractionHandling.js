const PRONOUN_CLITIC_SUFFIXES = new Set(["'m", "'re", "'ve", "'ll", "'d"]);

function analyzeContraction(word) {
  const lower = String(word || "").toLowerCase();
  const pronounBases = ["i", "you", "we", "they", "he", "she", "it"];

  for (const base of pronounBases) {
    for (const suffix of PRONOUN_CLITIC_SUFFIXES) {
      if (lower === `${base}${suffix}`) {
        return {
          kind: "pronoun_auxiliary_contraction",
          base,
          suffix,
          preferWeakStress: true,
        };
      }
    }
  }

  return null;
}

export function applyContractionHandling(wordStates = []) {
  return wordStates.map((state) => {
    const contractionHint = analyzeContraction(state.word);
    if (!contractionHint) {
      return state;
    }

    return {
      ...state,
      pos: "pron",
      wordType: "function",
      preferredLyricStressPattern: ["da"],
      acceptedLyricStressPattern: ["da", "dum", "DUM"],
      contractionHint,
    };
  });
}
