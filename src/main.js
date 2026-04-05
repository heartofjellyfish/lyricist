import {
  analyzeIdeaCoverage,
  evaluateCandidateLine,
  explainCandidateDebug,
  generateLyrics,
  getLexiconSnapshot,
  matchesSegmentationPlan,
  parsePatternDetailed,
  parsePattern,
  resolveRhymeTarget,
  summarizeModePlans,
} from "./lyricEngine.js";
import { requestOpenAIPlanDrafts, requestOpenAIFinalSelection } from "./openaiDrafts.js";
import { LOCAL_OPENAI_CONFIG } from "./localConfig.js";

const form = document.getElementById("generator-form");
const patternInput = document.getElementById("pattern-input");
const ideaInput = document.getElementById("idea-input");
const rhymeInput = document.getElementById("rhyme-input");
const rhymeSuggestions = document.getElementById("rhyme-suggestions");
const rhymeBrowserElement = document.getElementById("rhyme-browser");
const rhymeTreeElement = document.getElementById("rhyme-tree");
const orientationInput = document.getElementById("orientation-input");
const stabilityInput = document.getElementById("stability-input");
const distanceInput = document.getElementById("distance-input");
const aiSettingsElement = document.getElementById("ai-settings");
const countInput = document.getElementById("count-input");
const aiEnabledInput = document.getElementById("ai-enabled-input");
const apiKeyInput = document.getElementById("api-key-input");
const modelInput = document.getElementById("model-input");
const statusElement = document.getElementById("status");
const openAIStatusElement = document.getElementById("openai-status");
const openAIDebugElement = document.getElementById("openai-debug");
const openAIDebugBodyElement = document.getElementById("openai-debug-body");
const resultsElement = document.getElementById("results");
let lastOpenAIDebug = null;
let lastRenderedCandidates = [];

const STORAGE_KEYS = {
  apiKey: "stress-lyric-openai-api-key",
  aiEnabled: "stress-lyric-openai-enabled",
  model: "stress-lyric-openai-model",
};

const RHYME_CATEGORY_LABELS = {
  ee: "Long E",
  oo: "Long U / OO",
  eye: "Long I",
  ay: "Long A",
  oh: "Long O",
  ah: "Open A / AH",
  aw: "Open O / AW",
  a: "Short A",
  eh: "Short E",
  ih: "Short I",
  uh: "Schwa / UH",
  er: "ER",
  oy: "OY",
  ow: "OW",
  uu: "Short U / UH",
};

function titleForRhymeFamily(family) {
  return RHYME_CATEGORY_LABELS[family] ?? family.toUpperCase();
}

function buildRhymeTreeData() {
  const snapshot = getLexiconSnapshot();
  const familyMap = new Map();

  for (const entry of snapshot) {
    if (!entry.rhyme) {
      continue;
    }

    if (!familyMap.has(entry.rhyme)) {
      familyMap.set(entry.rhyme, {
        family: entry.rhyme,
        label: titleForRhymeFamily(entry.rhyme),
        words: new Set(),
      });
    }

    familyMap.get(entry.rhyme).words.add(entry.text);
  }

  return [
    {
      group: "Popular",
      items: ["oo", "ee", "eye", "ay", "oh"]
        .filter((family) => familyMap.has(family))
        .map((family) => familyMap.get(family)),
    },
    {
      group: "Open Vowels",
      items: ["ah", "aw", "a", "eh", "ih", "uh", "uu"]
        .filter((family) => familyMap.has(family))
        .map((family) => familyMap.get(family)),
    },
    {
      group: "Special Colors",
      items: ["er", "oy", "ow"]
        .filter((family) => familyMap.has(family))
        .map((family) => familyMap.get(family)),
    },
  ].filter((group) => group.items.length > 0);
}

