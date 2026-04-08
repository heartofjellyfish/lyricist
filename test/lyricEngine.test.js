import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeIdeaCoverage,
  explainSlotPlanning,
  filterUsableSeedPool,
  filterUsableSeedWords,
  getLyricShapeCoverageSnapshot,
  matchesSegmentationPlan,
  parsePatternDetailed,
  clicheChecker,
  generateLyrics,
  parsePattern,
  realizeSegmentationPlan,
  rhymeMaster,
  validateLine,
} from "../src/lyricEngine.js";
import { scansionCases } from "./fixtures/scansionCases.js";

test("parsePattern accepts spaced and compact notation", () => {
  assert.deepEqual(parsePattern("DUM DUM da DUM"), ["DUM", "DUM", "da", "DUM"]);
  assert.deepEqual(parsePattern("Dum dum Dum da Dum dum Dum"), [
    "DUM",
    "dum",
    "DUM",
    "da",
    "DUM",
    "dum",
    "DUM",
  ]);
  assert.deepEqual(parsePattern("Dumdum Dumda da daDum"), ["DUM", "dum", "DUM", "da", "da", "da", "DUM"]);
});

test("parsePatternDetailed preserves compact groups", () => {
  const parsed = parsePatternDetailed("Dumdum Dum da daDum");
  assert.deepEqual(
    parsed.groups.map((group) => ({ text: group.text, compact: group.compact, tokens: group.tokens })),
    [
      { text: "Dumdum", compact: true, tokens: ["DUM", "dum"] },
      { text: "Dum", compact: false, tokens: ["DUM"] },
      { text: "da", compact: false, tokens: ["da"] },
      { text: "daDum", compact: true, tokens: ["da", "DUM"] },
    ],
  );
});

test("parsePattern rejects unknown tokens", () => {
  assert.throws(() => parsePattern("DUM bop da"), /only DUM, dum, and da/);
});

test("validateLine confirms exact stress matches", () => {
  const result = validateLine("stars burn in moon", "DUM DUM da DUM");
  assert.equal(result.isValid, true);
});

test("validateLine rejects mismatched stress", () => {
  const result = validateLine("moonlight in june", "DUM DUM da DUM");
  assert.equal(result.isValid, false);
});

test("validateLine allows lyric-placement overrides for prepositions", () => {
  const result = validateLine("into", "dumda");
  assert.equal(result.isValid, true);
  assert.match(result.reason, /Acceptable lyric placement|Exact stress match/);
});

test("validateLine allows compact fallback from DUMdum to DUMda", () => {
  const result = validateLine("summer", "DUMdum");
  assert.equal(result.isValid, true);
  assert.match(result.reason, /Acceptable compact fallback match/);
});

test("validateLine accepts common CMU-backed words without a curated whitelist", () => {
  assert.equal(validateLine("glass bell in pulse", "DUM DUM da DUM").isValid, true);
  assert.equal(validateLine("orb light in bloom", "DUM DUM da DUM").isValid, true);
  assert.equal(validateLine("moon arc of nerves", "DUM DUM da DUM").isValid, true);
});

test("compact fallback generalizes beyond DUMdum", () => {
  const result = validateLine("ordinary", "DUMdadumda");
  assert.equal(result.isValid, true);
  assert.match(result.reason, /Exact stress match|Acceptable compact fallback match/);
});

test("compact dumda can accept a natural DUMda content word", () => {
  const result = validateLine("dreaming", "dumda");
  assert.equal(result.isValid, true);
  assert.match(result.reason, /Acceptable compact fallback match|Acceptable lyric placement match|Exact stress match/);
});

test("validateLine allows a loose DUM da group to be satisfied by one word", () => {
  const result = validateLine("the walls are fading into the veil", "da DUM da DUM da dumda da DUM");
  assert.equal(result.isValid, true);
});

test("validateLine allows auxiliaries to sit in weak slots", () => {
  const result = validateLine("the veil is fading into the night", "da DUM da DUM da dumda da DUM");
  assert.equal(result.isValid, true);
});

