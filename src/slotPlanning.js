import { FOUR_GROUP_TEMPLATES, TEMPLATE_BONUS } from "./stressConstants.js";
import { normalizeWordKey, normalizeText } from "./pronunciation.js";
import {
  LYRIC_LEXICON_BY_PATTERN,
  resolveLexiconEntry,
  shapeCoverageForSlot,
  familiarCoverageScoreForSlot,
  planRealizabilityScore,
  slotPosCoverageCount,
  normalizeRhymeTarget,
  FAMILIAR_PROMPT_WORDS,
} from "./lexicon.js";
import {
  parsePatternDetailed,
  compactRelaxationPatterns,
  lyricSliceVariants,
  patternsCompatible,
} from "./patternParser.js";
import { validateLine, matchesSegmentationPlan } from "./validation.js";
import {
  slotMatches,
  slotMatchPenalty,
  lyricPatternPenalty,
  themeScore,
  rhymeScore,
  densityPenalty,
  sliceWeight,
  lineToText,
  hasWeakEnding,
  hasFunctionWordPile,
  hasBasicSyntaxGap,
  hasAwkwardVerbChain,
  hasRepeatedWordEntries,
  hasTooManyColdWords,
  lineFamiliarityScore,
  scoreCandidate,
  contentOverlapScore,
  anchorSignature,
  singleEntryFamiliarityScore,
  strictSlotKindMatch,
  promptSlotCompatibility,
  promptContextScore,
} from "./scoring.js";

// ── Slot kind derivation ────────────────────────────────────────

export function deriveSlotKindForPlanSlot(slot, index, allSlots) {
  const allDa = slot.tokens.every((token) => token === "da");
  if (allDa) {
    const previous = allSlots[index - 1];
    const next = allSlots[index + 1];

    if (index === 0) {
      const nextSlot = allSlots[index + 1];
      if (nextSlot && !nextSlot.tokens.every((token) => token === "da")) {
        return "articleLeadWeak";
      }
      return "leadWeak";
    }
    if (allSlots[index + 1]?.compact) return "preCompactWeak";
    if (allSlots[index - 1]?.compact) return "postCompactWeak";

    if (
      previous && next &&
      !previous.tokens.every((token) => token === "da") &&
      !next.tokens.every((token) => token === "da") &&
      previous.tokens.at(-1) === "DUM" &&
      next.tokens[0] === "DUM" &&
      next.tokens.length >= 2
    ) {
      return "auxWeak";
    }

    return "linkWeak";
  }

  const contentSlots = allSlots.filter((item) => !item.tokens.every((token) => token === "da"));
  const contentIndex = contentSlots.findIndex((item) => item === slot);
  const isLastContent = contentIndex === contentSlots.length - 1;

  if (slot.compact) {
    if (!slot.tokens.includes("DUM")) return "compactFunction";
    return "compactContent";
  }

  if (slot.tokens.length >= 2) {
    const next = allSlots[index + 1];
    const nextAllDa = Boolean(next?.tokens?.every((token) => token === "da"));
    const nextNext = allSlots[index + 2];
    const nextNextContent = Boolean(nextNext && !nextNext.tokens.every((token) => token === "da"));

    if (index === 0 && nextAllDa) {
      if (slot.tokens[0] === "da" && slot.tokens[1] === "DUM") return "noun";
      if (nextNextContent) return "noun";
    }

    if (index === 0 && next && !nextAllDa) return "content";
    return isLastContent ? "noun" : "verb";
  }

  if (isLastContent) return "noun";
  if (index === 1 && allSlots[0]?.tokens.every((token) => token === "da")) return "noun";
  return "content";
}

function hasPlanSyntaxGap(slots) {
  const kinds = slots.map((slot) => slot.kind);

  for (let index = 0; index < kinds.length; index += 1) {
    const current = kinds[index];
    const next = kinds[index + 1];
    const previous = kinds[index - 1];

    if (current === "articleLeadWeak" && next !== "noun") return true;
    if (current === "postCompactWeak" && next && next !== "noun") return true;
    if (current === "auxWeak") {
      if (!next || ["compactFunction", "postCompactWeak"].includes(next)) return true;
    }
    if (current === "compactFunction") {
      if (!previous || !["verb", "content", "noun", "compactContent"].includes(previous)) return true;
      if (!next || !["postCompactWeak", "noun"].includes(next)) return true;
    }
  }

  return false;
}

// ── Segmentation enumeration ────────────────────────────────────

function buildLooseSlotSegmentations(parsedPattern) {
  const results = [];
  const maxPlans = 128;

  function backtrack(groupIndex, slots) {
    if (results.length >= maxPlans) return;
    if (groupIndex >= parsedPattern.groups.length) {
      results.push(slots);
      return;
    }

    const group = parsedPattern.groups[groupIndex];
    if (group.compact) {
      backtrack(groupIndex + 1, slots.concat([{ ...group }]));
      return;
    }

    let mergedTokens = [];
    let mergedText = "";
    for (let nextIndex = groupIndex; nextIndex < parsedPattern.groups.length; nextIndex += 1) {
      const nextGroup = parsedPattern.groups[nextIndex];
      if (nextGroup.compact) break;

      mergedTokens = mergedTokens.concat(nextGroup.tokens);
      mergedText = mergedText ? `${mergedText} ${nextGroup.text}` : nextGroup.text;

      backtrack(
        nextIndex + 1,
        slots.concat([{
          text: mergedText,
          tokens: mergedTokens,
          compact: false,
          mergedLoose: nextIndex > groupIndex,
        }]),
      );
    }
  }

  backtrack(0, []);

  return results
    .sort((a, b) => {
      const aMerged = a.filter((slot) => slot.mergedLoose).length;
      const bMerged = b.filter((slot) => slot.mergedLoose).length;
      return bMerged - aMerged;
    })
    .slice(0, maxPlans);
}

