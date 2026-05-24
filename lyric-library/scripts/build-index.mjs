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
const CMU_OVERRIDES_PATH = resolve(ROOT, "..", "wordlists", "cmu-overrides.json");

const CMU = JSON.parse(readFileSync(CMU_PATH, "utf8"));
// Apply hand-curated overrides last so they win against the base CMU entry
// (matches the precedence in /src/pronunciation.js + /rhyme-finder/src/pronunciation.js).
{
  const raw = JSON.parse(readFileSync(CMU_OVERRIDES_PATH, "utf8"));
  for (const word in raw) {
    if (word.startsWith("_")) continue; // metadata keys like "_comment"
    CMU[word.toLowerCase()] = raw[word];
  }
}

const MAX_LINE_LEN = 80;
const PARTNER_WINDOW = 4; // search ±N lines within the same stanza for a rhyme partner

// Length thresholds (display chars) — used only to pick which line best
// represents a collapsed refrain group. No capping happens here anymore;
// ranking + tiering live downstream in buildLyricBuckets.mjs.
const LEN_MIN = 15;       // below this = fragment ("Oh, fire")
const LEN_LO = 18;        // readable sweet-spot bounds
const LEN_HI = 64;
// Keep the FULL stanza when it's a real verse/chorus (≤ this many lines, ~p95
// of stanzas). Songs without blank-line breaks parse into one giant "stanza"
// (up to 157 lines) — for those we store ±1 context instead of the monster.
const STANZA_MAX = 12;

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
  // ~15% of songs have no [section] header, so the bracket slice above is a
  // no-op and the Genius page header rides on line 1: "20 ContributorsWhite
  // Fire LyricsEverything is tragic…". Strip "<n> Contributors…<Title> Lyrics"
  // up to the first "Lyrics" marker. Anchored at start + non-greedy, so a
  // bracketed body (starts with "[") is never touched.
  body = body.replace(/^\s*\d+\s*Contributors.*?Lyrics/su, "");
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
// internal apostrophes (don't, I'll, '90s) and hyphens (six-pack).
//
// Final filter is strict: a token must be lowercase letters with at most
// internal apostrophes / hyphens. This rejects encoding residue like
// "leave‚" or "rain…" — text-extraction bugs where exotic Unicode
// punctuation slipped through the splitter — while preserving legitimate
// slang / dropped-g forms (dwellin, tickin, ain't, c'mon, '90s).
function tokenize(line) {
  const norm = line.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const raw = norm.split(/[\s,.;:!?()"—–\-—–\/\\\[\]{}]+/);
  return raw
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .map((t) => t.toLowerCase())
    .filter((t) => /^[a-z][a-z'-]*$/.test(t));
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
        // Only end-position tokens become quotes — Phase 1.7 UI doesn't
        // render mid-line or start-of-line matches anywhere. Emitting
        // them was costing us index size + payload weight for content
        // the user never sees. Surface form is still indexed, so words
        // never used at line-end (e.g. "the") simply don't appear.
        const t = tokens[lastNon];
        if (t) {
          const key = lemma(t);
          if (!index.has(key)) index.set(key, []);
          meta.totalEndQuotes++;
          if (partner) meta.totalEndQuotesWithPartner++;

          index.get(key).push({
            artist: artistSlug,
            credit,
            song: song.slug,
            songTitle: song.title,
            year: song.year,
            line: truncate(lineObj.text),
            lineIdx: songLineIdx,
            section_label: stanza.section,
            // Context: the FULL stanza when it's a real verse/chorus (≤ STANZA_MAX
            // lines). For songs without blank-line breaks that parse into one
            // giant "stanza" (up to 157 lines), fall back to ±1 line — the rhyme
            // is `line + partner.line` regardless, and section_label (86% labeled)
            // still says Verse/Chorus/Bridge.
            ...(stanzaTexts.length <= STANZA_MAX
              ? { stanza: stanzaTexts, stanzaLineIdx: lineInStanzaIdx }
              : {
                  linePrev: truncate(flatLines[songLineIdx - 1] ?? ""),
                  lineNext: truncate(flatLines[songLineIdx + 1] ?? ""),
                }),
            partner,
            // `position` and `wordPos` are always "end" now that mid-line
            // emission is gone. Both kept for API compatibility with the
            // Phase 1.7 UI consumer that still reads them.
            position: "end",
            wordPos: "end",
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

// ── Pass 2: per-word dedup + refrain-collapse (PRESERVE ALL) ──────────
// Pass 1 kept EVERY end-quote per word. Here we only strip genuine NOISE —
// no capping, no ranking. Ranking + tiering happen downstream in
// buildLyricBuckets.mjs, which knows rhyme keys + favorite-artist tiers and
// splits quotes into rhymed / rhymed-more / not-rhymed shards.
//   1. drop Genius-header cruft, then near-dup dedup (homoglyph-folded, so
//      "whеn"/"when" and "we"/"you" refrain swaps collapse)
//   2. collapse intra-song (song, rhyme-partner) groups to ONE — a word
//      rhymed with the same partner inside one song is a refrain repeat
// Every survivor keeps `partner`, `artist`, `_songOrder` for the downstream
// builder. The per-letter index is .vercelignore'd (build input only).
const HOMOGLYPHS = {
  // Cyrillic → Latin lookalikes, lowercase + uppercase
  "а":"a","е":"e","о":"o","р":"p","с":"c","у":"y","х":"x",
  "А":"A","В":"B","Е":"E","К":"K","М":"M","Н":"H","О":"O",
  "Р":"P","С":"C","Т":"T","Х":"X","У":"Y","і":"i","І":"I",
};
// Fold homoglyphs, lowercase, strip non-alphanumerics, collapse whitespace —
// one signature for exact + near-dup dedup. Display still uses raw `q.line`.
function normLine(s) {
  const folded = [...(s ?? "")].map((c) => HOMOGLYPHS[c] ?? c).join("");
  return folded.toLowerCase().replace(/[^a-z0-9' ]+/gu, "").replace(/\s+/gu, " ").trim();
}
// Genius page-furniture that survives cleanLyrics on odd songs.
const isCruft = (line) =>
  /\d+\s*contributors/iu.test(line) || /\d+\s*embed/iu.test(line) || /\bLyrics[A-Z]/u.test(line);
const displayLen = (line) => (line ?? "").replace(/…$/u, "").trim().length;

// Light readability score — used ONLY to pick which line best represents a
// collapsed refrain group. The real ranking (quality + favorite tiers +
// artist diversity) is downstream; this just avoids keeping a fragment.
function repScore(q) {
  let s = q.partner ? 3 : 0;
  const L = displayLen(q.line);
  if (L < LEN_MIN) s -= 3;
  else if (L >= LEN_LO && L <= LEN_HI) s += 1;
  return s;
}

function dedupeQuotes(quotes) {
  // 1. cruft drop + near-dup dedup
  const seen = new Set();
  const pool = [];
  for (const q of quotes) {
    if (isCruft(q.line)) continue;
    const nl = normLine(q.line);
    if (!nl || seen.has(nl)) continue;
    seen.add(nl);
    pool.push(q);
  }
  // 2. intra-song (song, rhyme-partner∨∅) collapse — keep the best representative
  const bySong = new Map();
  for (const q of pool) {
    const key = `${q.artist}|${q.song}|${q.partner?.word ?? "∅"}`;
    const cur = bySong.get(key);
    if (!cur || repScore(q) > repScore(cur)) bySong.set(key, q);
  }
  const kept = [...bySong.values()];
  for (const q of kept) delete q.wordPos; // legacy; keep partner + _songOrder for downstream
  return kept;
}

let totalKept = 0;
for (const [k, arr] of index) {
  const sel = dedupeQuotes(arr);
  index.set(k, sel);
  totalKept += sel.length;
}

// Bucket by first letter.
const buckets = new Map();
for (const [k, arr] of index) {
  const c = k[0];
  const letter = /[a-z]/.test(c) ? c : "_";
  if (!buckets.has(letter)) buckets.set(letter, {});
  buckets.get(letter)[k] = arr;
}
// Self-heal: reset any letter file we don't produce this run to empty. The
// tokenizer only emits [a-z]-initial keys, so "_.json" would otherwise keep
// fossil tokens ("6ers", "ﬁne", "*nsync") from an older, looser tokenizer.
for (const letter of "abcdefghijklmnopqrstuvwxyz_") {
  if (!buckets.has(letter)) buckets.set(letter, {});
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
  `After dedup + refrain-collapse: kept ${totalKept} quotes from ${meta.totalTokens} raw end-quotes ` +
  `(${(100 * totalKept / meta.totalTokens).toFixed(1)}%) — no caps, ranking/tiering is downstream.`,
);
console.log(
  `End-position quotes with rhyme partner: ${meta.totalEndQuotesWithPartner}/${meta.totalEndQuotes} (${partnerPct}%).`,
);
