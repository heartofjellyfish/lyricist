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
// Each tier carries:
//   label    — the editorial name shown in the title
//   subtitle — feel-based one-liner shown next to the label
//   rule     — Pattison's technical definition (kept in popover)
//   example  — a concrete example pair, shown in the popover
//   stability — 1..5 (5 = most resolved). Drives the spectrum cells +
//                left-bar colour fade.
const TIER_META = {
  perfect: {
    label: "Perfect rhyme",
    subtitle: "full resolution",
    stability: 5,
    rule: "Same vowel, same closing consonants. The rhyme lands clean and full.",
    example: "cat / hat — same AE vowel, same T ending",
    note: "Across all tiers, the two words still need to begin differently. love / love isn't a rhyme; love / dove is.",
  },
  family: {
    label: "Family rhyme",
    subtitle: "close resolution",
    stability: 4,
    rule: "Same vowel; the closing consonants differ but come from the same phonetic family (e.g. T↔D, P↔B, K↔G).",
    example: "cat / pad — AE vowel; T and D are both stops",
  },
  additive: {
    label: "Additive",
    subtitle: "trailing resolution",
    stability: 3,
    rule: "Same vowel and same closing consonants, with one extra consonant on one side.",
    example: "love / loved — extra D on one side",
  },
  subtractive: {
    label: "Subtractive",
    subtitle: "clipped resolution",
    stability: 3,
    rule: "Same vowel and same closing consonants, but one side stops one consonant earlier.",
    example: "cried / cry — one side missing the final D",
  },
  assonance: {
    label: "Assonance",
    subtitle: "loose resolution",
    stability: 2,
    rule: "Same vowel only; the closing consonants are unrelated.",
    example: "love / dot — both AH, but V and T have nothing in common",
  },
  consonance: {
    label: "Consonance",
    subtitle: "faint resolution",
    stability: 1,
    rule: "Different vowels, same closing consonants.",
    example: "love / live — both end in V; AH versus IH",
  },
  identity: {
    label: "Identity",
    subtitle: "echo, not rhyme",
    stability: 0,
    rule: "The stressed syllable sounds the same in both words — same onset, same vowel, same coda. The ear hears repetition rather than tension/resolution, so it's not a rhyme. Useful to recognize and avoid.",
    example: "fuse / confuse — both stressed syllables are 'fuse'",
  },
};
const TIER_TYPES = ["perfect", "family", "additive", "subtractive", "assonance", "consonance", "identity"];

// Pattison's stability scale is 5 stops, not 6 — Additive and Subtractive
// share a stability rank (3). We merge them in the popover spectrum so
// the visual matches the underlying axis.
const SPECTRUM_STOPS = [
  { types: ["perfect"], label: "Perfect" },
  { types: ["family"], label: "Family" },
  { types: ["additive", "subtractive"], label: "Additive / Subtractive" },
  { types: ["assonance"], label: "Assonance" },
  { types: ["consonance"], label: "Consonance" },
];

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
    const { source, buckets } = await findRhymes({ word, perBucket: 200 });
    // Prefetch lyric-library letter buckets for the source word + every
    // candidate word so renderWord() can synchronously decorate badges.
    const allWords = [source.word];
    for (const t of TYPE_ORDER) for (const c of buckets[t] ?? []) allWords.push(c.word);
    await prefetchForWords(allWords);
    renderSource(source);
    renderSourcePanel(source.word);
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
  // can highlight the phonetic kernel in vermilion against the muted
  // tag label. The masculine/feminine tag carries an info popover that
  // appears on hover (cursor: help) — no extra glyph, no click needed.
  const stressLabel = source.masculine ? "masculine" : "feminine";
  sourceSummary.innerHTML = `
    <span class="rf-source-word">${escapeHtml(source.word)}</span>
    <span class="rf-source-tag rf-source-tag-stress" tabindex="0">${stressLabel}</span>
    <span class="rf-source-tag">vowel <span class="rf-tag-val">${escapeHtml(source.stressedVowel)}</span></span>
    <span class="rf-source-tag">coda <span class="rf-tag-val">${escapeHtml(codaText)}</span></span>
  `;
  const stressTag = sourceSummary.querySelector(".rf-source-tag-stress");
  stressTag.appendChild(renderStressPopover(source.masculine));
}

