// ── Rhyme Finder · main wiring ──────────────────────────────────────
// Input a word → render five Pattison tiers of candidates with feeling
// labels, mas/fem warnings, partners/companions split for family rhyme,
// and cliché flags.

import { findRhymes, TYPE_ORDER } from "./rhymeFinder.js";

// ── DOM ─────────────────────────────────────────────────────────────
const form = document.getElementById("finder-form");
const wordInput = document.getElementById("word-input");
const goBtn = form.querySelector(".rf-go-btn");
const feelingFilter = document.getElementById("feeling-filter");
const hideMismatch = document.getElementById("hide-mismatch");
const flagCliche = document.getElementById("flag-cliche");
const status = document.getElementById("status");
const sourceSummary = document.getElementById("source-summary");
const results = document.getElementById("results");

// ── Tier metadata (Pattison-derived) ────────────────────────────────
const TIER_META = {
  perfect: {
    label: "Perfect rhyme",
    stability: 5,
    feel: "Maximum resolution. Certainty, commitment, the door slamming shut.",
    risk: "Cliché-prone — over-familiar pairs make the ear skip the line.",
  },
  family: {
    label: "Family rhyme",
    stability: 4,
    feel: "Mostly resolved with a fresh edge. Lands without sounding worn.",
    risk: "Distant family links can feel like a miss. Trust the ear.",
  },
  additive: {
    label: "Additive",
    stability: 3,
    feel: "Off-center. Resolves with a small catch — one side carries an extra consonant.",
    risk: "Loud added consonants (t, k) can break the match. r and l hide best.",
  },
  subtractive: {
    label: "Subtractive",
    stability: 3,
    feel: "Off-center. Resolves with a small catch — one side drops a consonant.",
    risk: "If the dropped consonant was load-bearing, the rhyme weakens.",
  },
  assonance: {
    label: "Assonance",
    stability: 2,
    feel: "Same vowel, unrelated codas. Rings but hangs in the air.",
    risk: "Masculine assonance is weak — lean on feminine words for real strength.",
  },
  consonance: {
    label: "Consonance",
    stability: 1,
    feel: "Different vowels, matching coda. Suspended, unresolved, aching.",
    risk: "Easy to miss entirely. Needs r, l, nasals, or multi-consonant codas to land.",
  },
};

// ── Cliché pair list (Pattison's repeat offenders) ──────────────────
// Bidirectional — order doesn't matter.
const CLICHE_PAIRS_RAW = [
  ["love", "above"],
  ["love", "of"],
  ["heart", "apart"],
  ["heart", "start"],
  ["fire", "desire"],
  ["fire", "higher"],
  ["night", "light"],
  ["night", "sight"],
  ["true", "you"],
  ["true", "blue"],
  ["moon", "june"],
  ["moon", "soon"],
  ["moon", "tune"],
  ["rain", "pain"],
  ["sky", "high"],
  ["sky", "fly"],
  ["sky", "why"],
  ["dance", "romance"],
  ["mind", "find"],
  ["dream", "scheme"],
  ["girl", "world"],
  ["soul", "whole"],
  ["arms", "charms"],
  ["eyes", "skies"],
  ["eyes", "lies"],
  ["heart", "part"],
  ["away", "stay"],
  ["away", "today"],
];

const CLICHE_INDEX = (() => {
  const idx = new Map();
  for (const [a, b] of CLICHE_PAIRS_RAW) {
    if (!idx.has(a)) idx.set(a, new Set());
    if (!idx.has(b)) idx.set(b, new Set());
    idx.get(a).add(b);
    idx.get(b).add(a);
  }
  return idx;
})();

function isCliche(sourceWord, candidateWord) {
  const set = CLICHE_INDEX.get(sourceWord.toLowerCase());
  return Boolean(set && set.has(candidateWord.toLowerCase()));
}

// ── Status helper ───────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.dataset.state = isError ? "error" : "ready";
}

