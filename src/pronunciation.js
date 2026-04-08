import { dictionary as cmuDictionary } from "../node_modules/cmu-pronouncing-dictionary/index.js";
import { VOWEL_LABELS } from "./stressConstants.js";

export function normalizeWordKey(word) {
  return word.toLowerCase();
}

export function normalizeText(text) {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9'\s]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

function buildPronunciationMap() {
  const pronunciationMap = new Map();

  for (const [rawWord, rawPhonemes] of Object.entries(cmuDictionary)) {
    const normalizedWord = rawWord.toLowerCase().replace(/\(\d+\)$/u, "");
    if (!pronunciationMap.has(normalizedWord)) {
      pronunciationMap.set(normalizedWord, rawPhonemes.split(" "));
    }
  }

  return pronunciationMap;
}

export const PRONUNCIATION_MAP = buildPronunciationMap();

export function extractStressToken(phoneme) {
  const match = phoneme.match(/([A-Z]{2})([012])/u);
  if (!match) {
    return null;
  }

  const [, vowel, stress] = match;
  return {
    vowel,
    stressToken: stress === "1" ? "DUM" : stress === "2" ? "dum" : "da",
  };
}

export function buildPattern(phonemes) {
  return phonemes.map(extractStressToken).filter(Boolean).map((item) => item.stressToken);
}

export function deriveCompactPattern(pattern) {
  return pattern.join("");
}

export function deriveRhymeInfo(phonemes) {
  let lastStressedIndex = -1;

  for (let index = 0; index < phonemes.length; index += 1) {
    if (/[12]/u.test(phonemes[index])) {
      lastStressedIndex = index;
    }
  }

  if (lastStressedIndex === -1) {
    lastStressedIndex = phonemes.findIndex((phoneme) => /\d/u.test(phoneme));
  }

  const tail = lastStressedIndex === -1 ? phonemes : phonemes.slice(lastStressedIndex);
  const vowel = extractStressToken(tail[0] ?? "");

  return {
    rhymeTail: tail,
    rhymeKey: tail.join(" "),
    rhymeVowel: vowel ? VOWEL_LABELS[vowel.vowel] ?? vowel.vowel.toLowerCase() : "",
  };
}
