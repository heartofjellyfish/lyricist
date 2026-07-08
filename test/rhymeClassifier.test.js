// ── Golden test suite for the Pattison rhyme classifier ─────────────
// Fixtures come from two sources:
//   1. Pattison's textbook examples ("Songwriting: Essential Guide to
//      Rhyming", 2nd ed) — the canonical pairs for each rhyme tier.
//   2. Regression cases for CMU-artifact bugs we fixed (word-final OW2
//      fake secondary stress; prefilter anchor divergence).
// Run: node --test test/rhymeClassifier.test.js
//
// The suite loads the real CMU dict through the real loader
// (ensurePronunciation) with fetch shimmed to the local filesystem, so
// it exercises comment-stripping and AO→AA normalization too.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Shim fetch → local filesystem BEFORE importing the modules under test.
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
const { classifyRhyme, analyzeWord, rhymeKeyOf } = await import(
  "../rhyme-finder/src/rhymeClassifier.js"
);
const { findRhymes } = await import("../rhyme-finder/src/rhymeFinder.js");

await ensurePronunciation();

// type + isRhyme expectations, symmetric unless noted.
// [wordA, wordB, expectedType, note]
const GOLDEN = [
  // ── perfect ──
  ["land", "command", "perfect", "Pattison Ch1 masculine perfect"],
  ["hiding", "riding", "perfect", "Pattison Ch4 feminine perfect"],
  ["scare", "care", "perfect", "cluster onset vs simple onset ≠ identity"],
  ["borrow", "sorrow", "perfect", "REGRESSION: CMU marks borrow OW2 / sorrow OW0"],
  ["tomorrow", "sorrow", "perfect", "REGRESSION: tomorrow carries fake OW2"],
  ["potato", "tomato", "perfect", "REGRESSION: potato OW2 / tomato OW0"],
  ["go", "radio", "perfect", "dactyl-tail final -o keeps its anchor (radio/go is standard practice)"],
  ["go", "hello", "perfect", "true final primary stress unaffected by OW fix"],
  ["economy", "agronomy", "perfect", "-y suffix artifact class (IH2 vs IY0)"],
  ["grandma", "grandpa", "perfect", "OVERRIDE: grandma AA0→AA2 rejoins grandpa"],
  ["monday", "away", "perfect", "OVERRIDE: weekday -day D IY0→D EY2, the sung vowel"],
  ["envoy", "joy", "perfect", "OVERRIDE: envoy OY0→OY2 rejoins the -oy family"],
  ["dehumidify", "sky", "perfect", "OVERRIDE: -ify family AY0→AY2"],

  // ── family ──
  ["lonely", "homely", "family", "Pattison Ch4: N/M companions, matching -ly trailing"],
  ["table", "maple", "family", "Pattison Ch4: B/P partners"],
  ["tornado", "potato", "family", "REGRESSION: both re-anchor to EY1; D/T partners"],

  // ── additive / subtractive ──
  ["see", "speak", "additive", "Pattison Ch5: extra K"],
  ["flying", "hiding", "additive", "Pattison: feminine additive, extra D"],
  ["scar", "heart", "additive", "Pattison Ch5: R masks the added T"],
  ["fast", "class", "subtractive", "Pattison Ch5: fast → as → class"],
  ["tissue", "issue", "subtractive", "OVERRIDE: tissue's fake UW2 re-anchored; S/SH companions, tissue carries the extra glide"],

  // ── assonance ──
  ["love", "hunt", "assonance", "Pattison Ch6 masculine assonance"],
  ["passion", "ashes", "assonance", "Pattison Ch2: 'sonic connection', trailing diverges"],
  ["flying", "quiet", "assonance", "perfect stressed syllable carries it despite trailing divergence"],
  ["lonely", "smokey", "assonance", "feminine assonance with matching -y trailing"],
  ["statue", "value", "assonance", "OVERRIDE: statue's fake UW2 re-anchored to the penult"],

  // ── consonance ──
  ["friend", "wind", "consonance", "Pattison Ch6: Zevon's Hasten Down the Wind"],
  ["cramming", "teeming", "consonance", "Pattison Ch6 feminine consonance"],
  ["shadow", "meadow", "consonance", "post-fix: AE vs EH, same D coda, same -ow trailing"],

  // ── identity (not a rhyme) ──
  ["fuse", "confuse", "identity", "Pattison Ch1: same onset kills the tension"],
  ["peace", "piece", "identity", "homophones"],
  ["place", "replace", "identity", "phoneme-suffix route"],
  ["monday", "sunday", "identity", "shared -day morpheme = rhyming day with day"],
  ["envoy", "convoy", "identity", "shared -voy syllable, same onset — attention/detention pattern"],

  // ── masculine ↔ feminine mismatch (not a usable end-rhyme) ──
  // The stressed syllables ring together, but the feminine word's trailing
  // syllable dangles and the line-ends fall on different beats. We classify
  // these as non-rhymes and never surface them (RhymeZone doesn't either).
  ["moving", "you", "mismatched", "fem/mas: trailing left unrhymed — not surfaced"],
  ["striking", "night", "mismatched", "fem/mas at family stressed-coda — still not surfaced"],

  // ── wrenched pairs must NOT count as rhymes ──
  ["go", "meadow", "mismatched", "REGRESSION: was a fake perfect via meadow's OW2"],
  ["go", "borrow", "mismatched", "REGRESSION: the user-reported case"],
  ["go", "shadow", "mismatched", "REGRESSION: fake OW2 class"],
  ["go", "window", "mismatched", "window is OW0 — must stay excluded"],

  // ── cot/caught merger scope (July 2026 yukon bug) ──
  // The AO→AA merge must apply ONLY in non-rhotic position. Pre-R AO is
  // the NORTH/FORCE vowel and stays distinct from START (AA-R) for all
  // American speakers. The old blanket merge made born/barn HOMOPHONES
  // and poured every AO-R word into AA-vowel rhyme lists for ~2 months.
  ["dawn", "john", "perfect", "non-rhotic merge kept: LOT/THOUGHT collapse"],
  ["gone", "on", "perfect", "non-rhotic merge kept"],
  ["born", "corn", "perfect", "NORTH class intact after merger scoping"],
  ["storm", "warm", "perfect", "NORTH class intact"],
  ["born", "barn", "consonance", "REGRESSION: was identity (false homophone) under blanket merge"],
  ["star", "store", "consonance", "REGRESSION: was identity under blanket merge"],
  ["farmer", "former", "consonance", "REGRESSION: was identity under blanket merge"],
  ["far", "for", "consonance", "REGRESSION: was identity under blanket merge"],
  ["born", "con", "consonance", "REGRESSION: the yukon-page symptom — was additive"],
  ["yukon", "want", "additive", "true AA-vowel additive unaffected by the fix"],
];

