// Build wordlists/mosaic-phrases.json — the corpus attestation index for
// mosaic (compound) rhymes.
//
// WHY: a programmatically-generated mosaic can be grammatical yet not an
// everyday phrase ("caught there" is fine but rare; "twat her" is trash).
// The lyric corpus is the discriminator: a two-word combo that actually
// ENDS LINES in real songs is both everyday AND has a real song reference
// (the red dot). This index gives mosaic rows the same lyric-quote badge
// single words already get, and lets the UI show the attested ones first.
//
// INPUT  — wordlists/lyric-library/[a-z_].json  (per-letter dedup'd index,
//          the same canonical build input buildLyricBuckets reads)
// OUTPUT — wordlists/mosaic-phrases.json
//            { "bought her": { n: <#songs>, q: [ {credit, songTitle, line, surface} … ] }, … }
//          keyed by the line-ending BIGRAM whose second word is a mosaic
//          tail (function word). `n` is the honest song count; `q` is a
//          small artist-diversified sample for the popover.
//
// Rebuild whenever the lyric corpus expands (add to the re-run protocol in
// CLAUDE.md, right after buildLyricBuckets). Runtime-loaded by rhymeFinder.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isFunctionWord } from "../rhyme-finder/src/mosaicRhyme.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const LIB = path.join(ROOT, "wordlists/lyric-library");

// Only verb-headed phrases are ever generated (the mosaic head verb-gate) and
// therefore ever looked up. Restrict the index to verb heads so it doesn't
// store thousands of never-queried "with me" / "i do" / "like that" entries.
const VERBS = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, "rhyme-finder/wordlists/mosaic-verbs.json"), "utf8")),
);

const QUOTES_PER_PHRASE = 6; // small popover sample, artist-diversified

// Tokenize a lyric line the way the classifier's line-end logic does:
// drop parentheticals (backing vocals "(ooh)"), keep words + internal
// apostrophes/hyphens, lowercase.
function lineWords(line) {
  return line
    .toLowerCase()
    .replace(/\([^)]*\)/gu, " ")
    .replace(/[^a-z0-9'\s-]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

const phrases = new Map(); // "w1 w2" -> { songs:Set, quotes:[] }
const seenLine = new Set(); // dedup by song|lineIdx (a line is indexed under many words)

function record(q) {
  if (!q || !q.line) return;
  const lineKey = `${q.song || ""}|${q.lineIdx}`;
  if (seenLine.has(lineKey)) return;
  seenLine.add(lineKey);
  const w = lineWords(q.line);
  if (w.length < 2) return;
  const head = w[w.length - 2];
  const tail = w[w.length - 1];
  // A mosaic is VERB-HEAD + function-TAIL (matching the generator's gate).
  // Require the tail to be a mosaic tail and the head to be a verb — that
  // drops "to me" / "with you" / "i do" / "like that" (non-verb heads, never
  // generated, never looked up), which are otherwise the bulk of the index.
  if (!isFunctionWord(tail) || !VERBS.has(head)) return;
  const bigram = `${head} ${tail}`;
  let e = phrases.get(bigram);
  if (!e) phrases.set(bigram, (e = { songs: new Set(), quotes: [] }));
  e.songs.add(q.song || q.songTitle || "?");
  if (e.quotes.length < QUOTES_PER_PHRASE * 3) {
    // over-collect; artist-diversify + trim at the end
    e.quotes.push({
      credit: q.credit || q.artist || "",
      songTitle: q.songTitle || q.song || "",
      line: q.line,
      surface: bigram,
      // Carry the rhyming partner line so mosaic quotes render as full
      // couplets (line + partner), the SAME shape single-word quotes use —
      // not a lone orphan line. The tail (function word) is the line's end
      // word, so this record's `partner` is exactly what the phrase rhymed
      // with. Stanza is deliberately NOT shipped: this whole file is fetched
      // at init (rhymeFinder.js), and full stanzas ~tripled it (686KB→1.75MB)
      // — the couplet is the payload; verse-expand isn't worth the weight.
      ...(q.partner && q.partner.line
        ? { partner: { line: q.partner.line, word: q.partner.word } }
        : {}),
    });
  }
}

console.log("Scanning per-letter lyric index…");
let files = 0;
for (const f of fs.readdirSync(LIB)) {
  if (!/^[a-z_]\.json$/u.test(f)) continue; // only the per-letter index files
  files += 1;
  const obj = JSON.parse(fs.readFileSync(path.join(LIB, f), "utf8"));
  for (const word in obj) {
    const list = obj[word];
    if (Array.isArray(list)) for (const q of list) record(q);
  }
}
console.log(`  ${files} index files, ${seenLine.size} unique lines`);

// Artist-diversify the quote sample (one per artist first, then fill),
// then trim to QUOTES_PER_PHRASE.
function diversify(quotes) {
  const seen = new Set();
  const first = [];
  const rest = [];
  for (const q of quotes) {
    if (!seen.has(q.credit)) {
      seen.add(q.credit);
      first.push(q);
    } else rest.push(q);
  }
  return [...first, ...rest].slice(0, QUOTES_PER_PHRASE);
}

const out = {};
for (const [bigram, e] of phrases) {
  out[bigram] = { n: e.songs.size, q: diversify(e.quotes) };
}

const outPath = path.join(ROOT, "wordlists/mosaic-phrases.json");
const json = JSON.stringify(out);
fs.writeFileSync(outPath, json);
console.log(`\nWrote ${outPath}`);
console.log(`  ${phrases.size} attested mosaic phrases (${(json.length / 1024).toFixed(0)} KB)`);
const top = [...phrases.entries()].sort((a, b) => b[1].songs.size - a[1].songs.size).slice(0, 8);
console.log("  most-attested:", top.map(([p, e]) => `${p}·${e.songs.size}`).join(", "));
