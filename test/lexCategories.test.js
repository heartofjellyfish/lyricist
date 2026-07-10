// ── Lex-category boundary fixtures ──────────────────────────────────
// wordnet-categories.json carries ONE axis: proper name vs common word.
// Not semantic domain (WordNet's lexname is unreliable for proper names —
// venus and vanessa both own a clam/butterfly genus), and not familiarity
// (a continuum lyricScore already ranks). See rhyme-finder/LEX-TAXONOMY-PLAN.md.
//
// The file is also rhymeFinder's real-word gate, so a word absent from every
// bucket cannot surface as a candidate at all. That makes the DROP rules
// boundaries worth pinning from both sides.
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
for (const cat of ["common", "name", "place"]) {
  for (const w of cats[cat]) index.set(w, cat);
}
const lexOf = (w) => index.get(w) ?? null;

test("buckets are exactly the three lex categories, plus a spelling map", () => {
  assert.deepEqual(Object.keys(cats).sort(), ["common", "display", "name", "place"]);
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

test("Names holds every proper name that isn't a place", () => {
  // venus is the boundary case that broke the lexname vote: WordNet gives it
  // a clam-genus sense, so "dominant lexname" called the goddess a science word.
  for (const w of ["venus", "madonna", "dane", "kennedy", "jesus"]) {
    assert.equal(lexOf(w), "name", w);
  }
  // Brands, agencies, acronyms — no separate "Proper" bucket for these.
  for (const w of ["tylenol", "fbi", "nato"]) {
    assert.equal(lexOf(w), "name", w);
  }
  // Celestial instances are named things, not places on Earth.
  for (const w of ["betelgeuse", "cygnus"]) {
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

test("landforms are places; the water and the sky are not", () => {
  // WordNet files continents and mountains under noun.object, so a
  // location-lexname test alone missed them entirely.
  for (const w of ["africa", "asia", "europe", "alps", "everest"]) {
    assert.equal(lexOf(w), "place", w);
  }
  // Rivers are named after people, so the hydrographic hypernyms are excluded
  // and these fall back to Names.
  for (const w of ["charles", "hudson", "clyde", "nile"]) {
    assert.equal(lexOf(w), "name", w);
  }
  // Peaks named after people yield to the person sense (Mount Adams,
  // Mount Wilson). `logan` is the accepted casualty — no person sense to
  // outvote Mount Logan.
  for (const w of ["adams", "wilson"]) {
    assert.equal(lexOf(w), "name", w);
  }
  // Places that carry a location sense of their own never reach the test.
  for (const w of ["kansas", "jordan"]) {
    assert.equal(lexOf(w), "place", w);
  }
});

test("capitalized homographs of ordinary words stay common", () => {
  // WordNet holds no pronouns, auxiliaries or interjections, so `it` looks
  // truly proper on the strength of IT (information technology) alone. Same
  // for WHO the agency, AM the modulation, Ha the laugh, Na the sodium.
  // Frequency can't separate these from fbi/cia/dna — all sit in the top-7k.
  for (const w of ["it", "who", "am", "an", "us", "ha", "na", "oh"]) {
    assert.equal(lexOf(w), "common", w);
  }
  // …while the real acronyms in that same band stay names.
  for (const w of ["fbi", "cia", "dna"]) {
    assert.equal(lexOf(w), "name", w);
  }
});

test("inflections of common lemmas are rescued from their proper homographs", () => {
  // laws → law + s (not Laws, the Platonic dialogue). judges, acts, marks,
  // banks all likewise. sat/led/sung are irregular, so they're listed.
  for (const w of ["laws", "acts", "judges", "marks", "banks", "sat", "led"]) {
    assert.equal(lexOf(w), "common", w);
  }
  // The peel must not over-fire: `-es` only attaches to a sibilant stem, so
  // james does NOT reduce to jam, nor abies to ab.
  assert.equal(lexOf("james"), "name");
  // And a surname whose stem is itself a name stays a name.
  assert.equal(lexOf("adams"), "name");
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

test("dictionary residue is dropped from the lexicon entirely", () => {
  // Latin taxa: truly proper + every sense in {animal, plant, substance} +
  // unattested by either frequency source.
  for (const w of ["abies", "accipiter", "pseudomonas", "acanthurus"]) {
    assert.equal(lexOf(w), null, `${w} should not be in any bucket`);
  }
  // Two-letter proper tokens: chemical symbols, initials, abbreviations.
  for (const w of ["ba", "se", "au", "wu", "mr"]) {
    assert.equal(lexOf(w), null, `${w} should not be in any bucket`);
  }
  // The guard on the other side: a genus name a real corpus attests survives,
  // and the two-letter vocables are words before they are symbols.
  for (const w of ["iris", "lotus", "dahlia", "oh", "ha", "na", "me"]) {
    assert.equal(lexOf(w), "common", w);
  }
});

test("verbs, adjectives and adverbs are always common", () => {
  for (const w of ["run", "golden", "slowly", "may"]) {
    assert.equal(lexOf(w), "common", w);
  }
});

test("proper names carry their capitalized spelling; common words carry none", () => {
  assert.equal(cats.display.madonna, "Madonna");
  assert.equal(cats.display.cuba, "Cuba");
  assert.equal(cats.display.africa, "Africa");
  assert.equal(cats.display.fbi, "FBI");
  assert.equal(cats.display.dna, "DNA");
  // WordNet's only reading of `sam` is the missile, and SAM shouts.
  assert.equal(cats.display.sam, "Sam");
  for (const w of ["baker", "monday", "nitrogen", "it"]) {
    assert.equal(cats.display[w], undefined, `${w} is common — no spelling`);
  }
  // Every display key is a proper name, and never changes the letters.
  for (const [w, spelling] of Object.entries(cats.display)) {
    assert.notEqual(lexOf(w), "common", `${w} is common but has a spelling`);
    assert.equal(spelling.toLowerCase(), w, `${spelling} must lowercase to ${w}`);
  }
});