function renderStressPopover(currentIsMasculine) {
  const pop = document.createElement("div");
  pop.className = "rf-tier-pop rf-stress-pop";
  pop.addEventListener("click", (e) => e.stopPropagation());

  // Two-column comparison — masculine on the left, feminine on the
  // right. The column matching the searched word's stress class is
  // marked .is-current so the reader can tell where they stand.
  const cols = document.createElement("div");
  cols.className = "rf-tier-pop-section rf-stress-pop-cols";
  const buildCol = (kind) => {
    const isMasculine = kind === "masculine";
    const def = isMasculine
      ? "Ends on a stressed syllable. The rhyme lands on the final beat — common, clean, and song-friendly."
      : "Ends with one unstressed syllable after the stressed one. The rhyme lands a beat earlier and trails off softly.";
    const examples = isMasculine
      ? "love · dove · today · believe · forgot"
      : "river · mother · follow · breaking · mountain";
    const isCurrent = isMasculine === currentIsMasculine;
    return (
      `<div class="rf-stress-pop-col${isCurrent ? " is-current" : ""}">` +
      `<div class="rf-tier-pop-eyebrow">${isMasculine ? "Masculine" : "Feminine"}` +
      `${isCurrent ? ' <span class="rf-stress-pop-current-tag">this word</span>' : ""}</div>` +
      `<p class="rf-tier-pop-body">${escapeHtml(def)}</p>` +
      `<div class="rf-stress-pop-examples-label">Examples</div>` +
      `<p class="rf-tier-pop-body rf-tier-pop-example">${escapeHtml(examples)}</p>` +
      `</div>`
    );
  };
  cols.innerHTML = buildCol("masculine") + buildCol("feminine");
  pop.appendChild(cols);

  const note = document.createElement("div");
  note.className = "rf-tier-pop-section";
  note.innerHTML =
    `<p class="rf-tier-pop-note">Masculine and feminine endings rarely sing together — the rhyme lands on a different beat. Rhyme Finder shows mismatches with a dotted underline.</p>`;
  pop.appendChild(note);

  return pop;
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
  // Ensure the global dismiss handler is wired even on searches where
  // no candidate happens to have a lyric badge — tier popovers still
  // need to close on outside-click / Esc.
  installGlobalDismissHandlers();
}

