// Build wordlists/cmu-dict.json: the raw CMU dictionary from the npm
// package PLUS synthesized regular inflections (-s/-es, -ed, -ing) for
// stems CMU covers but whose inflected form it lacks.
//
// Why: CMU 0.7b's inflection coverage is spotty — it has "furl" missing
// entirely and "cream" without "creaming", so rhyme-finder's recall on
// regular inflections trailed RhymeZone (world → furled, dreaming →
// creaming). Regular inflections are fully predictable from the stem:
//
//   -ed   →  IH0 D after T/D;  T after voiceless;  D after voiced
//   -s/es →  IH0 Z after sibilants;  S after voiceless;  Z after voiced
//   -ing  →  IH0 NG
//
// Junk control (no "informationed", no "runned"):
//   • POS gate — -ed/-ing only for WordNet verb lemmas; -s for verb
//     lemmas or nouns categorized common/science in wordnet-categories
//     (person/place nouns would spawn plural surnames).
//   • Irregular block — hardcoded irregular-verb/-noun lemma lists,
//     matched by endsWith so prefixed compounds (outrun, forefoot) are
//     covered. Over-blocking is free: every high-frequency regular form
//     is already a native CMU entry, and generation never overwrites one.
//   • Attestation fallback — a form present in wordnet-categories.json
//     or common-10k.txt is generated even without the POS gate (burled
//     is a WordNet entry but "burl" is only a noun).
//
// Stems are looked up through cmu-overrides.json first: overrides both
// patch wrong CMU entries and ADD missing stems (furl, purl), and a
// synthesized inflection must build on the corrected phonemes — the
// load-time override application never reaches the derived entry.
//
// Native CMU entries are never overwritten, and synthesis never chains
// (inflections of inflections). Rerun after editing overrides or when
// upgrading the npm package.

import { dictionary } from "cmu-pronouncing-dictionary";
import wndb from "wordnet-db";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── 1. Base dict from the npm package ───────────────────────────────
// Filter to lowercase entries (drop variant pronunciations like "word(2)"
// since pronunciation.js's normalizer already collapses them — we keep
// the first pronunciation found per normalized word).
const out = {};
for (const [rawWord, phonemes] of Object.entries(dictionary)) {
  const normalized = rawWord.toLowerCase().replace(/\(\d+\)$/u, "");
  if (!(normalized in out)) {
    out[normalized] = phonemes;
  }
}
const baseCount = Object.keys(out).length;

// ── 2. Stem lookup = base + hand-curated overrides ──────────────────
// A few CMU entries carry trailing " # comment" annotations — strip
// before deriving, or the comment words become fake phonemes.
const overrides = JSON.parse(
  fs.readFileSync(path.join(REPO, "wordlists/cmu-overrides.json"), "utf8"),
);
const stemPron = new Map();
for (const [w, p] of Object.entries(out)) stemPron.set(w, p.split(" # ")[0]);
for (const [w, p] of Object.entries(overrides)) {
  if (w.startsWith("_")) continue;
  stemPron.set(w.toLowerCase(), p.split(" # ")[0]);
}

// ── 3. POS + attestation gates ───────────────────────────────────────
function lemmasOf(indexFile) {
  const text = fs.readFileSync(path.join(wndb.path, indexFile), "utf8");
  const set = new Set();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(" ")) continue;
    const lemma = line.slice(0, line.indexOf(" "));
    if (/^[a-z]+$/u.test(lemma)) set.add(lemma);
  }
  return set;
}
const verbLemmas = lemmasOf("index.verb");
const nounLemmas = lemmasOf("index.noun");
const anyLemma = new Set([
  ...verbLemmas,
  ...nounLemmas,
  ...lemmasOf("index.adj"),
  ...lemmasOf("index.adv"),
]);

