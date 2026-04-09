import { REGISTER_LIST, MICRO_PRINCIPLE_LIST } from "./craftPrompt.js";
import { generateLines, iterateOnLine, critiqueLine } from "./craftApi.js";
import {
  getState,
  subscribe,
  setSeed,
  setSubject,
  setRegister,
  toggleMicro,
  addResults,
  setCritique,
  clearResults,
} from "./craftState.js";

// ── DOM References ──────────────────────────────────────────────────

const seedInput = document.getElementById("seed-input");
const subjectInput = document.getElementById("subject-input");
const registerGroup = document.getElementById("register-group");
const microsContainer = document.getElementById("micros-container");
const generateBtn = document.getElementById("generate-btn");
const clearBtn = document.getElementById("clear-btn");
const resultsContainer = document.getElementById("results");
const statusEl = document.getElementById("status");
const debugEl = document.getElementById("debug-body");

// ── Initialize Controls ─────────────────────────────────────────────

function initRegisters() {
  for (const reg of REGISTER_LIST) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "register-btn";
    btn.dataset.register = reg.key;
    btn.textContent = reg.label;
    btn.addEventListener("click", () => setRegister(reg.key));
    registerGroup.appendChild(btn);
  }
}

function initMicros() {
  const groups = {
    "Huang Fan Formulas": MICRO_PRINCIPLE_LIST.filter((m) => m.key.startsWith("formula_")),
    "Structural Moves": MICRO_PRINCIPLE_LIST.filter(
      (m) =>
        ["governing_paradox", "extended_metaphor", "temporal_blur", "remedy_poison", "earned_ignorance", "empathy_danger"].includes(m.key)
    ),
    "Stance": MICRO_PRINCIPLE_LIST.filter(
      (m) => ["present_tense", "portrait", "humor", "in_medias_res", "withholding"].includes(m.key)
    ),
  };

  for (const [groupLabel, items] of Object.entries(groups)) {
    const groupEl = document.createElement("div");
    groupEl.className = "micro-group";

    const title = document.createElement("span");
    title.className = "micro-group-title";
    title.textContent = groupLabel;
    groupEl.appendChild(title);

    const chips = document.createElement("div");
    chips.className = "micro-chips";

    for (const item of items) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "micro-chip";
      chip.dataset.micro = item.key;
      chip.textContent = item.label;
      chip.title = item.description;
      chip.addEventListener("click", () => toggleMicro(item.key));
      chips.appendChild(chip);
    }

    groupEl.appendChild(chips);
    microsContainer.appendChild(groupEl);
  }
}

// ── Render ───────────────────────────────────────────────────────────

function renderRegisterButtons(activeRegister) {
  for (const btn of registerGroup.querySelectorAll(".register-btn")) {
    btn.classList.toggle("active", btn.dataset.register === activeRegister);
  }
}

function renderMicroChips(activeMicros) {
  for (const chip of microsContainer.querySelectorAll(".micro-chip")) {
    chip.classList.toggle("active", activeMicros.includes(chip.dataset.micro));
  }
}

function renderResults(results) {
  resultsContainer.innerHTML = "";

  if (results.length === 0) {
    resultsContainer.innerHTML = `<div class="empty-state">No lines yet. Enter a seed and generate.</div>`;
    return;
  }

  // Group: top-level lines first, then iterations nested
  const topLevel = results.filter((r) => !r.parentId);
  const byParent = {};
  for (const r of results) {
    if (r.parentId) {
      (byParent[r.parentId] ??= []).push(r);
    }
  }

  for (const item of topLevel) {
    renderLineCard(item, byParent, resultsContainer);
  }
}