// Tier-info popover: definition + 6-stop spectrum highlighting the
// current tier + a concrete example. The "family" tier additionally
// shows a consonant family chart so the reader can see *why* certain
// codas count as related.
function renderTierPopover(type) {
  const meta = TIER_META[type];
  const pop = document.createElement("div");
  pop.className = "rf-tier-pop";

  // Definition row
  const def = document.createElement("div");
  def.className = "rf-tier-pop-section";
  def.innerHTML =
    `<div class="rf-tier-pop-eyebrow">What it is</div>` +
    `<p class="rf-tier-pop-body">${escapeHtml(meta.rule)}</p>`;
  pop.appendChild(def);

  // 5-stop spectrum showing every rhyme tier with the current one
  // highlighted. Identity is NOT a rhyme — it sits off the scale, so we
  // skip the spectrum and show a short "off the scale" note instead.
  if (type === "identity") {
    const offScale = document.createElement("div");
    offScale.className = "rf-tier-pop-section";
    offScale.innerHTML =
      `<div class="rf-tier-pop-eyebrow">Where it sits</div>` +
      `<p class="rf-tier-pop-note">Off the rhyme scale — identity is repetition, not resolution. Listed here so you can recognize and avoid it.</p>`;
    pop.appendChild(offScale);
  } else {
    const spec = document.createElement("div");
    spec.className = "rf-tier-pop-section";
    spec.innerHTML =
      `<div class="rf-tier-pop-eyebrow">Where it sits</div>` +
      `<ol class="rf-tier-spectrum-stops">` +
      `<span class="rf-tier-spectrum-track" aria-hidden="true"></span>` +
      SPECTRUM_STOPS.map((stop) => {
        const isCurrent = stop.types.includes(type);
        const stab = TIER_META[stop.types[0]].stability;
        return (
          `<li class="rf-tier-spectrum-stop${isCurrent ? " is-current" : ""}" data-stability="${stab}">` +
          `<span class="rf-tier-spectrum-dot-slot"><span class="rf-tier-spectrum-dot"></span></span>` +
          `<span class="rf-tier-spectrum-label">${escapeHtml(stop.label)}</span>` +
          `</li>`
        );
      }).join("") +
      `</ol>` +
      `<div class="rf-tier-pop-axis"><span>most stable</span><span>least stable</span></div>`;
    pop.appendChild(spec);
  }

  // Example row
  const ex = document.createElement("div");
  ex.className = "rf-tier-pop-section";
  ex.innerHTML =
    `<div class="rf-tier-pop-eyebrow">Example</div>` +
    `<p class="rf-tier-pop-body rf-tier-pop-example">${escapeHtml(meta.example)}</p>`;
  pop.appendChild(ex);

  // Optional note (currently used by Perfect to surface the universal
  // "different onset" rule that applies to every tier).
  if (meta.note) {
    const note = document.createElement("div");
    note.className = "rf-tier-pop-section";
    note.innerHTML = `<p class="rf-tier-pop-note">${escapeHtml(meta.note)}</p>`;
    pop.appendChild(note);
  }

  // Family chart — only for the family tier. Shows voicing pairs in
  // each manner-of-articulation column.
  if (type === "family") {
    pop.appendChild(renderFamilyChart());
  }

  // Click inside popover shouldn't bubble out (would dismiss on
  // outside-click handler). The handler below stops propagation.
  pop.addEventListener("click", (e) => e.stopPropagation());
  return pop;
}

function renderFamilyChart() {
  const wrap = document.createElement("div");
  wrap.className = "rf-tier-pop-section";
  // Plosives: b/p, d/t, g/k. Fricatives: v/f, TH/th, z/s, zh/sh, j/ch.
  // Nasals: m, n, ng (no unvoiced counterparts in English coda inventory).
  const rows = [
    { label: "Voiced", cells: ["b","d","g","v","TH","z","zh","j","m","n","ng"] },
    { label: "Unvoiced", cells: ["p","t","k","f","th","s","sh","ch","","",""] },
  ];
  const headerSpans = [
    { label: "Plosives", span: 3 },
    { label: "Fricatives", span: 5 },
    { label: "Nasals", span: 3 },
  ];
  let html =
    `<div class="rf-tier-pop-eyebrow">Family chart</div>` +
    `<table class="rf-tier-family-chart"><thead><tr><th></th>` +
    headerSpans.map((h) => `<th colspan="${h.span}" class="rf-tier-family-group">${escapeHtml(h.label)}</th>`).join("") +
    `</tr></thead><tbody>`;
  for (const row of rows) {
    html +=
      `<tr><th class="rf-tier-family-row-label">${escapeHtml(row.label)}</th>` +
      row.cells
        .map((c) => `<td${c ? "" : ' class="rf-tier-family-empty"'}>${escapeHtml(c)}</td>`)
        .join("") +
      `</tr>`;
  }
  html += `</tbody></table>` +
    `<p class="rf-tier-pop-body rf-tier-pop-note">Each column is a family pair — same place + manner, only the voicing differs.</p>`;
  wrap.innerHTML = html;
  return wrap;
}

