import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  extractDraftSegmentLines,
  extractDraftLines,
  extractUsage,
  requestOpenAIPlanDrafts,
} from "../src/openaiDrafts.js";

test("extractUsage reads token counts from the response payload", () => {
  assert.deepEqual(
    extractUsage({
      usage: {
        input_tokens: 111,
        output_tokens: 22,
        total_tokens: 133,
      },
    }),
    {
      inputTokens: 111,
      outputTokens: 22,
      totalTokens: 133,
    },
  );
});

test("extractDraftSegmentLines reads JSON arrays of segments", () => {
  assert.deepEqual(
    extractDraftSegmentLines('[["the","dream","is","slipping","into","the","night"]]'),
    [["the", "dream", "is", "slipping", "into", "the", "night"]],
  );
});

test("extractDraftLines reads JSON arrays", () => {
  assert.deepEqual(
    extractDraftLines('[["the","dream","is","slipping","into","the","night"]]'),
    ["the | dream | is | slipping | into | the | night"],
  );
});

test("extractDraftLines unwraps fenced JSON objects", () => {
  assert.deepEqual(
    extractDraftLines('```json\n[["the","dream"]]\n```'),
    ["the | dream"],
  );
});

test("requestOpenAIPlanDrafts uses model-appropriate verbosity", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '[["the","dream"]]' }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
    };
  };

  try {
    await requestOpenAIPlanDrafts({
      apiKey: "test",
      model: "gpt-4.1-mini",
      patternText: "da DUM",
      ideaText: "test",
      rhymeTarget: "",
      plans: [{ mode: "short_words", slots: [{ text: "da", tokens: ["da"], compact: false, kind: "articleLeadWeak" }] }],
    });
    await requestOpenAIPlanDrafts({
      apiKey: "test",
      model: "gpt-5-mini",
      patternText: "da DUM",
      ideaText: "test",
      rhymeTarget: "",
      plans: [{ mode: "short_words", slots: [{ text: "da", tokens: ["da"], compact: false, kind: "articleLeadWeak" }] }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0].text.verbosity, "medium");
  assert.equal(calls[1].text.verbosity, "low");
});

test("index.html includes default hint dropdown values", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<select id="orientation-input"[\s\S]*?<option value="descriptive" selected>/u);
  assert.match(html, /<select id="stability-input"[\s\S]*?<option value="unstable" selected>/u);
  assert.match(html, /<select id="distance-input"[\s\S]*?<option value="close" selected>/u);
});

test("requestOpenAIPlanDrafts threads hint values into the prompt", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return {
      ok: true,
      text: async () =>
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"lines":[{"s1":"the"}]}' }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
    };
  };

  try {
    await requestOpenAIPlanDrafts({
      apiKey: "test",
      model: "gpt-4.1-mini",
      patternText: "DUM",
      ideaText: "winter room",
      rhymeTarget: "",
      orientation: "bridging",
      stability: "stable",
      distance: "far",
      countPerPlan: 1,
      plans: [{ mode: "short_words", slots: [{ text: "DUM", tokens: ["DUM"], compact: false, kind: "noun" }] }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(calls[0].input, /Orientation: bridging/u);
  assert.match(calls[0].input, /Stability: stable/u);
  assert.match(calls[0].input, /Distance: far/u);
  assert.match(calls[0].input, /bridges descriptive and confessional writing/u);
});

test("requestOpenAIPlanDrafts returns per-plan segment arrays", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '[["the","dream","is","slipping","into","the","night"]]',
              },
            ],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
  });

  try {
    const result = await requestOpenAIPlanDrafts({
      apiKey: "test",
      model: "gpt-4.1-mini",
      patternText: "da DUM da DUM da dumda da DUM",
      ideaText: "half-dream inward drift",
      rhymeTarget: "",
      plans: [
        {
          mode: "mostly_short",
          slots: [
            { text: "da", tokens: ["da"], compact: false, mergedLoose: false, kind: "articleLeadWeak" },
            { text: "DUM", tokens: ["DUM"], compact: false, mergedLoose: false, kind: "noun" },
          ],
        },
      ],
    });

    assert.deepEqual(result.planResults[0].segmentLines, [
      ["the", "dream", "is", "slipping", "into", "the", "night"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
