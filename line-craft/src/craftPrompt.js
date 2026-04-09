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

// ── Spectrum Descriptions (for prompt hints) ────────────────────────

const SPECTRUMS = {
  orientation: {
    label: "Descriptive ↔ Confessional",
    description: "Observing the external world vs. revealing internal experience",
    buildHint(value) {
      if (value < -0.3) return "Lean descriptive: observe the external world. Show scenes, objects, actions. Let feeling be implied through what you choose to notice.";
      if (value > 0.3) return "Lean confessional: reveal internal experience. The speaker's feelings, memories, private thoughts. Symbolic, emotional, inward.";
      return "";
    },
  },
  stability: {
    label: "Stable ↔ Unstable",
    description: "Resolved, warm, at rest vs. tense, cold, leaning forward",
    buildHint(value) {
      if (value < -0.3) return "Lean stable: the line should feel settled, warm, resolved. A moment of peace or acceptance, even if bittersweet.";
      if (value > 0.3) return "Lean unstable: the line should feel tense, unsettled, cold. Something unresolved, leaning forward, uneasy.";
      return "";
    },
  },
  distance: {
    label: "Close ↔ Far",
    description: "A button on a shirt vs. a city skyline",
    buildHint(value) {
      if (value < -0.3) return "Lens close: zoom in tight. A single object, a texture, a gesture, a breath. The smallest possible detail.";
      if (value > 0.3) return "Lens far: pull back. A landscape, a skyline, a season, a lifetime. The widest possible view.";
      return "";
    },
  },
  register: {
    label: "Spoken ↔ Literary",
    description: "Plain speech that lands vs. crafted poetic language",
    buildHint(value) {
      if (value < -0.3) return "Lean spoken: plain, conversational, colloquial. Sound like someone talking who accidentally says something that can't be unsaid. The poetry is in the placement, not the vocabulary.";
      if (value > 0.3) return "Lean literary: crafted, poetic, shaped. The language itself is part of the art — rhythm, sound, image density, compression. Every word is chosen.";
      return "";
    },
  },
};

// ── Tier 2: Micro-Principles (toggled by UI) ────────────────────────

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
 * @param {object} opts.spectrums  - { orientation, stability, distance } each -1 to 1, 0 = neutral
 * @param {string[]} opts.micros   - array of MICRO_PRINCIPLES keys to activate
 * @returns {string}
 */
export function buildSystemPrompt({ spectrums = {}, micros = [] } = {}) {
  const parts = [CORE_IDENTITY];

  const hints = Object.entries(SPECTRUMS)
    .map(([key, spec]) => spec.buildHint(spectrums[key] ?? 0))
    .filter(Boolean);
  if (hints.length > 0) {
    parts.push("# Creative direction\n" + hints.join("\n"));
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
 */
export function buildGeneratePrompt({ seed, subject = "", count = 8 } = {}) {
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
 * Build the user prompt for iteration (push harder, more like this, shift).
 */
export function buildIteratePrompt({ parentLine, seed, action = "push", count = 4 } = {}) {
  const header = `Line: "${parentLine}"\nSeed: "${seed}"`;
  const actionInstructions = {
    push: `${header}\n${count} variations. Go deeper into the feeling. More specific. More honest. Less safe.`,
    more: `${header}\n${count} variations. Same emotional territory, different angle or detail.`,
    shift: `${header}\n${count} variations. Completely different approach — if descriptive, go confessional. If close, go far. If stable, go unstable.`,
  };

  return (actionInstructions[action] || actionInstructions.push) + "\n4–10 words per line. JSON only.";
}

/**
 * Build the user prompt for critique mode.
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

export function buildLineSchema(count = 8) {
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
              craft_notes: { type: "string", description: "Brief note on what drives the line" },
            },
            required: ["line", "craft_notes"],
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

export const SPECTRUM_LIST = Object.entries(SPECTRUMS).map(([key, val]) => ({
  key,
  label: val.label,
  description: val.description,
}));

export const MICRO_PRINCIPLE_LIST = Object.entries(MICRO_PRINCIPLES).map(([key, val]) => ({
  key,
  label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  description: val,
}));
