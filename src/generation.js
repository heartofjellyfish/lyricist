import { THEME_ALIASES } from "./stressConstants.js";
import { normalizeWordKey, normalizeText } from "./pronunciation.js";
import {
  LEXICON_BY_WORD,
  resolveLexiconEntry,
  lyricEntriesForPattern,
  deriveProgressiveForms,
  normalizeRhymeTarget,
  lexicalVariants,
} from "./lexicon.js";
import { parsePatternDetailed, patternsCompatible } from "./patternParser.js";
import { validateLine, matchesSegmentationPlan } from "./validation.js";
import { parseThemeTags, analyzeIdeaCoverage } from "./theme.js";
import {
  rhymeScore,
  themeScore,
  densityPenalty,
  sliceWeight,
  lyricPatternPenalty,
  slotMatchPenalty,
  slotMatches,
  lineToText,
  hasWeakEnding,
  hasFunctionWordPile,
  hasBasicSyntaxGap,
  hasAwkwardVerbChain,
  hasRepeatedWordEntries,
  hasTooManyColdWords,
  scoreCandidate,
  rhymeMaster,
  chooseDefaultRhyme,
  tasteGuardian,
  storyWeaver,
  clicheChecker,
  anchorSignature,
  planStructureScore,
  lineFamiliarityScore,
  lineIdeaScore,
} from "./scoring.js";
import {
  buildGenerationTemplates,
  slotPlanKey,
  chooseCandidatesForSlot,
  selectPlanRepresentatives,
  explainSlotPlanning,
  promptExamplesForSlot,
  deriveSlotKindForPlanSlot,
} from "./slotPlanning.js";
import { WORDNET_SEMANTIC_MAP } from "./generatedWordnetMap.js";
import { conceptMembers } from "./lyricConcepts.js";

// ── Core realization ────────────────────────────────────────────

function realizePattern(parsedPattern, themeTags, desiredRhyme, options = {}) {
  const results = [];
  const templates = buildGenerationTemplates(parsedPattern);
  const allowRepeatedFunctionWords = options.allowRepeatedFunctionWords ?? false;
  const broadSearch = options.broadSearch ?? false;
  const maxResults = options.maxResults ?? (broadSearch ? 120 : 240);
  const maxVisits = options.maxVisits ?? (broadSearch ? 1500 : 3000);
  const maxPerTemplate = options.maxPerTemplate ?? Math.max(6, Math.ceil(maxResults / Math.min(templates.length || 1, 8)));
  const aiSeedWords = options.aiSeedWords ?? [];
  const aiSeedBuckets = options.aiSeedBuckets ?? {};
  let visitCount = 0;

  function backtrack(slots, slotIndex, words, score, usedWords, templateResults) {
    if (results.length >= maxResults || templateResults.length >= maxPerTemplate || visitCount >= maxVisits) {
      return true;
    }
    visitCount += 1;

    if (slotIndex === slots.length) {
      templateResults.push({ words, score, templateKey: slotPlanKey(slots) });
      return results.length >= maxResults || templateResults.length >= maxPerTemplate;
    }

    const slot = slots[slotIndex];
    const isLastSlot = slotIndex === slots.length - 1;
    const candidates = chooseCandidatesForSlot(
      slot.kind, slot.tokens, themeTags, usedWords, isLastSlot, desiredRhyme,
      slot.compact, aiSeedWords, aiSeedBuckets,
    );
    const candidateLimit = broadSearch
      ? slot.compact ? 6 : slot.kind === "function" || slot.kind.endsWith("Weak") ? 8 : 5
      : slot.kind === "function" || slot.kind.endsWith("Weak") ? 8 : 6;

    for (const candidate of candidates.slice(0, candidateLimit)) {
      const nextUsedWords =
        allowRepeatedFunctionWords && candidate.entry.type === "function"
          ? new Set(usedWords)
          : new Set([...usedWords, candidate.entry.text]);
      const shouldStop = backtrack(
        slots, slotIndex + 1,
        words.concat(candidate.entry),
        score + candidate.score,
        nextUsedWords,
        templateResults,
      );
      if (shouldStop) return true;
    }

    return false;
  }

  for (const template of templates) {
    const templateResults = [];
    const shouldStop = backtrack(template.slots, 0, [], template.baseScore, new Set(), templateResults);
    results.push(...templateResults);
    if (shouldStop) break;
  }
  return results;
}

// ── Structured hybrid composition ───────────────────────────────

