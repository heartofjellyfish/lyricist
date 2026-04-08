import {
  PATTERN_WEIGHT,
  CLICHE_FRAGMENTS,
  COMMON_VERBS,
  COMMON_ADJECTIVES,
} from "./stressConstants.js";
import { normalizeWordKey, normalizeText } from "./pronunciation.js";
import {
  SEED_SPEC_MAP,
  FAMILIAR_PROMPT_WORDS,
  LEXICON_BY_WORD,
  LYRIC_LEXICON_BY_PATTERN,
  resolveLexiconEntry,
  normalizeRhymeTarget,
} from "./lexicon.js";
import { matchesPattern, lyricSliceVariants, patternsCompatible } from "./patternParser.js";
import { parseThemeTags } from "./theme.js";
import { WORDNET_SEMANTIC_MAP } from "./generatedWordnetMap.js";

// ── Pattern and slot penalties ──────────────────────────────────

function matchesAnyPattern(candidatePatterns, slice) {
  return candidatePatterns.some((pattern) => matchesPattern(pattern, slice));
}

export function lyricPatternPenalty(entry, slice) {
  if (matchesAnyPattern(entry.preferredLyricPatterns, slice)) return 0;
  if (entry.pos === "prep") return 4;
  if (entry.type === "function") return 5;
  if (entry.type === "content") return 2;
  return 3;
}

export function slotTypePenalty(entry, slotKind) {
  if (["function", "leadWeak", "articleLeadWeak", "linkWeak", "auxWeak", "preCompactWeak", "postCompactWeak"].includes(slotKind)) {
    return entry.type === "function" ? 0 : 4;
  }
  return entry.type === "content" ? 0 : 5;
}

export function slotMatches(entry, slotKind) {
  if (slotKind === "function" || slotKind === "content") return true;
  if (slotKind === "articleLeadWeak") return entry.type === "function" && ["article", "pron"].includes(entry.pos);
  if (slotKind === "leadWeak") return entry.type === "function" && ["pron", "article", "prep"].includes(entry.pos);
  if (slotKind === "auxWeak") return entry.type === "function" && ["aux", "prep", "article"].includes(entry.pos);
  if (slotKind === "linkWeak") return entry.type === "function" && ["prep", "article", "conj", "aux"].includes(entry.pos);
  if (slotKind === "preCompactWeak" || slotKind === "postCompactWeak") {
    return entry.type === "function" && ["prep", "article", "pron"].includes(entry.pos);
  }
  if (slotKind === "compactFunction") {
    return (entry.type === "function" && ["prep", "adv"].includes(entry.pos)) || entry.pos === "prep";
  }
  if (slotKind === "compactContent") return entry.type === "content";
  if (slotKind === "article") return entry.pos === "article";
  if (entry.pos === slotKind) return true;
  if (slotKind === "function" && entry.type === "function") return true;
  return false;
}

export function slotMatchPenalty(entry, slotKind) {
  if (slotKind === "function" || slotKind === "content") return slotTypePenalty(entry, slotKind);

  if (slotKind === "articleLeadWeak") {
    if (entry.pos === "article") return 0;
    if (entry.pos === "pron") return 2;
    return 8;
  }

  if (slotKind === "leadWeak") {
    if (entry.pos === "pron") return 0;
    if (entry.pos === "article") return 1;
    if (entry.pos === "prep") return 3;
    return 8;
  }

  if (slotKind === "auxWeak") {
    if (entry.pos === "aux") return 0;
    if (entry.pos === "prep") return 4;
    if (entry.pos === "article") return 6;
    return 9;
  }

  if (slotKind === "linkWeak") {
    if (entry.pos === "prep") return 0;
    if (entry.pos === "aux") return 1;
    if (entry.pos === "article") return 2;
    if (entry.pos === "conj") return 3;
    return 8;
  }

  if (slotKind === "preCompactWeak" || slotKind === "postCompactWeak") {
    if (entry.pos === "prep") return 0;
    if (entry.pos === "article") return 2;
    if (entry.pos === "pron") return 3;
    return 8;
  }

  if (slotKind === "compactFunction") {
    if (entry.pos === "prep") return 0;
    if (entry.pos === "adv") return 2;
    if (entry.type === "function") return 3;
    return 9;
  }

  if (slotKind === "compactContent") return entry.type === "content" ? 0 : 9;
  if (entry.pos === slotKind) return 0;
  if (slotKind === "article" && entry.type === "function") return 3;
  return 6;
}

// ── Atomic scoring functions ────────────────────────────────────

export function sliceWeight(tokens) {
  return tokens.reduce((sum, token) => sum + PATTERN_WEIGHT[token], 0);
}