// ── Submit handler ──────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const word = wordInput.value.trim().toLowerCase();
  if (!word) {
    setStatus("Type a word to begin.", true);
    return;
  }

  setStatus(`Scanning corpus for "${word}"…`);
  goBtn.disabled = true;
  goBtn.dataset.busy = "true";
  goBtn.textContent = "Finding…";
  results.innerHTML = `<div class="rf-loading"><span class="rf-spinner"></span> Working through ~80,000 words by Pattison's tiers…</div>`;
  sourceSummary.innerHTML = "";

  try {
    // Yield to the event loop so the loading UI paints before the scan.
    await new Promise((r) => setTimeout(r, 0));
    const { source, buckets } = await findRhymes({ word, perBucket: 60 });
    renderSource(source);
    renderResults(source, buckets);
    setStatus("");
  } catch (err) {
    results.innerHTML = "";
    setStatus(err.message || "Lookup failed.", true);
  } finally {
    goBtn.disabled = false;
    goBtn.dataset.busy = "false";
    goBtn.textContent = "Find Rhymes";
  }
});

// Re-render on filter change without re-scanning
let lastResult = null;

[feelingFilter, hideMismatch, flagCliche].forEach((el) => {
  el.addEventListener("change", () => {
    if (lastResult) renderResults(lastResult.source, lastResult.buckets);
  });
});

// ── Rendering ───────────────────────────────────────────────────────
function renderSource(source) {
  const codaText = source.coda.length > 0 ? source.coda.join("·") : "—";
  sourceSummary.innerHTML = `
    <span class="rf-source-word">${escapeHtml(source.word)}</span>
    <span class="rf-source-tag">${source.masculine ? "masculine" : "feminine"}</span>
    <span class="rf-source-tag">vowel ${escapeHtml(source.stressedVowel)}</span>
    <span class="rf-source-tag">coda ${escapeHtml(codaText)}</span>
  `;
}

function renderResults(source, buckets) {
  lastResult = { source, buckets };
  results.innerHTML = "";

  // Filter by feeling tier
  const allowedTypes = parseFeelingFilter(feelingFilter.value);
  const totalCount = TYPE_ORDER.reduce((acc, t) => acc + (buckets[t]?.length || 0), 0);
  if (totalCount === 0) {
    results.innerHTML = `<div class="rf-empty">No rhyme candidates found in corpus. Try a more common word.</div>`;
    return;
  }

  let renderedAny = false;
  for (const type of TYPE_ORDER) {
    if (!allowedTypes.has(type)) continue;
    const candidates = buckets[type] || [];
    if (candidates.length === 0) continue;

    const filtered = candidates.filter((c) => {
      if (hideMismatch.checked && c.masculine !== source.masculine) return false;
      return true;
    });
    if (filtered.length === 0) continue;

    results.appendChild(renderTier(type, filtered, source));
    renderedAny = true;
  }

  if (!renderedAny) {
    results.innerHTML = `<div class="rf-empty">No candidates match the current filters.</div>`;
  }
}

function parseFeelingFilter(value) {
  if (value === "all") return new Set(TYPE_ORDER);
  return new Set(value.split(","));
}

function renderTier(type, candidates, source) {
  const meta = TIER_META[type];
  const tier = document.createElement("article");
  tier.className = "rf-tier";

  const head = document.createElement("header");
  head.className = "rf-tier-head";
  head.dataset.stability = String(meta.stability);
  head.innerHTML = `
    <span class="rf-stability">${meta.stability}</span>
    <div class="rf-tier-titlebox">
      <div class="rf-tier-title">${escapeHtml(meta.label)}</div>
      <div class="rf-tier-feel">${escapeHtml(meta.feel)}</div>
    </div>
    <span class="rf-tier-count">${candidates.length} word${candidates.length === 1 ? "" : "s"}</span>
  `;
  tier.appendChild(head);

  const body = document.createElement("div");
  body.className = "rf-tier-body";

  if (type === "family") {
    // Split family into partners vs companions when codaRelation is available
    const partners = candidates.filter((c) => isPartnersRelation(c.codaRelation));
    const companions = candidates.filter((c) => isCompanionsRelation(c.codaRelation));
    const other = candidates.filter(
      (c) => !isPartnersRelation(c.codaRelation) && !isCompanionsRelation(c.codaRelation),
    );

    if (partners.length > 0) {
      body.appendChild(renderSubgroup("Partners — same position, different voicing", partners, source));
    }
    if (companions.length > 0) {
      body.appendChild(renderSubgroup("Companions — same family, different position", companions, source));
    }
    if (other.length > 0) {
      body.appendChild(renderSubgroup("Other family pairings", other, source));
    }
    if (partners.length === 0 && companions.length === 0 && other.length === 0) {
      body.appendChild(renderWordRow(candidates, source));
    }
  } else {
    body.appendChild(renderWordRow(candidates, source));
  }

  if (meta.risk) {
    const risk = document.createElement("div");
    risk.className = "rf-tier-risk";
    risk.innerHTML = `<strong>Watch:</strong> ${escapeHtml(meta.risk)}`;
    body.appendChild(risk);
  }

  tier.appendChild(body);
  return tier;
}

