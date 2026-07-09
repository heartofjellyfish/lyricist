// ── Mosaic (compound) rhyme test suite ─────────────────────────────
// Covers MOSAIC-PLAN.md v1: generation (Direction B), phrase input
// (Direction A), the classifier seam, and the negative boundaries.
// Same harness as the golden suite — fetch shimmed to the local
// filesystem BEFORE importing the modules under test.
// Run: node --test test/mosaicRhyme.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

globalThis.fetch = async (url) => {
  const path = fileURLToPath(url);
  let buf;
  try {
    buf = fs.readFileSync(path);
  } catch {
    return { ok: false, status: 404 };
  }
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString()),
    text: async () => buf.toString(),
  };
};

const { ensurePronunciation } = await import(
  "../rhyme-finder/src/pronunciation.js"
);
const { analyzeWord, analyzeFromPhonemes, classifyRhymeAnalyzed } = await import(
  "../rhyme-finder/src/rhymeClassifier.js"
);
const { findRhymes } = await import("../rhyme-finder/src/rhymeFinder.js");

await ensurePronunciation();

async function mosaicsFor(word) {
  const { mosaics } = await findRhymes({ word });
  return mosaics;
}
function find(mosaics, display) {
  return mosaics.find((m) => m.display === display);
}

// ── Generation positives ────────────────────────────────────────────
// Assert membership + tier + joinType. Every mosaic is graded by the
// real classifier on the real Pattison scale — nothing here bypasses it.
const POSITIVES = [
  ["poet", "know it", "perfect", "exact"],
  ["letter", "get her", "perfect", "exact"], // weak 'er
  ["water", "bought her", "perfect", "exact"], // weak 'er + cot/caught merger
  ["water", "got her", "perfect", "exact"],
  ["reminder", "find her", "perfect", "exact"],
  ["bottom", "got them", "perfect", "exact"], // weak 'em
  ["system", "missed them", "perfect", "exact"], // weak 'em
  ["city", "hit me", "additive", "additive-onset"],
  ["spaghetti", "forget me", "additive", "additive-onset"],
  ["money", "run me", "additive", "additive-onset"],
  // Geminate join (shared boundary consonant, assembled degeminated) is a
  // consonant-initial-tail phenomenon, so every geminate uses a FUNCTION
  // tail (to/did/them…) — which the §5.3b attestation gate now requires
  // corpus evidence for. The old splendid/spend-did, candid/hand-did
  // fixtures were un-attested fragments and are gone with the rest of the
  // "spend for / pretend are" noise. The join TYPE survives in code
  // (matchTail) for attested or object-pronoun geminates; there's just no
  // corpus example today. Re-add a fixture here if one ever attests.
];

for (const [source, display, tier, join] of POSITIVES) {
  test(`generate ${source} → "${display}" (${tier}/${join})`, async () => {
    const mosaics = await mosaicsFor(source);
    const hit = find(mosaics, display);
    assert.ok(
      hit,
      `"${display}" missing for "${source}" — have: ${mosaics
        .slice(0, 10)
        .map((m) => m.display)
        .join(", ")}`,
    );
    assert.equal(hit.type, tier, `${display}: tier`);
    assert.equal(hit.joinType, join, `${display}: joinType`);
  });
}

test("weakForm flag is set on h-dropped / reduced tails", async () => {
  const letter = await mosaicsFor("letter");
  assert.equal(find(letter, "get her").weakForm, true, "get her is 'get 'er'");
  const bottom = await mosaicsFor("bottom");
  assert.equal(find(bottom, "got them").weakForm, true, "got them is 'got 'em'");
});

