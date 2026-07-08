// ── Self-contained pronunciation loader for Rhyme Finder ────────────
// Loads the CMU pronouncing dictionary from a static JSON in wordlists/.
// Avoids depending on node_modules/, which Vercel silently strips from
// the deploy bundle even though .vercelignore claims to keep it.
//
// Same interface as src/pronunciation.js (PRONUNCIATION_MAP, deriveRhymeInfo,
// normalizeWordKey) so rhymeClassifier and rhymeFinder can swap to it
// transparently. The map is populated lazily — call `ensurePronunciation()`
// once before any synchronous PRONUNCIATION_MAP.get(...) access.

const VOWEL_LABELS = {
  AA: "ah",
  AE: "a",
  AH: "uh",
  AO: "aw",
  AW: "ow",
  AY: "eye",
  EH: "eh",
  ER: "er",
  EY: "ay",
  IH: "ih",
  IY: "ee",
  OW: "oh",
  OY: "oy",
  UH: "uu",
  UW: "oo",
};

export const PRONUNCIATION_MAP = new Map();

// Cot/caught merger: AA and AO have collapsed into one vowel for most
// modern American speakers, so water/potter, dawn/john, talk/rock all
// sound like perfect rhymes even though CMU keeps them as different
// vowels. CMU is itself inconsistent (caught/cot pre-merged; dawn/don
// not). Normalize on load so every downstream consumer — classifier,
// finder prefilter, UI display — sees one canonical vowel. Boston/NYC/
// UK speakers who keep them distinct will get false-positive perfect
// rhymes; acceptable default for the American songwriting audience.
//
// EXCEPTION — AO before R does NOT merge. The cot/caught merger is a
// non-rhotic phenomenon (LOT/THOUGHT). Pre-rhotic AO is the separate
// NORTH/FORCE vowel (born, corn, storm, warm, more, door, for, war) and
// stays distinct from the START vowel AA-R (barn, arm, car, farm) for
// ALL American speakers — nobody rhymes "born" with "barn". Merging it
// blindly made every AO-R word a false additive/assonance match onto
// AA-nasal words (yukon/con → born, storm, warm, more, door). Skip the
// merge when the next phoneme is R.
export function normalizePhonemes(s) {
  return s.replace(/\bAO([0-2])(?!\s+R\b)/gu, "AA$1");
}

let LOAD_PROMISE = null;

export function ensurePronunciation() {
  if (PRONUNCIATION_MAP.size > 0) return Promise.resolve();
  if (!LOAD_PROMISE) {
    LOAD_PROMISE = (async () => {
      const dictUrl = new URL("../../wordlists/cmu-dict.json", import.meta.url);
      const overridesUrl = new URL("../../wordlists/cmu-overrides.json", import.meta.url);
      const [dictResp, overridesResp] = await Promise.all([
        fetch(dictUrl),
        fetch(overridesUrl),
      ]);
      if (!dictResp.ok) throw new Error(`Failed to load CMU dict: ${dictResp.status}`);
      const obj = await dictResp.json();
      for (const word in obj) {
        // A few CMU entries carry trailing " # comment" annotations
        // (aalborg → "AO1 L B AO0 R G # place, danish") — strip before
        // splitting or the comment words become fake phonemes.
        const pron = obj[word].split(" # ")[0];
        PRONUNCIATION_MAP.set(word, normalizePhonemes(pron).split(" "));
      }
      // Apply overrides last so they win against the base CMU entry.
      // Overrides patch known CMU transcription errors (e.g. typology).
      if (overridesResp.ok) {
        const overrides = await overridesResp.json();
        for (const word in overrides) {
          if (word.startsWith("_")) continue; // skip _comment etc.
          PRONUNCIATION_MAP.set(word.toLowerCase(), normalizePhonemes(overrides[word]).split(" "));
        }
      }
    })();
  }
  return LOAD_PROMISE;
}

export function normalizeWordKey(word) {
  return word.toLowerCase();
}

export function extractStressToken(phoneme) {
  const match = phoneme.match(/([A-Z]{2})([012])/u);
  if (!match) return null;
  const [, vowel, stress] = match;
  return {
    vowel,
    stressToken: stress === "1" ? "DUM" : stress === "2" ? "dum" : "da",
  };
}

export function deriveRhymeInfo(phonemes) {
  let lastStressedIndex = -1;
  for (let i = 0; i < phonemes.length; i += 1) {
    if (/[12]/u.test(phonemes[i])) lastStressedIndex = i;
  }
  if (lastStressedIndex === -1) {
    lastStressedIndex = phonemes.findIndex((p) => /\d/u.test(p));
  }
  const tail = lastStressedIndex === -1 ? phonemes : phonemes.slice(lastStressedIndex);
  const vowel = extractStressToken(tail[0] ?? "");
  return {
    rhymeTail: tail,
    rhymeKey: tail.join(" "),
    rhymeVowel: vowel ? VOWEL_LABELS[vowel.vowel] ?? vowel.vowel.toLowerCase() : "",
  };
}
