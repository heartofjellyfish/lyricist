// ── Rhyme Finder · main wiring ──────────────────────────────────────
// Input a word → render five Pattison tiers of candidates with feeling
// labels, mas/fem warnings, partners/companions split for family rhyme,
// and cliché flags.

import { findRhymes, TYPE_ORDER, prewarm } from "./rhymeFinder.js";
import {
  hasQuotes,
  getQuotes,
  getCounts,
  pairCount,
  getPairQuotes,
  getNotRhymed,
  ensureExistence,
  prefetchBucketsFor,
} from "./lyricLibrary.js";

// Fire a PostHog event if the library is present (it's a no-op stub otherwise).
function track(event, props) {
  try { window.posthog?.capture?.(event, props); } catch {}
}

// Eager warmup — fire all heavy fetches in the background the moment main.js
// runs, in parallel with the user reading the page. CMU dict (~500 KB br),
// wordnet/lyric-frequency lists (~2 MB), and the lyric-library existence
// index all become "warm" while the visitor is still deciding what to search.
// By the time they hit submit the first-search dict-load tax is gone.
// All calls are idempotent and silently no-op on subsequent invocations.
prewarm().catch(() => {});
ensureExistence().catch(() => {});

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
//   bullets  — Pattison's 3-condition definition (vowel / post-vowel /
//              onset). Rendered as a numbered list in the popover.
//   example  — a concrete example pair, shown in the popover
//   stability — 1..5 (5 = most resolved). Drives the spectrum cells +
//                left-bar colour fade.
const TIER_META = {
  perfect: {
    label: "Perfect rhyme",
    subtitle: "fully resolved",
    stability: 5,
    bullets: [
      "The syllables' vowel sounds are identical.",
      "The sounds after the vowels (if any) are identical.",
      "The syllables begin differently.",
    ],
    example: "cat / hat — same AE vowel, same T ending",
  },
  family: {
    label: "Family rhyme",
    subtitle: "almost resolved",
    stability: 4,
    bullets: [
      "The syllables' vowel sounds are identical.",
      "The sounds after the vowels come from the same phonetic family (e.g. T↔D, P↔B, M↔N).",
      "The syllables begin differently.",
    ],
    example: "cat / pad — AE vowel; T and D are both stops",
  },
  additive: {
    label: "Additive",
    subtitle: "resolved, plus a sound",
    stability: 3,
    bullets: [
      "The syllables' vowel sounds are identical.",
      "The sounds after the vowels are identical, with one extra consonant on one side.",
      "The syllables begin differently.",
    ],
    example: "love / loved — extra D on one side",
  },
  subtractive: {
    label: "Subtractive",
    subtitle: "resolved, cut short",
    stability: 3,
    bullets: [
      "The syllables' vowel sounds are identical.",
      "The sounds after the vowels are identical, but one side stops one consonant earlier.",
      "The syllables begin differently.",
    ],
    example: "cried / cry — one side missing the final D",
  },
  assonance: {
    label: "Assonance",
    subtitle: "kinda resolved",
    stability: 2,
    bullets: [
      "The syllables' vowel sounds are the same.",
      "The consonants after the vowel are not phonetically related.",
      "The syllables begin differently.",
    ],
    note: "Assonance rhymes always have consonants after the vowels, but the consonants cannot be phonetically related.",
    example: "love / dot — both AH, but V and T have nothing in common",
  },
  consonance: {
    label: "Consonance",
    subtitle: "unresolved",
    stability: 1,
    bullets: [
      "The syllables' vowel sounds are different.",
      "The sounds after the vowels are identical.",
      "The syllables begin differently.",
    ],
    example: "love / live — both end in V; AH versus IH",
  },
  identity: {
    label: "Identity",
    subtitle: "nothing to resolve",
    stability: 0,
    bullets: [
      "The syllables' vowel sounds are identical.",
      "The sounds after the vowels (if any) are identical.",
      "The syllables begin the same — repetition, not a rhyme.",
    ],
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

// ── Cliché pair list (corpus-derived) ─────────────────────────────────
// Loaded from /wordlists/cliche-pairs.json at first search. The list is
// the top-N most-co-occurring rhyme pairs at line-end across the lyric
// library — the most-overworked pairs in your taste profile, by
// definition. Replaces the prior hand-curated Pattison-era list (which
// included dead pairs like moon/june and missed live ones like
// back/black, storm/warm, breath/death).
//
// Re-derived by scripts/buildClicheList.mjs whenever the corpus expands.
let CLICHE_INDEX = null;
let CLICHE_LOADING = null;

async function loadCliches() {
  if (CLICHE_INDEX) return;
  if (!CLICHE_LOADING) {
    CLICHE_LOADING = (async () => {
      const resp = await fetch("/wordlists/cliche-pairs.json");
      if (!resp.ok) {
        // Don't break the app on a missing file — just no cliché flags.
        CLICHE_INDEX = new Map();
        return;
      }
      const pairs = await resp.json();
      const idx = new Map();
      for (const [a, b] of pairs) {
        const al = a.toLowerCase();
        const bl = b.toLowerCase();
        if (!idx.has(al)) idx.set(al, new Set());
        if (!idx.has(bl)) idx.set(bl, new Set());
        idx.get(al).add(bl);
        idx.get(bl).add(al);
      }
      CLICHE_INDEX = idx;
    })();
  }
  await CLICHE_LOADING;
}

function isCliche(sourceWord, candidateWord) {
  if (!CLICHE_INDEX) return false; // not loaded yet — fail safe (no flag)
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
// `via` distinguishes how the search was initiated: "form" (typed +
// submitted), "deeplink" (?q= share link), "seo" (a /rhymes/{word}/
// landing hydrating itself). Tracking lives HERE, not on the form's
// submit listener, so all three paths land in the same PostHog event.
async function runSearch(word, { updateUrl = true, via = "form" } = {}) {
  if (!word) {
    setStatus("Type a word to begin.", true);
    return;
  }

  setStatus(`Searching ${word}…`);
  goBtn.disabled = true;
  goBtn.dataset.busy = "true";
  results.innerHTML = `<div class="rf-loading"><span class="rf-spinner"></span> Searching · ranked by feel</div>`;
  sourceSummary.innerHTML = "";

  let reported = false;
  try {
    // Yield to the event loop so the loading UI paints before the scan.
    await new Promise((r) => setTimeout(r, 0));
    const { source, buckets, mosaics } = await findRhymes({ word, perBucket: 200 });
    track("search_submitted", { word, found: true, via });
    reported = true;

    // Group mosaic (multi-word) rhymes by tier so they render merged into the
    // matching single-word tier, under their own "mosaic" divider.
    const mosaicsByType = {};
    for (const m of mosaics ?? []) (mosaicsByType[m.type] ||= []).push(m);

    // First paint needs ONLY the word list + counts. Both come from data that's
    // already loaded: the classifier (above) for the words, and index.json for
    // every badge number (pair counts + per-word counts) — NO quote bucket is
    // fetched on the critical path. Quote text loads on hover. So we block on
    // just the index + cliché list (both tiny, loaded once at init).
    await Promise.all([ensureExistence(), loadCliches()]);
    renderSource(source);
    renderLexFilter(buckets);
    renderResults(source, buckets, mosaicsByType);  // single words + badges + merged mosaics
    renderTabs(source.word, buckets);
    renderStickybar(source.word);
    updateBucketCounts();
    setStatus("");

    // First paint is done (word list + counts, no fetch). NOW proactively warm
    // every badged candidate's popover in the background so hovers are instant:
    // prefetch the tier-1 bucket (the top-5 per pair) for each. Non-blocking,
    // dedups by rhyme key (~tens of fetches, not thousands). The source word
    // goes first — its bucket backs all the attested popovers + perfect rhymes.
    renderCorpusGallery(source.word).catch(() => {});
    const warm = [source.word];
    for (const t of TYPE_ORDER) for (const c of buckets[t] ?? []) if (hasQuotes(c.word)) warm.push(c.word);
    prefetchBucketsFor(warm).catch(() => {});

    // Reflect the searched word in the URL so the page is link-shareable.
    // Use replaceState rather than pushState so multiple consecutive
    // searches don't pile up in the back-button history.
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("q", word);
      window.history.replaceState({ word }, "", url);
    }
  } catch (err) {
    // Dictionary miss (word not in CMU) lands here — report it with
    // found:false so we can watch the miss rate. `reported` guards the
    // rare case where findRhymes succeeded but a renderer threw.
    if (!reported) track("search_submitted", { word, found: false, via });
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

// ── Slim-banner home/clear handlers ─────────────────────────────────
// After the first search the hero collapses to a slim banner (Option A,
// search-collapse). The wordmark is a link back to the empty/home state;
// the "clear ×" chip wipes the input so the user can type a new word.
//
// goHome() empties every results surface the renderers populate so the
// :has(#results:not(:empty)) selector flips back to the empty hero.
function goHome() {
  wordInput.value = "";
  sourceSummary.innerHTML = "";
  results.innerHTML = "";
  const corpus = document.getElementById("corpus-gallery");
  if (corpus) corpus.innerHTML = "";
  const tabs = document.getElementById("cd-tabs");
  if (tabs) tabs.hidden = true;
  const jumpContent = document.getElementById("jump-content");
  if (jumpContent) jumpContent.innerHTML = "";
  const filterContent = document.getElementById("filter-content");
  if (filterContent) filterContent.innerHTML = "";
  // Reset toggle to dictionary + close any open drawer.
  setActiveTab("dict");
  closeDrawers();
  setStatus("");
  const url = new URL(window.location.href);
  url.searchParams.delete("q");
  window.history.replaceState({}, "", url);
  wordInput.focus();
}

document.querySelector(".rf-title")?.addEventListener("click", (e) => {
  // Only act when collapsed — in the empty state the title is decorative.
  if (!sourceSummary.innerHTML && !results.innerHTML) return;
  e.preventDefault();
  goHome();
});

document.getElementById("input-clear")?.addEventListener("click", () => {
  // Per the design: clear × wipes the input so the user can start typing.
  // Results stay until the next submit — full home reset lives on the
  // wordmark. If the input is already empty, fall through to home reset.
  if (!wordInput.value) {
    goHome();
    return;
  }
  wordInput.value = "";
  wordInput.focus();
});

// ── Deep-link support ──────────────────────────────────────────────
// On first load, if ?q=<word> is in the URL, pre-fill the input and
// auto-run the search. This lets links like rhyme.land/?q=love
// land the visitor directly on results — useful for sharing.
(() => {
  const params = new URLSearchParams(window.location.search);
  const initial = (params.get("q") || "").trim().toLowerCase();
  if (initial) {
    wordInput.value = initial;
    // SEO snapshot pages (/rhymes/{word}/) hydrate through this same
    // path — their boot script injects ?q= before this module runs.
    const via = /\/rhymes\//.test(window.location.pathname) ? "seo" : "deeplink";
    // Don't push another URL state — we're already there.
    runSearch(initial, { updateUrl: false, via });
  }
})();

// ── Rendering ───────────────────────────────────────────────────────
function renderSource(source) {
  const codaText = source.coda.length > 0 ? source.coda.join("·") : "—";
  // Single-row layout. The sticky tier bar is a separate fixed
  // element (#stickybar) that slides in when this summary leaves
  // the viewport — see renderStickybar() and the IntersectionObserver
  // at the bottom of this file.
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
      ? "Ends on a stressed syllable — a one-syllable rhyme, or a multisyllable word whose primary stress lands last. The rhyme hits the final beat: common, clean, song-friendly."
      : "Ends with an unstressed syllable trailing the stressed one — always at least two syllables. The rhyme lands a beat earlier and trails off softly.";
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
    `<p class="rf-tier-pop-note">Masculine and feminine endings rarely sing together — the rhyme lands on a different beat, so Rhyme Land keeps them in separate results.</p>`;
  pop.appendChild(note);

  return pop;
}

function renderResults(source, buckets, mosaicsByType = {}) {
  results.innerHTML = "";
  const totalCount = TYPE_ORDER.reduce(
    (acc, t) => acc + (buckets[t]?.length || 0) + (mosaicsByType[t]?.length || 0),
    0,
  );
  if (totalCount === 0) {
    results.innerHTML = `<div class="rf-empty">No rhymes found. Try a more common word.</div>`;
    return;
  }
  for (const type of TYPE_ORDER) {
    const candidates = buckets[type] || [];
    const mosaics = mosaicsByType[type] || [];
    if (candidates.length === 0 && mosaics.length === 0) continue;
    results.appendChild(renderTier(type, candidates, source, mosaics));
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

  // Definition row — Pattison's 3-condition structure as a numbered list
  // (vowel / sounds after the vowel / onset). The parallel structure
  // across tiers is the point: the reader sees at a glance which
  // condition shifts as you move down the scale.
  const def = document.createElement("div");
  def.className = "rf-tier-pop-section";
  def.innerHTML =
    `<div class="rf-tier-pop-eyebrow">What it is</div>` +
    `<ol class="rf-tier-pop-rule-list">` +
    meta.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("") +
    `</ol>`;
  pop.appendChild(def);

  // 5-stop spectrum showing every rhyme tier with the current one
  // highlighted. Identity is NOT a rhyme — it sits off the scale, so we
  // skip the spectrum and show a short "off the scale" note instead.
  if (type === "identity") {
    const offScale = document.createElement("div");
    offScale.className = "rf-tier-pop-section";
    offScale.innerHTML =
      `<div class="rf-tier-pop-eyebrow">How it feels</div>` +
      `<p class="rf-tier-pop-note">Off the rhyme scale — identity is repetition, not resolution. Listed here so you can recognize and avoid it.</p>`;
    pop.appendChild(offScale);
  } else {
    const spec = document.createElement("div");
    spec.className = "rf-tier-pop-section";
    spec.innerHTML =
      `<div class="rf-tier-pop-eyebrow">How it feels</div>` +
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
      `<div class="rf-tier-pop-axis"><span>resolved</span><span>unresolved</span></div>`;
    pop.appendChild(spec);
  }

  // Example row
  const ex = document.createElement("div");
  ex.className = "rf-tier-pop-section";
  ex.innerHTML =
    `<div class="rf-tier-pop-eyebrow">Example</div>` +
    `<p class="rf-tier-pop-body rf-tier-pop-example">${escapeHtml(meta.example)}</p>`;
  pop.appendChild(ex);

  // Optional Pattison clarification note (e.g. assonance's "always have
  // consonants after the vowels" caveat that distinguishes the tier from
  // mere vowel repetition).
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

  // Attribution — the whole rhyme framework is Pat Pattison's. Quiet
  // footer line on every tier popover, linked, unaffiliated.
  const src = document.createElement("div");
  src.className = "rf-tier-pop-source";
  src.innerHTML =
    `<div class="rf-tier-pop-eyebrow">Source</div>` +
    `Berklee College of Music's songwriting method (<a href="https://www.patpattison.com/" target="_blank" rel="noopener">Pat Pattison</a>)`;
  pop.appendChild(src);

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

function renderTier(type, candidates, source, mosaics = []) {
  const meta = TIER_META[type];
  const tier = document.createElement("article");
  tier.className = "rf-tier";
  tier.dataset.tier = type;
  tier.dataset.stability = String(meta.stability);

  // Mosaics live under their own "MOSAIC RHYME" black label — a peer of the
  // "N syllables" groups, no special count/tag/filter. ATTESTED ones (the
  // phrase ends lines in real songs → everyday + a red dot) show by default,
  // most-attested first; UN-attested ones sit behind the group's show-more.
  // (By construction mosaics only ever land in the perfect + additive tiers,
  // so this label only appears there.)
  const attested = mosaics.filter((m) => m.songs > 0).sort((a, b) => b.songs - a.songs);
  const nonAttested = mosaics.filter((m) => !(m.songs > 0));

  const head = document.createElement("header");
  head.className = "rf-tier-head";
  head.dataset.stability = String(meta.stability);
  // Count is the tier's full candidate total. Filters and the
  // show-more toggle don't change the headline number — they only
  // affect what's currently rendered/visible. Zero-visible state is
  // still surfaced via the .rf-tier-zero class + empty hint, set in
  // updateBucketCounts().
  const totalCount = candidates.length;
  // Title row on top (label + question-mark glyph) with the subtitle
  // dropped to its own mono-caps line beneath. Default ink; the
  // titlebox hover rule shifts the whole stack to vermilion.
  head.innerHTML = `
    <button class="rf-tier-titlebox" type="button" aria-label="What is ${escapeHtml(meta.label)}?">
      <span class="rf-tier-title-row">
        <span class="rf-tier-title">${escapeHtml(meta.label)}</span>
        <span class="rf-tier-info" aria-hidden="true">?</span>
      </span>
      <span class="rf-tier-subtitle">${escapeHtml(meta.subtitle)}</span>
    </button>
    <span class="rf-tier-count" data-total="${totalCount}">${totalCount}</span>
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

  // Empty-tier hint — shown by updateBucketCounts() when the active
  // lex filter zeros the visible count. Sits right after the header
  // so the user sees it adjacent to the tier title, not buried below
  // an empty body.
  const empty = document.createElement("div");
  empty.className = "rf-tier-empty";
  empty.hidden = true;
  empty.innerHTML =
    `No words in this tier match the active filter.` +
    `<span class="rf-tier-empty-hint">adjust filters to see ${totalCount} hidden</span>`;
  tier.appendChild(empty);

  const body = document.createElement("div");
  body.className = "rf-tier-body";

  // Group single-word candidates by syllable count, splitting each group into
  // default-tier vs lower-tier entries.
  const bySyll = new Map();
  for (const c of candidates) {
    const s = Math.max(1, c.syllables ?? 1);
    if (!bySyll.has(s)) bySyll.set(s, { def: [], low: [] });
    const target = c.tier === "lower" ? "low" : "def";
    bySyll.get(s)[target].push(c);
  }
  const sylls = [...bySyll.keys()].sort((a, b) => a - b);
  for (const s of sylls) {
    const { def, low } = bySyll.get(s);
    const label = s === 1 ? "1 syllable" : `${s} syllables`;
    body.appendChild(renderSubgroup(label, def, low, source));
  }

  // Mosaics get their own "MOSAIC RHYME" group — same black label as the
  // syllable groups, treated identically. Attested (everyday, red dot) show
  // by default; un-attested sit behind the group's own show-more.
  if (attested.length || nonAttested.length) {
    body.appendChild(renderMosaicSubgroup(attested, nonAttested, source));
  }

  tier.appendChild(body);

  return tier;
}

// The "MOSAIC RHYME" subgroup — a peer of the "N syllables" groups. Attested
// mosaics are the default row; un-attested ones are the lower row (hidden
// behind a show-more when numerous, mirroring the single-word subgroups).
function renderMosaicSubgroup(attested, nonAttested, source) {
  const wrap = document.createElement("div");
  wrap.className = "rf-subgroup rf-mosaic-subgroup";
  const title = document.createElement("div");
  title.className = "rf-subgroup-label";
  title.textContent = "mosaic rhyme";
  wrap.appendChild(title);

  const row = document.createElement("div");
  row.className = "rf-words";
  for (const m of attested) row.appendChild(renderMosaicChip(m, source));
  for (const m of nonAttested) {
    const el = renderMosaicChip(m, source);
    el.classList.add("rf-word--lower");
    row.appendChild(el);
  }
  wrap.appendChild(row);

  if (!nonAttested.length) return wrap;
  if (nonAttested.length <= LOWER_INLINE_THRESHOLD && attested.length) {
    wrap.classList.add("rf-subgroup--lower-shown");
    return wrap;
  }
  // No attested at all, or many un-attested → hide behind a show-more.
  if (!attested.length) {
    // Nothing everyday to anchor the group — keep it collapsed by default.
    const btn = document.createElement("button");
    btn.className = "rf-subgroup-show-more";
    btn.type = "button";
    btn.textContent = `Show ${nonAttested.length} multi-word`;
    btn.addEventListener("click", () => {
      wrap.classList.add("rf-subgroup--lower-shown");
      btn.remove();
    });
    wrap.appendChild(btn);
    return wrap;
  }
  const btn = document.createElement("button");
  btn.className = "rf-subgroup-show-more";
  btn.type = "button";
  btn.textContent = `Show ${nonAttested.length} more`;
  btn.addEventListener("click", () => {
    wrap.classList.add("rf-subgroup--lower-shown");
    btn.remove();
  });
  wrap.appendChild(btn);
  return wrap;
}

// One mosaic chip: just the phrase (the "MOSAIC RHYME" group label already
// says what these are — no per-chip tag). Clicking the WORD re-searches the
// phrase (closing the loop between generation and phrase-input). Weak-form
// mosaics ("get her" → "get 'er") carry a pronunciation hint. Attested mosaics
// (in the lyric corpus) get the same red-dot badge single words do — tapping
// the badge opens the real song lines; hovering shows them on desktop.
const TAIL_REDUCED = {
  her: "’er", them: "’em", him: "’im", his: "’is", you: "ya",
  of: "o’", and: "’n’", to: "tuh", there: "’ere",
};
function renderMosaicChip(mosaic, source) {
  const el = document.createElement("span");
  el.className = "rf-word rf-mosaic-chip";
  el.dataset.lex = "mosaic";
  el.textContent = mosaic.display;

  // Weak-form pronunciation hint (native tooltip — low-clutter).
  const hintParts = [`${mosaic.syllables ?? "?"} syll.`, "click to search as a phrase"];
  if (mosaic.weakForm) {
    const tailWord = mosaic.words[mosaic.words.length - 1];
    const red = TAIL_REDUCED[tailWord];
    if (red) hintParts.unshift(`sounds like “${mosaic.words.slice(0, -1).join(" ")} ${red}”`);
  }
  el.title = hintParts.join(" · ");

  // Corpus attestation → the same badge single words use, with the SAME rule:
  // a HOLLOW dot (--corpus) = "this lives in the lyric corpus" (ambient). We
  // use hollow, not the filled dot, because the filled dot specifically means
  // "rhymed WITH the searched word" (a verified pairing) — mosaic-phrases.json
  // only records the phrase's own line-end appearances, not source pairings.
  // Count = songs the phrase ends a line in. Quotes ship inline (no fetch).
  if (mosaic.songs > 0) {
    el.classList.add("rf-has-lyrics", "rf-mosaic-attested");
    const badge = document.createElement("span");
    badge.className = "rf-lyric-badge rf-lyric-badge--corpus";
    const count = document.createElement("span");
    count.className = "rf-lyric-badge-count";
    count.textContent = String(mosaic.songs);
    badge.appendChild(count);
    el.appendChild(badge);
    el.appendChild(renderMosaicQuotePop(mosaic));
  }

  el.addEventListener("click", (e) => {
    // Interactions inside the popover never navigate.
    if (e.target.closest(".rf-lyric-pop")) return;
    // Tapping the badge pins the quotes (mobile has no hover); tapping the
    // word text re-searches the phrase.
    if (e.target.closest(".rf-lyric-badge")) {
      e.stopPropagation();
      setPin(el, !el.classList.contains("rf-pinned"));
      return;
    }
    e.stopPropagation();
    track("mosaic_click", { source: source.word, phrase: mosaic.display, tier: mosaic.type });
    wordInput.value = mosaic.display;
    runSearch(mosaic.display);
  });
  return el;
}

// Synchronous quote popover for an attested mosaic — header + the real song
// lines where the phrase ends a line. Built from the quotes shipped on the
// mosaic (no fetch); reuses the lyric-pop shell + item styling.
function renderMosaicQuotePop(mosaic) {
  const pop = document.createElement("div");
  pop.className = "rf-lyric-pop";
  const handle = document.createElement("div");
  handle.className = "rf-lyric-pop-handle";
  handle.setAttribute("aria-hidden", "true");
  pop.appendChild(handle);

  // Same header as single words ("in N songs by M artists" + pin button).
  pop.appendChild(renderPairHeader(mosaic.display, mosaic.songs, mosaic.quotes));

  const list = document.createElement("div");
  list.className = "rf-lyric-list";
  for (const q of mosaic.quotes) {
    const item = document.createElement("article");
    item.className = "rf-lyric-item";
    const quote = document.createElement("div");
    quote.className = "rf-lyric-quote rf-lyric-quote--static";
    const line = document.createElement("p");
    line.className = "rf-lyric-line";
    line.innerHTML = highlightSurface(q.line, q.surface);
    quote.appendChild(line);
    const attr = document.createElement("div");
    attr.className = "rf-lyric-attr";
    attr.innerHTML =
      `${escapeHtml(q.credit)} · ` +
      `<span class="rf-lyric-attr-song">${escapeHtml(q.songTitle)}</span>`;
    quote.appendChild(attr);
    item.appendChild(quote);
    list.appendChild(item);
  }
  pop.appendChild(list);
  return pop;
}

// If a subgroup has few lower-tier entries, just show them inline alongside
// the default ones — no button needed when 5 extra words won't overwhelm.
// Above this threshold, hide them behind a "show N more" button so the
// user explicitly opts in.
const LOWER_INLINE_THRESHOLD = 8;

function renderSubgroup(label, defaultWords, lowerWords, source) {
  const wrap = document.createElement("div");
  wrap.className = "rf-subgroup";
  const title = document.createElement("div");
  title.className = "rf-subgroup-label";
  title.textContent = label;
  wrap.appendChild(title);

  // Always render every word into the same flex row, including lower
  // ones. Visibility of lower words is controlled by the
  // .rf-subgroup--lower-shown class (CSS hides .rf-word--lower
  // otherwise). Rendering them upfront lets the lex filter "see"
  // them — so when a filter zeroes out every default word, we can
  // reveal the lower ones automatically (see updateBucketCounts).
  const row = renderWordRow(defaultWords, source);
  wrap.appendChild(row);
  for (const w of lowerWords || []) {
    const el = renderWord(w, source);
    el.classList.add("rf-word--lower");
    row.appendChild(el);
  }

  if (!lowerWords || lowerWords.length === 0) return wrap;

  if (lowerWords.length <= LOWER_INLINE_THRESHOLD) {
    // Few lower entries — always shown, no button.
    wrap.classList.add("rf-subgroup--lower-shown");
    return wrap;
  }

  // Many lower entries — hidden until user clicks the button (or
  // updateBucketCounts auto-reveals them when filters force it).
  const btn = document.createElement("button");
  btn.className = "rf-subgroup-show-more";
  btn.type = "button";
  btn.textContent = `Show ${lowerWords.length} more`;
  btn.addEventListener("click", () => {
    wrap.classList.add("rf-subgroup--lower-shown");
    btn.remove();
  });
  wrap.appendChild(btn);
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
// thresholds the score directly. Cliché and family-loose closeness
// each carry their own visual channels (strikethrough, sort position)
// and are not re-encoded as gates here — the user reads each warning
// alongside the bold/normal/italic signal.
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
  // Drives both the per-word lex marker (PERSON / PLACE / SCIENCE caps
  // tag below the word) and the global filter chips up top — see the
  // .rf-app[data-filter-{lex}="false"] selectors in styles.css.
  el.dataset.lex = candidate.lex || "common";

  const cliche = isCliche(source.word, candidate.word);
  const tier = recommendationTier(candidate);

  el.classList.add(`rf-c-${tier}`);
  if (cliche) el.classList.add("rf-cliche");

  // Skip the native browser tooltip when we have a custom popover for
  // lyric quotes — otherwise the OS tooltip and our popover both appear,
  // which reads as cluttered. The phonetic info is non-essential and
  // surfaced elsewhere already (cliché strikethrough).
  // hasQuotes() reads the existence index (sync, loaded once at init), so
  // we can gate the tooltip without waiting on the per-bucket fetch.
  const willHaveLyrics = hasQuotes(candidate.word);
  if (!willHaveLyrics) {
    el.title = [
      candidate.masculine ? "masculine" : "feminine",
      `${candidate.syllables ?? "?"} syll.`,
      tier === "very-common" ? "very common" : tier === "common" ? "common" : "uncommon",
      cliche ? "Pattison cliché — overworked pair" : "",
    ].filter(Boolean).join(" · ");
  }

  el.textContent = candidate.word;

  if (cliche) {
    // Cliché flag is rendered as a vermilion superscript "cliché" tag
    // beside the (struck-through) word.
    const flag = document.createElement("span");
    flag.className = "rf-word-flag";
    flag.textContent = "cliché";
    el.appendChild(flag);
  }

  decorateWithLyrics(el, candidate.word, source.word);

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
const POP_CAP = 2; // tier-1 quotes shown by default (legacy inflected footer)
const PAGE_SIZE = 5; // pair quotes per page — matches the build's tier-1 size

function decorateWithLyrics(el, word, sourceWord) {
  // SEARCH-RELATIVE gate + count. The badge shows how often the searched
  // word actually rhymes with THIS candidate in the corpus (sourceWord ↔
  // word), not the candidate's global usage — otherwise "heart·55" while
  // searching "apart" misleads (51 of those aren't with apart). pairCount
  // is sync: the source word's tier-1 bucket was prefetched before results
  // rendered. n === 0 means "valid rhyme, nobody's paired it with the
  // source yet" → no badge (fresh territory, not an error).
  const n = pairCount(sourceWord, word);   // times it rhymed with the SEARCHED word
  const inCorpus = hasQuotes(word);          // lives in the corpus at all
  if (n <= 0 && !inCorpus) return;           // no signal → no mark

  el.classList.add("rf-has-lyrics");

  // Two tiers (Option A). The OLD exact/inflected size split is retired —
  // inflected forms (heart/hearts) are now their own candidates with their
  // own counts, so that sub-signal is redundant. The dot's axis now carries
  // the meaningful distinction:
  //   · hollow ring, no count  → "this word lives in lyrics" (ambient — keeps
  //                               the page full of dots)
  //   · filled dot + count     → "actually rhymed with the searched word"
  //                               (attested precedent, the honest pair count)
  const attested = n > 0;
  const badge = document.createElement("span");
  badge.className = attested ? "rf-lyric-badge" : "rf-lyric-badge rf-lyric-badge--corpus";
  const count = document.createElement("span");
  count.className = "rf-lyric-badge-count";
  // attested → times rhymed WITH the searched word (vermilion, loud);
  // in-corpus → the word's OWN line-end uses (faded) — its corpus presence.
  if (attested) {
    count.textContent = String(n);
  } else {
    const c = getCounts(word);
    count.textContent = String(c?.rhymed || c?.appearances || "");
  }
  badge.appendChild(count);
  el.appendChild(badge);

  // Lightweight popover scaffold — empty until first interaction.
  // Most candidates are never opened, so building the full quote /
  // stanza / footer markup upfront for every word costs DOM size and
  // layout time we don't need to spend. The CSS reveal rules still
  // work on this empty shell (it's a no-op visually); we materialise
  // its contents lazily on the first hover/focus/click.
  const pop = document.createElement("div");
  pop.className = "rf-lyric-pop";
  // Mobile bottom-sheet drag handle. Hidden on desktop via CSS. Only this
  // element grabs the dismiss gesture — touches in the content area below
  // pass through to the pop's native overflow-scroll.
  const handle = document.createElement("div");
  handle.className = "rf-lyric-pop-handle";
  handle.setAttribute("aria-hidden", "true");
  pop.appendChild(handle);
  el.appendChild(pop);

  let materialised = false;
  let page = 0, shown = 0, loading = false;

  // "Opened" = the popover was actually shown (hover settled, pinned, or
  // keyboard-focused) — NOT materialise, which fires on any pointerenter
  // including fast pass-throughs. Desktop hover produces no click, so
  // autocapture never sees this; it's the funnel step between
  // search_submitted and lyric_load_more. Once per word per render.
  let openReported = false;
  const reportOpen = (openVia) => {
    if (openReported) return;
    openReported = true;
    track("popover_opened", { source: sourceWord, word, attested, via: openVia });
  };
  const materialise = async () => {
    if (materialised) return;
    materialised = true;
    const list = document.createElement("div");
    list.className = "rf-lyric-list";
    const append = (quotes) => {
      for (const q of quotes) { list.appendChild(renderEndQuote(q, word)); shown += 1; }
    };

    // Ambient (in corpus, but not rhymed with the source): show the word's
    // OWN usage — how it rhymes generally. Honest inspiration, framed as the
    // word's own (the couplets show word↔its-partners, never the source).
    if (!attested) {
      const own = await getQuotes(word);
      const c = getCounts(word);
      pop.appendChild(renderPairHeader(word, c?.rhymed ?? own.length, own));
      pop.appendChild(list);
      append(own.slice(0, PAGE_SIZE));
      if (own.length > PAGE_SIZE)
        pop.appendChild(renderToggleMore(own.slice(PAGE_SIZE), (q) => renderEndQuote(q, word), list));
      addStandaloneToggle(pop, word);
      return;
    }

    // First page = tier-1 (≤5, artist-diverse, favorites first). The rhyme
    // couplet is line + partner.line; click a quote to expand its stanza.
    const first = await getPairQuotes(sourceWord, word, 0, PAGE_SIZE);
    pop.appendChild(renderPairHeader(word, n, first.quotes));
    pop.appendChild(list);
    append(first.quotes);

    if (first.hasMore) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "rf-lyric-more";
      more.textContent = `show ${Math.min(PAGE_SIZE, n - shown)} more`;
      more.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (loading) return;
        loading = true;
        page += 1;
        const next = await getPairQuotes(sourceWord, word, page, PAGE_SIZE); // pulls tier-2 lazily
        append(next.quotes);
        loading = false;
        track("lyric_load_more", { source: sourceWord, word, shown, total: n });
        if (next.hasMore) { more.textContent = `show ${Math.min(PAGE_SIZE, n - shown)} more`; ensureBottomVisible(more); }
        else more.remove();
      });
      bindMobileTapFeedback(more);
      pop.appendChild(more);
    }
    addStandaloneToggle(pop, word);
  };
  // pointerenter covers desktop hover; focusin covers keyboard tabbing
  // into the pop (the pin button inside is focusable); click covers
  // the touch path before setPin fires.
  el.addEventListener("pointerenter", materialise, { once: true });
  el.addEventListener("focusin", materialise, { once: true });
  el.addEventListener("click", materialise);

  // Hover-intent: don't reveal the moment the cursor touches the word — a
  // pointer crossing the dense candidate grid would trail a comet of
  // popovers. Sample pointer velocity (jQuery-hoverIntent style) and only
  // add .rf-hovering once the cursor has *slowed* over this word: a fast
  // pass-through never settles, a deliberate pause opens in ~one sample.
  // Keyboard (:focus-within) and click (.rf-pinned) bypass this entirely.
  if (matchMedia("(hover: hover)").matches) {
    const SETTLE_PX = 6;   // movement under this between samples = settled
    const SAMPLE_MS = 100;
    let timer = null, pX = 0, pY = 0, cX = 0, cY = 0;
    const track = (e) => { cX = e.clientX; cY = e.clientY; };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
      el.removeEventListener("pointermove", track);
    };
    el.addEventListener("pointerenter", (e) => {
      pX = cX = e.clientX; pY = cY = e.clientY;
      el.addEventListener("pointermove", track);
      timer = setInterval(() => {
        if (!el.isConnected) { stop(); return; }  // word re-rendered mid-hover
        const moved = Math.hypot(cX - pX, cY - pY);
        pX = cX; pY = cY;
        if (moved < SETTLE_PX) { stop(); el.classList.add("rf-hovering"); reportOpen("hover"); }
      }, SAMPLE_MS);
    });
    el.addEventListener("pointerleave", () => {
      stop();
      el.classList.remove("rf-hovering");
    });
  }

  // Click on the word still pins (the header pin glyph is additive —
  // both paths set `.rf-pinned`). Clicks landing inside the popover are
  // ignored so quote/stanza interactions don't toggle pin state.
  el.addEventListener("click", (e) => {
    if (e.target.closest(".rf-lyric-pop")) return;
    e.stopPropagation();
    const on = !el.classList.contains("rf-pinned");
    setPin(el, on);
    if (on) reportOpen("tap");
  });
  // Keyboard path: tabbing into the word (or its pin) shows the popover
  // via :focus-within with no hover/click involved.
  el.addEventListener("focusin", () => reportOpen("focus"), { once: true });
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
    // Click that came from a finger gesture that moved (= scroll, not
    // tap) shouldn't dismiss. iOS sometimes still synthesizes a click
    // after a scroll if movement was modest.
    if (touchMoved) return;
    unpinAll();
  });

  // Tap-vs-scroll detection. iOS doesn't expose a "this was a tap" event,
  // so we track movement during the touch sequence and only treat
  // touchend as a tap-dismiss if the finger barely moved. Without this,
  // any swipe / scroll on the main page would dismiss the popover when
  // the finger happens to lift over an empty area.
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchMoved = false;
    }
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (touchMoved || e.touches.length !== 1) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartX);
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    if (dx > 10 || dy > 10) touchMoved = true;
  }, { passive: true });

  // iOS Safari often skips a synthetic `click` for taps on non-interactive
  // elements (the bare main-page padding / empty grid space). Mirror the
  // dismiss on touchend so a tap on empty main-page area closes the
  // popover even when no click follows. Skip when the tap is inside the
  // popover (so quote interactions stay), on a word (its own click
  // handler does the replace), or when the finger actually moved (the
  // user was scrolling, not tapping).
  document.addEventListener("touchend", (e) => {
    if (!document.documentElement.classList.contains("rf-sheet-open")) return;
    if (e.target.closest(".rf-lyric-pop")) return;
    if (e.target.closest(".rf-word")) return;
    if (touchMoved) return;
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
  if (pinned) attachSheetSwipeDismiss(wordEl);
}

// Mobile bottom-sheet dismiss-on-swipe-down. The pop is `position: fixed`
// at the screen bottom on touch viewports (see styles.css media block);
// users expect to drag it away, but until now scrolling was locked and
// nothing handled the gesture. Track touchstart on the pop, follow the
// finger when the user pulls down past the pop's own scrollTop=0, and
// close past a threshold.
function attachSheetSwipeDismiss(wordEl) {
  const pop = wordEl.querySelector(".rf-lyric-pop");
  const handle = pop?.querySelector(".rf-lyric-pop-handle");
  if (!pop || !handle || handle.dataset.swipeBound === "1") return;
  // Only bind on touch-capable narrow viewports — desktop pop is anchored
  // to the word and doesn't behave like a sheet.
  if (!matchMedia("(hover: none) and (max-width: 720px)").matches) return;
  handle.dataset.swipeBound = "1";

  let startY = 0;
  let dy = 0;
  let dragging = false;
  const DISMISS_AT = 80;

  const onStart = (e) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    dy = 0;
    dragging = true;
    pop.style.transition = "none";
  };
  const onMove = (e) => {
    if (!dragging || e.touches.length !== 1) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) {
      pop.style.transform = "";
      return;
    }
    e.preventDefault();
    pop.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    pop.style.transition = "";
    if (dragging && dy > DISMISS_AT) {
      pop.style.transform = `translateY(100%)`;
      // Two-step dismantle to prevent the flicker we used to get from
      // clearing the inline transform while .rf-pinned was still set —
      // the pop animated back to translateY(0) for one frame before
      // the fade-out kicked in. Now: slide off (160ms transform), then
      // remove the class (which fades opacity 1→0 over 160ms while
      // pop sits at translateY(100%)), then once visibility:hidden has
      // landed, clear the inline transform so the next open is clean.
      setTimeout(() => {
        if (!wordEl.classList.contains("rf-pinned")) {
          pop.style.transform = "";
          return;
        }
        wordEl.classList.remove("rf-pinned");
        document.documentElement.classList.remove("rf-sheet-open");
        setTimeout(() => {
          if (!wordEl.classList.contains("rf-pinned")) pop.style.transform = "";
        }, 240);
      }, 180);
    } else {
      pop.style.transform = "";
    }
    dragging = false;
    dy = 0;
  };

  // Bind on the handle only — touches inside the content scroll natively
  // and never reach this listener.
  handle.addEventListener("touchstart", onStart, { passive: true });
  handle.addEventListener("touchmove", onMove, { passive: false });
  handle.addEventListener("touchend", onEnd, { passive: true });
  handle.addEventListener("touchcancel", onEnd, { passive: true });

  // overscroll-behavior:contain handles scroll-chaining when the pop has
  // scrollable content, but when the content is shorter than 50vh there
  // is no scroll container to "contain" — iOS then pans the body
  // underneath. Block touchmove on the pop in that case.
  pop.addEventListener("touchmove", (e) => {
    if (pop.scrollHeight <= pop.clientHeight) e.preventDefault();
  }, { passive: false });
}

// Header strip: word · "N line-end · M artists" · pin glyph. No close ×,
// no summary line, no hover-hint copy — 1.7 is deliberately spare.
// Header for the pair-relative popover: candidate word + honest pair total
// (sourceWord ↔ word songs) + a sample of the artists. Distinct from the
// legacy renderPopHeader (which counted the word's global line-ends).
// The number here always equals the badge count on the word, so the
// header is what tells the reader what that number means: "in 9 songs by
// 4 artists" — the songs whose lyrics back this popover. Same format for
// attested (rhymed with the searched word; the couplets below make that
// plain) and ambient (the word's own line-end uses).
function renderPairHeader(word, total, sampleQuotes) {
  const head = document.createElement("header");
  head.className = "rf-lyric-head";

  const w = document.createElement("div");
  w.className = "rf-lyric-head-word";
  w.textContent = word;
  head.appendChild(w);

  const meta = document.createElement("div");
  meta.className = "rf-lyric-head-meta";
  const artists = new Set(sampleQuotes.map((q) => q.credit || q.artist)).size;
  const plus = total > sampleQuotes.length ? "+" : "";
  const songs = `${total} song${total === 1 ? "" : "s"}`;
  const by = `${artists}${plus} artist${artists === 1 ? "" : "s"}`;
  meta.textContent = `in ${songs} by ${by}`;
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
    if (wordEl) setPin(wordEl, !wordEl.classList.contains("rf-pinned"));
  });
  bindMobileTapFeedback(pin);
  head.appendChild(pin);

  return head;
}

// Collapsed "+ N standalone uses" control — the not-rhymed / inspiration
// layer. OFF by default; lazily fetches getNotRhymed on first expand. Shows
// the word used at line-end with NO rhyme partner ("how others use this word",
// not a rhyme). Appended to the bottom of a word popover. PostHog-tracked so
// we can see how often people open it.
function addStandaloneToggle(pop, word) {
  const c = getCounts(word);
  const nAlone = c?.notRhymed ?? 0;
  if (nAlone <= 0) return;
  const wrap = document.createElement("div");
  wrap.className = "rf-lyric-standalone";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "rf-lyric-standalone-toggle";
  const collapsed = `+ ${nAlone} standalone use${nAlone === 1 ? "" : "s"}`;
  toggle.textContent = collapsed;
  const list = document.createElement("div");
  list.className = "rf-lyric-standalone-list";
  list.hidden = true;
  let loaded = false;
  toggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    const opening = list.hidden;
    if (opening && !loaded) {
      loaded = true;
      const alone = await getNotRhymed(word);
      for (const q of alone.slice(0, 24)) list.appendChild(renderEndQuote(q, word));
      track("lyric_standalone_open", { word, count: nAlone });
    }
    list.hidden = !opening;
    toggle.textContent = opening ? "− hide standalone uses" : collapsed;
    if (opening) ensureBottomVisible(toggle);
  });
  bindMobileTapFeedback(toggle);
  wrap.appendChild(toggle);
  wrap.appendChild(list);
  pop.appendChild(wrap);
}

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
  bindMobileTapFeedback(pin);
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
  const expand = (build) => {
    quote.addEventListener("click", (e) => {
      e.stopPropagation();
      const opened = item.classList.toggle("is-open");
      if (opened) ensureBottomVisible(item);
    });
    bindMobileTapFeedback(quote);
    item.appendChild(quote);
    item.appendChild(build());
  };
  if (Array.isArray(q.stanza) && q.stanza.length) {
    expand(() => renderStanza(q));            // full verse
  } else if (q.linePrev || q.lineNext) {
    expand(() => renderContext(q));           // giant-stanza fallback → ±1 context
  } else {
    quote.style.cursor = "default";           // truly no context
    item.appendChild(quote);
  }
  return item;
}

// Mobile press handling for `.rf-lyric-quote`. Goal: gesture-aware
// feedback that follows the finger 1:1.
//   • touchstart: nothing visible. Start a 300ms long-press timer.
//   • touchmove (>10px): scroll detected — cancel; on lift, no
//     highlight, no click.
//   • timer fires (≥300ms with no lift): treated as press-and-hold —
//     cancel; on lift, no highlight, no click.
//   • clean lift before timer: real tap. Briefly paint a 120ms
//     highlight as completion feedback, then let the native click fire
//     to toggle the stanza.
// Long-press / scroll cancellation calls preventDefault on touchend,
// which suppresses the synthesized click — so the existing click
// handler doesn't need its own guard.
function bindMobileTapFeedback(quote) {
  // Mobile-only — desktop relies on :hover for feedback and the
  // synthetic-click suppression isn't useful with a mouse. Bail out
  // early on hover-capable / non-narrow viewports so the listeners
  // never attach.
  if (!matchMedia("(hover: none) and (max-width: 720px)").matches) return;
  let startX = 0;
  let startY = 0;
  let cancelled = false;
  let pressTimer = null;

  const cancel = () => {
    cancelled = true;
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };

  quote.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    cancelled = false;
    pressTimer = setTimeout(() => { cancelled = true; pressTimer = null; }, 300);
  }, { passive: true });

  quote.addEventListener("touchmove", (e) => {
    if (cancelled || e.touches.length !== 1) return;
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > 6 || dy > 6) cancel();
  }, { passive: true });

  quote.addEventListener("touchend", (e) => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    // Belt-and-braces: even if touchmove didn't fire enough (iOS can
    // suppress it during native scroll), compare the final touch
    // position to the start position. If the finger moved at all,
    // treat it as a scroll.
    if (!cancelled) {
      const t = e.changedTouches[0];
      if (t) {
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (dx > 6 || dy > 6) cancelled = true;
      }
    }
    if (cancelled) {
      // Suppress the synthetic click — the gesture wasn't a tap.
      e.preventDefault();
      return;
    }
    quote.classList.add("rf-tapped");
    setTimeout(() => quote.classList.remove("rf-tapped"), 120);
  }, { passive: false });

  quote.addEventListener("touchcancel", cancel, { passive: true });
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

// Fallback context for quotes with NO full stanza (giant blank-line-less songs
// store only ±1 line). Renders linePrev / matched line / lineNext so clicking
// still reveals local context instead of nothing.
function renderContext(q) {
  const wrap = document.createElement("div");
  wrap.className = "rf-lyric-stanza";
  const rows = [];
  if (q.linePrev) rows.push([q.linePrev, false]);
  rows.push([q.line, true]);
  if (q.lineNext) rows.push([q.lineNext, false]);
  for (const [text, isMatch] of rows) {
    const p = document.createElement("p");
    p.className = "rf-lyric-stanza-line";
    if (isMatch) { p.classList.add("is-match"); p.innerHTML = highlightSurface(text, q.surface); }
    else p.textContent = text;
    wrap.appendChild(p);
  }
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
  // Same gesture-aware tap handling as the quote rows: scroll across
  // the head shouldn't paint or toggle. Bound on the head (the visible
  // tappable strip) — list items have their own bindings.
  bindMobileTapFeedback(head);
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
    bindMobileTapFeedback(row);
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
  bindMobileTapFeedback(btn);
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

// ── Corpus gallery (In the corpus tab) ────────────────────────────
// Three-card strip: left/right side cards are adjacent partner words,
// center card is the active rhyme pair (couplet + meta + collapsed
// stanza). Horizontal click/arrow/swipe switches partner; vertical
// wheel/arrow/swipe switches song within the partner. Click center
// to unfurl the surrounding stanza in place. See
// design_handoff_corpus_gallery/README.md for the full design spec.

function groupPairQuotes(quotes) {
  // Keep only line-end quotes that have a partner — the gallery's whole
  // shape (couplet, partner mark) presumes both lines exist.
  const ends = quotes.filter(
    (q) => (q.position ?? q.wordPos) === "end" && q.partner && q.partner.word
  );
  const map = new Map();
  for (const q of ends) {
    const key = q.partner.word.toLowerCase();
    if (!map.has(key)) map.set(key, { partner: key, instances: [] });
    map.get(key).instances.push(q);
  }
  const groups = [...map.values()];
  // Within each group: sort by author alpha (per the spec — the user
  // said author > year for the within-pair browse order).
  for (const g of groups) {
    g.instances.sort((a, b) => {
      const ac = (a.credit || a.artist || "").toLowerCase();
      const bc = (b.credit || b.artist || "").toLowerCase();
      return ac.localeCompare(bc);
    });
  }
  // Across groups: most-cited first; ties broken alpha.
  groups.sort(
    (a, b) =>
      b.instances.length - a.instances.length ||
      a.partner.localeCompare(b.partner)
  );
  return groups;
}

// Vermilion gradient "marker" highlight — the signature treatment for
// the partner word in the couplet. Renders as a 0.32em vermilion band
// sitting below the lowercase x-height of the partner word.
function markCoupletPartner(line, word) {
  if (!word) return escapeHtml(line);
  const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${safe}(?:['’]\\w{0,3})?\\b`, "gi");
  return escapeHtml(line).replace(re, "<mark>$&</mark>");
}

// Bare <mark> for the source word in line B of the couplet — styled
// vermilion bold via .cd-hero-couplet .b mark, no background band so
// it doesn't compete with the partner marker.
function markCoupletSource(line, word) {
  return markCoupletPartner(line, word); // same wrap, different style scope
}

async function renderCorpusGallery(word) {
  const mount = document.getElementById("corpus-gallery");
  if (!mount) return;
  mount.innerHTML = "";

  const quotes = await getQuotes(word);
  const groups = groupPairQuotes(quotes);
  // groupPairQuotes only sees tier-1 (≤5 instances/pair). Attach the TRUE
  // total per pair from the cached source bucket so the UI shows the real
  // count; the rest (tier-2) pages in lazily as the user advances songs.
  for (const g of groups) g.total = pairCount(word, g.partner) || g.instances.length;

  if (!groups.length) {
    mount.innerHTML =
      `<p class="cd-prim-empty">No paired line-end uses for <em>${escapeHtml(word)}</em> in songs yet — try the dictionary tab.</p>`;
    return;
  }

  // Lazily grow g.instances up to index `idx` (capped at g.total) by paging
  // tier-2. PAGE_SIZE-aligned with the build + getPairQuotes.
  async function loadUpTo(g, idx) {
    const want = Math.min(idx + 1, g.total);
    let guard = 0;
    while (g.instances.length < want && guard++ < 40) {
      const page = Math.floor(g.instances.length / PAGE_SIZE);
      const r = await getPairQuotes(word, g.partner, page, PAGE_SIZE);
      const start = g.instances.length - page * PAGE_SIZE;
      let added = 0;
      for (let i = start; i < r.quotes.length; i++) { g.instances.push(r.quotes[i]); added += 1; }
      if (added === 0 || !r.hasMore) break;
    }
  }

  // Pair-cue separator is the em-dash variant by default (per the spec).
  document.documentElement.setAttribute("data-tweak-sep", "dash");

  // ── State ────────────────────────────────────────────────────
  let pIdx = 0; // start at the most-cited partner
  let iIdx = 0;
  let stanzaOpen = false;
  let wheelLock = false;

  // ── Render fragments ─────────────────────────────────────────
  const sideCardHTML = (g, dir) => {
    if (!g) {
      return `<div class="cd-strip-card cd-strip-card--side cd-strip-card--empty cd-strip-card--${dir}" aria-hidden="true"></div>`;
    }
    const arrow = dir === "prev" ? "‹" : "›";
    return (
      `<button type="button" class="cd-strip-card cd-strip-card--side cd-strip-card--${dir}" ` +
      `data-step="${dir === "prev" ? -1 : 1}" ` +
      `aria-label="${dir === "prev" ? "previous" : "next"} pair · ${escapeHtml(g.partner)}">` +
      (dir === "prev" ? `<span class="cd-strip-card-arrow">${arrow}</span>` : "") +
      `<span class="cd-strip-card-word"><em>${escapeHtml(g.partner)}</em></span>` +
      (dir === "next" ? `<span class="cd-strip-card-arrow">${arrow}</span>` : "") +
      `</button>`
    );
  };

  const paircueHTML = () => {
    const g = groups[pIdx];
    return (
      `<div class="cd-paircue">` +
      `<span class="cd-paircue-item cd-paircue-item--current" ` +
      `title="${escapeHtml(word)} · ${escapeHtml(g.partner)} — ${g.total} song${g.total === 1 ? "" : "s"}">` +
      `<span class="cd-paircue-pair">` +
      `<em class="src">${escapeHtml(word)}</em>` +
      `<span class="cd-pair-sep" aria-hidden="true"></span>` +
      `<em class="prt">${escapeHtml(g.partner)}</em>` +
      `<span class="cd-pair-dot" aria-hidden="true">·</span>` +
      `<span class="cd-pair-count">${g.total}</span>` +
      `</span>` +
      `</span>` +
      `<span class="cd-paircue-pos">PAIR <b>${pIdx + 1}</b><span class="sl">/</span><b>${groups.length}</b></span>` +
      `</div>`
    );
  };

  const centerCardHTML = () => {
    const g = groups[pIdx];
    const q = g.instances[iIdx];
    const matchIdx = Number.isInteger(q.stanzaLineIdx) ? q.stanzaLineIdx : -1;
    const partnerIdx =
      q.partner && Number.isInteger(q.partner.stanzaLineIdx)
        ? q.partner.stanzaLineIdx
        : -1;
    let stanza;
    if (Array.isArray(q.stanza) && q.stanza.length) {
      stanza = q.stanza
        .map((ln, j) => {
          if (j === matchIdx)
            return `<p class="match b">${markCoupletSource(ln, q.surface)}</p>`;
          if (j === partnerIdx && q.partner)
            return `<p class="match a">${markCoupletPartner(ln, q.partner.word)}</p>`;
          return `<p>${escapeHtml(ln)}</p>`;
        })
        .join("");
    } else {
      // Giant blank-line-less songs store no full stanza — only ±1 line
      // (see build-index.mjs). Fall back to linePrev / matched line /
      // lineNext so opening the card still reveals local context instead
      // of an empty panel.
      const rows = [];
      if (q.linePrev) rows.push(`<p>${escapeHtml(q.linePrev)}</p>`);
      rows.push(`<p class="match b">${markCoupletSource(q.line, q.surface)}</p>`);
      if (q.lineNext) rows.push(`<p>${escapeHtml(q.lineNext)}</p>`);
      stanza = rows.join("");
    }
    const songCue =
      g.total > 1
        ? `<span class="cd-strip-songcue">` +
          `<button type="button" class="cd-song-btn cd-song-btn--prev" aria-label="previous song">↑</button>` +
          `<span class="cd-song-pos">song <b>${iIdx + 1}</b> of <b>${g.total}</b></span>` +
          `<button type="button" class="cd-song-btn cd-song-btn--next" aria-label="next song">↓</button>` +
          `</span>`
        : "";
    const year = q.year ? `<span class="cd-hero-meta-year">${escapeHtml(String(q.year))}</span>` : "";
    const yearSep = q.year ? `<span class="cd-hero-meta-sep">·</span>` : "";
    return (
      `<article class="cd-strip-card cd-strip-card--center" data-open="${stanzaOpen}" tabindex="0">` +
      `<div class="cd-strip-center-inner">` +
      `<div class="cd-hero-couplet">` +
      `<p class="a">${markCoupletPartner(q.partner.line, q.partner.word)}</p>` +
      `<p class="b">${markCoupletSource(q.line, q.surface)}</p>` +
      `</div>` +
      `<div class="cd-hero-stanza">${stanza}</div>` +
      `<div class="cd-hero-meta">` +
      `<span class="cd-hero-meta-credit">${escapeHtml(q.credit || q.artist || "")}</span>` +
      `<span class="cd-hero-meta-sep">·</span>` +
      `<span class="cd-hero-meta-song">${escapeHtml(q.songTitle || q.song || "")}</span>` +
      yearSep +
      year +
      `</div>` +
      songCue +
      `</div>` +
      `</article>`
    );
  };

  const fullHTML = () => {
    const prev = pIdx > 0 ? groups[pIdx - 1] : null;
    const next = pIdx < groups.length - 1 ? groups[pIdx + 1] : null;
    return (
      `<section class="cd-prim">` +
      paircueHTML() +
      `<div class="cd-strip">` +
      sideCardHTML(prev, "prev") +
      centerCardHTML() +
      sideCardHTML(next, "next") +
      `</div>` +
      `<div class="cd-prim-footer">` +
      `<a class="cd-prim-explore" href="#">explore all <b>${groups.length}</b> partners ↗</a>` +
      `</div>` +
      `</section>`
    );
  };

  // ── Mutators ──────────────────────────────────────────────────
  function rerender() {
    mount.innerHTML = fullHTML();
    bind();
  }
  function rerenderCenterOnly() {
    const old = mount.querySelector(".cd-strip-card--center");
    if (!old) return rerender();
    const tmp = document.createElement("template");
    tmp.innerHTML = centerCardHTML();
    old.replaceWith(tmp.content.firstElementChild);
    bindCenter();
  }

  function setPair(newP) {
    newP = Math.max(0, Math.min(groups.length - 1, newP));
    if (newP === pIdx) return;
    const dir = newP > pIdx ? "next" : "prev";
    pIdx = newP;
    iIdx = 0;
    stanzaOpen = false;
    rerender();
    const strip = mount.querySelector(".cd-strip");
    const paircue = mount.querySelector(".cd-paircue");
    [strip, paircue].forEach((el) => {
      if (!el) return;
      el.classList.add(`is-shifting-${dir}`);
      setTimeout(() => el.classList.remove(`is-shifting-${dir}`), 480);
    });
  }
  async function setInstance(newI) {
    const g = groups[pIdx];
    const mod = ((newI % g.total) + g.total) % g.total;
    if (mod === iIdx) return;
    await loadUpTo(g, mod);            // page in tier-2 if we advanced past what's loaded
    if (groups[pIdx] !== g) return;    // pair changed during the await — bail
    iIdx = Math.min(mod, g.instances.length - 1);
    stanzaOpen = false;
    rerenderCenterOnly();
    const center = mount.querySelector(".cd-strip-card--center");
    if (center) {
      center.classList.add("is-instance-changed");
      setTimeout(() => center.classList.remove("is-instance-changed"), 260);
    }
  }

  // ── Bindings ──────────────────────────────────────────────────
  function bindCenter() {
    const center = mount.querySelector(".cd-strip-card--center");
    if (!center) return;
    center.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      stanzaOpen = !stanzaOpen;
      center.setAttribute("data-open", String(stanzaOpen));
    });
    center.addEventListener(
      "wheel",
      (e) => {
        const g = groups[pIdx];
        if (g.instances.length < 2) return;
        if (Math.abs(e.deltaY) < 5) return;
        e.preventDefault();
        if (wheelLock) return;
        wheelLock = true;
        setTimeout(() => {
          wheelLock = false;
        }, 220);
        setInstance(iIdx + (e.deltaY > 0 ? 1 : -1));
      },
      { passive: false }
    );
    center.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setInstance(iIdx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setInstance(iIdx - 1);
      } else if (e.key === "ArrowLeft" && pIdx > 0) {
        e.preventDefault();
        setPair(pIdx - 1);
      } else if (e.key === "ArrowRight" && pIdx < groups.length - 1) {
        e.preventDefault();
        setPair(pIdx + 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        stanzaOpen = !stanzaOpen;
        center.setAttribute("data-open", String(stanzaOpen));
      }
    });
    // Touch swipe — horizontal = pair, vertical = song. 36px threshold.
    let touchStart = null;
    center.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
      },
      { passive: true }
    );
    center.addEventListener(
      "touchend",
      (e) => {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        const dt = Date.now() - touchStart.t;
        touchStart = null;
        if (dt > 600) return;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (Math.max(ax, ay) < 36) return;
        if (ax > ay) {
          if (dx < 0 && pIdx < groups.length - 1) setPair(pIdx + 1);
          else if (dx > 0 && pIdx > 0) setPair(pIdx - 1);
        } else {
          const g = groups[pIdx];
          if (g.instances.length < 2) return;
          if (dy < 0) setInstance(iIdx + 1);
          else setInstance(iIdx - 1);
        }
      },
      { passive: true }
    );
    center.querySelectorAll(".cd-song-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const step = btn.classList.contains("cd-song-btn--next") ? 1 : -1;
        setInstance(iIdx + step);
      });
    });
  }

  function bind() {
    mount.querySelectorAll(".cd-strip-card--side").forEach((card) => {
      if (card.classList.contains("cd-strip-card--empty")) return;
      card.addEventListener("click", () => {
        setPair(pIdx + (Number(card.dataset.step) || 0));
      });
    });
    // Footer "explore all N" — opens the full corpus view (Atlas).
    const explore = mount.querySelector(".cd-prim-explore");
    if (explore)
      explore.addEventListener("click", (e) => {
        e.preventDefault();
        renderCorpusExplore(word);
      });
    bindCenter();
  }

  rerender();
}

