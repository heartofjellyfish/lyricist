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

  // ── 第三堂课 · 新诗写作的核心 (Huang Fan Lesson 3) ───────────────
  const lesson3Section = createCollapsibleSection({
    title: "第三堂课 · 新诗写作的核心",
    teaser: "准确 · 主客观平衡 · 四行法则 · 陌生化 · 停顿",
    subtitle: "黄梵《意象的帝国》— 主观意象的深化、诗意单元、形式与停顿",
  });

  const lesson3Cards = [
    {
      name: "一、准确之道 Accuracy",
      method: `<strong>主观意象的铁律：不搭界 + 有关联</strong><br>
Lesson 2 教我们 A 和 B 要「不搭界」（冲撞产生陌生感）。<br>
Lesson 3 补上另一半：必须有「一点关联」，否则读者觉得任意、不准确。<br>
Lesson 2: A and B must clash. Lesson 3 adds: they must also share one hidden link.<br><br>
<strong>两种关联方法 Two paths to find the link:</strong><br>
· <strong>特征关联 Shared trait</strong>：A 和 B 共享某个属性（形状、颜色、质感、动作、温度）<br>
  「女人 → 云」— 都能「降水」<br>
  「黄昏 → 铁砧」— 都沉重炽热<br><br>
· <strong>情景关联 Shared scene</strong>：在一个具体场景里，A 和 B 自然相遇<br>
  「夕阳 = 遗忘在西边的椅子」— 构建一个被遗忘的场景<br>
  「马蹄 = 美丽的错误」— 女人听蹄声以为是丈夫归来<br><br>
<strong>黄金比例 Golden ratio:</strong> A 和 B 越不相关、张力越大——<em>只要关联仍然成立</em><br>
The less related, the stronger — as long as the link still holds.`,
    },
    {
      name: "二、准确 vs 多义 Two Tastes · 默认追求准确",
      method: `<strong>两种合法趣味 Two valid aesthetics:</strong><br>
· <strong>准确 Accuracy</strong>：读者「一下就懂」的收束感。私密体悟变成公共体悟。<br>
  "A click" — the reader gets it instantly. Private insight becomes common insight.<br>
· <strong>多义 Ambiguity</strong>：读者「琢磨不透」的开放感。意义像密码保持私密。<br>
  Productive ambiguity — meaning stays encoded.<br><br>
<strong>⚠️ 默认追求准确 Default to accuracy — 黄梵的劝告:</strong><br>
<em>"追求多义需要相当水准的年长诗人。年轻时强求多义，多数会围着意象打转，<br>
无兴趣或耐心解决晦涩问题，收集了一堆不严密的意象，<br>
读者失去整体感或理解。"</em><br>
Ambiguity well done requires mature experience. Young poets forcing it<br>
collect loose images and lose the reader. Aim for accuracy first.<br><br>
<strong>准确的铁律 The accuracy rule:</strong><br>
不搭界 + 能挖出关联 ＝ 准确<br>
Clash + discoverable link = accuracy<br>
<em>"寻求诗意时你既要大胆想象，寻求关联时又要小心求证！"</em><br>
<em>"Imagine boldly for poetry; verify carefully for the link."</em><br><br>
<strong>━━ 准确范例 Accuracy Examples ━━</strong><br><br>
<strong>① 青春是被仇恨啃过的、布满牙印的<strong>骨头</strong></strong>（黄梵《中年》）<br>
青春+骨头 初看不搭界。但青春的特性——尖锐、爱憎分明、硬气、有恨心——与骨头完美匹配。<br>
Youth + bone clash at first. But youth's traits — sharpness, black-and-white judgment,<br>
hardness, resentment — fit bone perfectly. The clash resolves into accuracy.<br><br>
<strong>② 我达达的<strong>马蹄</strong>是美丽的<strong>错误</strong>／我不是归人，是个过客</strong>（郑愁予《错误》）<br>
错误+马蹄 初看无关。诗人用第二句铺了场景：女子听蹄声以为丈夫归来——<br>
错误与马蹄在场景里相遇，而那份激动真让错误变得「美丽」。<br>
Error + hoofbeats seem unrelated. The scene — a woman mistaking hooves for<br>
her husband's return — fuses them, and makes the "mistake" genuinely beautiful.<br><br>
<strong>③ 一把古老的<strong>水手刀</strong>，被<strong>离别磨亮</strong></strong>（郑愁予）<br>
「水手」自然唤起码头和大海——古往今来最让人伤感的离别之所。<br>
水手刀把「离别」的抽象痛物化成锋利的刀伤。<br>
"Sailor" evokes the dock — poetry's saddest place of parting. The sailor's knife<br>
physicalizes parting-pain as a literal cut.<br><br>
<strong>④ 我拥抱的<strong>幸福</strong>，也陈旧得像一位<strong>烈妇</strong>，／我一直被她揪着走</strong>（黄梵《中年》）<br>
幸福+烈妇 似乎矛盾。但中年幸福已失去年轻时的光芒——「陈旧」「揪着走」点破：<br>
幸福变成压迫的习惯、减益的伪幸福。<br>
Happiness + "virtuous widow" seems contradictory. But mid-life happiness has dulled:<br>
"old", "being dragged" — happiness has become an oppressive habit.<br><br>
<strong>⑤ <strong>海上落日</strong>是<strong>溺水的头颅</strong></strong>（徐琳玉）<br>
落日+头颅 初看完全不搭界。关键在「溺水」——它造出一个「水上情景」，<br>
与「海上落日」的情景相似：两者都是「在水面上沉没」。情景关联一成立，<br>
落日瞬间有了被海吞没的悲壮与挣扎。<br>
Sunset + a head clash completely — until "drowning" builds a water-surface scene<br>
that mirrors the sea's own sinking sun. Once the scenes align, the sunset<br>
inherits the head's struggle and slow submersion.<br><br>
<strong>⑥ <strong>秋天</strong>的<strong>镰刀</strong>和即将<strong>生锈</strong>的<strong>大地</strong></strong>（傅元峰《安全颂》）<br>
双重关联——秋天+镰刀：收获季节离不开镰刀；大地+生锈：秋天的庄稼黄色与铁锈颜色相似。<br>
Double link — autumn + sickle: harvest needs the sickle;<br>
earth + rust: autumn yellow matches rust's color.<br><br>
<strong>⑦ 苍穹和群山<strong>拱起的脊背</strong>／像一个<strong>问号</strong></strong>（胡弦《窗前》）<br>
脊背有多种——笔直的、前凸的、左右弯曲的。<br>
诗人用限定词「拱起的」精准筛选，找到唯一与问号形状最接近的那一种脊背。<br>
Backs come in many shapes — straight, forward, curved. The adjective "hunched"<br>
filters out all others, finding the single back-shape closest to a question mark.<br><br>
<strong>━━ 多重关联 Multi-level Association（可遇不可求）━━</strong><br><br>
<strong>「<strong>太阳</strong>张开红润的<strong>嘴</strong>／等着<strong>飞机</strong>伸进银色的<strong>压舌板</strong>」</strong>（黄梵）<br>
表层两组关联：<br>
· <strong>太阳 ↔ 嘴</strong>：共享「红润」的颜色特征<br>
· <strong>飞机 ↔ 压舌板</strong>：共享「银色、扁长」的外形特征<br>
真正的准确诞生在想象里：<em>银色飞机飞过太阳的那一刻——<br>
宛如银色压舌板伸进张开的红润嘴巴</em>。两组特征关联汇合成一个完整情景。<br>
Two surface links (sun/mouth by color, plane/tongue-depressor by shape)<br>
resolve into one imagined scene: a silver plane crossing the sun = a depressor<br>
entering an open red mouth. Two trait-links fuse into a single scene-link.<br><br>
<em>王鼎钧评：「这样的句子，猜想在作者下笔时，稿纸都会兴奋地簌簌直响。」</em><br>
<strong>⚠️ 黄梵的劝告:</strong> 多重关联很难得——<em>做到一种关联就已经足够了</em>。<br>
Multi-level association is rare. One solid link is already enough.<br><br>
<strong>━━ 多义范例 Ambiguity Examples（对照参考）━━</strong><br><br>
· <strong>「光线在我体内折断的声音」</strong>（代薇《光线》）— 通感+私密体悟，靠中年阅历支撑<br>
· <strong>「云，有关于这个世界的所有说法」</strong>（黄梵《词汇表》）— 极私密，少数人能共鸣<br>
· <strong>「砸烂一只公鸡，砸烂到每块碎片，还叫！」</strong>（车前子《挽歌》）— 含义多解，靠语言美感<br>
· <strong>「树枝从云层中长出／飞鸟向往我的眼睛」</strong>（蔡天新）— 第二行多义，少人有此体悟<br>
· <strong>「我把剑挂在虚无的天空中／因为它已疲惫」</strong>（育邦《中年》）— 靠「因为它已疲惫」提供说明，把多义拉回可解<br><br>
<strong>多义的救赎 How to rescue ambiguity:</strong><br>
① 提供说明（育邦：「因为它已疲惫」）<br>
② 置于特定语境（格风：先铺「靶场、爱情、死囚」再出「头像上的半边脸正从淮安赶来」）<br>
Give an explanation, or build a specific context — so the reader has a way in.<br><br>
<strong>━━ 记住 Remember ━━</strong><br>
<em>更多诗人的诗作兼有两种趣味——像中医写处方，只是在两者的配比上增增减减。</em><br>
<em>Most real poets use both — like a Chinese doctor adjusting the ratio in a prescription.</em><br>
但新手先学准确。First master accuracy.`,
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
}

init();
