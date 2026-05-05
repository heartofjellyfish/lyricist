// Dogfood harness — run pairs through the classifier and search results
// through findRhymes, comparing against Pattison's textbook categories.
//
// Usage: node test/dogfood-pattison.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { classifyRhyme } from "../rhyme-finder/src/rhymeClassifier.js";
import { PRONUNCIATION_MAP } from "../rhyme-finder/src/pronunciation.js";

// Node's fetch doesn't yet support file:// URLs, so populate the map directly.
const here = dirname(fileURLToPath(import.meta.url));
const wordlistsDir = join(here, "..", "wordlists");
const dict = JSON.parse(readFileSync(join(wordlistsDir, "cmu-dict.json"), "utf8"));
for (const w in dict) PRONUNCIATION_MAP.set(w, dict[w].split(" "));
const overrides = JSON.parse(readFileSync(join(wordlistsDir, "cmu-overrides.json"), "utf8"));
for (const w in overrides) {
  if (w.startsWith("_")) continue;
  PRONUNCIATION_MAP.set(w.toLowerCase(), overrides[w].split(" "));
}

const { findRhymes } = await import("../rhyme-finder/src/rhymeFinder.js");
// Stub fetch for findRhymes' wordlists (wordnet + common-10k).
const wordnet = JSON.parse(readFileSync(join(here, "..", "rhyme-finder", "wordlists", "wordnet-words.json"), "utf8"));
const common = readFileSync(join(here, "..", "rhyme-finder", "wordlists", "common-10k.txt"), "utf8");
const lyricFreq = JSON.parse(readFileSync(join(here, "..", "wordlists", "lyric-frequency.json"), "utf8"));
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = url.toString();
  if (u.endsWith("wordnet-words.json")) return new Response(JSON.stringify(wordnet));
  if (u.endsWith("common-10k.txt")) return new Response(common);
  if (u.endsWith("lyric-frequency.json")) return new Response(JSON.stringify(lyricFreq));
  return origFetch(url);
};

// pairs: [a, b, expectedType, note]
// expectedType is a Pattison label: perfect | family | additive | subtractive
//                                   | assonance | consonance | partial | identity
export async function runPairs(label, pairs) {
  console.log(`\n=== ${label} ===`);
  for (const [a, b, expected, note] of pairs) {
    const cls = classifyRhyme(a, b);
    const ok = cls.type === expected;
    const flag = ok ? "✓" : "✗";
    const extra = cls.type === expected ? "" : ` (book says: ${expected})`;
    const muted = note ? ` — ${note}` : "";
    console.log(
      `${flag} ${a} / ${b}: ${cls.type}${extra}` +
      `  [s=${cls.stability}${cls.codaRelation ? ", " + cls.codaRelation.relation : ""}]${muted}`
    );
  }
}

// findIn: does `target` appear in any bucket of findRhymes(source)?
export async function checkFindContains(source, target, expectedBucket) {
  const { buckets } = await findRhymes({ word: source, perBucket: 200 });
  const found = [];
  for (const [type, list] of Object.entries(buckets)) {
    if (list.some((e) => e.word === target.toLowerCase())) {
      found.push(type);
    }
  }
  const ok = found.includes(expectedBucket);
  console.log(
    `${ok ? "✓" : "✗"} findRhymes("${source}") contains "${target}" in [${found.join(", ") || "—"}]` +
    (ok ? "" : `  (expected ${expectedBucket})`)
  );
}

// Run from CLI args if provided
const args = process.argv.slice(2);
if (args.length === 2) {
  console.log(JSON.stringify(classifyRhyme(args[0], args[1]), null, 2));
  process.exit(0);
}

// =====================================================================
// CHAPTER 1 — Perfect rhyme, identity, masculine vs feminine
// =====================================================================

await runPairs("Ch1: Perfect rhyme — basic", [
  ["wear", "pair", "perfect", "Pattison's first illustration"],
  ["disagree", "referee", "perfect", "syllables ending in vowels"],
  ["go", "go", "identity", "cheerleader yell — repetition not rhyme"],
]);