export function rhymeScore(entry, desiredRhyme) {
  if (!desiredRhyme) return 0;
  return entry.rhyme === desiredRhyme ? 8 : -20;
}

export function themeScore(entry, themeTags) {
  const tagHits = entry.tags.reduce((sum, tag) => sum + (themeTags.has(tag) ? 4 : 0), 0);
  const exactHit = themeTags.has(entry.text) ? 10 : 0;
  const semanticItems = Array.isArray(WORDNET_SEMANTIC_MAP[entry.text]) ? WORDNET_SEMANTIC_MAP[entry.text] : [];
  const semanticHits = semanticItems.reduce(
    (sum, related) => sum + (themeTags.has(related) ? 2 : 0),
    0,
  );
  return tagHits + exactHit + semanticHits;
}

export function densityPenalty(text) {
  return /[bcdfghjklmnpqrstvwxyz]{4,}/iu.test(text) ? 2 : 0;
}

export function detectCliches(lineText) {
  const lowerLine = lineText.toLowerCase();
  return CLICHE_FRAGMENTS.filter((fragment) => lowerLine.includes(fragment));
}

// ── Public scoring stubs ────────────────────────────────────────

export function rhymeMaster(lastWord, desiredRhyme) {
  if (!desiredRhyme) return { ok: true, message: "No rhyme target set." };

  const normalizedRhyme = normalizeRhymeTarget(desiredRhyme);
  const entry = resolveLexiconEntry(lastWord);
  if (!entry) return { ok: false, message: "Last word is not in the pronunciation lexicon." };

  return entry.rhyme === normalizedRhyme
    ? { ok: true, message: `Matches rhyme family "${desiredRhyme}".` }
    : { ok: false, message: `Expected rhyme family "${desiredRhyme}", got "${entry.rhyme}".` };
}

export function tasteGuardian() {
  return {
    score: 0,
    notes: ["Local taste ranking is off. Use AI prompt quality and your own judgment."],
  };
}

export function clicheChecker() {
  return { hasCliche: false, hits: [] };
}

export function storyWeaver(_lineText, _ideaText) {
  return {
    score: 0,
    note: "Local story ranking is off. Use the AI prompt and your own judgment for theme fit.",
  };
}

export function chooseDefaultRhyme(themeTags) {
  if (themeTags.has("night") || themeTags.has("love")) return "oo";
  if (themeTags.has("hope")) return "ay";
  return "";
}

// ── Line-level syntax checks ────────────────────────────────────

export function lineToText(words) {
  return words.map((entry) => entry.text).join(" ");
}

export function hasWeakEnding(words) {
  const last = words.at(-1);
  return last ? last.type === "function" : false;
}

