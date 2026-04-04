import { LOCAL_OPENAI_CONFIG } from "../src/localConfig.js";
import {
  buildDraftInstructions,
  buildDraftPrompt,
  extractDraftLines,
  extractOutputText,
  extractUsage,
} from "../src/openaiDrafts.js";
import { evaluateCandidateLine } from "../src/lyricEngine.js";

const models = [
  { model: "gpt-4.1-mini", reasoning: null, max_output_tokens: 1600 },
  { model: "gpt-4o-mini", reasoning: null, max_output_tokens: 1600 },
  { model: "gpt-4.1", reasoning: null, max_output_tokens: 1600 },
  { model: "gpt-4o", reasoning: null, max_output_tokens: 1600 },
  { model: "gpt-5-mini", reasoning: { effort: "minimal" }, max_output_tokens: 1600 },
  { model: "gpt-5-mini", reasoning: { effort: "low" }, max_output_tokens: 1600 },
  { model: "gpt-5", reasoning: { effort: "minimal" }, max_output_tokens: 1600 },
  { model: "gpt-5", reasoning: { effort: "low" }, max_output_tokens: 1600 },
];

const input = {
  patternText: "da DUM da DUM da dumda da DUM",
  ideaText:
    "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom",
  rhymeTarget: "",
  count: 3,
};

function textVerbosityForModel(model) {
  return /^gpt-4/u.test(model) ? "medium" : "low";
}

function buildRequestBody({ model, reasoning, max_output_tokens }) {
  const body = {
    model,
    text: { verbosity: textVerbosityForModel(model) },
    max_output_tokens,
    instructions: buildDraftInstructions(),
    input: buildDraftPrompt(input),
  };
  if (reasoning) {
    body.reasoning = reasoning;
  }
  return body;
}

async function runOne(config) {
  const body = buildRequestBody(config);
  const started = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOCAL_OPENAI_CONFIG.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - started;
  const rawBody = await response.text();
  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {}

  const rawText = extractOutputText(payload);
  const lines = extractDraftLines(rawText);
  const validations = lines.map((line) => ({
    line,
    evaluation: evaluateCandidateLine({
      lineText: line,
      patternText: input.patternText,
      ideaText: input.ideaText,
      rhymeTarget: input.rhymeTarget,
      source: config.model,
    }),
  }));

  return {
    model: config.model,
    reasoning: config.reasoning?.effort ?? "none",
    elapsedMs,
    status: response.status,
    ok: response.ok,
    usage: extractUsage(payload),
    rawText,
    rawBody,
    lines,
    validations,
    incompleteReason: payload?.incomplete_details?.reason ?? null,
    error: payload?.error?.message ?? null,
    requestBody: body,
  };
}

const results = [];
for (const config of models) {
  try {
    results.push(await runOne(config));
  } catch (error) {
    results.push({
      model: config.model,
      reasoning: config.reasoning?.effort ?? "none",
      error: error instanceof Error ? error.message : String(error),
      lines: [],
      validations: [],
    });
  }
}

console.log(JSON.stringify({ input, results }, null, 2));
