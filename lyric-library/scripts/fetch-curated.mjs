// Fetch songs from Genius based on curated/songs.jsonl. Resumable.
// Usage: node lyric-library/scripts/fetch-curated.mjs [--tier mirror,canon] [--max 500]
//
// Reads:
//   curated/songs.jsonl — entries: {mode:"top",artist,n,...} or {mode:"picks",artist,titles,...}
//                        skip entries with reject:true
//   raw/<slug>.json     — existing fetched data (resumable: skips already-fetched titles)
//
// Writes:
//   raw/<slug>.json     — gitignored / vercelignored (full lyrics, internal use)
//   manifest.json       — committed; bookkeeping artifact (artist + song titles + stats)

import Genius from "genius-lyrics";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RAW_DIR = resolve(ROOT, "raw");
const CURATED_PATH = resolve(ROOT, "curated", "songs.jsonl");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");

const env = readFileSync(resolve(ROOT, ".env"), "utf8");
const TOKEN = env.match(/GENIUS_TOKEN=(\S+)/)?.[1];
if (!TOKEN) throw new Error("GENIUS_TOKEN not found in lyric-library/.env");

// CLI flags
const args = process.argv.slice(2);
const tierArg = args.find(a => a.startsWith("--tier="))?.split("=")[1];
const allowedTiers = tierArg ? new Set(tierArg.split(",")) : new Set(["mirror", "canon", "stretch"]);
const MAX = Number(args.find(a => a.startsWith("--max="))?.split("=")[1] ?? Infinity);

const Client = new Genius.Client(TOKEN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLEEP_MS = 1200; // ~50 req/min, well under Genius's typical limits

if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

function slugify(s) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
}

