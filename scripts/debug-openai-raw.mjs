import { LOCAL_OPENAI_CONFIG } from "../src/localConfig.js";
import { summarizeModePlans, promptExamplesForSlot } from "../src/lyricEngine.js";

const apiKey = LOCAL_OPENAI_CONFIG.apiKey;
const model = LOCAL_OPENAI_CONFIG.model || "gpt-4.1-mini";
const patternText = "da DUM da DUM da dumda da DUM";
const ideaText =
  "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom";

const plan = summarizeModePlans(patternText, 5)[0];
const segmentBanks = plan.slots.map((slot) => promptExamplesForSlot(slot, slot.tokens.length === 1 ? 12 : 10));
const prompt = [
  `Mode: ${plan.mode}`,
  `Vibe: ${ideaText}`,
  "Write 2 different lines for this plan.",
  `Each line must have exactly ${plan.slots.length} segments.`,
  "Return each line as an array of segments.",
  "Each segment must be exactly one word.",
  "Use only words from the slot banks.",
  "",
  `Segmentation: ${plan.slots.map((slot) => slot.text).join(" | ")}`,
  `Guide: ${plan.slots
    .map((slot, index) => `${index + 1}. ${slot.text}${slot.mergedLoose ? "*" : ""}. Bank: ${segmentBanks[index].join(", ")}`)
    .join(" ")}`,
  "",
  'Return JSON only in this shape: {"lines":[["seg1","seg2"],["seg1","seg2"]]}',
].join("\n");

const segmentItems = segmentBanks.map((bank) => ({
  type: "string",
  enum: bank,
}));

const requestBody = {
  model,
  text: {
    verbosity: /^gpt-4\\.1/u.test(model) ? "medium" : "low",
    format: {
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
            minItems: 2,
            maxItems: 2,
            items: {
              type: "array",
              minItems: segmentItems.length,
              maxItems: segmentItems.length,
              prefixItems: segmentItems,
              items: false,
            },
          },
        },
      },
    },
  },
  max_output_tokens: 400,
  instructions:
    "# Identity You are a lyric co-writer. # Instructions Write natural English lyric lines for segmentation plans. Follow the segmentation exactly. Each segment must be exactly one single word. Do not add words, merge segments, or split segments. Use normal spelling only. Return only the requested JSON array.",
  input: prompt,
};

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify(requestBody),
});

const raw = await response.text();
console.log(raw);