await runPairs("Ch1: Identity (NOT a rhyme per Pattison)", [
  ["fuse", "confuse", "identity"],
  ["peace", "piece", "identity", "homophones"],
  ["lease", "police", "identity", "police contains 'lease'"],
  ["place", "replace", "identity"],
  ["place", "birthplace", "identity"],
  ["place", "commonplace", "identity"],
  ["place", "misplace", "identity"],
]);

await runPairs("Ch1: list 2 — real perfect rhymes against /place/", [
  ["place", "ace", "perfect"],
  ["place", "brace", "perfect"],
  ["place", "chase", "perfect"],
  ["place", "erase", "perfect"],
  ["place", "face", "perfect"],
  ["place", "disgrace", "perfect"],
]);

await runPairs("Ch1: Masculine perfect rhymes (-and family)", [
  ["command", "land", "perfect"],
  ["command", "understand", "perfect"],
  ["command", "expand", "perfect"],
  ["command", "strand", "perfect"],
]);

await runPairs("Ch1: Feminine perfect rhymes (-anding family)", [
  ["commanding", "landing", "perfect"],
  ["commanding", "understanding", "perfect"],
  ["commanding", "expanding", "perfect"],
  ["commanding", "stranding", "perfect"],
]);

await runPairs("Ch1: masculine vs feminine should not pair (mismatched)", [
  ["command", "commanding", "identity", "command is suffix of commanding"],
  ["land", "landing", "identity", "land is suffix of landing"],
]);

await runPairs("Ch1: Mosaic / secondary stress (appreciate)", [
  ["appreciate", "fate", "perfect", "treating /-ate/ as masculine 1-syllable rhyme"],
  ["appreciate", "relate", "perfect"],
  ["appreciate", "navigate", "perfect", "secondary-stress -ate match"],
  ["appreciate", "compensate", "perfect"],
]);

console.log("\n--- findRhymes coverage spot checks ---");
await checkFindContains("attack", "back", "perfect");
await checkFindContains("attack", "crack", "perfect");
await checkFindContains("attack", "haystack", "perfect");
await checkFindContains("attack", "almanac", "perfect");
await checkFindContains("attack", "egomaniac", "perfect");
await checkFindContains("attack", "kleptomaniac", "perfect");
await checkFindContains("attack", "tack", "identity");

// =====================================================================
// CHAPTER 2-3 — Worksheet examples
// =====================================================================

await runPairs("Ch2-3: worksheet for 'scare'", [
  ["scare", "affair", "perfect"],
  ["scare", "unaware", "perfect"],
  ["scare", "care", "perfect"],
  ["scare", "fair", "perfect"],
  ["scare", "glare", "perfect"],
  ["scare", "prayer", "perfect"],
  ["scare", "unfair", "perfect"],
]);

await runPairs("Ch2-3: worksheet for 'afraid'", [
  ["afraid", "charade", "perfect"],
  ["afraid", "fade", "perfect"],
  ["afraid", "grade", "perfect"],
  ["afraid", "masquerade", "perfect"],
  ["afraid", "parade", "perfect"],
  ["afraid", "promenade", "perfect"],
]);

await runPairs("Ch2-3: worksheet for 'flirt'", [
  ["flirt", "alert", "perfect"],
  ["flirt", "dessert", "perfect"],
  ["flirt", "dirt", "perfect"],
  ["flirt", "hurt", "perfect"],
  ["flirt", "inert", "perfect"],
  ["flirt", "introvert", "perfect"],
  ["flirt", "shirt", "perfect"],
  ["flirt", "skirt", "perfect"],
]);

await runPairs("Ch2-3: worksheet for 'attention' (Pattison flags some as Identity)", [
  ["attention", "apprehension", "perfect"],
  ["attention", "convention", "perfect"],
  ["attention", "detention", "identity", "Pattison flags as Identity"],
  ["attention", "intention", "identity", "Pattison flags as Identity"],
  ["attention", "invention", "perfect"],
  ["attention", "pretention", "identity", "Pattison flags as Identity"],
  ["attention", "suspension", "perfect"],
  ["attention", "tension", "identity", "Pattison flags as Identity"],
]);