export function hasFunctionWordPile(words) {
  let run = 0;
  for (const entry of words) {
    if (entry.type === "function") {
      run += 1;
      if (run >= 3) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

export function hasBasicSyntaxGap(words) {
  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    const next = words[index + 1];
    const previous = words[index - 1];

    if (current.pos === "article" && (!next || next.pos !== "noun")) return true;
    if (current.pos === "conj" && (!previous || !next || previous.type !== "content" || next.type !== "content")) return true;
    if (current.pos === "prep" && (!next || ["prep", "conj", "aux"].includes(next.pos))) return true;
  }
  return false;
}

export function hasAwkwardVerbChain(words) {
  const first = words[0];
  const second = words[1];
  const third = words[2];
  return Boolean(first?.pos === "pron" && second?.pos === "verb" && third?.pos === "verb");
}

export function hasRepeatedWordEntries(words) {
  const seen = new Set();
  for (const entry of words) {
    if (seen.has(entry.text)) return true;
    seen.add(entry.text);
  }
  return false;
}

export function hasTooManyColdWords(words) {
  let coldCount = 0;
  for (const entry of words) {
    if (entry.type === "function") continue;
    if (FAMILIAR_PROMPT_WORDS.has(entry.text) || SEED_SPEC_MAP.has(entry.text) || (entry.tags?.length ?? 0) > 0) continue;
    if (COMMON_VERBS.has(entry.text) || COMMON_ADJECTIVES.has(entry.text)) continue;
    if (entry.syllables <= 2 && entry.text.length <= 6) continue;
    coldCount += 1;
  }
  return coldCount >= 2;
}

// ── Line-level composite scoring ────────────────────────────────

export function lineIdeaScore(words, ideaText, aiSeedWords = []) {
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const aiSeedSet = new Set(aiSeedWords.map((word) => normalizeWordKey(word)));
  let score = 0;
  let offThemeContentCount = 0;

  for (const entry of words) {
    if (entry.type !== "content") continue;

    const localTheme = themeScore(entry, themeTags);
    const aiBonus = aiSeedSet.has(entry.text) ? 8 : 0;
    score += Math.min(localTheme, 12) + aiBonus;

    if (localTheme === 0 && aiBonus === 0) {
      offThemeContentCount += 1;
    }
  }

  return score - offThemeContentCount * 4;
}

export function lineFamiliarityScore(words) {
  let score = 0;
  let coldCount = 0;

  for (const entry of words) {
    if (entry.type === "function") {
      score += 1;
      continue;
    }

    if (FAMILIAR_PROMPT_WORDS.has(entry.text) || SEED_SPEC_MAP.has(entry.text) || (entry.tags?.length ?? 0) > 0) {
      score += 10;
      continue;
    }

    if (COMMON_VERBS.has(entry.text) || COMMON_ADJECTIVES.has(entry.text)) {
      score += 8;
      continue;
    }

    if (entry.syllables <= 2 && entry.text.length <= 6) {
      score += 3;
    } else {
      coldCount += 1;
      score -= 8;
    }
  }

  return score - coldCount * 4;
}

export function planStructureScore(templateKey = "") {
  let score = 0;

  if (
    templateKey.includes("auxWeak") &&
    templateKey.includes("->verb") &&
    templateKey.includes("compactFunction") &&
    templateKey.includes("postCompactWeak") &&
    templateKey.endsWith("DUM->noun")
  ) {
    score += 18;
  }

  if (templateKey.includes("auxWeak") && templateKey.includes("DUM da*->noun")) score -= 18;
  if (templateKey.includes("da DUM*->noun")) score -= 24;
  if (!templateKey.includes("auxWeak") && templateKey.includes("compactFunction")) score -= 8;
  if (!templateKey.startsWith("da->articleLeadWeak")) score += 10;
  else score -= 2;

  return score;
}

export function scoreCandidate(words, ideaText, desiredRhyme, baseScore = 0, templateKey = "", aiSeedWords = []) {
  const text = lineToText(words);
  const rhyme = rhymeMaster(words.at(-1)?.text ?? "", desiredRhyme);

  return {
    text,
    planKey: templateKey || words.map((entry) => entry.pos).join(" "),
    score:
      baseScore +
      planStructureScore(templateKey) +
      lineFamiliarityScore(words) +
      lineIdeaScore(words, ideaText, aiSeedWords) +
      (rhyme.ok ? 4 : -10),
    diagnostics: {
      rhyme: rhyme.message,
      taste: ["Local taste ranking is off."],
      story: "Local story ranking is off.",
      cliche: [],
      structure: templateKey || words.map((entry) => entry.pos).join(" "),
    },
  };
}

// ── Overlap and signature utilities ─────────────────────────────

export function lexicalOverlapScore(a, b) {
  const aWords = new Set(normalizeText(a));
  const bWords = new Set(normalizeText(b));
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap += 1;
  }
  return overlap;
}

export function contentWordsForLine(lineText) {
  return normalizeText(lineText).filter((word) => {
    const entry = resolveLexiconEntry(word);
    return entry && entry.type === "content";
  });
}

export function contentOverlapScore(a, b) {
  const aWords = new Set(contentWordsForLine(a));
  const bWords = new Set(contentWordsForLine(b));
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap += 1;
  }
  return overlap;
}

export function sameContentSet(a, b) {
  const aWords = [...new Set(contentWordsForLine(a))].sort();
  const bWords = [...new Set(contentWordsForLine(b))].sort();
  return aWords.length === bWords.length && aWords.every((word, index) => word === bWords[index]);
}

export function frameSignature(lineText) {
  const words = normalizeText(lineText);
  if (words.length <= 2) return words.join(" ");
  return words.slice(0, -1).join(" ");
}

export function anchorSignature(lineText) {
  const words = normalizeText(lineText);
  if (words.length <= 4) return words.join(" ");
  return [words[0], words[1], words[2], words[3]].join(" ");
}

// ── Entry-level scoring for prompt banks ────────────────────────

export function singleEntryFamiliarityScore(entry, slot = null) {
  if (!entry) return -999;

  let score = 0;

  if (entry.type === "function") score += 5;

  if (SEED_SPEC_MAP.has(entry.text) || (entry.tags?.length ?? 0) > 0) {
    score += 10;
  } else if (COMMON_VERBS.has(entry.text) || COMMON_ADJECTIVES.has(entry.text)) {
    score += 8;
  } else if (entry.syllables <= 2 && entry.text.length <= 8) {
    score += 4;
  } else {
    score -= 8;
  }

  if (slot?.tokens?.length === 1) {
    if (slot.tokens[0] === "da" && entry.type === "function") score += 5;
    if (slot.tokens[0] === "DUM" && entry.type === "content") score += 5;
  }

  return score;
}