export function segmentationPlanKey(slots) {
  return slots
    .map((slot) => `${slot.text}${slot.mergedLoose ? "*" : ""}`)
    .join(" | ");
}

export function enumerateSegmentationPlans(parsedPattern, limit = 64) {
  const results = [];

  function backtrack(groupIndex, slots) {
    if (results.length >= limit) return;
    if (groupIndex >= parsedPattern.groups.length) {
      results.push(slots);
      return;
    }

    const group = parsedPattern.groups[groupIndex];
    if (group.compact) {
      backtrack(groupIndex + 1, slots.concat([{ ...group }]));
      return;
    }

    let mergedTokens = [];
    let mergedText = "";
    for (let nextIndex = groupIndex; nextIndex < parsedPattern.groups.length; nextIndex += 1) {
      const nextGroup = parsedPattern.groups[nextIndex];
      if (nextGroup.compact) break;

      mergedTokens = mergedTokens.concat(nextGroup.tokens);
      mergedText = mergedText ? `${mergedText} ${nextGroup.text}` : nextGroup.text;
      backtrack(
        nextIndex + 1,
        slots.concat([{
          text: mergedText,
          tokens: mergedTokens,
          compact: false,
          mergedLoose: nextIndex > groupIndex,
        }]),
      );
    }
  }

  backtrack(0, []);
  return results;
}

// ── Slot kind variants ──────────────────────────────────────────

function expandSlotKindVariants(plannedSlots) {
  const variants = [plannedSlots];

  for (let index = 0; index < plannedSlots.length; index += 1) {
    const slot = plannedSlots[index];
    if (slot.compact || slot.tokens.length < 2 || slot.tokens.every((token) => token === "da")) {
      continue;
    }

    const alternateKinds = [];
    const firstToken = slot.tokens[0];
    const lastToken = slot.tokens.at(-1);

    if (firstToken === "da" && lastToken === "DUM") {
      alternateKinds.push("noun", "content");
    } else if (firstToken === "DUM" && lastToken === "da") {
      alternateKinds.push("verb", "content", "noun");
    } else {
      alternateKinds.push("content");
    }

    const uniqueAlternates = [...new Set(alternateKinds)].filter((kind) => kind !== slot.kind);
    for (const kind of uniqueAlternates) {
      if (variants.length >= 4) break;
      const nextSlots = plannedSlots.map((item, slotIndex) =>
        slotIndex === index ? { ...item, kind } : item,
      );
      variants.push(nextSlots);
    }
  }

  return variants;
}

// ── Template building ───────────────────────────────────────────

export function buildGenerationTemplates(parsedPattern) {
  if (parsedPattern.groups.length === 4 && parsedPattern.groups.every((group) => group.tokens.length === 1)) {
    return FOUR_GROUP_TEMPLATES.map((template, indexTemplate) => ({
      slots: template.map((kind, indexGroup) => {
        const slot = {
          kind,
          text: parsedPattern.groups[indexGroup].text,
          compact: parsedPattern.groups[indexGroup].compact,
          tokens: parsedPattern.groups[indexGroup].tokens,
          templateIndex: indexTemplate,
        };
        return { ...slot, coverage: shapeCoverageForSlot(slot) };
      }),
      baseScore: TEMPLATE_BONUS[template.join(" ")] ?? 0,
    }));
  }

  return buildLooseSlotSegmentations(parsedPattern)
    .flatMap((slots) => {
      const basePlannedSlots = slots.map((slot, index, allSlots) => ({
        ...slot,
        kind: deriveSlotKindForPlanSlot(slot, index, allSlots),
      }));

      return expandSlotKindVariants(basePlannedSlots).map((plannedSlots) => {
        if (hasPlanSyntaxGap(plannedSlots)) return null;
        const slotsWithCoverage = plannedSlots.map((slot) => ({
          ...slot,
          coverage: shapeCoverageForSlot(slot),
        }));
        const kinds = slotsWithCoverage.map((slot) => slot.kind);
        let baseScore = slots.filter((slot) => slot.mergedLoose).length * 3;

        if ((kinds[0] === "leadWeak" || kinds[0] === "articleLeadWeak") && kinds[1] === "noun") {
          baseScore += 10;
        }

        if (slotsWithCoverage[0]?.mergedLoose && slotsWithCoverage[0]?.tokens.join(" ") === "da DUM" && kinds[0] === "noun") {
          baseScore += 9;
        }

        if (kinds.includes("linkWeak")) baseScore += 4;
        if (kinds.includes("auxWeak")) baseScore += 8;
        if (kinds.at(-2) === "postCompactWeak" && kinds.at(-1) === "noun") baseScore += 6;

        for (let index = 0; index < kinds.length - 1; index += 1) {
          const current = kinds[index];
          const next = kinds[index + 1];
          if (current === "verb" && next === "verb") baseScore -= 18;
          if ((current === "leadWeak" || current === "articleLeadWeak") && next === "verb") baseScore -= 10;
          if (current === "verb" && next === "compactFunction") baseScore -= 6;
        }

        for (const slot of slotsWithCoverage) {
          const totalCount = slot.coverage.totalCount;
          if (totalCount === 0) {
            baseScore -= slot.compact ? 40 : slot.mergedLoose ? 24 : 12;
            continue;
          }

          if (slot.compact && totalCount <= 3) baseScore -= 12;
          else if (slot.compact && totalCount <= 12) baseScore -= 6;

          if (slot.mergedLoose && slot.tokens.length >= 3 && totalCount <= 12) baseScore -= 14;
          else if (slot.mergedLoose && slot.tokens.length >= 3 && totalCount <= 60) baseScore -= 6;

          if (slot.kind === "noun" || slot.kind === "verb" || slot.kind === "content" || slot.kind === "compactContent") {
            if (totalCount >= 250) baseScore += 8;
            else if (totalCount >= 60) baseScore += 4;
            else if (totalCount >= 12) baseScore += 2;
          }

          baseScore += familiarCoverageScoreForSlot(slot);
        }

        return { slots: slotsWithCoverage, baseScore };
      }).filter(Boolean);
    })
    .sort((a, b) => b.baseScore - a.baseScore)
    .slice(0, 96);
}

