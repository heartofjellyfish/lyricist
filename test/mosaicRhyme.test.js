// ── Mosaic (compound) rhyme test suite ─────────────────────────────
// Covers MOSAIC-PLAN.md v1: generation (Direction B), phrase input
// (Direction A), the classifier seam, and the negative boundaries.
// Same harness as the golden suite — fetch shimmed to the local
// filesystem BEFORE importing the modules under test.
// Run: node --test test/mosaicRhyme.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

globalThis.fetch = async (url) => {
  const path = fileURLToPath(url);
  let buf;
  try {
    buf = fs.readFileSync(path);
  } catch {
    return { ok: false, status: 404 };
  }
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString()),
    text: async () => buf.toString(),
  };
};

const { ensurePronunciation } = await import(
  "../rhyme-finder/src/pronunciation.js"
);
const { analyzeWord, analyzeFromPhonemes, classifyRhymeAnalyzed } = await import(
  "../rhyme-finder/src/rhymeClassifier.js"
);
const { findRhymes } = await import("../rhyme-finder/src/rhymeFinder.js");

await ensurePronunciation();

async function mosaicsFor(word) {
  const { mosaics } = await findRhymes({ word });
  return mosaics;
}
function find(mosaics, display) {
  return mosaics.find((m) => m.display === display);
}

// ── Generation positives ────────────────────────────────────────────
// Assert membership + tier + joinType. Every mosaic is graded by the
// real classifier on the real Pattison scale — nothing here bypasses it.
const POSITIVES = [
  ["poet", "know it", "perfect", "exact"],
  ["letter", "get her", "perfect", "exact"], // weak 'er
  ["water", "bought her", "perfect", "exact"], // weak 'er + cot/caught merger
  ["water", "got her", "perfect", "exact"],
  ["reminder", "find her", "perfect", "exact"],
  ["bottom", "got them", "perfect", "exact"], // weak 'em
  ["system", "missed them", "perfect", "exact"], // weak 'em
  ["city", "hit me", "additive", "additive-onset"],
  ["spaghetti", "forget me", "additive", "additive-onset"],
  ["money", "run me", "additive", "additive-onset"],
  // Geminate (shared boundary consonant, assembled degeminated). NOTE: the
  // plan's delta/felt-to example is shadowed by the identical-sounding
  // "felt a" (exact join → same F EH L T AH phonemes), which wins the
  // (headWord, tail-token) dedup on join quality. These sources surface a
  // geminate cleanly because no bare-schwa tail produces the same sound.
  ["splendid", "spend did", "perfect", "geminate"],
  ["candid", "hand did", "perfect", "geminate"],
];

for (const [source, display, tier, join] of POSITIVES) {
  test(`generate ${source} → "${display}" (${tier}/${join})`, async () => {
    const mosaics = await mosaicsFor(source);
    const hit = find(mosaics, display);
    assert.ok(
      hit,
      `"${display}" missing for "${source}" — have: ${mosaics
        .slice(0, 10)
        .map((m) => m.display)
        .join(", ")}`,
    );
    assert.equal(hit.type, tier, `${display}: tier`);
    assert.equal(hit.joinType, join, `${display}: joinType`);
  });
}

test("weakForm flag is set on h-dropped / reduced tails", async () => {
  const letter = await mosaicsFor("letter");
  assert.equal(find(letter, "get her").weakForm, true, "get her is 'get 'er'");
  const bottom = await mosaicsFor("bottom");
  assert.equal(find(bottom, "got them").weakForm, true, "got them is 'got 'em'");
});

test("delta surfaces a 'felt'-headed perfect mosaic (head match + degemination)", async () => {
  // The geminate join for delta/felt-to is deduped into the identical-
  // sounding exact "felt a"; either way a felt-headed PERFECT mosaic proves
  // the head index + tail matching fire for the delta split.
  const mosaics = await mosaicsFor("delta");
  const felt = mosaics.find((m) => m.words[0] === "felt" && m.type === "perfect");
  assert.ok(felt, `no felt-headed perfect mosaic for delta — have: ${mosaics.slice(0, 8).map((m) => m.display).join(", ")}`);
});

// ── Generation negatives ────────────────────────────────────────────

test("masculine sources get zero mosaics", async () => {
  for (const w of ["outside", "cat", "believe", "today"]) {
    const mosaics = await mosaicsFor(w);
    assert.equal(mosaics.length, 0, `${w} is masculine — no mosaics`);
  }
});

test("no identity / assonance / consonance types ever leak into output", async () => {
  const allowed = new Set(["perfect", "family", "additive", "subtractive"]);
  for (const w of ["water", "poet", "city", "reminder", "spaghetti", "money"]) {
    const mosaics = await mosaicsFor(w);
    for (const m of mosaics) {
      assert.ok(allowed.has(m.type), `${w} → ${m.display} has forbidden type ${m.type}`);
    }
  }
});

