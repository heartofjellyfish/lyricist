# Mosaic Rhyme — design plan

*Last updated: 2026-07-09. Status: **v1 shipped** (see "As-built" below).
Implementer notes retained as the design record; deviations documented.*

## As-built (2026-07-08, object gate 2026-07-09) — deviations from the plan below

Five things changed during the mockup-review pass with the user. The rest
of this doc is accurate; these override where they conflict.

1. **Grammatical head gate (pulled forward from v2).** The plan shipped
   raw generation and deferred plausibility to v2 bigrams. In practice the
   raw output was full of trash — `oh it`, `no it`, `radio it`,
   `scott her`, `apricot her` — because heads were ranked by familiarity,
   not grammar. Fix: a mosaic head must be a **verb** (the productive
   pattern is *verb + pronoun/particle*: `know it`, `bought her`,
   `hit me`, `run me`). `scripts/buildMosaicVerbs.mjs` bakes WordNet verbs
   + irregular pasts (`got`/`bought`/`caught`) + regular inflections,
   intersected with CMU, into `rhyme-finder/wordlists/mosaic-verbs.json`
   (~24k forms). `generateMosaics` gates every head via `deps.isVerb` in
   `buildHeadIndex`. This is NOT the v2 bigram ranker — it's a cheap POS
   gate that kills the obvious trash. v2 bigram plausibility (§11.2) still
   wanted for ranking `hold me` over `mold me` and for the additive-tier
   fragments (`got for`, `lot your`) that the verb gate alone lets through.

   **1b. Object-class gate (2026-07-09).** POS alone still shipped
   `weekend her` / `pretend her` / `spend her` as top mosaics for
   *surrender* — verbs, but ones that can't take a person object
   (weekend is intransitive; pretend takes clauses; spend takes things).
   `buildMosaicVerbs.mjs` now bakes a per-form bitmask from WordNet's
   sentence frames (`{form: mask}`, bit 1 = somebody-object frames
   9/14/17/18/20/24/25/30, bit 2 = something-object frames
   8/11/15/16/19/21/31; frame 10 excluded — its subject is a thing, the
   causative "the tent sleeps four" reading). Tail table rows carry
   `obj: "person"` (her/them/him/me/you/us) or `obj: "thing"` (it);
   `generateMosaics` checks `headEntry.objMask & fw.objMask` at pair
   time via `deps.verbObjectMask`. Accepted casualties (WordNet lists no
   somebody-frame): `bend her`, `end her`, `transcend her` — same trade
   as the classifier's OW2 rainbow/elbow.

   **1c. Attestation gate for non-object-pronoun tails (2026-07-09).**
   The object gate cleaned up the pronoun tails, but the ADDITIVE tier was
   still a wall of fragments: `spend for`, `weekend your`, `bend there`,
   `pretend are`, and for other words `low at` (poet), `call so` (follow),
   `tell so` (yellow). Root cause: only object-pronoun tails have a
   grammatical model (the verb-frame gate) telling us the combination is a
   natural line-ending. A preposition / possessive / locative / conjunction
   / auxiliary tail has none — the ONLY signal that `die for` works but
   `spend for` doesn't is corpus attestation. So `generateMosaics` now
   gates every tail WITHOUT `obj` on `deps.isAttested(display)`: it must
   end a real song line (be in `mosaic-phrases.json`) to surface. Object-
   pronoun tails keep speculative generation. A 10-word audit found zero
   false kills (every un-attested func-tail combo was junk) and kept every
   good one (`end there`, `get there•7`, `know that•17`, `fought for`).
   Side effects: (a) `follow`/`yellow` now emit **zero** mosaics — better
   than `call so`/`tell so`; (b) this SUBSUMES the aux-twin problem — the
   ER0 twin `pretend are` is un-attested, so gating `pretend her` can't
   promote it (no separate `aux` demotion needed; that plumbing was
   removed); (c) the **geminate join type goes dormant** — geminates are
   consonant-initial-tail-only, hence always function tails, so with no
   attested geminate in the corpus today they produce no output. The
   `matchTail` mechanism stays; re-add a fixture when one attests.

