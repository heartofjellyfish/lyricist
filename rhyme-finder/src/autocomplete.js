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
import { getCounts, ensureExistence } from "./lyricLibrary.js";

const LIMIT = 8;

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
    value: (row) => getCounts(row.text)?.appearances ?? 0,
    title: (row, v) =>
      v ? `${row.display}: ends a line ${v.toLocaleString("en-US")} time${v === 1 ? "" : "s"} in the lyric corpus`
        : `${row.display}: never ends a line in the lyric corpus`,
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
    list.innerHTML = "";
    for (const [i, row] of items.entries()) {
      const li = document.createElement("li");
      li.className = "rf-ac-row rf-ac-item";
      li.id = `rf-ac-opt-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.word = row.text;
      li.dataset.idx = String(i);

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
        cell.textContent = v.toLocaleString("en-US");
        cell.title = col.title(row, v);
        li.append(cell);
        described.push(col.title(row, v));
      }
      li.setAttribute("aria-label", described.join(". "));
      list.append(li);
    }

    if (items.length) {
      const foot = document.createElement("li");
      foot.className = "rf-ac-row rf-ac-legend";
      foot.setAttribute("role", "presentation");
      foot.setAttribute("aria-hidden", "true");
      foot.append(document.createElement("span"));   // spacer under the words
      for (const col of COLUMNS) {
        const s = document.createElement("span");
        s.textContent = col.label;
        foot.append(s);
      }
      list.append(foot);
    }

    list.hidden = items.length === 0;
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

  input.addEventListener("input", refresh);
  input.addEventListener("focus", () => { if (input.value.trim()) refresh(); });

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
    if (document.activeElement === input && input.value.trim()) refresh();
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
  ensureExistence().then(() => { if (!list.hidden) refresh(); }).catch(() => {});

  return { refresh, close };
}
