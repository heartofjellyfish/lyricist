# Handoff — -ire fix follow-ups & recall-audit backlog

_Last updated: 2026-07-08. Branch: `claude/admiring-lalande-67aa17`
(worktree `intelligent-cray-27f85c`). Delete this file once the derived
rebuild lands._

## What's already done (committed on this branch)

- `8522e849` — **-ire family fix** (fire/dire). Dictionary-side only:
  `normalizePhonemes` collapses syllable-final `AY R` → `AY ER0`.
  Live classifier + browser verified (fire → 69 perfect incl. dire/
  admire/retire/aspire/spire). Fixtures + CLAUDE.md audit note in.
- `1d6cc1de` — inflection synthesis in `buildCmuDict.mjs` (prior task).

**Neither is pushed.** `test/derivedConsistency.test.js` is RED by design
until Task 1 below runs.

---

## Task 1 — Derived rebuild for the -ire fix  ⟶ MAIN WORKING COPY, separate session

**Why out-of-band:** mechanical, CPU-heavy, needs `lyric-library/raw/`
(gitignored, only in `/Users/qliu/Documents/New project`, absent from the
worktree). No model reasoning required — don't spend Fable/Opus tokens on it.

**Why it's needed:** `normalizePhonemes` changed, so `rhymeKeyOf()` moved
dire/admire/retire/… from the `AY1_R` bucket into `AY1_ER0`. The live
classifier already reflects this, but the static lyric-quote buckets and
SEO pages still carry the old keys — quote lookups for the moved words
miss until rebuilt.

**Prompt to paste into a new session (run in the main copy):**

> In the main working copy `/Users/qliu/Documents/New project`, on branch
> `claude/admiring-lalande-67aa17` (pull it first), the -ire fix changed
> `rhyme-finder/src/pronunciation.js` so the lyric-library buckets and SEO
> pages are stale (`test/derivedConsistency.test.js` is red). Rebuild the
> derived pipeline and commit the artifacts. Run, in order:
> ```
> node lyric-library/scripts/build-index.mjs
> node scripts/buildLyricFrequency.mjs
> node scripts/buildClicheList.mjs
> node scripts/buildLyricBuckets.mjs
> node scripts/buildSeoPages.mjs
> ```
> Then `node --test test/rhymeClassifier.test.js test/derivedConsistency.test.js`
> must be green. Commit `wordlists/lyric-library/`, `wordlists/lyric-frequency.json`,
> `wordlists/cliche-pairs.json`, `rhyme-finder/rhymes/`, `rhyme-finder/sitemap*.xml`.
> Sanity-check: searching "fire" in `/rhyme-finder/?q=fire` should show
> lyric-quote badges on dire/admire/retire if the corpus has them.
> This is a mechanical rebuild — low reasoning mode is fine.

After this lands, the whole batch (inflections + -ire + rebuild) is one
coherent unit ready for a single push → one Vercel deploy.

---

## Task 2 — IY NEAR-vowel audit (beer/here/seer)  ⟶ separate session, NEEDS reasoning

**Status:** identified, NOT diagnosed. Lower confidence than -ire — this
one has real traps, so it deserves its own focused session (medium/high
reasoning), not a quick patch.

**The mess** (from the July 2026 -ire audit): CMU scatters the NEAR rime
across FOUR keys —
- `IH1_R`: beer, deer, fear, cheer  (CMU records the vowel as lax IH)
- `IY1_R`: here, seer
- `IY1_ER0`: freer
- `AY1_R`: skier (mis-syllabified as ski+er)

**Why it's NOT a copy of -ire:** the 1-vs-2-syllable boundary is genuinely
fuzzy (seer, freer, clearer are said both ways), and IH-vs-IY at NEAR is a
real transcription question, not pure noise. Blindly merging risks a
player=air-class false-homophone regression. Someone needs to decide the
canonical key and the scope guard with fixtures for BOTH sides.

**Starter prompt:**

> Investigate the CMU NEAR-vowel (beer/here/deer/fear) rhyme-key split in
> rhyme-finder. `normalizePhonemes` in `rhyme-finder/src/pronunciation.js`
> currently handles cot/caught (AO→AA) and -ire (AY R → AY ER0). beer=IH1_R,
> here=IY1_R, freer=IY1_ER0, skier=AY1_R — same NEAR rime, four keys.
> First run `node scripts/evalDatamuse.mjs beer here deer year fear tear`
> to quantify the real-word recall gap. Decide whether IH1_R/IY1_R/IY1_ER0
> should unify and on which canonical key, mindful that seer/freer/clearer
> have a real 1-vs-2-syllable ambiguity (don't create false homophones like
> the OW2 rainbow/elbow or a player=air merge). If you change
> normalizePhonemes, add both-sides fixtures to test/rhymeClassifier.test.js
> AND flag that a full derived rebuild is needed (see CLAUDE.md re-run
> protocol). Read the "-ire smoothing" + "Audited siblings" notes in
> CLAUDE.md first — they explain why AY was safe and the others weren't.

---

## Task 3 — `smite` + other one-off dict holes  ⟶ trivial, fold into next override batch

`smite` (night's rhyme) is absent from CMU entirely. One-line override:
`"smite": "S M AY1 T"` in `wordlists/cmu-overrides.json`, then rerun
`node scripts/buildCmuDict.mjs` (overrides feed inflection synthesis).
Not worth a dedicated session — batch with the next override addition.
Re-run `node scripts/evalDatamuse.mjs` afterward to catch siblings.

---

## Keep-here vs take-out — the rule of thumb applied

| Work | Where | Why |
|---|---|---|
| Diagnose a family split (data-driven, needs judgment) | **here** | exploratory, cheap to keep context warm |
| The -ire code fix + fixtures | **here** (done) | small logic change, verify-in-context |
| Full derived rebuild | **out** (main copy) | mechanical + needs raw/ + CPU-heavy — no reasoning value, don't burn premium tokens |
| IY audit | **out** | independent scope, real traps, own focused session |
| smite/one-offs | **out / batched** | trivial, no discussion needed |