test("verb gate: non-verb heads never leak (grammatical trash removed)", async () => {
  // The productive mosaic pattern is verb + pronoun/particle. Non-verb heads
  // produce grammatical nonsense the classifier can't distinguish.
  const bad = {
    poet: ["oh", "no", "so", "hello", "mexico", "tokyo", "idaho"],
    water: ["scott", "apricot", "astronaut", "camelot"],
    letter: ["cigarette", "internet"],
  };
  for (const [src, heads] of Object.entries(bad)) {
    const mosaics = await mosaicsFor(src);
    for (const h of heads) {
      assert.ok(!mosaics.some((m) => m.words[0] === h), `${src}: non-verb head "${h}" leaked`);
    }
  }
});

test("verb gate: verb heads (incl. irregular pasts) survive", async () => {
  const water = await mosaicsFor("water");
  for (const good of ["got her", "bought her", "caught her", "thought her"]) {
    assert.ok(water.some((m) => m.display === good), `${good} (irregular-past verb head) missing`);
  }
});

test("head words clear the quality gate (no junk tokens as heads)", async () => {
  const junk = new Set(["sie", "naif", "klee", "fae", "che", "ya", "brunn", "chun", "jun", "kai", "doi", "foy", "hoy", "loy"]);
  const mosaics = await mosaicsFor("water");
  for (const m of mosaics) {
    assert.ok(!junk.has(m.words[0]), `junk head "${m.words[0]}" in ${m.display}`);
  }
});

test("attestation: everyday mosaics carry a song count + real quotes", async () => {
  const poet = await mosaicsFor("poet");
  const knowIt = poet.find((m) => m.display === "know it");
  assert.ok(knowIt, "know it should generate for poet");
  assert.ok(knowIt.songs > 0, "know it is attested (ends lines in real songs)");
  assert.ok(Array.isArray(knowIt.quotes) && knowIt.quotes.length > 0, "carries sample quotes");
  const q = knowIt.quotes[0];
  assert.ok(q.line && q.credit && q.songTitle && q.surface === "know it", "quote shape");
});

test("attestation: un-everyday (but verb-gated) mosaics get 0 songs", async () => {
  const poet = await mosaicsFor("poet");
  // "snow it" is grammatical (snow is a verb) but not an everyday corpus phrase.
  const snowIt = poet.find((m) => m.display === "snow it");
  if (snowIt) assert.equal(snowIt.songs, 0, "snow it is generated but not attested");
});

test("dup-twin suppression: no display string appears twice", async () => {
  for (const w of ["water", "letter", "reminder", "bottom"]) {
    const mosaics = await mosaicsFor(w);
    const seen = new Set();
    for (const m of mosaics) {
      assert.ok(!seen.has(m.display), `${w}: "${m.display}" appears twice (perfect + additive twin)`);
      seen.add(m.display);
    }
  }
});

test("mosaic caps: default ≤16, total ≤48", async () => {
  const mosaics = await mosaicsFor("water");
  assert.ok(mosaics.length <= 48, `total ${mosaics.length} > 48`);
  assert.ok(mosaics.filter((m) => m.tier === "default").length <= 16, "default tier > 16");
});

// ── Classifier seam unit ────────────────────────────────────────────

test("seam: homophone mosaic 'a tension' / attention classifies as identity", () => {
  const attention = analyzeWord("attention");
  // a=AH0, tension=T EH1 N SH AH0 N
  const aTension = analyzeFromPhonemes("a tension", ["AH0", "T", "EH1", "N", "SH", "AH0", "N"]);
  const cls = classifyRhymeAnalyzed(attention, aTension);
  assert.equal(cls.type, "identity");
  assert.equal(cls.isRhyme, false);
});

// ── Direction A — phrase input ──────────────────────────────────────

async function bucketHas(word, type, target) {
  const { buckets } = await findRhymes({ word });
  return (buckets[type] || []).some((e) => e.word === target);
}

test("phrase: bought her → water (perfect); source is feminine", async () => {
  const { source, buckets } = await findRhymes({ word: "bought her" });
  assert.ok((buckets.perfect || []).some((e) => e.word === "water"));
  assert.equal(source.masculine, false);
});

test("phrase: know it → poet (perfect); function word destressed (anchor OW)", async () => {
  const { source } = await findRhymes({ word: "know it" });
  assert.equal(source.stressedVowel, "OW");
  assert.ok(await bucketHas("know it", "perfect", "poet"));
});

test("phrase: gold rush → crush (perfect); content words keep citation stress (anchor on rush)", async () => {
  const { source } = await findRhymes({ word: "gold rush" });
  assert.equal(source.stressedVowel, "AH");
  assert.ok(await bucketHas("gold rush", "perfect", "crush"));
});

test("phrase: of it → all-function fallback, no throw", async () => {
  const { source } = await findRhymes({ word: "of it" });
  assert.ok(source.stressedVowel, "an anchor exists via last-word citation");
});

test("phrase: mosaic generation runs on phrase sources too (bought her → got her)", async () => {
  const { mosaics } = await findRhymes({ word: "bought her" });
  assert.ok(mosaics.some((m) => m.display === "got her"));
});

test("phrase: unknown word errors and names the offending word", async () => {
  await assert.rejects(() => findRhymes({ word: "qwzxplk her" }), /qwzxplk/);
});

test("phrase: more than 4 words is a friendly error", async () => {
  await assert.rejects(() => findRhymes({ word: "one two three four five" }), /4 words/);
});