// Noun lemmas whose EVERY synset is noun.person (18) or noun.location
// (15) — pure proper nouns. wordnet-categories.json can't serve this
// role: its corpus-override rule forces famous names into "common"
// (diana, egypt), which would spawn plural-surname junk (dianas,
// egypts). Recomputed here from raw WordNet so the synthesis gate uses
// pure POS semantics, independent of the app's display categorization.
const properOnlyNouns = (() => {
  const lemmaLex = new Map();
  const text = fs.readFileSync(path.join(wndb.path, "data.noun"), "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(" ")) continue;
    const parts = line.split(/\s+/u);
    const lexnum = parseInt(parts[1], 10);
    const wCnt = parseInt(parts[3], 16);
    if (Number.isNaN(wCnt)) continue;
    for (let i = 0; i < wCnt; i += 1) {
      const lemma = (parts[4 + i * 2] ?? "").toLowerCase();
      if (!/^[a-z]+$/u.test(lemma)) continue;
      if (!lemmaLex.has(lemma)) lemmaLex.set(lemma, new Set());
      lemmaLex.get(lemma).add(lexnum);
    }
  }
  const set = new Set();
  for (const [lemma, lexes] of lemmaLex) {
    if ([...lexes].every((l) => l === 15 || l === 18)) set.add(lemma);
  }
  return set;
})();

const cats = JSON.parse(
  fs.readFileSync(
    path.join(REPO, "rhyme-finder/wordlists/wordnet-categories.json"),
    "utf8",
  ),
);
const commonishNouns = new Set([...(cats.common ?? []), ...(cats.science ?? [])]);
const attested = new Set(Object.values(cats).flat());
for (const w of fs
  .readFileSync(path.join(REPO, "rhyme-finder/wordlists/common-10k.txt"), "utf8")
  .split(/\r?\n/u)) {
  if (w) attested.add(w.toLowerCase());
}

// Irregular verb LEMMAS whose -ed must not be synthesized (ran, sang,
// said — the regular spelling would get a junk pronunciation, or worse,
// collide with a real word: sing+ed vs singe+d). Matched by endsWith so
// outrun/foresee/waylay are covered too. Includes verbs with a valid
// regular alternative (dreamed, burned): those forms are already native
// CMU entries, so blocking synthesis loses nothing.
const IRREGULAR_VERBS = [
  "arise", "awake", "bear", "beat", "begin", "behold", "bend", "bereave",
  "beseech", "bet", "bid", "bind", "bite", "bleed", "blow", "break",
  "breed", "bring", "build", "burn", "burst", "bust", "buy", "cast",
  "catch", "choose", "cleave", "cling", "come", "cost", "creep", "cut",
  "deal", "dig", "dive", "draw", "dream", "drink", "drive", "dwell",
  "eat", "fall", "feed", "feel", "fight", "find", "flee", "fling", "fly",
  "forbid", "forget", "forgive", "forsake", "freeze", "get", "gild",
  "gird", "give", "grind", "grow", "hang", "hear", "heave", "hew",
  "hide", "hit", "hold", "hurt", "keep", "kneel", "knit", "know", "lade",
  "lay", "lead", "lean", "leap", "learn", "leave", "lend", "let", "lie",
  "light", "lose", "make", "mean", "meet", "mow", "pay", "plead", "put",
  "quit", "read", "rend", "rid", "ride", "ring", "rise", "run", "saw",
  "say", "seek", "sell", "send", "set", "sew", "shake", "shave", "shear",
  "shed", "shine", "shoe", "shoot", "show", "shrink", "shut", "sing",
  "sink", "sit", "slay", "sleep", "slide", "sling", "slink", "slit",
  "smell", "smite", "sow", "speak", "speed", "spell", "spend", "spill",
  "spin", "spit", "split", "spoil", "spread", "spring", "stand", "steal",
  "stick", "sting", "stink", "strew", "stride", "strike", "string",
  "strive", "swear", "sweat", "sweep", "swell", "swim", "swing", "take",
  "teach", "tear", "tell", "think", "thrive", "throw", "thrust", "tread",
  "wake", "wear", "weave", "wed", "weep", "wet", "win", "wind", "wring",
  "write",
  // be/do/go/have irregulars — no *goed/*beed; -s handled separately
  "be", "do", "go", "have",
];

