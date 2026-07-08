// ── Derived-artifact consistency guard ──────────────────────────────
// The lyric-library bucket layout (wordlists/lyric-library/) is keyed by
// rhymeKeyOf() over normalizePhonemes()'d CMU entries. Any change to
// rhyme-finder/src/rhymeClassifier.js or rhyme-finder/src/pronunciation.js
// can move words between bucket files — if the buckets aren't rebuilt,
// runtime quote lookups miss silently (the July 2026 yukon/AO-R bug class).
//
// buildLyricBuckets.mjs stamps a hash of those two sources into
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
