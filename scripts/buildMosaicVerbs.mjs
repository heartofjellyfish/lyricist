// Build rhyme-finder/wordlists/mosaic-verbs.json — the verb-form set that
// gates mosaic-rhyme head words (MOSAIC-PLAN.md §5.3 quality gate).
//
// WHY: mosaic tails that are OBJECT PRONOUNS (it / her / them / him / me / us /
// you) only read as English when the head is a TRANSITIVE-ish VERB —
// "know it", "get her", "hit me". Non-verb heads produce pure trash the
// generator otherwise can't tell apart: "oh it", "no it", "radio it",
// "apricot her", "scott her". The discriminator is part of speech, and
// WordNet has it. This bakes a verb-form lookup set to a static JSON
// (Rule 2 — node_modules is stripped from Vercel deploys, so we ship data,
// not a runtime dependency).
//
// The set = WordNet verb LEMMAS  ∪  a closed list of irregular inflected
// forms (got, bought, caught… — WordNet only lists base forms)  ∪  regularly
// generated inflections (spots, spotted, spotting), then INTERSECTED with the
// CMU dictionary so only real words survive (drops generated junk like
// "beed"/"bes" and halves the file).
//
// Run:  node scripts/buildMosaicVerbs.mjs   (needs node_modules/wordnet-db)
// Rerun only when upgrading wordnet-db or the irregular list.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import wndb from "wordnet-db";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");

// Parse WordNet data.verb → base verb lemmas.
function verbLemmas(text) {
  const set = new Set();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(" ") || line.startsWith("/")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;
    const wCnt = parseInt(parts[3], 16);
    if (Number.isNaN(wCnt)) continue;
    for (let i = 0; i < wCnt; i += 1) {
      const raw = parts[4 + i * 2];
      if (raw && !raw.includes("_")) set.add(raw.toLowerCase());
    }
  }
  return set;
}

// Irregular inflected forms (past + participle). WordNet's data.verb lists
// only base lemmas, so without these the BEST mosaics — "bought her",
// "caught her", "got her", "brought them" — get gated out. Closed class.
const IRREGULAR =
  "arose awoke was were been bore born beat became begun bent bet bound bit bled blew broke bred brought built burnt bought caught chose clung came cost crept cut dealt dug did done drew drank drove ate fell fed felt fought found fled flew forbade forgot forgave froze got given went ground grew hung had heard hid hit held hurt kept knelt knew laid led leant leapt learnt left lent let lay lit lost made meant met paid put quit read rid rode rang rose ran said saw sought sold sent set sewn shook shed shone shot showed shrank shut sang sank sat slept slid sown spoke sped spelt spent spat split spread sprang stood stole stuck stung stank struck swore swept swam swung took taught tore told thought threw thrust trod woke wore wove wept won wound wrote"
    .split(/\s+/);

// Regular inflections of a base verb: -s, -ed, -ing, consonant doubling,
// silent-e drop, y→ies/ied. Over-generates (harmless — junk is filtered by
// the CMU intersection below).
function regularForms(v) {
  const out = [v + "s", v + "ed", v + "ing"];
  if (v.endsWith("e")) {
    out.push(v.slice(0, -1) + "ing", v + "d");
  }
  if (/[^aeiou][aeiou][^aeiouwxy]$/u.test(v)) {
    out.push(v + v.slice(-1) + "ed", v + v.slice(-1) + "ing");
  }
  if (v.endsWith("y")) {
    out.push(v.slice(0, -1) + "ies", v.slice(0, -1) + "ied");
  }
  return out;
}

console.log("Reading WordNet data.verb…");
const verbs = verbLemmas(readFileSync(join(wndb.path, "data.verb"), "utf8"));
console.log(`  ${verbs.size} base verb lemmas`);

for (const w of IRREGULAR) verbs.add(w);
for (const v of [...verbs]) {
  if (v.length < 2) continue;
  for (const f of regularForms(v)) verbs.add(f);
}
console.log(`  ${verbs.size} forms after irregulars + regular inflection`);

// Intersect with the CMU dictionary (the universe of possible mosaic heads):
// drops generated junk and shrinks the file to real words only.
const cmu = JSON.parse(readFileSync(join(REPO, "wordlists", "cmu-dict.json"), "utf8"));
const cmuKeys = new Set(Object.keys(cmu).map((w) => w.toLowerCase()));
const kept = [...verbs].filter((w) => cmuKeys.has(w)).sort();

const outPath = join(REPO, "rhyme-finder", "wordlists", "mosaic-verbs.json");
const json = JSON.stringify(kept);
writeFileSync(outPath, json);
console.log(`\nWrote ${outPath}`);
console.log(`  ${kept.length} verb forms in CMU (${(json.length / 1024).toFixed(1)} KB)`);
console.log(
  "  spot-check:",
  ["know", "got", "bought", "caught", "brought", "hit", "forgot", "get"]
    .map((w) => `${w}=${kept.includes(w)}`)
    .join(" "),
);
