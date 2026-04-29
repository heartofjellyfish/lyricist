import { LOCAL_OPENAI_CONFIG } from "../../src/localConfig.js";
import {
  buildSystemPrompt,
  buildGeneratePrompt,
  buildIteratePrompt,
  buildCritiquePrompt,
  buildLineSchema,
  buildCritiqueSchema,
} from "./craftPrompt.js";

// ── Response Parsing ────────────────────────────────────────────────

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  const parts = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function parseJsonResponse(text) {
  const raw = text.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/u);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  return null;
}

function supportsReasoning(model) {
  return model.startsWith("gpt-5");
}

// ── Core Fetch ──────────────────────────────────────────────────────

async function callOpenAI({ instructions, input, schema, maxTokens = 800 }) {
  const { model } = LOCAL_OPENAI_CONFIG;

  const requestBody = {
    model,
    text: { format: schema },
    max_output_tokens: maxTokens,
    instructions,
    input,
  };

  if (supportsReasoning(model)) {
    requestBody.reasoning = { effort: "low" };
  }

  const response = await fetch("/api/openai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
    const message = payload?.error?.message ?? `OpenAI request failed (${response.status}).`;
    throw new Error(message);
  }

  const outputText = extractOutputText(payload);
  const parsed = parseJsonResponse(outputText);

  return {
    model,
    raw: outputText,
    parsed,
    usage: {
      inputTokens: payload?.usage?.input_tokens ?? 0,
      outputTokens: payload?.usage?.output_tokens ?? 0,
      totalTokens: payload?.usage?.total_tokens ?? 0,
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Generate fresh lyric lines from a seed.
 *
 * @param {object} opts
 * @param {string} opts.seed
 * @param {string} opts.subject
 * @param {string} opts.register
 * @param {string[]} opts.micros
 * @param {number} opts.count
 * @returns {Promise<{ lines: Array<{line, register, craft_notes}>, usage }>}
 */
export async function generateLines({ seed, subject, spectrums = {}, micros = [], metaphor = false, count = 8 } = {}) {
  const instructions = buildSystemPrompt({ spectrums, micros, metaphor });
  const input = buildGeneratePrompt({ seed, subject, count });
  const schema = buildLineSchema(count);

  const result = await callOpenAI({ instructions, input, schema });

  const lines = result.parsed?.lines ?? [];
  return { lines, usage: result.usage, model: result.model, debug: { instructions, input, raw: result.raw } };
}

export async function iterateOnLine({ parentLine, seed, action, spectrums = {}, micros = [], metaphor = false, count = 4 } = {}) {
  const instructions = buildSystemPrompt({ spectrums, micros, metaphor });
  const input = buildIteratePrompt({ parentLine, seed, action, count });
  const schema = buildLineSchema(count);

  const result = await callOpenAI({ instructions, input, schema });

  const lines = result.parsed?.lines ?? [];
  return { lines, usage: result.usage, model: result.model, debug: { instructions, input, raw: result.raw } };
}

export async function critiqueLine({ line, spectrums = {}, metaphor = false } = {}) {
  const instructions = buildSystemPrompt({ spectrums, metaphor });
  const input = buildCritiquePrompt({ line });
  const schema = buildCritiqueSchema();

  const result = await callOpenAI({ instructions, input, schema, maxTokens: 600 });

  const critique = result.parsed ?? { strengths: [], weaknesses: [], revision_direction: "" };
  return { critique, usage: result.usage, model: result.model, debug: { instructions, input, raw: result.raw } };
}
