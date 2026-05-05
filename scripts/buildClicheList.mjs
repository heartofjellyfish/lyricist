// Builds wordlists/cliche-pairs.json from the lyric library, by ranking
// rhyme pairs by how often they CO-OCCUR at line-end across the corpus.
// Pairs that show up together a lot are, by definition, the
// most-overworked rhymes in your taste profile — that's the cliché list.
//
//   node scripts/buildClicheList.mjs
//
// RE-RUN AFTER EVERY CORPUS EXPANSION. The cliché list is derived from
// the lyric corpus, so when you add new songs it should be regenerated
// to reflect the updated pair distribution. Same protocol as
// scripts/buildLyricFrequency.mjs.
//
// Source: wordlists/lyric-library/*.json — each word maps to quotes
// with a `partner` field naming the rhyming word at the other end of
// the line pair.
//
// Output: wordlists/cliche-pairs.json — array of [a, b] pairs in
// alphabetical canonical order. Top-N by co-occurrence count.
//
// Note on counts: each line-end rhyme pair appears twice in the index
// (once from each word's quote list), so the raw counter is 2× the
// actual song-occurrence count. This doesn't affect ranking — the
// top-N order is the same — but be aware if reading the counts.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = "wordlists/lyric-library";
const out = "wordlists/cliche-pairs.json";
const TOP_N = 50;

if (!existsSync(dir)) {
  console.error(`missing ${dir}`);
  process.exit(1);
}

const counts = new Map();
const files = readdirSync(dir).filter((f) => /^[a-z]\.json$/u.test(f));
for (const f of files) {
  const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
  for (const [word, quotes] of Object.entries(data)) {
    if (!Array.isArray(quotes)) continue;
    for (const q of quotes) {
      const partner = q?.partner?.word;
      if (!partner) continue;
      const a = word.toLowerCase();
      const b = partner.toLowerCase();
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
}

const sorted = [...counts.entries()].sort((x, y) => y[1] - x[1]);
const pairs = sorted.slice(0, TOP_N).map(([key]) => key.split("|"));

writeFileSync(out, JSON.stringify(pairs));

const minCount = sorted[Math.min(sorted.length - 1, TOP_N - 1)][1];
const maxCount = sorted[0][1];
console.log(
  `wrote ${out} — top ${pairs.length} pairs ` +
    `(co-occurrence range ${maxCount} → ${minCount})`
);
console.log(`\nTop 10 cliché pairs by corpus co-occurrence:`);
for (let i = 0; i < Math.min(10, pairs.length); i += 1) {
  const [a, b] = pairs[i];
  console.log(`  ${(i + 1).toString().padStart(2)}. ${a} / ${b}  (${sorted[i][1]})`);
}