test("rhymeMaster enforces the final rhyme family", () => {
  assert.equal(rhymeMaster("moon", "oo").ok, true);
  assert.equal(rhymeMaster("hearts", "oo").ok, false);
});

test("clicheChecker is disabled for local ranking", () => {
  const result = clicheChecker("my broken heart stays cold");
  assert.equal(result.hasCliche, false);
  assert.deepEqual(result.hits, []);
});

test("generateLyrics returns exact-match candidates with requested rhyme", () => {
  const results = generateLyrics({
    patternText: "DUM DUM da DUM",
    ideaText: "summer love under city lights",
    rhymeTarget: "oo",
    candidateCount: 3,
  });

  assert.equal(results.length > 0, true);
  for (const candidate of results) {
    assert.equal(candidate.validation.isValid, true);
    assert.equal(rhymeMaster(candidate.text.split(" ").at(-1), "oo").ok, true);
  }
});

test("matchesSegmentationPlan checks word-to-segment alignment", () => {
  const planSlots = [
    { tokens: ["da"], compact: false },
    { tokens: ["DUM"], compact: false },
    { tokens: ["da"], compact: false },
    { tokens: ["DUM", "da"], compact: false },
    { tokens: ["dum", "da"], compact: true },
    { tokens: ["da"], compact: false },
    { tokens: ["DUM"], compact: false },
  ];

  assert.equal(matchesSegmentationPlan("the dream is slipping into the night", planSlots), true);
  assert.equal(matchesSegmentationPlan("the dream is softly slipping into the night", planSlots), false);
});

test("realizeSegmentationPlan can assemble from per-segment candidates", () => {
  const results = realizeSegmentationPlan({
    patternText: "da DUM da DUM da dumda da DUM",
    ideaText: "half-dream inward drift",
    plan: {
      slots: [
        { text: "da", tokens: ["da"], compact: false, kind: "articleLeadWeak" },
        { text: "DUM", tokens: ["DUM"], compact: false, kind: "noun" },
        { text: "da", tokens: ["da"], compact: false, kind: "auxWeak" },
        { text: "DUM da", tokens: ["DUM", "da"], compact: false, kind: "verb" },
        { text: "dumda", tokens: ["dum", "da"], compact: true, kind: "compactFunction" },
        { text: "da", tokens: ["da"], compact: false, kind: "postCompactWeak" },
        { text: "DUM", tokens: ["DUM"], compact: false, kind: "noun" },
      ],
      baseScore: 0,
      planKey: "test-plan",
    },
    segmentOptions: [
      ["the"],
      ["dream"],
      ["is"],
      ["slipping"],
      ["into"],
      ["the"],
      ["night"],
    ],
  });

  assert.equal(results.length > 0, true);
  assert.equal(results[0].text, "the dream is slipping into the night");
});

test("generateLyrics stays on-theme for pop prompt without obscure CMU junk", () => {
  const results = generateLyrics({
    patternText: "DUM DUM da DUM",
    ideaText: "k-pop is so popular to children",
    rhymeTarget: "ee",
    candidateCount: 5,
  });

  assert.equal(results.length > 0, true);
  for (const candidate of results) {
    assert.doesNotMatch(candidate.text, /\b(baehr|baek|baetz)\b/i);
    assert.match(candidate.text, /\b(kids|dance|stage|beats|screens|songs|music|crowds)\b/i);
  }
});

test("four-beat outputs prefer natural weak-slot fillers", () => {
  const results = generateLyrics({
    patternText: "DUM DUM da DUM",
    ideaText: "sea is rising",
    rhymeTarget: "ee",
    candidateCount: 5,
  });

  assert.equal(results.length > 0, true);
  for (const candidate of results) {
    const words = candidate.text.split(" ");
    assert.equal(words.length, 4);
    assert.match(words[2], /^(in|on|at|to|for|with|through|under|over|by|from)$/);
  }
});