test("delta surfaces mosaics via both post-gate paths", async () => {
  // Proves the head index + tail matching still fire for the delta split
  // after the §5.3b gate, through the two surviving routes: an ATTESTED
  // function tail ("fell to", corpus-backed) and a speculative OBJECT-
  // pronoun tail ("felt you" — feel takes a person object). The un-attested
  // function-tail readings ("felt to" geminate, "felt a") are gone.
  const mosaics = await mosaicsFor("delta");
  const fellTo = mosaics.find((m) => m.display === "fell to");
  assert.ok(fellTo && fellTo.songs > 0, `attested "fell to" missing — have: ${mosaics.map((m) => m.display).join(", ")}`);
  const feltYou = mosaics.find((m) => m.display === "felt you");
  assert.ok(feltYou, `object-pronoun "felt you" missing — have: ${mosaics.map((m) => m.display).join(", ")}`);
});

// ── Generation negatives ────────────────────────────────────────────

test("masculine sources get zero mosaics", async () => {
  for (const w of ["outside", "cat", "believe", "today"]) {
    const mosaics = await mosaicsFor(w);
    assert.equal(mosaics.length, 0, `${w} is masculine — no mosaics`);
  }
});

test("no identity / assonance / consonance types ever leak into output", async () => {
  const allowed = new Set(["perfect", "family", "additive", "subtractive"]);
  for (const w of ["water", "poet", "city", "reminder", "spaghetti", "money"]) {
    const mosaics = await mosaicsFor(w);
    for (const m of mosaics) {
      assert.ok(allowed.has(m.type), `${w} → ${m.display} has forbidden type ${m.type}`);
    }
  }
});

test("evidence gate: un-attested non-verb heads never leak (grammatical trash removed)", async () => {
  // A non-verb head has no speculative license (objMask 0), so it can only
  // surface when the corpus attests the exact phrase. None of these
  // grammatical-nonsense combos end a real song line.
  const bad = {
    poet: ["oh", "no", "so", "hello", "mexico", "tokyo", "idaho"],
    water: ["scott", "apricot", "astronaut", "camelot"],
    letter: ["cigarette", "internet"],
  };
  for (const [src, heads] of Object.entries(bad)) {
    const mosaics = await mosaicsFor(src);
    for (const h of heads) {
      assert.ok(!mosaics.some((m) => m.words[0] === h), `${src}: non-verb head "${h}" leaked`);
    }
  }
});

test("evidence gate: ATTESTED non-verb heads surface (the preposition mosaics)", async () => {
  // The classic preposition-headed mosaics no verb gate can admit: the
  // corpus itself is the evidence. "before me"·11 for glory/story,
  // "behind her"·2 for reminder, "to you"·250 for hallelujah (Cohen's own
  // "what's it to ya"). Each rides the attestation path with objMask 0.
  const story = await mosaicsFor("story");
  const beforeMe = find(story, "before me");
  assert.ok(beforeMe && beforeMe.songs > 0, `"before me" missing for story — have: ${story.map((m) => m.display).join(", ")}`);
  assert.equal(beforeMe.type, "additive", "before me: additive (M onset)");
  const reminder = await mosaicsFor("reminder");
  const behindHer = find(reminder, "behind her");
  assert.ok(behindHer && behindHer.songs > 0, `"behind her" missing for reminder`);
  assert.equal(behindHer.type, "perfect", "behind her: perfect (exact join)");
  const hallelujah = await mosaicsFor("hallelujah");
  const toYou = find(hallelujah, "to you");
  assert.ok(toYou && toYou.songs > 0, `"to you" missing for hallelujah`);
});

test("evidence gate: pronoun/article heads are clause fragments, never mosaics", async () => {
  // "…is it me" / "…you, you" / "…an A" end lines, but a pronoun or
  // article head isn't a singable unit — blocked at the attestation
  // builder (HEAD_BLOCK), so they can't ride the widened non-verb path.
  assert.ok(!find(await mosaicsFor("city"), "it me"), '"it me" leaked');
  assert.ok(!find(await mosaicsFor("hallelujah"), "you you"), '"you you" leaked');
  assert.ok(!find(await mosaicsFor("banana"), "an a"), '"an a" leaked');
});