export function strictSlotKindMatch(entry, currentSlot) {
  const kind = currentSlot?.kind ?? "";
  if (kind === "articleLeadWeak") return entry.type === "function" && ["article", "pron"].includes(entry.pos);
  if (kind === "leadWeak") return entry.type === "function" && ["pron", "article"].includes(entry.pos);
  if (kind === "auxWeak") return entry.pos === "aux";
  if (kind === "linkWeak" || kind === "preCompactWeak") return entry.type === "function" && ["prep", "conj"].includes(entry.pos);
  if (kind === "postCompactWeak") return entry.type === "function" && ["article", "pron"].includes(entry.pos);
  if (kind === "compactFunction") return entry.pos === "prep";
  if (kind === "noun") return entry.pos === "noun";
  if (kind === "verb") return entry.pos === "verb";
  if (kind === "adj") return entry.pos === "adj";
  if (kind === "content") return entry.type === "content";
  return slotMatches(entry, kind);
}

export function promptSlotCompatibility(entry, slot) {
  if (!entry || !slot?.tokens?.length) return false;
  if (!entry.allowedLyricPatterns.some((pattern) => patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)))) {
    return false;
  }

  const shape = slot.tokens.join(" ");
  if (shape === "da") return entry.type === "function";
  if (slot.compact && shape === "dum da") return entry.pos === "prep";
  return entry.type === "content";
}

export function promptContextScore(entry, slot, index = -1, allSlots = []) {
  if (!entry || !slot?.tokens?.length) return Number.NEGATIVE_INFINITY;

  const shape = slot.tokens.join(" ");
  const previous = index > 0 ? allSlots[index - 1] : null;
  const next = index >= 0 && index < allSlots.length - 1 ? allSlots[index + 1] : null;
  const previousShape = previous?.tokens?.join(" ") ?? "";
  const nextShape = next?.tokens?.join(" ") ?? "";
  let score = singleEntryFamiliarityScore(entry, slot);

  if (shape === "da") {
    if (index === 0) {
      if (["article", "pron"].includes(entry.pos)) score += 18;
      else score -= 30;
    } else if (nextShape === "dum da" || previous?.compact) {
      if (["article", "pron"].includes(entry.pos)) score += 16;
      else score -= 24;
    } else if (previousShape === "da DUM" || previousShape === "da DUM da") {
      if (["prep", "conj"].includes(entry.pos)) score += 14;
      else if (entry.pos === "aux") score += 6;
    } else if (nextShape === "DUM da" || nextShape === "da DUM") {
      if (entry.pos === "aux") score += 12;
      if (["prep", "conj"].includes(entry.pos)) score += 10;
    } else {
      if (["article", "pron", "prep", "conj", "aux"].includes(entry.pos)) score += 6;
    }
    return score;
  }

  if (shape === "DUM") {
    if (entry.pos === "noun") score += 12;
    if (index === allSlots.length - 1) {
      if (entry.pos === "noun") score += 8;
      if (entry.pos === "verb") score -= 10;
    }
    return score;
  }

  if (shape === "DUM da") {
    if (nextShape === "dum da") {
      if (entry.pos === "verb") score += 14;
      if (entry.pos === "noun") score += 8;
    }
    if (previousShape === "da" && previous?.kind === "linkWeak") {
      if (entry.pos === "noun") score += 16;
      if (entry.pos === "verb") score -= 6;
    }
    if (entry.pos === "verb") score += 6;
    if (entry.pos === "noun") score += 4;
    return score;
  }

  if (shape === "da DUM") {
    if (index === 0) {
      if (["noun", "adj"].includes(entry.pos)) score += 12;
    }
    if (previousShape === "dum da") {
      if (["noun", "adj"].includes(entry.pos)) score += 18;
      if (entry.pos === "verb") score -= 12;
    }
    if (index === allSlots.length - 1) {
      if (["noun", "adj"].includes(entry.pos)) score += 10;
      if (entry.pos === "verb") score -= 10;
    }
    return score;
  }

  if (shape === "da DUM da") {
    if (nextShape === "dum da") {
      if (["verb", "adj"].includes(entry.pos)) score += 12;
      if (entry.pos === "noun") score -= 6;
    }
    if (entry.pos === "verb") score += 4;
    return score;
  }

  return score;
}
