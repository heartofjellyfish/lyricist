// ── Input autocomplete ──────────────────────────────────────────────
// A prefix list over the SAME vocabulary the classifier can return, ranked by
// the SAME lyricScore as the results (see suggestWords in rhymeFinder.js).
// Zero new network: every input is already in memory after prewarm().
//
// Layout decisions that are load-bearing (see the mockup review, Aug 2026):
//   * Two number columns — syllables and corpus line-end uses ("songs", the
//     same figure the results-page red dot shows). They sit in a fixed right
//     rail, and a faint FOOTER caption names them. A sticky table HEADER was
//     tried first and rejected: it reads as spreadsheet chrome rather than a
//     dropdown, and with 8 rows the panel never scrolls, so the stickiness
//     was dead code.
//   * The exact match is kept but not hoisted; see suggestWords.
//   * Clicking a row (or Enter on a highlighted row) SEARCHES — the panel is
//     not a completion aid, it's the fastest path to a result. The panel
//     closes on search so it never covers the results it just produced.
//   * Tab completes WITHOUT searching, and leaves the panel open — that's the
//     "I typed the whole word, don't yank the list away" case.

import { ensureSuggestIndex, suggestWords } from "./rhymeFinder.js";
import { corpusSongCount, ensureExistence } from "./lyricLibrary.js";

const LIMIT = 8;

// Resting opacity down the rail — row 0 full, each row 3.5% fainter, so the
// eighth sits near 0.76. A depth cue, not an animation: it costs nothing and
// says the same thing the ranking already says. The legend keeps the opacity
// the stylesheet gives it.
const FADE_STEP = 0.035;
const LEGEND_FADE = 0.8;

const n = (v) => v.toLocaleString("en-US");

// The four columns, left to right. `perfect` and `near` come from the
// precomputed rhyme-counts artifact (see attachRhymeCounts in rhymeFinder.js)
// and read "–" when it is absent or stale.
//
// `near` deliberately stays ONE column instead of splitting into the five
// tiers it sums: five numbers in a dropdown row is a spreadsheet, and the
// split is lopsided anyway — across the whole vocabulary assonance is 43% of
// `near` and consonance 30%, while family, the tier a songwriter would most
// want called out, is 4%. The full ladder is in the row's tooltip and its
// screen-reader label instead, where it costs no width.
const COLUMNS = [
  {
    key: "syl",
    label: "syl",
    value: (row) => row.syllables,
    title: (row) => `${row.display}: ${row.syllables} syllable${row.syllables === 1 ? "" : "s"}`,
  },
  {
    key: "songs",
    label: "songs",
    // corpusSongCount, not a local expression: this figure must be the same
    // one the results page shows for the same word (see lyricLibrary.js).
    value: (row) => corpusSongCount(row.text),
    title: (row, v) =>
      v ? `${row.display}: in ${n(v)} song${v === 1 ? "" : "s"} in the lyric corpus`
        : `${row.display}: not in the lyric corpus`,
  },
  {
    key: "perfect",
    label: "perfect",
    value: (row) => row.counts?.perfect ?? null,
    title: (row, v) =>
      v === null ? "" : `${row.display}: ${n(v)} perfect rhyme${v === 1 ? "" : "s"} in the dictionary`,
  },
  {
    key: "near",
    label: "near",
    value: (row) => row.counts?.near ?? null,
    title: (row, v) => {
      if (v === null) return "";
      const c = row.counts;
      const parts = [
        `${n(c.family)} family`,
        `${n(c.additive)} additive`,
        `${n(c.subtractive)} subtractive`,
        `${n(c.assonance)} assonance`,
        `${n(c.consonance)} consonance`,
      ];
      return `${row.display}: ${n(v)} near rhymes — ${parts.join(", ")}`;
    },
  },
];

