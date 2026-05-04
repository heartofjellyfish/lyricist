// Scan raw/ files and remove obvious-bad matches (articles, chart lists,
// duplicates introduced by the resume-dedup bug). Writes back in place.
// Usage: node lyric-library/scripts/clean-raw.mjs

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RAW_DIR = resolve(ROOT, "raw");

const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function isBadMatch(title) {
  // Article / chart / list patterns
  if (/(\d{2,3}\s*best|best\s*albums|best\s*songs|top\s*songs|tracklist|review|the\s*100|the\s*200|the\s*500)/i.test(title)) return true;
  // Pure year-only or "Songs Of YYYY"
  if (/^songs?\s+of\s+\d{4}/i.test(title)) return true;
  return false;
}

const files = readdirSync(RAW_DIR).filter(f => f.endsWith(".json"));
let totalRemoved = 0;
for (const f of files) {
  const path = resolve(RAW_DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8"));
  const before = data.songs?.length ?? 0;
  const seen = new Set();
  data.songs = (data.songs ?? []).filter((s) => {
    if (isBadMatch(s.title)) return false;
    // Dedup on URL (more reliable than title since the resume bug
    // can save the same URL twice with different/identical titles)
    if (s.url && seen.has(s.url)) return false;
    if (s.url) seen.add(s.url);
    // Drop empties
    if (!s.lyrics || s.lyrics.length < 50) return false;
    return true;
  });
  const removed = before - data.songs.length;
  if (removed > 0) {
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`  ${f}: ${before} → ${data.songs.length} (removed ${removed})`);
    totalRemoved += removed;
  }
}
console.log(`\nTotal removed: ${totalRemoved}`);