await runPairs("Ch2-3: passion/ashes — 'sonic connection but not perfect'", [
  ["passion", "ashes", "family", "feminine, vowel match, fricatives related (SH same, N vs Z+trailing)"],
]);

await runPairs("Ch2-3: net/duet, choke/baroque, lice/price, dark/mark, trees/knees", [
  ["net", "duet", "perfect"],
  ["choke", "baroque", "perfect"],
  ["lice", "price", "perfect"],
  ["dark", "mark", "perfect"],
  ["trees", "knees", "perfect"],
]);

// =====================================================================
// CHAPTER 4 — Family rhyme (THE big chapter for the tool)
// =====================================================================

await runPairs("Ch4: 'rut' family — partner D (closest plosive)", [
  ["rut", "blood", "family"],
  ["rut", "flood", "family"],
  ["rut", "mud", "family"],
  ["rut", "thud", "family"],
]);

await runPairs("Ch4: 'rut' family — companions (K, P, same voicing as T)", [
  ["rut", "buck", "family", "T-K companion"],
  ["rut", "duck", "family"],
  ["rut", "luck", "family"],
  ["rut", "muck", "family"],
  ["rut", "stuck", "family"],
  ["rut", "truck", "family"],
  ["rut", "up", "family", "T-P companion"],
]);

await runPairs("Ch4: 'rut' family — partner-then-companion (B, G — 2 hops away)", [
  ["rut", "club", "family", "T→D partner→B companion: still in plosive family per Pattison"],
  ["rut", "hub", "family"],
  ["rut", "pub", "family"],
  ["rut", "scrub", "family"],
  ["rut", "tub", "family"],
  ["rut", "bug", "family"],
  ["rut", "jug", "family"],
  ["rut", "lug", "family"],
  ["rut", "plug", "family"],
  ["rut", "shrug", "family"],
  ["rut", "snug", "family"],
  ["rut", "tug", "family"],
]);

await runPairs("Ch4: 'safe' family — fricatives", [
  ["safe", "behave", "family", "F-V partner"],
  ["safe", "brave", "family"],
  ["safe", "cave", "family"],
  ["safe", "grave", "family"],
  ["safe", "shave", "family"],
  ["safe", "slave", "family"],
  ["safe", "wave", "family"],
  ["safe", "bathe", "family", "F-DH (partner V then companion DH = 2 hops)"],
  ["safe", "blaze", "family", "F-Z companion (both fricatives, but F unvoiced / Z voiced)"],
  ["safe", "craze", "family"],
  ["safe", "daze", "family"],
  ["safe", "haze", "family"],
  ["safe", "maze", "family"],
  ["safe", "phrase", "family"],
  ["safe", "praise", "family"],
  ["safe", "age", "family", "F-JH (partner V→companion JH = 2 hops)"],
  ["safe", "cage", "family"],
  ["safe", "page", "family"],
  ["safe", "rage", "family"],
  ["safe", "stage", "family"],
  ["safe", "faith", "family", "F-TH companion (both unvoiced fricatives)"],
]);

await runPairs("Ch4: 'home' family — nasals (m→n companion)", [
  ["home", "blown", "family"],
  ["home", "bone", "family"],
  ["home", "grown", "family"],
  ["home", "throne", "family"],
  ["home", "zone", "family"],
]);

await runPairs("Ch4: 'home' / 'alone' — Pattison: cliché but perfect rhyme territory", [
  ["home", "alone", "family", "M-N companion nasal"],
]);

await runPairs("Ch4: 'hurt' family — t→d partner", [
  ["hurt", "absurd", "family"],
  ["hurt", "stirred", "family"],
  ["hurt", "word", "family"],
  ["hurt", "blurred", "family"],
  ["hurt", "preferred", "family"],
  ["hurt", "burp", "family", "t→p companion"],
  ["hurt", "twerp", "family"],
  ["hurt", "curb", "family", "t→b: 2-hop plosive family"],
  ["hurt", "suburb", "family"],
  ["hurt", "iceberg", "family", "t→g: 2-hop plosive family"],
]);

