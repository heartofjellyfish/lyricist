// ── Datamuse recall-diff eval ───────────────────────────────────────
// A RECALL REGRESSION PROBE, not a data source. Datamuse's rhyme index
// is built from the same CMUdict + WordNet we use, so it is NOT more
// authoritative — but it does ZERO quality filtering, so diffing our
// output against it surfaces words WE drop. The signal we care about is
// narrow: words Datamuse rhymes that ALSO pass our own wordnet/10k gate
// yet never surface — those are our bugs (a dict gap or a systematic
// CMU-artifact split like the July 2026 -ire family). Everything else in
// the diff (surname soup "gephardt", junk "kbyte/lxxiv") is us correctly
// filtering; ignore it.
//
// Usage:
//   node scripts/evalDatamuse.mjs                 # default probe set
//   node scripts/evalDatamuse.mjs fire world moon # explicit source words
//
// Datamuse API: free, ~100k req/day, no key. rel_rhy = perfect rhymes.
// Run after any classifier / pronunciation / dict change to catch the
// next fire/dire-class family split before a user does.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RF = path.join(ROOT, "rhyme-finder/src");

// Shim fetch → filesystem for module-internal wordlist loads; pass HTTP
// (Datamuse) through to the real fetch.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const s = String(url);
  if (s.startsWith("file:")) {
    try {
      const b = fs.readFileSync(fileURLToPath(s));
      return { ok: true, status: 200, json: async () => JSON.parse(b.toString()), text: async () => b.toString() };
    } catch {
      return { ok: false, status: 404 };
    }
  }
  return realFetch(url, opts);
};

const { findRhymes } = await import(path.join(RF, "rhymeFinder.js"));
const { PRONUNCIATION_MAP, ensurePronunciation } = await import(path.join(RF, "pronunciation.js"));
await ensurePronunciation();

// Our own "real word" gate — mirror rhymeFinder's WORD_LEX membership so
// the diff only counts words WE would consider acceptable, not junk.
const cats = JSON.parse(fs.readFileSync(path.join(ROOT, "rhyme-finder/wordlists/wordnet-categories.json"), "utf8"));
const realWord = new Set();
for (const lex of ["common", "person", "place", "science"]) {
  for (const w of cats[lex] ?? []) realWord.add(w);
}
for (const w of fs.readFileSync(path.join(ROOT, "rhyme-finder/wordlists/common-10k.txt"), "utf8").split(/\r?\n/u)) {
  if (w) realWord.add(w.toLowerCase());
}

const DEFAULT_PROBE = [
  "love", "heart", "night", "fire", "world", "dreaming", "memory",
  "dancing", "alone", "forever", "rain", "road", "eyes", "gold", "home",
  "sky", "hour", "beer", "player", "tour",
];

const sources = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PROBE;

let dmTotal = 0;
let surfaced = 0;
const gaps = []; // { src, word, inDict } — real words we should have but don't

for (const src of sources) {
  let dm;
  try {
    dm = await (await realFetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(src)}&max=1000`)).json();
  } catch (e) {
    console.error(`  ! Datamuse fetch failed for "${src}": ${e.message}`);
    continue;
  }
  let ours;
  try {
    ({ buckets: ours } = await findRhymes({ word: src, perBucket: 10000 }));
  } catch (e) {
    console.error(`  ! "${src}" not in our dict, skipping (${e.message})`);
    continue;
  }
  const oursSet = new Set();
  for (const list of Object.values(ours)) for (const e of list) oursSet.add(e.word);

  let srcGap = 0;
  for (const e of dm) {
    const w = e.word;
    if (!/^[a-z]+$/u.test(w) || w === src) continue;
    dmTotal += 1;
    if (oursSet.has(w)) { surfaced += 1; continue; }
    if (realWord.has(w)) {
      gaps.push({ src, word: w, inDict: PRONUNCIATION_MAP.has(w) });
      srcGap += 1;
    }
  }
  console.log(`${src.padEnd(10)} datamuse=${String(dm.length).padStart(4)}  real-word gaps=${srcGap}`);
}

console.log(`\n=== recall vs Datamuse over ${sources.length} probe words ===`);
console.log(`datamuse rhymes: ${dmTotal}  |  we surface: ${surfaced} (${(100 * surfaced / dmTotal).toFixed(1)}%)`);
console.log(`REAL-word gaps (pass our gate, still missing): ${gaps.length} (${(100 * gaps.length / dmTotal).toFixed(1)}%)`);
console.log(`  — the low % is expected: most of the non-surfaced tail is surname/abbrev junk we filter on purpose.\n`);

// Cluster gaps by rime-key family so a systematic split (fire/dire) is
// obvious vs one-off dict holes.
const byInDict = { "in dict, gate/anchor rejected": [], "missing from dict": [] };
for (const g of gaps) byInDict[g.inDict ? "in dict, gate/anchor rejected" : "missing from dict"].push(`${g.src}→${g.word}`);
for (const [label, list] of Object.entries(byInDict)) {
  if (!list.length) continue;
  console.log(`${label} (${list.length}):`);
  console.log(`  ${list.join("  ")}\n`);
}
if (!gaps.length) console.log("No real-word recall gaps. ✓");
