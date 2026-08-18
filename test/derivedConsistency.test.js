// ── Derived-artifact consistency guard ──────────────────────────────
// The lyric-library bucket layout (wordlists/lyric-library/) is keyed by
// rhymeKeyOf() over normalizePhonemes()'d CMU entries. Anything that changes
// a word's rhymeKey can move it between bucket files — if the buckets aren't
// rebuilt, runtime quote lookups miss silently (the July 2026 yukon/AO-R bug
// class). That includes not just the anchor/normalization CODE
// (rhymeClassifier.js, pronunciation.js) but the pronunciation DATA it runs
// on: cmu-dict.json and, crucially, cmu-overrides.json — a one-line override
// re-transcription (writhe, commit 4291ac47) silently rotted its bucket for a
// release because the hash used to cover only the .js. wordnet-categories.json
// counts too: it is the real-word gate, so a reclassification changes which
// candidates exist. Keep this file list in lockstep with phoneticsHash() in
// scripts/buildLyricBuckets.mjs.
//
// buildLyricBuckets.mjs stamps a hash of those sources into
// index.json at build time; this test recomputes it. Red means:
//
//   node lyric-library/scripts/build-index.mjs   (needs lyric-library/raw/)
//   node scripts/buildLyricFrequency.mjs
//   node scripts/buildClicheList.mjs
//   node scripts/buildLyricBuckets.mjs
//   node scripts/buildSeoPages.mjs               (SEO pages bake the same keys!)
//
// then commit the regenerated artifacts. See CLAUDE.md "Re-run protocol".

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The rhyme-finder modules fetch their data by URL. Shim fetch → filesystem
// before any of them is imported, exactly as rhymeClassifier.test.js does.
globalThis.fetch = async (url) => {
  let buf;
  try { buf = fs.readFileSync(fileURLToPath(url)); }
  catch { return { ok: false, status: 404 }; }
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString()), text: async () => buf.toString() };
};

test("lyric buckets were built with the current phonetic layer", () => {
  const h = crypto.createHash("sha256");
  for (const f of [
    "rhyme-finder/src/rhymeClassifier.js",
    "rhyme-finder/src/pronunciation.js",
    "wordlists/cmu-overrides.json",
    "wordlists/cmu-dict.json",
    "rhyme-finder/wordlists/wordnet-categories.json",
  ]) {
    h.update(fs.readFileSync(path.join(ROOT, f)));
  }
  const expected = h.digest("hex").slice(0, 16);

  const index = JSON.parse(
    fs.readFileSync(path.join(ROOT, "wordlists/lyric-library/index.json"), "utf8"),
  );
  assert.equal(
    index.phonetics,
    expected,
    "wordlists/lyric-library/ is stale: rhymeClassifier.js/pronunciation.js " +
      "changed after the last bucket build. Re-run the derived pipeline " +
      "(build-index → frequency → cliché → buckets → SEO pages) and commit. " +
      "See the header of this test file for the exact commands.",
  );
});

// ── rhyme-counts.json ───────────────────────────────────────────────
// The autocomplete's perfect/near columns read a POSITIONAL artifact: counts
// packed in the alphabetical order of the suggest vocabulary, with no word
// keys. If the vocabulary drifts (a dict entry, an override, a lex
// reclassification) every number silently shifts onto the wrong word — so the
// file stamps vocabularyHash() of the list it was built from, the loader
// refuses a mismatch, and this test makes the mismatch loud at build time.
//
// Red means: node scripts/buildRhymeCounts.mjs   (~11 min, then commit)
test("rhyme-counts.json was built from the current vocabulary", async () => {
  const { prewarm, ensureSuggestIndex, suggestWords, vocabularyHash } = await import(
    path.join(ROOT, "rhyme-finder/src/rhymeFinder.js")
  );
  await prewarm();
  await ensureSuggestIndex();
  const words = [];
  for (const c of "abcdefghijklmnopqrstuvwxyz") {
    for (const row of suggestWords(c, Number.MAX_SAFE_INTEGER)) words.push(row.text);
  }
  words.sort();

  const art = JSON.parse(
    fs.readFileSync(path.join(ROOT, "rhyme-finder/wordlists/rhyme-counts.json"), "utf8"),
  );
  assert.equal(art.n, words.length, "rhyme-counts.json covers a different number of words");
  assert.equal(art.counts.length, words.length, "rhyme-counts.json rows != vocabulary size");
  assert.equal(
    art.hash,
    vocabularyHash(words),
    "rhyme-counts.json is stale: the suggest vocabulary changed since it was " +
      "built, so its positional rows no longer line up. Re-run " +
      "`node scripts/buildRhymeCounts.mjs` (~11 min) and commit the artifact.",
  );
});