export function initAutocomplete({ input, panel, onSearch, limit = LIMIT }) {
  if (!input || !panel || typeof onSearch !== "function") return null;

  // Reuse a panel that's already in the DOM. The SEO snapshot pages are a
  // serialization of this very app, so a stale (empty, hidden) panel can come
  // baked into the HTML; creating a second one would duplicate the id that
  // aria-controls points at.
  const list = panel.querySelector("#word-autocomplete") ?? document.createElement("ul");
  list.className = "rf-ac";
  list.id = "word-autocomplete";
  list.setAttribute("role", "listbox");
  list.innerHTML = "";
  list.hidden = true;
  if (!list.isConnected) panel.append(list);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);

  let items = [];
  let sel = -1;

  function close() {
    list.hidden = true;
    sel = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function render(prefix) {
    // The row cascade (styles.css, "逐行落笔") replays only when the panel goes
    // from CLOSED to OPEN. Re-running it on every keystroke costs the same
    // frames but READS as lag — you wait for the list to stop moving before
    // you dare read it. Capture the state before `hidden` is reassigned below.
    const wasHidden = list.hidden;

    list.innerHTML = "";
    for (const [i, row] of items.entries()) {
      const li = document.createElement("li");
      li.className = "rf-ac-row rf-ac-item";
      li.id = `rf-ac-opt-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.word = row.text;
      li.dataset.idx = String(i);
      // Position down the rail. Drives BOTH the cascade's stagger and the
      // resting depth fade; the CSS owns the constants.
      li.style.setProperty("--i", String(i));
      li.style.setProperty("--fade", (1 - i * FADE_STEP).toFixed(3));

      const word = document.createElement("span");
      word.className = "rf-ac-word";
      const typed = document.createElement("span");
      typed.className = "rf-ac-pre";          // the part already typed stays faded
      typed.textContent = row.display.slice(0, prefix.length);
      const rest = document.createElement("span");
      rest.textContent = row.display.slice(prefix.length);
      word.append(typed, rest);
      li.append(word);

      const described = [];
      for (const col of COLUMNS) {
        const v = col.value(row);
        const cell = document.createElement("span");
        cell.className = `rf-ac-n rf-ac-n--${col.key}${v === 0 ? " rf-ac-n--zero" : ""}`;
        cell.textContent = v === null ? "–" : n(v);
        cell.title = col.title(row, v);
        li.append(cell);
        if (cell.title) described.push(cell.title);
      }
      li.setAttribute("aria-label", described.join(". "));
      list.append(li);
    }

    if (items.length) {
      const foot = document.createElement("li");
      foot.className = "rf-ac-row rf-ac-legend";
      foot.setAttribute("role", "presentation");
      foot.setAttribute("aria-hidden", "true");
      // Last in the cascade, and its --fade matches the resting opacity the
      // stylesheet already gives it, so the animation lands where CSS ends.
      foot.style.setProperty("--i", String(items.length));
      foot.style.setProperty("--fade", String(LEGEND_FADE));
      foot.append(document.createElement("span"));   // spacer under the words
      for (const col of COLUMNS) {
        const s = document.createElement("span");
        s.textContent = col.label;
        foot.append(s);
      }
      list.append(foot);
    }

    list.hidden = items.length === 0;
    list.classList.toggle("is-opening", wasHidden && !list.hidden);
    input.setAttribute("aria-expanded", String(!list.hidden));
  }

  function refresh() {
    const prefix = input.value.trim().toLowerCase();
    items = suggestWords(prefix, limit);
    sel = -1;
    input.removeAttribute("aria-activedescendant");
    render(prefix);
  }

  function move(step) {
    if (list.hidden || !items.length) return;
    // From "nothing selected", ↓ takes the first row and ↑ the last.
    sel = sel === -1 ? (step > 0 ? 0 : items.length - 1)
                     : (sel + step + items.length) % items.length;
    const opts = [...list.querySelectorAll(".rf-ac-item")];
    opts.forEach((li, i) => li.setAttribute("aria-selected", String(i === sel)));
    opts[sel]?.scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", opts[sel]?.id ?? "");
  }

  function search(word) {
    input.value = word;
    close();
    onSearch(word);
  }

  // The panel opens for TYPING and nothing else. A ?q= deep link (and every
  // SEO snapshot page, which boots through the same path) arrives with the
  // word already in the box and the box focused by autofocus — offering to
  // complete a word the visitor never typed, over results they already have,
  // is noise. `isTrusted` is the honest test for "a human typed this": the
  // only synthetic input events in this app are main.js emptying the box
  // (clear x, home reset), which must still dismiss the list.
  let typed = false;
  input.addEventListener("input", (e) => {
    if (!e.isTrusted) { close(); return; }
    typed = true;
    refresh();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Escape") { if (!list.hidden) { e.stopPropagation(); close(); } }
    else if (e.key === "Tab" && !list.hidden && items.length) {
      e.preventDefault();                       // complete, don't search
      input.value = items[Math.max(sel, 0)].text;
      refresh();
      move(1);
    } else if (e.key === "Enter" && !list.hidden && sel >= 0) {
      e.preventDefault();
      search(items[sel].text);
    }
  });

  // mousedown, not click: the input must not lose focus before we act.
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest(".rf-ac-item");
    if (!li) return;
    e.preventDefault();
    search(li.dataset.word);
  });

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target)) close();
  });

  // Plain Enter with nothing highlighted, and the go-button, both submit the
  // form directly — neither goes through search() above, so without this the
  // panel stayed open on top of the results the submit just produced.
  input.form?.addEventListener("submit", close);

  // Build the index off the typing path. It only needs data prewarm() already
  // fetched, so this is pure CPU — parked in idle time while the visitor reads.
  // The refresh after the build only fires when the box is FOCUSED. Deep links
  // and the SEO snapshot pages boot with ?q=<word> pre-filled in the input, so
  // an unconditional refresh popped the panel open over the results of a search
  // the visitor never typed.
  const build = () => ensureSuggestIndex().then(() => {
    // Only catch up for someone who typed while the index was still building.
    if (typed && document.activeElement === input && input.value.trim()) refresh();
  }).catch(() => {
    // A failed wordlist/dict fetch just means no suggestions — the search box
    // itself still works, so swallow it rather than raising an unhandled
    // rejection in the page.
  });
  if (typeof requestIdleCallback === "function") requestIdleCallback(build, { timeout: 3000 });
  else setTimeout(build, 300);

  // The songs column comes from lyric-library/index.json, fetched separately.
  // Until it lands getCounts() returns null and every row reads 0 — repaint
  // once, so someone who types during that window doesn't keep stale zeroes.
  ensureExistence().then(() => { if (typed && !list.hidden) refresh(); }).catch(() => {});

  return { refresh, close };
}
