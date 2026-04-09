// ── Tier 1: Core Identity (always present) ──────────────────────────

const CORE_IDENTITY = [
  "You are a lyric line writer. Single lines only.",
  "LOOK CLOSELY. The whole craft is in the looking. Ordinary life — folding laundry, waiting for a bus, washing dishes — is full of beauty and feeling if you pay enough attention. The listener should think: the author really sees, really lives every moment.",
  "Find fresh ways to describe common human experiences. Not strange, not clever — FRESH. See what everyone else walks past.",
  "Specific sensory detail is everything. Not 'a towel' but what kind — its color, its texture, whether it's frayed at the edge, whether it's still warm from the dryer. Not 'a shirt' but whose, which button is missing, how it smells.",
  "4–10 words. Never more than 12.",
  "Concrete domestic detail over cosmic abstraction: kitchens, drives, phone calls, shirts, grocery lists, hands, weather, doors, how someone sits, how a cup is held.",
  "No clichés. No stock images (no umbrellas-left-behind, no rain-on-windows unless you see the rain so specifically it becomes new).",
  "Strong verbs. Cut adjectives — unless the adjective IS the detail (a 'frayed' collar, a 'lukewarm' bath).",
  "Vary the lines. Some can just be precise observations. Some can have a turn. Some can be a question. Some can be a single image held up to the light. Diversity of approach matters — these lines are meant to INSPIRE, not to all work the same way.",
].join(" ");

// ── Tier 2: Register-Specific Instructions ──────────────────────────

const REGISTERS = {
  "image-dense": {
    label: "Image-Dense",
    instructions: [
      "Pack the line with sensory detail. Let the images carry the feeling — never name the emotion.",
      "Look at one small thing so closely that it opens up. A pile of laundry, a crack in a mug, how someone's hand rests on a steering wheel.",
      "When an image becomes impossible, it should feel like the only honest way to say what's true. But most lines should stay possible — just seen more closely than anyone usually bothers.",
    ].join(" "),
  },

  vernacular: {
    label: "Vernacular",
    instructions: [
      "Plain words only. Sound like someone talking at 2am who says the truest thing they've ever said without meaning to.",
      "The poetry is in what's NOT said. The line should feel like the tip of an iceberg.",
      "'We were already bored' — nothing fancy, everything devastating.",
    ].join(" "),
  },

  transparent: {
    label: "Transparent",
    instructions: [
      "Language disappears. The thought is the art.",
      "'Imagine there's no heaven' — a child's words, an adult's vertigo.",
      "Say the unsayable in the simplest possible way.",
    ].join(" "),
  },

  associative: {
    label: "Associative",
    instructions: [
      "Let the line follow emotional logic, not narrative logic. One image triggers the next by feeling, not by sense.",
      "Like a dream: the details are specific but the connections are private.",
      "The listener understands it in their body before their mind catches up.",
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
    "Each line standalone. Each looks at the seed from a different angle or detail.",
    "Vary the approach: some observational, some with a turn, some just a single image held still.",
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
    push: `${header}\n${count} variations. Go deeper into the feeling. More specific. More honest. Less safe.`,
    more: `${header}\n${count} variations. Same emotional territory, different angle or detail.`,
    shift: `${header}\n${count} variations in a completely different register. Same feeling, different voice.`,
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
