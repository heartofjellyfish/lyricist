// ── Tier 1: Core Identity (always present) ──────────────────────────

const CORE_IDENTITY = [
  "You are a lyric line writer. Single lines only.",
  "The whole craft is in ATTENTION. Ordinary life is full of beauty and feeling if you pay enough attention. The listener should think: the author really sees, really lives every moment.",
  "Find fresh ways to describe common human experiences. Not strange, not clever — FRESH. See what everyone else walks past.",
  "Be SPECIFIC. Whatever scale you're working at — a button or a skyline — make the detail precise and earned. Not generic, not decorative.",
  "4–10 words. Never more than 12.",
  "No clichés. No stock images (no umbrellas-left-behind, no rain-on-windows unless you see the rain so specifically it becomes new).",
  "Strong verbs. Every word must earn its place.",
  "Vary the lines. Some can just be precise observations. Some can have a turn. Some can be a question. Some can be a single image held up to the light. Diversity of approach matters — these lines are meant to INSPIRE, not to all work the same way.",
].join(" ");

// ── Spectrum Descriptions (for prompt hints) ────────────────────────

// Values: -2 (strong left), -1 (mild left), 0 (neutral), 1 (mild right), 2 (strong right)

const SPECTRUMS = {
  orientation: {
    label: "Descriptive ↔ Confessional",
    description: "Observing the external world vs. revealing internal experience",
    buildHint(v) {
      const hints = {
        "-2": "FULLY descriptive. The speaker is invisible — a pure camera. Show only scenes, objects, actions. NEVER use 'I' or name any emotion. All feeling is implied through what you choose to frame.",
        "-1": "Lean descriptive. Mostly observe the external world — scenes, objects, actions. Let feeling be implied through what you notice. The speaker may be faintly present but stays in the background.",
        "0": "",
        "1": "Lean confessional. The speaker is present — 'I' appears. Feelings, memories, private thoughts color the line. The world is filtered through what the speaker feels, but grounded in something real.",
        "2": "FULLY confessional. The speaker's inner life IS the line. Raw feeling, memory, private thought. The external world only exists as symbol or trigger for what's happening inside. Emotional, vulnerable, exposed.",
      };
      return hints[String(v)] || "";
    },
  },
  stability: {
    label: "Stable ↔ Unstable",
    description: "Resolved, warm, at rest vs. tense, cold, leaning forward",
    buildHint(v) {
      const hints = {
        "-2": "FULLY stable. Deep peace, warmth, resolution. The line should feel like arriving home, like a long exhale, like the last light of a good day. Nothing needs to change. The ground is unshakeable.",
        "-1": "Lean stable. The line should feel mostly settled, warm, resolved. A moment of quiet or acceptance, even if bittersweet. The ground is solid beneath it.",
        "0": "",
        "1": "Lean unstable. Something is slightly off. The line should feel uneasy, unresolved, leaning forward. A question that won't close. The ground is soft.",
        "2": "FULLY unstable. Maximum tension, cold, dread. The line should feel like the moment before something breaks — or just after. Nothing is settled. The ground is gone. Vertigo, fracture, freefall.",
      };
      return hints[String(v)] || "";
    },
  },
  distance: {
    label: "Close ↔ Far",
    description: "A button on a shirt vs. a city skyline",
    buildHint(v) {
      const hints = {
        "-2": "EXTREME close-up. A single texture, a pore, a thread, a crumb. The camera is inches away. The world shrinks to one tiny thing held under a magnifying glass. Nothing else exists.",
        "-1": "Lean close. Domestic, arm's reach — a gesture, an object on a table, a hand on a doorknob. Intimate scale. The detail is specific and small.",
        "0": "",
        "1": "Lean far. Pull back — a street, a neighborhood, a season. The feeling comes from a wider frame. Less about one object, more about the scene or the sweep of time.",
        "2": "EXTREME wide shot. Landscapes, skylines, horizons, lifetimes, highways disappearing. Do NOT zoom into small objects. Stay at the widest possible view. The feeling comes entirely from scale, distance, and the passage of time.",
      };
      return hints[String(v)] || "";
    },
  },
  register: {
    label: "Spoken ↔ Literary",
    description: "Plain speech that lands vs. crafted poetic language",
    buildHint(v) {
      const hints = {
        "-2": "FULLY spoken. Bare, blunt, conversational. Sound like someone at a kitchen table who says one thing and the room goes quiet. Monosyllables. No imagery. No metaphor. The poetry is ONLY in what's said and what's left out.",
        "-1": "Lean spoken. Plain, conversational. Short words, simple syntax. The poetry is in the placement, not the vocabulary. It should sound like someone talking who accidentally says something that can't be unsaid.",
        "0": "",
        "1": "Lean literary. Shaped, considered. The language has some craft to it — a precise verb, a compressed image, a rhythm that hums. But it doesn't call attention to itself.",
        "2": "FULLY literary. Maximum craft. Rich vocabulary, dense imagery, compression. The language itself is the art — rhythm, assonance, internal rhyme, sound patterning. Every syllable is placed. Think Joni Mitchell, Huang Fan.",
      };
      return hints[String(v)] || "";
    },
  },
  vision: {
    label: "Utopian ↔ Tragic",
    description: "The world could be different vs. this is how it is",
    buildHint(v) {
      const hints = {
        "-2": "FULLY utopian. The speaker burns with longing. The line aches for what isn't here yet — a future, a reconciliation, a world remade. Yearning so strong it reshapes the present. Hope is not gentle here; it's desperate and luminous.",
        "-1": "Lean utopian. The speaker reaches, gently, for something that could be. There's longing or hope inside the observation — the sense that things don't have to stay this way. The line leans forward.",
        "0": "",
        "1": "Lean tragic. The speaker sees clearly without trying to fix anything. There's acceptance — not cold, but steady. The beauty and the pain are both just facts. The line rests in what is.",
        "2": "FULLY tragic. Unflinching clarity. The speaker has stopped reaching. What's here is all there is, and they see every detail of it — gorgeous and merciless. No hope, no despair, just the terrible dignity of paying attention to what cannot be changed.",
      };
      return hints[String(v)] || "";
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