// Verbs whose 3rd-person -s is irregular (is, has, does — a synthesized
// "haves"/"bes"/"redoes" would get the wrong vowel).
const IRREGULAR_3RD = ["be", "do", "have"];

// Irregular-plural noun LEMMAS (-s must not be synthesized). endsWith
// covers compounds: fireman, forefoot, werewolf, grandchild.
const IRREGULAR_NOUNS = [
  "man", "woman", "child", "foot", "tooth", "goose", "mouse", "louse",
  "ox", "sheep", "deer", "moose", "swine", "bison", "series", "species",
  "corps", "means", "offspring", "aircraft",
  // -f/-fe → -ves
  "leaf", "loaf", "sheaf", "thief", "calf", "half", "elf", "self",
  "shelf", "wolf", "knife", "life", "wife",
  // Latin/Greek plurals
  "alumnus", "alumna", "criterion", "phenomenon", "datum", "stratum",
  "stimulus", "radius", "nucleus", "fungus", "bacterium", "curriculum",
  "memorandum",
];

const endsWithAny = (word, list) => list.some((l) => word.endsWith(l));

// ── 4. Spelling rules (e-drop, y→ie, CVC doubling) ──────────────────
const VOWEL_LETTERS = new Set(["a", "e", "i", "o", "u"]);
function isVowelLetter(word, i) {
  const c = word[i];
  if (!VOWEL_LETTERS.has(c)) return false;
  if (c === "u" && word[i - 1] === "q") return false; // quit/quiz: u is /w/
  return true;
}

// American doubling: final consonant doubles before -ed/-ing only when
// the spelling ends consonant-vowel-consonant AND the final syllable is
// stressed (stop→stopped, occur→occurring) — not when unstressed
// (visit→visiting, travel→traveling US). Stress comes from the CMU
// phonemes, which is exactly the signal orthography guides approximate.
function doublesFinal(stem, pron) {
  const last = stem[stem.length - 1];
  if (VOWEL_LETTERS.has(last) || last === "w" || last === "x" || last === "y" || last === "h") return false;
  if (!isVowelLetter(stem, stem.length - 2)) return false;
  if (stem.length > 2 && isVowelLetter(stem, stem.length - 3)) return false;
  const vowels = pron.split(" ").filter((p) => /\d$/u.test(p));
  const lastVowel = vowels[vowels.length - 1];
  return !!lastVowel && !lastVowel.endsWith("0");
}

function ingForm(stem, pron) {
  if (stem.endsWith("c")) return null; // panic→panicking needs a k; skip
  if (stem.endsWith("ie")) return `${stem.slice(0, -2)}ying`; // die→dying
  if (stem.endsWith("e") && !/(?:ee|oe|ye)$/u.test(stem)) return `${stem.slice(0, -1)}ing`;
  return stem + (doublesFinal(stem, pron) ? stem[stem.length - 1] : "") + "ing";
}

function edForm(stem, pron) {
  if (stem.endsWith("e")) return `${stem}d`;
  if (stem.endsWith("y")) {
    return VOWEL_LETTERS.has(stem[stem.length - 2])
      ? `${stem}ed` // played
      : `${stem.slice(0, -1)}ied`; // carried
  }
  if (stem.endsWith("c")) return null; // picnicked
  return stem + (doublesFinal(stem, pron) ? stem[stem.length - 1] : "") + "ed";
}

function sForm(stem) {
  if (/(?:s|x|z|ch|sh)$/u.test(stem)) {
    if (stem.endsWith("z") && !stem.endsWith("zz")) return null; // quiz→quizzes
    return `${stem}es`;
  }
  if (stem.endsWith("y")) {
    return VOWEL_LETTERS.has(stem[stem.length - 2])
      ? `${stem}s` // toys
      : `${stem.slice(0, -1)}ies`; // carries
  }
  if (stem.endsWith("o")) {
    return stem + (VOWEL_LETTERS.has(stem[stem.length - 2]) ? "s" : "es"); // radios, heroes
  }
  return `${stem}s`;
}

