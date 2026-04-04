function buildPlanDraftInstructions() {
  return [
    "# Identity",
    "You are a lyric co-writer.",
    "# Instructions",
    "Write natural English lyric lines for segmentation plans.",
    "Follow the segmentation exactly.",
    "Each segment must be exactly one single word.",
    "Do not add words, merge segments, or split segments.",
    "Use normal spelling only.",
    "Do not mark stress using capitalization, hyphens, or scansion notation.",
    "Prefer familiar lyric words over rare names, archaic words, surnames, abbreviations, or cold dictionary words.",
    "Keep the lines singable, image-rich, and natural.",
    "Return only the requested JSON array.",
  ].join(" ");
}

function buildPlanSelectionInstructions() {
  return [
    "# Identity",
    "You are a lyric planner.",
    "# Instructions",
    "Choose the segmentation plans most likely to produce natural English lyric lines.",
    "Prefer plans that can read as fluent lyric language, not awkward word piles.",
    "Prefer variety across the chosen plans.",
    "Do not explain your choices.",
    "Return only the requested JSON array of indexes.",
  ].join(" ");
}

function buildPlanSegmentBankInstructions() {
  return [
    "# Identity",
    "You are a lyric vocabulary planner.",
    "# Instructions",
    "For each segment, give a small set of single-word options that exactly fit that segment.",
    "Keep the options common, familiar, singable, and natural in lyrics.",
    "Make the segment options belong to one coherent image-world so they can combine into strong lines later.",
    "Prefer weak function words in weak slots and vivid content words in strong slots.",
    "Do not explain anything.",
    "Return only the requested JSON object.",
  ].join(" ");
}

function buildFinalSelectionInstructions() {
  return [
    "# Identity",
    "You are a lyric editor.",
    "# Instructions",
    "Choose the strongest lyric lines from the candidate list.",
    "Prioritize natural English, vivid imagery, singability, and distinctiveness.",
    "Avoid awkward grammar, repetitive openings, and lines that feel like stress puzzles.",
    "Prefer variety across the chosen lines.",
    "Return only the requested JSON array of indexes.",
  ].join(" ");
}

function describeSegmentStress(tokens) {
  const length = tokens.length;
  if (length === 1) {
    if (tokens[0] === "DUM") {
      return "one stressed syllable";
    }
    if (tokens[0] === "dum") {
      return "one lightly stressed syllable";
    }
    return "one unstressed syllable";
  }

  const stressedIndices = tokens
    .map((token, index) => ({ token, index }))
    .filter((item) => item.token === "DUM")
    .map((item) => item.index + 1);
  const lightIndices = tokens
    .map((token, index) => ({ token, index }))
    .filter((item) => item.token === "dum")
    .map((item) => item.index + 1);

  const stressedPart = stressedIndices.length
    ? `primary stress on syllable ${stressedIndices.join(", ")}`
    : "no primary stress";
  const lightPart = lightIndices.length
    ? `, light stress on syllable ${lightIndices.join(", ")}`
    : "";
  return `${length}-syllable word, ${stressedPart}${lightPart}`;
}

function describePlanSegment(slot) {
  const shape = slot.tokens.join(" ");
  const base = `${slot.text}${slot.mergedLoose ? "*" : ""} = ${describeSegmentStress(slot.tokens)}`;

  if (slot.compact && shape === "dum da") {
    return `${base}. Usually a tight prep-like word such as into, under, over, after, onto, or during.`;
  }

  if (slot.compact) {
    return `${base}. Keep this as one compact word or one tight fixed unit.`;
  }

  if (slot.tokens.length >= 3) {
    return `${base}. This should be one full multi-syllable word.`;
  }

  if (slot.tokens.length === 2) {
    return `${base}. This should usually be one full two-syllable word.`;
  }

  return base;
}

