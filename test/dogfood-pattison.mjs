// Dogfood harness — run pairs through the classifier and search results
// through findRhymes, comparing against Pattison's textbook categories.
//
// Usage: node test/dogfood-pattison.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { classifyRhyme } from "../rhyme-finder/src/rhymeClassifier.js";
import { PRONUNCIATION_MAP, normalizePhonemes } from "../rhyme-finder/src/pronunciation.js";

// Node's fetch doesn't yet support file:// URLs, so populate the map directly.
const here = dirname(fileURLToPath(import.meta.url));
const wordlistsDir = join(here, "..", "wordlists");
const dict = JSON.parse(readFileSync(join(wordlistsDir, "cmu-dict.json"), "utf8"));
for (const w in dict) PRONUNCIATION_MAP.set(w, normalizePhonemes(dict[w]).split(" "));
const overrides = JSON.parse(readFileSync(join(wordlistsDir, "cmu-overrides.json"), "utf8"));
for (const w in overrides) {
  if (w.startsWith("_")) continue;
  PRONUNCIATION_MAP.set(w.toLowerCase(), normalizePhonemes(overrides[w]).split(" "));
}

const { findRhymes } = await import("../rhyme-finder/src/rhymeFinder.js");
// Stub fetch for findRhymes' wordlists.
const wnCats = JSON.parse(readFileSync(join(here, "..", "rhyme-finder", "wordlists", "wordnet-categories.json"), "utf8"));
const common = readFileSync(join(here, "..", "rhyme-finder", "wordlists", "common-10k.txt"), "utf8");
const lyricFreq = JSON.parse(readFileSync(join(here, "..", "wordlists", "lyric-frequency.json"), "utf8"));
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = url.toString();
  if (u.endsWith("wordnet-categories.json")) return new Response(JSON.stringify(wnCats));
  if (u.endsWith("common-10k.txt")) return new Response(common);
  if (u.endsWith("lyric-frequency.json")) return new Response(JSON.stringify(lyricFreq));
  return origFetch(url);
};

// pairs: [a, b, expectedType, note]
// expectedType is a Pattison label: perfect | family | additive | subtractive
//                                   | assonance | consonance | identity | mismatched
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
  // Pattison Ch2 p31 calls passion/ashes "sonic connection but not perfect
  // rhyme" — he doesn't put it in any tier of his 5-step scale. With the
  // strict trailing-compatibility rule (Ch6 p86), passion's -on (nasal N)
  // and ashes's -es (fricative Z) have incompatible terminal classes →
  // none. Preserves the principle that feminine pairs need both nucleus
  // family AND terminal class match for any rhyme tier.
  ["passion", "ashes", "none", "[SH] coda match but trailing terminals differ (N nasal vs Z fricative)"],
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

// Pattison Ch4 p63-64 feminine family worksheets (verbatim examples):
await runPairs("Ch4 p63: 'lonely' feminine family — N nasal → M companion", [
  ["lonely", "homely", "family", "Pattison's headline example: N-M companion, -ly trailing"],
]);

await runPairs("Ch4 p64: 'table' feminine family — B plosive → partners + companions", [
  ["table", "maple", "family", "B-P partners (Pattison's first example)"],
  ["table", "ladle", "family", "B-D companions (Pattison's second example)"],
  ["table", "cradle", "family", "B-D companions"],
  ["table", "staple", "family", "B-P partners"],
]);

// =====================================================================
// Feminine rhyme — Pattison's coda-tight analysis:
// ALL consonants between the stressed vowel and the next vowel belong
// to the stressed syllable's coda (no max-onset). His rhyming dictionary
// indexes `table` under "ĀP'l" / "ĀB'l" with B as the closing consonant
// of "tab", and finds family rhymes by substituting partner P → maple.
// Single intervocalic consonants are part of the stressed coda.
// =====================================================================

