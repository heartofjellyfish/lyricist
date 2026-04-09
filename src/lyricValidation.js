export function createLineValidation({
  parseStressPattern,
  splitLowerCaseWords,
  resolveLexiconEntry,
  isExactStressMatch,
  isLyricStressCompatible,
  matchesCompactGroups,
}) {
  function validateLineStress(lineText, patternText) {
    const parsedPattern = parseStressPattern(patternText);
    const { tokens, groups } = parsedPattern;
    const words = splitLowerCaseWords(lineText);
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

        if (isLyricStressCompatible(allowedPattern, nextSlice, compact)) {
          matchedTokens = matchedTokens.concat(nextSlice);
          matchedEntryPatterns.push(allowedPattern);
          if (!isExactStressMatch(allowedPattern, nextSlice)) {
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

    if (isExactStressMatch(lexicalFlattened, tokens) && !compactGroupMismatch) {
      return {
        isValid: true,
        reason: "Exact stress match.",
        tokens,
        groups,
        entries,
      };
    }

    if (isExactStressMatch(matchedTokens, tokens) && !compactGroupMismatch) {
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

  function lineMatchesSegmentationPlan(lineText, planSlots = []) {
    const normalizedLine = String(lineText || "").trim();
    if (!normalizedLine || !Array.isArray(planSlots) || planSlots.length === 0) {
      return false;
    }

    const words = splitLowerCaseWords(normalizedLine);
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
        isLyricStressCompatible(pattern, slot.tokens, Boolean(slot.compact)),
      );
      if (!compatible) {
        return false;
      }
    }

    return true;
  }

  return {
    lineMatchesSegmentationPlan,
    validateLineStress,
  };
}