function renderTier(type, candidates, source) {
  const meta = TIER_META[type];
  const tier = document.createElement("article");
  tier.className = "rf-tier";
  tier.dataset.stability = String(meta.stability);

  const head = document.createElement("header");
  head.className = "rf-tier-head";
  head.dataset.stability = String(meta.stability);
  head.innerHTML = `
    <button class="rf-tier-titlebox" type="button" aria-label="What is ${escapeHtml(meta.label)}?">
      <span class="rf-tier-title">
        ${escapeHtml(meta.label)}
        <span class="rf-tier-subtitle">— ${escapeHtml(meta.subtitle)}</span>
        <span class="rf-tier-info" aria-hidden="true">?</span>
      </span>
    </button>
    <span class="rf-tier-count">${candidates.length}</span>
  `;
  // Click anywhere on the title strip → toggle this tier's info popover.
  const titleBtn = head.querySelector(".rf-tier-titlebox");
  const pop = renderTierPopover(type);
  head.appendChild(pop);
  titleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = head.classList.contains("rf-tier-head-open");
    document.querySelectorAll(".rf-tier-head-open").forEach((h) => h.classList.remove("rf-tier-head-open"));
    if (!wasOpen) head.classList.add("rf-tier-head-open");
  });
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

// "10-second shortlist" tiering. The candidate's `score` already
// combines lyricApps × 200 + max(0, 7000 − commonRank), so this
// thresholds the score directly. Cliché, mas/fem mismatch, and
// family-loose closeness each carry their own visual channels
// (strikethrough, dotted underline, sort position) and are not
// re-encoded as gates here — the user reads each warning alongside
// the bold/normal/italic signal.
//
//   bold (very common): score ≥ 5000
//   normal (common):    score ≥ 1000
//   italic (uncommon):  score < 1000 — borderline, may surprise listener
//
// Score calibration:
//   * 5000 ≈ 25 lyric appearances alone, OR rank 2000 in subtitle corpus,
//     OR a meaningful combination of both.
//   * 1000 ≈ 5 lyric appearances, OR rank 6000 in subtitle corpus.
function recommendationTier(candidate) {
  const score = candidate.score ?? 0;
  if (score >= 5000) return "very-common";
  if (score >= 1000) return "common";
  return "uncommon";
}