await runPairs("Feminine perfect — same stressed coda (incl. single intervocalic) + same trailing", [
  ["flying", "crying", "perfect", "[] coda + IH-NG trailing"],
  ["flying", "lying", "perfect"],
  ["flying", "trying", "perfect"],
  ["hiding", "riding", "perfect", "[D] coda + IH-NG trailing"],
  ["hiding", "siding", "perfect"],
  ["happy", "snappy", "perfect", "[P] coda + IY trailing"],
  ["happy", "scrappy", "perfect"],
]);

await runPairs("Feminine family — Pattison textbook examples (stressed coda in family + same trailing)", [
  ["table", "maple", "family", "B-P partners, same -le trailing — Pattison Ch4"],
  ["table", "ladle", "family", "B-D companions"],
  ["lonely", "homely", "family", "N-M companions, same -ly trailing — Pattison Ch4"],
  ["happy", "shabby", "family", "P-B partners, same -y trailing"],
  ["happy", "gabby", "family"],
  ["happy", "catty", "family", "P-T companions"],
  ["hiding", "writing", "family", "D-T partners, same -ing trailing"],
  ["hiding", "fighting", "family"],
  ["hiding", "hiking", "family", "D-K 2-hop plosive family"],
]);

await runPairs("Feminine additive — extra coda consonant + same trailing", [
  // Pattison Ch5: feminine additives still need the trailing as identity.
  // flying (empty coda) + hiding ([D] coda) — the extra D is the additive
  // bit; -ING is the identity. Strong rhyme (s=3), the canonical "fly /
  // hide" feel.
  ["flying", "hiding", "additive", "[] vs [D] + same -ing"],
  ["flying", "riding", "additive"],
  ["flying", "siding", "additive"],
  ["crying", "hiding", "additive"],
]);

// =====================================================================
// Pattison Ch5 p60: feminine additive worksheet for "travel"
// travel = T R AE V AH L (coda=[V], trailing=[AH, L])
// All examples in his worksheet have matching trailings -le/-ful → identity.
// =====================================================================
await runPairs("Ch5 p60: 'travel' feminine family/additive worksheet", [
  ["travel", "dazzle", "family", "V-Z companions (voiced fricatives)"],
  ["travel", "fragile", "family", "V-JH companions"],
  ["travel", "bashful", "additive", "V-F partners + extra SH at front"],
]);

await runPairs("Feminine assonance — strict Pattison: trailing differs → assonance regardless of stressed coda", [
  // Even when the stressed coda is a perfect match, mismatched trailing
  // breaks the foot rhyme — Pattison requires trailing identity for
  // family/perfect tier. Demote to assonance (vowel ring only).
  // flying/quiet now demoted further — both feminine but trailings have
  // incompatible unstressed vowels (IH high-front vs AH schwa). Pattison
  // Ch6 p86 limits feminine assonance to compatible-nucleus pairs.
  ["flying", "quiet", "none", "[] coda match, but IH-NG (high-front) vs AH-T (schwa) — incompatible nuclei"],
  // passion/ashes: both AH schwa nuclei BUT different terminal classes
  // (N nasal vs Z fricative) → falls to none under refined rule.
  ["passion", "ashes", "none", "[SH] coda + AH schwa trailings, but N vs Z terminals incompatible"],
]);

