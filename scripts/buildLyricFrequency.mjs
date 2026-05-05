// Walk wordlists/lyric-library/*.json and emit a flat word→count map for
// rhyme-finder's lyric-corpus filtering. Re-run whenever the lyric library
// expands; the output is committed and shipped as a static asset.
//
//   node scripts/buildLyricFrequency.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = "wordlists/lyric-library";
const out = "wordlists/lyric-frequency.json";

if (!existsSync(dir)) {
  console.error(`missing ${dir}`);
  process.exit(1);
}

// Token shape filter: lowercase letters plus internal apostrophes/hyphens.
// Defensive — matches the tokenizer in lyric-library/scripts/build-index.mjs.
// Filters encoding residue (leave‚, rain…) from older index builds while
// preserving slang / contractions / dropped-g (ain't, dwellin, '90s, c.o.d-er).
const TOKEN_OK = /^[a-z][a-z'-]*$/u;

const counts = {};
const files = readdirSync(dir).filter((f) => /^[a-z]\.json$/u.test(f));
let totalQuotes = 0;
let dropped = 0;
for (const f of files) {
  const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
  for (const [word, quotes] of Object.entries(data)) {
    if (!Array.isArray(quotes) || quotes.length === 0) continue;
    const key = word.toLowerCase();
    if (!TOKEN_OK.test(key)) {
      dropped += 1;
      continue;
    }
    counts[key] = (counts[key] || 0) + quotes.length;
    totalQuotes += quotes.length;
  }
}

const json = JSON.stringify(counts);
writeFileSync(out, json);
console.log(
  `wrote ${out} — ${Object.keys(counts).length} unique words, ` +
    `${totalQuotes} total quote rows, ${(json.length / 1024).toFixed(1)} KB ` +
    `(dropped ${dropped} encoding-residue tokens)`
);