function renderWord(candidate, source) {
  const el = document.createElement("span");
  el.className = "rf-word";

  const cliche = isCliche(source.word, candidate.word);
  const mismatch = candidate.masculine !== source.masculine;
  const tier = recommendationTier(candidate);

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

// ── Lyric Library decoration (Phase 1.7 — editorial cut) ────────────
// We are a rhyme finder. The candidate-word popover shows ONLY tier-1
// (exact match at line end). Tier 2 (inflected end-position) survives
// as a single faint collapsible footer; tiers 3 & 4 (mid-line) are
// removed from this surface entirely — they belong in a future
// word-study tool. The source word gets its own permanent panel under
// the phonetic header (renderSourcePanel below) — not duplicated per
// candidate. Click on the matched line itself reveals the surrounding
// stanza; no `+ context` button.
const POP_CAP = 2; // tier-1 quotes shown by default

function decorateWithLyrics(el, word) {
  const quotes = getQuotes(word);
  if (!quotes.length) return;

  const isEnd = (q) => (q.position ?? q.wordPos) === "end";
  const isExactSurface = (q) => (q.surface || "").toLowerCase() === word.toLowerCase();
  const tier1 = quotes.filter((q) => isEnd(q) && isExactSurface(q));
  const tier2 = quotes.filter((q) => isEnd(q) && !isExactSurface(q));
  if (!tier1.length && !tier2.length) return; // nothing rhyme-relevant

  // Within each tier, lift quotes that have a rhyme partner — they
  // make the rhyme visible as a couplet rather than a lone line. Stable
  // sort preserves the original popularity / line-length ordering
  // within each (with-partner / without-partner) bucket.
  const partnerFirst = (a, b) => (a.partner ? 0 : 1) - (b.partner ? 0 : 1);
  tier1.sort(partnerFirst);
  tier2.sort(partnerFirst);

  el.classList.add("rf-has-lyrics");

  // Badge: chunky vermilion dot + count when at least one tier-1
  // (exact end-of-line) match exists; smaller, ink-faded dot + count
  // when only tier-2 (inflected) matches exist. The dot is a ::before
  // pseudo on .rf-lyric-badge — see styles.css.
  const badge = document.createElement("span");
  const hasExact = tier1.length > 0;
  badge.className = hasExact ? "rf-lyric-badge" : "rf-lyric-badge rf-lyric-badge--inflected";
  const count = document.createElement("span");
  count.className = "rf-lyric-badge-count";
  count.textContent = String(hasExact ? tier1.length : tier2.length);
  badge.appendChild(count);
  el.appendChild(badge);

  const pop = document.createElement("div");
  pop.className = "rf-lyric-pop";
  pop.appendChild(renderPopHeader(word, tier1));

  for (const q of tier1.slice(0, POP_CAP)) pop.appendChild(renderEndQuote(q, word));
  if (tier1.length > POP_CAP) {
    pop.appendChild(renderToggleMore(tier1.slice(POP_CAP), (q) => renderEndQuote(q, word), pop));
  }
  if (tier2.length) {
    if (!tier1.length) {
      // No exact matches → tier-2 is all the user has. Render the first
      // POP_CAP items inline (no toggle), with "Show N more" for the
      // rest. Same default density as tier-1.
      pop.appendChild(renderInlineInflectedList(tier2, pop));
    } else {
      // Exact matches lead; tier-2 lives in the collapsible footer.
      pop.appendChild(renderInflectedFooter(tier2));
    }
  }

  el.appendChild(pop);

  // Click on the word still pins (the header pin glyph is additive —
  // both paths set `.rf-pinned`). Clicks landing inside the popover are
  // ignored so quote/stanza interactions don't toggle pin state.
  el.addEventListener("click", (e) => {
    if (e.target.closest(".rf-lyric-pop")) return;
    e.stopPropagation();
    setPin(el, !el.classList.contains("rf-pinned"));
  });
  installGlobalDismissHandlers();
}

// Outside-click + Escape both unpin everything. Mobile sheet-open class
// flagged on <html> for scroll lock + dim backdrop (preserved from 1.6).
let dismissHandlersInstalled = false;
function installGlobalDismissHandlers() {
  if (dismissHandlersInstalled) return;
  dismissHandlersInstalled = true;

  const unpinAll = () => {
    document.querySelectorAll(".rf-word.rf-pinned").forEach((p) => p.classList.remove("rf-pinned"));
    document.documentElement.classList.remove("rf-sheet-open");
  };
  const closeTierPopovers = () => {
    document.querySelectorAll(".rf-tier-head-open").forEach((h) => h.classList.remove("rf-tier-head-open"));
  };

  document.addEventListener("click", (e) => {
    // Tier info popover dismiss — stress popover is hover-driven and
    // needs no click handling here.
    if (!e.target.closest(".rf-tier-pop") && !e.target.closest(".rf-tier-titlebox")) {
      closeTierPopovers();
    }
    if (e.target.closest(".rf-lyric-pop")) return;
    unpinAll();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      unpinAll();
      closeTierPopovers();
    }
  });
}

function setPin(wordEl, pinned) {
  document.querySelectorAll(".rf-word.rf-pinned").forEach((p) => {
    if (p !== wordEl) p.classList.remove("rf-pinned");
  });
  wordEl.classList.toggle("rf-pinned", pinned);
  document.documentElement.classList.toggle("rf-sheet-open", pinned);
}

// Header strip: word · "N line-end · M artists" · pin glyph. No close ×,
// no summary line, no hover-hint copy — 1.7 is deliberately spare.
function renderPopHeader(word, tier1) {
  const head = document.createElement("header");
  head.className = "rf-lyric-head";

  const w = document.createElement("div");
  w.className = "rf-lyric-head-word";
  w.textContent = word;
  head.appendChild(w);

  const meta = document.createElement("div");
  meta.className = "rf-lyric-head-meta";
  const artists = new Set(tier1.map((q) => q.credit || q.artist)).size;
  meta.textContent = tier1.length
    ? `${tier1.length} line-end · ${artists} artist${artists === 1 ? "" : "s"}`
    : "no end matches";
  head.appendChild(meta);

  const pin = document.createElement("button");
  pin.className = "rf-lyric-head-pin";
  pin.type = "button";
  pin.setAttribute("aria-label", "Pin");
  pin.title = "Click to pin";
  pin.textContent = "⊹ pin";
  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    const wordEl = head.closest(".rf-word");
    if (!wordEl) return;
    setPin(wordEl, !wordEl.classList.contains("rf-pinned"));
  });
  head.appendChild(pin);

  return head;
}

