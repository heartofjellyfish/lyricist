import { dictionary } from "cmu-pronouncing-dictionary";
import fs from "node:fs";

// Filter to lowercase entries (drop variant pronunciations like "word(2)" since
// pronunciation.js's normalizer already collapses them — we keep the first
// pronunciation found per normalized word).
const out = {};
for (const [rawWord, phonemes] of Object.entries(dictionary)) {
  const normalized = rawWord.toLowerCase().replace(/\(\d+\)$/u, "");
  if (!(normalized in out)) {
    out[normalized] = phonemes;
  }
}

const json = JSON.stringify(out);
fs.writeFileSync("wordlists/cmu-dict.json", json);
console.log(`wrote wordlists/cmu-dict.json — ${Object.keys(out).length} entries, ${(json.length / 1024 / 1024).toFixed(2)} MB`);