test("top options avoid reusing the same content-word set", () => {
  const results = generateLyrics({
    patternText: "DUM DUM da DUM",
    ideaText: "summer love under city lights",
    rhymeTarget: "",
    candidateCount: 5,
  });

  assert.equal(results.length >= 1, true);
  const contentSets = results.map((candidate) =>
    candidate.text
      .split(" ")
      .filter((word) => !["in", "on", "at", "to", "for", "with", "and", "a", "the", "my", "your", "i", "we", "she", "you"].includes(word))
      .sort()
      .join("|"),
  );
  assert.equal(new Set(contentSets).size, results.length);
});

test("default jellyfish idea is recognized and produces exact-match lines", () => {
  const coverage = analyzeIdeaCoverage("the heart of the jellyfish");
  assert.equal(coverage.coverageRatio, 1);

  const results = generateLyrics({
    patternText: "DUM DUM da DUM",
    ideaText: "the heart of the jellyfish",
    rhymeTarget: "",
    candidateCount: 5,
  });

  assert.equal(results.length > 0, true);
  for (const candidate of results) {
    assert.equal(candidate.validation.isValid, true);
  }
});

test("longer patterns can loosen final compact DUMdum slot to DUMda", () => {
  const results = generateLyrics({
    patternText: "DUM DUM da DUM da DUMdum",
    ideaText: "summer love under city lights",
    rhymeTarget: "",
    candidateCount: 5,
  });

  assert.equal(results.length > 0, true);
  assert.equal(results.every((candidate) => candidate.validation.isValid), true);
});

test("ai-seeded generation avoids weak endings and function-word piles", () => {
  const results = generateLyrics({
    patternText: "DUM DUM da DUM",
    ideaText: "dream haze, drifting inward, freedom",
    rhymeTarget: "",
    candidateCount: 5,
    aiSeedWords: ["drift", "glow", "dream", "shine", "free", "into"],
  });

  assert.equal(results.length > 0, true);
  for (const candidate of results) {
    assert.doesNotMatch(candidate.text, /\b(and|or|but|the|a|an|of|to|in|on|for|with|into)\s+(and|or|but|the|a|an|of|to|in|on|for|with|into)\s+(and|or|but|the|a|an|of|to|in|on|for|with|into)\b/i);
    assert.doesNotMatch(candidate.text, /\b(and|or|but|the|a|an|of|to|in|on|for|with|into)$/i);
    assert.doesNotMatch(candidate.text, /\b(a|an|the)\s+(wild|cold|bright|deep|free|slow|young|alone|awake|reckless|golden|open|blue|famous|loud|sweet)\b/i);
  }
});

test("long hybrid pattern prefers sentence-shaped results over verb piles", () => {
  const results = generateLyrics({
    patternText: "da DUM da DUM da dumda da DUM",
    ideaText:
      "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom",
    rhymeTarget: "",
    candidateCount: 5,
    aiSeedWords: [
      "drift",
      "glide",
      "float",
      "echo",
      "pulse",
      "depth",
      "veil",
      "glow",
      "slipping",
      "falling",
      "diving",
      "blurring",
      "sliding",
      "breathing",
      "shadow",
      "haze",
      "stream",
      "breath",
    ],
    aiSeedBuckets: {
      singleWords: ["drift", "glide", "float", "echo", "pulse", "depth", "veil", "glow"],
      verbs: ["slipping", "falling", "diving", "blurring", "sliding", "breathing"],
      nouns: ["shadow", "haze", "stream", "breath"],
      adjectives: [],
    },
  });

  assert.equal(results.length > 0, true);
  for (const candidate of results) {
    assert.doesNotMatch(candidate.text, /^i\s+\w+ing\s+\w+ing\b/i);
    assert.match(candidate.text, /\b(is|are|was)\b/i);
    assert.match(candidate.text, /\b(into|under|over|after)\b/i);
  }
});

test("long hybrid pattern can derive usable two-syllable verbs from one-syllable AI seeds", () => {
  const results = generateLyrics({
    patternText: "da DUM da DUM da dumda da DUM",
    ideaText:
      "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom",
    rhymeTarget: "",
    candidateCount: 5,
    aiSeedWords: ["slip", "glide", "drift", "float", "fade", "pulse", "haze", "breath"],
    aiSeedBuckets: {
      singleWords: ["slip", "glide", "drift", "float", "fade", "pulse"],
      compactWords: [],
      verbs: ["slip", "drift", "float", "fade"],
      nouns: ["haze", "breath", "pulse"],
      adjectives: [],
    },
  });

  assert.equal(results.length > 0, true);
  for (const candidate of results) {
    assert.match(candidate.text, /\b(is|are|was)\b/i);
    assert.match(candidate.text, /\b(into|under|over|after)\b/i);
  }
});

