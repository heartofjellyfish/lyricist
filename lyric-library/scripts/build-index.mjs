// Build per-letter inverted index from raw lyrics.
// Usage: node lyric-library/scripts/build-index.mjs
//
// Reads:  lyric-library/raw/*.json + wordlists/cmu-dict.json
// Writes: wordlists/lyric-library/[a-z].json + meta.json

import lemmatize from "wink-lemmatizer";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RAW_DIR = resolve(ROOT, "raw");
const OUT_DIR = resolve(ROOT, "..", "wordlists", "lyric-library");
const CMU_PATH = resolve(ROOT, "..", "wordlists", "cmu-dict.json");

const CMU = JSON.parse(readFileSync(CMU_PATH, "utf8"));

const MAX_LINE_LEN = 80;
const MAX_QUOTES_PER_WORD = 30;
const PARTNER_WINDOW = 4; // search ±N lines within the same stanza for a rhyme partner

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const truncate = (s) =>
  s && s.length > MAX_LINE_LEN ? s.slice(0, MAX_LINE_LEN - 1).trimEnd() + "…" : (s ?? "");

// --- text cleanup + stanza/section parsing ---
function cleanLyrics(raw) {
  // Genius prepends "<n> ContributorsTranslations…<song> Lyrics" + a blurb
  // ending in "Read More". The first '[' bracketed header marks the real
  // start; if there's none, fall through and trust the input.
  const bracketIdx = raw.indexOf("[");
  let body = bracketIdx > 0 ? raw.slice(bracketIdx) : raw;
  body = body.replace(/Read More\s*/g, "");
  // Trailing "12Embed" appears on the very last line.
  body = body.replace(/(\d+)Embed\s*$/i, "");
  return body;
}

// Returns: [{ section: "Verse 1" | null, lines: [{ text, songLineIdx }] }]
// Section labels like `[Chorus]` or `[Verse 2: Sufjan Stevens]` are consumed
// (and the part before any `:` kept as the section name); they aren't lines.
// Stanzas split on blank lines in the source.
function parseSongStructure(raw) {
  const body = cleanLyrics(raw);
  const stanzaBlocks = body.split(/\n\s*\n+/);
  let currentSection = null;
  let songLineIdx = 0;
  const stanzas = [];
  for (const block of stanzaBlocks) {
    const stanza = { section: currentSection, lines: [] };
    for (const rawLine of block.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const m = line.match(/^\[(.+)\]$/);
      if (m) {
        const label = m[1].split(":")[0].trim(); // "Verse 1: Lenker" → "Verse 1"
        currentSection = label;
        stanza.section = label;
        continue;
      }
      // Some songs leak a stray "10Embed" or similar at the very end —
      // tokenize() will drop it cleanly, but skip it here too so it doesn't
      // pollute the stanza array sent to the popover.
      if (/^\d+\s*Embed$/i.test(line)) continue;
      stanza.lines.push({ text: line, songLineIdx: songLineIdx++ });
    }
    if (stanza.lines.length) stanzas.push(stanza);
  }
  return stanzas;
}