function composeStructuredHybridLines(
  parsedPattern, themeTags, desiredRhyme, ideaText, aiSeedWords, aiSeedBuckets,
) {
  const maxPerPlan = 4;
  const maxTotalResults = 24;
  const compactShape = parsedPattern.groups[5]?.tokens.join(" ");
  const templates = buildGenerationTemplates(parsedPattern).slice(0, 20);
  const aiSeedSet = new Set(aiSeedWords.map((word) => normalizeWordKey(word)));
  const groups = parsedPattern.groups;
  const directSentenceTemplate = null;

  if (directSentenceTemplate) {
    templates.unshift(directSentenceTemplate);
  }

  const results = [];
  const planCounts = new Map();
  const canAcceptForPlan = (planKey) => (planCounts.get(planKey) ?? 0) < maxPerPlan;
  const recordPlanCandidate = (candidate) => {
    const planKey = candidate.planKey ?? candidate.diagnostics?.structure ?? "unknown";
    if (!canAcceptForPlan(planKey)) return false;
    results.push(candidate);
    planCounts.set(planKey, (planCounts.get(planKey) ?? 0) + 1);
    return true;
  };

  const restrictStructuredEntriesForSlot = (slotKind, entries, slotIndex = -1, slots = []) => {
    const unique = entries.filter(
      (entry, index, all) => all.findIndex((item) => item.text === entry.text) === index,
    );
    const isFamiliarContentEntry = (entry) =>
      entry.type !== "content" ||
      aiSeedSet.has(entry.text) ||
      (entry.tags?.length ?? 0) > 0;

    const byPos = (allowed) => unique.filter((entry) => allowed.includes(entry.pos));
    const determinerPronouns = unique.filter((entry) => ["my", "your", "his", "her", "our", "their"].includes(entry.text));
    const previousKind = slotIndex > 0 ? slots[slotIndex - 1]?.kind : "";

    if (slotKind === "articleLeadWeak") {
      const articles = byPos(["article"]);
      return articles.length > 0 ? articles : determinerPronouns.length > 0 ? determinerPronouns : unique;
    }
    if (slotKind === "auxWeak") {
      const auxiliaries = byPos(["aux"]);
      const preferred = auxiliaries.filter((entry) => ["is", "was"].includes(entry.text));
      return preferred.length > 0 ? preferred : auxiliaries.length > 0 ? auxiliaries : unique;
    }
    if (slotKind === "linkWeak") {
      const preps = byPos(["prep"]);
      const conjs = byPos(["conj"]);
      return preps.length > 0 ? [...preps, ...conjs] : conjs.length > 0 ? conjs : unique;
    }
    if (slotKind === "preCompactWeak" || slotKind === "postCompactWeak") {
      const articles = byPos(["article"]);
      return [...articles, ...determinerPronouns].length > 0 ? [...articles, ...determinerPronouns] : unique;
    }
    if (slotKind === "compactFunction") {
      const preps = byPos(["prep"]);
      const preferredPrepOrder = new Map(["into", "under", "over", "after", "onto", "during"].map((word, i) => [word, i]));
      return preps.length > 0
        ? [...preps].sort((a, b) => {
            const aPref = preferredPrepOrder.has(a.text) ? preferredPrepOrder.get(a.text) : Number.POSITIVE_INFINITY;
            const bPref = preferredPrepOrder.has(b.text) ? preferredPrepOrder.get(b.text) : Number.POSITIVE_INFINITY;
            return aPref !== bPref ? aPref - bPref : a.text.localeCompare(b.text);
          })
        : unique;
    }
    if (slotKind === "content" && previousKind === "auxWeak") {
      const verbs = byPos(["verb"]);
      const adjectives = byPos(["adj"]);
      const nouns = byPos(["noun"]);
      const filtered = [...verbs, ...adjectives, ...nouns].filter(isFamiliarContentEntry);
      return filtered.length > 0 ? filtered : [...verbs, ...adjectives, ...nouns].length > 0 ? [...verbs, ...adjectives, ...nouns] : unique;
    }
    if (["noun", "verb", "content"].includes(slotKind) && slots[slotIndex]?.tokens?.length >= 2) {
      const filtered = unique.filter(isFamiliarContentEntry);
      if (slotKind === "noun" && slotIndex === slots.length - 1) return filtered;
      return filtered.length > 0 ? filtered : unique;
    }
    return unique;
  };

  for (const template of templates) {
    const templatePlanKey = slotPlanKey(template.slots);
    if (!canAcceptForPlan(templatePlanKey)) continue;
    const templateResults = [];
    const pools = template.slots.map((slot, index) =>
      restrictStructuredEntriesForSlot(
        slot.kind,
        chooseCandidatesForSlot(
          slot.kind, slot.tokens, themeTags, new Set(),
          index === template.slots.length - 1, desiredRhyme,
          slot.compact, aiSeedWords, aiSeedBuckets,
        )
          .slice(0, slot.kind.endsWith("Weak") || slot.kind === "articleLeadWeak" || slot.kind === "auxWeak" ? 6 : 8)
          .map((c) => c.entry),
        index,
        template.slots,
      ).slice(0, slot.kind.endsWith("Weak") || slot.kind === "articleLeadWeak" || slot.kind === "auxWeak" ? 4 : 6),
    );

    const backtrack = (index, words, usedWords) => {
      if (results.length >= maxTotalResults || templateResults.length >= maxPerPlan) return;
      if (index === pools.length) {
        if (
          hasWeakEnding(words) || hasFunctionWordPile(words) ||
          hasBasicSyntaxGap(words) || hasAwkwardVerbChain(words)
        ) return;

        const lineText = words.map((entry) => entry.text).join(" ");
        const candidate = evaluateCandidateLine({
          lineText,
          patternText: parsedPattern.groups.map((g) => g.text).join(" "),
          ideaText,
          rhymeTarget: desiredRhyme,
          source: "hybrid-structure",
          planKey: templatePlanKey,
          aiSeedWords,
          aiSeedBuckets,
        });
        if (candidate) templateResults.push(candidate);
        return;
      }

      for (const entry of pools[index]) {
        if (usedWords.has(entry.text) && entry.type !== "function") continue;
        const nextUsedWords =
          entry.type === "function" ? new Set(usedWords) : new Set([...usedWords, entry.text]);
        backtrack(index + 1, words.concat(entry), nextUsedWords);
      }
    };

    backtrack(0, [], new Set());
    const rankedTemplateResults = templateResults
      .sort((a, b) => b.score - a.score)
      .filter((candidate, index, all) => {
        const lastWord = normalizeText(candidate.text).at(-1) ?? "";
        return all.findIndex((other) => (normalizeText(other.text).at(-1) ?? "") === lastWord) === index;
      });

    for (const candidate of rankedTemplateResults) {
      recordPlanCandidate(candidate);
      if (results.length >= maxTotalResults) break;
    }
    if (results.length >= maxTotalResults) break;
  }

  return results;
}