function renderRhymeBrowser() {
  const groupedFamilies = buildRhymeTreeData();
  const datalistOptions = [];

  rhymeTreeElement.innerHTML = [
    `
      <details class="rhyme-group">
        <summary>No Rhyme</summary>
        <div class="rhyme-actions">
          <button class="rhyme-chip" type="button" data-rhyme="">No constraint</button>
        </div>
      </details>
    `,
    ...groupedFamilies.map((group) => {
      const body = group.items
        .map((item) => {
          const words = [...item.words].sort().slice(0, 8);
          datalistOptions.push(
            `<option value="${item.family}">${item.label}: ${words.slice(0, 3).join(", ")}</option>`,
          );
          for (const word of words) {
            datalistOptions.push(`<option value="${word}">${item.label} example</option>`);
          }

          return `
            <div class="rhyme-family">
              <div class="rhyme-family-head">
                <button class="rhyme-chip" type="button" data-rhyme="${item.family}">
                  ${item.family}
                </button>
                <span class="rhyme-family-title">${item.label}</span>
              </div>
              <div class="rhyme-actions">
                ${words
                  .map(
                    (word) =>
                      `<button class="rhyme-word" type="button" data-rhyme="${word}">${word}</button>`,
                  )
                  .join("")}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <details class="rhyme-group">
          <summary>${group.group}</summary>
          <div class="rhyme-group-body">${body}</div>
        </details>
      `;
    }),
  ].join("");

  rhymeSuggestions.innerHTML = datalistOptions.join("");
}

function wireRhymeBrowser() {
  rhymeTreeElement.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-rhyme]");
    if (!trigger) {
      return;
    }

    rhymeInput.value = trigger.dataset.rhyme ?? "";
    if (rhymeBrowserElement) {
      rhymeBrowserElement.open = false;
    }
    rhymeInput.focus();
  });
}

function renderEmptyState(message) {
  resultsElement.innerHTML = `<p class="empty-state">${message}</p>`;
}

function renderError(message) {
  statusElement.innerHTML = `<p class="status-copy">${message}</p>`;
  statusElement.dataset.state = "error";
}

function renderReady(message) {
  statusElement.innerHTML = `<p class="status-copy">${message}</p>`;
  statusElement.dataset.state = "ready";
}

function renderOpenAIStatus(message, state = "ready") {
  openAIStatusElement.innerHTML = message ? `<p class="status-copy">${message}</p>` : "";
  openAIStatusElement.dataset.state = state;
}

function renderOpenAIDebug() {
  if (!lastOpenAIDebug) {
    openAIDebugBodyElement.innerHTML = `<p class="meta">No OpenAI request yet.</p>`;
    return;
  }

  const planRows = (lastOpenAIDebug.planDrafts ?? [])
    .map((plan, index) => {
      const accepted = (plan.acceptedLines ?? []).slice(0, 4).join(" | ") || "none";
      const linePreview =
        (plan.segmentLines ?? [])
          .slice(0, 4)
          .map((segments) => segments.join(" | "))
          .join(" | ") || "none";
      return `
        <li>
          <strong>Plan ${index + 1} (${escapeHtml(plan.mode || "mixed")}):</strong>
          <div class="slot-plan-debug">
            ${renderSegmentationPlan(
              (plan.slots ?? []).map((slot) => ({
                pattern: `${slot.text}${slot.mergedLoose ? "*" : ""}`,
                plan: slot.kind,
              })),
            )}
          </div>
          <div class="meta">Accepted: ${escapeHtml(accepted)}</div>
          <div class="meta">Raw returned: ${escapeHtml(linePreview || "none")}</div>
          ${
            plan.prompt
              ? `<details class="candidate-details" open><summary>Plan prompt</summary><pre class="debug-block">${escapeHtml(
                  plan.prompt,
                )}</pre></details>`
              : ""
          }
          ${plan.error ? `<div class="meta">Error: ${escapeHtml(plan.error)}</div>` : ""}
        </li>
      `;
    })
    .join("");

  openAIDebugBodyElement.innerHTML = `
    <p class="meta"><strong>Model:</strong> ${escapeHtml(lastOpenAIDebug.model || "unknown")}</p>
    <p class="meta"><strong>Token usage:</strong> ${escapeHtml(
      lastOpenAIDebug.usage
        ? `${lastOpenAIDebug.usage.totalTokens} total (${lastOpenAIDebug.usage.inputTokens} in / ${lastOpenAIDebug.usage.outputTokens} out)`
        : "none",
    )}</p>
    <p class="meta"><strong>Plans requested:</strong> ${lastOpenAIDebug.requested ?? 0}</p>
    ${
      lastOpenAIDebug.selectionPrompt
        ? `<details class="candidate-details" open><summary>Plan selection prompt</summary><pre class="debug-block">${escapeHtml(
            lastOpenAIDebug.selectionPrompt,
          )}</pre></details>`
        : ""
    }
    ${
      lastOpenAIDebug.selectionRaw
        ? `<p class="meta"><strong>Plan selection raw:</strong> ${escapeHtml(lastOpenAIDebug.selectionRaw)}</p>`
        : ""
    }
    ${
      lastOpenAIDebug.prompt
        ? `<details class="candidate-details" open><summary>Prompt bundle</summary><pre class="debug-block">${escapeHtml(
            lastOpenAIDebug.prompt,
          )}</pre></details>`
        : ""
    }
    <ul class="meta-list">${planRows || "<li>none</li>"}</ul>
    <details class="candidate-details">
      <summary>Instructions</summary>
      <pre class="debug-block">${escapeHtml(lastOpenAIDebug.instructions || "")}</pre>
    </details>
  `;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parsePlanKey(planKey) {
  return String(planKey || "")
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => {
      const [patternPart, planPart] = piece.split("->").map((item) => item.trim());
      return {
        pattern: patternPart || "",
        plan: planPart || "",
      };
    });
}