// ── 5. Phoneme suffixes (voicing-dependent, CMU conventions) ────────
const VOICELESS = new Set(["P", "T", "K", "F", "TH", "S", "SH", "CH"]);
const SIBILANT = new Set(["S", "Z", "SH", "ZH", "CH", "JH"]);
const lastPhone = (pron) => pron.split(" ").at(-1).replace(/\d$/u, "");

function edPhones(pron) {
  const l = lastPhone(pron);
  if (l === "T" || l === "D") return `${pron} IH0 D`; // waded
  return `${pron} ${VOICELESS.has(l) ? "T" : "D"}`; // boxed / furled
}
function sPhones(pron) {
  const l = lastPhone(pron);
  if (SIBILANT.has(l)) return `${pron} IH0 Z`; // churches
  return `${pron} ${VOICELESS.has(l) ? "S" : "Z"}`; // hats / worlds
}
const ingPhones = (pron) => `${pron} IH0 NG`;

// ── 6. Generate ──────────────────────────────────────────────────────
const synth = new Map(); // form → { pron, stem, kind }
function propose(form, pron, stem, kind) {
  if (!form || form.length < 3) return;
  if (stemPron.has(form)) return; // native entry (base or override) wins
  const prev = synth.get(form);
  // Collision (bast+ed vs baste+d → "basted"): the longer stem is the
  // real derivation — e-final stems beat their truncated lookalikes.
  if (prev && prev.stem.length >= stem.length) return;
  synth.set(form, { pron, stem, kind });
}

for (const [stem, pron] of stemPron) {
  if (stem.length < 3 || !/^[a-z]+$/u.test(stem)) continue;
  if (!/\d/u.test(pron)) continue; // no vowel phoneme → not speakable
  const isVerb = verbLemmas.has(stem);
  const isCommonNoun =
    nounLemmas.has(stem) && commonishNouns.has(stem) && !properOnlyNouns.has(stem);
  // Attestation rescues POS-gate misses (burled: "burl" is only a noun),
  // but the attested list has its own junk tail ("goed", "mitted") — so
  // the stem must at least be a real WordNet lemma of some POS ("goe" is
  // a CMU-only name fragment; goe+d must not become an entry).
  const attestedFrom = (form) => attested.has(form) && anyLemma.has(stem);

  const ing = ingForm(stem, pron);
  if (ing && (isVerb || attestedFrom(ing))) {
    propose(ing, ingPhones(pron), stem, "ing");
  }

  const ed = edForm(stem, pron);
  if (ed && !endsWithAny(stem, IRREGULAR_VERBS) && (isVerb || attestedFrom(ed))) {
    propose(ed, edPhones(pron), stem, "ed");
  }

  const s = sForm(stem);
  const verbS = isVerb && !endsWithAny(stem, IRREGULAR_3RD);
  // Noun-plural traps beyond the irregular list: WordNet has plural-form
  // lemmas ("steps", "arms" → stepses/armses) and gerund nouns
  // ("alerting" → alertings); -is Latin plurals (crisis → crises).
  const nounS =
    isCommonNoun &&
    !endsWithAny(stem, IRREGULAR_NOUNS) &&
    !stem.endsWith("is") &&
    !stem.endsWith("s") &&
    !stem.endsWith("ing");
  if (s && (verbS || nounS || attestedFrom(s))) {
    propose(s, sPhones(pron), stem, "s");
  }
}

const counts = { s: 0, ed: 0, ing: 0 };
for (const [form, { pron, kind }] of [...synth].sort(([a], [b]) => a.localeCompare(b))) {
  out[form] = pron;
  counts[kind] += 1;
}

const json = JSON.stringify(out);
fs.writeFileSync(path.join(REPO, "wordlists/cmu-dict.json"), json);
console.log(
  `wrote wordlists/cmu-dict.json — ${Object.keys(out).length} entries ` +
    `(${baseCount} CMU + ${synth.size} synthesized: ` +
    `${counts.s} -s, ${counts.ed} -ed, ${counts.ing} -ing), ` +
    `${(json.length / 1024 / 1024).toFixed(2)} MB`,
);
