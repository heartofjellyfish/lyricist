import { summarizeModePlans, matchesSegmentationPlan, evaluateCandidateLine } from "../src/lyricEngine.js";
import { requestOpenAIPlanDrafts, requestOpenAIFinalSelection } from "../src/openaiDrafts.js";
import { LOCAL_OPENAI_CONFIG } from "../src/localConfig.js";

const patternText = "da DUM da DUM da dumda da DUM";
const ideaText =
  "narrator falling into a half-dream state, about to dive into his own depths, slipping free of worldly rules and returning to the self; I want one lyric line for this process, with a slightly psychedelic feeling and a sense of freedom";
const rhymeTarget = "";
const candidateCount = 5;
const model = LOCAL_OPENAI_CONFIG.model || "gpt-4.1-mini";
const draftModel = model === "gpt-4.1-mini" ? "gpt-4.1" : model;
const apiKey = LOCAL_OPENAI_CONFIG.apiKey;

const requestedPlanCount = Math.max(candidateCount + 13, 18);
const planPool = summarizeModePlans(patternText, requestedPlanCount);
const orderedPlanPool = [...planPool];
const targetAcceptedPlanCount = Math.max(candidateCount * 2, candidateCount + 3);

function hydrate(plan) {
  const inspected = (plan.segmentLines ?? []).map((segments) => {
    const lineText = segments.join(" ");
    const matches = matchesSegmentationPlan(lineText, plan.slots ?? []);
    const candidate = matches
      ? evaluateCandidateLine({
          lineText,
          patternText,
          ideaText,
          rhymeTarget,
          source: "openai",
          planKey: plan.planKey,
        })
      : null;
    return {
      segments,
      lineText,
      matchesSegmentation: matches,
      accepted: Boolean(candidate),
      score: candidate?.score ?? null,
      diagnostics: candidate?.diagnostics ?? null,
    };
  });
  return {
    ...plan,
    inspected,
    acceptedLines: inspected.filter((item) => item.accepted).map((item) => item.lineText),
  };
}

const acceptedByPlanKey = new Map();
const report = [];
const mergedPlanDrafts = [];

for (let index = 0; index < orderedPlanPool.length && acceptedByPlanKey.size < targetAcceptedPlanCount; index += 4) {
  const batch = orderedPlanPool.slice(index, index + 4);
  const drafts = await requestOpenAIPlanDrafts({
    apiKey,
    model: draftModel,
    patternText,
    ideaText,
    rhymeTarget,
    plans: batch,
    countPerPlan: 1,
    strictRetry: false,
  });
  for (const plan of drafts.planResults.map(hydrate)) {
    mergedPlanDrafts.push(plan);
    report.push({
      mode: plan.mode,
      segmentation: plan.slots.map((slot) => slot.text).join(" | "),
      banks: plan.segmentBanks,
      inspected: plan.inspected,
    });
    if (plan.acceptedLines.length > 0 && !acceptedByPlanKey.has(plan.planKey)) {
      acceptedByPlanKey.set(plan.planKey, plan);
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
    const repairedDrafts = await requestOpenAIPlanDrafts({
      apiKey,
      model: repairModel,
      patternText,
      ideaText,
      rhymeTarget,
      plans: failedRepairPlans,
      countPerPlan: 2,
      strictRetry: true,
    });
    for (const plan of repairedDrafts.planResults.map(hydrate)) {
      report.push({
        mode: plan.mode,
        segmentation: plan.slots.map((slot) => slot.text).join(" | "),
        banks: plan.segmentBanks,
        inspected: plan.inspected,
        retry: true,
      });
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
      };
    }),
  )
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);

let finalSelection = { indexes: [] };
let finalCandidates = expandedAcceptedCandidates;

if (finalCandidates.length > candidateCount) {
  const finalSelectionPool = finalCandidates.slice(0, Math.min(candidateCount * 3, 15));
  try {
    finalSelection = await requestOpenAIFinalSelection({
      apiKey,
      model,
      ideaText,
      rhymeTarget,
      candidates: finalSelectionPool.map((candidate) => ({
        mode: candidate.planMode,
        segmentation: candidate.planKey,
        line: candidate.text,
      })),
      count: candidateCount,
    });
    if (finalSelection.indexes.length > 0) {
      const chosen = finalSelection.indexes
        .map((index) => finalSelectionPool[index - 1])
        .filter(Boolean);
      const chosenTexts = new Set(chosen.map((candidate) => candidate.text));
      const remainder = finalCandidates.filter((candidate) => !chosenTexts.has(candidate.text));
      finalCandidates = [...chosen, ...remainder];
    }
  } catch {}
}

const finalLines = [];
const seenPlans = new Set();
for (const candidate of finalCandidates) {
  if (seenPlans.has(candidate.planKey)) continue;
  finalLines.push({
    text: candidate.text,
    planKey: candidate.planKey,
    mode: candidate.planMode,
    score: candidate.score,
  });
  seenPlans.add(candidate.planKey);
  if (finalLines.length >= candidateCount) break;
}

console.log(
  JSON.stringify(
    {
      model,
      draftModel,
      planPool: orderedPlanPool.slice(0, 15).map((plan) => ({
        mode: plan.mode,
        segmentation: plan.slots.map((slot) => slot.text).join(" | "),
      })),
      acceptedCount: acceptedByPlanKey.size,
      accepted: [...acceptedByPlanKey.values()].map((plan) => ({
        mode: plan.mode,
        segmentation: plan.slots.map((slot) => slot.text).join(" | "),
        acceptedLines: plan.acceptedLines,
      })),
      finalSelection,
      finalLines,
      report,
    },
    null,
    2,
  ),
);