// =====================================================================
// Pattison Ch6 p86-87: feminine assonance worksheet for "lonely"
// lonely = L OW N L IY (coda=[N, L], trail=[IY])
// "Feminine assonance rhymes are usually stronger than masculine assonance
// rhymes ... usually a good perfect rhyme substitute." (p86)
// His worksheet annotates some entries "(subtractive)" — those are
// stronger than pure assonance because codas differ by 1 consonant only.
// =====================================================================
await runPairs("Ch6 p86-87: 'lonely' feminine assonance worksheet — unrelated codas", [
  // True assonance: codas can't be aligned in any family relation
  ["lonely", "voting", "assonance", "coda [T] vs [N L] — unrelated"],
  ["lonely", "smokey", "assonance", "coda [K] vs [N L] — unrelated"],
  ["lonely", "coldly", "assonance", "coda [L D L] vs [N L] — unrelated"],
  ["lonely", "boldly", "assonance"],
  ["lonely", "ghostly", "assonance"],
  ["lonely", "anchovy", "assonance", "coda [V] vs [N L] — unrelated"],
  ["lonely", "trophy", "assonance", "coda [F] vs [N L]"],
  ["lonely", "yogi", "assonance", "coda [G] vs [N L]"],
  ["lonely", "dopey", "assonance", "coda [P] vs [N L]"],
  ["lonely", "pokey", "assonance", "coda [K] vs [N L]"],
  ["lonely", "nosy", "assonance", "coda [Z] vs [N L]"],
  ["lonely", "approaching", "assonance"],
  ["lonely", "probing", "assonance"],
  ["lonely", "foreboding", "assonance"],
  ["lonely", "imposing", "assonance"],
  ["lonely", "consoling", "assonance"],
  ["lonely", "hoping", "assonance"],
]);

await runPairs("Ch6 p87: 'lonely' worksheet — items Pattison annotates '(subtractive)'", [
  // Per Pattison's annotation: codas differ by 1+ consonant + matching
  // trailing. Classifier returns 'subtractive' when wordA (lonely) has
  // the extra consonants — i.e., subtracting from lonely yields the partner.
  // These appear in the Ch6 assonance chapter only because they share the
  // long-O vowel, but the structure is tighter than pure assonance.
  ["lonely", "holy", "subtractive", "coda [N L] vs [L]: drop N → matching [IY] trailing"],
  ["lonely", "lowly", "subtractive", "same as holy"],
  ["lonely", "slowly", "subtractive"],
  ["lonely", "snowy", "subtractive", "coda [N L] vs [] = drop 2 cons; matching [IY] trailing"],
  ["lonely", "solely", "subtractive", "with override: solely = S OW1 L IY0; drop N to match"],
  // alimony rhyme anchors on its SECONDARY stress (OW2), not primary (AE1) —
  // Pattison treats this as long-O. Codas [N L] vs [N], drop L, trailing matches.
  ["lonely", "alimony", "subtractive", "OW2 secondary stress; codas [N L] vs [N] drop L"],
]);

// =====================================================================
// Pattison Ch6 p88: feminine consonance examples — different stressed
// vowels but the trailing extends resolution.
// =====================================================================
await runPairs("Ch6 p88: feminine consonance examples", [
  ["cramming", "teeming", "consonance", "AE vs IY, both [M] coda + same -ing trailing"],
  ["rubber", "fibber", "consonance", "AH vs IH, both [B] coda + same -er trailing"],
]);

// =====================================================================
// Feminine consonance extension: vowels differ + trailing identity +
// stressed coda has additive-with-family-base relation. Pattison's tight
// examples (cramming/teeming, rubber/fibber) have IDENTICAL stressed
// codas. We extend to cases where the stressed coda differs by one
// consonant + the bases are partners/companions — the trailing identity
// (-le, -er, etc.) carries the rhyme.
// =====================================================================
await runPairs("Feminine consonance extension — vowels differ, codas additive-with-family, trailing matches", [
  ["table", "simple", "consonance", "EY vs IH, B vs MP (B-P partners + extra M), same -le trailing"],
  ["table", "temple", "consonance", "EY vs EH, B vs MP, same -le"],
  ["table", "ample", "consonance", "EY vs AE, same pattern"],
  ["table", "dimple", "consonance"],
  ["table", "sample", "consonance"],
  ["table", "apple", "consonance", "EY vs AE, B vs P partners (no extra), same -le"],
]);

