// ── Rhyme Finder · main wiring ──────────────────────────────────────
// Input a word → render five Pattison tiers of candidates with feeling
// labels, mas/fem warnings, partners/companions split for family rhyme,
// and cliché flags.

import { findRhymes, TYPE_ORDER } from "./rhymeFinder.js";
import { prefetchForWords, getQuotes } from "./lyricLibrary.js";

// ── DOM ─────────────────────────────────────────────────────────────
const form = document.getElementById("finder-form");
const wordInput = document.getElementById("word-input");
const goBtn = form.querySelector(".rf-go-btn");
const status = document.getElementById("status");
const sourceSummary = document.getElementById("source-summary");
const results = document.getElementById("results");

// ── Tier metadata ───────────────────────────────────────────────────
// `rule` is the concise technical definition shown next to the title.
// (The longer "feel" prose used to live here — moved to the legend
// footer for users who want it.)
const TIER_META = {
  perfect:     { label: "Perfect rhyme",  stability: 5, rule: "same vowel + same coda" },
  family:      { label: "Family rhyme",   stability: 4, rule: "same vowel + coda from same family" },
  additive:    { label: "Additive",       stability: 3, rule: "extra coda consonant on one side" },
  subtractive: { label: "Subtractive",    stability: 3, rule: "missing coda consonant on one side" },
  assonance:   { label: "Assonance",      stability: 2, rule: "same vowel, unrelated coda" },
  consonance:  { label: "Consonance",     stability: 1, rule: "different vowels, same coda" },
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

// ── Search runner ───────────────────────────────────────────────────
// Extracted from the submit handler so deep links (?q=love) can run
// the same flow without going through a synthetic form-submit event.
async function runSearch(word, { updateUrl = true } = {}) {
  if (!word) {
    setStatus("Type a word to begin.", true);
    return;
  }

  setStatus(`Searching ${word}…`);
  goBtn.disabled = true;
  goBtn.dataset.busy = "true";
  results.innerHTML = `<div class="rf-loading"><span class="rf-spinner"></span> Searching the corpus · Pattison's tiers</div>`;
  sourceSummary.innerHTML = "";

  try {
    // Yield to the event loop so the loading UI paints before the scan.
    await new Promise((r) => setTimeout(r, 0));
    const { source, buckets } = await findRhymes({ word, perBucket: 60 });
    // Prefetch lyric-library letter buckets for the source word + every
    // candidate word so renderWord() can synchronously decorate badges.
    const allWords = [source.word];
    for (const t of TYPE_ORDER) for (const c of buckets[t] ?? []) allWords.push(c.word);
    await prefetchForWords(allWords);
    renderSource(source);
    renderResults(source, buckets);
    setStatus("");

    // Reflect the searched word in the URL so the page is link-shareable.
    // Use replaceState rather than pushState so multiple consecutive
    // searches don't pile up in the back-button history.
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("q", word);
      window.history.replaceState({ word }, "", url);
    }
  } catch (err) {
    results.innerHTML = "";
    setStatus(err.message || "Lookup failed.", true);
  } finally {
    goBtn.disabled = false;
    goBtn.dataset.busy = "false";
  }
}

// ── Submit handler ──────────────────────────────────────────────────
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const word = wordInput.value.trim().toLowerCase();
  runSearch(word);
});

// ── Deep-link support ──────────────────────────────────────────────
// On first load, if ?q=<word> is in the URL, pre-fill the input and
// auto-run the search. This lets links like rhyme.qi.land/?q=love
// land the visitor directly on results — useful for sharing.
(() => {
  const params = new URLSearchParams(window.location.search);
  const initial = (params.get("q") || "").trim().toLowerCase();
  if (initial) {
    wordInput.value = initial;
    // Don't push another URL state — we're already there.
    runSearch(initial, { updateUrl: false });
  }
})();

// ── Rendering ───────────────────────────────────────────────────────
function renderSource(source) {
  const codaText = source.coda.length > 0 ? source.coda.join("·") : "—";
  // The vowel and coda values are wrapped in .rf-tag-val so the design
  // can highlight the phonetic kernel in vermilion against the muted tag
  // label. The first tag (masculine/feminine) is rendered as an inverted
  // pill via :first-of-type selector — no inner span needed.
  sourceSummary.innerHTML = `
    <span class="rf-source-word">${escapeHtml(source.word)}</span>
    <span class="rf-source-tag">${source.masculine ? "masculine" : "feminine"}</span>
    <span class="rf-source-tag">vowel <span class="rf-tag-val">${escapeHtml(source.stressedVowel)}</span></span>
    <span class="rf-source-tag">coda <span class="rf-tag-val">${escapeHtml(codaText)}</span></span>
  `;
}