test("verb gate: verb heads (incl. irregular pasts) survive", async () => {
  const water = await mosaicsFor("water");
  for (const good of ["got her", "bought her", "caught her", "thought her"]) {
    assert.ok(water.some((m) => m.display === good), `${good} (irregular-past verb head) missing`);
  }
});

// ── Object-class gate (WordNet frames baked into mosaic-verbs.json) ──

test("object gate: person-pronoun tails need a somebody-frame head", async () => {
  // WordNet frames: weekend is intransitive, pretend takes only clauses/
  // infinitives, spend and mend take only things — none can take "her".
  // send / defend / tend / lend carry somebody-frames and survive.
  const mosaics = await mosaicsFor("surrender");
  for (const bad of ["weekend her", "pretend her", "spend her", "mend her"]) {
    assert.ok(!find(mosaics, bad), `"${bad}" leaked past the object gate`);
  }
  for (const good of ["send her", "defend her", "tend her", "lend her"]) {
    assert.ok(
      find(mosaics, good),
      `"${good}" missing — have: ${mosaics.slice(0, 10).map((m) => m.display).join(", ")}`,
    );
  }
});

test("object gate: prepositional verbs don't take a bare person object", async () => {
  // WordNet scores a polysemous synset [count, depend, rely, bank, …] with a
  // somebody-frame for the "rely ON" sense, but the object is prepositional —
  // "depend her" / "condescend her" are broken. buildMosaicVerbs strips the
  // spurious bit (STRIP_BOTH / STRIP_PERSON). Their transitive neighbours in
  // the same rhyme family (send/defend/…) must stay.
  const mosaics = await mosaicsFor("surrender");
  for (const bad of ["depend her", "condescend her"]) {
    assert.ok(!find(mosaics, bad), `prepositional "${bad}" leaked`);
  }
  for (const good of ["send her", "defend her", "recommend her", "suspend her"]) {
    assert.ok(find(mosaics, good), `"${good}" wrongly stripped`);
  }
});

test("object gate: thing tail 'it' accepts thing-only verbs", async () => {
  // said → say has thing-frames but no somebody-frame: "said it" must
  // survive — the gate is per-tail-class, not blanket transitivity.
  const edit = await mosaicsFor("edit");
  assert.ok(find(edit, "said it"), `"said it" missing (thing-only verb + it)`);
});

test("attestation gate: un-attested non-object-pronoun tails are suppressed", async () => {
  // A tail with no grammatical object-frame model (preposition/possessive/
  // locative/conjunction/aux) only surfaces when the corpus attests it.
  // This is where "spend for", "weekend your", "bend there", "call so" and
  // the ER0 twin "pretend are" all die — the aux-twin problem dissolves
  // because the twin is un-attested too, not merely demoted.
  const surrender = await mosaicsFor("surrender");
  for (const bad of ["spend for", "weekend your", "bend there", "pretend are", "end for"]) {
    assert.ok(!find(surrender, bad), `un-attested func-tail "${bad}" leaked`);
  }
  // Every surviving non-object-pronoun mosaic must be attested.
  const OBJ = new Set(["it", "her", "them", "him", "me", "you", "us"]);
  for (const m of surrender) {
    const tail = m.words[m.words.length - 1];
    if (!OBJ.has(tail)) {
      assert.ok(m.songs > 0, `un-attested func-tail "${m.display}" survived (songs=${m.songs})`);
    }
  }
  // "follow" / "yellow" had only "call so" / "tell so" junk — now empty.
  assert.equal((await mosaicsFor("follow")).length, 0, "follow has no attested mosaics");
});

test("attestation gate: attested non-object-pronoun tails DO come through", async () => {
  // The gate keeps real corpus line-endings — it's a filter on speculation,
  // not a ban on the tail class. "end there"'s corpus partner is
  // "pretender" — feminine proof that post-verbal "there" destresses.
  const surrender = await mosaicsFor("surrender");
  const endThere = find(surrender, "end there");
  assert.ok(endThere && endThere.songs > 0, "attested 'end there' should survive the gate");
});

