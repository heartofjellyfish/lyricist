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

// ── Lyric Library decoration (Phase 1.6) ───────────────────────────
// If the candidate word has quotes in the lyric corpus, append a small
// vermilion dot+count badge and attach a popover. Each quote shows the
// matched line (and rhyme partner, if any) plus an attribution row
// with the section role tag; `+ context` reveals the rest of the
// stanza, spotlighting the matched line. Sections with > 3 quotes
// expand inline via the "Show N more" button. Mobile gets a bottom
// sheet (CSS @media).
function decorateWithLyrics(el, word) {
  const quotes = getQuotes(word);
  if (!quotes.length) return;
  el.classList.add("rf-has-lyrics");

  const endQuotes = quotes.filter((q) => q.position === "end");
  const midQuotes = quotes.filter((q) => q.position !== "end");

  const badge = document.createElement("span");
  badge.className = "rf-lyric-badge";
  const count = document.createElement("span");
  count.className = "rf-lyric-badge-count";
  count.textContent = String(quotes.length);
  badge.appendChild(count);
  el.appendChild(badge);

  const pop = document.createElement("div");
  pop.className = "rf-lyric-pop";
  pop.appendChild(renderPopHeader(word, quotes, endQuotes));
  const body = document.createElement("div");
  body.className = "rf-lyric-pop-body";
  if (endQuotes.length) body.appendChild(renderQuoteSection("At line end", endQuotes, 3));
  if (midQuotes.length) body.appendChild(renderQuoteSection("Mid-line", midQuotes, 3));
  pop.appendChild(body);
  el.appendChild(pop);

  // Click on the word still pins (the Phase 1.6 pin glyph in the header
  // is additive — both paths set `.rf-pinned`).
  el.addEventListener("click", (e) => {
    if (e.target.closest(".rf-lyric-pop")) return;
    e.stopPropagation();
    setPin(el, true);
  });
  installGlobalDismissHandlers();
}

// Stash each section's "rest of quotes" beyond the cap so the inline
// expand handler can render them lazily on first click.
const sectionRest = new WeakMap();

let dismissHandlersInstalled = false;
function installGlobalDismissHandlers() {
  if (dismissHandlersInstalled) return;
  dismissHandlersInstalled = true;

  const unpinAll = () => {
    document.querySelectorAll(".rf-word.rf-pinned").forEach((p) => p.classList.remove("rf-pinned"));
    document.documentElement.classList.remove("rf-sheet-open");
    document.querySelectorAll(".rf-lyric-pin[aria-pressed='true']").forEach((b) =>
      b.setAttribute("aria-pressed", "false"),
    );
  };

  document.addEventListener("click", (e) => {
    // Inline-expand a section when "Show N more" / "Collapse" is clicked.
    const more = e.target.closest(".rf-lyric-more");
    if (more) {
      const section = more.closest(".rf-lyric-section");
      const expanded = section.classList.toggle("is-expanded");
      if (expanded && !section.dataset.fullyRendered) {
        renderRemainingQuotes(section);
        section.dataset.fullyRendered = "1";
      }
      more.textContent = expanded ? more.dataset.expandedLabel : more.dataset.collapsedLabel;
      e.stopPropagation();
      return;
    }
    // Don't dismiss when the click landed inside a popover (toggles,
    // scroll, text selection). The header pin / close × handlers manage
    // their own state before bubbling here.
    if (e.target.closest(".rf-lyric-pop")) return;
    unpinAll();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") unpinAll();
  });

  // Pin hint suppression — once the user pins anything (by either path),
  // remember it for this session so the hint stops shouting.
  if (localStorage.getItem("rf-pin-hint-seen") === "1") {
    document.documentElement.classList.add("rf-pin-hint-suppress");
  }
}