function renderResults(source, buckets) {
  results.innerHTML = "";
  const totalCount = TYPE_ORDER.reduce((acc, t) => acc + (buckets[t]?.length || 0), 0);
  if (totalCount === 0) {
    results.innerHTML = `<div class="rf-empty">No rhyme candidates found in corpus. Try a more common word.</div>`;
    return;
  }
  for (const type of TYPE_ORDER) {
    const candidates = buckets[type] || [];
    if (candidates.length === 0) continue;
    results.appendChild(renderTier(type, candidates, source));
  }
}

function renderTier(type, candidates, source) {
  const meta = TIER_META[type];
  const tier = document.createElement("article");
  tier.className = "rf-tier";

  const head = document.createElement("header");
  head.className = "rf-tier-head";
  head.dataset.stability = String(meta.stability);
  // Five-cell scale: only the cell at the tier's stability position is
  // filled. Leftmost cell = stab 1 (unstable), rightmost = stab 5 (stable).
  const activeIdx = meta.stability - 1;
  const cells = Array.from({ length: 5 }, (_, i) => {
    return `<span class="rf-cell ${i === activeIdx ? "rf-cell-on" : ""}"></span>`;
  }).join("");
  head.innerHTML = `
    <div class="rf-tier-titlebox">
      <div class="rf-tier-title">
        ${escapeHtml(meta.label)}
        <span class="rf-tier-rule">${escapeHtml(meta.rule)}</span>
      </div>
      <div class="rf-spectrum" title="Pattison stability — ${meta.stability} of 5">
        <span class="rf-spectrum-end">unstable</span>
        <span class="rf-cells">${cells}</span>
        <span class="rf-spectrum-end">stable</span>
      </div>
    </div>
    <span class="rf-tier-count">${candidates.length}</span>
  `;
  tier.appendChild(head);

  const body = document.createElement("div");
  body.className = "rf-tier-body";

  // Group candidates by syllable count so the eye can scan from short
  // (most singable) to longer.
  const bySyll = new Map();
  for (const c of candidates) {
    const s = Math.max(1, c.syllables ?? 1);
    if (!bySyll.has(s)) bySyll.set(s, []);
    bySyll.get(s).push(c);
  }
  const sylls = [...bySyll.keys()].sort((a, b) => a - b);
  for (const s of sylls) {
    const label = s === 1 ? "1 syllable" : `${s} syllables`;
    body.appendChild(renderSubgroup(label, bySyll.get(s), source));
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

  const cliche = isCliche(source.word, candidate.word);
  const mismatch = candidate.masculine !== source.masculine;
  const tier = commonnessTier(candidate.commonRank);

  el.classList.add(`rf-c-${tier}`);
  if (cliche) el.classList.add("rf-cliche");
  if (mismatch) el.classList.add("rf-mismatch");

  // Skip the native browser tooltip when we have a custom popover for
  // lyric quotes — otherwise the OS tooltip and our popover both appear,
  // which reads as cluttered. The phonetic info is non-essential and
  // surfaced elsewhere already (mismatch underline, cliché strikethrough).
  const willHaveLyrics = getQuotes(candidate.word).length > 0;
  if (!willHaveLyrics) {
    el.title = [
      candidate.masculine ? "masculine" : "feminine",
      `${candidate.syllables ?? "?"} syll.`,
      tier === "very-common" ? "very common" : tier === "common" ? "common" : "uncommon",
      mismatch ? "stress class differs from source" : "",
      cliche ? "Pattison cliché — overworked pair" : "",
    ].filter(Boolean).join(" · ");
  }

  el.textContent = candidate.word;

  if (cliche) {
    // Cliché flag is rendered as a vermilion superscript "cliché" tag
    // beside the (struck-through) word. Mismatched words are styled
    // by the .rf-mismatch class only — no glyph needed.
    const flag = document.createElement("span");
    flag.className = "rf-word-flag";
    flag.textContent = "cliché";
    el.appendChild(flag);
  }

  decorateWithLyrics(el, candidate.word);

  return el;
}

// ── Lyric Library decoration (Phase 1 pilot) ────────────────────────
// If the candidate word has quotes in the lyric corpus, append a small
// vermilion " · N" badge and attach a hover popover. Quotes are split
// into 句末 (line-end — rhyme-relevant) and 句中 (line-middle/start)
// sections; each quote shows the line plus its prev/next neighbours so
// the reader sees craft context, with the matched word highlighted.
function decorateWithLyrics(el, word) {
  const quotes = getQuotes(word);
  if (!quotes.length) return;
  el.classList.add("rf-has-lyrics");

  const endQuotes = quotes.filter((q) => q.wordPos === "end");
  const midQuotes = quotes.filter((q) => q.wordPos !== "end");

  const badge = document.createElement("span");
  badge.className = "rf-lyric-badge";
  // Show end-count first since rhyme-relevance is the primary use; show
  // middle-count after a slash if non-zero. e.g. "· 3/5" = 3 line-end + 5 mid.
  badge.textContent =
    endQuotes.length && midQuotes.length
      ? `· ${endQuotes.length}/${midQuotes.length}`
      : `· ${quotes.length}`;
  el.appendChild(badge);

  const pop = document.createElement("div");
  pop.className = "rf-lyric-pop";
  // Cap each section at 3 (room is the main constraint; full list is a
  // Phase-4 modal). End first because it's the rhyme-relevant case.
  if (endQuotes.length) {
    pop.appendChild(renderQuoteSection("AT LINE END", endQuotes, 3));
  }
  if (midQuotes.length) {
    pop.appendChild(renderQuoteSection("MID-LINE", midQuotes, 3));
  }
  el.appendChild(pop);

  // Click pins the popover open. Outside-click (handled once globally,
  // see installPinDismissHandler below) clears all pins.
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasPinned = el.classList.contains("rf-pinned");
    document.querySelectorAll(".rf-word.rf-pinned").forEach((p) => p.classList.remove("rf-pinned"));
    if (!wasPinned) el.classList.add("rf-pinned");
  });
  installPinDismissHandler();
}

