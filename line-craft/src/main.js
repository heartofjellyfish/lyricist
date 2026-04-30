import { SPECTRUM_LIST, MICRO_PRINCIPLE_LIST } from "./craftPrompt.js";
import { generateLines, iterateOnLine, critiqueLine } from "./craftApi.js";
import {
  getState,
  subscribe,
  setSeed,
  setSubject,
  setSpectrum,
  setMetaphor,
  addResults,
  setCritique,
  clearResults,
} from "./craftState.js";

// ── DOM References ──────────────────────────────────────────────────

const seedInput = document.getElementById("seed-input");
const subjectInput = document.getElementById("subject-input");
const spectrumsContainer = document.getElementById("spectrums-container");
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

/** Sync metaphor toggle button state (boolean). */
function renderMetaphorVisibility(on) {
  if (metaphorToggle) {
    metaphorToggle.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

/** Update example blocks to show only examples for active chips. */
// ── Render ───────────────────────────────────────────────────────────

function renderSpectrums(spectrums) {
  for (const slider of spectrumsContainer.querySelectorAll(".spectrum-slider")) {
    const key = slider.dataset.spectrum;
    if (spectrums[key] !== undefined && parseFloat(slider.value) !== spectrums[key]) {
      slider.value = spectrums[key];
    }
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

  // Restore saved state into UI
  const saved = getState();
  seedInput.value = saved.seed;
  subjectInput.value = saved.subject;

  // Initial render
  renderResults(saved.results);
  renderMetaphorVisibility(saved.metaphor ?? false);

  // Subscribe to state changes
  subscribe((s) => {
    renderSpectrums(s.spectrums);
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

  // Helper: collapsible <details> section with title + teaser summary
  function createCollapsibleSection({ title, teaser, subtitle, defaultOpen = false }) {
    const details = document.createElement("details");
    details.className = "teach-section";
    if (defaultOpen) details.open = true;

    const summary = document.createElement("summary");
    summary.className = "teach-section-summary";

    const titleEl = document.createElement("span");
    titleEl.className = "teach-section-title";
    titleEl.textContent = title;
    summary.appendChild(titleEl);

    if (teaser) {
      const teaserEl = document.createElement("span");
      teaserEl.className = "teach-section-teaser";
      teaserEl.textContent = teaser;
      summary.appendChild(teaserEl);
    }

    details.appendChild(summary);

    if (subtitle) {
      const sub = document.createElement("div");
      sub.className = "teach-section-subtitle";
      sub.textContent = subtitle;
      details.appendChild(sub);
    }

    return details;
  }

  // ── Quality Bar (top of panel) ──────────────────────────────────
  const qualitySection = createCollapsibleSection({
    title: "品质标准 Quality Bar",
    teaser: "用心看 · 少即是多 · 镜像人性",
    defaultOpen: true,
  });

  const qualityCard = document.createElement("div");
  qualityCard.className = "teach-formula";

  const qualityName = document.createElement("div");
  qualityName.className = "teach-formula-name";
  qualityName.textContent = "核心原则 Core Principles";
  qualityCard.appendChild(qualityName);

  const qualityMethod = document.createElement("div");
  qualityMethod.className = "teach-method";
  qualityMethod.innerHTML = `<strong>① 用心看 LOOK CLOSELY</strong><br>
日常生活充满美感，只要你足够用心看<br>
越具体，越普遍——越精确地写「你的」厨房桌子，越多人认出「自己的」<br>
Ordinary life is full of beauty if you look closely and pay attention.<br>
The more precisely you describe <em>your</em> kitchen table,<br>
the more everyone recognizes their own.<br><br>
<strong>② 少即是多 LESS IS MORE</strong><br>
留白给句子呼吸，给段落呼吸——句子之间、段落之间都要能喘气<br>
每个词都要赚到它的位置；能砍的就砍<br>
不要说情绪的名字——让画面自己说话<br>
长短错落只是其中一招：密、密、然后一口气<br>
White space lets lines and stanzas breathe. Every word earns its spot —<br>
if it can be cut, cut it. Never name the emotion; let the image carry it.<br>
Varied density is one tool: dense, dense, then a breath.<br><br>
<strong>③ 镜像人性与世界 MIRROR OF HUMAN NATURE</strong><br>
好的意象不是装饰——它在说一件关于「人」或「世界」的真事<br>
Good images aren't decoration — they speak a truth about human nature.<br><br>
<strong>本质：有限却渴望无限 Finite creatures with infinite longing</strong><br>
人知道自己必死，却活得像要永远——一切自我矛盾都从这里长出。<br>
Humans know they die yet live as if forever — every contradiction grows from this.<br><br>
<strong>自检 Self-check: <em>Does it hit you — a goosebump, or a sting?</em></strong><br>
起鸡皮疙瘩，或一阵轻疼——真意象让身体先动，脑子还没反应过来。<br>
装饰什么都不会让你起。<br>
Real images hit the body before the mind catches up. Decoration hits nothing.`;
  qualityCard.appendChild(qualityMethod);

  qualitySection.appendChild(qualityCard);
  body.appendChild(qualitySection);

  // ── 第一堂课 · 受用一生的写作观念 (Huang Fan Lesson 1) ──────────
  const lesson1Section = createCollapsibleSection({
    title: "第一堂课 · 受用一生的写作观念",
    teaser: "观念即杠杆 · 两个自我 · 写作即演化 · 多重真实 · 整体感 · 方法比灵感",
    subtitle: "黄梵《意象的帝国》— 动笔之前，先换一副写作的脑子",
  });

  const lesson1Cards = [
    {
      name: "一、观念是杠杆 Mindsets Are the Lever",
      method: `<strong>技巧改变行为，观念改变基因 Technique tweaks behavior; mindset rewrites DNA:</strong><br>
真正决定你写出什么的，不是句法或词汇——是你脑子里关于「写作是什么」的那些观念。<br>
What you write is determined less by technique than by what you believe writing <em>is</em>.<br><br>
<strong>本堂课的任务 The aim of this lesson:</strong><br>
不教你怎么写句子——先把那些会让你一辈子吃亏的旧观念换掉。<br>
Before technique: swap out the assumptions that will quietly sabotage every line you write.<br><br>
<em>「观念一变，笔下的世界就换了一套物理规则。」</em><br>
<em>"Change one mindset and the whole physics of your page changes."</em>`,
    },
    {
      name: "二、两个自我 · 让潜意识入场 Two Selves · Invite the Unconscious",
      method: `<strong>写作者不只一个「我」 The writer is never one person:</strong><br>
· <strong>理性的我</strong>：规划、推敲、删改<br>
  The rational I — plans, edits, cuts.<br>
· <strong>潜意识的我</strong>：冒出意外的词、奇怪的画面、不讲道理的联想<br>
  The unconscious I — ambushes you with the phrase you didn't plan.<br><br>
弗洛伊德的冰山——露出水面的一小块是理性，水下的大部分才是真正在驱动你的那个人。<br>
Freud's iceberg — the small tip is reason; the mass beneath is what actually writes.<br><br>
<strong>两种工作姿态 Two working postures:</strong><br>
· <strong>达·芬奇式</strong>：先全盘规划，一笔不差<br>
  Da Vinci — plan everything, then execute.<br>
· <strong>泼墨写意式</strong>：先放开画，再从意外里选出有意味的<br>
  Ink-splash — splash first, then recognize what's meaningful in the mess.<br><br>
<em>黄梵的劝告：初学者更需要后者——先让潜意识先说话，理性稍后再进来收拾。</em><br>
<em>Beginners need the splash, not the plan. Let the unconscious speak first; reason edits later.</em>`,
    },
    {
      name: "三、写作是演化，不是倒推 Writing Is Evolution, Not Reverse-Engineering",
      method: `<strong>两种生物比喻 Two creatures as metaphor:</strong><br>
· <strong>蜜蜂</strong>：对着一个明亮的目标拼命撞——撞不出去<br>
  The bee — slams at a bright target, never gets out.<br>
· <strong>苍蝇</strong>：乱飞试错——总能找到出口<br>
  The fly — random trials, finds the opening.<br><br>
<strong>大师们也都是先乱再收 The masters always messed up first:</strong><br>
拉斐尔留下无数草图，罗丹捏了一堆泥塑，海明威：「任何初稿都是狗屎。」<br>
Raphael's sketch piles, Rodin's clay drafts, Hemingway: <em>"The first draft of anything is shit."</em><br><br>
<strong>结尾先行法 Poe's ending-first method:</strong><br>
爱伦·坡：先想结尾，中间让想象力自己填。先知道要到哪儿，才有动力走。<br>
Poe: decide the ending first, then let imagination fill the middle. Knowing where you're going gives momentum.<br><br>
<strong>自动写作 Breton's automatism:</strong><br>
写作像给朋友写信——想到哪写到哪，别预设终点。<br>
Write like writing a letter — let it go wherever, don't pre-plot the landing.<br><br>
<em>别倒推出一首诗，要让它长出来。</em><br>
<em>Don't reverse-engineer a poem — let it grow.</em>`,
    },
    {
      name: "四、多重真实 · 夸张是文学的实质 Multiple Truth · Exaggeration Is the Substance",
      method: `<strong>事实 ≠ 真实 Fact is not truth:</strong><br>
新闻追求「事实」（what happened）。文学追求「真实」（what it <em>felt</em> like）。<br>
Journalism chases fact. Literature chases felt-truth.<br>
一件事，十个作家写出来——十个都对，但十个都不一样。<br>
Ten writers, one event, ten versions — all correct, none identical.<br><br>
<strong>扔掉「中心思想」 Throw out the "central theme":</strong><br>
语文课教你从每篇找「一个」中心思想——这是反文学的。<br>
School trained you to extract one theme per text — that's anti-literary.<br>
好作品有多层真实，读者从各自的高度取走不同的东西。<br>
Real work has layered truths; each reader takes away from their own altitude.<br><br>
<strong>夸张是本质，不是装饰 Exaggeration isn't decoration — it's the substance:</strong><br>
海鸥实验：幼鸥啄母鸟喙上的红点进食——科学家做了个假喙，红点越大越粗，<br>
幼鸥越疯狂地啄。夸张写在了基因里。<br>
The seagull experiment — chicks peck harder at a bigger, redder mock-beak.<br>
Exaggeration is written into survival itself.<br><br>
<strong>因果律也是文学的夸张 Causality is literary too:</strong><br>
海明威写《老人与海》——前面让老人连续 84 天一无所获，<br>
第 85 天遇到大马林鱼：这是人为制造的因果，让收获有了重量。<br>
Hemingway's 84 empty days before the marlin — a manufactured causality that gives the catch its weight.<br><br>
<em>准确的事实不一定动人；精心放大的「不实」才是文学。</em><br>
<em>Accurate facts don't always move. Literature is the "inaccuracy" that moves you.</em>`,
    },
    {
      name: "五、整体感 · 用暗示代替解释 Gestalt · Hint, Don't Spell Out",
      method: `<strong>格式塔原理 The Gestalt principle:</strong><br>
人脑天生要把零碎拼成整体——只看到 C 形的缺口，仍感知到一个完整的圆。<br>
The brain compulsively completes patterns — a broken C still reads as a circle.<br><br>
<strong>给弱提示，让读者补形 Give weak hints; the reader completes the shape:</strong><br>
· 一个引人入胜的<strong>标题</strong>就够了<br>
  A suggestive title is enough.<br>
  马原《冈底斯的诱惑》—「冈底斯」定了圣山的框架<br>
· 一个<strong>特殊的形式</strong>就够了<br>
  An unusual form is enough.<br>
  米沃什的《米沃什词典》用词条形式——读者自动把碎片拼成一个人的一生<br><br>
<strong>少即是整 Less is more — literally wholeness:</strong><br>
完整说出来反而让人走神。留白，读者才会走进来。<br>
Over-explain and the reader checks out. Leave space and they step in.<br><br>
<strong>黄氏理论 Huang's theorem:</strong><br>
人是审美动物；写作 = 把内心的情感、感觉、感官美化出来。<br>
Humans are aesthetic animals; writing is the aestheticizing of inner experience.<br>
金字塔：诉说 → 信件 → 散文 → 小说 → 诗歌（审美要求越来越高）<br>
Pyramid of demand: talk → letters → essay → fiction → poetry (each tier needs more aesthetic work).<br><br>
<em>不是你写得越多越好——是给的越准、留的越多，整体感越强。</em><br>
<em>Not more words — more precise hints, more space, stronger wholeness.</em>`,
    },
    {
      name: "六、方法比灵感重要 Method Over Inspiration",
      method: `<strong>灵感是奴仆，不是主人 Inspiration is your servant, not your master:</strong><br>
初学者以为没灵感就没法写。有经验的作家相反——<br>
<em>他们从不靠灵感写作，但灵感总来。</em><br>
Novices wait for inspiration. Pros never wait — and inspiration shows up anyway.<br><br>
<strong>定时定点 Fixed time, fixed place:</strong><br>
歌德、海明威、格林、托马斯·曼——都是准点坐下。每天同一时间、同一书桌。<br>
Goethe, Hemingway, Graham Greene, Thomas Mann — same time, same desk, every day.<br>
身体会认出这个时段，到点就「泉思如涌」。<br>
The body learns the slot; by the appointed hour, the mind fills it.<br><br>
<strong>限量才能敏感 Cap your output to stay sharp:</strong><br>
海明威一天 800 字封顶；托马斯·曼不超过两页；都不超过 4 小时。<br>
Hemingway: 800 words/day. Mann: 2 pages. Both capped at 4 hours.<br>
写太多、太久——对语言的敏感会迟钝（「语言脱敏」）。<br>
Write too much and language goes numb on you.<br><br>
<strong>护短心理 · 初学者的大坑 The ego-protection trap:</strong><br>
怕家人朋友「对号入座」，就不敢把人物写坏、写阴暗——人物写不起来。<br>
Afraid family will recognize themselves? You'll flinch from writing dark characters — and your characters will be dead on the page.<br>
<em>要有「被误解的勇气」——不然写出来的都是伪善、说教。</em><br>
<em>Without the courage to be misread, everything becomes pious and preachy.</em><br><br>
<em>天才等灵感；职业作家管理身体，让灵感来找他。</em><br>
<em>Amateurs wait for inspiration. Professionals manage the body so inspiration arrives on time.</em>`,
    },
  ];

  for (const card of lesson1Cards) {
    const el = document.createElement("div");
    el.className = "teach-formula";

    const nameEl = document.createElement("div");
    nameEl.className = "teach-formula-name";
    nameEl.textContent = card.name;
    el.appendChild(nameEl);

    const methodEl = document.createElement("div");
    methodEl.className = "teach-method";
    methodEl.innerHTML = card.method;
    el.appendChild(methodEl);

    lesson1Section.appendChild(el);
  }

  body.appendChild(lesson1Section);

  // ── 第三堂课 · 新诗写作的核心 (Huang Fan Lesson 3) ───────────────
  const lesson3Section = createCollapsibleSection({
    title: "第三堂课 · 新诗写作的核心",
    teaser: "准确三柱 · 主客观平衡 · 四行法则 · 陌生化 · 停顿",
    subtitle: "黄梵《意象的帝国》— 主观意象的深化、诗意单元、形式与停顿",
  });

  const lesson3Cards = [
    {
      name: "一、准确之道 · 三根支柱 Three Pillars of Accuracy",
      method: `<strong>准确不是两件事，是三件事 Accuracy has THREE pillars, not two:</strong><br>
(1) 冲撞 Clash · (2) 关联 Link · (3) 语境 Context<br><br>
<strong>① 冲撞 CLASH — 把 A 和 B 推得远远的</strong><br>
黄梵原话：「两个有<strong>相当距离</strong>的事物，搭配在一起，就会产生诗意。」<br>
<em>"Pair two things of substantial distance — that's where poetry comes from."</em><br>
距离越大越好——<em>只要还能找到关联</em>。<br>
怎么推远：跨领域配对——<br>
· 室内物件 + 天气（「大雨的铁钉」「大雨的筷子」）<br>
· 身体部位 + 政治身份（「暴君的钟」「蹬腿的舌头」）<br>
· 动物 + 官僚制度（「候鸟群 / 不必持有护照」）<br>
· 人的行为 + 地质时间<br>
❌ 回避：「春风的手」「时间的河」—— 这些已是陈词滥调，距离太近。<br>
❌ Avoid tame pairings — they've already become clichés. Push further.<br><br>
<strong>② 关联 LINK — 冲撞之后，读者能摸到的那根隐线</strong><br>
· <strong>特征关联</strong>：形状 / 颜色 / 质感 / 动作 / 温度<br>
  「黄昏的铁砧」— 共享沉重 + 炽热<br>
  「水的银鼓」— 共享圆、亮、能被敲响<br>
· <strong>场景关联</strong>：在一个具体场景里，A 和 B 自然相遇<br>
  「马蹄 = 美丽的错误」— 女人听蹄声以为丈夫归来<br>
  「海上落日 = 溺水的头颅」— 都在「水面沉没」<br>
关联要<strong>单一、隐藏</strong>——读者一眼就看见的关联 = 死句。<br>
Keep the link single and hidden. If it's obvious before the clash lands, the line is dead.<br><br>
<strong>③ 语境 CONTEXT — 让同一对 A/B 起死回生的那件事</strong><br>
同一组词，在不同语境里，可以是诗也可以是废话。<br>
黄梵的原例：<strong>「蓝色的眼睛」</strong>——<br>
· 在中国语境里是诗（蓝眼罕见，形成错搭）<br>
· 在北欧语境里是流水账（蓝眼常见，属正常搭配）<br>
"Blue eyes" is poetry in a Chinese context, a flat description in Northern Europe.<br>
Context decides whether a pair is 错搭 or 正常搭配.<br><br>
语境做工的三种方式 Three ways context does the work:<br>
· <strong>限定词收窄 B</strong>：「脊背」很普通；「<em>拱起的</em>脊背」唯一像问号<br>
  A concrete adjective narrows B to one precise shade.<br>
· <strong>场景让两物共现</strong>：「夕阳 + 椅子」本不搭；放进「遗忘在西边的」场景里，自然相遇<br>
  A scene fuses unrelated things into one image.<br>
· <strong>B 的框架重新解释 A</strong>：「候鸟」用「护照」的框架重新说——政治自由瞬间可见<br>
  B's frame re-interprets A — bureaucracy applied to birds makes freedom visible.<br>
  「筷子」用「伶人 / 绷直修长的腿 / 踮起脚尖跳芭蕾」重新解释——筷子变成夹菜的舞者<br><br>
<strong>「A 是 B」的特权 The A-is-B trick:</strong><br>
四个公式里，<strong>「A 是 B」能让距离最远</strong>。<br>
因为「是」粗暴宣告两者等同，<em>迫使读者先接受，再去挖掘</em>——表层关联的要求被降低了。<br>
"Is" bullies the reader into accepting the equation — surface similarity becomes optional.<br>
所以「高粱是一位预言家」能成立：表面毫无关联，但「是」+ 读者的搜索<br>
会把「预言家」的属性（丰欠、天气、预示）投射到「高粱」上。<br><br>
<strong>━━ 三柱齐备的范例 Examples where all three pillars work ━━</strong><br><br>
<strong>① 青春是被仇恨啃过的、布满牙印的骨头</strong>（黄梵《中年》）<br>
<em>冲撞</em>：青春 + 骨头（跨域：抽象 + 具体身体部位）<br>
<em>关联</em>：青春的锐利、爱憎分明、有恨心——与骨头的硬度和牙印吻合<br>
<em>语境</em>：「被仇恨啃过」「布满牙印」——把抽象的骨头变成具体的遗骸<br><br>
<strong>② 海上落日是溺水的头颅</strong>（徐琳玉）<br>
<em>冲撞</em>：落日 + 头颅（跨域：天体 + 身体）<br>
<em>关联</em>：两者都在「水面沉没」<br>
<em>语境</em>：「溺水」一词建了水面情景——让落日继承头颅的挣扎与悲壮<br><br>
<strong>③ 太阳张开红润的嘴 / 等着飞机伸进银色的压舌板</strong>（黄梵）<br>
<em>冲撞</em>：太阳 + 嘴、飞机 + 压舌板（两组跨域）<br>
<em>关联</em>：太阳/嘴共享红润；飞机/压舌板共享银色扁长<br>
<em>语境</em>：一个「银飞机飞过太阳」的动作，把两组关联焊成一个完整画面<br>
<em>王鼎钧：「这样的句子，稿纸都会兴奋地簌簌直响。」</em><br><br>
<strong>━━ 多义范例（对照参考）━━</strong><br>
· 「光线在我体内折断的声音」（代薇）— 通感+私密体悟<br>
· 「云，有关于这个世界的所有说法」（黄梵《词汇表》）— 极私密，少数人能共鸣<br>
· 「我把剑挂在虚无的天空中／因为它已疲惫」（育邦）— 靠「因为它已疲惫」把多义拉回可解<br><br>
<strong>━━ 记住 Remember ━━</strong><br>
<em>默认追求准确。多义需要阅历，年轻时强求多义多半失败。</em><br>
<em>Default to accuracy. Forcing ambiguity young usually fails — you need the years.</em>`,
    },
    {
      name: "二、更多准确范例 More Accuracy Examples",
      method: `<em>（三根支柱的应用案例——各家各派各种方向。）</em><br>
<em>(The three pillars, applied across poets and registers.)</em><br><br>
<strong>① 一把古老的水手刀，被离别磨亮</strong>（郑愁予）<br>
<em>冲撞</em>：水手刀 + 离别（具体金属 + 抽象情感）<br>
<em>关联</em>：「水手」唤起码头——离别之所<br>
<em>语境</em>：「磨亮」把离别的痛物化成锋利的刀伤<br><br>
<strong>② 我拥抱的幸福，也陈旧得像一位烈妇，／我一直被她揪着走</strong>（黄梵《中年》）<br>
<em>冲撞</em>：幸福 + 烈妇（正向情感 + 压抑女性形象）<br>
<em>关联</em>：都带「被动束缚」的意味<br>
<em>语境</em>：「陈旧」「揪着走」——中年的幸福已失光芒，成了压迫的习惯<br><br>
<strong>③ 秋天的镰刀和即将生锈的大地</strong>（傅元峰《安全颂》）<br>
<em>双重关联</em>：秋天/镰刀共享收获；大地/生锈共享颜色<br>
两组关联让一句诗撑起整个节气<br><br>
<strong>④ 苍穹和群山拱起的脊背／像一个问号</strong>（胡弦《窗前》）<br>
<em>限定词做工</em>：「脊背」太宽，「<em>拱起的</em>脊背」唯一匹配问号形状<br>
The adjective does the filtering — finding the one shape that fits.<br><br>
<strong>⑤ 马蹄是美丽的错误 / 我不是归人，是个过客</strong>（郑愁予《错误》）<br>
<em>B 解释 A</em>：第二行铺了场景——女子听蹄声以为丈夫归来<br>
<em>语境救援</em>：这个场景让「错误」与「美丽」合理共存<br><br>
<strong>⚠️ 黄梵的劝告:</strong> 多重关联很难得——<em>做到一种关联就已经足够了</em>。<br>
Multi-level association is rare. One solid link is already enough.<br><br>
<em>"寻求诗意时你既要大胆想象，寻求关联时又要小心求证！"</em><br>
<em>"Imagine boldly for poetry; verify carefully for the link."</em>`,
    },
    {
      name: "三、主客观平衡 MSG & Broth",
      method: `<strong>味精与清汤 The cooking metaphor:</strong><br>
· <strong>主观意象 = 味精</strong>：浓烈、提味，但放多了发苦<br>
  Subjective imagery = MSG. Potent. Use sparingly.<br>
· <strong>客观意象 = 清汤</strong>：是底、是实景，但单靠清汤诗意太淡<br>
  Objective imagery = broth. The base, but bland alone.<br><br>
<strong>染色法 The coloring move:</strong><br>
客观意象本无倾向——用一个情绪词把它「染色」，让它带上主观色彩。<br>
Objective images have no charge. One emotional word dyes them with feeling.<br><br>
范例 Example — Jeff Foster 的《袜子》四个主观意象（画线）配客观意象：<br>
「<strong>麻木的一小时</strong>、<strong>都会缓解</strong>」— 把购物场景染上受挫感<br>
「<strong>我什么都不需要</strong>」— 把物件染上硬气话背后的情感<br>
「<strong>我害怕触碰它</strong>」— 把爱物染上创伤感<br><br>
<strong>原则 Principle:</strong> 不要只用客观意象写诗；不时用主观意象增强诗意。<br>
Never write with pure objective imagery; weave in subjective moments.`,
    },
    {
      name: "四、最小诗意单元 Minimum Unit · 四行法则",
      method: `<strong>诗意浓度的效率界限 The density threshold:</strong><br>
一个完整的诗意，最少需要几行写完？1-4 行最佳。超过 4 行效率就偏低。<br>
A complete poetic thought should fit in 1-4 lines. Beyond that, efficiency drops.<br><br>
<strong>黄梵的铁律 Huang Fan's rule:</strong><br>
<em>「四行之内，至少要有一个主观意象」</em><br>
<em>"Every 4 lines must contain at least one subjective image"</em><br><br>
<strong>救场法 The rescue:</strong><br>
如果你一直用客观意象写，写到第四行诗意还很淡——<br>
立即插入一个主观意象来「提升诗意浓度」，救回稀薄的诗意。<br>
If you've been describing objectively and the poetry is thin by line 4,<br>
drop in one subjective image to lift the density.<br><br>
<strong>范例 Example — 蓝蓝《钉子》第九节:</strong><br>
「还能走到哪里？／我的字一步一步拖着我的床和我的碗」<br>
第一行客观疑问 → 第二行主观意象「字拖着床」= 写作拖着生活<br>
第二行的主观意象「拖」出了完整诗意。<br><br>
<strong>课后习题 Practice:</strong> 每天写一个不超过四行的诗节，至少包含一个主观意象。<br>
Daily exercise: write a 4-line stanza with at least one subjective image.`,
    },
    {
      name: "五、熟悉中的陌生 Form's Essence",
      method: `<strong>诗歌形式的本质 The essence of poetic form:</strong><br>
<em>「熟悉中的陌生」— familiarity, with an edge of strangeness</em><br><br>
<strong>人性双重驱动 Human nature's two drives:</strong><br>
· 求安全 → 倾向熟悉（可预见、安心）<br>
  Safety → trust the familiar (predictable, at ease)<br>
· 求冒险 → 渴望陌生（新鲜、刺激）<br>
  Adventure → crave the unfamiliar (fresh, alive)<br><br>
好的形式同时满足两者：在一个熟悉的框架里，露出刚好够的陌生。<br>
Good form satisfies both: a familiar frame with just enough strangeness.<br><br>
<strong>古诗的实现 Classical poetry's version:</strong><br>
· 平声或仄声不能连续超过三个<br>
  No more than 3 consecutive same tones — the ear craves variation<br>
· 杜甫 = 最守熟悉（但诗中个性受损）<br>
· 李白 = 倚重陌生（「蜀道难」漫不经心，自由）<br>
· 刘禹锡《乌衣巷》= 大体守格律 + 几处拗字 = 熟悉中的陌生<br><br>
<strong>新诗的启示 For new poetry:</strong><br>
用熟悉的语法和意象 + 陌生化的搭配、停顿、转行。<br>
Familiar grammar + strange combinations, pauses, line breaks.`,
    },
    {
      name: "六、泛陌生化 Universal Defamiliarization",
      method: `<strong>什克洛夫斯基的核心 Shklovsky's core insight:</strong><br>
日常事物见得多了就「视而不见」— 自动化现象 (automation)。<br>
The familiar becomes invisible — "automation" in perception.<br>
陌生化 = 让熟悉的事物变得陌生，<strong>延长感受时间</strong>。<br>
Defamiliarization = make the familiar strange to extend perception time.<br><br>
<strong>泛陌生化 — 黄梵独创的笨办法 Huang Fan's brute-force method:</strong><br>
<em>规避常识 — actively exclude every cliché you know</em><br><br>
写作时心里始终绷一根弦：<br>
写落日 → 排除「残霞如血」、「夕阳西下」一切你见过的说法<br>
写春花 → 排除「花开烂漫」一切现成的词<br>
Keep a string taut in your mind: every time you describe X,<br>
exclude every phrase about X you've ever read.<br><br>
<strong>阅读的意义 Why reading matters:</strong><br>
读书越多越好——<em>为了知道并排除更多常识</em>。<br>
Read widely — not to imitate, but to know what to avoid.<br><br>
<strong>范例 Examples:</strong><br>
· 「一月洁白的前额」— 一月+前额已陌生，再染「洁白」更陌生<br>
  "January's white forehead" — compounding strangeness<br>
· 「看这满园的<strong>欲望</strong>是多么美丽」（穆旦）— 花 → 欲望，排除了所有俗套<br>
· 「灰尘只要不停搅动没准就会有好运」— 谁也料不到好运从搅动灰尘来`,
    },
    {
      name: "七、停顿 Pauses · 形式陌生感的武器",
      method: `<strong>外在形式的陌生化 External form as defamiliarization:</strong><br>
新诗通过<strong>转行、空行、空格、标点</strong>制造停顿，延长读者的感受时间。<br>
New poetry uses line breaks, blank lines, spaces, punctuation<br>
to create pauses that slow the reader and create strangeness.<br><br>
<strong>四种武器 Four devices:</strong><br>
· <strong>转行 Line break</strong>：句子未完就换行 → 悬念。读者被迫停顿。<br>
  「我在大街上／打／车」— 「打」悬停，是打人？打车？打球？<br>
· <strong>空行 Blank line</strong>：更长的停顿，让节与节之间呼吸<br>
  Blank line = longer breath between stanzas<br>
· <strong>空格 Space</strong>：词中的断裂，制造视觉和阅读的停顿<br>
  Spaces within a line create micro-pauses<br>
· <strong>破折号 Dash</strong>：最长的停顿，像一个人大喘气<br>
  The dash is the longest pause — like gasping for breath<br><br>
<strong>范例 Example — Williams《红色手推车》:</strong><br>
把「red wheelbarrow」切成「red wheel / barrow」— 让读者在 barrow 出现前想不到婴儿车<br>
Breaking "wheelbarrow" into "wheel / barrow" blocks premature recognition<br><br>
<strong>警告 Warning — 赵丽华体的教训:</strong><br>
<em>只有外形陌生 + 无内在诗意 = 失败</em><br>
Pure formal strangeness without poetic content = failure.<br>
赵丽华把「我坚决不能容忍在公共场所的卫生间大便后不冲刷便池的人」分行<br>
形式上陌生，但去掉分行就是普通散文——毫无诗意。<br><br>
<strong>最佳组合 The best combination:</strong><br>
<em>内在诗意浓 + 外在形式陌生 = 锦上添花</em><br>
Strong poetic content + strong formal strangeness = poetry at its best.<br>
洛夫《和你和我和蜡烛》、多多《死了。死了十头》— 两者兼备。`,
    },
  ];

  for (const card of lesson3Cards) {
    const el = document.createElement("div");
    el.className = "teach-formula";

    const nameEl = document.createElement("div");
    nameEl.className = "teach-formula-name";
    nameEl.textContent = card.name;
    el.appendChild(nameEl);

    const methodEl = document.createElement("div");
    methodEl.className = "teach-method";
    methodEl.innerHTML = card.method;
    el.appendChild(methodEl);

    lesson3Section.appendChild(el);
  }

  // ── 第四堂课 · 整体感的构建 (Huang Fan Lesson 4) ──────────────────
  const lesson4Section = createCollapsibleSection({
    title: "第四堂课 · 整体感的构建",
    teaser: "叠句 · 节奏 · 象征/隐喻 · 通感 · ABA′ · 部落化 · 策略",
    subtitle: "黄梵《意象的帝国》— 从好句到好诗：如何让一首诗立得住",
  });

  const lesson4Cards = [
    {
      name: "一、叠句 Refrain · 音乐性的支架",
      method: `<strong>整体感的替代方案 The scaffold after meter:</strong><br>
古诗靠平仄押韵；新诗失去格律，要靠<strong>叠句</strong>撑起长度。<br>
Refrain replaces what classical meter used to do — it carries a long poem.<br><br>
<strong>两种叠句 Two kinds:</strong><br>
· <strong>重章叠句</strong>：整行重复，当作"楼层"，每层之间放意象<br>
  Whole-line refrain — structural "floors", imagery fills between.<br>
  《诗经·桃夭》「桃之夭夭／之子于归」<br>
· <strong>重词叠句</strong>：词或短语重复，灵活得多<br>
  Phrase refrain — a movable anchor.<br>
  多多《是》「我爱你／永不收回去」— 密集意象全挂在这一句上<br><br>
<strong>把大问题拆成每段的小问题 Break the big feeling into local ones:</strong><br>
田原《湖》用「只要不把它想成……」作两行一循环，整首诗变成三行诗的链条。<br>
Tian Yuan's refrain turns one cosmic question into a chain of three-line units.<br><br>
<em>副歌之所以是副歌——它给情感一个可以反复回到的家。</em><br>
<em>The chorus is a chorus because it gives feeling a home to return to.</em>`,
    },
    {
      name: "二、节奏 Rhythm · 呼吸即单位",
      method: `<strong>现代汉语的相对重音 Modern Mandarin stress:</strong><br>
四声最重 &gt; 三声/二声 &gt; 一声（轻）<br>
4th tone heaviest; 1st lightest.<br><br>
<strong>两种节奏感 Two rhythms:</strong><br>
· 四声密集 → 铿锵、急迫（北岛《一切》）<br>
  Dense 4th tones → urgent, percussive<br>
· 四声稀少 → 舒缓、惆怅（戴望舒《雨巷》）<br>
  Sparse 4th tones → languid, melancholy<br><br>
<strong>黑山派的"呼吸行" Olson's breath line:</strong><br>
一行 = 一口气 = 一个情感单位<br>
A line = one breath = one emotional unit.<br>
行的长短由情感决定——屏息时短，叹息时长。<br>
席慕蓉《晓镜》用短促的「我以为……」模拟欲言又止的呼吸。<br>
Xi Murong's short refrain mimics the hesitation of words not quite spoken.`,
    },
    {
      name: "三、象征 vs 隐喻 Symbol vs Metaphor",
      method: `<strong>两者都用 A + B，但"藏法"不同 Both use A + B, differently:</strong><br><br>
· <strong>象征 Symbol</strong>：只描绘 B，从不点名 A<br>
  Describe only the vehicle; never name the tenor.<br>
  闻一多《死水》只写水塘 — 从不说"这是旧社会"<br>
  雪莱《西风颂》只写风 ／ 里尔克《豹》只写豹 — 但那是所有人的牢<br>
  <em>规则像劫机犯跟家人通电话——只能暗示，不能说出来。</em><br>
  <em>Hint, don't tell — like a hijacker calling family.</em><br><br>
· <strong>隐喻 Metaphor</strong>：A 和 B 都在场，读者直接感到对比<br>
  Both tenor and vehicle present; the reader feels the collision.<br>
  多恩《别离辞》：婚姻 = 圆规的两脚<br>
  庞德《地铁车站》：面孔 = 湿枝上的花瓣<br>
  黄梵《中年》：青春 = 被啃过的骨头<br><br>
<strong>秘诀 Shortcut:</strong> 把 A 放进标题，让正文只写 B<br>
<em>Put A in the title; keep B in the body.</em><br>
钟玲《活结》／ 李少君《碧玉》— 标题点名，正文只白描。`,
    },
    {
      name: "四、通感 Synesthesia · 用一种感官写另一种",
      method: `<strong>方法 The move:</strong><br>
用一种感官的词汇去描写另一种感官——让看不见的被看见，让抽象变具体。<br>
Describe one sense in the vocabulary of another — make the invisible visible.<br><br>
<strong>两个层次 Two levels:</strong><br>
· <strong>局部通感</strong>：一行之内的交感 — Local, within a line<br>
· <strong>结构通感</strong>：整首诗靠一个感官错位撑起 — Structural, across the poem<br><br>
<strong>范例 Examples:</strong><br>
· 朱自清《荷塘月色》「缕缕清香，仿佛远处高楼上渺茫的歌声」<br>
  嗅觉 → 听觉 Scent rendered as faraway song<br>
· 兰波《元音》— 每个元音被染上颜色和场景<br>
  Rimbaud: each vowel a color (the founding, but 黄梵评「粗暴」)<br>
· 埃利蒂斯《疯狂的石榴树》— 风让不可见的树变成可见<br>
  Elytis: wind makes an invisible tree visible (黄梵赞为精炼的通感)<br>
· 本·韦弗「把路熟透／熟得像西瓜那样开裂」— 认知 → 味觉 / 视觉 / 触觉<br>
  Cognition crosses into taste, sight, and touch<br><br>
<em>诀窍：挑一个情绪或概念，问自己——如果它能被听到/尝到/摸到，是什么样？</em><br>
<em>Trick: pick a feeling; ask what it would sound, taste, or feel like.</em>`,
    },
    {
      name: "五、三段式 ABA′ · 最高杠杆的结构",
      method: `<strong>黄梵：整首诗最好用的结构招式</strong><br>
<em>The single highest-leverage whole-poem move.</em><br><br>
· <strong>A</strong> = 开场：场景或主题 Opening scene or theme<br>
· <strong>B</strong> = 翻转或深化（相当于"变奏"）Flip or deepen<br>
· <strong>A′</strong> = 回到 A，但被提升过 Return transformed<br><br>
<strong>口诀 One-line rule:</strong> <em>A 和 A′ 押韵，A 到 B 翻转。</em><br>
<em>A rhymes with A′; A flips to B.</em><br><br>
<strong>范例 Examples:</strong><br>
· 娜夜《起风了》— canonical ABA′<br>
· 黄梵《中年》— 青春↔中年（B）→ 月亮收束（A′）<br>
· 明迪《海叶集》— 海 → 母亲 → 从母亲眼中重新看见的海<br><br>
<em>对歌词同样适用：主歌 (A) → 桥段 (B) → 终章副歌 (A′ 升级)。</em><br>
<em>For lyrics: verse (A) → bridge (B) → final chorus lifted (A′).</em>`,
    },
    {
      name: "六、部落化陷阱 Tribalization · 整体感的反面",
      method: `<strong>最常见的失败模式 The most common failure:</strong><br>
局部意象再亮，如果互相对抗、没有骨架，整首诗就散了。<br>
Brilliant fragments can form hostile "tribes" that cancel each other,<br>
leaving no coherent whole.<br><br>
<strong>黄梵自评早期《怀念》</strong>作为反面教材：<br>
片段极强、但没有脊梁 — 所以失败了。<br>
Huang cites his own early poem as the cautionary example.<br><br>
<strong>整体感的脊梁 Spines that hold a poem together:</strong><br>
叠句 · 象征 · 隐喻 · 通感 · 三段式 ABA′<br>
Refrain · symbol · metaphor · synesthesia · three-part form.<br>
至少用一个作为"脊梁"——否则就是一堆亮词的堆叠。<br>
Use at least one — otherwise it's just a pile of flashy words.<br><br>
<em>自检：拿掉任何一节，诗还立得住吗？如果照样立，说明各节之间没关系。</em><br>
<em>Test: remove any stanza — does the poem still stand? If yes, the stanzas don't connect.</em>`,
    },
    {
      name: "七、写诗的策略 Writing Discipline",
      method: `不是技巧，是态度 Not tricks — attitudes.<br><br>
· <strong>不伪造情感 Never fake feeling</strong><br>
  小说可以角色扮演，诗不行——等真情绪来再写。<br>
  Fiction can role-play; poetry can't. Wait for the real feeling.<br><br>
· <strong>先短后长 Short poems first</strong><br>
  写不好短诗的人写不好长诗。别急着写史诗。<br>
  If you can't write four lines well, a long poem won't save you.<br><br>
· <strong>修改是灵魂 Revision is the soul</strong><br>
  杜甫、白居易反复修改；Elizabeth Bishop 一首诗改 10 年。<br>
  用「陌生化」做检验：放一段时间再读，像读别人的。<br>
  Let the draft cool; return and read it as a stranger would.<br><br>
· <strong>读书是为了"排除"</strong> Read widely — <em>to know what to cut</em><br>
  读得越多，能主动避开的陈词就越多（接上 泛陌生化）。<br>
  The more you read, the more clichés you can exclude.<br><br>
· <strong>诗是工作之余的爱好 Keep a day job</strong><br>
  没有现实生活的供养，诗会失血。<br>
  Poetry without a life underneath it runs thin.`,
    },
  ];

  for (const card of lesson4Cards) {
    const el = document.createElement("div");
    el.className = "teach-formula";

    const nameEl = document.createElement("div");
    nameEl.className = "teach-formula-name";
    nameEl.textContent = card.name;
    el.appendChild(nameEl);

    const methodEl = document.createElement("div");
    methodEl.className = "teach-method";
    methodEl.innerHTML = card.method;
    el.appendChild(methodEl);

    lesson4Section.appendChild(el);
  }

  // Lesson 3 and Lesson 4 sections are appended inside the teachGroups loop,
  // right after "formulas" (Lesson 2), so the book's content flows in order.

  // ── Micro groups (formulas → Lessons 3-4 → structure → stance) ─
  // Book order: Lesson 2 公式 → Lesson 3 核心 → Lesson 4 整体感 →
  // then non-Huang-Fan: benchmark songs & teachers.
  // "techniques" (染色/陌生化/通感/蒙太奇) is NOT rendered here —
  // its concepts already live inside Lessons 3-4; the MICRO_PRINCIPLES
  // data is kept so the toggle UI on the main app still works.
  const teachGroups = [
    { key: "formulas", title: "第二堂课 · 四大意象公式", teaser: "A之B · A是B · B解释A · A做不可能之事", subtitle: "黄梵《意象的帝国》— 主观意象的四种基本模式" },
    { key: "structure", title: "结构招式 Structural Moves", teaser: "悖论 · 延伸隐喻 · 时间模糊 · remedy-poison", subtitle: "Benchmark songs + non-Huang-Fan teachers" },
    { key: "stance", title: "姿态 Stance Modifiers", teaser: "现在时 · 画像 · 幽默 · in medias res · 留白", subtitle: "Benchmark songs + non-Huang-Fan teachers" },
  ];

  for (const group of teachGroups) {
    const items = MICRO_PRINCIPLE_LIST.filter((m) => m.group === group.key);
    if (items.length === 0) continue;

    const section = createCollapsibleSection({
      title: group.title,
      teaser: group.teaser,
      subtitle: group.subtitle,
    });

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

    // After Lesson 2 (formulas), insert Lessons 3 & 4 so book content flows in order
    if (group.key === "formulas") {
      body.appendChild(lesson3Section);
      body.appendChild(lesson4Section);
    }
  }

  // ── From the Teachers ─────────────────────────────────────────
  const teacherSection = createCollapsibleSection({
    title: "老师们 From the Teachers",
    teaser: "Lenker · Pecknold · Marling",
  });

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

  // ── 押韵的情感学 (Pattison · Essential Guide to Rhyming) ──────────
  const rhymeSection = createCollapsibleSection({
    title: "押韵的情感学 Rhyme as Feeling",
    teaser: "握手 · 家族 · partners · back of the hand · 情感配方",
    subtitle: "Pat Pattison《押韵精要指南》— 押韵不是查字典，是选情感",
  });

  const rhymeCards = [
    {
      name: "一、押韵是情感决策，不是查字典",
      method: `<strong>Rhyme is a feeling choice, not a lookup:</strong><br>
查字典给你一堆"听起来像"的候选；Pattison 教你选哪一个情感对。<br>
A rhyme dictionary hands you sound-alikes. Pattison teaches you which one <em>feels</em> right.<br><br>
<strong>押韵做三件事 Rhyme does three things:</strong><br>
① <strong>Spotlight</strong> 聚光 — 句末是注意力磁铁，重要的想法放在押韵点上<br>
② <strong>Connect</strong> 联结 — 声音呼应让两个瞬间显得相关<br>
③ <strong>Motion</strong> 制造运动 — 差异（声母不同）走向相同（韵腹+韵尾同）= 张力→解决<br><br>
<em>真正的问题不是"要不要押韵"，而是"用哪种押韵"匹配这里的情感。</em><br>
<em>The question is never whether to rhyme, but which kind fits the feeling.</em><br><br>
<strong>Pattison 的口号 His mantra:</strong> <em>"Reasons for choosing. Choosing for reasons."</em><br>
每一次押韵决定都必须能用情感意图解释。`,
    },
    {
      name: "二、握手隐喻 · 完美押韵的三条件",
      method: `<strong>押韵 = 两只不同的手碰在一起 Rhyme is a handshake:</strong><br>
差异（不同的手）走向相同（碰在一起）。<br>
Difference moves into sameness.<br><br>
<strong>完美押韵三条件 Three conditions of perfect rhyme:</strong><br>
① 韵腹元音相同 Same stressed vowel<br>
② 元音之后的辅音（韵尾）相同 Same coda consonants<br>
③ <strong>起始辅音（声母）不同</strong> — 这条最常被忽略 Different onsets — the often-forgotten one<br><br>
<strong>声母相同 ≠ 押韵，是 identity（同形）:</strong><br>
· fuse / confuse · place / replace · peace / piece<br>
耳朵听到的是回声，不是张力→解决。<br>
The ear hears echo, not tension-resolution. <em>Identity is not rhyme.</em>`,
    },
    {
      name: "三、阳性 vs 阴性 — 永远不混用",
      method: `<strong>Masculine vs Feminine — never mix:</strong><br>
· <strong>Masculine 阳性</strong>：重音在最后一个音节。land / command<br>
· <strong>Feminine 阴性</strong>：重音在倒数第二个音节，末尾是拖尾。landing / commanding — 押的是 "land/mand"，"-ing" 是拖尾 identity<br><br>
<strong>重音位置对不上，耳朵立刻听得出错位。</strong><br>
Stress mismatch — the ear catches it instantly.<br><br>
<strong>Mosaic rhyme 马赛克押韵</strong>（多词当一个押韵单位）:<br>
· understand her / commander<br>
· tail him / sailin'<br>
显眼而强力，但容易卖弄 — 除非写喜剧，否则少用。<br>
Flashy and strong — sparing, unless you're writing comedy.`,
    },
    {
      name: "四、完美押韵及其陷阱",
      method: `<strong>Perfect rhyme = stability 5 — the strongest resolution:</strong><br>
感受：确定、承诺、事实、关上门的瞬间。<br>
Feeling: certainty, commitment, fact, the door shutting.<br><br>
<strong>用在哪 Where:</strong> 稳定的意象、段落的收尾、V→I 的音乐性收束<br>
Stable images, end of section, V→I cadence<br><br>
<strong>陈词警报 Cliché watchlist — 看到就停:</strong><br>
<em>love / above · heart / apart · fire / desire · night / light · true / you</em><br>
这些对子太熟了，听者的耳朵跳过去不听。<br>
Too familiar — the ear skips right past them.<br><br>
<strong>aabb 连续完美押韵是杀手 The aabb perfect-rhyme trap:</strong><br>
每两句就狠狠关门一次，听者会觉得这首歌永远唱不完。<br>
Slamming the gate every two lines — makes the song feel endless.`,
    },
    {
      name: "五、家族押韵 · 音素家族表（本书枢纽）",
      method: `<strong>Family rhyme — the book's load-bearing idea:</strong><br>
逃离陈词又不丢"解决感"的答案：<br>
<strong>韵腹相同 + 韵尾辅音在同一音素家族 + 声母不同。</strong><br>
Same vowel · coda from the same phonetic family · different onset.<br><br>
<strong>音素家族表（要背下来 — memorize this）:</strong><br>
<em>Plosives 塞音</em>：浊 b d g · 清 p t k<br>
<em>Fricatives 擦音</em>：浊 v TH z zh j · 清 f th s sh ch<br>
<em>Nasals 鼻音</em>：m n ng（全浊，无清鼻音）<br>
<em>Liquids 流音</em>：l r（力量最大，后面跟什么都听不清）<br><br>
<strong>例子 Examples:</strong><br>
· safe / brave — AY 相同，f↔v partners<br>
· home / blown — OW 相同，m↔n companions<br>
· him / wind — IH 相同，m↔n companions<br><br>
<strong>感受 Feeling:</strong> 基本解决，但带一丝新鲜。摆脱 love/above 的刻板，段落仍然落地。<br>
Mostly resolved — with a breath of freshness. Free of cliché, still lands.`,
    },
    {
      name: "六、Partners vs Companions · 替换优先级",
      method: `<strong>Two kinds of family kinship:</strong><br>
· <strong>Partners 搭档</strong> — 同位置，不同清浊。b↔p · d↔t · g↔k · v↔f · z↔s · zh↔sh · j↔ch · TH↔th<br>
  Same position, different voicing.<br>
· <strong>Companions 伴侣</strong> — 同清浊，同家族，不同位置。b=d=g · p=t=k · m=n=ng<br>
  Same voicing, same family, different position.<br><br>
<strong>替换优先级 Substitution priority:</strong><br>
· <strong>塞音 Plosives</strong>：partners > companions<br>
· <strong>擦音 Fricatives</strong>：反过来 — companions > partners<br>
· <strong>鼻音 Nasals</strong>：全浊，只有 companions<br>
· <strong>ng 的特例</strong>：只能和短 ŏ、短 ŭ 配，不能配长元音<br>
  <em>ng only pairs with short o / short u — never long vowels.</em><br><br>
<em>Pattison 的建议：把表背到肌肉层面，写时不用想。</em><br>
<em>Memorize the table into your fingers — don't think while writing.</em>`,
    },
    {
      name: "七、增减押韵 · 流音的救场",
      method: `<strong>Additive / Subtractive — stability 3:</strong><br>
比家族再不稳定一档。<br>
One notch less stable than family.<br><br>
· <strong>Additive 增</strong>：一侧多出一个辅音。see / speak · free / sleet · scar / heart（r 遮掩 t）<br>
· <strong>Subtractive 减</strong>：剥掉辅音簇中最弱的。fast / as / class<br><br>
<strong>哪些辅音加上去最不破坏押韵 Least disruptive consonants:</strong><br>
① 浊塞音（最不显眼）<br>
② 清塞音<br>
③ 清擦音<br><br>
<strong>r 和 l 是最好的掩护 Liquids are the best cover:</strong><br>
流音把后面的声音几乎全吞掉，所以 scar / heart 听起来几乎像完美押韵。<br>
Liquids swallow what follows — <em>scar / heart</em> nearly reads as perfect.<br><br>
<strong>典型救场 Typical rescue:</strong> 及物动词后的宾语经常落在怪词上（"erase my heart"）<br>
→ erase → erased / ace / case — 增减可以把它救回来。`,
    },
    {
      name: "八、元音押韵 vs 辅音押韵 · 不稳定的极端",
      method: `<strong>Assonance 元音押韵 — stability 2:</strong><br>
韵腹相同，韵尾辅音<em>不相关</em>。love / hunt · tide / afterlife<br>
Same vowel, unrelated codas. Feeling: <em>响，但不收 — sounds, but doesn't close.</em><br><br>
· <strong>阳性元音押韵弱</strong> — 容易让人以为写飞了<br>
· <strong>阴性元音押韵强</strong> — 拖尾的 identity 加一层，几乎像完美押韵<br>
  lonely / homely · money / honey<br>
<em>Feminine assonance is strong. Masculine assonance is weak — need lift? Go feminine.</em><br><br>
<strong>Consonance 辅音押韵 — stability 1:</strong><br>
<strong>韵腹不同</strong>，韵尾辅音相同。最不稳定的一档。<br>
感受：悬浮、未解决、隐隐作痛。<br>
Feeling: suspended, unresolved, a quiet ache.<br><br>
<strong>Back of the hand rule 手背测试:</strong><br>
<em>"If the line would allow 'Alas!', use consonance."</em><br>
那句能换成手背贴额的古典呻吟"Alas!"？就用辅音押韵。<br><br>
<strong>经典例子 Classic:</strong> Warren Zevon "Hasten Down the Wind" — friend / wind<br>
换成完美押韵 friend / bend，整段从 longing 变成 matter-of-fact，情感垮掉。<br>
Swap to perfect and the longing collapses into a shrug.`,
    },
    {
      name: "九、局部押韵 · 故意不收尾",
      method: `<strong>Partial rhyme — refusing to close on purpose:</strong><br>
定义：阳性词和阴性词的重音音节押上韵，阴性词的拖尾留着不押。<br>
Masculine + feminine: the stressed syllables rhyme, the feminine tail hangs loose.<br><br>
<strong>例子 Examples:</strong><br>
· moving / you (Prince)<br>
· striking / night<br>
· lover / one (Billie Jean)<br><br>
<strong>为什么这么做 Why:</strong><br>
拖尾的 "-ing"、"-er" 悬在空中，不解决，把听者往下一句拉。<br>
The trailing "-ing", "-er" hangs — unresolved — pulling the listener into the next line.<br>
段落不想终止、想让动能延续到下一段时，partial 是最优雅的工具。<br><br>
<em>本质违反了"阳阴不能混"的铁律 — Pattison 说：铁律存在，就是为了让有意识的打破能制造效果。</em><br>
<em>It breaks the masculine/feminine law — and Pattison says: the law exists so you can break it on purpose.</em>`,
    },
    {
      name: "十、线内声韵 · juncture · 隐藏头韵",
      method: `<strong>Sound-binding doesn't wait for the line's end:</strong><br>
押韵不是结尾才开始的。一整句的内部都在"声音绑定"。<br><br>
<strong>Internal rhyme 内押</strong> — 押韵出现在句内，推进感强、节奏紧<br>
<strong>Assonance 元音重复</strong>：simple / hidden（非重音呼应重音）/ family（相邻元音呼应）<br><br>
<strong>Alliteration 头韵 + Concealed alliteration 隐藏头韵:</strong><br>
不只同一个声母的重复——<strong>同一音素家族</strong>的声母重复也算。<br>
比如 p 和 t 都是清塞音 companions，连续落在重读音节开头。<br>
Same phonetic family, not just same onset. Listeners don't hear the "alliteration" — they feel a voice leading.<br><br>
<strong>Juncture 连接方式 — 词尾接下一词词首:</strong><br>
· <strong>Rough / staccato</strong>：前词辅音 = 后词辅音 → 耳朵被强制停一下<br>
· <strong>Smooth / legato</strong>：词滑进下一词 → 推动<br><br>
<strong>Shelley · Ozymandias 的大师手笔:</strong><br>
"sands / stretch / far away" — staccato juncture + 隐藏头韵，把沙漠地平线在声音上也拉长了。<br>
Meaning and sound scheduled together — the desert horizon is audible.`,
    },
    {
      name: "十一、情感配方 · 韵式 × 韵型（最重要的综合章）",
      method: `<strong>Prosody = scheme × type. This is where it all lands.</strong><br><br>
<strong>韵式的音乐对应 Scheme as music:</strong><br>
· <strong>abab</strong>：第二个 a 是 dominant（属音 V）推；第二个 b 是 tonic（主音 I）收<br>
· <strong>aabb</strong>：每一对都关门 → 重启 → 再关门<br>
· <strong>xaxa</strong>：只押一次，很轻<br><br>
<strong>情感配方表 Prosodic recipes — memorize:</strong><br>
· Perfect / Perfect — 最强推，最硬收。<em>Slams the gate of hell.</em> 地狱门关死<br>
· Family / Perfect — 轻推，稳收。<em>Gate of purgatory.</em> 炼狱门<br>
· Assonance / Perfect — 几乎不推，像 xaxa。轻、飘<br>
· Family / Assonance — 软推，软落。漂浮、梦幻<br>
· Consonance / Family — 几乎不推，门只半开<br><br>
<strong>核心铁律 Iron law:</strong><br>
<em>Stable rhyme supports stable ideas. Unstable rhyme supports unstable ideas.</em><br>
稳定的押韵支撑稳定的想法，不稳定的押韵支撑不稳定的想法。<br><br>
如果一段讲不确定、失落、漂浮，用一串完美押韵收 = 把"我爱你但不能在一起"说成"所以我们结婚"。形式和情感相反，整段垮掉。<br>
反过来：坚定宣言用辅音押韵，听者会觉得你犹豫。`,
    },
    {
      name: "十二、操作铁律 · 合上书之前",
      method: `<strong>Pattison's ten rules — the ones worth memorizing:</strong><br><br>
① <strong>相信耳朵</strong>。唱出来。如果不响，它就不是押韵——不管音素表怎么说。<br>
  <em>"Sing the rhyme. If it doesn't ring, it doesn't rhyme."</em><br>
② <strong>永远不要把押韵类型作为独立标签</strong>——总是和情感作用连起来说。<br>
③ <strong>Reasons for choosing. Choosing for reasons.</strong><br>
  每个押韵决定都应该能被意图解释。<br>
④ <strong>找押韵是机械的，用押韵是创造的。</strong>给自己多一些选项，再挑。<br>
  <em>"Finding rhymes is mechanical. Using rhymes is creative."</em><br>
⑤ <strong>陈词检查</strong>：love/above、heart/apart、fire/desire、night/light、true/you — 看到就警报。新鲜感藏在 family / additive / consonance 里。<br>
⑥ <strong>阳阴不能配</strong>——除非故意用 partial 来不收束。<br>
⑦ <strong>Identity 不是押韵。</strong>fuse/confuse、place/replace 是回声，不是张力。<br>
⑧ <strong>Masculine assonance 弱，feminine assonance 强。</strong>需要力量时选阴性。<br>
⑨ <strong>辅音押韵需要 r、l、鼻音、多辅音才会落地。</strong>干净的清塞音辅音押韵容易整个丢失。<br>
⑩ <strong>aabb perfect 持续使用会让歌显得长。</strong>轮换韵式，轮换类型。<br><br>
<strong>温故六问 Six-question self-check:</strong><br>
① 这段情感稳定还是不稳定？→ 决定稳定度档位<br>
② abab 还是 aabb？→ 决定推进结构<br>
③ dominant 位置要多强的推？tonic 要多硬的收？→ 查配方表<br>
④ 候选里有没有 love/above 级别的陈词？→ 有就往下一档走<br>
⑤ 有没有 masculine 对 feminine 错配？→ 修正或故意用 partial<br>
⑥ juncture、隐藏头韵、内押有没有和情感走向一致？`,
    },
  ];

  for (const item of rhymeCards) {
    const card = document.createElement("div");
    card.className = "teach-formula";

    const nameEl = document.createElement("div");
    nameEl.className = "teach-formula-name";
    nameEl.textContent = item.name;
    card.appendChild(nameEl);

    const methodEl = document.createElement("div");
    methodEl.className = "teach-method";
    methodEl.innerHTML = item.method;
    card.appendChild(methodEl);

    rhymeSection.appendChild(card);
  }

  body.appendChild(rhymeSection);
}

init();