// One end-rhyme item: matched line + (optional) partner line + attr.
// Click anywhere inside `.rf-lyric-quote` toggles the surrounding
// stanza below it (rendered once, kept in DOM, shown via .is-open).
function renderEndQuote(q, word) {
  const item = document.createElement("article");
  item.className = "rf-lyric-item";

  const quote = document.createElement("div");
  quote.className = "rf-lyric-quote";

  const line = document.createElement("p");
  line.className = "rf-lyric-line";
  line.innerHTML = highlightSurface(q.line, q.surface);
  quote.appendChild(line);

  if (q.partner && q.partner.line) {
    const p = document.createElement("p");
    p.className = "rf-lyric-partner";
    p.innerHTML = highlightSurface(q.partner.line, q.partner.word);
    quote.appendChild(p);
  }

  // Attribution: artist · song. No year. No section role tag. Italic
  // song title via .rf-lyric-attr-song.
  const attr = document.createElement("div");
  attr.className = "rf-lyric-attr";
  attr.innerHTML =
    `${escapeHtml(q.credit || q.artist)} · ` +
    `<span class="rf-lyric-attr-song">${escapeHtml(q.songTitle || q.song)}</span>`;
  quote.appendChild(attr);

  // Click the quote to reveal the stanza around it. If no stanza data,
  // the quote is non-interactive (cursor: default).
  if (Array.isArray(q.stanza) && q.stanza.length) {
    quote.addEventListener("click", (e) => {
      e.stopPropagation();
      const opened = item.classList.toggle("is-open");
      if (opened) ensureBottomVisible(item);
    });
    item.appendChild(quote);
    item.appendChild(renderStanza(q));
  } else {
    quote.style.cursor = "default";
    item.appendChild(quote);
  }
  return item;
}

function renderStanza(q) {
  const wrap = document.createElement("div");
  wrap.className = "rf-lyric-stanza";
  const matchIdx = Number.isInteger(q.stanzaLineIdx) ? q.stanzaLineIdx : -1;
  const partnerIdx = q.partner && Number.isInteger(q.partner.stanzaLineIdx)
    ? q.partner.stanzaLineIdx
    : -1;
  q.stanza.forEach((s, i) => {
    const p = document.createElement("p");
    p.className = "rf-lyric-stanza-line";
    if (i === matchIdx) {
      p.classList.add("is-match");
      p.innerHTML = highlightSurface(s, q.surface);
    } else if (i === partnerIdx) {
      p.classList.add("is-match");
      p.innerHTML = highlightSurface(s, q.partner.word);
    } else {
      p.textContent = s;
    }
    wrap.appendChild(p);
  });
  return wrap;
}

// Tier-2 (inflected end-position) lives in a single faint footer with
// a Show/Hide toggle. Lazy-renders the list on first expand. If
// `tier2.length === 0` the caller skips this entirely.
function renderInflectedFooter(tier2) {
  const wrap = document.createElement("div");
  wrap.className = "rf-lyric-inflected";
  const surfaces = [...new Set(tier2.map((q) => q.surface))].slice(0, 2);
  const hint = surfaces.length ? ` (${surfaces.join(" · ")})` : "";

  // Header strip: label + Show/Hide toggle together, framed so the
  // user sees a clear "click anywhere on this row to expand/collapse"
  // affordance via a vermilion-soft hover band.
  const head = document.createElement("div");
  head.className = "rf-lyric-inflected-head";

  const label = document.createElement("div");
  label.className = "rf-lyric-inflected-label";
  label.innerHTML =
    `+ ${tier2.length} inflected match${tier2.length === 1 ? "" : "es"}` +
    `<span style="opacity:0.6">${escapeHtml(hint)}</span>`;
  head.appendChild(label);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "rf-lyric-inflected-toggle";
  toggle.textContent = "Show ↓";
  head.appendChild(toggle);

  wrap.appendChild(head);

  const list = document.createElement("ul");
  list.className = "rf-lyric-inflected-list";
  wrap.appendChild(list);

  let rendered = false;
  // Click anywhere on the footer header (label or toggle button) expands.
  // Clicks inside the already-rendered list don't collapse — the user
  // may be selecting / reading or expanding stanza on a list item.
  wrap.addEventListener("click", (e) => {
    if (e.target.closest(".rf-lyric-inflected-list")) return;
    e.stopPropagation();
    if (!rendered) {
      rendered = true;
      for (const q of tier2) list.appendChild(buildInflectedItem(q));
    }
    const open = wrap.classList.toggle("is-expanded");
    toggle.textContent = open ? "Hide ↑" : "Show ↓";
  });
  return wrap;
}