let pinDismissInstalled = false;
function installPinDismissHandler() {
  if (pinDismissInstalled) return;
  pinDismissInstalled = true;
  document.addEventListener("click", (e) => {
    // Clicks landing inside a pinned popover should not dismiss it (so the
    // user can scroll inside the popover or interact with its contents).
    if (e.target.closest(".rf-lyric-pop")) return;
    document.querySelectorAll(".rf-word.rf-pinned").forEach((p) => p.classList.remove("rf-pinned"));
  });
}

function renderQuoteSection(title, quotes, cap) {
  const sec = document.createElement("section");
  sec.className = "rf-lyric-section";
  const h = document.createElement("div");
  h.className = "rf-lyric-section-head";
  h.textContent = `${title} · ${quotes.length}`;
  sec.appendChild(h);
  for (const q of quotes.slice(0, cap)) sec.appendChild(renderQuoteItem(q));
  if (quotes.length > cap) {
    const more = document.createElement("div");
    more.className = "rf-lyric-more";
    more.textContent = `+ ${quotes.length - cap} more`;
    sec.appendChild(more);
  }
  return sec;
}

function renderQuoteItem(q) {
  const item = document.createElement("div");
  item.className = "rf-lyric-item";
  if (q.linePrev) {
    const p = document.createElement("div");
    p.className = "rf-lyric-ctx";
    p.textContent = q.linePrev;
    item.appendChild(p);
  }
  const line = document.createElement("div");
  line.className = "rf-lyric-line";
  // Highlight the actual surface token recorded at index time. This matches
  // exactly the inflection that appears in the line — "coming" stays
  // "coming", not just the candidate's stem — so every match gets marked.
  line.innerHTML = highlightSurface(q.line, q.surface);
  item.appendChild(line);
  if (q.lineNext) {
    const n = document.createElement("div");
    n.className = "rf-lyric-ctx";
    n.textContent = q.lineNext;
    item.appendChild(n);
  }
  const attr = document.createElement("div");
  attr.className = "rf-lyric-attr";
  const yr = q.year ? ` · ${q.year}` : "";
  attr.textContent = `— ${q.credit}, ${q.songTitle}${yr}`;
  item.appendChild(attr);
  return item;
}

function highlightSurface(line, surface) {
  if (!surface) return escapeHtml(line);
  const safe = surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // \b on each side keeps "love" from matching inside "lover", but allow
  // a trailing apostrophe-suffix ("lovin'") and possessive ("river's").
  const re = new RegExp(`\\b${safe}(?:['’]\\w{0,3})?\\b`, "gi");
  return escapeHtml(line).replace(re, '<mark class="rf-lyric-mark">$&</mark>');
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
