// Build rhyme-finder/wordlists/mosaic-verbs.json — the verb-form table that
// gates mosaic-rhyme head words (MOSAIC-PLAN.md §5.3 quality gate).
//
// WHY: mosaic tails that are OBJECT PRONOUNS (it / her / them / him / me / us /
// you) only read as English when the head is a verb that can actually TAKE
// that object. Part of speech alone is not enough: "weekend" is a WordNet
// verb but intransitive ("weekending in Paris"), "pretend" takes only
// clauses/infinitives, "spend" takes only things — so a POS-only gate
// shipped "weekend her", "pretend her", "spend her" as top mosaics for
// surrender. The discriminator is WordNet's VERB FRAMES: frame 9
// ("Somebody ----s somebody") et al. mark person-object verbs, frame 8
// ("Somebody ----s something") et al. mark thing-object verbs. This bakes
// a form → object-class bitmask to a static JSON (Rule 2 — node_modules is
// stripped from Vercel deploys, so we ship data, not a runtime dependency):
//
//   { "send": 3, "spend": 2, "weekend": 0, ... }   bit 1 = can take a person
//                                                  bit 2 = can take a thing
//
// Frame → bit mapping (frame numbers are WordNet 3.0 sentence frames):
//   PERSON: 9, 14, 17, 18, 20, 24, 25, 30 — somebody-object positions.
//     Frame 10 ("Something ----s somebody") is deliberately EXCLUDED: its
//     subject is a thing (causative readings — "the tent sleeps four",
//     "the show stays him"), which would smuggle sleep/stay/fall into
//     person-object territory.
//   THING: 8, 11, 15, 16, 19, 21, 31 — something-object positions.
// Known casualties of trusting WordNet here: bend / end / transcend carry
// no somebody-frame, so "bend her" / "end her" / "transcend her" are gated
// out despite being sayable. Accepted — the same trade as the OW2 artifact
// rule's rainbow/elbow: precision for the whole dictionary over a handful
// of edge saves.
//
// The table = WordNet verb LEMMAS  ∪  irregular inflected forms (got, bought,
// caught… — WordNet only lists base forms; each inherits its base lemma's
// mask)  ∪  regularly generated inflections (spots, spotted, spotting —
// inherit their stem's mask), then INTERSECTED with the CMU dictionary so
// only real words survive (drops generated junk like "beed"/"bes").
// Forms reachable from several lemmas (saw = see + saw, found = find +
// found, bore = bear + bore) OR their masks together.
//
// Run:  node scripts/buildMosaicVerbs.mjs   (needs node_modules/wordnet-db)
// Rerun only when upgrading wordnet-db or the irregular list.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import wndb from "wordnet-db";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");

export const PERSON = 1;
export const THING = 2;

const PERSON_FRAMES = new Set([9, 14, 17, 18, 20, 24, 25, 30]);
const THING_FRAMES = new Set([8, 11, 15, 16, 19, 21, 31]);

// Parse WordNet data.verb → Map<lemma, objMask>. Every single-word lemma is
// registered (mask 0 if it has no object frame anywhere). A frame entry's
// w_num scopes it: 00 = every word in the synset, else that 1-based word.
function verbLemmaMasks(text) {
  const masks = new Map();
  const register = (w, bit) => {
    if (!w || w.includes("_")) return;
    const key = w.toLowerCase();
    masks.set(key, (masks.get(key) ?? 0) | bit);
  };
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(" ") || line.startsWith("/")) continue;
    const bar = line.indexOf("|");
    const parts = (bar === -1 ? line : line.slice(0, bar)).trim().split(/\s+/);
    const wCnt = parseInt(parts[3], 16);
    if (Number.isNaN(wCnt)) continue;
    const words = [];
    for (let i = 0; i < wCnt; i += 1) words.push(parts[4 + i * 2]);
    for (const w of words) register(w, 0);
    let idx = 4 + wCnt * 2;
    const pCnt = parseInt(parts[idx], 10);
    idx += 1 + pCnt * 4; // each pointer is 4 tokens
    const fCnt = parseInt(parts[idx], 10);
    idx += 1;
    for (let i = 0; i < fCnt; i += 1) {
      // each frame is "+ f_num w_num"
      const fNum = parseInt(parts[idx + 1], 10);
      const wNum = parseInt(parts[idx + 2], 16);
      idx += 3;
      const bit = PERSON_FRAMES.has(fNum) ? PERSON : THING_FRAMES.has(fNum) ? THING : 0;
      if (!bit) continue;
      for (const w of wNum === 0 ? words : [words[wNum - 1]]) register(w, bit);
    }
  }
  return masks;
}