function describePlanSegmentShort(slot) {
  const label = `${slot.text}${slot.mergedLoose ? "*" : ""}`;
  const shape = slot.tokens.join(" ");

  if (slot.compact && shape === "dum da") {
    return `${label}: compact prep-like word`;
  }

  if (slot.compact) {
    return `${label}: one compact word`;
  }

  if (slot.tokens.length === 1) {
    if (slot.tokens[0] === "da") {
      return `${label}: one weak unstressed word, usually a light function word like I, the, my, in, to`;
    }
    if (slot.tokens[0] === "DUM") {
      return `${label}: one stressed word, usually a strong content word like dream, wave, heart, fall`;
    }
    return `${label}: one lightly stressed word`;
  }

  if (slot.tokens.length === 2) {
    const [first, second] = slot.tokens;
    if (first === "DUM" && second === "da") {
      return `${label}: one 2-syllable word, stress on the first syllable`;
    }
    if (first === "da" && second === "DUM") {
      return `${label}: one 2-syllable word, stress on the second syllable`;
    }
    if (first === "dum" && second === "da") {
      return `${label}: one 2-syllable compact word, light then weak`;
    }
  }

  if (slot.tokens.length === 3) {
    return `${label}: one 3-syllable word matching ${slot.tokens.join(" ")}`;
  }

  return `${label}: one ${slot.tokens.length}-syllable word matching ${slot.tokens.join(" ")}`;
}

function buildPlanSelectionPrompt({ plans, ideaText, rhymeTarget, count }) {
  const lines = [
    `Vibe: ${ideaText || "none"}`,
    `Rhyme: ${rhymeTarget || "none"}`,
    `Choose ${Math.min(count, plans.length)} plans from the candidate list below.`,
    "Prefer plans that are likely to form natural English lyric lines when each segment is one word.",
    "Prefer structural variety across the chosen plans.",
    "Avoid plans that are likely to force awkward stacks of weak words or prep-like words.",
    "Prefer plans where the compact prep-like segment can attach naturally after a content word.",
    "Prefer plans that can plausibly read as one natural lyric thought, not just a stress puzzle.",
    "",
    ...plans.map(
      (plan, index) =>
        `${index + 1}. ${plan.mode || "mixed"} :: ${plan.slots
          .map((slot) => `${slot.text}${slot.mergedLoose ? "*" : ""}`)
          .join(" | ")}`,
    ),
    "",
    "Return JSON only in this shape: [1,2,3]",
  ];
  return lines.join("\n");
}

function buildFinalSelectionPrompt({ candidates, ideaText, rhymeTarget, count }) {
  const lines = [
    `Vibe: ${ideaText || "none"}`,
    `Rhyme: ${rhymeTarget || "none"}`,
    `Choose up to ${Math.min(count, candidates.length)} lines.`,
    "Prefer lines that read as natural, singable English and feel image-rich.",
    "Prefer lines that are meaningfully different from each other.",
    "",
    ...candidates.map(
      (item, index) =>
        `${index + 1}. [${item.mode || "mixed"} | ${item.segmentation}] ${item.line}`,
    ),
    "",
    "Return JSON only in this shape: [1,2,3]",
  ];
  return lines.join("\n");
}

function modeStyleGuide(mode) {
  const guides = {
    short_words: "short clean words",
    mostly_short: "mostly short words with one lift",
    mixed_lengths: "natural mix of short and longer words",
    multi_syllable_heavy: "more familiar multi-syllable words",
    long_flow: "gliding line with longer word flow",
  };
  return guides[mode] ?? "distinct from the other plans";
}

function describeRoleHint(slotKind = "") {
  const hints = {
    articleLeadWeak: "usually a light opener like the, my, or a",
    leadWeak: "usually a light opening word",
    auxWeak: "usually a light helper word like is or was",
    linkWeak: "usually a linking word like of, in, through, or with",
    preCompactWeak: "usually a light linking word",
    postCompactWeak: "usually a light article or pronoun",
    compactFunction: "often a compact preposition",
    compactContent: "often a compact content word",
    noun: "usually an image word or object word",
    verb: "usually an action or motion word",
    adj: "usually a descriptive word",
    content: "usually an image-rich content word",
  };
  return hints[slotKind] ?? "";
}

function describeLaneLabel(slotKind = "") {
  const labels = {
    articleLeadWeak: "light opener",
    leadWeak: "light opener",
    auxWeak: "helper word",
    linkWeak: "link word",
    preCompactWeak: "link word",
    postCompactWeak: "light article/pronoun",
    compactFunction: "compact preposition",
    compactContent: "compact content word",
    noun: "image noun",
    verb: "motion/process word",
    adj: "descriptive word",
    content: "content word",
  };
  return labels[slotKind] ?? "word";
}

function describePlanLane(slots = []) {
  return slots.map((slot) => describeLaneLabel(slot.kind)).join(" + ");
}

