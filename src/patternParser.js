import { PATTERN_GROUP_REGEX } from "./stressConstants.js";

function normalizeStressToken(token) {
  const lowered = token.toLowerCase();

  if (lowered === "dum") {
    return token === "dum" ? "dum" : "DUM";
  }

  if (lowered === "da") {
    return "da";
  }

  throw new Error("Pattern must contain only DUM, dum, and da tokens.");
}

function parsePatternGroup(groupText) {
  const matches = groupText.match(PATTERN_GROUP_REGEX) ?? [];
  if (matches.length === 0 || matches.join("") !== groupText) {
    throw new Error("Pattern must contain only DUM, dum, and da tokens.");
  }

  const tokens = matches.map(normalizeStressToken);
  return {
    text: groupText,
    tokens,
    compact: tokens.length > 1,
  };
}

export function parsePatternDetailed(patternText) {
  const groups = patternText.match(/[A-Za-z]+/gu) ?? [];

  if (groups.length === 0) {
    throw new Error("Pattern must contain only DUM, dum, and da tokens.");
  }

  const parsedGroups = groups.map(parsePatternGroup);
  return {
    groups: parsedGroups,
    tokens: parsedGroups.flatMap((group) => group.tokens),
  };
}

export function parsePattern(patternText) {
  return parsePatternDetailed(patternText).tokens;
}

export function matchesPattern(wordPattern, slice) {
  return (
    wordPattern.length === slice.length &&
    wordPattern.every((token, index) => token === slice[index])
  );
}

export function compactRelaxationPatterns(slice, compact) {
  if (!compact) {
    return [];
  }

  const relaxedPatterns = new Map();
  const queue = [slice];

  while (queue.length > 0) {
    const current = queue.shift();
    current.forEach((token, index) => {
      if (token !== "dum") {
        return;
      }
      const relaxed = [...current];
      relaxed[index] = "da";
      const key = relaxed.join(" ");
      if (!relaxedPatterns.has(key)) {
        relaxedPatterns.set(key, relaxed);
        queue.push(relaxed);
      }
    });
  }

  return [...relaxedPatterns.values()];
}

export function lyricSliceVariants(slice, compact) {
  const variants = new Map();
  const queue = [slice];
  variants.set(slice.join(" "), slice);

  while (queue.length > 0) {
    const current = queue.shift();

    current.forEach((token, index) => {
      if (token === "dum") {
        const relaxed = [...current];
        relaxed[index] = "da";
        const key = relaxed.join(" ");
        if (!variants.has(key)) {
          variants.set(key, relaxed);
          queue.push(relaxed);
        }
      }

      if (compact && token === "dum") {
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

export function patternsCompatible(wordPattern, slice, compact) {
  return lyricSliceVariants(slice, compact).some((variant) => matchesPattern(wordPattern, variant));
}
