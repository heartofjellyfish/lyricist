// Build per-letter inverted index from raw lyrics.
// Usage: node lyric-library/scripts/build-index.mjs
//
// Reads:  lyric-library/raw/*.json
// Writes: wordlists/lyric-library/[a-z].json + meta.json

import lemmatize from "wink-lemmatizer";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RAW_DIR = resolve(ROOT, "raw");
const OUT_DIR = resolve(ROOT, "..", "wordlists", "lyric-library");

const STOPWORDS = new Set(JSON.parse(readFileSync(resolve(__dirname, "stopwords.json"), "utf8")));

const MAX_LINE_LEN = 80;
const MAX_QUOTES_PER_WORD = 30;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// --- text cleanup ---
function cleanLyrics(raw) {
  // Genius prepends "<n> ContributorsTranslations…<song title> Lyrics" and
  // sometimes a blurb "Read More". The first '[' bracketed section header
  // (e.g. "[Verse 1]") marks the actual start. If absent, fall back to
  // splitting after the first occurrence of " Lyrics" or just trust the input.
  const bracketIdx = raw.indexOf("[");
  let body = bracketIdx > 0 ? raw.slice(bracketIdx) : raw;
  // Drop leading "Read More" sentinel if present
  body = body.replace(/Read More\s*/g, "");
  return body;
}

function splitLines(body) {
  return body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^\[.*\]$/.test(l)) // section headers
    .filter((l) => !/^\d+ Embed$/i.test(l)) // genius footer "8Embed"
    .map((l) => l.replace(/\d+Embed$/i, "").trim()) // trailing "12Embed" on last line
    .filter((l) => l.length > 0);
}

// Normalize curly quotes / apostrophes; strip leading/trailing punctuation
// per token but preserve internal apostrophes (don't, I'll, '90s).
function tokenize(line) {
  const norm = line.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  // split on whitespace + punctuation EXCEPT apostrophes inside words
  const raw = norm.split(/[\s,.;:!?()"—–\-—–\/\\\[\]{}]+/);
  return raw
    .map((t) => t.replace(/^'+|'+$/g, "")) // strip edge apostrophes
    .filter((t) => /[a-zA-Z]/.test(t))
    .map((t) => t.toLowerCase());
}

// Lemmatize: try verb + noun; pick shortest distinct result. Adjectives skipped
// per PLAN default (preserves "loving" vs "love"). Falls back to original.
function lemma(word) {
  // Don't lemmatize words containing apostrophes (don't, I'll) — preserve.
  if (word.includes("'")) return word;
  const v = lemmatize.verb(word);
  const n = lemmatize.noun(word);
  // Prefer noun lemma when it actually changed (handles plurals reliably);
  // otherwise verb lemma; otherwise original.
  if (n !== word && n.length < word.length) return n;
  if (v !== word && v.length < word.length) return v;
  return word;
}

// --- main build ---
const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));
console.log(`Reading ${files.length} artist file(s)…`);

const index = new Map(); // lemma -> [{ artist, song, year, line, lineIdx, wordPos, _songOrder }]
const meta = {
  artists: [],
  builtAt: new Date().toISOString(),
  totalSongs: 0,
  totalLines: 0,
  totalTokens: 0,
};

for (const f of files) {
  const data = JSON.parse(readFileSync(resolve(RAW_DIR, f), "utf8"));
  const artistSlug = data.slug;
  const credit = data.credit;
  let songCount = 0;
  let lineCount = 0;
  for (let songIdx = 0; songIdx < data.songs.length; songIdx++) {
    const song = data.songs[songIdx];
    const body = cleanLyrics(song.lyrics);
    const lines = splitLines(body);
    const truncate = (s) =>
      s && s.length > MAX_LINE_LEN ? s.slice(0, MAX_LINE_LEN - 1).trimEnd() + "…" : (s ?? "");
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const tokens = tokenize(line);
      if (tokens.length === 0) continue;
      lineCount++;
      const nonStopIdx = tokens
        .map((t, i) => (STOPWORDS.has(t) ? -1 : i))
        .filter((i) => i >= 0);
      const firstNon = nonStopIdx[0];
      const lastNon = nonStopIdx[nonStopIdx.length - 1];

      const seenInLine = new Set();
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (STOPWORDS.has(t)) continue;
        const key = lemma(t);
        if (seenInLine.has(key)) continue;
        seenInLine.add(key);
        const pos = i === firstNon ? "start" : i === lastNon ? "end" : "middle";
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({
          artist: artistSlug,
          credit,
          song: song.slug,
          songTitle: song.title,
          year: song.year,
          linePrev: truncate(lines[lineIdx - 1] ?? ""),
          line: truncate(line),
          lineNext: truncate(lines[lineIdx + 1] ?? ""),
          lineIdx,
          wordPos: pos,
          surface: t, // original token form ("coming", "rivers"); used for exact highlighting
          _songOrder: songIdx,
        });
        meta.totalTokens++;
      }
    }
    songCount++;
  }
  meta.artists.push({ slug: artistSlug, credit, songCount });
  meta.totalSongs += songCount;
  meta.totalLines += lineCount;
  console.log(`  ${artistSlug}: ${songCount} songs, ${lineCount} lines`);
}

// --- de-dup identical quotes (chorus repeats give same line twice) ---
for (const [k, arr] of index) {
  const seen = new Set();
  const dedup = [];
  for (const q of arr) {
    const sig = `${q.artist}|${q.song}|${q.lineIdx}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    dedup.push(q);
  }
  index.set(k, dedup);
}

// --- rank + cap quotes per word ---
const POS_RANK = { end: 0, middle: 1, start: 2 };
for (const [k, arr] of index) {
  arr.sort((a, b) => {
    const p = POS_RANK[a.wordPos] - POS_RANK[b.wordPos];
    if (p !== 0) return p;
    const so = a._songOrder - b._songOrder;
    if (so !== 0) return so;
    return a.line.length - b.line.length;
  });
  if (arr.length > MAX_QUOTES_PER_WORD) arr.length = MAX_QUOTES_PER_WORD;
  // Drop the helper field before serialization
  for (const q of arr) delete q._songOrder;
}

// --- bucket by first letter ---
const buckets = new Map(); // letter -> { word: quotes }
for (const [k, arr] of index) {
  const c = k[0];
  const letter = /[a-z]/.test(c) ? c : "_";
  if (!buckets.has(letter)) buckets.set(letter, {});
  buckets.get(letter)[k] = arr;
}

let totalKeys = 0;
let totalBytes = 0;
for (const [letter, obj] of buckets) {
  const path = resolve(OUT_DIR, `${letter}.json`);
  const json = JSON.stringify(obj);
  writeFileSync(path, json);
  totalKeys += Object.keys(obj).length;
  totalBytes += json.length;
  console.log(`  wrote ${letter}.json — ${Object.keys(obj).length} words, ${(json.length / 1024).toFixed(1)} KB`);
}

writeFileSync(resolve(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));
console.log(`\nTotal: ${meta.totalSongs} songs, ${meta.totalLines} lines, ${meta.totalTokens} tokens, ${totalKeys} unique lemmas, ${(totalBytes / 1024).toFixed(0)} KB.`);
