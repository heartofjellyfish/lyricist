import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dictionary as cmuDictionary } from "../node_modules/cmu-pronouncing-dictionary/index.js";

const VOWEL_LABELS = {
  AA: "ah",
  AE: "a",
  AH: "uh",
  AO: "aw",
  AW: "ow",
  AY: "eye",
  EH: "eh",
  ER: "er",
  EY: "ay",
  IH: "ih",
  IY: "ee",
  OW: "oh",
  OY: "oy",
  UH: "uu",
  UW: "oo",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");

function normalizeWord(rawWord) {
  return rawWord.toLowerCase().replace(/\(\d+\)$/u, "");
}

function extractStressToken(phoneme) {
  const match = phoneme.match(/([A-Z]{2})([012])/u);
  if (!match) {
    return null;
  }

  const [, vowel, stress] = match;
  return {
    vowel,
    token: stress === "1" ? "DUM" : stress === "2" ? "dum" : "da",
  };
}

function buildPattern(phonemes) {
  return phonemes.map(extractStressToken).filter(Boolean).map((item) => item.token);
}

function deriveRhymeInfo(phonemes) {
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

function addToIndex(index, key, value) {
  if (!key) {
    return;
  }

  if (!index[key]) {
    index[key] = [];
  }

  index[key].push(value);
}

function uniqueSortedIds(index) {
  return Object.fromEntries(
    Object.entries(index)
      .map(([key, values]) => [key, [...new Set(values)].sort((a, b) => a - b)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

async function main() {
  const seen = new Set();
  const entries = [];
  const bySpacedPattern = {};
  const byCompactPattern = {};
  const byRhymeVowel = {};

  for (const [rawWord, rawPhonemes] of Object.entries(cmuDictionary)) {
    const word = normalizeWord(rawWord);
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);

    const phonemes = rawPhonemes
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => token !== "#");

    const lexicalPattern = buildPattern(phonemes);
    if (lexicalPattern.length === 0) {
      continue;
    }

    const rhyme = deriveRhymeInfo(phonemes);
    const entry = {
      id: entries.length,
      text: word,
      phonemes,
      lexicalPattern,
      spacedPattern: lexicalPattern.join(" "),
      compactPattern: lexicalPattern.join(""),
      syllables: lexicalPattern.length,
      rhymeVowel: rhyme.rhymeVowel,
      rhymeKey: rhyme.rhymeKey,
      rhymeTail: rhyme.rhymeTail,
    };

    entries.push(entry);
    addToIndex(bySpacedPattern, entry.spacedPattern, entry.id);
    addToIndex(byCompactPattern, entry.compactPattern, entry.id);
    addToIndex(byRhymeVowel, entry.rhymeVowel, entry.id);
  }

  await fs.mkdir(dataDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(dataDir, "cmu-entries.json"), JSON.stringify(entries)),
    fs.writeFile(path.join(dataDir, "by-spaced-pattern.json"), JSON.stringify(uniqueSortedIds(bySpacedPattern))),
    fs.writeFile(path.join(dataDir, "by-compact-pattern.json"), JSON.stringify(uniqueSortedIds(byCompactPattern))),
    fs.writeFile(path.join(dataDir, "by-rhyme-vowel.json"), JSON.stringify(uniqueSortedIds(byRhymeVowel))),
  ]);

  const summary = {
    entries: entries.length,
    spacedPatterns: Object.keys(bySpacedPattern).length,
    compactPatterns: Object.keys(byCompactPattern).length,
    rhymeVowels: Object.keys(byRhymeVowel).length,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
