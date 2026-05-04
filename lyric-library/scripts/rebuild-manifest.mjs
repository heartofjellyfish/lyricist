// Rebuild lyric-library/manifest.json from current raw/ files.
// Useful for live admin UI updates during a long fetch run.
// Usage: node lyric-library/scripts/rebuild-manifest.mjs

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RAW_DIR = resolve(ROOT, "raw");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");

const files = readdirSync(RAW_DIR).filter(f => f.endsWith(".json"));
const artists = {};
for (const f of files) {
  try {
    const d = JSON.parse(readFileSync(resolve(RAW_DIR, f), "utf8"));
    artists[d.slug] = {
      credit: d.credit,
      fetchedAt: d.fetchedAt,
      songCount: d.songs?.length ?? 0,
      songs: (d.songs ?? []).map(s => ({
        title: s.title,
        year: s.year,
        url: s.url,
        chars: s.lyrics?.length ?? 0,
      })),
    };
  } catch (e) { console.warn(`skip ${f}: ${e.message}`); }
}
const totalSongs = Object.values(artists).reduce((s, a) => s + a.songCount, 0);
writeFileSync(MANIFEST_PATH, JSON.stringify({
  builtAt: new Date().toISOString(),
  totalArtists: Object.keys(artists).length,
  totalSongs,
  artists,
}, null, 2));
console.log(`manifest: ${Object.keys(artists).length} artists, ${totalSongs} songs`);