2. **Corpus attestation (the "everyday" filter + mosaic red dots).** The
   verb gate (1) kills grammatical trash but still leaves phrases that are
   grammatical yet not everyday (`caught there`, `snow it`). The real
   discriminator is the lyric corpus: a phrase that actually ENDS LINES in
   real songs is everyday AND has a genuine song reference. `scripts/
   buildMosaicPhrases.mjs` builds `wordlists/mosaic-phrases.json` (line-end
   verb+function bigrams → {song count, sample quotes}). rhymeFinder attaches
   `{songs, quotes}` to each mosaic. This subsumes what v2's bigram
   plausibility (§11.2/§11.3) was for.

3. **Placement: own "MOSAIC RHYME" black label, a peer of the syllable
   groups.** §8 recommended a standalone section; intermediate passes tried a
   labelled sub-block, then blending chips into the syllable groups. The
   user's final call: give mosaics their **own black label "MOSAIC RHYME"**
   styled exactly like "2 SYLLABLES"/"3 SYLLABLES" and treat it identically —
   no per-chip tag, no headline "＋N", no filter. Attested mosaics are the
   default row (red dot + real song quotes); un-attested ones are the group's
   "lower" row behind its show-more. By the tier invariant (see §Invariants)
   this label only ever appears in the perfect + additive tiers.

   Invariants (verified 2026-07-08, useful for future iteration): mosaics are
   feminine-only (masculine → `[]`) and land ONLY in perfect + additive
   (never family/subtractive) — heads matched on an exact rhyme-tail key ⇒
   stressed syllable always perfect ⇒ the JOIN decides the tier (exact/
   geminate → perfect, additive-onset → additive). Their VALUE is inversely
   proportional to single-word supply (`poet`: 2 single perfects, 6 attested
   mosaics — a lifeline; `water`: 18+47 singles — a bonus), which is the
   lever for any future "surface more prominently when supply is thin".

4. **Dup-twin suppression.** A phrase can arise as a perfect (weak "'er")
   AND a lower additive (audible "her") with identical display. Kept only
   the best-ranked reading per display string.

5. **`delta / felt to` (§10 geminate fixture) is shadowed.** The
   identical-sounding `felt a` (exact join, same `F EH L T AH` phonemes)
   wins the dedup on join quality, so `felt to` never surfaces — faithful
   to the §5.4 dedup spec, which the plan's fixture didn't anticipate. The
   geminate MECHANISM is correct and surfaces where unshadowed
   (`splendid / spend did`, `candid / hand did`). Test fixtures use those.

