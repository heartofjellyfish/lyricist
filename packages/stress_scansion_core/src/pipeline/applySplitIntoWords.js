import { splitWords } from "../text.js";

export function applySplitIntoWords(sentence) {
  return splitWords(sentence).map((word, index) => ({
    index,
    word,
    found: false,
    phonemes: [],
    pos: null,
    wordType: null,
    cmuRawStressPattern: [],
    preferredLyricStressPattern: [],
    acceptedLyricStressPattern: [],
    selectedStressPattern: [],
    functionWordHint: null,
    contractionHint: null,
    contextHint: null,
  }));
}