function renderSubgroup(label, words, source) {
  const wrap = document.createElement("div");
  wrap.className = "rf-subgroup";
  const title = document.createElement("div");
  title.className = "rf-subgroup-label";
  title.textContent = label;
  wrap.appendChild(title);
  wrap.appendChild(renderWordRow(words, source));
  return wrap;
}

function renderWordRow(words, source) {
  const row = document.createElement("div");
  row.className = "rf-words";
  for (const w of words) {
    row.appendChild(renderWord(w, source));
  }
  return row;
}

// Three commonness tiers, RhymeZone-style. Lower rank = more common.
//   ≤ 1500 → "very common" — bold, full opacity
//   ≤ 5000 → "common"      — normal weight
//   else   → "uncommon"    — slightly dimmed
function commonnessTier(rank) {
  if (rank == null || rank === Infinity) return "uncommon";
  if (rank <= 1500) return "very-common";
  if (rank <= 5000) return "common";
  return "uncommon";
}

function renderWord(candidate, source) {
  const el = document.createElement("span");
  el.className = "rf-word";

  const cliche = flagCliche.checked && isCliche(source.word, candidate.word);
  const mismatch = candidate.masculine !== source.masculine;
  const tier = commonnessTier(candidate.commonRank);

  el.classList.add(`rf-c-${tier}`);
  if (cliche) el.classList.add("rf-cliche");
  if (mismatch) el.classList.add("rf-mismatch");

  el.title = [
    candidate.masculine ? "masculine" : "feminine",
    `${candidate.syllables ?? "?"} syll.`,
    tier === "very-common" ? "very common" : tier === "common" ? "common" : "uncommon",
    mismatch ? "stress class differs from source" : "",
    cliche ? "Pattison cliché — overworked pair" : "",
  ].filter(Boolean).join(" · ");

  el.textContent = candidate.word;

  if (cliche) {
    const flag = document.createElement("span");
    flag.className = "rf-word-flag";
    flag.textContent = "🚨";
    el.appendChild(flag);
  } else if (mismatch) {
    const flag = document.createElement("span");
    flag.className = "rf-word-flag";
    flag.textContent = "⚠︎";
    el.appendChild(flag);
  }

  return el;
}

// codaRelation comes from classifyRhyme:
//   { relation: "family", notes: [{a, b, kind: "same"|"partners"|"companions"}] }
// We classify the family rhyme by which kind dominates across the coda
// positions: partners-only → "partners", companions-only → "companions",
// otherwise "mixed" (which falls under "Other family pairings").
function familyKind(codaRelation) {
  if (!codaRelation || !Array.isArray(codaRelation.notes)) return null;
  let hasPartners = false;
  let hasCompanions = false;
  for (const n of codaRelation.notes) {
    if (n.kind === "partners") hasPartners = true;
    else if (n.kind === "companions") hasCompanions = true;
  }
  if (hasPartners && !hasCompanions) return "partners";
  if (hasCompanions && !hasPartners) return "companions";
  if (hasPartners && hasCompanions) return "mixed";
  return null;
}

function isPartnersRelation(codaRelation) {
  return familyKind(codaRelation) === "partners";
}

function isCompanionsRelation(codaRelation) {
  return familyKind(codaRelation) === "companions";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
