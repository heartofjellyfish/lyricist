import { normalizeText } from "./pronunciation.js";
import { resolveLexiconEntry } from "./lexicon.js";
import {
  parsePatternDetailed,
  matchesPattern,
  patternsCompatible,
} from "./patternParser.js";

function matchesCompactGroups(patternGroups, matchedEntryPatterns) {
  const tokenToEntryIndex = [];

  matchedEntryPatterns.forEach((entryPattern, entryIndex) => {
    for (let index = 0; index < entryPattern.length; index += 1) {
      tokenToEntryIndex.push(entryIndex);
    }
  });

  let tokenOffset = 0;
  for (const group of patternGroups) {
    const groupEntryIndexes = tokenToEntryIndex.slice(tokenOffset, tokenOffset + group.tokens.length);
    if (groupEntryIndexes.length !== group.tokens.length) {
      return false;
    }

    if (group.compact && new Set(groupEntryIndexes).size !== 1) {
      return false;
    }

    tokenOffset += group.tokens.length;
  }

  return true;
}

export function validateLine(lineText, patternText) {
  const parsedPattern = parsePatternDetailed(patternText);
  const { tokens, groups } = parsedPattern;
  const words = normalizeText(lineText);
  const entries = [];

  for (const word of words) {
    const entry = resolveLexiconEntry(word);
    if (!entry) {
      return {
        isValid: false,
        reason: `Unknown word in pronunciation lexicon: "${word}"`,
        tokens,
        entries: [],
      };
    }
    entries.push(entry);
  }

  const lexicalFlattened = entries.flatMap((entry) => entry.lexicalPattern);
  let matchedTokens = [];
  const matchedEntryPatterns = [];
  let usedCompactRelaxation = false;
  for (const entry of entries) {
    let matched = false;
    for (const allowedPattern of entry.allowedLyricPatterns) {
      const nextSlice = tokens.slice(matchedTokens.length, matchedTokens.length + allowedPattern.length);
      const compactGroup = groups.find((group, index) => {
        const tokenStart = groups.slice(0, index).reduce((sum, item) => sum + item.tokens.length, 0);
        return tokenStart === matchedTokens.length;
      });
      const compact = compactGroup?.compact ?? false;

      if (patternsCompatible(allowedPattern, nextSlice, compact)) {
        matchedTokens = matchedTokens.concat(nextSlice);
        matchedEntryPatterns.push(allowedPattern);
        if (!matchesPattern(allowedPattern, nextSlice)) {
          usedCompactRelaxation = true;
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      matchedTokens = [];
      break;
    }
  }

  const hasCompactGroups = groups.some((group) => group.compact);
  const compactGroupMismatch =
    hasCompactGroups &&
    matchedEntryPatterns.length > 0 &&
    !matchesCompactGroups(groups, matchedEntryPatterns);

  if (matchesPattern(lexicalFlattened, tokens) && !compactGroupMismatch) {
    return { isValid: true, reason: "Exact stress match.", tokens, groups, entries };
  }

  if (matchesPattern(matchedTokens, tokens) && !compactGroupMismatch) {
    return {
      isValid: true,
      reason: usedCompactRelaxation
        ? "Acceptable compact fallback match."
        : "Acceptable lyric placement match.",
      tokens,
      groups,
      entries,
    };
  }

  if (compactGroupMismatch) {
    return {
      isValid: false,
      reason: "Compact stress groups should stay together inside a single lexical unit.",
      tokens,
      groups,
      entries,
    };
  }

  return {
    isValid: false,
    reason: `Stress pattern mismatch. Expected ${tokens.join(" ")}, got ${lexicalFlattened.join(" ")}.`,
    tokens,
    groups,
    entries,
  };
}

export function matchesSegmentationPlan(lineText, planSlots = []) {
  const normalizedLine = String(lineText || "").trim();
  if (!normalizedLine || !Array.isArray(planSlots) || planSlots.length === 0) {
    return false;
  }

  const words = normalizeText(normalizedLine);
  if (words.length !== planSlots.length) {
    return false;
  }

  for (let index = 0; index < planSlots.length; index += 1) {
    const slot = planSlots[index];
    const entry = resolveLexiconEntry(words[index]);
    if (!entry) {
      return false;
    }
    const compatible = entry.allowedLyricPatterns.some((pattern) =>
      patternsCompatible(pattern, slot.tokens, Boolean(slot.compact)),
    );
    if (!compatible) {
      return false;
    }
  }

  return true;
}