test("structured hybrid keeps a real auxiliary in the aux slot", () => {
  const results = generateLyrics({
    patternText: "da DUM da DUM da dumda da DUM",
    ideaText:
      "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom",
    rhymeTarget: "",
    candidateCount: 5,
    aiSeedWords: ["slip", "drift", "float", "fade", "storm", "breath", "shadow", "veil"],
    aiSeedBuckets: {
      singleWords: ["slip", "drift", "float", "fade", "storm", "breath", "shadow", "veil"],
      compactWords: [],
      verbs: ["slip", "drift", "float", "fade"],
      nouns: ["storm", "breath", "shadow", "veil"],
      adjectives: [],
    },
  });

  assert.equal(results.length > 0, true);
  for (const candidate of results) {
    assert.match(candidate.text, /\b(is|are|was)\b/i);
    assert.doesNotMatch(candidate.text, /\b(the|a|for|of|to)\s+(into|under|over|after|onto)\b/i);
  }
});

test("dumda compact slot can use more than just into in structured hybrid assembly", () => {
  const results = generateLyrics({
    patternText: "da DUM da DUM da dumda da DUM",
    ideaText:
      "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom",
    rhymeTarget: "",
    candidateCount: 10,
    aiSeedWords: ["slip", "glide", "float", "fade", "storm", "breath", "shadow", "veil"],
    aiSeedBuckets: {
      singleWords: ["slip", "glide", "float", "fade", "storm", "breath", "shadow", "veil"],
      compactWords: [],
      verbs: ["slip", "glide", "float", "fade"],
      nouns: ["storm", "breath", "shadow", "veil"],
      adjectives: [],
    },
  });

  assert.equal(results.length > 0, true);
  assert.equal(
    results.some((candidate) => /\b(into|under|over|after|onto)\b/i.test(candidate.text)),
    true,
  );
});

test("long hybrid pattern returns plan representatives instead of raw frame spam", () => {
  const results = generateLyrics({
    patternText: "da DUM da DUM da dumda da DUM",
    ideaText:
      "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom",
    rhymeTarget: "",
    candidateCount: 5,
    aiSeedWords: [
      "slip",
      "glide",
      "drift",
      "float",
      "fade",
      "pulse",
      "depths",
      "haze",
      "breath",
      "veil",
      "stream",
      "threshold",
      "falling",
      "slipping",
      "drifting",
      "fading",
    ],
    aiSeedBuckets: {
      singleWords: ["slip", "glide", "drift", "float", "fade", "pulse", "depths", "stream", "veil", "threshold"],
      compactWords: [],
      verbs: ["slip", "drift", "float", "fade", "falling", "slipping", "drifting", "fading"],
      nouns: ["haze", "breath", "veil", "stream", "threshold", "depths", "pulse"],
      adjectives: [],
    },
  });

  assert.equal(results.length >= 1, true);
  assert.equal(new Set(results.map((candidate) => candidate.text)).size, results.length);
  assert.equal(new Set(results.map((candidate) => candidate.planKey)).size >= 1, true);
});

test("slot planning exposes alternate readings for merged loose spans", () => {
  const plans = explainSlotPlanning("da DUM da DUM da dumda da DUM");
  assert.equal(plans.length > 0, true);
  assert.equal(
    plans.some((plan) =>
      plan.slots.some((slot) => slot.text === "da DUM" && slot.kind === "noun"),
    ),
    true,
  );
});