function renderLineCard(item, byParent, container) {
  const card = document.createElement("div");
  card.className = "line-card";
  if (item.action && item.action !== "generate") {
    card.classList.add("iteration-card");
  }

  const lineEl = document.createElement("div");
  lineEl.className = "line-text";
  lineEl.textContent = item.line;
  card.appendChild(lineEl);

  const meta = document.createElement("div");
  meta.className = "line-meta";
  meta.innerHTML = `<span class="line-register">${item.register}</span>`;
  if (item.craft_notes) {
    meta.innerHTML += `<span class="line-craft-note">${item.craft_notes}</span>`;
  }
  card.appendChild(meta);

  // Critique display
  if (item.critique) {
    const critiqueEl = document.createElement("div");
    critiqueEl.className = "critique-block";
    critiqueEl.innerHTML = [
      `<div class="critique-section"><strong>Strengths:</strong> ${item.critique.strengths.join("; ")}</div>`,
      `<div class="critique-section"><strong>Weaknesses:</strong> ${item.critique.weaknesses.join("; ")}</div>`,
      `<div class="critique-section"><strong>Direction:</strong> ${item.critique.revision_direction}</div>`,
    ].join("");
    card.appendChild(critiqueEl);
  }

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "line-actions";
  actions.innerHTML = `
    <button type="button" class="action-btn" data-action="push" data-id="${item.id}">Push harder</button>
    <button type="button" class="action-btn" data-action="more" data-id="${item.id}">More like this</button>
    <button type="button" class="action-btn" data-action="shift" data-id="${item.id}">Shift register</button>
    <button type="button" class="action-btn action-critique" data-action="critique" data-id="${item.id}">Critique</button>
  `;
  card.appendChild(actions);

  container.appendChild(card);

  // Render children (iterations)
  const children = byParent[item.id];
  if (children) {
    const childContainer = document.createElement("div");
    childContainer.className = "iteration-group";
    for (const child of children) {
      renderLineCard(child, byParent, childContainer);
    }
    container.appendChild(childContainer);
  }
}

// gpt-4.1 pricing per 1M tokens
const PRICING = {
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10.0 },
};

function formatUsage(usage, model = "gpt-4.1") {
  if (!usage || !usage.totalTokens) return "";
  const rates = PRICING[model] || PRICING["gpt-4.1"];
  const cost = (usage.inputTokens * rates.input + usage.outputTokens * rates.output) / 1_000_000;
  return `${usage.inputTokens} in / ${usage.outputTokens} out / $${cost.toFixed(4)}`;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.dataset.state = isError ? "error" : text ? "loading" : "ready";
}

function setDebug(debug) {
  if (!debug) {
    debugEl.textContent = "";
    return;
  }
  debugEl.textContent = [
    "── System Prompt ──",
    debug.instructions,
    "",
    "── User Prompt ──",
    debug.input,
    "",
    "── Raw Response ──",
    debug.raw,
  ].join("\n");
}

// ── Event Handlers ──────────────────────────────────────────────────

async function handleGenerate() {
  const state = getState();
  const seed = seedInput.value.trim();
  if (!seed) {
    setStatus("Enter a seed first.", true);
    return;
  }

  setSeed(seed);
  setSubject(subjectInput.value.trim());

  setStatus("Generating...");
  generateBtn.disabled = true;

  try {
    const result = await generateLines({
      seed,
      subject: subjectInput.value.trim(),
      register: state.register,
      micros: state.micros,
      count: 5,
    });

    addResults(result.lines, null, "generate");
    setDebug(result.debug);
    setStatus(formatUsage(result.usage, result.model));
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    generateBtn.disabled = false;
  }
}

async function handleIterate(action, lineId) {
  const state = getState();
  const entry = state.results.find((r) => r.id === lineId);
  if (!entry) return;

  setStatus(`${action === "critique" ? "Critiquing" : "Iterating"}...`);

  try {
    if (action === "critique") {
      const result = await critiqueLine({
        line: entry.line,
        register: state.register,
      });
      setCritique(lineId, result.critique);
      setDebug(result.debug);
      setStatus(formatUsage(result.usage, result.model));
    } else {
      const result = await iterateOnLine({
        parentLine: entry.line,
        seed: state.seed,
        action,
        register: action === "shift" ? nextRegister(state.register) : state.register,
        micros: state.micros,
        count: 4,
      });
      addResults(result.lines, lineId, action);
      setDebug(result.debug);
      setStatus(formatUsage(result.usage, result.model));
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

function nextRegister(current) {
  const keys = REGISTER_LIST.map((r) => r.key);
  const idx = keys.indexOf(current);
  return keys[(idx + 1) % keys.length];
}

// ── Wire Up ─────────────────────────────────────────────────────────

function init() {
  initRegisters();
  initMicros();

  // Restore saved state into UI
  const saved = getState();
  seedInput.value = saved.seed;
  subjectInput.value = saved.subject;

  // Initial render
  renderRegisterButtons(saved.register);
  renderMicroChips(saved.micros);
  renderResults(saved.results);

  // Subscribe to state changes
  subscribe((s) => {
    renderRegisterButtons(s.register);
    renderMicroChips(s.micros);
    renderResults(s.results);
  });

  // Generate button
  generateBtn.addEventListener("click", handleGenerate);

  // Clear button
  clearBtn.addEventListener("click", () => {
    clearResults();
    setDebug(null);
  });

  // Delegate iteration/critique clicks
  resultsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".action-btn");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    handleIterate(action, id);
  });

  // Enter key in seed input triggers generate
  seedInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  });
}

init();
