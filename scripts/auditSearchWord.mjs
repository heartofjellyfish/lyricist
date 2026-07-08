#!/usr/bin/env node
// auditSearchWord.mjs — run the REAL rhyme classifier over words and emit a
// compact per-word rhyme summary for quality judgement (Fable audit input).
//
// This is the CLASSIFIER half of the search-quality audit. It reuses the exact
// runtime path (ensurePronunciation + findRhymes) the browser app uses, with
// fetch shimmed to the local filesystem — so what it reports is what a user
// actually sees on rhyme.land.
//
// Usage:
//   node scripts/auditSearchWord.mjs dreaming future love      # explicit words
//   node scripts/auditSearchWord.mjs --from scratchpad-searches.json --min 2
//   node scripts/auditSearchWord.mjs --from searches.json --top 30 --out audit-input.json
//
// Output: JSON array, one object per word:
//   { word, found, stressedVowel, coda, masculine, buckets: { perfect:[...], family:[...], ... } }
// found:false means the word isn't in the CMU dict (a real miss to flag).
//
// Last updated: 2026-07-07

import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Shim fetch → local filesystem so the app's fetch() of the CMU dict + wordlists
// reads from disk (same trick as test/rhymeClassifier.test.js).
globalThis.fetch = async (url) => {
  const path = fileURLToPath(url);
  let buf;
  try { buf = fs.readFileSync(path); } catch { return { ok: false, status: 404 }; }
  return {
    ok: true, status: 200,
    json: async () => JSON.parse(buf.toString()),
    text: async () => buf.toString(),
  };
};

const { ensurePronunciation } = await import("../rhyme-finder/src/pronunciation.js");
const { findRhymes, TYPE_ORDER } = await import("../rhyme-finder/src/rhymeFinder.js");

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

// Assemble the word list either from CLI args or a searches JSON.
function resolveWords() {
  const fromFile = arg("from", "");
  if (fromFile) {
    const data = JSON.parse(fs.readFileSync(fromFile, "utf8"));
    let words = data.words || [];
    const min = Number(arg("min", "0"));
    if (min) words = words.filter((w) => w.searches >= min);
    const top = Number(arg("top", "0"));
    if (top) words = words.slice(0, top);
    return words.map((w) => w.word);
  }
  return process.argv.slice(2).filter((a) => !a.startsWith("--") && !/^\d+$/.test(a)
    // drop the value token that follows a flag
    && process.argv[process.argv.indexOf(a) - 1] !== "--from"
    && process.argv[process.argv.indexOf(a) - 1] !== "--min"
    && process.argv[process.argv.indexOf(a) - 1] !== "--top"
    && process.argv[process.argv.indexOf(a) - 1] !== "--out");
}

const PER_BUCKET = Number(arg("perBucket", "10"));

await ensurePronunciation();

const words = resolveWords();
const out = [];

for (const raw of words) {
  const word = String(raw).trim().toLowerCase();
  if (!word) continue;
  try {
    const { source, buckets } = await findRhymes({ word, perBucket: PER_BUCKET });
    const compact = {};
    for (const t of TYPE_ORDER) {
      const b = buckets[t] || [];
      if (b.length) compact[t] = b.slice(0, PER_BUCKET).map((c) => c.word);
    }
    out.push({
      word,
      found: true,
      stressedVowel: source.stressedVowel,
      coda: source.coda,
      masculine: source.masculine,
      counts: Object.fromEntries(TYPE_ORDER.map((t) => [t, (buckets[t] || []).length])),
      buckets: compact,
    });
  } catch (err) {
    out.push({ word, found: false, error: err.message });
  }
}

const outFile = arg("out", "");
if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.error(`✓ audited ${out.length} words → ${outFile}`);
} else {
  console.log(JSON.stringify(out, null, 2));
}