// ── Sentence hybrid pattern matching ────────────────────────────

function matchesSentenceHybridPattern(parsedPattern) {
  const groups = parsedPattern.groups;
  return (
    groups.length === 8 &&
    !groups[0].compact && groups[0].tokens.join(" ") === "da" &&
    !groups[1].compact && groups[1].tokens.join(" ") === "DUM" &&
    !groups[2].compact && groups[2].tokens.join(" ") === "da" &&
    !groups[3].compact && groups[3].tokens.join(" ") === "DUM" &&
    !groups[4].compact && groups[4].tokens.join(" ") === "da" &&
    groups[5].compact && groups[5].tokens.join(" ") === "dum da" &&
    !groups[6].compact && groups[6].tokens.join(" ") === "da" &&
    !groups[7].compact && groups[7].tokens.join(" ") === "DUM"
  );
}

function composeSupplementalSentenceHybridLines(
  parsedPattern, desiredRhyme, ideaText, aiSeedWords, aiSeedBuckets, targetCount = 12,
) {
  if (!matchesSentenceHybridPattern(parsedPattern)) return [];

  const makeEntries = (words) =>
    words.map((word) => resolveLexiconEntry(word)).filter(Boolean);

  const startEntries = makeEntries(["the", "my"]);
  const auxEntries = makeEntries(["is", "are", "was"]);
  const tailEntries = makeEntries(["the", "my"]);
  const compactEntries =
    parsedPattern.groups[5]?.tokens.join(" ") === "dum da"
      ? lyricEntriesForPattern(["dum", "da"], {
          compact: true, pos: "prep",
          preferredWords: ["into", "under", "over", "after", "onto"],
        }).slice(0, 6)
      : lyricEntriesForPattern(parsedPattern.groups[5].tokens, {
          compact: true, pos: "prep",
          preferredWords: ["into", "under", "over", "after", "onto"],
        }).slice(0, 6);

  const subjectEntries = [...new Set([...(aiSeedBuckets.nouns ?? []), ...(aiSeedBuckets.singleWords ?? [])])]
    .map((word) => resolveLexiconEntry(word))
    .filter((entry) => entry && entry.pos === "noun" && entry.syllables === 1);

  const verbSourceWords = [...new Set([...(aiSeedBuckets.verbs ?? []), ...(aiSeedBuckets.singleWords ?? [])])];
  const derivedVerbWords = verbSourceWords.flatMap((word) => deriveProgressiveForms(word));
  const verbEntries = [...new Set([...verbSourceWords, ...derivedVerbWords])]
    .map((word) => resolveLexiconEntry(word))
    .filter((entry) => entry && entry.pos === "verb" && entry.syllables === 2);

  const endEntries = [...new Set([...(aiSeedBuckets.nouns ?? []), ...(aiSeedBuckets.singleWords ?? [])])]
    .map((word) => resolveLexiconEntry(word))
    .filter((entry) => entry && entry.pos === "noun" && entry.syllables === 1);

  const candidates = [];
  const seenFrames = new Set();
  const supplementalPlanKey = slotPlanKey([
    { text: "da", kind: "articleLeadWeak", mergedLoose: false, tokens: ["da"] },
    { text: "DUM", kind: "noun", mergedLoose: false, tokens: ["DUM"] },
    { text: "da", kind: "auxWeak", mergedLoose: false, tokens: ["da"] },
    { text: "DUM da", kind: "verb", mergedLoose: true, tokens: ["DUM", "da"] },
    { text: "dumda", kind: "compactFunction", mergedLoose: false, tokens: ["dum", "da"] },
    { text: "da", kind: "postCompactWeak", mergedLoose: false, tokens: ["da"] },
    { text: "DUM", kind: "noun", mergedLoose: false, tokens: ["DUM"] },
  ]);

  for (const subject of subjectEntries) {
    for (const verb of verbEntries) {
      for (const start of startEntries) {
        for (const compact of compactEntries) {
          for (const tail of tailEntries) {
            const possibleEndings = endEntries.filter((ending) => ending.text !== subject.text);
            for (const ending of possibleEndings) {
              const aux = auxEntries.find((entry) => entry.text === (subject.text.endsWith("s") ? "are" : "is")) ?? auxEntries[0];
              const words = [start, subject, aux, verb, compact, tail, ending];
              if (
                hasWeakEnding(words) || hasFunctionWordPile(words) ||
                hasBasicSyntaxGap(words) || hasAwkwardVerbChain(words)
              ) continue;

              const lineText = words.map((entry) => entry.text).join(" ");
              const candidate = evaluateCandidateLine({
                lineText,
                patternText: parsedPattern.groups.map((g) => g.text).join(" "),
                ideaText,
                rhymeTarget: desiredRhyme,
                source: "hybrid-structure",
                planKey: supplementalPlanKey,
                aiSeedWords,
                aiSeedBuckets,
              });
              if (!candidate) continue;

              const frameKey = [start.text, subject.text, aux.text, verb.text, compact.text, tail.text].join("|");
              if (seenFrames.has(frameKey)) continue;
              seenFrames.add(frameKey);
              candidates.push(candidate);
              if (candidates.length >= targetCount) return candidates;
            }
          }
        }
      }
    }
  }

  return candidates;
}

