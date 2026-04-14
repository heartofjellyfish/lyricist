import { SPECTRUM_LIST, MICRO_PRINCIPLE_LIST, MICRO_GROUPS } from "./craftPrompt.js";
import { generateLines, iterateOnLine, critiqueLine } from "./craftApi.js";
import {
  getState,
  subscribe,
  setSeed,
  setSubject,
  setSpectrum,
  setMetaphor,
  toggleMicro,
  addResults,
  setCritique,
  clearResults,
} from "./craftState.js";

// ── DOM References ──────────────────────────────────────────────────

const seedInput = document.getElementById("seed-input");
const subjectInput = document.getElementById("subject-input");
const spectrumsContainer = document.getElementById("spectrums-container");
const microsContainer = document.getElementById("micros-container");
const metaphorMicros = document.getElementById("metaphor-micros");
const generateBtn = document.getElementById("generate-btn");
const clearBtn = document.getElementById("clear-btn");
const resultsContainer = document.getElementById("results");
const statusEl = document.getElementById("status");
const debugEl = document.getElementById("debug-body");
const metaphorToggle = document.getElementById("metaphor-toggle");

// ── Initialize Controls ─────────────────────────────────────────────

function initSpectrums() {
  const saved = getState().spectrums;
  for (const spec of SPECTRUM_LIST) {
    const row = document.createElement("div");
    row.className = "spectrum-row";

    const [leftLabel, rightLabel] = spec.label.split(" ↔ ");

    row.innerHTML = `
      <div class="spectrum-labels">
        <span class="spectrum-left">${leftLabel}</span>
        <span class="spectrum-desc">${spec.description}</span>
        <span class="spectrum-right">${rightLabel}</span>
      </div>
      <div class="spectrum-track">
        <div class="spectrum-ticks">
          <span class="spectrum-tick"></span>
          <span class="spectrum-tick center"></span>
          <span class="spectrum-tick"></span>
        </div>
        <input type="range" class="spectrum-slider" data-spectrum="${spec.key}"
          min="-1" max="1" step="1" value="${saved[spec.key] ?? 0}" />
      </div>
    `;

    const slider = row.querySelector(".spectrum-slider");
    slider.addEventListener("input", () => {
      setSpectrum(spec.key, parseFloat(slider.value));
    });
    slider.addEventListener("dblclick", () => {
      slider.value = 0;
      setSpectrum(spec.key, 0);
    });

    spectrumsContainer.appendChild(row);
  }
}

function initMicros() {
  for (const group of MICRO_GROUPS) {
    const items = MICRO_PRINCIPLE_LIST.filter((m) => m.group === group.key);
    if (items.length === 0) continue;

    const groupEl = document.createElement("div");
    groupEl.className = "micro-group";
    groupEl.dataset.group = group.key;
    if (group.exclusive) groupEl.dataset.exclusive = "true";

    const header = document.createElement("div");
    header.className = "micro-group-header";
    header.innerHTML = `
      <span class="micro-group-title">${group.title}</span>
      ${group.subtitle ? `<span class="micro-group-subtitle">${group.subtitle}</span>` : ""}
      ${(group.key === "formulas") ? `<button type="button" class="micro-learn-link" id="teach-inline-toggle">深入学习 →</button>` : ""}
    `;
    groupEl.appendChild(header);

    const chips = document.createElement("div");
    chips.className = "micro-chips";

    for (const item of items) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "micro-chip";
      chip.dataset.micro = item.key;
      chip.dataset.group = group.key;
      chip.textContent = item.label;
      chip.addEventListener("click", () => {
        if (group.exclusive) {
          handleExclusiveToggle(item.key, group.key);
        } else {
          toggleMicro(item.key);
        }
      });
      chips.appendChild(chip);
    }
    groupEl.appendChild(chips);

    // Example container — populated dynamically based on active chips
    const hasAnyExamples = items.some((m) => m.examples.length > 0);
    if (hasAnyExamples) {
      const exBlock = document.createElement("div");
      exBlock.className = "micro-examples";
      exBlock.dataset.group = group.key;
      groupEl.appendChild(exBlock);
    }

    // Formulas + techniques go inside the metaphor toggle section
    const target = (group.key === "formulas" || group.key === "techniques") ? metaphorMicros : microsContainer;
    target.appendChild(groupEl);
  }
}

/** For exclusive groups: deselect siblings, then toggle the clicked one. */
function handleExclusiveToggle(key, groupKey) {
  const state = getState();
  const siblings = MICRO_PRINCIPLE_LIST
    .filter((m) => m.group === groupKey && m.key !== key)
    .map((m) => m.key);

  // Deselect any active siblings
  for (const sib of siblings) {
    if (state.micros.includes(sib)) {
      toggleMicro(sib);
    }
  }
  // Toggle the clicked one
  toggleMicro(key);
}

