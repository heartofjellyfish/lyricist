#!/usr/bin/env node
// ── IndexNow ping — tell Bing/Yandex/Seznam/Naver about our URLs ─────
// Google ignores IndexNow (sitemap + Search Console covers it); this is
// for the Bing family, which powers DuckDuckGo and Ecosia too.
//
// Run AFTER a deploy that adds or changes /rhymes/ pages:
//   node scripts/pingIndexNow.mjs           # pings everything in the manifests
//   node scripts/pingIndexNow.mjs --dry     # print the payload, don't send
//
// The key file is committed at rhyme-finder/{key}.txt and served at
// https://rhyme.land/{key}.txt via a vercel.json rewrite. Re-running is
// idempotent — IndexNow dedupes; don't ping more than ~once per deploy.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://rhyme.land";
const KEY = "badd805108ef2b535f120c5a5b8549d4";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const rhymesDir = path.join(ROOT, "rhyme-finder", "rhymes");

const manifest = readJson(path.join(rhymesDir, "manifest.json"));
let browse = {};
try {
  browse = readJson(path.join(rhymesDir, "browse-manifest.json"));
} catch {
  browse = {};
}

const urlList = [
  `${SITE}/`,
  ...Object.keys(browse).map((p) => `${SITE}${p}`),
  ...Object.keys(manifest).map((w) => `${SITE}/rhymes/${encodeURIComponent(w)}`),
];

if (urlList.length > 10_000) {
  // IndexNow caps a single POST at 10k URLs — batch if we ever grow past it.
  throw new Error(`${urlList.length} URLs — add batching before pinging`);
}

const payload = {
  host: "rhyme.land",
  key: KEY,
  keyLocation: `${SITE}/${KEY}.txt`,
  urlList,
};

if (process.argv.includes("--dry")) {
  console.log(JSON.stringify(payload, null, 2).slice(0, 2000));
  console.log(`…${urlList.length} URLs total (dry run, not sent)`);
  process.exit(0);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

// 200 = accepted, 202 = accepted (key validation pending) — both fine.
console.log(`IndexNow: HTTP ${res.status} for ${urlList.length} URLs`);
if (res.status >= 400) {
  console.error(await res.text());
  process.exit(1);
}