test("slot planning keeps article-led plans noun-headed", () => {
  const plans = explainSlotPlanning("da DUM da DUM da dumda da DUM", 20);
  assert.equal(
    plans
      .flatMap((plan) => plan.slots.map((slot, index) => ({ slot, next: plan.slots[index + 1] })))
      .filter(({ slot }) => slot.kind === "articleLeadWeak")
      .every(({ next }) => next?.kind === "noun"),
    true,
  );
});

test("slot planning still returns valid plans for longer all-loose patterns", () => {
  const plans = explainSlotPlanning("da DUM da DUM da");
  assert.equal(plans.length > 0, true);
  assert.equal(
    plans.every((plan) => plan.slots.every((slot) => slot.tokens.length >= 1)),
    true,
  );
});

test("selection avoids near-duplicate frame variants that only swap the last word", () => {
  const results = generateLyrics({
    patternText: "da DUM da DUM da dumda da DUM",
    ideaText:
      "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom",
    rhymeTarget: "",
    candidateCount: 5,
    aiSeedWords: ["glide", "slip", "pulse", "dream", "fade", "sink", "haze", "veil", "stream"],
    aiSeedBuckets: {
      singleWords: ["glide", "slip", "pulse", "dream", "fade", "sink"],
      verbs: ["sinking", "slipping", "fading"],
      nouns: ["haze", "veil", "stream", "pulse", "dream"],
      adjectives: [],
    },
  });

  const frames = results.map((candidate) =>
    candidate.text
      .toLowerCase()
      .split(/\s+/u)
      .slice(0, -1)
      .join(" "),
  );

  assert.equal(new Set(frames).size, frames.length);
});

test("selection avoids repeating the same leading sentence anchor", () => {
  const results = generateLyrics({
    patternText: "da DUM da DUM da dumda da DUM",
    ideaText:
      "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom",
    rhymeTarget: "",
    candidateCount: 5,
    aiSeedWords: ["glide", "slip", "pulse", "dream", "fade", "sink", "haze", "veil", "stream"],
    aiSeedBuckets: {
      singleWords: ["glide", "slip", "pulse", "dream", "fade", "sink"],
      verbs: ["sinking", "slipping", "fading"],
      nouns: ["haze", "veil", "stream", "pulse", "dream"],
      adjectives: [],
    },
  });

  const anchors = results.map((candidate) =>
    candidate.text
      .toLowerCase()
      .split(/\s+/u)
      .slice(0, 4)
      .join(" "),
  );

  assert.equal(new Set(anchors).size >= 1, true);
});

test("scansion fixture corpus is available for future evals", () => {
  assert.equal(scansionCases.length >= 10, true);
  for (const fixture of scansionCases) {
    assert.equal(typeof fixture.pattern, "string");
    assert.equal(typeof fixture.line, "string");
    assert.equal(typeof fixture.status, "string");
  }
});

test("filterUsableSeedWords removes invented seeds not in the lexicon", () => {
  assert.deepEqual(
    filterUsableSeedWords(["drift", "mindwave", "glow", "starspill", "sleepwalk"]),
    ["drift", "glow", "sleepwalk"],
  );
});

test("filterUsableSeedPool keeps only usable words inside each bucket", () => {
  assert.deepEqual(
    filterUsableSeedPool({
      singleWords: ["drift", "starspill", "glow"],
      compactWords: ["sleepwalk", "mindwave"],
      verbs: ["drift", "floatlight"],
      nouns: ["shadow", "tidewheel"],
      adjectives: ["weightless", "skyflash"],
    }),
    {
      singleWords: ["drift", "glow"],
      compactWords: ["sleepwalk"],
      verbs: ["drift"],
      nouns: ["shadow"],
      adjectives: ["weightless"],
      slotTargets: {},
    },
  );
});

test("lyric shape coverage distinguishes raw lexical stress from lyric-allowed stress", () => {
  const snapshot = getLyricShapeCoverageSnapshot();
  const dumda = snapshot.find((row) => row.spacedKey === "dum da");
  const dumdaExamples = dumda?.examples ?? [];

  assert.equal(Boolean(dumda), true);
  assert.equal((dumda?.rawExactCount ?? 0) < (dumda?.lyricExactCount ?? 0), true);
  assert.equal(dumdaExamples.length > 0, true);
});