// Irregular inflected forms (past + participle) → base lemma. WordNet's
// data.verb lists only base lemmas, so without these the BEST mosaics —
// "bought her", "caught her", "got her", "brought them" — get gated out.
// Closed class. The form inherits the base lemma's object mask (OR-ed with
// the form's own lemma mask when the spelling is also a lemma: saw, found,
// ground, felt, bore, wound, bound, lay…).
const IRREGULAR_LEMMA = {
  arose: "arise", awoke: "awake", was: "be", were: "be", been: "be",
  bore: "bear", born: "bear", beat: "beat", became: "become", begun: "begin",
  bent: "bend", bet: "bet", bound: "bind", bit: "bite", bled: "bleed",
  blew: "blow", broke: "break", bred: "breed", brought: "bring",
  built: "build", burnt: "burn", bought: "buy", caught: "catch",
  chose: "choose", clung: "cling", came: "come", cost: "cost",
  crept: "creep", cut: "cut", dealt: "deal", dug: "dig", did: "do",
  done: "do", drew: "draw", drank: "drink", drove: "drive", ate: "eat",
  fell: "fall", fed: "feed", felt: "feel", fought: "fight", found: "find",
  fled: "flee", flew: "fly", forbade: "forbid", forgot: "forget",
  forgave: "forgive", froze: "freeze", got: "get", given: "give",
  went: "go", ground: "grind", grew: "grow", hung: "hang", had: "have",
  heard: "hear", hid: "hide", hit: "hit", held: "hold", hurt: "hurt",
  kept: "keep", knelt: "kneel", knew: "know", laid: "lay", led: "lead",
  leant: "lean", leapt: "leap", learnt: "learn", left: "leave",
  lent: "lend", let: "let", lay: "lie", lit: "light", lost: "lose",
  made: "make", meant: "mean", met: "meet", paid: "pay", put: "put",
  quit: "quit", read: "read", rid: "rid", rode: "ride", rang: "ring",
  rose: "rise", ran: "run", said: "say", saw: "see", sought: "seek",
  sold: "sell", sent: "send", set: "set", sewn: "sew", shook: "shake",
  shed: "shed", shone: "shine", shot: "shoot", showed: "show",
  shrank: "shrink", shut: "shut", sang: "sing", sank: "sink", sat: "sit",
  slept: "sleep", slid: "slide", sown: "sow", spoke: "speak",
  sped: "speed", spelt: "spell", spent: "spend", spat: "spit",
  split: "split", spread: "spread", sprang: "spring", stood: "stand",
  stole: "steal", stuck: "stick", stung: "sting", stank: "stink",
  struck: "strike", swore: "swear", swept: "sweep", swam: "swim",
  swung: "swing", took: "take", taught: "teach", tore: "tear",
  told: "tell", thought: "think", threw: "throw", thrust: "thrust",
  trod: "tread", woke: "wake", wore: "wear", wove: "weave", wept: "weep",
  won: "win", wound: "wind", wrote: "write",
};

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
const verbs = verbLemmaMasks(readFileSync(join(wndb.path, "data.verb"), "utf8"));
console.log(`  ${verbs.size} base verb lemmas`);

for (const [form, base] of Object.entries(IRREGULAR_LEMMA)) {
  const baseMask = verbs.get(base);
  if (baseMask === undefined) throw new Error(`irregular base not a WordNet verb: ${base}`);
  verbs.set(form, (verbs.get(form) ?? 0) | baseMask);
}
for (const [v, mask] of [...verbs]) {
  if (v.length < 2) continue;
  for (const f of regularForms(v)) verbs.set(f, (verbs.get(f) ?? 0) | mask);
}
console.log(`  ${verbs.size} forms after irregulars + regular inflection`);

// Intersect with the CMU dictionary (the universe of possible mosaic heads):
// drops generated junk and shrinks the file to real words only.
const cmu = JSON.parse(readFileSync(join(REPO, "wordlists", "cmu-dict.json"), "utf8"));
const cmuKeys = new Set(Object.keys(cmu).map((w) => w.toLowerCase()));
const kept = [...verbs.keys()].filter((w) => cmuKeys.has(w)).sort();

const outPath = join(REPO, "rhyme-finder", "wordlists", "mosaic-verbs.json");
const json = JSON.stringify(Object.fromEntries(kept.map((w) => [w, verbs.get(w)])));
writeFileSync(outPath, json);
console.log(`\nWrote ${outPath}`);
console.log(`  ${kept.length} verb forms in CMU (${(json.length / 1024).toFixed(1)} KB)`);
const spot = (w) => `${w}=${verbs.has(w) && cmuKeys.has(w) ? verbs.get(w) : "MISSING"}`;
console.log(
  "  spot-check (3=person+thing, 2=thing-only, 0=no object):",
  ["send", "know", "got", "bought", "caught", "thought", "spend", "pretend", "weekend", "tend", "lend"]
    .map(spot)
    .join(" "),
);