Original plan follows. (Implementer: still read CLAUDE.md §"Lyric corpus &
derived wordlists" — the derived-rebuild protocol applies, see §9.)

---

## 1. What & why

Mosaic (compound) rhyme: a **multi-word combination** rhyming with a
single word — `poet / know it`, `letter / get her`, `water / bought
her`, `reminder / find her`, `spaghetti / forget me`. Pattison covers it
as the standard technique for manufacturing feminine rhymes when the
single-word supply runs dry. It's the single most-requested capability
the tool lacks, and no mainstream rhyme site does it well with honest
tier labels.

Two user-facing directions, shipped together:

- **Direction A — phrase input.** User types `bought her`; the tool
  pronounces the phrase as one unit and runs the normal search →
  `water`, `daughter`, `otter`…
- **Direction B — mosaic generation.** User types `water`; alongside
  the normal tiers the tool *generates* `bought her`, `got her`,
  `shot her`… as a "Mosaic" section, each graded on the real Pattison
  scale by the real classifier.

Key property of the whole design: **mosaics are pseudo-words fed
through the existing classifier**, not a parallel taxonomy. A mosaic
lands in perfect/family/additive exactly like a dict word would. We
generate candidates; `classifyRhyme`'s logic keeps us honest.

Linguistic scope note: mosaic rhyme is inherently a **feminine-ending**
phenomenon (the tail word carries post-stress material). Masculine
sources (`cat`, `outside`) correctly get zero mosaics — `in time /
sublime` is NOT a mosaic (the rhyme span never crosses the word
boundary; that's just `time` rhyming). Don't fight this; hide the
section when empty.

## 2. Scope

**v1 (this plan):**
- **Bundled classifier fix** (prerequisite, standalone value): trailing
  weak-vowel canonicalization — §4b. Without it the flagship mosaic
  `know it / poet` classifies as assonance because of a CMU marking
  artifact, and everyday single-word pairs like `created / awaited`
  are wrongly demoted today.
- Phrase input, 2–4 words, space-separated, all words in CMU dict.
- Generated mosaics: exactly 2 words = `<content head word> +
  <function tail word>`. Tail from a curated function-word table with
  weak forms (h-dropping: *her → 'er*, *them → 'em*).
- Join types: exact, geminate (shared boundary consonant), additive
  onset (tail contributes one extra consonant — the `city / hit me`
  workhorse; surfaces in the additive tier, which is honest).
- Kept tiers for mosaics: perfect, family, additive, subtractive.
  Dropped: assonance/consonance (flood, low value), identity
  (homophone mosaics like `a tension / attention` — cute, not rhymes).

**Explicitly out (v2 backlog, §11):** family-substituted heads
(`from me / money`, `stop her / water`), content-word tails (`get tea /
spaghetti`), 3+-word mosaics, corpus-bigram plausibility ranking,
mosaic quote lookups.

## 3. Architecture & the rules that constrain it

New module: **`rhyme-finder/src/mosaicRhyme.js`** — function-word
table, phrase assembly, split enumeration, tail matching, generation.

Hard constraints (all from CLAUDE.md, all learned the hard way):

1. **Single-anchor / single-normalization rule.** mosaicRhyme.js
   implements NO anchoring, NO phoneme normalization, NO trailing
   comparison of its own. It imports everything phonetic from
   `rhymeClassifier.js` / `pronunciation.js`. The one new derived thing
   it may compute is a *lookup key string* (digit-stripped join of an
   already-anchored rhyme tail — §5.2), which is a formatting
   transform, not new logic.
2. **The derived-staleness guard** (`test/derivedConsistency.test.js`)
   hashes `rhymeClassifier.js` + `pronunciation.js`. The classifier
   seam (§4) touches rhymeClassifier.js, so the same commit MUST rerun
   `node scripts/buildLyricBuckets.mjs` (a pure restamp — verify the
   only diff in `wordlists/lyric-library/index.json` is the hash line;
   bucket contents must NOT change, since anchor logic doesn't).
   Keep ALL mosaic logic out of the two hashed files beyond the
   minimal seam, so future mosaic iteration doesn't re-trip the guard.
3. **Dict-wide-transform fixture rule.** Phrase destressing (§6) is a
   pronunciation transform; it ships with fixtures for both sides of
   its boundary in the same commit (§10).
4. PRONUNCIATION_MAP is **never mutated** with pseudo-entries. Mosaic
   pseudo-words exist only as analysis objects passed through the seam.

Data flow:

```
findRhymes({word})
  ├─ source = single word ? analyzeWord(word)
  │           phrase (has space) ? analyzeFromPhonemes(word, assemblePhrase(word))
  ├─ existing scan/classify/bucket pipeline  (unchanged semantics)
  └─ mosaics = generateMosaics(sourceAnalysis, corpusEntries, deps)   ← new
returns { source, buckets, mosaics }
```

## 4. Classifier seam (the only rhymeClassifier.js change)

Mechanical, behavior-preserving refactor + exports. Golden suite must
pass untouched.

```js
// analyzeWord(word) === analyzeFromPhonemes(word, phonemesFor(word))
export function analyzeFromPhonemes(label, phonemes)   // body of analyzeWord after lookup

// classifyRhyme(a, b) === classifyRhymeAnalyzed(analyzeWord(a), analyzeWord(b))
export function classifyRhymeAnalyzed(aAnalysis, bAnalysis)
```

Notes for the refactor:
- The analysis object already carries `word` (the label); inside
  `classifyRhymeAnalyzed`, replace `wordA`/`wordB` string uses with
  `a.word`/`b.word` (return-object fields, explanation strings, and the
  `sameSpelling` check via `normalizeWordKey(a.word) ===
  normalizeWordKey(b.word)` — a phrase label like `"know it"` passes
  through `normalizeWordKey` (lowercase) harmlessly).
- The identity logic needs zero changes and is load-bearing for
  mosaics: `phonemesEqual` catches `a tension / attention`;
  `sameStressedSyllable` catches head-word identity leaks.
- Also `export { trailingsMatch }` — §5.3 reuses it for tail matching
  (digit-blind + final-IH/IY canonicalization, exactly the tolerance
  mosaic tails need). Do not reimplement it in mosaicRhyme.js.
- `analyzeFromPhonemes` must run `rhymeAnchorIndex` on the
  *concatenated* phrase phonemes (it already does, via
  `lastStressedVowelIndex`) — artifact rules apply to pseudo-words for
  free.

### 4b. Trailing weak-vowel canonicalization (bundled classifier fix)

CMU marks the reduced vowel of unstressed trailing syllables randomly
as IH0 or AH0 — the same sound, two spellings. Measured against this
repo's dict (2026-07-07): **13,445 words** with trailing `IH0 + C`
vs **19,269** with `AH0 + C`, and **1,097 rhyme families split down
the middle** by the marking. Concrete casualties, all currently
demoted to assonance by the strict trailing comparison:

- `hated/created/elated (AH0 D)` vs `waited/abated/baited (IH0 D)` —
  yes, **waited/hated is "assonance" today** (verified 2026-07-08)
- `instructed/constructed (AH0 D)` vs `inducted/deducted (IH0 D)`
- `habit/abbot (AH0 T)` vs `cohabit/babbitt (IH0 T)`
- and the mosaic flagship: `poet (P OW1 AH0 T)` vs assembled
  `know it (N OW1 IH0 T)`.

This is the same artifact class as the two rules already documented in
CLAUDE.md (final IH/IY `_Y` canonicalization; word-final OW2 fake
secondary): fix the algorithm once, don't patch data. The weak-vowel
merger (unstressed /ɪ/ ~ /ə/) is standard for the tool's American
target accent.

**The change** — one line in `trailingToken` (rhymeClassifier.js:454):
after the existing `_Y` branch, canonicalize vowel token `IH → AH`:

```js
function trailingToken(phoneme, isLast) {
  if (isLast && Y_SUFFIX_VOWELS.has(phoneme)) return "_Y";
  const m = phoneme.match(VOWEL_RE);
  if (m) return m[1] === "IH" ? "AH" : m[1];   // ← weak-vowel merger
  return phoneme;
}
```

Blast-radius analysis (verified against the code):
- Exactly two live call sites: `trailingsMatch` (tier gate) and
  `trailingNucleiCompatible` (feminine-assonance gate). Both loosen
  ONLY for pairs identical up to IH↔AH — the intended class.
  (`trailingNucleusFamily` / `trailingTerminal` / the
  `UNSTRESSED_VOWEL_FAMILY` map are dead code as of July 2026 — no
  callers; leave or delete, but don't let them mislead you.)
- Word-final position unaffected: final IH0/IH2 already hit the `_Y`
  branch first; IY is NOT merged (final IY0 → `_Y`, non-final IY stays
  `IY`), so `lonely/broken` (IY vs AH) stays blocked and the
  happy-vowel logic is untouched. This asymmetry is deliberate: FINAL
  unstressed IH groups with the happy vowel (`-y` = [i]), while
  NON-final unstressed IH groups with schwa — two different reduction
  targets in American English.
- Terminal consonants still gate: `dreaming (IH0 NG)` vs
  `demon (AH0 N)` still mismatch on NG≠N.
- `rhymeKeyOf` untouched → bucket filenames, quote lookups, SEO page
  keys all stable. This is a *comparison* change, not a *key* change.
- Per the CLAUDE.md dict-wide-transform rule, this ships with
  both-sides fixtures in the same commit (§10).

## 5. Direction B — mosaic generation

### 5.1 Definitions

Let `R` = source rhyme part = `source.phonemes.slice(anchorIdx)`
(stressed vowel onward). Generation applies only when
`source.trailing.length > 0` (feminine); else return `[]`.

A **split** at position `i` (1 ≤ i < R.length) divides R into
`head = R[0..i)` (contains the stressed vowel) and `tail = R[i..]`.

A mosaic = `headWord + tailWord` where:
- `headWord` is a corpus word whose entire rhyme tail matches `head`
  (so the word *ends* exactly with `head` — guaranteed by rhyme-key
  equality, §5.2), and
- `tailWord` is a function word one of whose variants matches `tail`
  (§5.3).

### 5.2 Head index

One-time lazy index over the finder's existing corpus entries
(`buildCorpus()` output — reuse, don't rebuild):

```
headKey(entry)  = entry.rhymeTail.join("_").replace(/[012]/g, "")
HEAD_INDEX      = Map<headKey, entry[]>       // built on first generateMosaics call
query           = head.join("_").replace(/[012]/g, "")
```

Digit-blind on purpose: the stressed-vowel digit (1 vs 2) and trailing
digits are noise per the classifier's own rules; a digit-exact key
would split e.g. OW1/OW2 anchors. For symmetry with §4b, vowels at
every position EXCEPT the first (the anchor — stressed IH1 must stay
distinct from AH1) also map IH→AH in the key. This key exists ONLY as
a Map lookup string inside mosaicRhyme.js — it is not `rhymeKeyOf`,
never touches bucket filenames or storage.

Since `entry.rhymeTail` comes from `rhymeAnchorIndex` (already the
case in `buildCorpus`), head matching inherits artifact-awareness and
the merger for free.

Head quality gate (mosaics need stricter quality than the main lists —
a junk head kills the feature's feel):
- `isAcceptableWord(...)` (existing filter), and
- lyric-familiarity `score > 0` (in lyric corpus, or common-rank <
  7000), and
- `headWord !== source word` (also reject `headWord` equal to any
  constituent of a phrase source).
Order candidates by score desc and take at most `HEADS_PER_SPLIT = 60`
before assembly, to bound work.

### 5.3 Function-word tail table + matching

Module-level data in mosaicRhyme.js. Each entry: display word +
ordered pronunciation variants, **stress digits all 0** (critical —
a tail variant with digit 1/2 would steal the pseudo-word's anchor).
Variants are written in citation ARPAbet and passed through
`normalizePhonemes()` once at module init (so e.g. `off` AO0 F → AA0 F
follows the merger; pre-R AO like `or/for/your` stays AO per the
NORTH/FORCE exception — but those get weak `ER0` variants anyway,
which is what actually matches trailings).

Table order = ranking priority. First variant = canonical reduced form
(also used by phrase input, §6). `weak: true` marks variants that
differ from citation (h-drop etc.) so the UI can hint *(got 'em)*.

| word | variants (destressed) | notes |
|---|---|---|
| it | `IH0 T` | the classic: know it / poet |
| her | `ER0` (weak) · `HH ER0` | h-drop: get her → *get 'er* / letter |
| them | `AH0 M` (weak, "'em") · `DH AH0 M` | got them → *got 'em* / bottom |
| him | `IH0 M` (weak) · `HH IH0 M` | |
| his | `IH0 Z` (weak) · `HH IH0 Z` | |
| me | `M IY0` | additive workhorse: hit me / city |
| you | `Y AH0` (weak, "ya") · `Y UW0` | |
| us | `AH0 S` | |
| a | `AH0` | only bare-schwa tail: loaf a / sofa; ranks last |
| of | `AH0 V` · `AH0` (weak, "o'") | |
| to | `T UW0` · `T AH0` (weak) | wanted to — legit line-end |
| and | `AH0 N` (weak, "'n'") · `AH0 N D` | |
| in | `IH0 N` | |
| on | `AA0 N` | post-merger spelling of AO0 N |
| at | `AH0 T` · `AE0 T` | |
| up | `AH0 P` | |
| out | `AW0 T` | |
| off | `AA0 F` | |
| all | `AA0 L` | |
| is | `IH0 Z` | |
| as | `AH0 Z` | |
| was | `W AH0 Z` | |
| are | `ER0` | |
| or | `ER0` | |
| for | `F ER0` | |
| your | `Y ER0` | |
| from | `F R AH0 M` | |
| one | `W AH0 N` | |
| some | `S AH0 M` | |
| my | `M AY0` | |
| by | `B AY0` | |
| so | `S OW0` | |
| do | `D UW0` · `D AH0` | |
| did | `D IH0 D` | |
| can | `K AH0 N` | |
| will | `W AH0 L` | |
| not | `N AA0 T` | |
| what | `W AH0 T` | |
| that | `DH AH0 T` | |
| this | `DH IH0 S` | |
| there | `DH ER0` (weak) | |

(~40 words. Data, not code — extend/prune freely; an edit needs a
fixture only if it exercises a new *mechanism*. Deliberately excluded:
`he/she/we` (subject pronouns — verb+subject finals like "hit he" are
ungrammatical junk; the real pattern "did he →
did 'e" needs 2-word tails, v2) and `the/an` (never line-final).
Expect a taste-pruning pass with the user during mockup review —
grammatical-position plausibility is a judgment call the table
encodes, not the algorithm.)

**Tail matching** — for each split tail `T` and each variant `V`:

- **exact**: `trailingsMatch(V, T)` → join quality `exact`.
- **onset-added**: `V.length === T.length + 1` and `V[0]` is a
  consonant and `trailingsMatch(V.slice(1), T)`:
  - if `V[0] === R[i-1]` (digit-free compare; only fires when `R[i-1]`
    is a consonant) → `geminate`: the variant's initial consonant
    *reuses* the head word's final consonant, pronounced once —
    *felt to / delta* ([fɛl.tə]), *left him / rhythm*-style joins;
  - else → `additive-onset` (*hit **m**e / city*; the classifier will
    grade the pair additive because the extra consonant lands in the
    pseudo-word's coda/trailing — exactly right).

`trailingsMatch` is the imported classifier helper — digit-blind,
final IH/IY canonicalized, and (after §4b) weak-vowel IH↔AH tolerant.
That last property is what lets the single `it = IH0 T` variant match
both `summit`-style `IH0 T` tails and `poet`-style `AH0 T` tails — no
twin variants in the table, one mechanism, one place. No local
comparator in mosaicRhyme.js, ever.

### 5.4 Assembly, classification, filtering

For each `(headEntry, fwWord, variant, joinType)`:

```js
const tailPart = joinType === "geminate" ? variant.slice(1) : variant;
const phonemes = [...headEntry.phonemes, ...tailPart];   // the variant MATCHED, not citation
const label    = `${headEntry.text} ${fwWord}`;
const analysis = analyzeFromPhonemes(label, phonemes);
const cls      = classifyRhymeAnalyzed(sourceAnalysis, analysis);
```

Two assembly rules, both load-bearing:

- **Matched variant, not citation.** `bought her / water` classifies
  **perfect** with the weak `ER0` (citation `HH ER0` would pollute the
  coda into additive). The anchor stays on the head word's stressed
  vowel because variants carry no 1/2 digits.
- **Geminate joins degeminate.** English collapses the doubled
  consonant across the boundary (*felt to* = [fɛl.tə], one T), so the
  assembled pseudo-word drops the variant's initial consonant —
  `felt + [AH0]`, not `felt + [T AH0]`. Without this the classifier
  sees coda `L T T` vs `L T` and wrongly demotes a perfect-sounding
  join to additive.

Keep iff `cls.isRhyme && ["perfect","family","additive","subtractive"].includes(cls.type)`.
The identity drop is automatic (`isRhyme === false`).

**Dedup key: `(headWord, matched-tail token string)`** — NOT
`(headWord, fwWord)`. Several function words share weak-form
pronunciations (`her`/`are`/`or` all reduce to `ER0`; `it`/`at` both
match an `AH0 T` tail via §4b), and without token-level dedup the list
reads `find her / find are / find or`. Winner per key: best join
quality (exact > geminate > additive-onset), then table priority — so
`her` beats `are`, `it` beats `at`, and only one row survives.

### 5.5 Ranking & caps

Sort: tier (perfect → family → additive → subtractive) → joinType
(exact → geminate → additive-onset) → head `lyricScore` desc → table
priority of the tail word → alphabetical. Reuse the existing
default/lower tier convention: first `MOSAIC_DEFAULT = 16` rows tagged
`tier: "default"`, remainder up to `MOSAIC_CAP = 48` tagged `"lower"`
behind the same show-more affordance.

Emitted row shape (superset of a bucket candidate, so main.js can
reuse row rendering):

```js
{ words: ["bought","her"], display: "bought her", type: "perfect",
  joinType: "exact", weakForm: true,           // matched a weak variant
  stability, explanation,                       // from cls
  syllables, score, tier }                      // head-word signals
```

### 5.6 Cost

Splits ≤ ~4 × ~70 variants × O(len) trailingsMatch, plus ≤ 4 Map
lookups, plus ≤ (60 heads × matched-variant count) classifier calls —
a few hundred `classifyRhymeAnalyzed` invocations, noise next to the
existing 126k-entry scan. HEAD_INDEX build is one pass over
CORPUS_ENTRIES, once per session, lazy on first eligible search.

## 6. Direction A — phrase input

In `findRhymes`, before `analyzeWord`:

- Detect phrase: trimmed query contains whitespace. Split on `/\s+/`,
  lowercase, max 4 words (friendly error beyond).
- Each word must be in the dict; error message names the missing word
  (reuse the existing not-in-dictionary error path).
- **Destress rule:** words in the function-word table contribute their
  canonical reduced variant (`variants[0]`); content words contribute
  citation phonemes. Concatenate in order.
  - Boundary fixture pair (transform rule, CLAUDE.md): `know it`
    anchors on OW1 (function word destressed — IH1 T would have stolen
    the anchor); `gold rush` anchors on AH1 of *rush* (content words
    untouched).
  - All-function-word phrase (`of it`): if destressing leaves no 1/2
    digit anywhere, use the LAST word's citation phonemes instead of
    its reduced variant so an anchor exists.
- `source = analyzeFromPhonemes(rawPhrase, concatenated)`; the scan
  loop classifies via `classifyRhymeAnalyzed(source,
  analyzeWord(entry.text))`. (Recommended: switch the loop to the
  analyzed path for single words too — one code path; goldens verify
  equivalence.)
- Skip candidates equal to any constituent word of the phrase.
- Mosaic generation (Direction B) runs on phrase sources too — same
  code, `bought her` finds `got her`.
- `?q=` boot param already URL-encodes; make sure the input prefill
  path doesn't reject spaces. SEO page generation stays single-word.

## 7. rhymeFinder.js integration

- `buildCorpus()` unchanged in output; expose entries to
  `generateMosaics` via direct call (mosaic gen invoked from
  `findRhymes`, passing `CORPUS_ENTRIES`, `isAcceptableWord`,
  `lyricScore`/COMMON_RANK accessors as deps — one-way dependency
  `rhymeFinder → mosaicRhyme`, no cycle).
- `findRhymes` returns `{ source, buckets, mosaics }`. `mosaics: []`
  for masculine sources.
- `prewarm()` unchanged.

## 8. UI (main.js) — content spec; visuals go through mockup-first

Per the established review flow, the implementer should produce a
standalone mockup of the section (2–3 placement/density options) for
the user to pick from BEFORE wiring main.js. Content requirements:

- New section rendered from `result.mosaics`, hidden entirely when
  empty. Recommended placement: after the tier sections (it's a bonus
  layer, like the not-rhymed quotes layer — discoverable, not
  competing with perfect/family up top). Final call = user's, via
  mockup.
- Header: "Mosaic rhymes · N" + info popover in the existing tier-pop
  pattern: one-line Pattison framing (multi-word combos that build
  feminine rhymes; strongest when the joined words sound like one —
  `know it / poet`), plus a note that each entry is graded on the same
  scale as everything else.
- Row: the phrase (`bought her`), the tier dot in the existing color
  language for `type`, and for `weakForm` rows a pronunciation hint in
  the row popover (*sounds like "bought 'er"*), not inline clutter.
- No quote badges / cliché flags on mosaic rows (corpus indexes single
  words only) — do not call `hasQuotes` with phrases.
- Clicking an attested mosaic opens its song popover, matching every
  other chip (shared `installPopoverPin`). (Originally clicking
  re-searched the phrase to close the A/B loop, but that made mosaics
  the only chip that navigated on click — reverted July 2026 for
  consistency.)
- Input affordance: placeholder or helper line mentioning phrases
  ("word or short phrase — *bought her*").

## 9. Derived artifacts & protocol impact

- **Same commit as the classifier seam:** `node
  scripts/buildLyricBuckets.mjs` (hash restamp; verify bucket content
  diff is empty — only the stamp in `wordlists/lyric-library/index.json`
  moves). `node --test test/rhymeClassifier.test.js
  test/derivedConsistency.test.js` green.
- **No new derived artifacts** in v1. Mosaics are generated at
  runtime from the in-memory corpus.
- **SEO pages:** regenerate once after the UI lands
  (`node scripts/buildSeoPages.mjs`) so snapshots pick up BOTH the
  mosaic section AND the §4b single-word tier upgrades
  (created/awaited-class pairs move buckets in page content) —
  content-hashed, so this is the honest-lastmod path. Not blocking
  for function, but the §4b content drift means don't skip it
  indefinitely.
- **Lyric-library indexer: NO corpus re-run needed for §4b.**
  Verified against `lyric-library/scripts/build-index.mjs`: its
  rhymed/not-rhymed tags use the shared anchor + digit-blind
  full-tail equality with a vowel-only assonance fallback — it never
  calls `trailingsMatch`, and IH↔AH line-end pairs already count as
  partners via the fallback. Tags don't move. One hygiene item: the
  indexer's `rhymeKey` comment says its digit-stripping follows the
  "same rule as the classifier's trailingsMatch" — after §4b that's
  no longer the whole story; update the comment (and optionally port
  the IH→AH trailing canonicalization to the indexer's tail
  comparison next time the corpus is rebuilt anyway — it only sharpens
  perfect-vs-assonance partner *preference*, not the tags).
- **CLAUDE.md:** in the landing commit, add mosaicRhyme.js to the
  repo-layout tree and one line to the shared-resources section
  pointing here.

## 10. Test plan — `test/mosaicRhyme.test.js`

Same harness as the golden suite (fetch→fs shim before dynamic
import; copy the prologue of `test/rhymeClassifier.test.js`).

Classifier canonicalization fixtures (§4b — both sides of the
boundary, same commit, per the CLAUDE.md transform rule; these can
live in the existing golden suite):

All "was X" values verified against the current classifier, 2026-07-08.

| pair | expected | side |
|---|---|---|
| waited / hated | perfect (was assonance) | merges |
| created / awaited | perfect (was assonance) | merges |
| instructed / inducted | perfect (was assonance) | merges |
| conducted / abducted | identity — unchanged (same "-ducted" stressed syllable; trailing never enters the identity check) | guard |
| habit / cohabit | identity (stressed-syllable rule wins despite AH0/IH0 trailing split) | guard |
| lonely / broken | not a rhyme (IY vs AH intact) | stays distinct |
| dreaming / demon | assonance-tier at best (NG≠N terminal) | stays distinct |
| china / miner | AH vs ER trailing — no upgrade | stays distinct |
| passion / ashes | assonance (AH0-N vs IH0-Z: terminals differ) | stays distinct |

Generation positives (assert membership + type + joinType):

| source | expected mosaic | tier | join |
|---|---|---|---|
| poet | know it | perfect | exact |
| letter | get her | perfect | exact (weak 'er) |
| water | bought her, got her | perfect | exact (weak + merger interplay) |
| reminder | find her | perfect | exact |
| bottom | got them | perfect | exact (weak 'em) |
| system | missed them | perfect | exact (weak 'em) |
| delta | felt to | perfect | geminate (degeminated assembly) |
| city | hit me | additive | additive-onset |
| spaghetti | forget me | additive | additive-onset |
| money | run me | additive | additive-onset |

Negatives (the other side of every boundary):

- `outside`, `cat` → `mosaics.length === 0` (masculine).
- No `identity` / `assonance` / `consonance` types anywhere in output.
- Seam unit: `classifyRhymeAnalyzed(analyzeWord("attention"),
  analyzeFromPhonemes("a tension", [AH0, T, EH1, N, SH, AH0, N]))`
  → `type: "identity"` (homophone mosaics classified, then dropped).
- Every emitted head word satisfies the score>0 gate (spot-check none
  of the known JUNK_TOKENS appear for a broad source like `water`).

Phrase-input fixtures (destress transform — both sides, same commit):

- `findRhymes({word:"bought her"})` → `water` in perfect bucket;
  `source.masculine === false`.
- `findRhymes({word:"know it"})` → `poet` in perfect bucket (anchor
  OW1, i.e. function word destressed).
- `findRhymes({word:"gold rush"})` → anchors on *rush* (content words
  keep citation stress); `crush` in perfect bucket.
- `findRhymes({word:"of it"})` → no throw (all-function fallback).
- Unknown word in phrase → error message names it.

Seam regression: the §4 refactor alone must be bit-identical
(`classifyRhyme` delegating to the analyzed path). The §4b
canonicalization intentionally changes results ONLY for
IH↔AH-trailing pairs; the existing golden suite is expected to stay
green (spot-audited: passion/ashes, flying/quiet, lonely/voting all
survive on terminal-consonant grounds). If any existing golden flips,
stop and adjudicate it explicitly — do not silently re-pin.

Run: `node --test test/rhymeClassifier.test.js
test/derivedConsistency.test.js test/mosaicRhyme.test.js`

## 11. v2 backlog (deliberately not in v1)

1. **Family-substituted heads** — enumerate Pattison-family variants
   of the head's consonants before HEAD_INDEX lookup (nasal swap gives
   `from me / money`; plosive swap gives `stop her / water` family
   rows). Bounded (family sets ≤6, head codas short); biggest
   quality-per-effort of the backlog.
2. **Corpus-bigram plausibility** — derived `mosaic-bigrams.json`
   (builder over lyric-library, second word ∈ function table) to rank
   `hold me` above `mold me`. Follows the existing derived-artifact
   protocol; adds a CLAUDE.md table row.
3. **Content-word tails** (`get tea / spaghetti`) gated by bigram
   evidence from (2) — without the gate it's junk.
4. 3-word mosaics; mosaic sources matching mosaic results.
5. Homophone-mosaic curio display (`a tension / attention`) as a
   labeled easter egg, never as a rhyme row.