export function slotPlanKey(slots) {
  return slots
    .map((slot) => `${slot.text ?? slot.tokens.join(" ")}${slot.mergedLoose ? "*" : ""}->${slot.kind}`)
    .join(" | ");
}

// ── Candidate selection for slots ───────────────────────────────

export function chooseCandidatesForSlot(
  slotKind, slice, themeTags, usedWords, isLastSlot, desiredRhyme,
  compact = false, aiSeedWords = [], aiSeedBuckets = {},
) {
  const aiSeedSet = new Set(aiSeedWords.map((word) => normalizeWordKey(word)));
  const slotTargetKey = `${slotKind}|${slice.join(" ")}`;
  const bucketSets = {
    singleWords: new Set((aiSeedBuckets.singleWords ?? []).map((word) => normalizeWordKey(word))),
    compactWords: new Set((aiSeedBuckets.compactWords ?? []).map((word) => normalizeWordKey(word))),
    verbs: new Set((aiSeedBuckets.verbs ?? []).map((word) => normalizeWordKey(word))),
    nouns: new Set((aiSeedBuckets.nouns ?? []).map((word) => normalizeWordKey(word))),
    adjectives: new Set((aiSeedBuckets.adjectives ?? []).map((word) => normalizeWordKey(word))),
    slotTargets: new Set(((aiSeedBuckets.slotTargets ?? {})[slotTargetKey] ?? []).map((word) => normalizeWordKey(word))),
  };

  const seedBonusForEntry = (entry) => {
    if (!aiSeedSet.has(entry.text) || slotKind === "function" || slotKind.endsWith("Weak")) {
      return bucketSets.slotTargets.has(entry.text) ? 20 : 0;
    }
    if (bucketSets.slotTargets.has(entry.text)) return 26;
    if (slotKind === "compactContent" && bucketSets.compactWords.has(entry.text)) return 18;
    if (slotKind === "verb" && bucketSets.verbs.has(entry.text)) return 16;
    if (slotKind === "noun" && bucketSets.nouns.has(entry.text)) return 16;
    if (slotKind === "adj" && bucketSets.adjectives.has(entry.text)) return 16;
    if (bucketSets.singleWords.has(entry.text)) return 10;
    return 8;
  };

  const familiarityBonusForEntry = (entry) => {
    if (entry.type === "function") return 0;

    const seeded = aiSeedSet.has(entry.text);
    const themed = themeScore(entry, themeTags) > 0;
    const tagged = (entry.tags?.length ?? 0) > 0;
    let score = 0;

    if (tagged) score += 8;
    else score -= 6;
    if (seeded) score += 10;
    if (themed) score += 8;
    if (slice.length >= 2 && !tagged && !seeded && !themed) score -= 18;
    if ((slotKind === "noun" || slotKind === "content") && slice.join(" ") === "da DUM" && !tagged && !seeded && !themed) {
      score -= 14;
    }

    return score;
  };

  const localThemeScore = aiSeedSet.size > 0 ? () => 0 : themeScore;
  const exactPool = (LYRIC_LEXICON_BY_PATTERN.get(slice.join(" ")) ?? []).map((entry) => ({
    entry,
    compactRelaxed: false,
  }));
  const relaxedPools = lyricSliceVariants(slice, compact)
    .filter((variant) => variant.join(" ") !== slice.join(" "))
    .flatMap((relaxedSlice) =>
      (LYRIC_LEXICON_BY_PATTERN.get(relaxedSlice.join(" ")) ?? []).map((entry) => ({
        entry,
        compactRelaxed: true,
      })),
    );
  const pool = [...exactPool, ...relaxedPools];

  const ranked = pool
    .filter(({ entry }) => !usedWords.has(entry.text))
    .filter(({ entry }) => slotMatches(entry, slotKind))
    .filter(({ entry }) => !isLastSlot || !desiredRhyme || entry.rhyme === desiredRhyme)
    .map(({ entry, compactRelaxed }) => ({
      entry,
      score:
        localThemeScore(entry, themeTags) +
        seedBonusForEntry(entry) +
        familiarityBonusForEntry(entry) +
        sliceWeight(slice) -
        densityPenalty(entry.text) +
        -slotMatchPenalty(entry, slotKind) +
        -lyricPatternPenalty(entry, slice) +
        rhymeScore(entry, isLastSlot ? desiredRhyme : "") +
        (compactRelaxed ? -4 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0 && slotKind === "prep" && slice.every((token) => token === "da")) {
    const functionFallback = chooseCandidatesForSlot(
      "function", slice, themeTags, usedWords, isLastSlot, desiredRhyme, compact, [], {},
    ).filter(({ entry }) => entry.pos === "prep");

    if (functionFallback.length > 0) return functionFallback;
  }

  return ranked;
}

// ── Prompt examples and banks ───────────────────────────────────

export function promptExamplesForSlot(slot, limit = 5, index = -1, allSlots = []) {
  if (!slot?.tokens?.length) return [];

  const shape = slot.tokens.join(" ");
  const previous = index > 0 ? allSlots[index - 1] : null;
  const previousKind = previous?.kind ?? "";
  const next = index >= 0 && index < allSlots.length - 1 ? allSlots[index + 1] : null;
  const nextKind = next?.kind ?? "";

  const preferredByShape = {
    da: ["i", "the", "my", "in", "to", "of", "and", "a", "your", "our"],
    DUM: ["dream", "heart", "light", "sky", "tide", "sea", "depths", "world", "wave", "soul"],
    "DUM da": ["falling", "drifting", "fading", "floating", "slipping", "breaking", "summer", "shadow", "river", "ember"],
    "da DUM": ["awake", "alone", "within", "below", "beyond", "inside", "desire", "control", "regret", "mistake"],
    "da DUM da": ["forever", "becoming", "forgetting", "awakening", "remembering", "releasing"],
    "dum da": ["into", "under", "over", "after", "onto", "during"],
  };

  const preferredByKind = {
    articleLeadWeak: ["the", "my", "your", "our", "a"],
    leadWeak: ["i", "we", "you", "my", "the"],
    auxWeak: ["is", "was", "am", "are", "be"],
    linkWeak: ["of", "in", "through", "with", "and", "to"],
    preCompactWeak: ["of", "in", "through", "with", "to"],
    postCompactWeak: ["the", "my", "your", "our"],
    compactFunction: ["into", "under", "over", "after", "onto", "during"],
    noun: ["dream", "heart", "mind", "world", "depths", "wave", "ocean", "shadow", "silence"],
    verb: ["falling", "drifting", "fading", "floating", "slipping", "breaking", "coming", "turning", "moving", "sinking"],
    adj: ["silent", "golden", "hidden", "open", "alone", "awake"],
  };

  const preferredWords = preferredByShape[shape] ?? [];
  const kindPreferredWords = preferredByKind[slot.kind] ?? [];

  const compatiblePreferredWords = (words) =>
    words.filter((word) => {
      const entry = resolveLexiconEntry(word);
      if (!entry) return false;
      return entry.allowedLyricPatterns.some((pattern) =>
        patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
      );
    });

  const strictKindBank = (() => {
    if (shape === "da") {
      if (slot.kind === "articleLeadWeak") return ["the", "my", "your", "our", "a"];
      if (slot.kind === "postCompactWeak") return ["the", "my", "your", "our"];
      if (slot.kind === "auxWeak") return ["is", "was", "am", "are", "be"];
      if (slot.kind === "linkWeak" || slot.kind === "preCompactWeak") {
        if (previousKind === "noun" && ["noun", "content", "verb"].includes(nextKind)) return ["of", "in", "through", "with"];
        if (previousKind === "noun" && nextKind === "noun") return ["of", "in"];
        if (previousKind === "auxWeak" || nextKind === "verb") return ["to", "and", "through", "with"];
        return ["of", "in", "through", "with", "and", "to"];
      }
      return ["i", "the", "my", "in", "to", "of", "and", "a"];
    }
    if (slot.compact && shape === "dum da") return ["into", "under", "over", "after", "onto", "during"];
    if (shape === "DUM" && slot.kind === "verb") return ["fall", "drift", "glow", "burn", "rise", "break"];
    if (shape === "DUM da" && slot.kind === "noun") return ["summer", "shadow", "river", "ember", "morning", "daybreak"];
    if (shape === "DUM da" && slot.kind === "content" && previousKind === "linkWeak") return ["summer", "shadow", "river", "ember", "morning", "daybreak"];
    if (shape === "DUM da" && (slot.kind === "verb" || slot.kind === "content")) {
      return ["falling", "drifting", "fading", "floating", "slipping", "breaking", "coming", "turning", "moving", "sinking"];
    }
    if (shape === "DUM" && (slot.kind === "noun" || slot.kind === "content")) {
      if (index === allSlots.length - 1 || previousKind === "postCompactWeak") {
        return ["depths", "heart", "world", "light", "sky", "dream", "wave", "soul"];
      }
      return ["dream", "heart", "light", "sky", "wave", "tide", "soul", "world"];
    }
    if (shape === "da DUM" && slot.kind === "noun") return ["revenge", "desire", "control", "regret", "mistake", "release"];
    if (shape === "da DUM" && slot.kind === "content") {
      if (previousKind === "compactFunction") return ["desire", "control", "regret", "mistake", "release", "surprise"];
      return ["awake", "alone", "within", "beyond", "inside", "below"];
    }
    if (shape === "da DUM da") return ["forever", "becoming", "forgetting", "remember", "surrender", "tomorrow"];
    return [];
  })();

  const strictResolved = compatiblePreferredWords(strictKindBank);
  const useStrictOnly =
    strictResolved.length > 0 &&
    ["articleLeadWeak", "auxWeak", "linkWeak", "preCompactWeak", "postCompactWeak", "compactFunction"].includes(slot.kind);

  const prioritized = useStrictOnly
    ? [...strictResolved]
    : [
        ...strictResolved,
        ...compatiblePreferredWords(slot.compact && shape === "dum da" ? preferredWords : kindPreferredWords),
        ...compatiblePreferredWords(preferredWords),
      ];

  return [...new Set(prioritized.map((word) => normalizeWordKey(word)))]
    .filter(Boolean)
    .slice(0, limit);
}

function promptBankEntriesForSlot(slot, limit = 6, index = -1, slots = []) {
  return promptExamplesForSlot(slot, limit, index, slots)
    .map((word) => resolveLexiconEntry(word))
    .filter(Boolean)
    .filter((entry) =>
      entry.allowedLyricPatterns.some((pattern) =>
        patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
      ),
    )
    .filter((entry) => slotMatches(entry, slot.kind))
    .filter((entry, i, all) => all.findIndex((item) => item.text === entry.text) === i);
}

function promptBankExemplarSearch(slots = [], candidateLimit = 3) {
  const pools = slots.map((slot, index) =>
    promptBankEntriesForSlot(slot, slot.tokens.length === 1 ? 6 : 5, index, slots).slice(0, 5),
  );
  if (pools.some((pool) => pool.length === 0)) return [];

  const patternText = slots.map((slot) => slot.text).join(" ");
  let states = [{ entries: [], usedContent: new Set(), score: 0 }];
  const maxStatesPerStep = 48;

  for (let index = 0; index < pools.length; index += 1) {
    const nextStates = [];
    for (const state of states) {
      for (const entry of pools[index]) {
        if (entry.type !== "function" && state.usedContent.has(entry.text)) continue;

        const entries = state.entries.concat(entry);
        const entryWords = entries.map((item) => item.text);
        if (hasRepeatedWordEntries(entries) || hasTooManyColdWords(entries)) continue;

        let score = state.score;
        const prev = state.entries[state.entries.length - 1];
        if (entry.type === "content") score += 3;
        if (prev?.type === "function" && entry.type === "function") score -= 6;
        if (prev?.pos === "prep" && entry.pos === "prep") score -= 10;
        if (prev?.pos === "article" && entry.pos !== "noun") score -= 14;
        if (prev?.pos === "aux" && !["verb", "adj", "noun"].includes(entry.pos)) score -= 12;
        if (index === entries.length - 1 && hasWeakEnding(entries)) score -= 20;
        if (entries.length >= 3) {
          if (hasFunctionWordPile(entries)) score -= 18;
          if (hasBasicSyntaxGap(entries)) score -= 18;
          if (hasAwkwardVerbChain(entries)) score -= 18;
        }
        score += lineFamiliarityScore(entryWords);

        const nextUsedContent = new Set(state.usedContent);
        if (entry.type !== "function") nextUsedContent.add(entry.text);

        nextStates.push({ entries, usedContent: nextUsedContent, score });
      }
    }

    nextStates.sort((a, b) => b.score - a.score);
    states = nextStates.slice(0, maxStatesPerStep);
    if (states.length === 0) return [];
  }

  const candidates = states
    .map((state) => {
      const text = lineToText(state.entries);
      if (
        hasWeakEnding(state.entries) ||
        hasFunctionWordPile(state.entries) ||
        hasBasicSyntaxGap(state.entries) ||
        hasAwkwardVerbChain(state.entries)
      ) {
        return null;
      }
      if (!matchesSegmentationPlan(text, slots)) return null;
      const candidate = evaluateCandidateLineInternal({
        lineText: text,
        patternText,
        ideaText: "",
        rhymeTarget: "",
        source: "prompt-example",
        planKey: segmentationPlanKey(slots),
      });
      return candidate ? { text, score: candidate.score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates
    .filter((item, i, all) => all.findIndex((other) => other.text === item.text) === i)
    .slice(0, candidateLimit);
}

const PROMPT_EXAMPLE_CACHE = new Map();

function promptExampleCandidates(slots = []) {
  const key = segmentationPlanKey(slots);
  if (!PROMPT_EXAMPLE_CACHE.has(key)) {
    PROMPT_EXAMPLE_CACHE.set(key, promptBankExemplarSearch(slots, 3));
  }
  return PROMPT_EXAMPLE_CACHE.get(key) ?? [];
}

// ── Plan classification and naturalness ─────────────────────────

export function planKindsFromKey(planKey = "") {
  return planKey.split(" | ").map((part) => part.split("->")[1] ?? "").filter(Boolean);
}

export function planFrameSignature(planKey = "") {
  return planKindsFromKey(planKey).slice(0, 4).join("|");
}

export function planStartKind(planKey = "") {
  return planKindsFromKey(planKey)[0] ?? "";
}

export function planShapesFromKey(planKey = "") {
  return planKey.split(" | ").map((part) => (part.split("->")[0] ?? "").replaceAll("*", "").trim()).filter(Boolean);
}

export function classifyPlanLengthMode(planKey = "") {
  const shapes = planShapesFromKey(planKey);
  const lengths = shapes.map((shape) => (shape.match(/DUM|dum|da/gu) ?? []).length);
  const compactCount = lengths.filter((length) => length >= 2).length;
  const longCount = lengths.filter((length) => length >= 3).length;
  const oneCount = lengths.filter((length) => length === 1).length;

  if (compactCount === 1 && longCount === 0) return "short_words";
  if (longCount >= 1) return "long_flow";
  if (compactCount >= Math.ceil(lengths.length / 2)) return "multi_syllable_heavy";
  if (oneCount >= 4) return "mostly_short";
  return "mixed_lengths";
}

function planStartShape(planKey = "") {
  return planShapesFromKey(planKey)[0] ?? "";
}

function planLengthProfile(plan) {
  return plan.slots.map((slot) => slot.tokens.length).join("-");
}

function compactNeighborhoodSignature(plan) {
  const index = plan.slots.findIndex((slot) => slot.compact);
  if (index < 0) return "";
  const prev = plan.slots[index - 1]?.text ?? "";
  const next = plan.slots[index + 1]?.text ?? "";
  return `${prev}|${plan.slots[index].text}|${next}`;
}

export function planNaturalnessScore(plan) {
  const kinds = plan.slots.map((slot) => slot.kind ?? "");
  let score = 0;

  const first = kinds[0] ?? "";
  if (first === "articleLeadWeak") score += 10;
  else if (first === "noun") score += 8;
  else if (first === "content") score += 5;
  else if (first === "verb") score += 2;

  for (let index = 0; index < kinds.length; index += 1) {
    const kind = kinds[index];
    const next = kinds[index + 1] ?? "";
    const nextTwo = kinds[index + 2] ?? "";

    if (kind === "auxWeak" && (next === "verb" || next === "content")) score += 10;
    if (kind === "linkWeak" && (next === "noun" || next === "content" || next === "verb")) score += 6;
    if (kind === "compactFunction") {
      const prev = kinds[index - 1] ?? "";
      if (prev === "preCompactWeak") score -= 32;
      else if (prev === "verb" || prev === "content" || prev === "noun") score += 8;
      if (next === "postCompactWeak" && nextTwo === "noun") score += 10;
      else if (next === "noun") score += 8;
      else if (next === "postCompactWeak") score += 2;
    }
  }

  const weakKinds = new Set(["articleLeadWeak", "leadWeak", "auxWeak", "linkWeak", "preCompactWeak", "postCompactWeak"]);
  const singletonWeakCount = plan.slots.filter(
    (slot, index) => slot.tokens.length === 1 && weakKinds.has(kinds[index]),
  ).length;
  if (singletonWeakCount >= 4) score -= 10 + (singletonWeakCount - 4) * 4;
  if (singletonWeakCount >= 3 && !kinds.includes("auxWeak")) score -= 12;
  if (singletonWeakCount >= 4 && !kinds.includes("linkWeak")) score -= 8;

  if (
    kinds[0] === "articleLeadWeak" && kinds[1] === "noun" &&
    (kinds[2] === "linkWeak" || kinds[2] === "auxWeak") &&
    (kinds[3] === "verb" || kinds[3] === "content")
  ) {
    score += 10;
  }

  if (
    kinds[0] === "articleLeadWeak" &&
    (kinds[1] === "verb" || kinds[1] === "content") &&
    weakKinds.has(kinds[2] ?? "")
  ) {
    score -= 10;
  }

  const longMerged = plan.slots.filter((slot) => slot.mergedLoose && slot.tokens.length >= 3).length;
  score += longMerged * 3;

  for (let index = 0; index < plan.slots.length; index += 1) {
    const slot = plan.slots[index];
    const nextSlot = plan.slots[index + 1];
    const nextNounCoverage = nextSlot ? slotPosCoverageCount(nextSlot, ["noun"]) : 0;
    const nextContentCoverage = nextSlot ? slotPosCoverageCount(nextSlot, ["noun", "verb", "adj"]) : 0;

    if (slot.kind === "articleLeadWeak" && nextSlot && nextNounCoverage === 0) score -= 24;
    if (slot.kind === "auxWeak" && nextSlot && nextContentCoverage === 0) score -= 22;
    if (slot.kind === "compactFunction" && nextSlot && nextNounCoverage === 0) score -= 20;
    if (slot.kind === "verb" && slotPosCoverageCount(slot, ["verb"]) === 0) score -= 18;
    if (slot.kind === "noun" && slotPosCoverageCount(slot, ["noun"]) === 0) score -= 18;
    if (slot.kind === "noun" && slotPosCoverageCount(slot, ["noun"]) <= 3) score -= 8;
    if (slot.kind === "verb" && slotPosCoverageCount(slot, ["verb"]) <= 3) score -= 6;
    if (slot.kind === "compactFunction" && slotPosCoverageCount(slot, ["prep"]) <= 2) score -= 8;
  }

  return score;
}

function modePreferenceScore(plan, mode) {
  const lengths = plan.slots.map((slot) => slot.tokens.length);
  const ones = lengths.filter((length) => length === 1).length;
  const twos = lengths.filter((length) => length === 2).length;
  const threesPlus = lengths.filter((length) => length >= 3).length;
  const maxLength = Math.max(...lengths);
  const merged = plan.slots.filter((slot) => slot.mergedLoose).length;
  const startShape = plan.slots[0]?.text ?? "";
  let score = plan.baseScore ?? 0;

  if (mode === "short_words") {
    score += ones * 10 - twos * 4 - threesPlus * 12;
    if (startShape === "da DUM") score -= 8;
  } else if (mode === "mostly_short") {
    score += ones * 7 + Math.min(twos, 1) * 10 - Math.max(twos - 1, 0) * 3 - threesPlus * 10;
    if (twos === 0) score -= 10;
  } else if (mode === "mixed_lengths") {
    score += ones * 3 + twos * 8 + threesPlus * 4;
    if (ones === 0 || twos === 0) score -= 10;
  } else if (mode === "multi_syllable_heavy") {
    score += twos * 8 + threesPlus * 12 - ones * 3;
    if (twos + threesPlus < 2) score -= 18;
    if (startShape === "da") score -= 6;
    if (maxLength >= 5) score -= 20;
  } else if (mode === "long_flow") {
    score += threesPlus * 16 + merged * 5 - ones * 4;
    if (threesPlus === 0) score -= 25;
    if (startShape === "da") score -= 8;
    if (maxLength >= 5) score -= 8;
  }

  return score;
}

function segmentationSignature(slots = []) {
  return slots.map((slot) => slot.text).join(" | ");
}

// ── Plan selection and ranking ──────────────────────────────────

export function summarizeModePlans(patternText, limit = 5) {
  const parsedPattern = parsePatternDetailed(patternText);
  const planningLimit = Math.max(48, limit * 20);
  const coarsePlans = enumerateSegmentationPlans(parsedPattern, planningLimit).map((rawSlots, index) => {
    const slots = rawSlots.map((slot) => ({ ...slot }));
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      slots[slotIndex].kind = deriveSlotKindForPlanSlot(slots[slotIndex], slotIndex, slots);
    }
    return {
      index,
      slots,
      baseScore: 0,
      planKey: segmentationPlanKey(slots),
      mode: classifyPlanLengthMode(segmentationPlanKey(slots)),
      segmentation: segmentationSignature(slots),
      realizabilityScore: planRealizabilityScore(slots),
      naturalnessScore: planNaturalnessScore({ slots }),
      promptabilityScore: slots.reduce(
        (total, slot, slotIndex) => total + Math.min(promptCandidateBankForSlot(slot, 6, slotIndex, slots).length, 4),
        0,
      ),
      promptBankScore: 0,
      promptExamples: [],
    };
  });

  const coarseRanked = [...coarsePlans].sort(
    (a, b) =>
      b.realizabilityScore + b.naturalnessScore + b.promptabilityScore - (a.realizabilityScore + a.naturalnessScore + a.promptabilityScore),
  );

  const promptCandidateLimit = Math.max(limit * 6, 24);
  const promptRankableKeys = new Set(coarseRanked.slice(0, promptCandidateLimit).map((plan) => plan.planKey));

  const plans = coarseRanked.map((plan) => {
    if (!promptRankableKeys.has(plan.planKey)) return plan;

    const promptExamples = promptExampleCandidates(plan.slots);
    const promptBankScore =
      promptExamples.length > 0
        ? promptExamples.reduce((best, item, i) => Math.max(best, item.score - i * 3), Number.NEGATIVE_INFINITY)
        : -40;

    const selectionExample = promptExamples[0]?.text
      ?.split(/\s+/u)
      .map((piece) => piece.trim())
      .filter(Boolean);

    return {
      ...plan,
      promptExamples,
      promptBankScore,
      promptExampleCount: promptExamples.length,
      selectionExample: Array.isArray(selectionExample) && selectionExample.length === plan.slots.length
        ? selectionExample
        : undefined,
    };
  });

  const selected = [];
  const seenSegmentation = new Set();
  const seenStarts = new Set();
  const seenProfiles = new Set();
  const seenCompactNeighborhoods = new Set();
  const pool = [...plans].sort(
    (a, b) =>
      b.realizabilityScore + b.naturalnessScore + b.promptabilityScore + b.promptBankScore -
      (a.realizabilityScore + a.naturalnessScore + a.promptabilityScore + a.promptBankScore),
  );

  while (selected.length < limit) {
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const plan of pool) {
      if (seenSegmentation.has(plan.segmentation)) continue;

      const startSh = planStartShape(plan.planKey);
      const profile = planLengthProfile(plan);
      const cn = compactNeighborhoodSignature(plan);
      let score = plan.realizabilityScore + plan.naturalnessScore + plan.promptabilityScore * 2 + plan.promptBankScore * 2;

      if (plan.naturalnessScore < 0) score -= 40;
      else if (plan.naturalnessScore >= 20) score += 12;
      else if (plan.naturalnessScore >= 10) score += 6;

      if (plan.promptabilityScore < plan.slots.length * 2) score -= 20;

      if ((plan.promptExamples?.length ?? 0) === 0) score -= 50;
      else if ((plan.promptExamples?.length ?? 0) >= 2) score += 10;
      if ((plan.promptExampleCount ?? 0) > 0 && (plan.promptBankScore ?? 0) < 18) score -= 16;
      if ((plan.promptExampleCount ?? 0) === 0 && plan.promptabilityScore < plan.slots.length * 2.5) score -= 32;

      if (startSh && !seenStarts.has(startSh)) score += 6;
      if (profile && !seenProfiles.has(profile)) score += 8;
      if (cn && !seenCompactNeighborhoods.has(cn)) score += 5;

      if (best === null || score > bestScore) {
        best = plan;
        bestScore = score;
      }
    }

    if (!best) break;

    selected.push(best);
    seenSegmentation.add(best.segmentation);
    const ss = planStartShape(best.planKey);
    const pp = planLengthProfile(best);
    const cc = compactNeighborhoodSignature(best);
    if (ss) seenStarts.add(ss);
    if (pp) seenProfiles.add(pp);
    if (cc) seenCompactNeighborhoods.add(cc);
  }

  return selected;
}

export function selectPlanRepresentatives(eligible, candidateCount) {
  const grouped = new Map();

  for (const candidate of eligible) {
    const planKey = candidate.planKey ?? candidate.diagnostics?.structure ?? "unknown";
    if (!grouped.has(planKey)) grouped.set(planKey, []);
    grouped.get(planKey).push(candidate);
  }

  const planGroups = [...grouped.entries()]
    .map(([planKey, candidates]) => ({
      planKey,
      mode: classifyPlanLengthMode(planKey),
      candidates: candidates.sort((a, b) => b.score - a.score),
    }))
    .sort((a, b) => b.candidates[0].score - a.candidates[0].score);

  const modeOrder = [
    "short_words", "mostly_short", "mixed_lengths",
    "multi_syllable_heavy", "three_plus_focus", "long_flow",
  ];

  const selected = [];
  const seenTexts = new Set();
  const seenFrames = new Set();
  const seenStarts = new Set();
  const seenModes = new Set();

  function trySelectGroup(group, strictNoOverlap = false) {
    const representative = group.candidates[0];
    if (!representative) return;

    if (
      strictNoOverlap &&
      selected.some(
        (prior) =>
          contentOverlapScore(representative.text, prior.text) > 0 ||
          anchorSignature(representative.text) === anchorSignature(prior.text),
      )
    ) {
      return;
    }

    const frame = planFrameSignature(group.planKey);
    const startKind = planStartKind(group.planKey);
    if (strictNoOverlap && frame && seenFrames.has(frame)) return;
    if (strictNoOverlap && startKind === "articleLeadWeak" && seenStarts.has("articleLeadWeak")) return;
    if (seenTexts.has(representative.text)) return;

    selected.push({
      ...representative,
      planKey: group.planKey,
      planMode: group.mode,
      planAlternatives: group.candidates.map((c) => c.text),
      planCandidateCount: group.candidates.length,
    });
    seenTexts.add(representative.text);
    if (frame) seenFrames.add(frame);
    if (startKind) seenStarts.add(startKind);
    if (group.mode) seenModes.add(group.mode);
  }

  for (const mode of modeOrder) {
    const group = planGroups.find((item) => item.mode === mode);
    if (!group) continue;
    trySelectGroup(group, true);
    if (selected.length >= candidateCount) break;
  }

  if (selected.length < candidateCount) {
    for (const group of planGroups) {
      if (selected.some((item) => item.planKey === group.planKey)) continue;
      if (seenModes.has(group.mode)) continue;
      trySelectGroup(group, false);
      if (selected.length >= candidateCount) break;
    }
  }

  return selected.slice(0, candidateCount);
}

// ── Public inspection and filtering ─────────────────────────────

export function explainSlotPlanning(patternText, limit = 12) {
  const parsedPattern = parsePatternDetailed(patternText);
  return buildGenerationTemplates(parsedPattern).slice(0, limit).map((template, index) => ({
    index,
    baseScore: template.baseScore,
    key: template.slots.map((slot) => slot.kind).join(" "),
    slots: template.slots.map((slot) => ({
      text: slot.text,
      tokens: slot.tokens,
      compact: slot.compact,
      mergedLoose: Boolean(slot.mergedLoose),
      kind: slot.kind,
      coverage: slot.coverage,
    })),
  }));
}

export function summarizeSlotPlanNeeds(patternText, limit = 12) {
  return explainSlotPlanning(patternText)
    .slice(0, limit)
    .map((plan) => {
      const needMap = new Map();

      for (const slot of plan.slots) {
        const key = `${slot.kind}|${slot.tokens.join(" ")}`;
        if (!needMap.has(key)) {
          needMap.set(key, {
            kind: slot.kind,
            tokenShape: slot.tokens.join(" "),
            compact: slot.compact,
            mergedLoose: slot.mergedLoose,
            count: 0,
          });
        }
        needMap.get(key).count += 1;
      }

      return {
        index: plan.index,
        baseScore: plan.baseScore,
        key: plan.key,
        slots: plan.slots.map((slot) => ({
          text: slot.text,
          tokenShape: slot.tokens.join(" "),
          kind: slot.kind,
          compact: slot.compact,
          mergedLoose: slot.mergedLoose,
          coverage: slot.coverage,
        })),
        needs: [...needMap.values()],
      };
    });
}

export function filterPlanSegmentCandidates(slot, words = [], limit = 6) {
  if (!slot?.tokens?.length || !Array.isArray(words) || words.length === 0) return [];

  const compatible = words
    .map((word) => resolveLexiconEntry(word))
    .filter(Boolean)
    .filter((entry) =>
      entry.allowedLyricPatterns.some((pattern) =>
        patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
      ),
    )
    .filter((entry) => strictSlotKindMatch(entry, slot))
    .sort((a, b) => singleEntryFamiliarityScore(b, slot) - singleEntryFamiliarityScore(a, slot))
    .filter((entry, i, all) => all.findIndex((item) => item.text === entry.text) === i)
    .slice(0, limit);

  return compatible.map((entry) => entry.text);
}

export function promptCandidateBankForSlot(slot, limit = 6, index = -1, allSlots = []) {
  if (!slot?.tokens?.length) return [];

  const preferred = promptExamplesForSlot(slot, Math.max(limit, 8), index, allSlots);
  const spacedKey = slot.tokens.join(" ");
  const exactEntries = LYRIC_LEXICON_BY_PATTERN.get(spacedKey) ?? [];
  const relaxedEntries = slot.compact
    ? compactRelaxationPatterns(slot.tokens, true).flatMap((pattern) => LYRIC_LEXICON_BY_PATTERN.get(pattern.join(" ")) ?? [])
    : [];
  const next = index >= 0 && index < allSlots.length - 1 ? allSlots[index + 1] : null;
  const previous = index > 0 ? allSlots[index - 1] : null;
  const preferredSet = new Set(preferred.map((word) => normalizeWordKey(word)));

  const scored = [...new Map([...exactEntries, ...relaxedEntries].map((entry) => [entry.text, entry])).values()]
    .filter((entry) => promptSlotCompatibility(entry, slot))
    .map((entry) => {
      let score = promptContextScore(entry, slot, index, allSlots);
      if (preferredSet.has(entry.text)) score += 12;
      if ((next?.kind === "auxWeak" || previous?.kind === "postCompactWeak" || previous?.kind === "compactFunction")) {
        if (["world", "dream", "heart", "mind", "depths", "wave", "soul", "light", "sky", "shadow", "silence"].includes(entry.text)) {
          score += 8;
        }
      }
      if (next?.kind === "compactFunction") {
        if (["falling", "drifting", "slipping", "floating", "fading", "rising", "breaking", "turning", "moving", "coming", "sinking", "leaving", "melting"].includes(entry.text)) {
          score += 8;
        }
      }
      return { entry, score };
    })
    .filter(({ score, entry }) => {
      if (entry.type === "function") return true;
      if (slot.tokens.length >= 3) return score >= 2;
      return score >= 0;
    })
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry.text);

  const familiarOnly = scored.filter((word) => FAMILIAR_PROMPT_WORDS.has(normalizeWordKey(word)));
  const fallbackScored = familiarOnly.length >= Math.min(4, limit) ? familiarOnly : scored;

  return [...new Set([...preferred, ...fallbackScored].map((word) => normalizeWordKey(word)))]
    .filter(Boolean)
    .slice(0, limit);
}

// ── Internal evaluator (avoids circular dep with generation.js) ─

function evaluateCandidateLineInternal({
  lineText, patternText, ideaText, rhymeTarget = "",
  source = "external", planKey = "", aiSeedWords = [], aiSeedBuckets = {},
}) {
  const normalizedLine = lineText.trim();
  if (!normalizedLine) return null;

  const validation = validateLine(normalizedLine, patternText);
  if (!validation.isValid) return null;

  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const words = normalizeText(normalizedLine);
  const resolvedEntries = words.map((word) => resolveLexiconEntry(word)).filter(Boolean);
  if (resolvedEntries.length !== words.length) return null;
  if (
    hasWeakEnding(resolvedEntries) ||
    hasFunctionWordPile(resolvedEntries) ||
    hasBasicSyntaxGap(resolvedEntries) ||
    hasAwkwardVerbChain(resolvedEntries)
  ) {
    return null;
  }
  if (hasRepeatedWordEntries(resolvedEntries) || hasTooManyColdWords(resolvedEntries)) return null;

  const candidate = scoreCandidate(
    resolvedEntries, ideaText, desiredRhyme, 8,
    planKey || `${source} draft`, aiSeedWords,
  );
  return {
    ...candidate,
    validation,
    desiredRhyme: desiredRhyme || "none",
    source,
    aiSeedWords,
    aiSeedBuckets,
  };
}