await runPairs("Counter-examples: feminine consonance still rejects incompatible terminals", [
  // These have vowel mismatch but trailings have INCOMPATIBLE terminals
  // (different broad classes). Even with the relaxed feminine rule, the
  // trailing identity check rejects them.
  ["table", "agent", "none", "schwa+L (liquid) vs schwa+T (plosive)"],
  ["table", "ancient", "none", "schwa+L vs schwa+T"],
  ["table", "broken", "none", "schwa+L vs schwa+N (different terminals)"],
  ["lonely", "tunnel", "none", "high-front IY-final vs schwa+L"],
  ["lonely", "final", "none", "high-front IY-final vs schwa+L"],
]);

// =====================================================================
// Stability tiers within assonance (Pattison Ch6 p86):
//   masc assonance (s=2)
//   fem assonance, trailing differs (s=2 — no identity boost)
//   fem assonance, trailing matches (s=3 — "good perfect rhyme substitute")
// The trailing-as-identity is what extends resolution per Ch1 p20.
// =====================================================================
async function checkAssonanceStability(a, b, expectedStability, note) {
  const { classifyRhyme } = await import("../rhyme-finder/src/rhymeClassifier.js");
  const cls = classifyRhyme(a, b);
  const ok = cls.type === "assonance" && cls.stability === expectedStability;
  console.log(
    `${ok ? "✓" : "✗"} ${a} / ${b}: ${cls.type} s=${cls.stability}` +
    (ok ? "" : ` (expected: assonance s=${expectedStability})`) +
    (note ? ` — ${note}` : "")
  );
}

console.log("\n=== Ch6 p86: assonance stability — masculine vs feminine vs feminine+identity ===");
// Masculine assonance (Pattison's own examples) — s=2
await checkAssonanceStability("love", "hunt", 2, "masculine — no trailing extension");
await checkAssonanceStability("tide", "afterlife", 2, "masculine");
await checkAssonanceStability("tide", "rise", 2, "masculine");

// Feminine assonance with matching trailing — s=3, "perfect rhyme substitute"
await checkAssonanceStability("lonely", "anchovy", 3, "fem + same -y trailing");
await checkAssonanceStability("lonely", "coldly", 3, "fem + same -ly trailing");
await checkAssonanceStability("lonely", "boldly", 3, "fem + same -ly");
await checkAssonanceStability("lonely", "ghostly", 3, "fem + same -ly");
await checkAssonanceStability("lonely", "smokey", 3, "fem + same -y");
await checkAssonanceStability("lonely", "trophy", 3, "fem + same -y");

// Feminine assonance with different trailing but COMPATIBLE nuclei → s=2
// (Pattison Ch6 p86 explicitly includes -ing endings in the lonely worksheet:
// IY/IH are both high-front, so the foot still binds.)
await checkAssonanceStability("lonely", "voting", 2, "fem -ly (IY) vs -ing (IH) — both high-front");
await checkAssonanceStability("lonely", "hoping", 2, "fem -ly vs -ing");
await checkAssonanceStability("lonely", "approaching", 2, "fem -ly vs -ing");

// Counter-examples: feminine with INCOMPATIBLE trailing nuclei → none
async function checkNone(a, b, note) {
  const { classifyRhyme } = await import("../rhyme-finder/src/rhymeClassifier.js");
  const cls = classifyRhyme(a, b);
  const ok = cls.type === "none";
  console.log(
    `${ok ? "✓" : "✗"} ${a} / ${b}: ${cls.type} s=${cls.stability}` +
    (ok ? "" : ` (expected none)`) +
    (note ? ` — ${note}` : "")
  );
}
console.log("\n=== Ch6 p86: feminine assonance requires compatible trailing nuclei + terminals ===");
// Cross-nucleus rejections (different vowel families)
await checkNone("flying", "quiet", "IH-NG (high-front) vs AH-T (schwa)");
await checkNone("lonely", "broken", "IY (high-front) vs AH-N (schwa)");
await checkNone("lonely", "lonesome", "IY vs AH-M (schwa)");
// Same-nucleus, different-terminal-class rejections (Ch6 p86 refinement)
await checkNone("table", "agent", "both schwa, but L (liquid) vs T (plosive)");
await checkNone("table", "ancient", "schwa+L (liquid) vs schwa+T (plosive)");
await checkNone("passion", "ashes", "schwa+N (nasal) vs schwa+Z (fricative)");
await checkNone("lonely", "over", "IY vs ER (rhotic)");
await checkNone("lonely", "golden", "IY vs AH-N (schwa)");
await checkNone("lonely", "frozen", "IY vs AH-N (schwa)");
await checkNone("lonely", "ocean", "IY vs AH-N (schwa)");