// ── "Explore all partners" — full corpus view (Atlas) ─────────────
// Reached from the gallery footer link. Swaps the 3-card strip in
// #corpus-gallery for an overview-then-detail layout: a frequency
// strip naming every partner word (sized by corpus recurrence) over a
// list of collapsible groups. Ported from briefs/demo-c-atlas.html;
// rationale in briefs/corpus-section-redesign.md.
const EXPLORE_INITIAL_BATCH = 5;
const EXPLORE_NEXT_BATCH = 10;

// Highlight the matched word in a line with an explore-view mark.
// Mirrors markCoupletPartner's regex but emits the class span the
// Atlas CSS expects (source vs partner get different treatments).
function exploreMark(line, word, cls) {
  if (!word) return escapeHtml(line);
  const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${safe}(?:['’]\\w{0,3})?\\b`, "gi");
  return escapeHtml(line).replace(re, `<span class="${cls}">$&</span>`);
}

async function renderCorpusExplore(word) {
  const mount = document.getElementById("corpus-gallery");
  if (!mount) return;

  const quotes = await getQuotes(word);
  const groups = groupPairQuotes(quotes);

  // "Explore all" wants completeness, so page in the FULL set per pair
  // (tier-2 included) — getQuotes only returns the tier-1 preview (≤5). Only
  // pairs with >5 songs actually fetch; the rest are already complete.
  await Promise.all(
    groups.map(async (g) => {
      const total = pairCount(word, g.partner) || g.instances.length;
      let page = 1;
      while (g.instances.length < total && page < 80) {
        const r = await getPairQuotes(word, g.partner, page, PAGE_SIZE);
        for (const q of r.quotes) g.instances.push(q);
        if (!r.hasMore) break;
        page += 1;
      }
    })
  );

  // Within each group, oldest-first (genealogy reads influence-forward);
  // alpha-by-author when a year is missing. groupPairQuotes returns a
  // fresh array each call, so this sort doesn't disturb the gallery.
  const yearOf = (q) => {
    const y = Number(q.year);
    return Number.isFinite(y) ? y : Infinity;
  };
  for (const g of groups) {
    g.instances.sort(
      (a, b) =>
        yearOf(a) - yearOf(b) ||
        (a.credit || a.artist || "").localeCompare(b.credit || b.artist || "")
    );
  }

  const backHTML = `<button type="button" class="cd-explore-back">back to browse</button>`;

  if (!groups.length) {
    mount.innerHTML =
      `<section class="cd-explore">${backHTML}` +
      `<p class="cd-prim-empty">No paired line-end uses for <em>${escapeHtml(word)}</em> in songs yet.</p>` +
      `</section>`;
    mount
      .querySelector(".cd-explore-back")
      ?.addEventListener("click", () => renderCorpusGallery(word));
    return;
  }

  const songs = groups.reduce((s, g) => s + g.instances.length, 0);
  const writers = new Set();
  for (const g of groups)
    for (const q of g.instances)
      writers.add((q.credit || q.artist || "").toLowerCase());

  // Frequency tiers for the atlas strip — log-ish buckets so the visual
  // size hierarchy reads at a glance (clichés big, gems small).
  const maxCount = Math.max(...groups.map((g) => g.instances.length), 1);
  const tierOf = (n) => {
    const r = n / maxCount;
    if (r > 0.66) return 1;
    if (r > 0.33) return 2;
    if (r > 0.15) return 3;
    if (r > 0.05) return 4;
    return 5;
  };

  const metaCell = (num, lbl) =>
    `<div class="cd-explore-meta-cell"><div class="cd-explore-meta-num">${num}</div><div class="cd-explore-meta-lbl">${lbl}</div></div>`;

  const atlasHTML = groups
    .map(
      (g, i) =>
        `<button type="button" class="cd-explore-atlas-item tier-${tierOf(g.instances.length)}" data-gi="${i}">` +
        `<span class="cd-explore-atlas-word">${escapeHtml(g.partner)}</span>` +
        `<span class="cd-explore-atlas-count">${g.instances.length}</span>` +
        `</button>`
    )
    .join("");

  const instanceHTML = (q) => {
    const hasStanza = Array.isArray(q.stanza) && q.stanza.length;
    const matchIdx = Number.isInteger(q.stanzaLineIdx) ? q.stanzaLineIdx : -1;
    const partnerIdx =
      q.partner && Number.isInteger(q.partner.stanzaLineIdx)
        ? q.partner.stanzaLineIdx
        : -1;
    const stanza = hasStanza
      ? `<div class="cd-explore-stanza">` +
        q.stanza
          .map((s, j) => {
            if (j === partnerIdx && q.partner)
              return `<p class="is-match">${exploreMark(s, q.partner.word, "cd-explore-mark-partner")}</p>`;
            if (j === matchIdx)
              return `<p class="is-match">${exploreMark(s, q.surface, "cd-explore-mark-source")}</p>`;
            return `<p>${escapeHtml(s)}</p>`;
          })
          .join("") +
        `</div>`
      : "";
    const year = q.year ? ` · ${escapeHtml(String(q.year))}` : "";
    const partnerLine = q.partner
      ? exploreMark(q.partner.line, q.partner.word, "cd-explore-mark-partner")
      : "";
    return (
      `<li class="cd-explore-instance${hasStanza ? "" : " no-stanza"}" tabindex="0">` +
      `<div class="cd-explore-glyph" aria-hidden="true">&ldquo;</div>` +
      `<div class="cd-explore-pair">` +
      `<p class="cd-explore-a">${partnerLine}</p>` +
      `<p class="cd-explore-b">${exploreMark(q.line, q.surface, "cd-explore-mark-source")}</p>` +
      `</div>` +
      `<div class="cd-explore-attr">` +
      `<span>${escapeHtml(q.credit || q.artist || "")}</span>` +
      `<em>${escapeHtml(q.songTitle || q.song || "")}${year}</em>` +
      `</div>` +
      stanza +
      `</li>`
    );
  };

  const groupHTML = (g, i) => {
    const open = i < 2;
    const shown = open ? Math.min(EXPLORE_INITIAL_BATCH, g.instances.length) : 0;
    const remaining = g.instances.length - shown;
    return (
      `<li class="cd-explore-group${open ? " is-open" : ""}" data-gi="${i}" data-shown="${shown}">` +
      `<div class="cd-explore-group-head${open ? " is-open" : ""}" role="button" tabindex="0" aria-expanded="${open}">` +
      `<span class="cd-explore-group-partner">${escapeHtml(g.partner)}</span>` +
      `<span class="cd-explore-group-count"><b>${g.instances.length}</b> ${g.instances.length === 1 ? "song" : "songs"}</span>` +
      `<span class="cd-explore-group-toggle">${open ? "−" : "+"}</span>` +
      `</div>` +
      `<div class="cd-explore-group-body">` +
      `<ul class="cd-explore-instances" style="list-style:none;margin:0;padding:0;">` +
      g.instances.slice(0, shown).map(instanceHTML).join("") +
      `</ul>` +
      `<button type="button" class="cd-explore-more"${remaining > 0 ? "" : " hidden"}>Show ${Math.min(EXPLORE_NEXT_BATCH, remaining)} more</button>` +
      `</div>` +
      `</li>`
    );
  };

  mount.innerHTML =
    `<section class="cd-explore">` +
    backHTML +
    `<header class="cd-explore-head">` +
    `<div>` +
    `<div class="cd-explore-eyebrow">In songs</div>` +
    `<h2 class="cd-explore-title">How songwriters rhyme <em>${escapeHtml(word)}</em></h2>` +
    `</div>` +
    `<div class="cd-explore-meta">` +
    metaCell(groups.length, groups.length === 1 ? "Partner" : "Partners") +
    metaCell(songs, songs === 1 ? "Song" : "Songs") +
    metaCell(writers.size, writers.size === 1 ? "Writer" : "Writers") +
    `</div>` +
    `</header>` +
    `<nav class="cd-explore-atlas" aria-label="Partner-word atlas">` +
    `<div class="cd-explore-atlas-label">All partner words, sized by frequency · click to jump</div>` +
    `<div class="cd-explore-atlas-row">${atlasHTML}</div>` +
    `</nav>` +
    `<ul class="cd-explore-groups">${groups.map(groupHTML).join("")}</ul>` +
    `</section>`;

  // ── Bindings ───────────────────────────────────────────────────
  const section = mount.querySelector(".cd-explore");
  const groupEls = [...section.querySelectorAll(".cd-explore-group")];

  section
    .querySelector(".cd-explore-back")
    .addEventListener("click", () => renderCorpusGallery(word));

  const refreshAtlas = () => {
    section.querySelectorAll(".cd-explore-atlas-item").forEach((item) => {
      const isOpen = groupEls[Number(item.dataset.gi)]?.classList.contains("is-open");
      item.classList.toggle("is-active", !!isOpen);
    });
  };

  const fillGroup = (li) => {
    const g = groups[Number(li.dataset.gi)];
    const shown = Number(li.dataset.shown) || 0;
    li.querySelector(".cd-explore-instances").innerHTML = g.instances
      .slice(0, shown)
      .map(instanceHTML)
      .join("");
    const btn = li.querySelector(".cd-explore-more");
    const remaining = g.instances.length - shown;
    if (remaining <= 0) btn.hidden = true;
    else {
      btn.hidden = false;
      btn.textContent = `Show ${Math.min(EXPLORE_NEXT_BATCH, remaining)} more`;
    }
  };

  const toggleGroup = (li, forceOpen) => {
    const head = li.querySelector(".cd-explore-group-head");
    const willOpen = forceOpen ?? !li.classList.contains("is-open");
    li.classList.toggle("is-open", willOpen);
    head.classList.toggle("is-open", willOpen);
    head.setAttribute("aria-expanded", String(willOpen));
    head.querySelector(".cd-explore-group-toggle").textContent = willOpen ? "−" : "+";
    if (willOpen) {
      let shown = Number(li.dataset.shown) || 0;
      if (shown === 0)
        shown = Math.min(EXPLORE_INITIAL_BATCH, groups[Number(li.dataset.gi)].instances.length);
      li.dataset.shown = shown;
      fillGroup(li);
    } else {
      li.dataset.shown = 0;
    }
    refreshAtlas();
  };

  section.querySelectorAll(".cd-explore-group-head").forEach((head) => {
    const li = head.closest(".cd-explore-group");
    head.addEventListener("click", () => toggleGroup(li));
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleGroup(li);
      }
    });
  });

  section.querySelectorAll(".cd-explore-atlas-item").forEach((item) => {
    item.addEventListener("click", () => {
      const li = groupEls[Number(item.dataset.gi)];
      if (!li) return;
      if (!li.classList.contains("is-open")) toggleGroup(li, true);
      li.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  section.querySelectorAll(".cd-explore-more").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const li = btn.closest(".cd-explore-group");
      const g = groups[Number(li.dataset.gi)];
      const shown = Math.min(
        (Number(li.dataset.shown) || 0) + EXPLORE_NEXT_BATCH,
        g.instances.length
      );
      li.dataset.shown = shown;
      fillGroup(li);
    });
  });

  // Stanza popout — click an instance row. Delegated on the section so
  // it survives the show-more re-render of the instances list.
  section.addEventListener("click", (e) => {
    const inst = e.target.closest(".cd-explore-instance");
    if (!inst || inst.classList.contains("no-stanza")) return;
    inst.classList.toggle("is-open");
  });

  refreshAtlas();
}