// Normalize curly quotes; split on whitespace + most punctuation but keep
// internal apostrophes (don't, I'll, '90s).
function tokenize(line) {
  const norm = line.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const raw = norm.split(/[\s,.;:!?()"—–\-—–\/\\\[\]{}]+/);
  return raw
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => /[a-zA-Z]/.test(t))
    .map((t) => t.toLowerCase());
}

// Verb + noun lemma; pick shorter when changed (handles plurals / -s reliably).
// Adjectives intentionally untouched (preserves "loving" vs "love").
function lemma(word) {
  if (word.includes("'")) return word;
  const v = lemmatize.verb(word);
  const n = lemmatize.noun(word);
  if (n !== word && n.length < word.length) return n;
  if (v !== word && v.length < word.length) return v;
  return word;
}

// --- rhyme partner detection (uses CMU dict) ---
// Rhyme key = "VOWEL|CODA1.CODA2…" starting at the last *stressed* vowel.
// Falls back to the last vowel of any stress when nothing's marked stressed.
function rhymeKey(word) {
  const arpa = CMU[word.toLowerCase()];
  if (!arpa) return null;
  const phones = arpa.split(/\s+/);
  let lastStressed = -1;
  for (let i = phones.length - 1; i >= 0; i--) {
    if (/[12]$/.test(phones[i])) { lastStressed = i; break; }
  }
  if (lastStressed === -1) {
    for (let i = phones.length - 1; i >= 0; i--) {
      if (/\d$/.test(phones[i])) { lastStressed = i; break; }
    }
  }
  if (lastStressed === -1) return null;
  const vowel = phones[lastStressed].replace(/\d/g, "");
  const coda = phones.slice(lastStressed + 1).join(".");
  return { vowel, coda, full: `${vowel}|${coda}` };
}

function lastWordOfTokens(tokens) {
  // The "rhyme word" is conventionally the very last word — even if it's a
  // stopword (e.g. "I am free" → "free", but "I want you" → "you"). We don't
  // skip stopwords here.
  return tokens[tokens.length - 1] || null;
}

// Look ±PARTNER_WINDOW lines within the same stanza (excluding the matched
// line itself) for a line whose end word rhymes. Prefer perfect-rhyme
// (same vowel + same coda); fall back to assonance (same vowel only).
// Identity (same surface end-word) is never a partner — it's just a repeat.
function findRhymePartner(stanza, lineInStanzaIdx) {
  const myLine = stanza.lines[lineInStanzaIdx];
  const myTokens = tokenize(myLine.text);
  const myWord = lastWordOfTokens(myTokens);
  if (!myWord) return null;
  const myKey = rhymeKey(myWord);
  if (!myKey) return null;

  const candidates = [];
  for (let j = 0; j < stanza.lines.length; j++) {
    if (j === lineInStanzaIdx) continue;
    const dist = Math.abs(j - lineInStanzaIdx);
    if (dist > PARTNER_WINDOW) continue;
    const otherTokens = tokenize(stanza.lines[j].text);
    const otherWord = lastWordOfTokens(otherTokens);
    if (!otherWord || otherWord === myWord) continue;
    const otherKey = rhymeKey(otherWord);
    if (!otherKey) continue;
    let kind = null;
    if (otherKey.full === myKey.full) kind = "perfect";
    else if (otherKey.vowel === myKey.vowel) kind = "assonance";
    if (!kind) continue;
    candidates.push({ j, dist, kind, otherWord });
  }
  if (!candidates.length) return null;

  // Rank: perfect > assonance, then closest distance, then prefer earlier
  // (couplets and AABB tend to put the partner immediately after).
  const KIND_RANK = { perfect: 0, assonance: 1 };
  candidates.sort((a, b) =>
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    a.dist - b.dist ||
    a.j - b.j
  );
  const best = candidates[0];
  return {
    line: truncate(stanza.lines[best.j].text),
    stanzaLineIdx: best.j,
    word: best.otherWord,        // the rhyming partner word
    type: best.kind,             // "perfect" | "assonance"
  };
}

// --- main build ---
const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));
console.log(`Reading ${files.length} artist file(s)…`);

const index = new Map();
const meta = {
  artists: [],
  builtAt: new Date().toISOString(),
  totalSongs: 0,
  totalLines: 0,
  totalTokens: 0,
  totalEndQuotesWithPartner: 0,
  totalEndQuotes: 0,
};

