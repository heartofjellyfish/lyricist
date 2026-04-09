// ── Tier 1: Core Identity (always present) ──────────────────────────

const CORE_IDENTITY = [
  "You are a lyric line writer. You write single lines — not verses, not songs.",
  "SHORT. Most lines should be 4–10 words. Never exceed 12. If a line works in 5 words, 8 is a failure.",
  "Every line must contain a contradiction — two things that shouldn't coexist, forced together. Comfort next to threat. Tenderness next to violence. Stillness next to collapse.",
  "Be decisive. No hedging, no 'perhaps', no softening. State the impossible as fact.",
  "Sense-bound only: sight, sound, touch, taste, smell, body. No abstractions unless they bleed.",
  "No clichés at any level. If you've seen the phrase before, kill it.",
  "Strong verbs. No adjective does the work a verb can do.",
  "Trust the reader. Say less. Imply more. The unsaid is the poem.",
  "Metaphor through collision — two unlike things, no explanation.",
  "Accuracy over cleverness — the right detail, not the impressive one.",
].join(" ");

// ── Tier 2: Register-Specific Instructions ──────────────────────────

const REGISTERS = {
  "image-dense": {
    label: "Image-Dense",
    instructions: [
      "Subjective imagery — images that can't literally exist but feel true.",
      "Huang Fan's formulas: A's-B mismatch, A-is-B, B-explains-A, A-does-impossible.",
      "Synesthesia welcome. Paradox required: unrelated AND linked.",
    ].join(" "),
  },

  vernacular: {
    label: "Vernacular",
    instructions: [
      "Plain words only. Poetry comes from placement, not vocabulary.",
      "Sound like someone talking who accidentally said something that can't be unsaid.",
      "Comfort and warning in the same breath.",
    ].join(" "),
  },

  transparent: {
    label: "Transparent",
    instructions: [
      "Language disappears. The thought is the art.",
      "A child understands the words. An adult is shaken by the meaning.",
      "Simplest possible way to say the most impossible thing.",
    ].join(" "),
  },

  associative: {
    label: "Associative",
    instructions: [
      "Private-inventory mode. Felt-not-parsed logic.",
      "Fragments orbiting a hidden center. Tenses bleed.",
      "The reader feels the coherence before they can explain it.",
    ].join(" "),
  },
};

// ── Tier 3: Situational Micro-Principles (toggled by UI) ───────────

const MICRO_PRINCIPLES = {
  // Huang Fan formula selection
  formula_ab_mismatch: "Use A's-B mismatch: give the subject a possession that belongs to another world. Example: 'the river's eyelid' or 'winter's broken radio'.",
  formula_a_is_b: "Use A-is-B: declare an impossible equivalence between two unlike things. Example: 'grief is a country with no roads'.",
  formula_b_explains_a: "Use B-explains-A: let the metaphor vehicle explain or narrate for the tenor. Example: 'the scar told me where the knife had dreamed'.",
  formula_a_impossible: "Use A-does-impossible: let the subject perform an action only its metaphor could. Example: 'the house swallowed its own address'.",

  // Structural moves
  governing_paradox: "Build the line around a governing paradox or oxymoron — an impossibility that serves as the structural spine.",
  extended_metaphor: "Build an extended metaphor that argues with itself — the metaphor should contain its own counter-argument.",
  temporal_blur: "Let tenses bleed: past and present coexist. The line should feel like memory and happening at once.",
  remedy_poison: "The line should be a remedy containing its own poison — comfort and warning braided together.",
  earned_ignorance: "Architecture of earned ignorance: the speaker has learned more but understands less. Knowledge deepens the mystery.",
  empathy_danger: "Empathy as the most dangerous act: understanding another person so deeply that the boundary between self and other dissolves.",

  // Stance modifiers
  present_tense: "Write in strict present tense. Inhabit the moment. No looking back, no looking ahead.",
  portrait: "Portrait over confession: describe from the outside, imply the interior. Show, don't emote.",
  humor: "Let humor and play leak in. Playfulness is not the enemy of depth.",
  in_medias_res: "Start in the middle. No setup. The line drops us into an already-moving scene.",
  withholding: "Chekhov's gun in miniature: the line should withhold something that the listener feels is missing.",
};

// ── Prompt Assembly ─────────────────────────────────────────────────

/**
 * Build the system instructions for a line-craft generation call.
 *
 * @param {object} opts
 * @param {string} opts.register   - one of: image-dense, vernacular, transparent, associative
 * @param {string[]} opts.micros   - array of MICRO_PRINCIPLES keys to activate
 * @returns {string}
 */