// ── Tabs (Rhyme dictionary / In the corpus) ───────────────────────
// Populates the tab counts, makes the tab chrome visible, and wires
// click/keyboard switching between bodies. Each tab is two lines:
// italic display title + mono counts. No peek (the active tab carries
// no chrome it doesn't need; the inactive one stays compact).
async function renderTabs(word, buckets) {
  const tabs = document.getElementById("cd-tabs");
  if (!tabs) return;
  tabs.hidden = false;

  // ── Dictionary counts ──
  let tierCount = 0;
  let wordCount = 0;
  for (const t of TYPE_ORDER) {
    const n = buckets[t]?.length ?? 0;
    if (n > 0) {
      tierCount += 1;
      wordCount += n;
    }
  }
  const dictCounts = tabs.querySelector('[data-counts="dict"]');
  if (dictCounts) {
    dictCounts.innerHTML = `<b>${wordCount}</b> rhyme${wordCount === 1 ? "" : "s"} in <b>${tierCount}</b> flavor${tierCount === 1 ? "" : "s"}`;
  }

  // ── Corpus counts ── from the index: the HONEST totals (rhymeWords +
  // rhymed appearances), not the display-capped getQuotes length.
  const c = getCounts(word);
  const partnerCount = c?.rhymeWords ?? 0;
  const songCount = c?.rhymed ?? 0;
  const corpusCounts = tabs.querySelector('[data-counts="corpus"]');
  if (corpusCounts) {
    corpusCounts.innerHTML = partnerCount
      ? `<b>${partnerCount}</b> pairing${partnerCount === 1 ? "" : "s"} in <b>${songCount}</b> song${songCount === 1 ? "" : "s"}`
      : `no pairings in songs yet`;
  }

  // ── Wire tab switching (idempotent — clones each button so a re-run
  // doesn't pile up listeners). Both the tab strip below the
  // source-summary AND the toggle in the sticky bar route through
  // setActiveTab() so they stay in sync. ──
  tabs.querySelectorAll(".cd-tab").forEach((btn) => {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
  });
  tabs.querySelectorAll(".cd-tab").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  // Re-apply the current state so the toggle, app data-attr, and tab
  // bodies all line up immediately after a fresh render.
  setActiveTab(currentActiveTab());
}