// One inflected list row — same click-to-expand stanza pattern as the
// tier-1 quote items, just with denser typography (it's tier 2, after all).
function buildInflectedItem(q) {
  const li = document.createElement("li");
  li.className = "rf-lyric-inflected-item";

  const row = document.createElement("div");
  row.className = "rf-lyric-inflected-row";
  row.innerHTML =
    `<span class="rf-lyric-inflected-line">${highlightSurface(q.line, q.surface)}</span>` +
    `<span class="rf-lyric-inflected-attr">— ${escapeHtml(q.credit || q.artist)} · ` +
    `${escapeHtml(q.songTitle || q.song)}</span>`;
  li.appendChild(row);

  if (Array.isArray(q.stanza) && q.stanza.length) {
    row.style.cursor = "pointer";
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      const opened = li.classList.toggle("is-open");
      if (opened) ensureBottomVisible(li);
    });
    li.appendChild(renderStanza(q));
  }
  return li;
}

// After expanding an item inside a scrollable popover, scroll the
// popover just enough that the item's new bottom is on screen — no
// jump on collapse, the popover scroll stays put so the quote
// remains in the same visual position.
function ensureBottomVisible(item) {
  const scroller = item.closest(".rf-lyric-pop");
  if (!scroller) return;
  // getBoundingClientRect forces a synchronous layout flush so the
  // freshly-revealed stanza is already measured. Reading immediately
  // is more reliable than rAF (which can be throttled on background
  // tabs / headless contexts).
  const itemRect = item.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const overflow = itemRect.bottom - scrollerRect.bottom;
  if (overflow > 0) {
    // `behavior: smooth` is a niceness; we keep it for real browsers.
    // (Some headless environments ignore smooth and the call no-ops —
    // not a runtime concern but a debugging gotcha.)
    scroller.scrollBy({ top: overflow + 8, behavior: "smooth" });
  }
}

// Generic reversible "Show N more / Collapse" toggle. Items are
// rendered up-front (so first click is instant) and toggled visible
// via the .rf-lyric-hidden class, which the CSS hides via display:none.
// `container` is where the rest items live; the button itself is
// returned and the caller appends it after the container.
function renderToggleMore(rest, build, container) {
  const hiddenItems = rest.map((q) => {
    const el = build(q);
    el.classList.add("rf-lyric-hidden");
    container.appendChild(el);
    return el;
  });
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rf-lyric-more";
  const collapsedLabel = `Show ${rest.length} more`;
  const expandedLabel = "Collapse";
  btn.textContent = collapsedLabel;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasHidden = hiddenItems[0]?.classList.contains("rf-lyric-hidden");
    hiddenItems.forEach((el) => el.classList.toggle("rf-lyric-hidden"));
    btn.textContent = wasHidden ? expandedLabel : collapsedLabel;
  });
  return btn;
}

