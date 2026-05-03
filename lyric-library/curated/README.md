# Curated lists — review before fetch

Two JSONL files seed the corpus:

- `songs.jsonl` — songs to fetch from Genius
- `poems.jsonl` — poems to fetch from Project Gutenberg + (later) Poetry Foundation

Each line is one entry. JSONL because it's diffable, line-editable, and
won't get reformatted by JSON tooling.

## How to review

You don't need to read every line. Filter by `tier`:

| Tier | What it is | Review effort |
|---|---|---|
| `mirror` | Matches your stated taste — your 49 + heroes + extensions of stated picks | Skim, ~5 min |
| `canon` | Craft-canonical names every Pattison/Berklee teacher cites | Quick pass, ~15 min |
| `stretch` | Outside your comfort — older standards, narrative hip-hop, soul, translated poetry. Education tier. | Your call, ~10 min |

To **reject** an entry, delete the line or add `,"reject":true` before the
closing `}`. Either works; the fetch script honors both.

To **add** an entry, follow the schema below.

## songs.jsonl schema

Two modes:

```jsonc
// Mode 1: fetch top-N by Genius popularity. Use when popularity ≈ craft.
{"mode":"top","artist":"Some Artist","n":15,"tier":"mirror"}

// Mode 2: fetch specific titles. Use when popularity misleads (Dylan's
// "Lay Lady Lay" beats "Visions of Johanna" on Genius).
{"mode":"picks","artist":"Bob Dylan","titles":["Visions of Johanna","Tangled Up in Blue",...],"tier":"mirror"}
```

## poems.jsonl schema

```jsonc
{"poet":"Wisława Szymborska","title":"The End and the Beginning","source":"copyrighted","tier":"mirror"}
{"poet":"Emily Dickinson","title":"Because I could not stop for Death","source":"gutenberg","tier":"canon"}
```

`source` is `gutenberg` (public domain, fetchable) or `copyrighted`
(I'll figure out a fetch path before pilot — Poetry Foundation public
endpoints, or fall back to title-only with a manual paste path).

## Pilot sampling

For the 500-song pilot, the fetch script will sample across all three
tiers proportionally — not just take the first 500. The 30 existing
pilot songs (Lenker, Waters/Pink Floyd, Sufjan top-10s) are guaranteed
included as a regression check.

## What's NOT here

- Every song by every artist — `mode:"top"` with a count cap is the
  default. Going wider per artist is a one-line edit.
- Strict copyright analysis — for personal use this isn't a blocker.
  The pre-publicize checklist (robots.txt, footer, feature flag) is
  separate.
- Genre balance — corpus is editorial, not representative. Heavy
  on folk/Americana/literary indie because that's where craft lives.