test("line-final reducibility: stressed pro-form tails are gone, even attested", async () => {
  // A mosaic sits in rhyme position = line-final, and line-final
  // "that/what/do" are STRESSED pro-forms — the corpus's own partner
  // detection proved the quotes rhyme the OTHER reading: lines ending
  // "can do" partnered with you/too/true (stressed UW1, not a banana
  // feminine), "been that"/"hear that" with at/flag/ass (stressed AE1 T),
  // "know that" with exhale/have. Those rows were badge-bearing false
  // rhymes; the tails are out of the table entirely (2026-07-09).
  assert.ok(!find(await mosaicsFor("poet"), "know that"), '"know that" (stressed line-final THAT) leaked');
  assert.ok(!find(await mosaicsFor("poet"), "know what"), '"know what" leaked');
  assert.ok(!find(await mosaicsFor("banana"), "can do"), '"can do" (stressed line-final DO) leaked');
  assert.ok(!find(await mosaicsFor("minute"), "been that"), '"been that" leaked');
  assert.ok(!find(await mosaicsFor("spirit"), "hear that"), '"hear that" leaked');
});

test("identity-pair suppression: a citation-H reading can't resurrect an identity", async () => {
  // "mind her" ≡ reminder, "let her" ≡ letter, "spied her" ≡ spider in
  // their natural reduced reading (Pattison identity, excluded by design
  // §2). The audible-H citation variant differs by one inserted consonant
  // — the ear still hears repetition, so the whole pair is poisoned.
  const reminder = await mosaicsFor("reminder");
  for (const bad of ["mind her", "remind her"]) {
    assert.ok(!find(reminder, bad), `identity pair "${bad}" leaked for reminder`);
  }
  assert.ok(!find(await mosaicsFor("spider"), "spied her"), '"spied her" leaked for spider');
  assert.ok(!find(await mosaicsFor("letter"), "let her"), '"let her" leaked for letter');
  // The other side of the boundary: a shared stressed syllable with REAL
  // tail contrast is honest additive, not identity — the classifier judges
  // the assembled phrase, not the head alone.
  assert.ok(find(await mosaicsFor("spaghetti"), "forget me"), '"forget me" over-suppressed');
  assert.ok(find(await mosaicsFor("city"), "sit me"), '"sit me" over-suppressed');
});

test("ranking: attested rows sort before speculative rows within a tier", async () => {
  const poet = await mosaicsFor("poet");
  assert.equal(poet[0].display, "know it", "poet's top mosaic is the corpus-proven one");
  for (const w of ["poet", "water", "letter"]) {
    const mosaics = await mosaicsFor(w);
    for (const type of ["perfect", "additive"]) {
      const tier = mosaics.filter((m) => m.type === type);
      const firstUnattested = tier.findIndex((m) => !(m.songs > 0));
      if (firstUnattested === -1) continue;
      const laterAttested = tier.slice(firstUnattested).some((m) => m.songs > 0);
      assert.ok(!laterAttested, `${w}/${type}: attested row ranked below un-attested`);
    }
  }
});

test("head words clear the quality gate (no junk tokens as heads)", async () => {
  const junk = new Set(["sie", "naif", "klee", "fae", "che", "ya", "brunn", "chun", "jun", "kai", "doi", "foy", "hoy", "loy"]);
  const mosaics = await mosaicsFor("water");
  for (const m of mosaics) {
    assert.ok(!junk.has(m.words[0]), `junk head "${m.words[0]}" in ${m.display}`);
  }
});

test("attestation: everyday mosaics carry a song count + real quotes", async () => {
  const poet = await mosaicsFor("poet");
  const knowIt = poet.find((m) => m.display === "know it");
  assert.ok(knowIt, "know it should generate for poet");
  assert.ok(knowIt.songs > 0, "know it is attested (ends lines in real songs)");
  assert.ok(Array.isArray(knowIt.quotes) && knowIt.quotes.length > 0, "carries sample quotes");
  const q = knowIt.quotes[0];
  assert.ok(q.line && q.credit && q.songTitle && q.surface === "know it", "quote shape");
});