// ── Tab state — single source of truth ─────────────────────────────
// The tab strip (.cd-tab[role=tab]) and the bar toggle
// (.rf-toggle-cell) both call setActiveTab(); it flips
// aria-selected on both surfaces, shows/hides the right tab body,
// sets data-active-tab on .rf-app (drives the CSS that dims the
// jump+filter icons on the corpus tab), and slides the toggle's
// vermilion knob to the right cell.
function currentActiveTab() {
  const sel = document.querySelector('#cd-tabs .cd-tab[aria-selected="true"]');
  return sel?.dataset.tab || "dict";
}

function setActiveTab(target) {
  if (!target) return;
  document.querySelectorAll("#cd-tabs .cd-tab").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.tab === target));
  });
  document.querySelectorAll(".rf-toggle-cell").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.tab === target));
  });
  document.querySelectorAll(".rf-tab-body").forEach((body) => {
    body.hidden = body.dataset.tabBody !== target;
  });
  const toggle = document.getElementById("tab-toggle");
  if (toggle) toggle.dataset.state = target;
  const app = document.getElementById("app");
  if (app) app.dataset.activeTab = target;
  // Jump + filter only apply on dictionary; close any open drawer
  // when the user switches to corpus.
  if (target === "corpus") closeDrawers();
}