// ── Fallback composition ────────────────────────────────────────

function composeFallbackLines(parsedPattern, themeTags, desiredRhyme, ideaText) {
  if (parsedPattern.groups.length !== 6 || !parsedPattern.groups.at(-1)?.compact) return [];

  const slotTemplates = [
    ["adj", "noun", "function", "noun", "function", "noun"],
    ["noun", "noun", "function", "noun", "function", "noun"],
    ["adj", "noun", "function", "noun", "function", "adj"],
  ];

  const slotPoolsByTemplate = slotTemplates.map((template) =>
    template.map((kind, index) =>
      chooseCandidatesForSlot(
        kind,
        parsedPattern.groups[index].tokens,
        themeTags,
        new Set(),
        index === template.length - 1,
        desiredRhyme,
        parsedPattern.groups[index].compact,
      )
        .slice(0, index === template.length - 1 ? 4 : 3)
        .map((c) => c.entry),
    ),
  );

  const fallbackLines = [];

  for (const pools of slotPoolsByTemplate) {
    const [a, b, c, d, e, f] = pools;
    for (const first of a) {
      for (const second of b) {
        if (second.text === first.text) continue;
        for (const third of c) {
          for (const fourth of d) {
            if (fourth.text === first.text || fourth.text === second.text) continue;
            for (const fifth of e) {
              for (const sixth of f) {
                if ([first.text, second.text, fourth.text].includes(sixth.text)) continue;
                const lineText = [first, second, third, fourth, fifth, sixth].map((entry) => entry.text).join(" ");
                const candidate = evaluateCandidateLine({
                  lineText,
                  patternText: parsedPattern.groups.map((g) => g.text).join(" "),
                  ideaText,
                  rhymeTarget: desiredRhyme,
                  source: "fallback",
                });
                if (candidate) fallbackLines.push(candidate);
                if (fallbackLines.length >= 24) return fallbackLines;
              }
            }
          }
        }
      }
    }
  }

  return fallbackLines;
}