test("attestation: un-everyday object-pronoun mosaics get 0 songs", async () => {
  const poet = await mosaicsFor("poet");
  // "grow it" is grammatical (grow takes a thing object) but not an everyday
  // corpus phrase — object-pronoun tails keep speculative generation, so it
  // still surfaces, just with songs=0.
  const growIt = poet.find((m) => m.display === "grow it");
  assert.ok(growIt, "grow it should generate (object-pronoun tail, ungated)");
  assert.equal(growIt.songs, 0, "grow it is generated but not attested");
});

test("dup-twin suppression: no display string appears twice", async () => {
  for (const w of ["water", "letter", "reminder", "bottom"]) {
    const mosaics = await mosaicsFor(w);
    const seen = new Set();
    for (const m of mosaics) {
      assert.ok(!seen.has(m.display), `${w}: "${m.display}" appears twice (perfect + additive twin)`);
      seen.add(m.display);
    }
  }
});

test("mosaic cap: total ≤48, and the cap can never squeeze out an attested row", async () => {
  // No default/lower tier field on mosaic rows: the UI splits on songs>0
  // (attested = default row). Attested-first ranking makes the cap safe.
  const mosaics = await mosaicsFor("water");
  assert.ok(mosaics.length <= 48, `total ${mosaics.length} > 48`);
  assert.ok(mosaics.every((m) => m.tier === undefined), "tier field is gone from mosaic rows");
});

// ── Classifier seam unit ────────────────────────────────────────────

test("seam: homophone mosaic 'a tension' / attention classifies as identity", () => {
  const attention = analyzeWord("attention");
  // a=AH0, tension=T EH1 N SH AH0 N
  const aTension = analyzeFromPhonemes("a tension", ["AH0", "T", "EH1", "N", "SH", "AH0", "N"]);
  const cls = classifyRhymeAnalyzed(attention, aTension);
  assert.equal(cls.type, "identity");
  assert.equal(cls.isRhyme, false);
});

// ── Direction A — phrase input ──────────────────────────────────────

async function bucketHas(word, type, target) {
  const { buckets } = await findRhymes({ word });
  return (buckets[type] || []).some((e) => e.word === target);
}

test("phrase: bought her → water (perfect); source is feminine", async () => {
  const { source, buckets } = await findRhymes({ word: "bought her" });
  assert.ok((buckets.perfect || []).some((e) => e.word === "water"));
  assert.equal(source.masculine, false);
});

test("phrase: know it → poet (perfect); function word destressed (anchor OW)", async () => {
  const { source } = await findRhymes({ word: "know it" });
  assert.equal(source.stressedVowel, "OW");
  assert.ok(await bucketHas("know it", "perfect", "poet"));
});

test("phrase: gold rush → crush (perfect); content words keep citation stress (anchor on rush)", async () => {
  const { source } = await findRhymes({ word: "gold rush" });
  assert.equal(source.stressedVowel, "AH");
  assert.ok(await bucketHas("gold rush", "perfect", "crush"));
});

test("phrase: of it → all-function fallback, no throw", async () => {
  const { source } = await findRhymes({ word: "of it" });
  assert.ok(source.stressedVowel, "an anchor exists via last-word citation");
});

test("phrase: mosaic generation runs on phrase sources too (bought her → got her)", async () => {
  const { mosaics } = await findRhymes({ word: "bought her" });
  assert.ok(mosaics.some((m) => m.display === "got her"));
});

test("phrase: unknown word errors and names the offending word", async () => {
  await assert.rejects(() => findRhymes({ word: "qwzxplk her" }), /qwzxplk/);
});

test("phrase: more than 4 words is a friendly error", async () => {
  await assert.rejects(() => findRhymes({ word: "one two three four five" }), /4 words/);
});
