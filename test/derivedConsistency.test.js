// ── Derived-artifact consistency guard ──────────────────────────────
// The lyric-library bucket layout (wordlists/lyric-library/) is keyed by
// rhymeKeyOf() over normalizePhonemes()'d CMU entries. Anything that changes
// a word's rhymeKey can move it between bucket files — if the buckets aren't
// rebuilt, runtime quote lookups miss silently (the July 2026 yukon/AO-R bug
// class). That includes not just the anchor/normalization CODE
// (rhymeClassifier.js, pronunciation.js) but the pronunciation DATA it runs
// on: cmu-dict.json and, crucially, cmu-overrides.json — a one-line override
// re-transcription (writhe, commit 4291ac47) silently rotted its bucket for a
// release because the hash used to cover only the .js. Keep this file list in
// lockstep with phoneticsHash() in scripts/buildLyricBuckets.mjs.
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

test("lyric buckets were built with the current phonetic layer", () => {
  const h = crypto.createHash("sha256");
  for (const f of [
    "rhyme-finder/src/rhymeClassifier.js",
    "rhyme-finder/src/pronunciation.js",
    "wordlists/cmu-overrides.json",
    "wordlists/cmu-dict.json",
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