// =====================================================================
// Identity — masculine word fully echoed inside a feminine word:
// command/commanding, land/landing. Per Pattison's coda-tight analysis,
// command and commanding share the same stressed syllable (M-AE-N-D);
// commanding only adds an unstressed -ING trailing. The ear hears
// repetition, not tension. sameStressedSyllable (Route A) catches this.
// =====================================================================

await runPairs("Identity: masculine + appended unstressed syllable", [
  ["command", "commanding", "identity", "command echoed + -ing"],
  ["land", "landing", "identity"],
  ["scare", "scaring", "identity"],
  ["sing", "singing", "identity"],
  ["love", "loving", "identity"],
]);

// Negative cases — matching phoneme tails BUT same syllable count, so
// these are real rhymes (different stressed onsets), not identity.
await runPairs("Identity: NOT identity when syllable counts match (these are real rhymes)", [
  ["scare", "care", "perfect", "same 1 syllable, different onset"],
  ["place", "ace", "perfect"],
  ["spice", "ice", "perfect"],
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

// Note: this older lonely-assonance section is superseded by the more detailed
// Ch6 worksheets above. Keeping just non-duplicate entries here as redundant
// regression coverage; solely moved to the subtractive list (see above).

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

await runPairs("Ch4 p47-48: friend/wind / been/wind / him/wind — Zevon's 'Hasten Down the Wind'", [
  // friend = F-R-EH-N-D; wind = W-IH-N-D. Different vowels, same [N D] coda.
  // Pattison p47: "The consonance rhyme 'friend/wind' leaves us hanging."
  ["friend", "wind", "consonance", "Pattison's canonical consonance example"],
  // been = B-IH-N; wind = W-IH-N-D. Same IH vowel, codas [N] vs [N D] = additive.
  // Pattison p48: been/wind feels resolved "like the perfect rhyme" (because the
  // additive D is barely noticeable after the held N). Strict 5-step scale: additive.
  ["been", "wind", "additive", "p48: feels like perfect rhyme; strictly: same vowel + extra D"],
  // him = HH-IH-M; wind = W-IH-N-D. Same IH vowel, codas [M] vs [N D].
  // Pattison p48: "family rhyme, which is muddied slightly by the addition of 'd'".
  // M-N companions (nasals) + extra D = family-with-additive. 5-step: additive.
  ["him", "wind", "additive", "p48: family-with-extra-D; M-N companions + D"],
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
// CHAPTER 6 (cont) — Masculine ↔ feminine mismatch
// =====================================================================
// A masculine word paired with the stressed syllable of a feminine one
// (Pattison's "apocopated" examples from Ric Ocasek / Michael Jackson).
// The stressed syllables ring, but the feminine trailing dangles and the
// line-ends fall on different beats — so we classify these as mismatched
// non-rhymes and never surface them (see rhymeClassifier's mas/fem block).

await runPairs("Ch6: mas/fem mismatches (classified, not surfaced)", [
  ["moving", "you", "mismatched", "Ric Ocasek 'Why Can't I Have You'"],
  ["striking", "night", "mismatched", "Ocasek again"],
  ["lover", "one", "mismatched", "Michael Jackson 'Billie Jean'"],
  ["closing", "rose", "mismatched"],
  ["like", "hiking", "mismatched"],
  ["steamer", "cream", "mismatched"],
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




