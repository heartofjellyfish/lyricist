#!/usr/bin/env node
// ── Open Graph share image · rhyme-finder/og-image.png ──────────────
// Renders rhyme-finder/og-image.svg to a 1200×630 PNG using headless
// Chrome, with the same Google fonts the app uses (Cormorant Garamond
// + DM Mono) so the wordmark/tagline match the live hero. The SVG is
// the source of truth — edit og-image.svg, then rerun this.
//
// Rerun after: a rename, a tagline change, or any og-image.svg edit.
//
// Requirements: Google Chrome installed locally (or CHROME_PATH env)
// and network access (Google Fonts). Usage: node scripts/buildOgImage.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVG_PATH = path.join(ROOT, "rhyme-finder", "og-image.svg");
const OUT_PATH = path.join(ROOT, "rhyme-finder", "og-image.png");
const W = 1200, H = 630;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("No Chrome found. Install Google Chrome or set CHROME_PATH.");
  return found;
}

const svg = fs.readFileSync(SVG_PATH, "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden}svg{display:block}</style>
</head><body>${svg}</body></html>`;

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  args: ["--no-sandbox", "--force-color-profile=srgb"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: OUT_PATH, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`✓ wrote ${path.relative(ROOT, OUT_PATH)} (${W}×${H})`);
} finally {
  await browser.close();
}
