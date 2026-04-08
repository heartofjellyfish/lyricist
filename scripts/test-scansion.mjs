// Test sentence-to-stress-pattern using class examples
import { resolveLexiconEntry } from "../src/lexicon.js";
import { normalizeText } from "../src/pronunciation.js";

function sentenceToStress(sentence) {
  const words = normalizeText(sentence);
  const results = [];
  for (const word of words) {
    const entry = resolveLexiconEntry(word);
    if (!entry) {
      results.push({ word, pattern: "???", preferred: null });
      continue;
    }
    results.push({
      word,
      lexicalPattern: entry.lexicalPattern.join(""),
      preferred: entry.preferredLyricPatterns[0].join(""),
      allowed: entry.allowedLyricPatterns.map(p => p.join("")),
      pos: entry.pos,
      type: entry.type,
    });
  }
  return results;
}

function formatResult(results) {
  const preferredLine = results.map(r => r.preferred ?? "???").join(" ");
  const lexicalLine = results.map(r => r.lexicalPattern ?? "???").join(" ");
  const details = results.map(r => {
    const flags = [];
    if (r.type === "function") flags.push("fn");
    if (r.pos) flags.push(r.pos);
    return `${r.word}(${r.preferred ?? "???"} [${r.pos}/${r.type}])`;
  }).join(" ");
  return { preferredLine, lexicalLine, details };
}

const cases = [
  // Week 1 Wednesday
  { sentence: "Popcorn clouds and springtime smiles", expected: "DUMdum DUM da DUMdum DUM" },
  { sentence: "Schoolgirl crushes on the playground", expected: "DUMdum DUMda da da DUMdum" },
  { sentence: "Baseball and french fries the crack of the bat at the ballpark", expected: "DUMdum da DUM DUM da DUM da da DUM da da DUMdum" },
  { sentence: "They lean forward to watch the runner circle the base path", expected: "da DUM DUMda da DUM da DUMda DUMda da DUM DUM" },
  { sentence: "The sunlight warms their faces as they lean back to relax", expected: "da DUMdum DUM da DUMda da da DUM DUM da daDUM" },

  // Week 1 Friday
  { sentence: "A full moon floating in the east", expected: "da DUM DUM DUMda da da DUM" },
  { sentence: "Rivers of light run from the moon to the shoreline", expected: "DUMda da DUM DUM da da DUM da da DUMdum" },
  { sentence: "Come into my arms lets watch the show", expected: "DUM dumda da DUM da DUM da DUM" },
  { sentence: "See the lighthouse flashing over the rocks", expected: "DUM da DUMdum DUMda dumda da DUM" },
  { sentence: "Close our eyes now drink in this perfect moment", expected: "DUM da DUM DUM DUM da da DUMda DUMda" },

  // Week 2
  { sentence: "Come take my hand", expected: "DUM DUM da DUM" },
  { sentence: "Long night moon was bright", expected: "DUM DUM DUM da DUM" },
  { sentence: "Years have passed you look the same", expected: "DUM da DUM da DUM da DUM" },
  { sentence: "Years have passed our path ahead is vast", expected: "DUM da DUM da DUM daDUM da DUM" },
  { sentence: "Beneath the sky upon the hills", expected: "dadum da DUM dadum da DUM" },
  { sentence: "Now is the time to fly", expected: "DUM da da DUM da DUM" },
];

console.log("=== Sentence-to-Stress Pattern Analysis ===\n");

let matchCount = 0;
for (const { sentence, expected } of cases) {
  const results = sentenceToStress(sentence);
  const { preferredLine, lexicalLine, details } = formatResult(results);

  // Normalize spacing for comparison
  const normalizedExpected = expected.replace(/\s+/g, " ").trim();
  const normalizedPreferred = preferredLine.replace(/\s+/g, " ").trim();
  const match = normalizedPreferred === normalizedExpected;
  if (match) matchCount++;

  console.log(`"${sentence}"`);
  console.log(`  Expected:  ${normalizedExpected}`);
  console.log(`  Preferred: ${normalizedPreferred}`);
  console.log(`  Lexical:   ${lexicalLine}`);
  console.log(`  ${match ? "MATCH" : "MISMATCH"}`);
  if (!match) {
    console.log(`  Details:   ${details}`);
  }
  console.log();
}

console.log(`\n=== ${matchCount}/${cases.length} matched ===`);