function buildPlanDraftPrompt({ plan, ideaText, rhymeTarget, count = 4, strictRetry = false, polishMode = false }) {
  const segmentation = plan.slots.map((slot) => slot.text).join(" | ");
  const segmentGuide = plan.slots
    .map((slot, index) => {
      const options = (plan.segmentBanks?.[index] ?? []).slice(0, 5);
      const optionText = options.length > 0 ? ` Options: ${options.join(", ")}.` : "";
      return `${index + 1}. ${describePlanSegmentShort(slot)}.${optionText}`;
    })
    .join(" ");
  const segmentCount = plan.slots.length;
  return [
    `Mode: ${plan.mode || "mixed_lengths"} | ${modeStyleGuide(plan.mode)}`,
    `Vibe: ${ideaText || "none"}`,
    `Rhyme: ${rhymeTarget || "none"}`,
    `Write ${count} different lines for this plan.`,
    `Each line must have exactly ${segmentCount} segments.`,
    "Return each line as an array of segments.",
    "Each segment must be exactly one word.",
    "Use the segmentation as the hard constraint.",
    "Choose one word from the listed options for each segment whenever options are provided.",
    "The whole line should read naturally when the segments are joined with spaces.",
    "Prefer natural, familiar lyric wording.",
    "Avoid obscure words, awkward endings, and word piles.",
    "Single da segments should be weak words. Single DUM segments should be stronger words.",
    "Make the lines meaningfully different from each other.",
    ...(Array.isArray(plan.selectionExample) && plan.selectionExample.length === segmentCount
      ? [
          `Selection example: ${plan.selectionExample.join(" ")}`,
          "Stay close to this grammatical feeling, but use different words.",
        ]
      : []),
    ...(strictRetry
      ? [
          polishMode
            ? "Polish mode: rewrite the rough drafts into more natural, vivid lyric English."
            : "Retry mode: rewrite into simpler, more idiomatic English.",
          "Keep the exact same segmentation and segment count.",
          "Use even more natural combinations from the listed options.",
          "Use even clearer weak words in da slots and clearer strong words in DUM slots.",
          ...(Array.isArray(plan.repairExamples) && plan.repairExamples.length > 0
            ? [
                `${polishMode ? "Drafts to improve" : "Rough attempts to rewrite"}: ${plan.repairExamples
                  .map((segments) => segments.join(" | "))
                  .join(" ; ")}`,
              ]
            : []),
        ]
      : []),
    "",
    `Segmentation: ${segmentation}`,
    `Guide: ${segmentGuide}`,
    "",
    'Return JSON only in this shape: {"lines":[{"s1":"...","s2":"..."},{"s1":"...","s2":"..."}]}',
  ].join("\n");
}

export function extractDraftSegmentLines(responseText) {
  const raw = responseText.trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    const lines = Array.isArray(parsed) ? parsed : parsed?.lines;
    if (Array.isArray(lines)) {
      if (lines.every((item) => Array.isArray(item))) {
        return lines
          .map((item) =>
            item
              .map((segment) => (typeof segment === "string" ? segment.trim() : ""))
              .filter(Boolean),
          )
          .filter((segments) => segments.length > 0);
      }

      if (lines.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
        return lines
          .map((item) =>
            Object.entries(item)
              .sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))
              .map(([, segment]) => (typeof segment === "string" ? segment.trim() : ""))
              .filter(Boolean),
          )
          .filter((segments) => segments.length > 0);
      }

      return lines
        .map((item) => {
          if (typeof item !== "string") {
            return [];
          }
          return item
            .split("|")
            .map((segment) => segment.trim())
            .filter(Boolean);
        })
        .filter((segments) => segments.length > 0);
    }
  } catch {}

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/u);
  if (fencedMatch) {
    return extractDraftSegmentLines(fencedMatch[1]);
  }

  return raw
    .split("\n")
    .map((line) => line.replace(/^[\s*–—\-.\d)]+/u, "").trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split("|")
        .map((segment) => segment.trim())
        .filter(Boolean),
    )
    .filter((segments) => segments.length > 0);
}

function extractSegmentCandidateMap(responseText) {
  const raw = String(responseText || "").trim();
  if (!raw) {
    return {};
  }

  const tryParse = (text) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
        ]),
      );
    } catch {
      return {};
    }
  };

  const parsed = tryParse(raw);
  if (Object.keys(parsed).length > 0) {
    return parsed;
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/u);
  if (fencedMatch) {
    return tryParse(fencedMatch[1]);
  }

  return {};
}

