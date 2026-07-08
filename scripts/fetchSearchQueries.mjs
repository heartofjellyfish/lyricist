#!/usr/bin/env node
// fetchSearchQueries.mjs — pull what people are searching on rhyme.land from PostHog.
//
// Reads the `search_submitted` event (props: word, found, via) via HogQL and
// aggregates per-word counts + miss rate over a window. This is the DATA half
// of the search-quality audit; the Fable-judgement half consumes its JSON output.
//
// Auth: needs a PostHog *Personal API Key* (phx_...) with Query Read scope.
//   The phc_... token baked into the client HTML is write-only and will 401 here.
//   export POSTHOG_PERSONAL_API_KEY=phx_...
//   (optional) POSTHOG_HOST=https://us.posthog.com   POSTHOG_PROJECT_ID=12345
//
// Usage:
//   node scripts/fetchSearchQueries.mjs [--days 30] [--limit 200] [--json out.json]
//
// Last updated: 2026-07-07

const HOST = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const DAYS = Number(arg("days", "30"));
const LIMIT = Number(arg("limit", "200"));
const JSON_OUT = arg("json", "");

if (!KEY) {
  console.error(
    "✗ POSTHOG_PERSONAL_API_KEY is not set.\n" +
    "  Generate one: PostHog → avatar → Settings → Personal API Keys → Create\n" +
    "  Scopes needed: Query Read (+ Project Read). Then:\n" +
    "    export POSTHOG_PERSONAL_API_KEY=phx_...\n"
  );
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`${HOST}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init.method || "GET"} ${path} → ${res.status} ${res.statusText}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

async function resolveProjectId() {
  if (process.env.POSTHOG_PROJECT_ID) return process.env.POSTHOG_PROJECT_ID;
  const { results } = await api("/api/projects/");
  if (!results?.length) throw new Error("No projects visible to this API key.");
  if (results.length > 1) {
    console.error("Multiple projects found; set POSTHOG_PROJECT_ID to one of:");
    for (const p of results) console.error(`  ${p.id}  ${p.name}`);
  }
  return String(results[0].id);
}

async function hogql(projectId, query) {
  const { results, columns } = await api(`/api/projects/${projectId}/query/`, {
    method: "POST",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  return { results: results || [], columns: columns || [] };
}

async function main() {
  const projectId = await resolveProjectId();

  // Aggregate per searched word: total searches, distinct searchers, miss rate.
  // lower(trim(...)) so "Home", "home " and "home" collapse to one row.
  const query = `
    SELECT
      lower(trim(properties.word)) AS word,
      count() AS searches,
      count(DISTINCT person_id) AS people,
      round(100 * countIf(properties.found = false) / count(), 1) AS miss_pct
    FROM events
    WHERE event = 'search_submitted'
      AND timestamp > now() - INTERVAL ${DAYS} DAY
      AND notEmpty(trim(properties.word))
    GROUP BY word
    ORDER BY searches DESC
    LIMIT ${LIMIT}
  `;

  const { results } = await hogql(projectId, query);
  const rows = results.map(([word, searches, people, miss_pct]) => ({
    word, searches: Number(searches), people: Number(people), miss_pct: Number(miss_pct),
  }));

  const totalSearches = rows.reduce((s, r) => s + r.searches, 0);
  const payload = {
    generatedAt: new Date().toISOString(),
    window_days: DAYS,
    project_id: projectId,
    distinct_words: rows.length,
    total_searches_in_top: totalSearches,
    words: rows,
  };

  if (JSON_OUT) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2));
    console.error(`✓ wrote ${rows.length} words → ${JSON_OUT}`);
  } else {
    // Human-readable table to stderr, machine JSON to stdout (pipe-friendly).
    console.error(`\nTop searches · last ${DAYS}d · ${rows.length} distinct words · ${totalSearches} searches\n`);
    console.error("  rank  searches  people  miss%  word");
    rows.slice(0, 50).forEach((r, i) => {
      const miss = r.miss_pct > 0 ? String(r.miss_pct).padStart(5) : "    ·";
      console.error(
        `  ${String(i + 1).padStart(4)}  ${String(r.searches).padStart(8)}  ${String(r.people).padStart(6)}  ${miss}  ${r.word}`
      );
    });
    console.log(JSON.stringify(payload));
  }
}

main().catch((e) => {
  console.error("✗ " + e.message);
  process.exit(1);
});