function setPin(wordEl, pinned) {
  document.querySelectorAll(".rf-word.rf-pinned").forEach((p) => {
    if (p !== wordEl) {
      p.classList.remove("rf-pinned");
      p.querySelector(".rf-lyric-pin")?.setAttribute("aria-pressed", "false");
    }
  });
  wordEl.classList.toggle("rf-pinned", pinned);
  wordEl.querySelector(".rf-lyric-pin")?.setAttribute("aria-pressed", pinned ? "true" : "false");
  document.documentElement.classList.toggle("rf-sheet-open", pinned);
  if (pinned) {
    localStorage.setItem("rf-pin-hint-seen", "1");
    document.documentElement.classList.add("rf-pin-hint-suppress");
  }
}

// Header strip: word + summary, with a pin glyph (discoverability),
// a one-shot hover hint, and the close × (visible only when pinned).
function renderPopHeader(word, all, end) {
  const head = document.createElement("header");
  head.className = "rf-lyric-pop-head";

  const left = document.createElement("div");
  const w = document.createElement("div");
  w.className = "rf-lyric-pop-word";
  w.textContent = word;
  const sum = document.createElement("div");
  sum.className = "rf-lyric-pop-summary";
  const artists = new Set(all.map((q) => q.credit)).size;
  sum.innerHTML =
    `${all.length} quote${all.length === 1 ? "" : "s"} · ${artists} artist${artists === 1 ? "" : "s"}` +
    (end.length ? ` · <b>${end.length} at line end</b>` : "");
  left.append(w, sum);

  const tools = document.createElement("div");
  tools.className = "rf-lyric-pop-tools";

  const hint = document.createElement("span");
  hint.className = "rf-lyric-pin-hint";
  hint.innerHTML = `<b>Click word</b> to pin →`;
  tools.appendChild(hint);

  const pin = document.createElement("button");
  pin.className = "rf-lyric-pin";
  pin.type = "button";
  pin.setAttribute("aria-pressed", "false");
  pin.setAttribute("aria-label", "Pin");
  pin.innerHTML = `
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 1.6 V 7.2 M5.6 7.2 H 12.4 L 11.4 11 H 6.6 Z M9 11 V 16.4" />
    </svg>`;
  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    const word = head.closest(".rf-word");
    if (!word) return;
    setPin(word, !word.classList.contains("rf-pinned"));
  });
  tools.appendChild(pin);

  const close = document.createElement("button");
  close.className = "rf-lyric-pop-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    const word = head.closest(".rf-word");
    if (word) setPin(word, false);
  });
  tools.appendChild(close);

  head.append(left, tools);
  return head;
}

function renderQuoteSection(label, quotes, cap) {
  const sec = document.createElement("section");
  sec.className = "rf-lyric-section";

  const head = document.createElement("div");
  head.className = "rf-lyric-section-head";
  const lab = document.createElement("span");
  lab.className = "rf-lyric-section-label";
  lab.textContent = label;
  const meta = document.createElement("span");
  meta.className = "rf-lyric-section-meta";
  const artists = new Set(quotes.map((q) => q.credit)).size;
  meta.textContent =
    `${quotes.length} quote${quotes.length === 1 ? "" : "s"} · ${artists} artist${artists === 1 ? "" : "s"}`;
  head.append(lab, meta);
  sec.appendChild(head);

  for (const q of quotes.slice(0, cap)) sec.appendChild(renderQuoteItem(q));

  // Inline-expand button. The remaining quotes render lazily on first
  // expand (see `renderRemainingQuotes`). Toggle text flips between the
  // two stored labels; the ::after arrow rotates via CSS.
  if (quotes.length > cap) {
    sectionRest.set(sec, quotes.slice(cap));
    const more = document.createElement("button");
    more.type = "button";
    more.className = "rf-lyric-more";
    more.dataset.collapsedLabel = `Show ${quotes.length - cap} more`;
    more.dataset.expandedLabel = "Collapse";
    more.textContent = more.dataset.collapsedLabel;
    sec.appendChild(more);
  }
  return sec;
}

function renderRemainingQuotes(section) {
  const rest = sectionRest.get(section) ?? [];
  const more = section.querySelector(".rf-lyric-more");
  for (const q of rest) section.insertBefore(renderQuoteItem(q), more);
}