for (const f of files) {
  const data = JSON.parse(readFileSync(resolve(RAW_DIR, f), "utf8"));
  const artistSlug = data.slug;
  const credit = data.credit;
  let songCount = 0;
  let lineCount = 0;

  for (let songIdx = 0; songIdx < data.songs.length; songIdx++) {
    const song = data.songs[songIdx];
    const stanzas = parseSongStructure(song.lyrics);

    // Flat list of every line for prev/next lookup (kept for back-compat
    // with the current UI; can be dropped once UI consumes `stanza`).
    const flatLines = stanzas.flatMap((s) => s.lines.map((l) => l.text));

    for (let stanzaIdx = 0; stanzaIdx < stanzas.length; stanzaIdx++) {
      const stanza = stanzas[stanzaIdx];
      const stanzaTexts = stanza.lines.map((l) => truncate(l.text));

      for (let lineInStanzaIdx = 0; lineInStanzaIdx < stanza.lines.length; lineInStanzaIdx++) {
        const lineObj = stanza.lines[lineInStanzaIdx];
        const songLineIdx = lineObj.songLineIdx;
        const tokens = tokenize(lineObj.text);
        if (tokens.length === 0) continue;
        lineCount++;

        // Position is decided by the literal first/last *token* in the line,
        // not by the first/last content word — Genius gives one line per
        // newline, and the rhyme-bearing word is whatever the line actually
        // ends with ("over" in "When this love is over?", not "love").
        // Stopwords are still excluded from the index further down — they
        // just don't get their position label stolen by the next non-stopword.
        const firstNon = 0;
        const lastNon = tokens.length - 1;

        // Compute partner once per line (not per word); cache for end-pos
        // quotes from this line. Mid-line quotes get null.
        const partner = findRhymePartner(stanza, lineInStanzaIdx);

        // No stopword filter — for a rhyme finder, even "the" / "of" / "is"
        // are valid end-rhyme words ("a foggy day in London town" / "the").
        // Songwriters lean on prepositions and articles for slant rhymes.
        const seenInLine = new Set();
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i];
          const key = lemma(t);
          if (seenInLine.has(key)) continue;
          seenInLine.add(key);
          const pos = i === firstNon ? "start" : i === lastNon ? "end" : "middle";
          if (!index.has(key)) index.set(key, []);
          if (pos === "end") meta.totalEndQuotes++;
          if (pos === "end" && partner) meta.totalEndQuotesWithPartner++;

          index.get(key).push({
            artist: artistSlug,
            credit,
            song: song.slug,
            songTitle: song.title,
            year: song.year,
            // Back-compat fallback: prev/next adjacent lines (Phase 1.5 UI used
            // these). Phase 1.6 UI consumes `stanza` instead and treats these
            // as a fallback when stanza is missing.
            linePrev: truncate(flatLines[songLineIdx - 1] ?? ""),
            line: truncate(lineObj.text),
            lineNext: truncate(flatLines[songLineIdx + 1] ?? ""),
            lineIdx: songLineIdx,
            // Phase 1.6 fields (named to match the design spec):
            section_label: stanza.section,       // "Chorus" | "Verse 1" | null
            stanza: stanzaTexts,                 // every line in the matched stanza, truncated
            stanzaLineIdx: lineInStanzaIdx,      // matched line's index inside `stanza`
            partner: pos === "end" ? partner : null, // { line, stanzaLineIdx, word, type } | null
            position: pos === "end" ? "end" : "mid", // collapsed binary per spec
            wordPos: pos,                        // legacy: retain start/middle distinction for ranking
            surface: t,
            _songOrder: songIdx,
          });
          meta.totalTokens++;
        }
      }
    }
    songCount++;
  }
  meta.artists.push({ slug: artistSlug, credit, songCount });
  meta.totalSongs += songCount;
  meta.totalLines += lineCount;
  console.log(`  ${artistSlug}: ${songCount} songs, ${lineCount} lines`);
}

// De-dup identical quotes. Choruses repeat the same lyric verbatim across
// the song; we key on (artist, song, line text) so those collapse to one.
// Earlier versions keyed on lineIdx, which let chorus repeats slip through
// because each repetition has a different position in the song.
for (const [k, arr] of index) {
  const seen = new Set();
  const dedup = [];
  for (const q of arr) {
    const sig = `${q.artist}|${q.song}|${q.line}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    dedup.push(q);
  }
  index.set(k, dedup);
}

// Rank: end > middle > start, then song popularity, then short lines first.
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
  for (const q of arr) {
    delete q._songOrder;
    delete q.wordPos; // legacy build-side field; consumers use `position`
  }
}

// Bucket by first letter.
const buckets = new Map();
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
const partnerPct = meta.totalEndQuotes
  ? ((100 * meta.totalEndQuotesWithPartner) / meta.totalEndQuotes).toFixed(1)
  : "0.0";
console.log(
  `\nTotal: ${meta.totalSongs} songs, ${meta.totalLines} lines, ${meta.totalTokens} tokens, ` +
  `${totalKeys} unique lemmas, ${(totalBytes / 1024).toFixed(0)} KB.`,
);
console.log(
  `End-position quotes with rhyme partner: ${meta.totalEndQuotesWithPartner}/${meta.totalEndQuotes} (${partnerPct}%).`,
);