// Wire the toggle cells once on load — they reuse setActiveTab so
// every entry point flows through the same code.
document.querySelectorAll(".rf-toggle-cell").forEach((cell) => {
  cell.addEventListener("click", () => setActiveTab(cell.dataset.tab));
});

// ── Drawers (jump + filter) ────────────────────────────────────────
// Click the jump or filter icon to slide its drawer open below the
// sticky bar. Only one drawer open at a time. Click outside or press
// Esc to close. Close also fires when switching to the corpus tab
// (the tools don't apply there).
function closeDrawers() {
  document.querySelectorAll(".rf-drawer").forEach((d) => (d.hidden = true));
  document.querySelectorAll(".rf-iconbtn").forEach((b) => {
    b.setAttribute("aria-expanded", "false");
  });
}

function toggleDrawer(btn) {
  if (btn.getAttribute("aria-disabled") === "true") return;
  const id = btn.getAttribute("aria-controls");
  const drawer = id && document.getElementById(id);
  if (!drawer) return;
  const wasOpen = btn.getAttribute("aria-expanded") === "true";
  closeDrawers();
  if (!wasOpen) {
    drawer.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }
}

document.querySelectorAll(".rf-iconbtn[aria-controls]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDrawer(btn);
  });
});

document.querySelectorAll("[data-close-drawer]").forEach((btn) => {
  btn.addEventListener("click", closeDrawers);
});