function extractPlanSelection(responseText, maxIndex) {
  const raw = String(responseText || "").trim();
  if (!raw) {
    return [];
  }

  const tryParse = (text) => {
    try {
      const parsed = JSON.parse(text);
      const plans = Array.isArray(parsed) ? parsed : parsed?.plans;
      if (!Array.isArray(plans)) {
        return [];
      }
      return plans
        .map((item) => {
          const index = Number(item?.index);
          const example = Array.isArray(item?.example)
            ? item.example.map((segment) => String(segment || "").trim()).filter(Boolean)
            : [];
          if (!Number.isInteger(index) || index < 1 || index > maxIndex) {
            return null;
          }
          return { index, example };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  let parsed = tryParse(raw);
  if (parsed.length > 0) {
    return [...new Set(parsed)];
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/u);
  if (fencedMatch) {
    parsed = tryParse(fencedMatch[1]);
    if (parsed.length > 0) {
      return parsed.filter(
        (item, index, allItems) => allItems.findIndex((other) => other.index === item.index) === index,
      );
    }
  }

  return [...new Set((raw.match(/\d+/g) ?? []).map(Number).filter((value) => value >= 1 && value <= maxIndex))].map(
    (index) => ({ index, example: [] }),
  );
}

export function extractDraftLines(responseText) {
  return extractDraftSegmentLines(responseText).map((segments) => segments.join(" | "));
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const parts = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") {
      continue;
    }
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export { extractOutputText };

export function extractUsage(payload) {
  const usage = payload?.usage ?? {};
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

function supportsReasoning(model) {
  return /^gpt-5/u.test(model);
}

function textVerbosityForModel(model) {
  return /^gpt-4\.1/u.test(model) ? "medium" : "low";
}

function buildIndexArraySchema(maxIndex, count, name) {
  return {
    type: "json_schema",
    name,
    strict: true,
    schema: {
      type: "array",
      minItems: Math.min(count, maxIndex),
      maxItems: Math.min(count, maxIndex),
      items: {
        type: "integer",
        minimum: 1,
        maximum: maxIndex,
      },
    },
  };
}

function buildPlanDraftSchema(segmentBanks, lineCount) {
  const segmentProperties = Object.fromEntries(
    segmentBanks.map((_, index) => [
      `s${index + 1}`,
      {
        type: "string",
        minLength: 1,
        maxLength: 24,
        pattern: "^[A-Za-z']+$",
      },
    ]),
  );
  const segmentKeys = Object.keys(segmentProperties);

  return {
    type: "json_schema",
    name: "segmented_lyric_lines",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["lines"],
      properties: {
        lines: {
          type: "array",
          minItems: lineCount,
          maxItems: lineCount,
          items: {
            type: "object",
            additionalProperties: false,
            required: segmentKeys,
            properties: segmentProperties,
          },
        },
      },
    },
  };
}

function buildPlanSegmentBankSchema(segmentCount, candidateCount) {
  const segmentProperties = Object.fromEntries(
    Array.from({ length: segmentCount }, (_, index) => [
      `s${index + 1}`,
      {
        type: "array",
        minItems: candidateCount,
        maxItems: candidateCount,
        items: {
          type: "string",
          minLength: 1,
          maxLength: 24,
          pattern: "^[A-Za-z']+$",
        },
      },
    ]),
  );

  return {
    type: "json_schema",
    name: "segment_candidates",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(segmentProperties),
      properties: segmentProperties,
    },
  };
}

export async function requestOpenAIPlanSelection({
  apiKey,
  model = "gpt-4.1-mini",
  ideaText,
  rhymeTarget,
  plans = [],
  count = 5,
}) {
  const modelName = model;
  const prompt = buildPlanSelectionPrompt({ plans, ideaText, rhymeTarget, count });
  const requestBody = {
    model: modelName,
    text: {
      verbosity: textVerbosityForModel(modelName),
      format: buildIndexArraySchema(plans.length, count, "plan_selection"),
    },
    max_output_tokens: 120,
    instructions: buildPlanSelectionInstructions(),
    input: prompt,
  };

  if (supportsReasoning(modelName)) {
    requestBody.reasoning = { effort: "minimal" };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const rawBody = await response.text();
  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = payload?.error?.message ?? "OpenAI plan selection failed.";
    throw new Error(message);
  }

  const rawText = extractOutputText(payload);
  const indexes = [...new Set((() => {
    try {
      const parsed = JSON.parse(rawText);
      return Array.isArray(parsed)
        ? parsed.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= plans.length)
        : [];
    } catch {
      return (rawText.match(/\d+/g) ?? []).map(Number).filter((value) => value >= 1 && value <= plans.length);
    }
  })())];
  const selectedPlans = indexes
    .map((index) => {
      const plan = plans[index - 1];
      return plan ? { ...plan } : null;
    })
    .filter(Boolean);

  return {
    prompt,
    rawText,
    selections: indexes.map((index) => ({ index, example: [] })),
    indexes,
    selectedPlans,
    usage: extractUsage(payload),
    instructions: buildPlanSelectionInstructions(),
  };
}

export async function requestOpenAIFinalSelection({
  apiKey,
  model = "gpt-4.1-mini",
  ideaText,
  rhymeTarget,
  candidates = [],
  count = 5,
}) {
  const modelName = model;
  const prompt = buildFinalSelectionPrompt({ candidates, ideaText, rhymeTarget, count });
  const requestBody = {
    model: modelName,
    text: {
      verbosity: textVerbosityForModel(modelName),
      format: buildIndexArraySchema(candidates.length, count, "final_line_selection"),
    },
    max_output_tokens: 80,
    instructions: buildFinalSelectionInstructions(),
    input: prompt,
  };

  if (supportsReasoning(modelName)) {
    requestBody.reasoning = { effort: "minimal" };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const rawBody = await response.text();
  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = payload?.error?.message ?? "OpenAI final selection failed.";
    throw new Error(message);
  }

  const rawText = extractOutputText(payload);
  let indexes = [];
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) {
      indexes = parsed.map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= candidates.length);
    }
  } catch {}

  return {
    prompt,
    rawText,
    indexes: [...new Set(indexes)],
    usage: extractUsage(payload),
    instructions: buildFinalSelectionInstructions(),
  };
}