function renderSegmentationPlan(slots) {
  const normalized = (slots ?? []).filter((slot) => slot.pattern || slot.plan);
  if (normalized.length === 0) {
    return `<div class="slot-plan-empty">none</div>`;
  }

  const columns = normalized
    .map(
      (_, index) => `minmax(${Math.max(String(normalized[index].pattern || "").length, 6)}ch, 1fr)`,
    )
    .join(" ");

  const segmentationCells = normalized
    .map((slot) => `<span class="slot-plan-cell slot-plan-pattern">${escapeHtml(slot.pattern)}</span>`)
    .join("");

  return `
    <div class="slot-plan-block">
      <div class="slot-plan-grid" style="grid-template-columns:${columns}">${segmentationCells}</div>
    </div>
  `;
}

function renderPlanCoverage(slots) {
  const rows = (slots ?? []).filter((slot) => slot.coverage);
  if (rows.length === 0) {
    return "";
  }

  return `
    <ul class="meta-list">
      ${rows
        .map((slot) => {
          const coverage = slot.coverage;
          const label = slot.text || slot.pattern || "";
          const relaxedNote =
            coverage.relaxedCount > 0 && coverage.relaxedCount !== coverage.totalCount
              ? `, +${coverage.relaxedCount} relaxed`
              : coverage.relaxedCount > 0
                ? `, relaxed`
                : "";
          const examples = (coverage.examples ?? []).slice(0, 3).join(", ");
          return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(
            `${coverage.totalCount} usable (${coverage.band}; lyric exact ${coverage.lyricExactCount}, raw ${coverage.rawExactCount}${relaxedNote})`,
          )}${examples ? ` — ${escapeHtml(examples)}` : ""}</li>`;
        })
        .join("")}
    </ul>
  `;
}

function renderDebugTrace(candidate) {
  const debug = explainCandidateDebug({
    lineText: candidate.text,
    patternText: patternInput.value,
    ideaText: ideaInput.value,
    rhymeTarget: rhymeInput.value,
    source: candidate.source ?? "local",
  });

  const keptWords = [...new Set(debug.ideaExpansion.finalThemeTags)].slice(0, 10);
  const planningPreview = (debug.planning ?? []).slice(0, 3);
  const planUsed =
    candidate.diagnostics?.structure && !/draft$/u.test(candidate.diagnostics.structure)
      ? candidate.diagnostics.structure
      : debug.slotTrace.map((slot) => slot.pos).join(" ");
  const chosenWords = debug.slotTrace
    .map(
      (slot, index) =>
        `Word ${index + 1}: ${slot.word} (${slot.pos}, ${slot.expected.join(" ")} -> ${slot.matchedPattern.join(" ")})`,
    )
    .join(" | ");
  const planSteps = `
      <div class="meta"><strong>Step 2. Local slot plans:</strong>${planningPreview
        .map(
          (plan, index) =>
            `<div class="slot-plan-debug"><div class="slot-plan-debug-title">Plan ${index + 1}</div>${renderSegmentationPlan(
              plan.slots.map((slot) => ({
                pattern: `${slot.text}${slot.mergedLoose ? "*" : ""}`,
                plan: slot.kind,
                coverage: slot.coverage,
              })),
            )}${renderPlanCoverage(
              plan.slots.map((slot) => ({
                text: `${slot.text}${slot.mergedLoose ? "*" : ""}`,
                coverage: slot.coverage,
              })),
            )}</div>`,
        )
        .join("") || " none"}</div>
      <p class="meta"><strong>Step 3. Idea words kept in play:</strong> ${escapeHtml(
        keptWords.join(", ") || "none",
      )}</p>
      <div class="meta"><strong>Step 4. Segmentation used:</strong>${renderSegmentationPlan(
        parsePlanKey(planUsed),
      )}</div>
      <p class="meta"><strong>Step 5. Local words chosen:</strong> ${escapeHtml(chosenWords)}</p>
      <p class="meta"><strong>Step 6. Other lines from this plan:</strong> ${escapeHtml(
        (candidate.planAlternatives ?? []).slice(1, 4).join(" | ") || "none",
      )}</p>
  `;

  return `
    <div class="debug-trace">
      <p class="meta"><strong>Source:</strong> ${escapeHtml(debug.source)}</p>
      ${
        candidate.source === "openai" && candidate.tokenUsage
          ? `<p class="meta"><strong>OpenAI tokens:</strong> ${escapeHtml(
              `${candidate.tokenUsage.totalTokens} total (${candidate.tokenUsage.inputTokens} in / ${candidate.tokenUsage.outputTokens} out)`,
            )}</p>`
          : ""
      }
      <p class="meta"><strong>Step 1. Read your pattern:</strong> <code>${escapeHtml(
        debug.input.flatTokens.join(" "),
      )}</code></p>
      ${planSteps}
      <p class="meta"><strong>Step 8. Checked stress:</strong> ${escapeHtml(
        debug.validation.reason,
      )} Final stress was <code>${escapeHtml(debug.validation.lexicalFlattened.join(" "))}</code></p>
      <p class="meta"><strong>Step 9. Final checks:</strong> ${escapeHtml(
        debug.scoring.rhyme.message,
      )}</p>
    </div>
  `;
}

function renderResults(candidates) {
  lastRenderedCandidates = candidates;
  if (candidates.length === 0) {
    renderEmptyState(
      "No relevant exact-match lines yet. Try a clearer image field, or loosen the vibe and test the meter first.",
    );
    return;
  }

  resultsElement.innerHTML = candidates
    .map((candidate, index) => {
      const summaryLine = candidate.diagnostics.rhyme;

      return `
        <article class="candidate">
          <div class="candidate-head">
            <span class="candidate-index">Option ${index + 1}</span>
            <span class="candidate-score">${candidate.source === "openai" ? "AI draft" : `Score ${candidate.score}`}</span>
          </div>
          <div class="candidate-summary">
            <strong>Segmentation</strong>
            ${renderSegmentationPlan(parsePlanKey(candidate.planKey || candidate.diagnostics.structure || "unknown"))}
            <span class="slot-plan-count">${candidate.planCandidateCount ?? 1} line${(candidate.planCandidateCount ?? 1) === 1 ? "" : "s"}</span>
            <span class="slot-plan-count">Alternatives: ${escapeHtml(
              (candidate.planAlternatives ?? []).slice(1, 4).join(" | ") || "none",
            )}</span>
          </div>
          <p class="candidate-line">${candidate.text}</p>
          <p class="candidate-summary">${summaryLine}</p>
          <details class="candidate-details">
            <summary>Why this matched</summary>
            <p class="meta">Pattern: ${candidate.validation.tokens.join(" ")}</p>
            <p class="meta">Rhyme: ${candidate.diagnostics.rhyme}</p>
            <div class="debug-trace-shell" data-candidate-index="${index}"></div>
          </details>
        </article>
      `;
    })
    .join("");
}

resultsElement.addEventListener("toggle", (event) => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.open) {
    return;
  }

  const shell = details.querySelector(".debug-trace-shell");
  if (!shell || shell.dataset.loaded === "true") {
    return;
  }

  const index = Number(shell.dataset.candidateIndex);
  const candidate = lastRenderedCandidates[index];
  if (!candidate) {
    return;
  }

  shell.innerHTML = renderDebugTrace(candidate);
  shell.dataset.loaded = "true";
});

function explainNoMatch(patternText, rhymeTarget, { aiEnabled = false, aiReturned = 0 } = {}) {
  const parsed = parsePatternDetailed(patternText);
  const normalizedRhyme = resolveRhymeTarget(rhymeTarget);
  const lastGroup = parsed.groups.at(-1);
  const workflowHint =
    aiEnabled && aiReturned > 0
      ? "OpenAI returned plan-conditioned drafts, but none survived exact segmentation and stress validation."
      : "The current local generator could not build an exact match yet.";

  if (!normalizedRhyme) {
    return `No exact-match lines yet. ${workflowHint} Try a simpler pattern, a clearer image field, or leave rhyme blank.`;
  }

  if (lastGroup?.compact) {
    const compactKey = lastGroup.tokens.join(" ");
    const matchingCompactEndings = getLexiconSnapshot().filter(
      (entry) =>
        entry.allowedLyricPatterns.some((pattern) => pattern.join(" ") === compactKey) &&
        entry.rhyme === normalizedRhyme,
    );

    if (matchingCompactEndings.length === 0) {
      return `No exact-match lines yet. ${workflowHint} The current lexicon has no compact ending for ${lastGroup.text} in the "${normalizedRhyme}" rhyme family. Try a different rhyme target or leave rhyme blank.`;
    }
  }

  return `No exact-match lines yet. ${workflowHint} Try a different rhyme target, leave rhyme blank, or simplify the pattern.`;
}

function mergeCandidateSets(primaryCandidates, aiCandidates, candidateCount) {
  const merged = [];
  const seen = new Set();

  const ranked = [...aiCandidates, ...primaryCandidates].sort((a, b) => {
    const sourceBias = (candidate) => (candidate.source === "openai" ? 1000 : 0);
    return sourceBias(b) + b.score - (sourceBias(a) + a.score);
  });

  for (const candidate of ranked) {
    if (seen.has(candidate.text)) {
      continue;
    }
    seen.add(candidate.text);
    merged.push(candidate);
    if (merged.length >= candidateCount) {
      break;
    }
  }

  return merged;
}

function loadSettings() {
  apiKeyInput.value =
    localStorage.getItem(STORAGE_KEYS.apiKey)?.trim() || LOCAL_OPENAI_CONFIG.apiKey || "";
  aiEnabledInput.checked = Boolean(LOCAL_OPENAI_CONFIG.aiEnabled);
  modelInput.value =
    localStorage.getItem(STORAGE_KEYS.model)?.trim() || LOCAL_OPENAI_CONFIG.model || modelInput.value;
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.model, modelInput.value.trim());
}

async function collectOpenAICandidates({
  patternText,
  ideaText,
  rhymeTarget,
  candidateCount,
  orientation,
  stability,
  distance,
}) {
  const apiKey = apiKeyInput.value.trim();
  if (!aiEnabledInput.checked || !apiKey) {
    lastOpenAIDebug = null;
    return {
      candidates: [],
      stats: {
        enabled: false,
        requested: 0,
        returned: 0,
        valid: 0,
        usage: null,
      },
    };
  }

  const requestedPlanCount = Math.max(candidateCount + 13, 18);
  const planPool = summarizeModePlans(patternText, requestedPlanCount);
  const currentModel = modelInput.value.trim() || "gpt-4.1-mini";
  const draftModel = currentModel === "gpt-4.1-mini" ? "gpt-4.1" : currentModel;
  const orderedPlanPool = [...planPool];
  const targetAcceptedPlanCount = Math.max(candidateCount * 2, candidateCount + 3);
  let returnedCount = 0;
  let usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  const mergedPlanDrafts = [];

  function hydratePlanDraft(planResult) {
    const accepted = (planResult.segmentLines ?? [])
      .map((rawSegments) => {
        const segments = Array.isArray(rawSegments)
          ? rawSegments.map((segment) => String(segment || "").trim()).filter(Boolean)
          : [];
        if (segments.length !== (planResult.slots ?? []).length) {
          return null;
        }
        if (segments.some((segment) => /\s/u.test(segment))) {
          return null;
        }
        const lineText = segments.join(" ");
        if (!matchesSegmentationPlan(lineText, planResult.slots ?? [])) {
          return null;
        }
        return evaluateCandidateLine({
          lineText,
          patternText,
          ideaText,
          rhymeTarget,
          source: "openai",
          planKey: planResult.planKey,
        });
      })
      .filter(Boolean);

    const rankedAccepted = accepted
      .sort((a, b) => b.score - a.score)
      .map((candidate) => candidate.text)
      .filter((text, index, allTexts) => allTexts.indexOf(text) === index);

    return {
      ...planResult,
      acceptedLines: rankedAccepted,
    };
  }

  async function runPlanBatch(plans, model, strictRetry = false, countPerPlan = 1) {
    if (!plans.length) {
      return [];
    }
    const draftResult = await requestOpenAIPlanDrafts({
      apiKey,
      model,
      patternText,
      ideaText,
      rhymeTarget,
      orientation,
      stability,
      distance,
      plans,
      countPerPlan,
      strictRetry,
    });
    usage = {
      inputTokens: usage.inputTokens + (draftResult.usage?.inputTokens ?? 0),
      outputTokens: usage.outputTokens + (draftResult.usage?.outputTokens ?? 0),
      totalTokens: usage.totalTokens + (draftResult.usage?.totalTokens ?? 0),
    };
    returnedCount += draftResult.planResults.reduce(
      (sum, planResult) => sum + ((planResult.segmentLines ?? []).length || 0),
      0,
    );
    return draftResult.planResults.map(hydratePlanDraft);
  }

  const acceptedByPlanKey = new Map();
  let instructions = "";
  let promptBundle = "";

  for (let index = 0; index < orderedPlanPool.length && acceptedByPlanKey.size < targetAcceptedPlanCount; index += 4) {
    const batch = orderedPlanPool.slice(index, index + 4);
    const initialDrafts = await runPlanBatch(batch, draftModel, false, 1);
    mergedPlanDrafts.push(...initialDrafts);

    for (const plan of initialDrafts) {
      if (plan.acceptedLines.length > 0 && !acceptedByPlanKey.has(plan.planKey)) {
        acceptedByPlanKey.set(plan.planKey, plan);
      }
    }
  }

  if (acceptedByPlanKey.size < targetAcceptedPlanCount && currentModel === "gpt-4.1-mini") {
    const strongerModel = "gpt-4.1";
    const remainingPlans = orderedPlanPool.filter((plan) => !acceptedByPlanKey.has(plan.planKey));
    for (let index = 0; index < remainingPlans.length && acceptedByPlanKey.size < targetAcceptedPlanCount; index += 4) {
      const batch = remainingPlans.slice(index, index + 4);
      const strongerDrafts = await runPlanBatch(batch, strongerModel, false, 1);
      mergedPlanDrafts.push(...strongerDrafts);
      for (const plan of strongerDrafts) {
        if (plan.acceptedLines.length > 0 && !acceptedByPlanKey.has(plan.planKey)) {
          acceptedByPlanKey.set(plan.planKey, plan);
        }
      }
    }
  }

  if (acceptedByPlanKey.size < targetAcceptedPlanCount) {
    const failedRepairPlans = mergedPlanDrafts
      .filter((plan) => !acceptedByPlanKey.has(plan.planKey))
      .filter((plan) => (plan.segmentLines ?? []).length > 0)
      .slice(0, Math.max(candidateCount * 2, 6))
      .map((plan) => ({
        ...plan,
        repairExamples: (plan.segmentLines ?? []).slice(0, 3),
      }));

    if (failedRepairPlans.length > 0) {
      const repairModel = draftModel;
      const repairedDrafts = await runPlanBatch(failedRepairPlans, repairModel, true, 2);
      for (const plan of repairedDrafts) {
        const originalIndex = mergedPlanDrafts.findIndex((item) => item.planKey === plan.planKey);
        if (originalIndex >= 0) {
          const existing = mergedPlanDrafts[originalIndex];
          mergedPlanDrafts[originalIndex] =
            plan.acceptedLines.length >= (existing.acceptedLines?.length ?? 0) ? plan : existing;
        } else {
          mergedPlanDrafts.push(plan);
        }
        if (plan.acceptedLines.length > 0 && !acceptedByPlanKey.has(plan.planKey)) {
          acceptedByPlanKey.set(plan.planKey, plan);
        }
      }
    }
  }

  const expandedAcceptedCandidates = [...acceptedByPlanKey.values()]
    .flatMap((plan) =>
      plan.acceptedLines.map((lineText) => {
        const candidate = evaluateCandidateLine({
          lineText,
          patternText,
          ideaText,
          rhymeTarget,
          source: "openai",
          planKey: plan.planKey,
        });
        if (!candidate) {
          return null;
        }
        return {
          ...candidate,
          planMode: plan.mode,
          planAlternatives: plan.acceptedLines,
          planCandidateCount: plan.acceptedLines.length,
          tokenUsage: plan.usage,
        };
      }),
    )
    .filter(Boolean);

  let rankedCandidates = expandedAcceptedCandidates.sort((a, b) => b.score - a.score);

  let finalSelection = { prompt: "", rawText: "", indexes: [], usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, instructions: "" };
  if (rankedCandidates.length > candidateCount) {
    const finalSelectionPool = rankedCandidates.slice(0, Math.min(candidateCount * 3, 15));
    try {
      finalSelection = await requestOpenAIFinalSelection({
        apiKey,
        model: currentModel,
        ideaText,
        rhymeTarget,
        orientation,
        stability,
        distance,
        candidates: finalSelectionPool.map((candidate) => ({
          mode: candidate.planMode,
          segmentation: candidate.planKey,
          line: candidate.text,
        })),
        count: candidateCount,
      });
      usage = {
        inputTokens: usage.inputTokens + (finalSelection.usage?.inputTokens ?? 0),
        outputTokens: usage.outputTokens + (finalSelection.usage?.outputTokens ?? 0),
        totalTokens: usage.totalTokens + (finalSelection.usage?.totalTokens ?? 0),
      };
      if (finalSelection.indexes.length > 0) {
        const chosen = finalSelection.indexes
          .map((index) => finalSelectionPool[index - 1])
          .filter(Boolean);
        const chosenTexts = new Set(chosen.map((candidate) => candidate.text));
        const remainder = rankedCandidates.filter((candidate) => !chosenTexts.has(candidate.text));
        rankedCandidates = [...chosen, ...remainder];
      }
    } catch {}
  }

  const candidates = [];
  const seenStarts = new Set();
  const seenPlans = new Set();

  for (const candidate of rankedCandidates) {
    if (seenPlans.has(candidate.planKey)) {
      continue;
    }
    const normalizedStart = candidate.text.split(/\s+/u).slice(0, 2).join(" ").toLowerCase();
    if (seenStarts.has(normalizedStart) && rankedCandidates.length > candidateCount) {
      continue;
    }
    candidates.push(candidate);
    seenStarts.add(normalizedStart);
    seenPlans.add(candidate.planKey);
    if (candidates.length >= candidateCount) {
      break;
    }
  }

  for (const candidate of rankedCandidates) {
    if (candidates.length >= candidateCount) {
      break;
    }
    if (candidates.some((item) => item.text === candidate.text)) {
      continue;
    }
    if (seenPlans.has(candidate.planKey)) {
      continue;
    }
    candidates.push(candidate);
    seenPlans.add(candidate.planKey);
  }

  lastOpenAIDebug = {
    modePlans: orderedPlanPool.slice(0, candidateCount),
    selectionPrompt: "",
    selectionRaw: "",
    planDrafts: mergedPlanDrafts,
    usage,
    requested: orderedPlanPool.length,
    instructions,
    hints: { orientation, stability, distance },
    prompt: mergedPlanDrafts.map((item) => `# ${item.mode || "plan"}\n${item.prompt}`).join("\n\n"),
    model: modelInput.value.trim() || "gpt-4.1-mini",
    slotPlans: orderedPlanPool.slice(0, candidateCount),
    finalSelection,
  };

  return {
    candidates,
    stats: {
      enabled: true,
      requested: orderedPlanPool.length,
      returned: returnedCount,
      valid: candidates.length,
      usage,
    },
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  persistSettings();

  try {
    parsePattern(patternInput.value);
  } catch (error) {
    renderError(error.message);
    renderEmptyState("Use only DUM, dum, and da in the pattern field.");
    return;
  }

  renderReady("Generating lines...");
  renderOpenAIStatus(
    aiEnabledInput.checked && apiKeyInput.value.trim()
      ? "OpenAI: request queued."
      : "OpenAI: off. Using local generator only.",
  );

  const localCandidates =
    aiEnabledInput.checked && apiKeyInput.value.trim()
      ? []
      : generateLyrics({
          patternText: patternInput.value,
          ideaText: ideaInput.value,
          rhymeTarget: rhymeInput.value,
          candidateCount: Number(countInput.value),
        });
  let aiCandidates = [];
  let openAIStats = {
    enabled: aiEnabledInput.checked && Boolean(apiKeyInput.value.trim()),
    requested: 0,
    returned: 0,
    valid: 0,
    failed: false,
    usage: null,
    errorMessage: "",
  };
  try {
    const openAIResult = await collectOpenAICandidates({
      patternText: patternInput.value,
      ideaText: ideaInput.value,
      rhymeTarget: rhymeInput.value,
      candidateCount: Number(countInput.value),
      orientation: orientationInput.value,
      stability: stabilityInput.value,
      distance: distanceInput.value,
    });
    aiCandidates = openAIResult.candidates;
    openAIStats = { ...openAIStats, ...openAIResult.stats };
  } catch (error) {
    openAIStats.failed = true;
    openAIStats.errorMessage = error.message;
    lastOpenAIDebug = {
      ...(lastOpenAIDebug ?? {}),
      error: error.message,
      model: modelInput.value.trim() || "gpt-4.1-mini",
    };
    renderError(`OpenAI plan draft request failed: ${error.message}`);
    renderOpenAIStatus(`OpenAI: failed. ${error.message}`, "error");
  }
  const candidates =
    openAIStats.enabled && !openAIStats.failed
      ? aiCandidates.slice(0, Number(countInput.value))
      : localCandidates;
  const coverage = analyzeIdeaCoverage(ideaInput.value);

  if (candidates.length === 0 && coverage.ideaWords.length > 0 && coverage.coverageRatio < 0.34) {
    renderError(
      `Current vocabulary barely covers this vibe yet. Missing key words: ${coverage.missing
        .slice(0, 6)
        .join(", ")}. Try a broader image field, leave rhyme blank, or test the meter first.`,
    );
  } else if (candidates.length === 0) {
    renderError(
      explainNoMatch(patternInput.value, rhymeInput.value.trim(), {
        aiEnabled: openAIStats.enabled,
        aiReturned: openAIStats.returned,
      }),
    );
  } else {
    const aiSummary = openAIStats.enabled
      ? openAIStats.failed
        ? " OpenAI call failed, so you are seeing local-only results."
        : openAIStats.valid > 0
            ? ` OpenAI returned ${openAIStats.returned} draft line${
              openAIStats.returned === 1 ? "" : "s"
            } across ${openAIStats.requested} plan${
              openAIStats.requested === 1 ? "" : "s"
            }; validated plan-conditioned drafts were merged into the final set.${
              openAIStats.usage
                ? ` Tokens: ${openAIStats.usage.totalTokens} total (${openAIStats.usage.inputTokens} in / ${openAIStats.usage.outputTokens} out).`
                : ""
            }`
          : ` OpenAI returned ${openAIStats.returned} draft line${
              openAIStats.returned === 1 ? "" : "s"
            }, but none survived exact validation for their segmentation plan.${
              openAIStats.usage
                ? ` Tokens: ${openAIStats.usage.totalTokens} total (${openAIStats.usage.inputTokens} in / ${openAIStats.usage.outputTokens} out).`
                : ""
            }`
      : "";
    renderReady(
      `Generated ${candidates.length} exact-match option${
        candidates.length === 1 ? "" : "s"
      }. Pick a line you like first, then open “Why this matched” only if you want the analysis.${aiSummary}`,
    );
  }

  if (openAIStats.enabled) {
    if (openAIStats.failed) {
      renderOpenAIStatus(
        `OpenAI: failed. ${openAIStats.errorMessage || "Showing local-only results."}`,
        "error",
      );
    } else if (openAIStats.returned === 0) {
      renderOpenAIStatus("OpenAI: called, but returned 0 usable draft lines.", "error");
    } else if (openAIStats.valid === 0) {
      renderOpenAIStatus(
        `OpenAI: returned ${openAIStats.returned} draft line${
          openAIStats.returned === 1 ? "" : "s"
        }, but none survived exact validation for their segmentation plan.${
          openAIStats.usage
            ? ` Tokens: ${openAIStats.usage.totalTokens} total (${openAIStats.usage.inputTokens} in / ${openAIStats.usage.outputTokens} out).`
            : ""
        }`,
        "error",
      );
    } else {
      renderOpenAIStatus(
        `OpenAI: returned ${openAIStats.returned} draft line${
          openAIStats.returned === 1 ? "" : "s"
        } across ${openAIStats.requested} plan${
          openAIStats.requested === 1 ? "" : "s"
        }; validated drafts were used.${
          openAIStats.usage
            ? ` Tokens: ${openAIStats.usage.totalTokens} total (${openAIStats.usage.inputTokens} in / ${openAIStats.usage.outputTokens} out).`
            : ""
        }`,
      );
    }
  }
  renderResults(candidates);
  renderOpenAIDebug();
  resultsElement.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", handleSubmit);

rhymeBrowserElement.open = false;
aiSettingsElement.open = false;
loadSettings();
renderRhymeBrowser();
wireRhymeBrowser();
renderReady("Ready. Enter a stress pattern, your line vibe / image field, and an optional rhyme family.");
renderOpenAIStatus(
  aiEnabledInput.checked && apiKeyInput.value.trim()
    ? "OpenAI: on and ready."
    : "OpenAI: off. Using local generator only.",
);
openAIDebugElement.open = false;
renderOpenAIDebug();
renderEmptyState("Example: pattern `da DUM da DUM da dumda da DUM`, vibe `fading walls, veil, disappearance, distance`, rhyme left blank.");
