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
    pop.appendChild(renderShowMore(tier1.slice(POP_CAP), word, pop));
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

  document.addEventListener("click", (e) => {
    // Don't dismiss when the click landed inside a popover — quote /
    // stanza / inflected-footer interactions all live there.
    if (e.target.closest(".rf-lyric-pop")) return;
    unpinAll();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") unpinAll();
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
      item.classList.toggle("is-open");
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
      li.classList.toggle("is-open");
    });
    li.appendChild(renderStanza(q));
  }
  return li;
}

// "Show N more" inside the popover — one-shot inline expand. After
// clicking, the rest are rendered in place and the button removes itself.
function renderShowMore(rest, word, popEl) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rf-lyric-more";
  btn.textContent = `Show ${rest.length} more`;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const frag = document.createDocumentFragment();
    for (const q of rest) frag.appendChild(renderEndQuote(q, word));
    popEl.insertBefore(frag, btn);
    btn.remove();
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
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rf-lyric-more";
    btn.textContent = `Show ${tier2.length - POP_CAP} more`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const frag = document.createDocumentFragment();
      for (const q of tier2.slice(POP_CAP)) frag.appendChild(buildInflectedItem(q));
      list.appendChild(frag);
      btn.remove();
    });
    wrap.appendChild(btn);
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
    panel.style.display = "none";
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

  const rail = document.createElement("div");
  rail.className = "rf-source-panel-rail";
  rail.innerHTML =
    `<div class="rf-source-panel-rail-eyebrow">Lines using <em>${escapeHtml(word)}</em></div>` +
    `<div class="rf-source-panel-rail-meta">${ends.length} at line end · ${artists} artist${artists === 1 ? "" : "s"}</div>`;
  panel.appendChild(rail);

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
    const more = document.createElement("button");
    more.type = "button";
    more.className = "rf-lyric-more";
    more.textContent = `Show ${ends.length - cap} more`;
    more.addEventListener("click", () => {
      const frag = document.createDocumentFragment();
      for (const q of ends.slice(cap)) frag.appendChild(buildItem(q));
      col.insertBefore(frag, more);
      more.remove();
    });
    col.appendChild(more);
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
