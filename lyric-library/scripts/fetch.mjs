// Fetch top-N songs per artist from Genius and save raw lyrics JSON.
// Usage: node lyric-library/scripts/fetch.mjs
//
// Reads GENIUS_TOKEN from lyric-library/.env (gitignored).
// Output: lyric-library/raw/<artist-slug>.json (gitignored, .vercelignored).

import Genius from "genius-lyrics";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RAW_DIR = resolve(ROOT, "raw");

const env = readFileSync(resolve(ROOT, ".env"), "utf8");
const TOKEN = env.match(/GENIUS_TOKEN=(\S+)/)?.[1];
if (!TOKEN) throw new Error("GENIUS_TOKEN not found in lyric-library/.env");

// `geniusQuery` is what we search for; `slug` is the on-disk filename and the
// credit shown to the user. Pink Floyd searches go in under Roger Waters,
// per PLAN.md (most Floyd lyrics 1973-83 are his — caveat noted).
const PILOT = [
  { slug: "roger-waters", credit: "Roger Waters", geniusQuery: "Pink Floyd" },
  { slug: "adrianne-lenker", credit: "Adrianne Lenker", geniusQuery: "Adrianne Lenker" },
  { slug: "sufjan-stevens", credit: "Sufjan Stevens", geniusQuery: "Sufjan Stevens" },
];

const SONGS_PER_ARTIST = 10;

if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

const Client = new Genius.Client(TOKEN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveArtistId(query) {
  // No artist-search endpoint exposed; piggyback on song search and read
  // the artist off the top hit whose artist.name fuzzy-matches the query.
  const hits = await Client.songs.search(query);
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
  const target = norm(query);
  for (const h of hits) {
    if (norm(h.artist?.name ?? "") === target) return h.artist;
  }
  return hits[0]?.artist ?? null;
}

async function fetchArtist({ slug, credit, geniusQuery }) {
  console.log(`\n=== ${slug} (searching "${geniusQuery}") ===`);
  const artistStub = await resolveArtistId(geniusQuery);
  if (!artistStub) {
    console.warn(`  ✗ no artist match`);
    return;
  }
  const artist = await Client.artists.get(artistStub.id);
  console.log(`  matched: ${artist.name} (id=${artist.id})`);

  const songs = await artist.songs({ sort: "popularity", perPage: SONGS_PER_ARTIST });
  console.log(`  fetched ${songs.length} song stubs`);

  const out = {
    slug,
    credit,
    geniusArtistName: artist.name,
    fetchedAt: new Date().toISOString(),
    songs: [],
  };

  for (const stub of songs) {
    await sleep(1100);
    try {
      const lyrics = await stub.lyrics();
      out.songs.push({
        title: stub.title,
        slug: slugify(stub.title),
        year: stub.releasedAt ? Number(String(stub.releasedAt).slice(0, 4)) : null,
        url: stub.url,
        lyrics,
      });
      console.log(`    ✓ ${stub.title} (${lyrics.length} chars)`);
    } catch (e) {
      console.warn(`    ✗ ${stub.title}: ${e.message}`);
    }
  }

  const outPath = resolve(RAW_DIR, `${slug}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`  → wrote ${outPath} (${out.songs.length} songs)`);
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

for (const a of PILOT) {
  try { await fetchArtist(a); }
  catch (e) { console.error(`!! ${a.slug} failed:`, e); }
}
console.log("\nDone.");
