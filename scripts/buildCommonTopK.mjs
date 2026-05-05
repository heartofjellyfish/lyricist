// Builds rhyme-finder/wordlists/common-10k.txt from a frequency-ranked
// source list. Default source is OpenSubtitles 2018 English 50k
// (https://github.com/hermitdave/FrequencyWords) — derived from movie
// and TV subtitles, the closest publicly-available proxy for spoken
// (and sung) English. Replaces the older google-10000-english list,
// whose web/business/tech bias was producing junk in the rank 5000-10000
// tail (specialists, ecommerce, latex, thumbnails, arthritis, std…).
//
// Usage:
//   curl -sSL https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt -o /tmp/en_50k.txt
//   node scripts/buildCommonTopK.mjs /tmp/en_50k.txt
//
// Output format matches the existing common-10k.txt: one word per line,
// ordered by frequency rank. Token shape is enforced via regex —
// preserves slang/contractions (ain't, c'mon, '90s, dwellin) while
// rejecting apostrophe-only tokens ('s, 't) and fragments with digits
// or non-ASCII characters.

import { readFileSync, writeFileSync } from "node:fs";

const TOKEN_OK = /^[a-z][a-z'-]*$/u;
const TARGET = 10000;

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    "usage: node scripts/buildCommonTopK.mjs <path-to-frequency-list.txt>\n" +
      "  expected format: 'word count' per line, ranked by frequency."
  );
  process.exit(1);
}

const text = readFileSync(inputPath, "utf8");
const lines = text.split(/\r?\n/u).filter(Boolean);

const out = [];
const seen = new Set();
let dropped = 0;
for (const line of lines) {
  if (out.length >= TARGET) break;
  const word = line.split(/\s+/u)[0]?.toLowerCase();
  if (!word || !TOKEN_OK.test(word)) {
    dropped += 1;
    continue;
  }
  if (seen.has(word)) continue; // shouldn't happen but be safe
  seen.add(word);
  out.push(word);
}

writeFileSync("rhyme-finder/wordlists/common-10k.txt", out.join("\n") + "\n");
console.log(
  `wrote rhyme-finder/wordlists/common-10k.txt — ${out.length} entries ` +
    `(dropped ${dropped} non-conforming tokens from the input)`
);