await runPairs("Ch4: 'help' family (l+p coda)", [
  ["help", "weld", "family", "L same, P→D 2-hop plosive family"],
  ["help", "compelled", "family"],
  ["help", "propelled", "family"],
  ["help", "quelled", "family"],
  ["help", "shelled", "family"],
  ["help", "felt", "family", "L same, P→T companion"],
  ["help", "melt", "family"],
]);

await runPairs("Ch4: feminine family — 'lonely' / 'homely'", [
  ["lonely", "homely", "family", "Stressed N-M companion, trailing -ly identity"],
]);

await runPairs("Ch4: feminine family — 'table' / 'maple', 'ladle'", [
  ["table", "maple", "family", "B-P partner, trailing -le"],
  ["table", "ladle", "family", "B-D companion"],
]);

console.log("\n--- findRhymes coverage for Ch 4 ---");
await checkFindContains("rut", "mud", "family");
await checkFindContains("rut", "luck", "family");
await checkFindContains("rut", "scrub", "family");
await checkFindContains("rut", "snug", "family");
await checkFindContains("safe", "wave", "family");
await checkFindContains("safe", "haze", "family");
await checkFindContains("safe", "page", "family");
await checkFindContains("safe", "faith", "family");
await checkFindContains("home", "bone", "family");
await checkFindContains("home", "alone", "family");
await checkFindContains("hurt", "word", "family");
await checkFindContains("hurt", "iceberg", "family");
await checkFindContains("help", "weld", "family");
await checkFindContains("help", "melt", "family");

// =====================================================================
// CHAPTER 5 — Additive / Subtractive rhyme
// =====================================================================

await runPairs("Ch5: 'free' additive (vowel-ending source + extra consonant)", [
  ["free", "bleed", "additive", "+d voiced plosive"],
  ["free", "greed", "additive"],
  ["free", "speed", "additive"],
  ["free", "seed", "additive"],
  ["free", "deep", "additive", "+p unvoiced plosive"],
  ["free", "asleep", "additive"],
  ["free", "cheap", "additive"],
  ["free", "weep", "additive"],
  ["free", "deceit", "additive", "+t"],
  ["free", "elite", "additive"],
  ["free", "bleak", "additive", "+k"],
  ["free", "speak", "additive"],
  ["free", "weak", "additive"],
  ["free", "belief", "additive", "+f voiceless fricative"],
  ["free", "relief", "additive"],
  ["free", "thief", "additive"],
  ["free", "peace", "additive", "+s"],
  ["free", "release", "additive"],
  ["free", "trees", "additive", "+z"],
]);

await runPairs("Ch5: 'scar' additive after r — 'l/r carry so much weight'", [
  ["scar", "heart", "additive"],
  ["scar", "dark", "additive"],
  ["scar", "tarred", "additive"],
  ["scar", "guard", "additive"],
  ["scar", "charge", "additive"],
  ["scar", "hearth", "additive"],
]);

await runPairs("Ch5: 'Jezebel' additive after l", [
  ["Jezebel", "help", "additive"],
  ["Jezebel", "knelt", "additive"],
  ["Jezebel", "svelte", "additive"],
  ["Jezebel", "wealth", "additive"],
  ["Jezebel", "weld", "additive"],
]);

await runPairs("Ch5: family additives — extra consonant inside a family swap", [
  ["condemn", "defend", "additive", "M (nasal) ~ N (nasal) family + extra D"],
  ["love", "bluffs", "additive", "V~F partner + extra S"],
  ["trip", "risk", "additive", "P~K companion + extra S"],
  ["ache", "saint", "additive", "K~T companion + extra N"],
]);

await runPairs("Ch5: 'fast' subtractive — drop one consonant", [
  ["fast", "class", "subtractive", "as = fast minus T"],
  ["fast", "mass", "subtractive"],
  ["fast", "lass", "subtractive"],
  ["fast", "pass", "subtractive"],
  ["fast", "brat", "subtractive", "at = fast minus S"],
  ["fast", "aristocrat", "subtractive"],
]);