function renderQuoteItem(q) {
  const item = document.createElement("div");
  item.className = "rf-lyric-item";

  // Compute the stanza split: lines before the matched index, lines after,
  // with the partner removed from the after-block (it appears in the pair).
  const stanza = Array.isArray(q.stanza) ? q.stanza : [];
  const matchedIdx = Number.isInteger(q.stanzaLineIdx) ? q.stanzaLineIdx : -1;
  const partnerIdx = q.partner && Number.isInteger(q.partner.stanzaLineIdx) ? q.partner.stanzaLineIdx : -1;
  let before = [];
  let after = [];
  if (matchedIdx >= 0 && stanza.length) {
    before = stanza.slice(0, matchedIdx);
    after = stanza.slice(matchedIdx + 1).filter((_, i) => matchedIdx + 1 + i !== partnerIdx);
  } else {
    // Fallback to Phase 1.5 prev/next when the index lacks stanza info.
    if (q.linePrev) before = [q.linePrev];
    if (q.lineNext) after = [q.lineNext];
  }
  const hasCtx = before.length > 0 || after.length > 0;

  // Before-context wrapper (collapsible).
  if (before.length) item.appendChild(buildCtxWrap(before, "before"));

  // Matched line, optionally as a partner couplet.
  if (q.partner) {
    const pair = document.createElement("div");
    pair.className = "rf-lyric-pair";
    const rule = document.createElement("div");
    rule.className = "rf-lyric-pair-rule";
    pair.appendChild(rule);

    const top = document.createElement("p");
    top.className = "rf-lyric-line";
    top.innerHTML = highlightSurface(q.line, q.surface);
    pair.appendChild(top);

    const tag = document.createElement("div");
    tag.className = "rf-lyric-pair-tag";
    tag.innerHTML = `<b>↳ rhymes</b> · ${escapeHtml(q.partner.type ?? "")}`;
    pair.appendChild(tag);

    const bot = document.createElement("p");
    bot.className = "rf-lyric-line";
    bot.innerHTML = highlightSurface(q.partner.line, q.partner.word);
    pair.appendChild(bot);

    item.appendChild(pair);
  } else {
    const line = document.createElement("p");
    line.className = "rf-lyric-line";
    line.innerHTML = highlightSurface(q.line, q.surface);
    item.appendChild(line);
  }

  // After-context wrapper (collapsible).
  if (after.length) item.appendChild(buildCtxWrap(after, "after"));

  // Attribution row: who · song · role tag, with + context toggle.
  const attr = document.createElement("div");
  attr.className = "rf-lyric-attr";
  const who = document.createElement("span");
  who.className = "who";
  let whoHtml =
    `<b>${escapeHtml(q.credit)}</b> · ${escapeHtml(q.songTitle)}` +
    (q.year ? ` · ${escapeHtml(String(q.year))}` : "");
  if (q.section_label) {
    const isChorus = /chorus/i.test(q.section_label);
    whoHtml +=
      ` <span class="rf-lyric-role${isChorus ? " is-chorus" : ""}">` +
      `${escapeHtml(q.section_label)}</span>`;
  }
  who.innerHTML = whoHtml;
  attr.appendChild(who);
  if (hasCtx) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "rf-lyric-ctx-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const opened = item.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", opened ? "true" : "false");
    });
    attr.appendChild(toggle);
  }
  item.appendChild(attr);

  return item;
}

function buildCtxWrap(lines, slot) {
  const wrap = document.createElement("div");
  wrap.className = `rf-lyric-ctx-wrap ${slot}`;
  const inner = document.createElement("div");
  inner.className = "rf-lyric-ctx-inner";
  for (const text of lines) {
    const p = document.createElement("p");
    p.className = "rf-lyric-ctx";
    p.textContent = text;
    inner.appendChild(p);
  }
  wrap.appendChild(inner);
  return wrap;
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
