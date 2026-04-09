// ── Tier 1: Core Identity (always present) ──────────────────────────

const CORE_IDENTITY = [
  "You are a lyric line writer.",
  "You write single lines — not verses, not songs.",
  "Every line must be sense-bound: rooted in sight, sound, touch, taste, smell, or kinesthetic feeling.",
  "No clichés at any level — not in image, not in phrasing, not in emotional posture.",
  "Strong verbs over adjectives. Let action carry the weight.",
  "Specificity is universality: the more precise the detail, the wider it resonates.",
  "Every syllable earns its spot. Strip filler. Boil it down.",
  "Metaphor through collision — bring two unlike things together and let the spark do the work.",
  "Details imply more than they state. Trust the reader.",
  "Accuracy over invention — the right detail beats the clever one.",
  "One unexpected word choice per line that recontextualizes everything around it.",
  "Double meanings are hidden treasure — let words work on two planes when they can.",
].join(" ");

// ── Tier 2: Register-Specific Instructions ──────────────────────────

const REGISTERS = {
  "image-dense": {
    label: "Image-Dense",
    instructions: [
      "Write in subjective imagery — images that can't literally exist but feel true.",
      "Use Huang Fan's formulas freely:",
      "(1) A's-B mismatch — give A a possession from B's world;",
      "(2) A-is-B — declare an impossible equivalence;",
      "(3) B-explains-A — let the metaphor vehicle explain the tenor;",
      "(4) A-does-impossible — let the subject perform an action only the metaphor could.",
      "Synesthesia is welcome: let senses cross-wire.",
      "Paradox: the image should be unrelated AND linked at the same time.",
      "Minimum poetic unit — every line must carry its own charge, standalone.",
    ].join(" "),
  },

  vernacular: {
    label: "Vernacular",
    instructions: [
      "Write in plain, everyday language — the poetry comes from placement, not vocabulary.",
      "Let near-cliché swerve at the last moment into something true.",
      "Vernacular is the medium: the line should sound like someone talking, but arranged.",
      "Prefer common words in uncommon arrangements.",
      "The line should feel like overheard speech that accidentally cuts deep.",
      "Remedy containing poison — comfort and warning in the same breath.",
    ].join(" "),
  },

  transparent: {
    label: "Transparent",
    instructions: [
      "Write with radical transparency — language should disappear so the idea breathes.",
      "Maximum clarity. No decoration. The thought itself is the art.",
      "If a child could understand the words but an adult is shaken by the meaning, you're there.",
      "Strip everything ornamental. What remains must be undeniable.",
      "The simplest possible way to say the most impossible thing.",
    ].join(" "),
  },

  associative: {
    label: "Associative",
    instructions: [
      "Write in private-inventory mode — associative lists with felt-not-parsed logic.",
      "The connections between images should be emotional, not logical.",
      "Debris-field association: scattered fragments that orbit a hidden center.",
      "The reader should feel the coherence before they can explain it.",
      "Extended metaphor as autobiography — let the metaphor tell the life without saying so.",
      "Temporal blur: let tenses bleed. Past and present can coexist in one line.",
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
    `Write ${count} lyric lines inspired by this seed:`,
    `"${seed}"`,
  ];

  if (subject) {
    parts.push(`Subject or constraint: ${subject}`);
  }

  parts.push(
    "",
    "Each line should be standalone — one complete lyric line, not a fragment.",
    "Make them structurally different from each other: vary syntax, rhythm, and approach.",
    "Return JSON only.",
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
  const actionInstructions = {
    push: [
      `Here is a lyric line: "${parentLine}"`,
      `Original seed: "${seed}"`,
      "",
      `Write ${count} variations that push harder — more intensity, stranger imagery, deeper compression.`,
      "Keep the emotional center but raise the stakes.",
    ],
    more: [
      `Here is a lyric line: "${parentLine}"`,
      `Original seed: "${seed}"`,
      "",
      `Write ${count} variations in a similar spirit — same emotional territory, different angle.`,
      "Vary syntax and imagery while keeping what works about the original.",
    ],
    shift: [
      `Here is a lyric line: "${parentLine}"`,
      `Original seed: "${seed}"`,
      "",
      `Write ${count} variations in a completely different register.`,
      "If the original is image-dense, try vernacular. If plain, try associative.",
      "Same emotional seed, radically different approach to language.",
    ],
  };

  const lines = actionInstructions[action] || actionInstructions.push;
  lines.push("", "Each line should be standalone. Make them different from each other.", "Return JSON only.");
  return lines.join("\n");
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