function loadExisting(slug) {
  const p = resolve(RAW_DIR, `${slug}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function alreadyHasTitle(existing, queryTitle) {
  if (!existing?.songs) return false;
  const target = norm(queryTitle);
  // Dedup on queryTitle (what we asked for) so resume after a partial match
  // doesn't re-query and double-up. Fall back to title for legacy data.
  return existing.songs.some(s => norm(s.queryTitle ?? s.title) === target);
}

// Heuristic: reject obvious-bad matches where Genius returned an article,
// chart list, or unrelated content instead of the song we asked for.
function isLikelyBadMatch(queryTitle, matchedTitle) {
  const q = norm(queryTitle);
  const m = norm(matchedTitle);
  // Article/list patterns: "100 Best Albums", "Songs of YYYY", chart titles
  if (/(\d{2,3}best|bestalbums|bestsongs|topsongs|charts?|tracklist|review|articles?)/i.test(matchedTitle)) return true;
  // If matched title is wildly longer than query and they share no overlap
  if (m.length > q.length * 4 && !m.includes(q) && !q.includes(m.slice(0, Math.min(q.length, 8)))) return true;
  return false;
}

async function resolveArtist(query) {
  const hits = await Client.songs.search(query);
  const target = norm(query);
  for (const h of hits) {
    if (norm(h.artist?.name ?? "") === target) return h.artist;
  }
  return hits[0]?.artist ?? null;
}

async function fetchTopForArtist(entry, accum) {
  const slug = slugify(entry.artist);
  const credit = entry.artist;
  const existing = loadExisting(slug);
  const out = existing ?? { slug, credit, geniusArtistName: null, fetchedAt: null, songs: [] };

  const stub = await resolveArtist(entry.artist);
  if (!stub) {
    accum.failures.push({ artist: credit, reason: "artist not found" });
    return;
  }
  const artist = await Client.artists.get(stub.id);
  out.geniusArtistName = artist.name;

  const wanted = entry.n;
  const songs = await artist.songs({ sort: "popularity", perPage: wanted });
  console.log(`  ${credit} (top:${wanted}) — got ${songs.length} stubs`);

  let added = 0;
  for (const stub of songs) {
    if (alreadyHasTitle(out, stub.title)) { console.log(`    · ${stub.title} (skip — already have)`); continue; }
    if (accum.fetchedThisRun >= MAX) break;
    await sleep(SLEEP_MS);
    try {
      const lyrics = await stub.lyrics();
      out.songs.push({
        title: stub.title,
        slug: slugify(stub.title),
        year: stub.releasedAt ? Number(String(stub.releasedAt).slice(0, 4)) : null,
        url: stub.url,
        lyrics,
      });
      added++;
      accum.fetchedThisRun++;
      console.log(`    ✓ ${stub.title} (${lyrics.length} chars)`);
    } catch (e) {
      console.warn(`    ✗ ${stub.title}: ${e.message}`);
      accum.failures.push({ artist: credit, title: stub.title, reason: e.message });
    }
  }
  out.fetchedAt = new Date().toISOString();
  writeFileSync(resolve(RAW_DIR, `${slug}.json`), JSON.stringify(out, null, 2));
  console.log(`  → ${slug}.json (+${added}, total ${out.songs.length})`);
}

async function fetchPicksForArtist(entry, accum) {
  const slug = slugify(entry.artist);
  const credit = entry.artist;
  const existing = loadExisting(slug);
  const out = existing ?? { slug, credit, geniusArtistName: null, fetchedAt: null, songs: [] };

  console.log(`  ${credit} (picks:${entry.titles.length})`);
  let added = 0;
  for (const title of entry.titles) {
    if (alreadyHasTitle(out, title)) { continue; }
    if (accum.fetchedThisRun >= MAX) break;
    await sleep(SLEEP_MS);
    try {
      const query = `${title} ${credit}`;
      const hits = await Client.songs.search(query);
      const wantArtist = norm(credit);
      const wantTitle = norm(title);
      // Among artist-matching hits, pick the one whose title best matches the
      // query — substring match preferred, then closest length. Avoids landing
      // on a different song by the same artist when Genius's relevance ranker
      // misfires (e.g. "Ten" → "Free Treasure" both by Lenker).
      const artistHits = hits.filter(h => norm(h.artist?.name ?? "") === wantArtist);
      let match = artistHits.find(h => norm(h.title).includes(wantTitle) || wantTitle.includes(norm(h.title)));
      if (!match && artistHits.length) {
        // No clean substring match — closest length wins as a weak signal
        match = artistHits.sort((a, b) =>
          Math.abs(norm(a.title).length - wantTitle.length) - Math.abs(norm(b.title).length - wantTitle.length)
        )[0];
      }
      if (!match) match = hits[0]; // last resort
      if (!match) {
        console.warn(`    ✗ ${title}: no Genius match`);
        accum.failures.push({ artist: credit, title, reason: "no match" });
        continue;
      }
      // Reject if matched title doesn't share enough with query title.
      const m = norm(match.title);
      const titleOverlap = m.includes(wantTitle) || wantTitle.includes(m) ||
        (wantTitle.length >= 4 && m.length >= 4 && (m.startsWith(wantTitle.slice(0, 4)) || wantTitle.startsWith(m.slice(0, 4))));
      if (isLikelyBadMatch(title, match.title) || norm(match.artist?.name ?? "") !== wantArtist || !titleOverlap) {
        console.warn(`    ✗ ${title}: rejected match → ${match.title} (${match.artist?.name})`);
        accum.failures.push({ artist: credit, title, reason: `bad match: ${match.title}` });
        continue;
      }
      const lyrics = await match.lyrics();
      out.songs.push({
        title: match.title,
        queryTitle: title,           // remember what we asked for, for resume-dedup
        slug: slugify(match.title),
        year: match.releasedAt ? Number(String(match.releasedAt).slice(0, 4)) : null,
        url: match.url,
        lyrics,
      });
      added++;
      accum.fetchedThisRun++;
      console.log(`    ✓ ${title} → ${match.title} (${lyrics.length} chars)`);
    } catch (e) {
      console.warn(`    ✗ ${title}: ${e.message}`);
      accum.failures.push({ artist: credit, title, reason: e.message });
    }
  }
  out.fetchedAt = new Date().toISOString();
  writeFileSync(resolve(RAW_DIR, `${slug}.json`), JSON.stringify(out, null, 2));
  console.log(`  → ${slug}.json (+${added}, total ${out.songs.length})`);
}

function writeManifest() {
  const artistFiles = readFileSync(RAW_DIR, "utf8").split ? [] : []; // placeholder; use readdir
  const { readdirSync } = require("node:fs"); // not allowed in ESM; fallback below
}

async function buildManifest() {
  const fs = await import("node:fs");
  const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith(".json"));
  const artists = {};
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(resolve(RAW_DIR, f), "utf8"));
      artists[data.slug] = {
        credit: data.credit,
        fetchedAt: data.fetchedAt,
        songCount: data.songs?.length ?? 0,
        songs: (data.songs ?? []).map(s => ({
          title: s.title,
          year: s.year,
          url: s.url,
          chars: s.lyrics?.length ?? 0,
        })),
      };
    } catch (e) { console.warn(`  manifest: skip ${f}: ${e.message}`); }
  }
  const totalSongs = Object.values(artists).reduce((s, a) => s + a.songCount, 0);
  return {
    builtAt: new Date().toISOString(),
    totalArtists: Object.keys(artists).length,
    totalSongs,
    artists,
  };
}

// --- main ---
const entries = parseJsonl(CURATED_PATH).filter(e => !e.reject && allowedTiers.has(e.tier));
console.log(`Curated entries to process: ${entries.length} (tiers: ${[...allowedTiers].join(",")})`);

const accum = { fetchedThisRun: 0, failures: [] };
const startedAt = Date.now();

for (const entry of entries) {
  if (accum.fetchedThisRun >= MAX) { console.log(`\n[max=${MAX} reached, stopping]`); break; }
  try {
    if (entry.mode === "top") await fetchTopForArtist(entry, accum);
    else if (entry.mode === "picks") await fetchPicksForArtist(entry, accum);
    else console.warn(`  ? unknown mode: ${entry.mode}`);
  } catch (e) {
    console.error(`!! ${entry.artist} fatal: ${e.message}`);
    accum.failures.push({ artist: entry.artist, reason: `fatal: ${e.message}` });
  }
}

console.log(`\nFetched ${accum.fetchedThisRun} songs, ${accum.failures.length} failures, ${((Date.now() - startedAt) / 1000).toFixed(0)}s elapsed.`);

const manifest = await buildManifest();
manifest.lastRun = { fetchedThisRun: accum.fetchedThisRun, failures: accum.failures, durationSec: Math.round((Date.now() - startedAt) / 1000) };
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`→ manifest.json: ${manifest.totalArtists} artists, ${manifest.totalSongs} songs total.`);