// ── Main generation pipeline ────────────────────────────────────

export function generateLyrics({
  patternText, ideaText, rhymeTarget = "", candidateCount = 5,
  aiSeedWords = [], aiSeedBuckets = {},
}) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const rawCandidates = [];

  let realizations = realizePattern(parsedPattern, themeTags, desiredRhyme);
  if (realizations.length === 0 && parsedPattern.groups.length > 4) {
    realizations = realizePattern(parsedPattern, themeTags, desiredRhyme, {
      broadSearch: true,
      allowRepeatedFunctionWords: true,
      aiSeedWords,
      aiSeedBuckets,
    });
  } else if (aiSeedWords.length > 0) {
    realizations = realizePattern(parsedPattern, themeTags, desiredRhyme, {
      aiSeedWords,
      aiSeedBuckets,
    });
  }

  for (const realization of realizations) {
    if (
      hasWeakEnding(realization.words) || hasFunctionWordPile(realization.words) ||
      hasBasicSyntaxGap(realization.words) || hasAwkwardVerbChain(realization.words)
    ) continue;
    rawCandidates.push(
      scoreCandidate(realization.words, ideaText, desiredRhyme, realization.score, realization.templateKey),
    );
  }

  if (aiSeedWords.length > 0 && rawCandidates.length < candidateCount) {
    rawCandidates.push(
      ...composeStructuredHybridLines(parsedPattern, themeTags, desiredRhyme, ideaText, aiSeedWords, aiSeedBuckets),
    );
  }

  if (rawCandidates.length === 0) {
    rawCandidates.push(...composeFallbackLines(parsedPattern, themeTags, desiredRhyme, ideaText));
  }

  const eligible = [];
  const seen = new Set();
  for (const candidate of rawCandidates.sort((a, b) => b.score - a.score)) {
    if (seen.has(candidate.text)) continue;
    const validation = validateLine(candidate.text, patternText);
    if (!validation.isValid) continue;

    seen.add(candidate.text);
    eligible.push({
      ...candidate,
      validation,
      desiredRhyme: desiredRhyme || "none",
      source: aiSeedWords.length > 0 ? "hybrid" : "local",
      aiSeedWords,
      aiSeedBuckets,
    });
  }

  let selected = selectPlanRepresentatives(eligible, candidateCount);

  if (selected.length < candidateCount && aiSeedWords.length > 0) {
    const supplemental = composeSupplementalSentenceHybridLines(
      parsedPattern, desiredRhyme, ideaText, aiSeedWords, aiSeedBuckets, candidateCount * 3,
    );

    for (const candidate of supplemental) {
      if (selected.some((prior) => prior.planKey === (candidate.planKey ?? candidate.diagnostics?.structure))) continue;
      if (selected.some((prior) => anchorSignature(candidate.text) === anchorSignature(prior.text))) continue;
      selected.push({
        ...candidate,
        planKey: candidate.planKey ?? candidate.diagnostics?.structure ?? "unknown",
        planAlternatives: [candidate.text],
        planCandidateCount: 1,
      });
      if (selected.length >= candidateCount) break;
    }
  }

  return selected.sort((a, b) => b.score - a.score);
}

// ── Candidate evaluation ────────────────────────────────────────

