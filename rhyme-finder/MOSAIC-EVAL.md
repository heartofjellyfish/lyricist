# Mosaic rhyme — quality evaluation

*Last updated: 2026-07-09. Companion to `MOSAIC-PLAN.md` (which says what the
gates ARE and why); this doc says how well they WORK, how that was measured,
and what the measurement is worth. Reproduce with `scripts/evalMosaicQuality.mjs`
+ `scripts/evalMosaicDatamuse.mjs`.*

## Why this doc exists

MOSAIC-PLAN's playbook says *"these bugs surface as user screenshots, not test
failures — fixtures only ever cover bug classes already found."* That is a
standing admission that the gate stack had no measurement, only anecdotes. This
is the measurement. It found a bug class (concrete-noun denominals) that four
prior audits missed, and it retired a "known miss" that turned out to be a bad
fixture.

The headline: **~85% of what we show is judged usable, against ~35% for the
only comparable generative tool.** We buy that by showing nothing at all for
half of eligible words.

## Method

Three probes, all reproducible, all offline except the Datamuse fetch.

1. **Generation sweep.** `scripts/evalMosaicQuality.mjs` shims `fetch` to the
   filesystem (same trick as the golden suite) and drives the REAL `findRhymes`
   over 71 feminine probe words (top-50 by lyric frequency + 28 canon words
   from the plan's fixture table) and 12 masculine controls. Emits every mosaic
   with tier, join type, attestation count, head score.

2. **Gate ablation.** The same script under `MODE=raw` (attestation forced
   always-true, every dict word object-licensed) and `MODE=att` (objMask 0
   everywhere → no speculative path). The delta between modes is what each
   evidence path contributes. This is the load-bearing evidence — it is
   deterministic and needs no judge.

3. **Blind human-proxy grading.** 387 candidates drawn from six strata (our
   attested rows, our speculative rows visible by default, our folded rows,
   rows the gates REMOVED, and Datamuse's multi-word output), shuffled, stripped
   of provenance, graded good / borderline / junk by an LLM judge briefed on
   Pattison's taxonomy and on line-final prosody.

Datamuse is the benchmark because it is RhymeZone's engine — the only mainstream
tool that generates multi-word rhymes at all. As with `scripts/evalDatamuse.mjs`,
it is **a diff tool, never a data source.**

### What the judge number is worth — read before quoting it

⚠️ **The 84.5% is a single LLM judge, n=387.** Three judges were launched; two
died on a session limit. Do not treat the surviving one as a panel, and do not
"fix" this by rerunning three judges on the same prompt: **that is
pseudo-replication.** Three instances of one model sharing one prompt have
correlated errors, so a high Fleiss κ would only prove the model agrees with
itself — not that it agrees with a lyricist. The real methodological weakness
(an LLM is not a Berklee instructor) is not treatable by adding LLM judges.

The judge is doing one honest job here: **labelling the ablation.** The ablation
is the evidence. The comparison numbers survive the weakness because the gap is
far larger than any plausible judge bias:

- ours-all 84.5% good (n=200) vs Datamuse 34.8% (n=112) — ~50 points, outside
  any Wilson interval combination at these n.
- gate-removed rows 69.3% junk (n=75) — the gates are cutting where they claim.

If you ever want a number worth publishing, the only upgrade that means anything
is **grading by hand, or by someone who writes songs.** ~40 items is enough.

## Results (2026-07-09, corpus as committed)

### Usability by stratum

| stratum | n | good | good+borderline | junk |
|---|---|---|---|---|
| ours — attested (default row, red dot) | 61 | 86.9% | 91.8% | 8.2% |
| ours — speculative, visible | 51 | 80.4% | 94.1% | 5.9% |
| ours — speculative, folded | 88 | 85.2% | 100% | 0% |
| **ours — all output** | **200** | **84.5%** | **96.0%** | **4.0%** |
| **Datamuse multi-word** | **112** | **34.8%** | 47.3% | **52.7%** |
| removed by our gates (ablation) | 75 | 9.3% | 30.7% | **69.3%** |

The last row is the one that matters: what the gates throw away is 69% junk by
independent judgement, ~9% collateral. That collateral is the documented
rainbow/elbow trade, now quantified rather than asserted.

### Coverage — the price of the quality bar

Of 71 feminine probe words: **36 (51%) produce at least one mosaic**, 31 (44%)
produce at least one corpus-attested one. 364 rows total, 31.3% attested; of the
228 rows visible by default, **50% carry a real song citation.**

Median 1 row/word, p75 = 9 — sharply bimodal. Either a handful or nothing
(`follow`/`yellow` emit zero, by design). Value is inversely proportional to
single-word supply, exactly as MOSAIC-PLAN §Invariants predicted:

| source | single-word perfects | mosaics | attested |
|---|---|---|---|
| hallelujah | 0 | 24 | 6 |
| system | 0 | 16 | 3 |
| poet | 2 | 18 | 4 |
| water | 18 | 17 | 9 |

Latency: median 52 ms, p95 65 ms per search (generation is not a cost centre).

### Recall gap vs Datamuse — every miss is explained

Intersection 159 rows. Of Datamuse multi-word entries that OUR classifier also
grades an honest rhyme tier but we don't emit:

| miss reason | n | example |
|---|---|---|
| content-word tail | 872 | `over ← sea rover`, `red clover` |
| no WordNet frame + un-attested | 146 | `fire ← cry her`, `dye her` |
| head fails lyric-familiarity gate | 104 | `fire ← belie her`, `hove her` |
| 3+ words | 74 | `over ← straits of dover` |
| function tail un-attested | 19 | `faces ← base his` |
| genuine hole | **2** | `poet ← borrow it`, `shadow it` |

The first four are v2 backlog scope (MOSAIC-PLAN §11), not defects. The two
genuine holes are the known OW2 artifact casualties. **Nothing is unexplained.**

Datamuse's own multi-word output, graded through our classifier: 1,373/2,640
honest rhyme tiers, 1,116 not rhymes at all, 108 identity (`letter ← let her`),
12 out-of-vocabulary junk tokens (`cha ter`, `bit e`, `borneo it`).

### Correctness invariants (deterministic, no judge)

- Identity suppression 6/6: `let her`/letter, `mind her` + `remind her`/reminder,
  `missed her`/mister, `leave her`/believer, `mat her`/matter — none leak.
- Canon recall **30/30** on MOSAIC-PLAN's fixture pairs.
- Masculine sources → 0 mosaics; tiers only ever perfect + additive.

## Competitive position (surveyed 2026-07-09)

| tool | multi-word | quality gate | song citations |
|---|---|---|---|
| **rhyme.land** | generative | 4-gate stack | yes (2,450 phrases, 54% with rhyme-partner quotes) |
| RhymeZone | generative | **none** | no |
| double-rhyme.com | generative | none | no |
| Rhyme Genie ($7.99) | dictionary phrases only | n/a | song-derived data, no per-row quotes |
| B-Rhymes / RapPad / RHYMEBOOK | none | n/a | no |

RhymeZone's phrase-rhyme tab says so itself: *"You'll often find lots of options
in this tab, including many junky ones that don't work well."* Its default
`poet` page ships `no it` / `so it` / `though it` — stressed function-word
fragments that don't rhyme when sung. Its `water` phrase tab ships `all er`,
`auch der`, `dor er`.

**No surveyed tool combines generation + gating + attestation.** That combination
is the product.

## What this eval changed

1. **Concrete-noun denominal leak (fixed, this commit).** `hat her` / `cat her` /
   `fat her` / `rat her` / `bat her` shipped as top mosaics for MATTER. WordNet
   verbs all of them (to hat, to cat = vomit, to fat, to rat = inform on), each
   carrying a PERSON frame. Stripped in `buildMosaicVerbs.mjs`; `matter` drops
   11 → 6 rows with zero collateral on other words.

   ⚠️ **Do not generalize this into a noun-class sweep.** A scan of ~120 common
   nouns found ~48 with a PERSON frame, and most are genuine: `fire her`
   (dismiss), `train her`, `rock her`, `ring her`, `desert her` (abandon),
   `bug her`, `book her`, `house her`, `floor her`. A blanket strip silently
   deletes all of them. The lesson from gate 3 stands: **verify each form
   against both "V her" and "V it" against real generation, one at a time.**
   The fixture pins both sides.

2. **`city / with me` was never a miss — the fixture was wrong.** Recorded as
   the one canon casualty of the tail-reducibility prune. It isn't:
   `with me` = `W IH1 DH M IY0` vs `city` = `S IH1 T IY0`. **DH ≠ T.** The
   classifier grades it assonance and drops it, correctly. The prune is
   exonerated; canon recall is 30/30.

## Open, ranked (not acted on)

1. **Weak-attestation function-word heads.** `not for`(n=1), `flow it`(n=1),
   `that there`(n=2) were judged junk while `for me`(n=226) is fine. Hypothesis:
   an n=1 attestation with a function-word head is often a line-break tokenizer
   artifact (a fragment spanning two lines), not a real sung unit. Needs a
   corpus study before any threshold is imposed — `bought her` is also n=1 and
   is the flagship. **Don't just add `n >= 2`.**
2. **`HEAD_BLOCK` covers pronouns/articles but not conjunctions/negators**
   (`that`, `not`, `or` head attested rows). MOSAIC-PLAN §1d deliberately kept
   `not her`·2 / `or me` as "real sung units"; the judge disagreed on `or me`.
   Unresolved; taste call.
3. The 2 OW2 holes (`borrow it`, `shadow it`) — would need morphology CMU
   doesn't carry. Same accepted casualty as rainbow/elbow.

## Reproducing

```sh
# generation sweep + ablations (MODE=shipped|raw|att)
MODE=shipped node scripts/evalMosaicQuality.mjs eval-shipped.json
MODE=raw     node scripts/evalMosaicQuality.mjs eval-raw.json  water letter matter
MODE=att     node scripts/evalMosaicQuality.mjs eval-att.json  water letter matter

# benchmark diff against Datamuse (RhymeZone's engine). Free API, no key.
node scripts/evalMosaicDatamuse.mjs eval-shipped.json datamuse.json
```

Neither script is run on deploy; neither writes into the repo.