export async function requestOpenAIPlanDrafts({
  apiKey,
  model = "gpt-4.1-mini",
  patternText,
  ideaText,
  rhymeTarget,
  plans = [],
  countPerPlan = 4,
  strictRetry = false,
  polishMode = false,
}) {
  const instructions = buildPlanDraftInstructions();
  const modelName = model;
  const results = await Promise.all(
    plans.map(async (plan) => {
      const segmentBanks = plan.slots.map((slot, index) => promptCandidateBankForSlot(slot, 6, index, plan.slots));

      const prompt = buildPlanDraftPrompt({
        plan: {
          ...plan,
          segmentBanks,
        },
        ideaText,
        rhymeTarget,
        count: countPerPlan,
        strictRetry,
        polishMode,
      });
      const requestBody = {
        model: modelName,
        text: {
          verbosity: textVerbosityForModel(modelName),
          format: buildPlanDraftSchema(plan.slots, countPerPlan),
        },
        max_output_tokens: 400,
        instructions,
        input: prompt,
      };

      if (supportsReasoning(modelName)) {
        requestBody.reasoning = { effort: "minimal" };
      }

      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        const rawBody = await response.text();
        let payload = {};
        try {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          payload = {};
        }

        if (!response.ok) {
          const message = payload?.error?.message ?? "OpenAI request failed.";
          return {
            ...plan,
            prompt,
            segmentBanks,
            lines: [],
            error: message,
            usage: extractUsage(payload),
          };
        }

        const rawText = extractOutputText(payload);
        const draftUsage = extractUsage(payload);
        return {
          ...plan,
          prompt,
          segmentBanks,
          segmentLines: extractDraftSegmentLines(rawText),
          error: "",
          usage: draftUsage,
        };
      } catch (error) {
        return {
          ...plan,
          prompt,
          segmentBanks,
          segmentLines: [],
          error: error.message,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        };
      }
    }),
  );

  const usage = results.reduce(
    (totals, item) => ({
      inputTokens: totals.inputTokens + (item.usage?.inputTokens ?? 0),
      outputTokens: totals.outputTokens + (item.usage?.outputTokens ?? 0),
      totalTokens: totals.totalTokens + (item.usage?.totalTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );

  return {
    planResults: results,
    usage,
    instructions,
    patternText,
    prompt: results.map((item) => `# ${item.mode || "plan"}\n${item.prompt}`).join("\n\n"),
  };
}
import { promptCandidateBankForSlot } from "./lyricEngine.js";
