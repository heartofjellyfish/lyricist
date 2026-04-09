const PATTERN_GROUP_REGEX = /DUM|Dum|dum|da|Da/gu;

function normalizeStressToken(token) {
  if (token === "DUM" || token === "Dum") {
    return "DUM";
  }
  if (token === "dum") {
    return "dum";
  }
  if (token === "da" || token === "Da") {
    return "da";
  }
  throw new Error("Use only DUM, dum, and da in the pattern field.");
}

function parsePatternGroup(groupText) {
  const rawTokens = groupText.match(PATTERN_GROUP_REGEX) ?? [];
  if (rawTokens.length === 0) {
    throw new Error("Use only DUM, dum, and da in the pattern field.");
  }

  const tokens = rawTokens.map(normalizeStressToken);
  const compact = rawTokens.length > 1 && rawTokens.join("") === groupText;

  return {
    text: groupText,
    tokens,
    compact,
  };
}

export function parseStressPattern(patternText) {
  const trimmed = String(patternText || "").trim();
  if (!trimmed) {
    throw new Error("Enter a stress pattern first.");
  }

  const groups = trimmed
    .split(/\s+/u)
    .filter(Boolean)
    .map(parsePatternGroup);

  return {
    groups,
    tokens: groups.flatMap((group) => group.tokens),
  };
}

export function parseStressTokens(patternText) {
  return parseStressPattern(patternText).tokens;
}

export function isExactStressMatch(wordPattern, slice) {
  return wordPattern.length === slice.length && wordPattern.every((token, index) => token === slice[index]);
}

export function getCompactStressVariants(slice, compact) {
  if (!compact) {
    return [slice];
  }

  const variants = new Map();
  const queue = [slice];
  variants.set(slice.join(" "), slice);

  while (queue.length > 0) {
    const current = queue.shift();
    current.forEach((token, index) => {
      if (token === "dum") {
        const promoted = [...current];
        promoted[index] = "DUM";
        const key = promoted.join(" ");
        if (!variants.has(key)) {
          variants.set(key, promoted);
          queue.push(promoted);
        }
      }
    });
  }

  return [...variants.values()];
}

export function getLyricStressVariants(slice, compact) {
  const variants = new Map();
  const queue = [slice];
  variants.set(slice.join(" "), slice);

  while (queue.length > 0) {
    const current = queue.shift();

    current.forEach((token, index) => {
      if (token === "dum") {
        const relaxed = [...current];
        relaxed[index] = "da";
        const relaxedKey = relaxed.join(" ");
        if (!variants.has(relaxedKey)) {
          variants.set(relaxedKey, relaxed);
          queue.push(relaxed);
        }
      }

      if (compact && token === "dum") {
        const promoted = [...current];
        promoted[index] = "DUM";
        const promotedKey = promoted.join(" ");
        if (!variants.has(promotedKey)) {
          variants.set(promotedKey, promoted);
          queue.push(promoted);
        }
      }
    });
  }

  return [...variants.values()];
}

export function isLyricStressCompatible(wordPattern, slice, compact) {
  return getLyricStressVariants(slice, compact).some((variant) => isExactStressMatch(wordPattern, variant));
}