export function evaluateCandidateLine({
  lineText, patternText, ideaText, rhymeTarget = "",
  source = "external", planKey = "", aiSeedWords = [], aiSeedBuckets = {},
}) {
  const normalizedLine = lineText.trim();
  if (!normalizedLine) return null;

  const validation = validateLine(normalizedLine, patternText);
  if (!validation.isValid) return null;

  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const words = normalizeText(normalizedLine);
  const resolvedEntries = words.map((word) => resolveLexiconEntry(word)).filter(Boolean);
  if (resolvedEntries.length !== words.length) return null;
  if (
    hasWeakEnding(resolvedEntries) || hasFunctionWordPile(resolvedEntries) ||
    hasBasicSyntaxGap(resolvedEntries) || hasAwkwardVerbChain(resolvedEntries)
  ) return null;
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

// ── Segmentation plan realization ───────────────────────────────

export function realizeSegmentationPlan({
  patternText, ideaText, rhymeTarget = "", plan,
  segmentOptions = [], candidateLimit = 12,
}) {
  if (!plan?.slots?.length) return [];

  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);

  const pools = plan.slots.map((slot, index) => {
    const requested = Array.isArray(segmentOptions[index]) ? segmentOptions[index] : [];
    const compatibleEntries = requested
      .map((word) => resolveLexiconEntry(word))
      .filter(Boolean)
      .filter((entry) =>
        entry.allowedLyricPatterns.some((pattern) =>
          patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
        ),
      )
      .filter((entry) => slotMatches(entry, slot.kind));

    const dedupedCompatible = compatibleEntries.filter(
      (entry, i, all) => all.findIndex((item) => item.text === entry.text) === i,
    );

    return dedupedCompatible.length > 0 ? dedupedCompatible.slice(0, 6) : [];
  });

  if (pools.some((pool) => pool.length === 0)) return [];

  const seenTexts = new Set();
  const lines = [];

  function backtrack(index, entries, usedContent) {
    if (lines.length >= candidateLimit) return;
    if (index === pools.length) {
      const text = lineToText(entries);
      if (
        hasWeakEnding(entries) || hasFunctionWordPile(entries) ||
        hasBasicSyntaxGap(entries) || hasAwkwardVerbChain(entries)
      ) return;
      const validation = validateLine(text, patternText);
      if (!validation.isValid || !matchesSegmentationPlan(text, plan.slots) || seenTexts.has(text)) return;
      seenTexts.add(text);
      lines.push(
        scoreCandidate(entries, ideaText, desiredRhyme, plan.baseScore ?? 0, plan.planKey ?? slotPlanKey(plan.slots)),
      );
      return;
    }

    for (const entry of pools[index]) {
      if (entry.type !== "function" && usedContent.has(entry.text)) continue;
      const nextUsed = new Set(usedContent);
      if (entry.type !== "function") nextUsed.add(entry.text);
      backtrack(index + 1, entries.concat(entry), nextUsed);
      if (lines.length >= candidateLimit) break;
    }
  }

  backtrack(0, [], new Set());
  return lines.sort((a, b) => b.score - a.score);
}

// ── Debug functions ─────────────────────────────────────────────

export function debugComposeFallback({ patternText, ideaText, rhymeTarget = "" }) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget) || chooseDefaultRhyme(themeTags);
  return composeFallbackLines(parsedPattern, themeTags, desiredRhyme, ideaText);
}

export function debugStructuredHybridCandidates({
  patternText, ideaText, rhymeTarget = "", aiSeedWords = [], aiSeedBuckets = {},
}) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const candidates = composeStructuredHybridLines(
    parsedPattern, themeTags, desiredRhyme, ideaText, aiSeedWords, aiSeedBuckets,
  );

  const grouped = new Map();
  for (const candidate of candidates) {
    const planKey = candidate.planKey ?? candidate.diagnostics?.structure ?? "unknown";
    if (!grouped.has(planKey)) grouped.set(planKey, []);
    grouped.get(planKey).push(candidate.text);
  }

  return [...grouped.entries()].map(([planKey, texts]) => ({
    planKey,
    count: texts.length,
    texts: texts.slice(0, 10),
  }));
}

export function debugSlotCandidates({ patternText, ideaText, rhymeTarget = "", slotKinds = [] }) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget) || chooseDefaultRhyme(themeTags);
  return parsedPattern.groups.map((group, index) => ({
    index,
    group: group.text,
    kind: slotKinds[index] ?? (group.tokens.every((token) => token === "da") ? "function" : "content"),
    candidates: chooseCandidatesForSlot(
      slotKinds[index] ?? (group.tokens.every((token) => token === "da") ? "function" : "content"),
      group.tokens, themeTags, new Set(),
      index === parsedPattern.groups.length - 1, desiredRhyme, group.compact,
    )
      .slice(0, 12)
      .map((item) => ({ text: item.entry.text, score: item.score, pos: item.entry.pos })),
  }));
}

