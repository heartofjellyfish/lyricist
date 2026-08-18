// Build rhyme-finder/wordlists/rhyme-counts.json — per-word rhyme-tier counts
// for the input autocomplete's "perfect" and "near" columns.
//
// WHY AN ARTIFACT AT ALL. The counts are just what findRhymes() already
// computes, but one uncapped search costs 30–150 ms, so the eight rows the
// autocomplete shows would cost 0.3–1.2 s of main-thread work per keystroke.
// Precomputed, the same numbers are a lookup.
//
// WHY PER WORD, NOT PER RHYME KEY. Words sharing a rhyme key genuinely differ:
// love has 6 perfect rhymes and above has 8; night 157 and light 148. A
// candidate that shares the source's ONSET is classified as identity, not
// perfect, so the count depends on the word, not just its rime.
//
// FORMAT. Counts are packed positionally in the ALPHABETICAL order of the
// suggest vocabulary — no word keys, which is what keeps the file at ~186 KB
// brotli. Positional packing is only safe if both sides agree on the exact
// word list, so the header carries vocabularyHash() of that list and the
// runtime refuses a file whose hash doesn't match (fails closed: no columns,
// never wrong numbers).
//
// COST. ~13 minutes on 8 shards. Rerun whenever the classifier, the
// pronunciation layer, the dict, the overrides or the lex categories change —
// the same trigger list as the lyric buckets (see /CLAUDE.md).
//
//   node scripts/buildRhymeCounts.mjs            # all shards, writes the file
//   node scripts/buildRhymeCounts.mjs --shards 4 # fewer parallel processes

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

// The browser modules fetch their data with URLs; give them a file: reader.
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  const url = typeof u === "string" ? u : u.href ?? String(u);
  if (url.startsWith("file:")) {
    const buf = fs.readFileSync(fileURLToPath(url));
    return { ok: true, status: 200, json: async () => JSON.parse(buf.toString("utf8")), text: async () => buf.toString("utf8") };
  }
  return realFetch(u);
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SRC = path.join(ROOT, "rhyme-finder/src/rhymeFinder.js");
const OUT = path.join(ROOT, "rhyme-finder/wordlists/rhyme-counts.json");
const TIERS = ["perfect", "family", "additive", "subtractive", "assonance", "consonance"];

const { findRhymes, prewarm, ensureSuggestIndex, suggestWords, vocabularyHash } = await import(SRC);

async function vocabulary() {
  await prewarm();
  await ensureSuggestIndex();
  const words = [];
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    for (const row of suggestWords(c, Number.MAX_SAFE_INTEGER)) words.push(row.text);
  }
  return words.sort();
}

async function countsFor(word) {
  // perBucket must be effectively uncapped — we want totals, not a page.
  const { buckets } = await findRhymes({ word, perBucket: Number.MAX_SAFE_INTEGER });
  return TIERS.map((t) => (buckets[t] || []).length);
}

// ── worker ──────────────────────────────────────────────────────────
const shardArg = process.argv.indexOf("--range");
if (shardArg !== -1) {
  const [start, end, tmp] = process.argv.slice(shardArg + 1);
  const words = (await vocabulary()).slice(Number(start), Number(end));
  const out = [];
  for (const w of words) {
    try { out.push(await countsFor(w)); }
    catch { out.push(TIERS.map(() => 0)); }   // unpronounceable → all zeroes
    if (out.length % 500 === 0) process.send?.({ done: out.length, of: words.length });
  }
  fs.writeFileSync(tmp, JSON.stringify(out));
  process.send?.({ finished: true });
  process.exit(0);
}

// ── parent ──────────────────────────────────────────────────────────
const shardsArg = process.argv.indexOf("--shards");
const SHARDS = shardsArg !== -1 ? Number(process.argv[shardsArg + 1]) : Math.max(1, Math.min(8, os.cpus().length - 2));
const words = await vocabulary();
const hash = vocabularyHash(words);
console.log(`vocabulary: ${words.length} words, hash ${hash}`);
console.log(`counting on ${SHARDS} shards — expect ~${Math.ceil((words.length * 0.08) / SHARDS / 60)} min`);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rhyme-counts-"));
const size = Math.ceil(words.length / SHARDS);
const started = Date.now();
let done = 0;

await Promise.all(
  Array.from({ length: SHARDS }, (_, i) => {
    const start = i * size;
    const end = Math.min(words.length, start + size);
    const tmp = path.join(tmpDir, `shard-${i}.json`);
    return new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(import.meta.url), ["--range", String(start), String(end), tmp], { stdio: "inherit" });
      child.on("message", (m) => {
        if (m.done) {
          done += 500;
          const pct = ((done / words.length) * 100).toFixed(0);
          process.stdout.write(`\r  ${pct}%  (${((Date.now() - started) / 1000).toFixed(0)}s)   `);
        }
      });
      child.on("exit", (code) => (code === 0 ? resolve(tmp) : reject(new Error(`shard ${i} exited ${code}`))));
    });
  })
);

const counts = [];
for (let i = 0; i < SHARDS; i += 1) {
  counts.push(...JSON.parse(fs.readFileSync(path.join(tmpDir, `shard-${i}.json`), "utf8")));
}
if (counts.length !== words.length) throw new Error(`shard merge lost rows: ${counts.length} vs ${words.length}`);
fs.rmSync(tmpDir, { recursive: true, force: true });

fs.writeFileSync(OUT, JSON.stringify({ v: 1, n: words.length, hash, tiers: TIERS, counts }));
console.log(`\nwrote ${path.relative(ROOT, OUT)} — ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB raw, ${((Date.now() - started) / 60000).toFixed(1)} min`);
