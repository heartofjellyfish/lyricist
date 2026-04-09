const SENTENCE_INITIAL_WEAKENABLE_WORDS = new Set(["then", "thus"]);

export function applyContextRuleHandling(wordStates = []) {
  return wordStates.map((state, index) => {
    if (SENTENCE_INITIAL_WEAKENABLE_WORDS.has(state.word) && index === 0) {
      return {
        ...state,
        pos: "func_adv",
        wordType: "function",
        preferredLyricStressPattern: ["da"],
        acceptedLyricStressPattern: ["da", "dum", "DUM"],
        contextHint: {
          kind: "sentence_initial_connective",
          preferWeakStress: true,
        },
      };
    }

    return state;
  });
}