export function debugPlanAssembly({
  patternText, ideaText, rhymeTarget = "", aiSeedWords = [], aiSeedBuckets = {},
  planIndex = 0, candidateLimit = 6,
}) {
  const parsedPattern = parsePatternDetailed(patternText);
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const templates = buildGenerationTemplates(parsedPattern);
  const template = templates[planIndex];
  if (!template) return null;

  const restrictStructuredEntriesForSlot = (slotKind, entries, slotIndex = -1, slots = []) => {
    const unique = entries.filter((entry, i, all) => all.findIndex((item) => item.text === entry.text) === i);
    const byPos = (allowed) => unique.filter((entry) => allowed.includes(entry.pos));
    const determinerPronouns = unique.filter((entry) => ["my", "your", "his", "her", "our", "their"].includes(entry.text));
    const previousKind = slotIndex > 0 ? slots[slotIndex - 1]?.kind : "";

    if (slotKind === "articleLeadWeak") {
      const articles = byPos(["article"]);
      return articles.length > 0 ? articles : determinerPronouns.length > 0 ? determinerPronouns : unique;
    }
    if (slotKind === "auxWeak") {
      const auxiliaries = byPos(["aux"]);
      const preferred = auxiliaries.filter((entry) => ["is", "are", "was"].includes(entry.text));
      return preferred.length > 0 ? preferred : auxiliaries.length > 0 ? auxiliaries : unique;
    }
    if (slotKind === "linkWeak") {
      const preps = byPos(["prep"]);
      const conjs = byPos(["conj"]);
      return preps.length > 0 ? [...preps, ...conjs] : conjs.length > 0 ? conjs : unique;
    }
    if (slotKind === "preCompactWeak" || slotKind === "postCompactWeak") {
      const articles = byPos(["article"]);
      return [...articles, ...determinerPronouns].length > 0 ? [...articles, ...determinerPronouns] : unique;
    }
    if (slotKind === "compactFunction") {
      const preps = byPos(["prep"]);
      return preps.length > 0 ? preps : unique;
    }
    if (slotKind === "content" && previousKind === "auxWeak") {
      const verbs = byPos(["verb"]);
      const adjectives = byPos(["adj"]);
      const nouns = byPos(["noun"]);
      return [...verbs, ...adjectives, ...nouns].length > 0 ? [...verbs, ...adjectives, ...nouns] : unique;
    }
    return unique;
  };

  const slotPools = template.slots.map((slot, index) => {
    const rawCandidates = chooseCandidatesForSlot(
      slot.kind, slot.tokens, themeTags, new Set(),
      index === template.slots.length - 1, desiredRhyme,
      slot.compact, aiSeedWords, aiSeedBuckets,
    );
    const rawEntries = rawCandidates.map((c) => c.entry);
    const restrictedEntries = restrictStructuredEntriesForSlot(slot.kind, rawEntries, index, template.slots);
    const cappedEntries = restrictedEntries.slice(
      0,
      slot.kind.endsWith("Weak") || slot.kind === "articleLeadWeak" || slot.kind === "auxWeak" ? 4 : candidateLimit,
    );

    return {
      slot: {
        text: slot.text, tokens: slot.tokens, compact: slot.compact,
        mergedLoose: Boolean(slot.mergedLoose), kind: slot.kind,
      },
      rawTop: rawCandidates.slice(0, candidateLimit).map((c) => ({
        text: c.entry.text, pos: c.entry.pos, score: c.score,
      })),
      restrictedTop: cappedEntries.map((entry) => ({ text: entry.text, pos: entry.pos })),
    };
  });

  const seenTexts = new Set();
  const survivors = [];
  const failures = {
    weakEnding: [], functionPile: [], syntaxGap: [],
    awkwardVerbChain: [], exactValidation: [], duplicateText: [],
  };

  const backtrack = (index, words, usedWords) => {
    if (survivors.length >= 20) return;
    if (index === slotPools.length) {
      const lineText = words.map((entry) => entry.text).join(" ");
      if (hasWeakEnding(words)) { failures.weakEnding.push(lineText); return; }
      if (hasFunctionWordPile(words)) { failures.functionPile.push(lineText); return; }
      if (hasBasicSyntaxGap(words)) { failures.syntaxGap.push(lineText); return; }
      if (hasAwkwardVerbChain(words)) { failures.awkwardVerbChain.push(lineText); return; }
      const validation = validateLine(lineText, patternText);
      if (!validation.isValid) { failures.exactValidation.push(`${lineText} -> ${validation.reason}`); return; }
      if (seenTexts.has(lineText)) { failures.duplicateText.push(lineText); return; }
      seenTexts.add(lineText);
      survivors.push(lineText);
      return;
    }

    for (const entry of slotPools[index].restrictedTop) {
      if (usedWords.has(entry.text) && resolveLexiconEntry(entry.text)?.type !== "function") continue;
      const lexEntry = resolveLexiconEntry(entry.text);
      if (!lexEntry) continue;
      const nextUsedWords =
        lexEntry.type === "function" ? new Set(usedWords) : new Set([...usedWords, lexEntry.text]);
      backtrack(index + 1, words.concat(lexEntry), nextUsedWords);
    }
  };

  backtrack(0, [], new Set());

  return {
    planIndex,
    planKey: slotPlanKey(template.slots),
    baseScore: template.baseScore,
    slots: template.slots.map((slot) => ({
      text: slot.text, kind: slot.kind, tokens: slot.tokens,
      compact: slot.compact, mergedLoose: Boolean(slot.mergedLoose), coverage: slot.coverage,
    })),
    slotPools,
    survivors,
    failureCounts: Object.fromEntries(
      Object.entries(failures).map(([key, values]) => [key, values.length]),
    ),
    failureSamples: Object.fromEntries(
      Object.entries(failures).map(([key, values]) => [key, values.slice(0, 10)]),
    ),
  };
}

