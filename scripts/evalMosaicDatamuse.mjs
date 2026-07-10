// evalMosaicDatamuse.mjs — pull Datamuse (RhymeZone's engine) rhyme sets for
// the probe words of an evalMosaicQuality run; record multi-word entries
// separately. Free API, no key. NOT a data source — a benchmark diff tool,
// same spirit as scripts/evalDatamuse.mjs (single-word recall probe).
// Companion doc: rhyme-finder/MOSAIC-EVAL.md.
//
// Usage: node scripts/evalMosaicDatamuse.mjs eval-shipped.json datamuse.json
import fs from "node:fs";

const src = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const words = Object.entries(src.words)
  .filter(([, v]) => v.kind === "feminine" && !v.error)
  .map(([w]) => w);

const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const w of words) {
  const get = async (rel) => {
    const res = await fetch(
      `https://api.datamuse.com/words?${rel}=${encodeURIComponent(w)}&max=1000`,
    );
    if (!res.ok) throw new Error(`${rel} ${w}: HTTP ${res.status}`);
    return res.json();
  };
  try {
    const [rhy, nry] = [await get("rel_rhy"), await get("rel_nry")];
    out[w] = {
      rhyCount: rhy.length,
      nryCount: nry.length,
      multiRhy: rhy.filter((e) => e.word.includes(" ")).map((e) => e.word),
      multiNry: nry.filter((e) => e.word.includes(" ")).map((e) => e.word),
    };
    process.stderr.write(
      `${w}: rhy ${rhy.length} (multi ${out[w].multiRhy.length}), nry ${nry.length} (multi ${out[w].multiNry.length})\n`,
    );
  } catch (e) {
    out[w] = { error: String(e.message ?? e) };
    process.stderr.write(`${w}: ERROR ${e}\n`);
  }
  await sleep(120);
}

fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(`wrote ${process.argv[3]}`);
