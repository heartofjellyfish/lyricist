// Lyric Library loader — Phase 1 pilot.
// Lazy-loads per-letter index files from /wordlists/lyric-library/*.json
// and exposes a sync lookup once the relevant letter is in cache.

const cache = new Map(); // letter -> { word: quote[] }
const inflight = new Map(); // letter -> Promise

function fetchLetter(letter) {
  if (cache.has(letter)) return Promise.resolve(cache.get(letter));
  if (inflight.has(letter)) return inflight.get(letter);
  const p = fetch(`/wordlists/lyric-library/${letter}.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((data) => {
      cache.set(letter, data);
      inflight.delete(letter);
      return data;
    });
  inflight.set(letter, p);
  return p;
}

// Preload all letter buckets that any of `words` would query, in parallel.
export async function prefetchForWords(words) {
  const letters = new Set();
  for (const w of words) {
    const c = (w[0] || "").toLowerCase();
    if (/[a-z]/.test(c)) letters.add(c);
  }
  await Promise.all([...letters].map(fetchLetter));
}

// Sync — assumes prefetchForWords has already resolved. The pilot index
// is keyed on lemma (noun/verb), so plain candidate words like "river" or
// "love" hit directly. For input forms ("rivers", "running") the user
// types into the search box, see clientLemma() below.
export function getQuotes(word) {
  const w = word.toLowerCase();
  const letter = w[0];
  const data = cache.get(letter);
  if (!data) return [];
  return data[w] ?? data[clientLemma(w)] ?? [];
}

// Lightweight lemmatizer used only when the index lookup misses on the
// raw form. Mirrors the noun/verb suffix collapses that wink-lemmatizer
// performs in scripts/build-index.mjs — close enough for the pilot. If
// drift becomes a problem in Phase 4, ship an explicit alias map.
function clientLemma(w) {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  return w;
}
