// ── Lex-category boundary fixtures ──────────────────────────────────
// wordnet-categories.json carries ONE axis: proper name vs common word.
// Not semantic domain (WordNet's lexname is unreliable for proper names —
// venus and vanessa both own a clam/butterfly genus), and not familiarity
// (a continuum lyricScore already ranks). See rhyme-finder/LEX-TAXONOMY-PLAN.md.
//
// The file is also rhymeFinder's real-word gate, so a word absent from every
// bucket cannot surface as a candidate at all. That makes the DROP rule
// (Latin taxa) a boundary worth pinning from both sides.
//
// Per CLAUDE.md: a dict-wide transform ships fixtures for BOTH sides of each
// boundary — what moves AND what must stay put. Rebuild with
//   node scripts/buildWordnetCategories.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cats = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "rhyme-finder/wordlists/wordnet-categories.json"),
    "utf8",
  ),
);

const index = new Map();
for (const [cat, words] of Object.entries(cats)) {
  for (const w of words) index.set(w, cat);
}
const lexOf = (w) => index.get(w) ?? null;

test("buckets are exactly the four lex categories", () => {
  assert.deepEqual(Object.keys(cats).sort(), ["common", "name", "place", "proper"]);
});

test("a noun with any lowercase sense is common, however famous its namesake", () => {
  // Both sides of the old "dominant lexname" bug: baker/miller are surnames
  // AND occupations; madonna/cuba have no ordinary reading at all. The old
  // rule put the occupations in `person` (60% of that bucket was mislabelled)
  // and, via a corpus-frequency override, put madonna/cuba in `common` —
  // so the Names/Places chips couldn't hide them.
  for (const w of ["baker", "miller", "sorceress", "barrister", "mycologist"]) {
    assert.equal(lexOf(w), "common", `${w} has an occupation sense`);
  }
  for (const w of ["borough", "birthplace", "hangout", "enclave"]) {
    assert.equal(lexOf(w), "common", `${w} is an ordinary noun, not a place name`);
  }
  assert.equal(lexOf("madonna"), "name");
  assert.equal(lexOf("cuba"), "place");
});

test("people, deities and nationalities land in name", () => {
  // venus is the boundary case that broke the lexname vote: WordNet gives it
  // a clam-genus sense, so "dominant lexname" called the goddess a science word.
  for (const w of ["venus", "madonna", "dane", "kennedy", "jesus"]) {
    assert.equal(lexOf(w), "name", w);
  }
});

test("person ∩ location overlaps default to place, minus a name override", () => {
  // 100 proper lemmas carry both senses and no automatic tiebreak is honest
  // (paris's first sense is a herb; illinois's is a tribe). Places win by
  // default — the frequent overlaps are mostly states and cities.
  for (const w of ["paris", "illinois", "washington", "lincoln", "jackson"]) {
    assert.equal(lexOf(w), "place", w);
  }
  for (const w of ["kennedy", "hamilton", "victoria", "sherman"]) {
    assert.equal(lexOf(w), "name", w);
  }
});

test("other proper names collect in proper", () => {
  for (const w of ["fbi", "tylenol", "nato"]) {
    assert.equal(lexOf(w), "proper", w);
  }
});

test("calendar words sing like common words", () => {
  // Proper nouns by WordNet, but "Sunday morning" / "September" are ordinary
  // in a lyric. The one hardcoded allowlist in the classifier.
  for (const w of ["monday", "september", "christmas", "easter"]) {
    assert.equal(lexOf(w), "common", w);
  }
});

test("nature words are common at every familiarity level", () => {
  // Familiarity is not a category. nitrogen (everyday) through telomere
  // (nobody's heard of it) all sit in common; ranking sinks the rare ones
  // into "show more". A `science` chip could only have been a rarity chip.
  for (const w of ["nitrogen", "mongoose", "aardvark", "feldspar", "telomere"]) {
    assert.equal(lexOf(w), "common", w);
  }
});

test("Latin taxa are dropped from the lexicon entirely", () => {
  // Truly proper + every sense in {animal, plant, substance} + unattested by
  // either frequency source. Dictionary residue, never a candidate.
  for (const w of ["abies", "accipiter", "pseudomonas", "acanthurus"]) {
    assert.equal(lexOf(w), null, `${w} should not be in any bucket`);
  }
  // The guard on the other side: a genus name a real corpus attests survives.
  // (iris/lotus/dahlia have lowercase flower senses, so they never reach the
  // taxon rule at all — belt and braces.)
  for (const w of ["iris", "lotus", "dahlia"]) {
    assert.equal(lexOf(w), "common", w);
  }
});

test("verbs, adjectives and adverbs are always common", () => {
  for (const w of ["run", "golden", "slowly", "may"]) {
    assert.equal(lexOf(w), "common", w);
  }
});
