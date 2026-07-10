// evalMosaicQuality.mjs — headless mosaic-rhyme evaluation harness.
// Drives the REAL findRhymes (same fetch→fs shim as the golden test suite)
// across a probe word set and dumps full mosaic output + context as JSON.
// Companion doc: rhyme-finder/MOSAIC-EVAL.md (methodology + 2026-07-09 results).
//
// Usage:  MODE=shipped node scripts/evalMosaicQuality.mjs out.json [word ...]
//   MODE=shipped  real gates (as deployed)               [default]
//   MODE=raw      evidence gates forced open (attestation always-true, all
//                 heads object-licensed) — the ungated-combinatorial baseline
//   MODE=att      attestation-only (objMask=0 everywhere: no speculative path)
// With no explicit words: top-50 lyric-frequency feminine words + canon
// extras + 12 masculine controls.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODE = process.env.MODE ?? "shipped";
const OUT = process.argv[2] ?? `eval-${MODE}.json`;

function jsonResp(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}

// Same shim as test/mosaicRhyme.test.js, plus MODE-dependent interception of
// the two mosaic evidence files so gate ablations are measurable.
globalThis.fetch = async (url) => {
  const p = fileURLToPath(url);
  const base = path.basename(p);
  if (MODE !== "shipped") {
    if (base === "mosaic-verbs.json") {
      if (MODE === "att") return jsonResp({});
      if (MODE === "raw") {
        const dict = JSON.parse(
          fs.readFileSync(path.join(REPO, "wordlists", "cmu-dict.json"), "utf8"),
        );
        return jsonResp(Object.fromEntries(Object.keys(dict).map((k) => [k, 3])));
      }
    }
    if (base === "mosaic-phrases.json" && MODE === "raw") {
      // Attestation gate forced OPEN: hasOwnProperty → true for any phrase,
      // property reads → undefined (songs stays 0).
      const proxy = new Proxy(
        {},
        {
          getOwnPropertyDescriptor: () => ({
            configurable: true,
            enumerable: true,
            value: undefined,
          }),
          get: () => undefined,
          has: () => true,
        },
      );
      return { ok: true, status: 200, json: async () => proxy };
    }
  }
  let buf;
  try {
    buf = fs.readFileSync(p);
  } catch {
    return { ok: false, status: 404 };
  }
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString()),
    text: async () => buf.toString(),
  };
};

const imp = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const { ensurePronunciation } = await imp("rhyme-finder/src/pronunciation.js");
const { analyzeWord } = await imp("rhyme-finder/src/rhymeClassifier.js");
const { findRhymes } = await imp("rhyme-finder/src/rhymeFinder.js");
await ensurePronunciation();

// ── Probe set ────────────────────────────────────────────────────────
const CANON_EXTRAS = [
  "water", "poet", "letter", "city", "spaghetti", "money", "bottom",
  "system", "reminder", "delta", "fever", "sister", "mister", "cover",
  "discover", "surrender", "hallelujah", "glory", "story", "believer",
  "matter", "honey", "daughter", "heaven", "morning", "lonely", "follow",
  "yellow",
];

function buildProbes() {
  const freq = JSON.parse(
    fs.readFileSync(path.join(REPO, "wordlists", "lyric-frequency.json"), "utf8"),
  );
  const sorted = Object.entries(freq)
    .filter(([w]) => /^[a-z]{3,}$/.test(w))
    .sort((a, b) => b[1] - a[1]);
  const fem = [];
  const masc = [];
  for (const [w] of sorted) {
    const a = analyzeWord(w);
    if (!a) continue;
    if (a.trailing && a.trailing.length > 0) {
      if (fem.length < 50) fem.push(w);
    } else if (masc.length < 12) {
      masc.push(w);
    }
    if (fem.length >= 50 && masc.length >= 12) break;
  }
  const feminine = [...new Set([...fem, ...CANON_EXTRAS])];
  return { feminine, masculine: masc };
}

const explicit = process.argv.slice(3);
const probes = explicit.length
  ? { feminine: explicit, masculine: [] }
  : buildProbes();

// ── Run ──────────────────────────────────────────────────────────────
const results = { mode: MODE, generatedAt: new Date().toISOString().slice(0, 10), words: {} };

for (const kind of ["feminine", "masculine"]) {
  for (const word of probes[kind]) {
    const t0 = performance.now();
    let r;
    try {
      r = await findRhymes({ word, perBucket: 500 });
    } catch (e) {
      results.words[word] = { kind, error: String(e.message ?? e) };
      continue;
    }
    const ms = Math.round(performance.now() - t0);
    const singles = {};
    for (const [tier, arr] of Object.entries(r.buckets ?? {})) singles[tier] = arr.length;
    results.words[word] = {
      kind,
      ms,
      singles,
      mosaics: (r.mosaics ?? []).map((m) => ({
        display: m.display,
        type: m.type,
        joinType: m.joinType,
        weakForm: !!m.weakForm,
        attested: !!m.attested,
        songs: m.songs ?? 0,
        score: m.score,
        syllables: m.syllables,
      })),
    };
    process.stderr.write(
      `${MODE} ${word}: ${results.words[word].mosaics.length} mosaics (${ms}ms)\n`,
    );
  }
}

fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log(`wrote ${OUT}`);