/** Show/hide formula + technique groups based on metaphor toggle (boolean). */
function renderMetaphorVisibility(on) {
  metaphorMicros.style.display = on ? "" : "none";

  // Sync toggle button state
  if (metaphorToggle) {
    metaphorToggle.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

/** Update example blocks to show only examples for active chips. */
function renderExamples(activeMicros) {
  // Search both containers (metaphor section + craft nudges)
  const allExBlocks = [...metaphorMicros.querySelectorAll(".micro-examples"), ...microsContainer.querySelectorAll(".micro-examples")];
  for (const exBlock of allExBlocks) {
    const groupKey = exBlock.dataset.group;
    const items = MICRO_PRINCIPLE_LIST.filter(
      (m) => m.group === groupKey && activeMicros.includes(m.key) && m.examples.length > 0
    );

    exBlock.innerHTML = "";
    if (items.length === 0) {
      exBlock.style.display = "none";
      continue;
    }
    exBlock.style.display = "";

    // Techniques group: AND logic — pool all examples, show only those matching ALL active techniques
    if (groupKey === "techniques") {
      const activeKeys = items.map((i) => i.key);
      // Pool all featured examples from all technique items, de-duplicate by zh text
      const seen = new Set();
      const pooled = [];
      for (const item of MICRO_PRINCIPLE_LIST.filter((m) => m.group === "techniques")) {
        for (const ex of item.examples) {
          if (!ex.featured || seen.has(ex.zh)) continue;
          seen.add(ex.zh);
          pooled.push(ex);
        }
      }
      // Filter: example tags must include every active technique key
      const filtered = pooled.filter((ex) => ex.tags && activeKeys.every((k) => ex.tags.includes(k)));
      for (const ex of filtered) {
        const line = document.createElement("div");
        line.className = "micro-example-line";
        const zhHtml = ex.zh.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        line.innerHTML = `<span class="ex-zh">${zhHtml}</span><span class="ex-en">${ex.en}</span><span class="ex-source">${ex.source}</span>`;
        exBlock.appendChild(line);
      }
      if (filtered.length === 0) exBlock.style.display = "none";
      continue;
    }

    // Other groups: show featured examples per active item (as before)
    for (const item of items) {
      const featured = item.examples.filter((ex) => ex.featured);
      for (const ex of featured) {
        const line = document.createElement("div");
        line.className = "micro-example-line";
        const zhHtml = ex.zh.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        line.innerHTML = `<span class="ex-zh">${zhHtml}</span><span class="ex-en">${ex.en}</span><span class="ex-source">${ex.source}</span>`;
        exBlock.appendChild(line);
      }
    }
  }
}

// ── Render ───────────────────────────────────────────────────────────

function renderSpectrums(spectrums) {
  for (const slider of spectrumsContainer.querySelectorAll(".spectrum-slider")) {
    const key = slider.dataset.spectrum;
    if (spectrums[key] !== undefined && parseFloat(slider.value) !== spectrums[key]) {
      slider.value = spectrums[key];
    }
  }
}

function renderMicroChips(activeMicros) {
  const allChips = [...metaphorMicros.querySelectorAll(".micro-chip"), ...microsContainer.querySelectorAll(".micro-chip")];
  for (const chip of allChips) {
    chip.classList.toggle("active", activeMicros.includes(chip.dataset.micro));
  }
}

function renderResults(results) {
  resultsContainer.innerHTML = "";

  if (results.length === 0) {
    resultsContainer.innerHTML = `<div class="empty-state">No lines yet. Enter a seed and generate.</div>`;
    return;
  }

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

  if (item.craft_notes) {
    const meta = document.createElement("div");
    meta.className = "line-meta";
    meta.textContent = item.craft_notes;
    card.appendChild(meta);
  }

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
    <button type="button" class="action-btn" data-action="shift" data-id="${item.id}">Shift</button>
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

// ── Cost Display ────────────────────────────────────────────────────

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

  clearResults();
  setStatus("Generating...");
  generateBtn.disabled = true;

  try {
    const result = await generateLines({
      seed,
      subject: subjectInput.value.trim(),
      spectrums: state.spectrums,
      micros: state.micros,
      metaphor: state.metaphor,
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
        spectrums: state.spectrums,
        metaphor: state.metaphor,
      });
      setCritique(lineId, result.critique);
      setDebug(result.debug);
      setStatus(formatUsage(result.usage, result.model));
    } else {
      const result = await iterateOnLine({
        parentLine: entry.line,
        seed: state.seed,
        action,
        spectrums: state.spectrums,
        micros: state.micros,
        metaphor: state.metaphor,
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

// ── Wire Up ─────────────────────────────────────────────────────────

function init() {
  initSpectrums();
  initMicros();

  // Restore saved state into UI
  const saved = getState();
  seedInput.value = saved.seed;
  subjectInput.value = saved.subject;

  // Initial render
  renderMicroChips(saved.micros);
  renderExamples(saved.micros);
  renderResults(saved.results);
  renderMetaphorVisibility(saved.metaphor ?? false);

  // Subscribe to state changes
  subscribe((s) => {
    renderSpectrums(s.spectrums);
    renderMicroChips(s.micros);
    renderExamples(s.micros);
    renderResults(s.results);
    renderMetaphorVisibility(s.metaphor ?? false);
  });

  // Metaphor toggle
  if (metaphorToggle) {
    metaphorToggle.addEventListener("click", () => {
      const current = getState().metaphor;
      setMetaphor(!current);
    });
  }

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
    handleIterate(btn.dataset.action, btn.dataset.id);
  });

  // Enter key in seed input triggers generate
  seedInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  });

  // ── Teach Me Panel ──────────────────────────────────────────────
  initTeachPanel();
}

function initTeachPanel() {
  const toggle = document.getElementById("teach-toggle");
  const panel = document.getElementById("teach-panel");
  const backdrop = document.getElementById("teach-backdrop");
  const closeBtn = document.getElementById("teach-close");
  const body = document.getElementById("teach-body");

  function openPanel() {
    panel.classList.add("open");
    backdrop.classList.add("open");
    toggle.classList.add("hidden");
  }

  function closePanel() {
    panel.classList.remove("open");
    backdrop.classList.remove("open");
    toggle.classList.remove("hidden");
  }

  toggle.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);
  backdrop.addEventListener("click", closePanel);

  // Inline "深入学习" link in formulas group
  const inlineToggle = document.getElementById("teach-inline-toggle");
  if (inlineToggle) inlineToggle.addEventListener("click", openPanel);

  // ── Quality Bar (top of panel) ──────────────────────────────────
  const qualitySection = document.createElement("div");
  qualitySection.className = "teach-section";

  const qualityTitle = document.createElement("div");
  qualityTitle.className = "teach-section-title";
  qualityTitle.textContent = "品质标准 Quality Bar";
  qualitySection.appendChild(qualityTitle);

  const qualityCard = document.createElement("div");
  qualityCard.className = "teach-formula";

  const qualityName = document.createElement("div");
  qualityName.className = "teach-formula-name";
  qualityName.textContent = "核心原则 Core Principles";
  qualityCard.appendChild(qualityName);

  const qualityMethod = document.createElement("div");
  qualityMethod.className = "teach-method";
  qualityMethod.innerHTML = `<strong>① 注意力 ATTENTION</strong><br>
日常生活充满美感，只要你足够用心看<br>
Ordinary life is full of beauty if you pay enough attention<br><br>
<strong>② 凝练 COMPRESSION</strong><br>
4-10个词。每个词都要赚到自己的位置<br>
4-10 words. Every word earns its spot. If it can be cut, cut it.<br><br>
<strong>③ 感官优先 SENSE-BOUND</strong><br>
不要说情绪的名字。让画面自己说话<br>
Never name the emotion. Let the image carry it.<br><br>
<strong>④ 行为镜像 BEHAVIOR MIRROR</strong><br>
好的意象映射人的行为：善变、趋利避害、粉饰自己<br>
Good images mirror human behavior: fickleness, self-preservation, saving face<br>
「两只杯子分开坐着，交换沉默的蒸汽」— mugs trading steam = people exchanging silence after a fight<br><br>
<strong>⑤ 具体即普遍 SPECIFIC = UNIVERSAL</strong><br>
越具体地描述你的厨房桌子，越多人认出自己的<br>
The more precisely you describe YOUR kitchen table, the more everyone sees their own<br><br>
<strong>⑥ 长短错落 VARIED DENSITY</strong><br>
不是每一行都要承载同样的重量。密、密、然后一口气<br>
Not every line carries the same weight. Dense, dense, then a breath. "The milk's still out." lands hardest after two loaded images.`;
  qualityCard.appendChild(qualityMethod);

  qualitySection.appendChild(qualityCard);
  body.appendChild(qualitySection);

  // ── Micro groups (formulas, techniques, structure, stance) ─────
  const teachGroups = [
    { key: "formulas", title: "四大意象公式 Four Imagery Formulas" },
    { key: "techniques", title: "手法 Techniques" },
    { key: "structure", title: "结构招式 Structural Moves" },
    { key: "stance", title: "姿态 Stance Modifiers" },
  ];

  for (const group of teachGroups) {
    const items = MICRO_PRINCIPLE_LIST.filter((m) => m.group === group.key);
    if (items.length === 0) continue;

    const section = document.createElement("div");
    section.className = "teach-section";

    const title = document.createElement("div");
    title.className = "teach-section-title";
    title.textContent = group.title;
    section.appendChild(title);

    for (const item of items) {
      const card = document.createElement("div");
      card.className = "teach-formula";

      // Name
      const name = document.createElement("div");
      name.className = "teach-formula-name";
      name.textContent = item.label;
      card.appendChild(name);

      // Method steps
      if (item.method) {
        const method = document.createElement("div");
        method.className = "teach-method";
        method.innerHTML = item.method.replace(/\n/g, "<br>");
        card.appendChild(method);
      }

      // Examples
      if (item.examples.length > 0) {
        const exContainer = document.createElement("div");
        exContainer.className = "teach-examples";
        for (const ex of item.examples) {
          const exEl = document.createElement("div");
          exEl.className = "teach-example";
          const zhHtml = ex.zh.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
          exEl.innerHTML = [
            `<span class="ex-zh">${zhHtml}</span>`,
            `<span class="ex-en">${ex.en}</span>`,
            ex.hint ? `<span class="ex-hint">${ex.hint}</span>` : "",
            `<span class="ex-source">${ex.source}</span>`,
          ].filter(Boolean).join("");
          exContainer.appendChild(exEl);
        }
        card.appendChild(exContainer);
      }

      section.appendChild(card);
    }

    body.appendChild(section);
  }

  // ── From the Teachers ─────────────────────────────────────────
  const teacherSection = document.createElement("div");
  teacherSection.className = "teach-section";

  const teacherTitle = document.createElement("div");
  teacherTitle.className = "teach-section-title";
  teacherTitle.textContent = "老师们 From the Teachers";
  teacherSection.appendChild(teacherTitle);

  const teachers = [
    {
      name: "Adrianne Lenker — 直觉的精确",
      method: `<strong>Two dimensions of every line:</strong><br>
① 感官维度 Sensory — what can you see, touch, hear, smell?<br>
② 情感维度 Emotional — what does it FEEL like to be here?<br><br>
<strong>Self-editing discipline:</strong><br>
· 写完之后，删掉一半 Write it, then cut half<br>
· 如果一个词可以删掉而意思不变，就删 If a word can go without loss, cut it<br>
· 准确比新奇重要 Accuracy over novelty<br>
· 相信感觉，不要追求意义 Trust feeling over meaning<br><br>
<strong>Key principle:</strong> 具体到极致就是普遍<br>
Specificity IS universality. The more precisely you describe YOUR kitchen table, the more everyone recognizes their own.`,
    },
    {
      name: "Robin Pecknold — 翻译的艺术",
      method: `<strong>Lyricism is translation:</strong><br>
把感觉翻译成画面，不是描述感觉<br>
Translate feeling into image, don't describe feeling<br><br>
<strong>Phoneme supremacy:</strong><br>
· 每个音节的声音都重要 Every syllable's sound matters<br>
· 元音决定情绪：开口音=开放，闭口音=压抑<br>
  Vowels set mood: open vowels = openness, closed = tension<br>
· 歌词是给嘴巴写的，不是给眼睛 Lyrics are written for the mouth, not the eye<br><br>
<strong>高低对比 High-low contrast:</strong><br>
在同一行里混合日常和崇高<br>
Mix the mundane and the sublime in the same line<br>
「Jesus, don't cry — you can rely on me, honey」— divine + domestic in one breath`,
    },
    {
      name: "Laura Marling — 日常的叙事",
      method: `<strong>Narrativizing the mundane:</strong><br>
最好的素材不在远方，就在你的厨房<br>
The best material isn't far away — it's in your kitchen<br><br>
<strong>Portrait over confession:</strong><br>
· 从外面描述，暗示内心 Describe from outside, imply the interior<br>
· 不要说「我很难过」，说「她把茶杯转了三圈才放下」<br>
  Don't say "I'm sad" — say "she turned the teacup three times before setting it down"<br><br>
<strong>Transitional energy:</strong><br>
最好的歌词捕捉「正在变化中」的瞬间<br>
The best lyrics capture the moment of BECOMING — not before, not after, but the exact instant of change`,
    },
  ];

  for (const teacher of teachers) {
    const card = document.createElement("div");
    card.className = "teach-formula";

    const nameEl = document.createElement("div");
    nameEl.className = "teach-formula-name";
    nameEl.textContent = teacher.name;
    card.appendChild(nameEl);

    const methodEl = document.createElement("div");
    methodEl.className = "teach-method";
    methodEl.innerHTML = teacher.method;
    card.appendChild(methodEl);

    teacherSection.appendChild(card);
  }

  body.appendChild(teacherSection);
}

init();