export function buildSystemPrompt({ register = "image-dense", micros = [] } = {}) {
  const parts = [CORE_IDENTITY];

  const reg = REGISTERS[register];
  if (reg) {
    parts.push(`# Register: ${reg.label}\n${reg.instructions}`);
  }

  const activeMicros = micros
    .map((key) => MICRO_PRINCIPLES[key])
    .filter(Boolean);
  if (activeMicros.length > 0) {
    parts.push("# Additional Principles\n" + activeMicros.join("\n"));
  }

  return parts.join("\n\n");
}

/**
 * Build the user prompt for initial generation.
 *
 * @param {object} opts
 * @param {string} opts.seed       - the vibe / image field text
 * @param {string} opts.subject    - optional subject / constraint
 * @param {number} opts.count      - number of lines to generate (default 5)
 * @returns {string}
 */
export function buildGeneratePrompt({ seed, subject = "", count = 5 } = {}) {
  const parts = [
    `${count} lines. Seed: "${seed}"`,
  ];

  if (subject) {
    parts.push(`Constraint: ${subject}`);
  }

  parts.push(
    "Each line standalone. Each structurally different. Each contains a contradiction.",
    "4–10 words per line. JSON only.",
  );

  return parts.join("\n");
}

/**
 * Build the user prompt for iteration (push harder, more like this, shift register).
 *
 * @param {object} opts
 * @param {string} opts.parentLine - the line being iterated on
 * @param {string} opts.seed       - original seed text
 * @param {string} opts.action     - "push" | "more" | "shift"
 * @param {number} opts.count      - number of variations (default 4)
 * @returns {string}
 */
export function buildIteratePrompt({ parentLine, seed, action = "push", count = 4 } = {}) {
  const header = `Line: "${parentLine}"\nSeed: "${seed}"`;
  const actionInstructions = {
    push: `${header}\n${count} variations. Stranger. Shorter. More dangerous. Raise the contradiction.`,
    more: `${header}\n${count} variations. Same territory, different angle. Keep what cuts, change everything else.`,
    shift: `${header}\n${count} variations in a completely different register. Same wound, alien language.`,
  };

  return (actionInstructions[action] || actionInstructions.push) + "\n4–10 words per line. JSON only.";
}

/**
 * Build the user prompt for critique mode.
 *
 * @param {object} opts
 * @param {string} opts.line - the line to critique
 * @returns {string}
 */
export function buildCritiquePrompt({ line } = {}) {
  return [
    `Critique this lyric line against craft principles:`,
    `"${line}"`,
    "",
    "Evaluate:",
    "- Sense-bound language: Is it rooted in the senses or floating in abstraction?",
    "- Cliché check: Any dead phrases, stock images, or predictable moves?",
    "- Verb strength: Are verbs carrying the weight, or leaning on adjectives?",
    "- Specificity: Is it concrete enough to be universal?",
    "- Surprise: Is there at least one unexpected element?",
    "- Compression: Could any word be cut without loss?",
    "- Imagery: Does the metaphor (if any) create genuine collision?",
    "",
    "Be honest and specific. Name the weak spots. Suggest one concrete revision direction.",
    "Return JSON only.",
  ].join("\n");
}

// ── JSON Schemas for Structured Output ──────────────────────────────

export function buildLineSchema(count = 5) {
  return {
    type: "json_schema",
    name: "lyric_lines",
    strict: true,
    schema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              line: { type: "string", description: "The lyric line" },
              register: { type: "string", description: "Which register this line is written in" },
              craft_notes: { type: "string", description: "Brief note on what principle drives the line" },
            },
            required: ["line", "register", "craft_notes"],
            additionalProperties: false,
          },
          description: `Array of ${count} lyric lines`,
        },
      },
      required: ["lines"],
      additionalProperties: false,
    },
  };
}

export function buildCritiqueSchema() {
  return {
    type: "json_schema",
    name: "lyric_critique",
    strict: true,
    schema: {
      type: "object",
      properties: {
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "What works well in the line",
        },
        weaknesses: {
          type: "array",
          items: { type: "string" },
          description: "Specific weak spots",
        },
        revision_direction: {
          type: "string",
          description: "One concrete suggestion for how to push the line further",
        },
      },
      required: ["strengths", "weaknesses", "revision_direction"],
      additionalProperties: false,
    },
  };
}

// ── Exports for UI ──────────────────────────────────────────────────

export const REGISTER_LIST = Object.entries(REGISTERS).map(([key, val]) => ({
  key,
  label: val.label,
}));

export const MICRO_PRINCIPLE_LIST = Object.entries(MICRO_PRINCIPLES).map(([key, val]) => ({
  key,
  label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  description: val,
}));