// Inline-expanded inflected list — used when there are no tier-1
// matches, so tier-2 is all we can show. Render POP_CAP items
// directly (same default density as tier-1) and a Show-more button
// for the rest.
function renderInlineInflectedList(tier2, popEl) {
  const wrap = document.createElement("div");
  wrap.className = "rf-lyric-inflected-inline";

  const list = document.createElement("ul");
  list.className = "rf-lyric-inflected-list rf-lyric-inflected-list--inline";
  for (const q of tier2.slice(0, POP_CAP)) list.appendChild(buildInflectedItem(q));
  wrap.appendChild(list);

  if (tier2.length > POP_CAP) {
    wrap.appendChild(renderToggleMore(tier2.slice(POP_CAP), buildInflectedItem, list));
  }
  return wrap;
}

// ── Source-word panel ──────────────────────────────────────────────
// Always-visible strip directly under the source summary header. Two
// end-position quotes for the searched word, with the same expand-in-
// place pattern as the candidate popover. Hidden when the searched
// word has no end-position quotes in the corpus.
function renderSourcePanel(word) {
  const panel = document.getElementById("source-panel");
  if (!panel) return;
  panel.innerHTML = "";

  const quotes = getQuotes(word);
  const isEnd = (q) => (q.position ?? q.wordPos) === "end";
  const ends = quotes.filter(isEnd);
  if (!ends.length) {
    // Empty state — keep the panel visible with a quiet message so the
    // user knows the corpus simply doesn't have an end-position use yet,
    // not that the search is broken.
    panel.style.display = "";
    panel.innerHTML =
      `<div class="rf-source-panel-head">` +
      `<h2 class="rf-source-panel-title">How songwriters use <em>${escapeHtml(word)}</em></h2>` +
      `<div class="rf-source-panel-meta">no line-end uses in the corpus yet — try a rhyme below</div>` +
      `</div>`;
    return;
  }
  // Sort: exact-surface first, then quotes-with-partner first within
  // each surface group. Stable sort preserves the build-time ranking
  // (song popularity / line length) within each bucket.
  const wordLower = word.toLowerCase();
  ends.sort((a, b) => {
    const aExact = (a.surface || "").toLowerCase() === wordLower ? 0 : 1;
    const bExact = (b.surface || "").toLowerCase() === wordLower ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return (a.partner ? 0 : 1) - (b.partner ? 0 : 1);
  });
  panel.style.display = "";
  const artists = new Set(ends.map((q) => q.credit || q.artist)).size;

  // Section heading reads as editorial content rather than metadata —
  // sets the tone that this panel is curated reading, not a stat strip.
  const head = document.createElement("div");
  head.className = "rf-source-panel-head";
  head.innerHTML =
    `<h2 class="rf-source-panel-title">How songwriters use <em>${escapeHtml(word)}</em></h2>` +
    `<div class="rf-source-panel-meta">${ends.length} at line end · ${artists} artist${artists === 1 ? "" : "s"}</div>`;
  panel.appendChild(head);

  const col = document.createElement("div");
  col.className = "rf-source-panel-quotes";
  const cap = 2;

  // Each row is wrapped in an item so the click-to-expand stanza
  // pattern from the candidate popover works here too. Click the
  // row → toggle `.is-open` on the wrapping item → stanza shows.
  const buildItem = (q) => {
    const item = document.createElement("article");
    item.className = "rf-source-panel-item";

    const row = document.createElement("div");
    row.className = "rf-source-panel-quote";
    row.innerHTML =
      `<div class="rf-source-panel-line">${highlightSurface(q.line, q.surface)}</div>` +
      `<div class="rf-source-panel-attr">${escapeHtml(q.credit || q.artist)} · ` +
      `<span class="rf-lyric-attr-song">${escapeHtml(q.songTitle || q.song)}</span></div>`;
    item.appendChild(row);

    if (Array.isArray(q.stanza) && q.stanza.length) {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        item.classList.toggle("is-open");
      });
      item.appendChild(renderStanza(q));
    } else {
      row.style.cursor = "default";
    }
    return item;
  };

  for (const q of ends.slice(0, cap)) col.appendChild(buildItem(q));
  if (ends.length > cap) {
    col.appendChild(renderToggleMore(ends.slice(cap), buildItem, col));
  }
  panel.appendChild(col);
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
