# Stress Lyric Workshop

Stress Lyric Workshop is a local-first lyric ideation tool for writing one-line lyrics that fit a stress pattern exactly.

The current prototype focuses on:

- exact stress matching
- segmentation-aware generation
- optional rhyme targeting
- generating several structurally different candidate lines for revision

## What It Does

You provide:

- a stress pattern such as `da DUM da DUM da dumda da DUM`
- a vibe / image field
- an optional rhyme target

The app tries to return multiple lyric lines that:

- satisfy the stress pattern exactly
- respect a chosen word segmentation
- stay reasonably natural in English
- can optionally land on a rhyme family

## Current Architecture

The system is intentionally split into local deterministic steps and model-driven language steps.

### 1. Local Pattern Parsing

The local engine parses the notation:

- `DUM` = primary stress
- `dum` = secondary stress
- `da` = unstressed

Spacing matters:

- `DUM da` means two separate stress tokens that may or may not belong to one word
- `DUMda` means a compact group that should be realized as one tight unit

### 2. Local Segmentation Planning

The engine enumerates plausible segmentation candidates from the pattern.

Example:

- `da | DUM | da | DUM da | dumda | da | DUM`
- `da DUM | da | DUM da | dumda | da | DUM`
- `da | DUM | da DUM da | dumda | da | DUM`

The important output here is word-boundary planning, not full syntax.

### 3. Local Segment Candidate Banks

For each segment, the engine builds a small bank of candidate words using:

- CMU-derived stress compatibility
- lyric placement overrides
- familiarity / common-word bias
- lightweight contextual constraints

This stage is meant to give the language model useful lanes without forcing brittle hardcoded sentences.

### 4. OpenAI Plan-Conditioned Drafting

For each selected segmentation plan, the model is asked to write several draft lines that:

- match that exact segmentation
- keep one word per segment
- stay close to the requested vibe

The app currently uses OpenAI only as the language generator, not as the stress validator.

### 5. Local Exact Validation

Every model draft is validated locally for:

- exact stress match
- exact segmentation match
- rhyme requirement
- basic local sanity checks

Only validated lines are shown.

## Design Principles

The project is currently guided by these rules:

- Local should own structure.
  Structural work such as parsing, segmentation, stress validation, and rhyme validation is deterministic and stays local.

- The model should own language.
  Word choice, phrasing, and lyric feel are delegated to the model instead of local combinatorics pretending to have taste.

- Segmentation is the main control surface.
  The most useful steering signal is often “where are the word boundaries?” rather than a brittle POS template.

- Prefer scalable heuristics over narrow patches.
  Hardcoded exceptions are allowed only as a last resort.

## Repository Layout

### App

- [`/Users/qliu/Documents/New project/index.html`](/Users/qliu/Documents/New project/index.html)
  Browser UI shell.
- [`/Users/qliu/Documents/New project/styles.css`](/Users/qliu/Documents/New project/styles.css)
  App styling.
- [`/Users/qliu/Documents/New project/src/main.js`](/Users/qliu/Documents/New project/src/main.js)
  UI orchestration and OpenAI flow wiring.

### Core Engine

- [`/Users/qliu/Documents/New project/src/lyricEngine.js`](/Users/qliu/Documents/New project/src/lyricEngine.js)
  Pattern parsing, segmentation, candidate banking, validation, and ranking.
- [`/Users/qliu/Documents/New project/src/lyricConcepts.js`](/Users/qliu/Documents/New project/src/lyricConcepts.js)
  Theme-related helpers.
- [`/Users/qliu/Documents/New project/src/generatedWordnetMap.js`](/Users/qliu/Documents/New project/src/generatedWordnetMap.js)
  Generated lexical/thematic support data.

### OpenAI Integration

- [`/Users/qliu/Documents/New project/src/openaiDrafts.js`](/Users/qliu/Documents/New project/src/openaiDrafts.js)
  Prompt building, OpenAI request handling, and response extraction.
- [`/Users/qliu/Documents/New project/src/localConfig.example.js`](/Users/qliu/Documents/New project/src/localConfig.example.js)
  Example local config.

### Data + Scripts

- [`/Users/qliu/Documents/New project/data/cmu-entries.json`](/Users/qliu/Documents/New project/data/cmu-entries.json)
  Generated pronunciation/stress lexicon.
- [`/Users/qliu/Documents/New project/data/by-compact-pattern.json`](/Users/qliu/Documents/New project/data/by-compact-pattern.json)
  Reverse index by compact pattern.
- [`/Users/qliu/Documents/New project/data/by-spaced-pattern.json`](/Users/qliu/Documents/New project/data/by-spaced-pattern.json)
  Reverse index by spaced pattern.
- [`/Users/qliu/Documents/New project/data/by-rhyme-vowel.json`](/Users/qliu/Documents/New project/data/by-rhyme-vowel.json)
  Reverse index for rhyme browsing.
- [`/Users/qliu/Documents/New project/scripts/buildLexicon.js`](/Users/qliu/Documents/New project/scripts/buildLexicon.js)
  Builds lexicon artifacts.
- [`/Users/qliu/Documents/New project/scripts/buildWordnetMap.js`](/Users/qliu/Documents/New project/scripts/buildWordnetMap.js)
  Builds WordNet-derived map data.
- [`/Users/qliu/Documents/New project/scripts/debug-plan-run.mjs`](/Users/qliu/Documents/New project/scripts/debug-plan-run.mjs)
  Local debug harness for one representative stress-pattern scenario.

### Tests

- [`/Users/qliu/Documents/New project/test/lyricEngine.test.js`](/Users/qliu/Documents/New project/test/lyricEngine.test.js)
- [`/Users/qliu/Documents/New project/test/openaiDrafts.test.js`](/Users/qliu/Documents/New project/test/openaiDrafts.test.js)
- [`/Users/qliu/Documents/New project/test/fixtures/scansionCases.js`](/Users/qliu/Documents/New project/test/fixtures/scansionCases.js)

## Running Locally

Install dependencies:

```bash
npm install
```

Start the browser app:

```bash
npm run dev
```

Then open:

- [http://localhost:5173](http://localhost:5173)

Run tests:

```bash
npm test
```

Useful local debug script:

```bash
node scripts/debug-plan-run.mjs
```

## Current Status

The prototype is now at the point where it can:

- parse and validate stress patterns locally
- generate segmentation-aware OpenAI prompts
- validate returned lines exactly
- usually produce several viable options for common patterns

The main remaining gap is quality, not plumbing:

- improving literary quality
- improving uniqueness across options
- improving how natural the harder segmentation families feel

## Next Likely Directions

- improve final ranking for imagery and lyric quality
- improve segmentation family selection so the top five feel more distinct
- continue reducing token usage without collapsing quality
- strengthen prompt-side control without reintroducing brittle local sentence assembly

### Sentence-to-Stress-Pattern Engine

The stress engine (in `src/stressConstants.js` + `src/lexicon.js` and mirrored in `packages/stress_scansion_core/`) achieves 99%+ effective accuracy on real song lyrics. Remaining known limitation:

- **TODO: Optional LLM validation layer for context-aware heteronyms.** A small number of words (e.g. `there` existential vs. locative, `record` noun vs. verb in context) require sentence-level parsing to resolve correctly. A lightweight LLM pass could double-check stress assignments for these ambiguous cases. Current accuracy without this layer is 99.0% (274 ground-truth words across 4 songs), so this is low priority — the accepted-patterns mechanism already provides wiggle room for most cases.