for (const [a, b, expected, note] of GOLDEN) {
  test(`${a} / ${b} → ${expected}  (${note})`, () => {
    const cls = classifyRhyme(a, b);
    assert.equal(
      cls.type,
      expected,
      `${a}/${b}: expected ${expected}, got ${cls.type} — ${cls.explanation}`,
    );
    // Symmetry: classification must not depend on argument order.
    // additive/subtractive swap by design (side of the extra consonant).
    const swapped = classifyRhyme(b, a);
    const symmetric =
      { additive: "subtractive", subtractive: "additive" }[expected] ?? expected;
    assert.equal(swapped.type, symmetric, `${b}/${a} asymmetric: ${swapped.type}`);
  });
}

test("familyCloseness: fricative companions rank tighter than partners (Pattison reversal)", () => {
  // leaf/leash: F↔SH companions (same voicing) → tight for fricatives.
  // leaf/leave: F↔V partners (voicing flip) → medium for fricatives.
  const companions = classifyRhyme("leaf", "leash");
  const partners = classifyRhyme("leaf", "leave");
  assert.equal(companions.type, "family");
  assert.equal(partners.type, "family");
  assert.equal(companions.familyCloseness, "tight");
  assert.equal(partners.familyCloseness, "medium");
  // Plosives keep the original order: partners tight, companions medium.
  assert.equal(classifyRhyme("cat", "cad").familyCloseness, "tight");   // T↔D partners
  assert.equal(classifyRhyme("cat", "cap").familyCloseness, "medium");  // T↔P companions
});

test("anchor: fake word-final OW2 demotes to trailing (meadow class)", () => {
  for (const w of ["meadow", "borrow", "shadow", "tomorrow", "potato", "aficionado"]) {
    const info = analyzeWord(w);
    assert.equal(info.masculine, false, `${w} should be feminine after the fix`);
    assert.notEqual(info.stressedVowel, "OW", `${w} must not anchor on the final -o`);
  }
});

test("anchor: dactyl-tail and compound -o words keep their final anchor", () => {
  for (const w of ["radio", "mexico", "buffalo", "afterglow", "overflow"]) {
    const info = analyzeWord(w);
    assert.equal(info.masculine, true, `${w} should keep its word-final OW anchor`);
    assert.equal(info.stressedVowel, "OW");
  }
});

test("rhymeKeyOf: borrow-class words move out of the bare-OW bucket", () => {
  const key = (w) => rhymeKeyOf(analyzeWord(w).phonemes);
  assert.equal(key("go"), "OW1");
  assert.notEqual(key("meadow"), "OW2");
  assert.match(key("borrow"), /^AA1_R_OW/);
});

// ── End-to-end through findRhymes (prefilter + classifier + filters) ──

async function bucketWords(word) {
  const { buckets } = await findRhymes({ word });
  const byType = {};
  const all = new Set();
  for (const [type, list] of Object.entries(buckets)) {
    byType[type] = new Set(list.map((e) => e.word));
    for (const e of list) all.add(e.word);
  }
  return { byType, all };
}

test("findRhymes(go): wrenched -ow words gone, real rhymes intact", async () => {
  const { byType, all } = await bucketWords("go");
  for (const bad of ["meadow", "borrow", "shadow", "window", "follow", "yellow"]) {
    assert.ok(!all.has(bad), `"${bad}" must not appear anywhere for "go"`);
  }
  assert.ok(byType.perfect.has("hello"), '"hello" stays a perfect rhyme for "go"');
  assert.ok(byType.perfect.has("radio"), '"radio" (dactyl tail) stays for "go"');
});

test("findRhymes(sorrow): borrow/tomorrow restored as perfect", async () => {
  const { byType } = await bucketWords("sorrow");
  assert.ok(byType.perfect.has("borrow"), "borrow must surface for sorrow");
  assert.ok(byType.perfect.has("tomorrow"), "tomorrow must surface for sorrow");
});

test("findRhymes(potato): tomato restored as perfect", async () => {
  const { byType } = await bucketWords("potato");
  assert.ok(byType.perfect.has("tomato"), "potato/tomato is the canonical pair");
});

test("findRhymes(economy): -y artifact words pass the prefilter", async () => {
  const { all } = await bucketWords("economy");
  assert.ok(
    all.has("agronomy") || all.has("astronomy"),
    "artifact-anchored -omy words must survive the prefilter",
  );
});

test("loader: CMU '# comment' annotations are stripped", async () => {
  const info = analyzeWord("aalborg");
  assert.ok(info, "aalborg should be in the dict");
  for (const ph of info.phonemes) {
    assert.match(ph, /^[A-Z]{1,3}[012]?$/, `fake phoneme "${ph}" leaked from a comment`);
  }
});