await runPairs("Ch5: 'fast' family-with-subtraction (T family + drop S)", [
  ["fast", "dash", "subtractive", "ash = subst T→SH (not direct family — fricative cross-axis), drop S"],
  ["fast", "wrath", "subtractive"],
  ["fast", "laugh", "subtractive"],
]);

// =====================================================================
// CHAPTER 6 — Assonance / Consonance / Partial
// =====================================================================

await runPairs("Ch6: assonance — vowel match, unrelated codas", [
  ["love", "hunt", "assonance"],
  ["tide", "afterlife", "assonance", "tide ends T, afterlife ends F"],
  ["tide", "climb", "assonance"],
  ["tide", "brine", "assonance"],
  ["tide", "rise", "assonance"],
  ["tide", "survive", "assonance"],
]);

await runPairs("Ch6: feminine assonance for 'lonely' (long-O + identity tail)", [
  ["lonely", "solely", "assonance", "long O, unrelated coda after stressed syll"],
  ["lonely", "smokey", "assonance"],
  ["lonely", "coldly", "assonance"],
  ["lonely", "boldly", "assonance"],
  ["lonely", "ghostly", "assonance"],
  ["lonely", "anchovy", "assonance"],
  ["lonely", "voting", "assonance"],
  ["lonely", "trophy", "assonance"],
  ["lonely", "yogi", "assonance"],
]);

await runPairs("Ch6: consonance — different vowels, same coda", [
  ["save", "leave", "consonance"],
  ["sin", "won", "consonance"],
  ["word", "card", "consonance"],
  ["love", "grave", "consonance"],
  ["love", "have", "consonance"],
  ["love", "thrive", "consonance"],
  ["love", "forgive", "consonance"],
  ["love", "rove", "consonance"],
  ["love", "groove", "consonance"],
]);

await runPairs("Ch6: feminine consonance", [
  ["cramming", "teeming", "consonance"],
  ["rubber", "fibber", "consonance"],
]);

await runPairs("Ch6: masculine consonance with R/L (held coda)", [
  ["scare", "fear", "consonance"],
  ["pull", "fall", "consonance"],
  ["snarl", "curl", "consonance"],
]);

await runPairs("Ch6: masculine consonance multi-coda", [
  ["ranch", "lynch", "consonance"],
  ["fast", "rest", "consonance"],
  ["crypt", "slept", "consonance"],
]);

await runPairs("Ch6: nasal consonance (held nasal)", [
  ["stun", "ran", "consonance"],
  ["came", "scream", "consonance"],
  ["song", "ring", "consonance"],
]);

await runPairs("Ch6: voiced-fricative consonance", [
  ["grave", "reprieve", "consonance"],
  ["rage", "badge", "consonance"],
  ["cause", "whiz", "consonance"],
]);

await runPairs("Ch6: friend/wind from Zevon (Pattison's introducing example)", [
  ["friend", "wind", "family", "M ~ N companion + additive D? Actually: friend=N D, wind=N D — wait same coda"],
  ["been", "wind", "consonance", "different vowels, both N+D coda"],
  ["him", "wind", "family", "stressed coda M vs N D — M companion N + extra D = additive"],
]);

console.log("\n--- findRhymes coverage for Ch 5–6 ---");
await checkFindContains("free", "bleed", "additive");
await checkFindContains("free", "deep", "additive");
await checkFindContains("free", "trees", "additive");
await checkFindContains("free", "thief", "additive");
await checkFindContains("scar", "heart", "additive");
await checkFindContains("scar", "dark", "additive");
await checkFindContains("fast", "class", "subtractive");
await checkFindContains("fast", "brat", "subtractive");
await checkFindContains("tide", "climb", "assonance");
await checkFindContains("tide", "rise", "assonance");
await checkFindContains("love", "leave", "consonance");
await checkFindContains("love", "thrive", "consonance");
await checkFindContains("save", "leave", "consonance");

