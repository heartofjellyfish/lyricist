export function extractStressToken(phoneme) {
  const match = String(phoneme || "").match(/([A-Z]{2})([012])/u);
  if (!match) {
    return null;
  }

  const stress = match[2];
  if (stress === "1") return "DUM";
  if (stress === "2") return "dum";
  return "da";
}

export function buildStressPattern(phonemes = []) {
  return phonemes.map(extractStressToken).filter(Boolean);
}

export function joinStressPattern(tokens = []) {
  return tokens.join(" ");
}
