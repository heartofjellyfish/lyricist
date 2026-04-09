export function normalizeWord(word) {
  return String(word || "").toLowerCase();
}

export function lowerCaseWord(word) {
  return normalizeWord(word);
}

export function splitWords(text) {
  return String(text || "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9'\s]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

export function splitLowerCaseWords(text) {
  return splitWords(text);
}

export function wordLookupForms(word) {
  const variants = new Set([word]);
  if (word === "children") {
    variants.add("child");
  } else if (word === "kids") {
    variants.add("kid");
  } else if (word.endsWith("ies") && word.length > 3) {
    variants.add(`${word.slice(0, -3)}y`);
  } else if (word.endsWith("s") && word.length > 3) {
    variants.add(word.slice(0, -1));
  }
  return [...variants];
}