// =====================================================================
// CHAPTER 6 (cont) — Partial rhyme
// =====================================================================
// Partial rhyme = masculine paired with the stressed syllable of feminine.
// Pattison's examples from Ric Ocasek and Michael Jackson:

await runPairs("Ch6: partial rhymes (mas + fem stressed syll)", [
  ["moving", "you", "partial", "Ric Ocasek 'Why Can't I Have You'"],
  ["striking", "night", "partial", "Ocasek again"],
  ["lover", "one", "partial", "Michael Jackson 'Billie Jean'"],
  ["closing", "rose", "partial"],
  ["like", "hiking", "partial"],
  ["steamer", "cream", "partial"],
]);

// =====================================================================
// CHAPTER 7 — "Risky Business" complete rhyme search worksheet
// These are Pattison's gold-standard candidate lists.
// =====================================================================

await runPairs("Ch7: 'afraid' family — 2-hop plosive cases", [
  ["afraid", "bait", "family", "D-T partner"],
  ["afraid", "fate", "family"],
  ["afraid", "vague", "family", "D-G companion"],
  ["afraid", "break", "family", "D-K 2-hop (partner T → companion K) — Pattison includes"],
  ["afraid", "awake", "family"],
  ["afraid", "earthquake", "family"],
  ["afraid", "heartache", "family"],
  ["afraid", "rattlesnake", "family"],
]);

await runPairs("Ch7: 'flirt' (T+ER) family + assonance", [
  ["flirt", "absurd", "family", "T-D partner"],
  ["flirt", "word", "family"],
  ["flirt", "work", "family", "T-K companion"],
  ["flirt", "jerk", "family"],
  ["flirt", "curb", "family", "T-B 2-hop"],
  ["flirt", "disturb", "family"],
  ["flirt", "superb", "family"],
  ["flirt", "iceberg", "family", "T-G 2-hop"],
  ["flirt", "blur", "subtractive", "drop T"],
  ["flirt", "stir", "subtractive"],
  ["flirt", "thirst", "additive", "extra S before T"],
  ["flirt", "burst", "additive"],
  ["flirt", "worst", "additive"],
  ["flirt", "church", "assonance", "T(plosive) vs CH(fricative) — different families"],
  ["flirt", "verge", "assonance"],
  ["flirt", "nerve", "assonance"],
]);

await runPairs("Ch7: 'risk' (S+K) family", [
  ["risk", "fist", "family", "K-T companion + same S"],
  ["risk", "mist", "family"],
  ["risk", "wisp", "family", "K-P companion"],
  ["risk", "bliss", "subtractive", "drop K"],
  ["risk", "abyss", "subtractive"],
  ["risk", "quick", "subtractive", "drop S"],
  ["risk", "trick", "subtractive"],
  ["risk", "kicks", "subtractive"],
]);

await runPairs("Ch7: 'leave' (V) family — fricatives", [
  ["leave", "breathe", "family", "V-DH companion"],
  ["leave", "seethe", "family"],
  ["leave", "freeze", "family", "V-Z companion"],
  ["leave", "please", "family"],
  ["leave", "appeased", "family"],
  ["leave", "prestige", "family", "V-ZH companion"],
  ["leave", "relief", "family", "V-F partner"],
  ["leave", "grief", "family"],
  ["leave", "thief", "family"],
  ["leave", "teeth", "family", "V-TH 2-hop"],
  ["leave", "peace", "family", "V-S 2-hop"],
  ["leave", "beach", "family", "V-CH 2-hop"],
  ["leave", "police", "identity", "Pattison flags as Identity — leave/police"],
  ["leave", "knees", "subtractive", "drop V"],
  ["leave", "degrees", "subtractive"],
]);

console.log("\n--- findRhymes coverage for Ch 7 ---");
await checkFindContains("afraid", "fate", "family");
await checkFindContains("afraid", "break", "family");
await checkFindContains("flirt", "work", "family");
await checkFindContains("flirt", "iceberg", "family");
await checkFindContains("leave", "thief", "family");
await checkFindContains("leave", "teeth", "family");
await checkFindContains("leave", "knees", "subtractive");