export function explainCandidateDebug({
  lineText, patternText, ideaText, rhymeTarget = "",
  source = "local", aiSeedWords = [], aiSeedBuckets = {},
}) {
  const normalizedLine = lineText.trim();
  const parsedPattern = parsePatternDetailed(patternText);
  const validation = validateLine(normalizedLine, patternText);
  const coverage = analyzeIdeaCoverage(ideaText);
  const normalizedIdeaWords = normalizeText(ideaText);
  const desiredRhyme = normalizeRhymeTarget(rhymeTarget);
  const words = normalizeText(normalizedLine);
  const themeTags = parseThemeTags(ideaText, aiSeedWords);
  const entries =
    validation.entries ??
    words.map((word) => resolveLexiconEntry(word)).filter(Boolean);
  const story = storyWeaver(normalizedLine, ideaText);
  const taste = tasteGuardian(normalizedLine, ideaText);
  const rhyme = rhymeMaster(words.at(-1) ?? "", desiredRhyme);
  const cliche = clicheChecker(normalizedLine);

  const ideaExpansion = normalizedIdeaWords.map((word) => {
    const variants = lexicalVariants(word);
    const aliases = [...new Set(variants.flatMap((v) => THEME_ALIASES[v] ?? []))].filter((item) =>
      LEXICON_BY_WORD.has(item),
    );
    const concepts = [...new Set(variants.flatMap((v) => conceptMembers(v)))].filter((item) =>
      LEXICON_BY_WORD.has(item),
    );
    const wordnet = [...new Set(variants.flatMap((v) => WORDNET_SEMANTIC_MAP[v] ?? []))].filter((item) =>
      LEXICON_BY_WORD.has(item),
    );
    return { word, variants, aliases, concepts, wordnet };
  });

  let tokenOffset = 0;
  const slotTrace = entries.map((entry, index) => {
    const slice = parsedPattern.tokens.slice(tokenOffset, tokenOffset + entry.lexicalPattern.length);
    tokenOffset += slice.length;
    const matchedPattern =
      entry.allowedLyricPatterns.find((pattern) => patternsCompatible(pattern, slice, false)) ??
      entry.allowedLyricPatterns[0] ?? [];
    return {
      index,
      word: entry.text,
      pos: entry.pos,
      type: entry.type,
      tags: entry.tags,
      expected: slice,
      lexicalPattern: entry.lexicalPattern,
      preferredLyricPatterns: entry.preferredLyricPatterns,
      allowedLyricPatterns: entry.allowedLyricPatterns,
      matchedPattern,
      rhyme: entry.rhyme,
      compactPattern: entry.compactPattern,
      spacedPattern: entry.spacedPattern,
    };
  });

  return {
    source,
    input: {
      patternText,
      patternGroups: parsedPattern.groups.map((g) => ({ text: g.text, tokens: g.tokens, compact: g.compact })),
      flatTokens: parsedPattern.tokens,
      rhymeTarget,
      normalizedRhyme: desiredRhyme || "none",
      ideaText,
    },
    planning: explainSlotPlanning(patternText),
    ideaExpansion: {
      coverage,
      expandedWords: ideaExpansion,
      finalThemeTags: [...themeTags].sort(),
      aiSeedWords: [...new Set(aiSeedWords.map((word) => normalizeWordKey(word)))].filter(Boolean),
      aiSeedBuckets,
    },
    slotTrace,
    validation: {
      isValid: validation.isValid,
      reason: validation.reason,
      lexicalFlattened: entries.flatMap((entry) => entry.lexicalPattern),
    },
    scoring: {
      rhyme: { ok: rhyme.ok, message: rhyme.message },
      story,
      taste,
      cliche,
    },
  };
}