// Outside click closes any open drawer — but a click inside the
// drawer or on the iconbtn that opened it shouldn't close.
document.addEventListener("click", (e) => {
  const onDrawer = e.target.closest(".rf-drawer");
  const onIconBtn = e.target.closest(".rf-iconbtn");
  if (!onDrawer && !onIconBtn) closeDrawers();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawers();
});

// Vermilion underline band on the partner rhyme word — distinct
// from the solid-block highlight used on the source word itself.
function highlightPair(line, surface) {
  if (!surface) return escapeHtml(line);
  const safe = surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${safe}(?:['’]\\w{0,3})?\\b`, "gi");
  return escapeHtml(line).replace(re, '<mark class="rf-lyric-mark rf-lyric-mark-pair">$&</mark>');
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

// ── Lex filter strip ───────────────────────────────────────────────
// One source of truth for filtering candidates by lexical category.
// Counts are computed across ALL tiers; toggling a chip flips a
// data-attribute on .rf-app and the CSS hides matching .rf-word
// elements. The chip strip lives in two places — the inline copy
// (#lex-filter, top of results) and a softer mirror inside the
// #stickybar — and renderStickybar() keeps both in sync.
const LEX_LABELS = { common: "Common", person: "Names", place: "Places", science: "Sciences" };
// Hover tooltips — spell out what each WordNet-derived category covers,
// since the one-word labels alone don't say (e.g. "Sciences" = the
// noun.substance/plant/animal/body lexnames). See buildWordnetCategories.mjs.
const LEX_HINTS = {
  common: "Everyday English words",
  person: "People's first & last names",
  place: "Cities, countries & regions",
  science: "Plants, animals, substances & technical terms",
};
const LEX_ORDER = ["common", "person", "place", "science"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Flip both the inline chip and the mirror chip to the same state,
// update the global filter attr on .rf-app, then re-flow tier counts.
// Called from chip click handlers in BOTH copies of the filter so
// they stay perfectly in sync.
function setLexFilter(lex, value) {
  const app = document.getElementById("app");
  if (!app) return;
  app.dataset[`filter${cap(lex)}`] = String(value);
  document.querySelectorAll(`.rf-lex-check input[data-lex="${lex}"]`).forEach((box) => {
    box.checked = value;
  });
  updateBucketCounts();
}

function bindLexCheck(box) {
  box.addEventListener("change", () => {
    setLexFilter(box.dataset.lex, box.checked);
  });
}

function renderLexFilter(buckets) {
  // The filter chips now live inside the filter drawer (#filter-content)
  // — see the new sticky bar's "filter" icon button + the drawer
  // markup in index.html. The inline #lex-filter strip was removed
  // when the drawer became the single source of truth.
  const filter = document.getElementById("filter-content");
  const app = document.getElementById("app");
  if (!filter || !app) return;

  const counts = { common: 0, person: 0, place: 0, science: 0 };
  for (const t of TIER_TYPES) {
    for (const c of buckets[t] ?? []) {
      const lex = c.lex || "common";
      counts[lex] = (counts[lex] ?? 0) + 1;
    }
  }

  // Each category is a real checkbox the reader ticks to show / hide
  // that class of word — clearer than the old toggle-chip, which only
  // signalled state via border style + opacity. A native <input>
  // (label-wrapped, so the whole row is the hit target) drives the
  // state; the painted .rf-lex-box is the visible affordance and the
  // checkmark inherits the category ink. The title= gives a hover
  // tooltip explaining what the one-word label covers.
  filter.innerHTML = LEX_ORDER.map((lex) => {
    const on = app.dataset[`filter${cap(lex)}`] !== "false";
    return (
      `<label class="rf-lex-check" data-lex="${lex}" title="${escapeHtml(LEX_HINTS[lex])}">` +
      `<input type="checkbox" data-lex="${lex}"${on ? " checked" : ""} />` +
      `<span class="rf-lex-box" aria-hidden="true">` +
      `<svg viewBox="0 0 12 12"><path d="M2.4 6.3 L4.9 8.8 L9.6 3.4" /></svg>` +
      `</span>` +
      `<span class="rf-lex-check-label">${LEX_LABELS[lex]}</span>` +
      `<span class="rf-lex-check-count">${counts[lex] || 0}</span>` +
      `</label>`
    );
  }).join("");

  filter.querySelectorAll(".rf-lex-check input").forEach(bindLexCheck);
}

// ── Per-tier visible-count reflow ──────────────────────────────────
// Walks each .rf-tier and counts how many .rf-word elements survive
// the active CSS filter. Updates the count badge to either `N` or
// `N / total` form, dims zero-visible tiers, and toggles the empty
// hint.
function updateBucketCounts() {
  document.querySelectorAll(".rf-tier").forEach((tier) => {
    const countEl = tier.querySelector(".rf-tier-count");
    if (!countEl) return;
    const total = Number(countEl.dataset.total || 0);

    // Cheap filter check via the .rf-app data attributes (avoids a
    // forced layout per word). Treats words without data-lex as common.
    const app = document.querySelector(".rf-app");
    const passesFilter = (w) => {
      const lex = w.getAttribute("data-lex") || "common";
      return app?.getAttribute(`data-filter-${lex}`) !== "false";
    };

    // Pass 1 — for each collapsed subgroup, recount the lower words
    // that would actually survive the current lex filter.
    //   * If 0 would survive: hide the show-more button entirely (no
    //     point telling the user to reveal nothing).
    //   * Else: update the button label to reflect the survivor count.
    //   * If every default word is also filtered out, auto-reveal the
    //     lower words so the user sees the surviving NAMES/PLACES/etc.
    //     candidates instead of an empty tier.
    tier.querySelectorAll(".rf-subgroup").forEach((sg) => {
      // The MOSAIC RHYME group isn't lex-filtered (mosaics have no lex
      // category) and manages its own show-more — leave it alone.
      if (sg.classList.contains("rf-mosaic-subgroup")) return;
      if (sg.classList.contains("rf-subgroup--lower-shown")) return;
      const lowerEls = [...sg.querySelectorAll(".rf-word--lower")];
      if (lowerEls.length === 0) return;
      const visibleLower = lowerEls.filter(passesFilter).length;
      const btn = sg.querySelector(".rf-subgroup-show-more");
      if (btn) {
        btn.hidden = visibleLower === 0;
        if (visibleLower > 0) btn.textContent = `Show ${visibleLower} more`;
      }
      if (visibleLower === 0) return;
      const visibleDefaults = [...sg.querySelectorAll(".rf-word:not(.rf-word--lower)")]
        .filter(passesFilter).length;
      if (visibleDefaults > 0) return;
      // Defaults all filtered, lower has survivors → reveal them.
      sg.classList.add("rf-subgroup--lower-shown");
      btn?.remove();
    });

    // Pass 2 — hide subgroups whose every word is filtered out so
    // the syllable label doesn't float above empty space.
    tier.querySelectorAll(".rf-subgroup").forEach((sg) => {
      if (sg.classList.contains("rf-mosaic-subgroup")) return;
      let sgVisible = 0;
      sg.querySelectorAll(".rf-word").forEach((w) => {
        if (getComputedStyle(w).display !== "none") sgVisible++;
      });
      sg.hidden = sgVisible === 0;
    });

    // Pass 3 — tier-level zero check, after subgroup adjustments. Mosaic
    // chips (also .rf-word) count as visible content — a tier that's all
    // mosaics is not "zero", and the lex filter never hides mosaics.
    let visible = 0;
    tier.querySelectorAll(".rf-word").forEach((w) => {
      if (getComputedStyle(w).display !== "none") visible++;
    });
    tier.classList.toggle("rf-tier-zero", visible === 0);
    countEl.dataset.zero = String(visible === 0);
    const empty = tier.querySelector(".rf-tier-empty");
    if (empty) {
      empty.hidden = visible !== 0;
      const hint = empty.querySelector(".rf-tier-empty-hint");
      if (hint && visible === 0) {
        hint.textContent = `adjust filters to see ${total} hidden`;
      }
    }
  });
}

// ── Sticky tier bar ────────────────────────────────────────────────
// Populates the fixed-position #stickybar with: an eyebrow + the
// searched word, a vertical hairline divider, a row of tier-shortcut
// buttons (each with a stability-encoded resolve rule beneath), and
// a softer mirror of the lex filter. The bar stays display:none-ish
// (transform off-screen + opacity 0) until the IntersectionObserver
// adds .is-stuck.
// Populates the jump drawer with one tier-shortcut button per tier
// (was renderStickybar — the #stickybar element is gone; tier
// shortcuts now live behind the "jump" iconbtn in the merged bar
// and slide out as an inline drawer below it).
function renderStickybar(_srcWord) {
  const host = document.getElementById("jump-content");
  if (!host) return;

  const tiers = [...document.querySelectorAll(".rf-tier")];
  const tierBtns = tiers.map((t) => {
    const type = t.dataset.tier;
    const meta = TIER_META[type];
    if (!meta) return "";
    const total = t.querySelector(".rf-tier-count")?.dataset.total || "0";
    const label = meta.label.replace(/ rhyme$/i, "");
    return (
      `<button type="button" class="rf-drawer-tier" data-target="${type}">` +
      `${escapeHtml(label)}<span class="n">${total}</span>` +
      `</button>`
    );
  }).join("");

  host.innerHTML = `<div class="rf-drawer-tiers">${tierBtns}</div>`;

  host.querySelectorAll(".rf-drawer-tier").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.querySelector(`.rf-tier[data-tier="${btn.dataset.target}"]`);
      if (!target) return;
      // Offset by the sticky bar's height so the tier head doesn't
      // land underneath the bar after the jump. The drawer also
      // closes — once you've picked a destination there's no need to
      // keep the list onscreen.
      const bar = document.querySelector(".rf-hero");
      const barH = bar ? bar.getBoundingClientRect().height : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - barH - 12;
      closeDrawers();
      window.scrollTo({ top, behavior: "smooth" });
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
