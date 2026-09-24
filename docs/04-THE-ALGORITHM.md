# FILE 4 — THE ALGORITHM

What the algorithm depends on, in order, as numbered points. Then the machinery
around it, then the honest account of what it still gets wrong.

Everything here is in `src/lib/engine/` — mostly `recommend.ts` (2,556 lines),
`facets.ts` (1,203) and `taste.ts` (493).

---

# SECTION A — THE TEN THINGS THE ALGORITHM DEPENDS ON

Every card you are shown is the winner of a score. The score is a sum. These are
its parts, in order of how much they actually decide the outcome.

---

## ONE — What you liked and what you disliked (the taste tables)

The foundation. Every swipe writes into seven tables. **A like adds +1 to every
token the title carries. A dislike subtracts 1. "Haven't seen it" subtracts
0.35.**

The seven tables — the **facets**:

| Facet | Holds | Starting weight |
|---|---|---|
| **story** | up to 14 TMDB keywords: plot, themes, setting | **1.15 — the highest** |
| **genre** | comedy, drama, sci-fi… | 1.00 |
| **cast** | the top 4 actors | 0.70 |
| **director** | one name | 0.60 |
| **era** | the decade | 0.55 |
| **language** | the original language | 0.45 |
| **fame** | which "fame band" the title sits in | **0.00 for taste** |

So if you like *Inception*, you have not just said "I like sci-fi". You have
added +1 to `dream`, `heist`, `subconscious`, `Christopher Nolan`,
`Leonardo DiCaprio`, `2010s`, `English`, and `science fiction` — and every one of
those is now a separate reason another film might reach you.

**Fame is weighted zero in the taste model, on purpose.** A taste model that
learns "I like famous films" has learned the shape of its own gate, not your
taste — the closed loop that half this design exists to break. Fame is used
heavily *elsewhere* (point 4), for a different question.

**Skips are not free, and this was a fix.** "Haven't seen it" used to be worth
zero, and thirty skipped superhero films taught the deck nothing at all. It is
now −0.35: softer than a dislike, because not having seen something is weaker
evidence than having seen it and disliked it — but not nothing.

---

## TWO — How *sure* each of those signals is (shrinkage and rarity)

Raw counts lie. Two corrections:

**Shrinkage.** Each token keeps `[net evidence, observation mass]` and its mean
is pulled toward zero by a constant `TOKEN_K = 1.5`. One sighting is a hint;
five are evidence. Without this, one liked film starring an actor would make that
actor as strong a signal as a genre you have confirmed forty times.

**Rarity (IDF).** A token that appears on 20,000 titles tells us almost nothing;
a token on 30 titles is nearly a fingerprint. `buildRarityIndex` computes this
across the whole catalog, so `time loop` outweighs `based on a novel`.

**Pruning.** Tables are capped — 1,400 story tokens, 900 cast, 500 directors, 64
genres, 24 eras, 48 languages, 8 fame bands — and the weakest are dropped.

---

## THREE — How important each facet is *to you personally*

The weights in point 1 are only the starting position. They move. If your likes
keep sharing a director, the director weight climbs; if genre keeps failing to
predict you, genre falls.

Deliberately slow and bounded: learning rate **0.09**, floor **0.15**, ceiling
**2.6**, and nothing moves at all until **3 rated swipes**. A fast-learning
weight would lock onto the first three films you happened to like.

---

## FOUR — Whether you are even likely to have *heard of* it

This is the one people do not expect, and for this product it is as important as
taste. **A perfect recommendation you have never heard of is a wasted card.**
The goal is to harvest what you have watched; you cannot answer about a film you
have never encountered.

So every candidate also gets `watchLikelihood(profile, tokens, fame)` — a
probability, 0 to 1, that *you specifically* have watched it. It blends two
things:

- **the world's answer** — the TMDB vote count, turned into a 0–1
  "recognisability"
- **your answer** — a *second, separate* set of facet tables, `seenFacets`, fed
  only by whether you said you had *seen* it, never by whether you *liked* it

The exposure tables weight the facets differently, because different things
predict *exposure* than predict *taste*:

```
fame 1.6   genre 1.4   era 1.1   language 0.8   story 0.6   cast 0.5   director 0.4
```

Fame is the strongest single predictor here on the only unbiased sample this
project has — the exact opposite of its role in taste.

**Why "fame" became a question instead of an assumption.** Every earlier version
made "have you heard of this?" a fixed function of vote count. The first unbiased
sample showed that function has a **peak whose location is a fact about the
person**. One real viewer had watched *none* of the 104 titles under 500 votes he
was shown — and *none* of the 12 over 6,000 either. Every single one of his was
in the wide middle. Sixty MovieLens histories say the opposite: those are film
enthusiasts and they have watched the most famous titles. Forcing either shape on
the other costs a third of the harvest. So a title now carries a **fame band
token**, the exposure tables learn which bands *you* say yes to, and your peak is
placed by your own swipes.

### The blend, and the one gotcha that will bite you

```
seenTrust = 0.75 × evidence/(evidence + 8) × answerBalance
answerBalance = 4p(1−p),  where p = (times you said "seen") / (total answers)
watchLikelihood = (1 − seenTrust)·fame + seenTrust·yourOwnModel
```

Three deliberate pieces:

- **0.75 ceiling.** The personal model never takes the whole term. The tables can
  only learn from cards the deck chose to show, and the deck chooses by fame — a
  viewer never shown an obscure title has taught the model nothing about obscure
  titles, and the model cannot tell "you skip these" from "you were never
  asked".
- **`evidence/(evidence+8)`.** Trust grows with the number of swipes.
- **`4p(1−p)` — and this is the gotcha.** Volume is not information. Someone who
  answered "I watched it" to all 200 cards has taught the exposure model
  *nothing about exposure* — every token is positive, so ranking by it is ranking
  by nothing. Balance is 1 at a 50/50 split and falls to 0 as either answer takes
  over. It is not a fudge factor: it is the variance of the thing being
  predicted, and a predictor of a constant is worth nothing however much of it
  you have.

> ⚠️ **This gotcha already produced one wrong conclusion and it will do it
> again.** A test built profiles out of library titles only — all seen, no
> "haven't seen" — so `p = 1`, balance = exactly 0, taste weighted zero, and
> `watchLikelihood` returned the raw fame prior. The test reported that the
> shipped score and pure popularity were *identical to three significant
> figures*, and that claim was passed to the owner as a finding about the
> product. It was a finding about the test. **Any synthetic profile must include
> realistic "haven't seen" answers or you are measuring nothing.**
>
> On a real 449-swipe session (37% watched) the balance reads **0.93**, so the
> case this was built for is barely touched.

---

## FIVE — The TMDB recommendation graph

TMDB's `/recommendations` results became a graph of **768,917 links across
48,543 titles**. TMDB documents these as recommendation results; it does **not**
document this endpoint as raw viewer-level "people who watched this also
watched" telemetry. The graph is therefore a useful relatedness source, not an
independent behavioral/co-watch dataset. Two uses:

- **The taste walk.** From what you have confirmed, walk the graph outward.
  2 hops, decay 0.55 per hop, gamma 0.6, frontier capped at 600.
- **The frontier.** Every title you confirm watching opens its neighbourhood.
  Titles adjacent to a confirmation get a lift.

Weighted differently by screen, because they want different things:
`CO_WATCH_DECK_SCALE = 0.6`, `CO_WATCH_DISCOVER_SCALE = 1.6`. The deck value was
recalibrated down from 3.2 when the graph got denser.

**The frontier is the single biggest measured win in the grid.** On `/add`:

| | harvested | rate | lost at ranking |
|---|---|---|---|
| frontier off | 226.1 of 533 | 1,750 titles/hour | 43.0% |
| **frontier on** | **321.6 of 533** | **2,490/hour** | **26.7%** |

+42% harvested, and 2,490 against the shipped deck's 1,121 — more than double.

> ⚠️ **Do not use the graph's *degree* (how many links a title has) in the gate
> or the ranking.** Tried twice, worse both times, removed both times.

---

## SIX — The quality of the title

`W_QUALITY = 0.25`. A Bayesian-smoothed rating, so a 9.5 from eleven people does
not outrank an 8.4 from eighty thousand. The smallest term in the sum, and
correctly so — quality is almost uncorrelated with whether *you* will like it.

---

## SEVEN — Deliberately showing you something different (diversity)

Ten near-identical cards teach almost nothing about a person. **MMR**
(Maximal Marginal Relevance) at `MMR_LAMBDA = 0.35`, plus a **0.16 penalty per
already-picked result sharing a genre**.

**The two screens get different amounts, and this is a real finding.** The deck
needs a lot; Discover needs almost none. Measured on a five-sitcom library: at
deck-level diversity, Discover returned *The Lord of the Rings*, *Breaking Bad*
and *The Departed* alongside the sitcoms. At a quarter of it, seven of eight were
strong matches and one stayed different. Forcing a different title into a
recommendation list means handing someone a 48% match while an 80% match sits
unshown.

They were on one dial until this was noticed — an oversight, since fame,
exploration and recognisability had already been split by screen.

---

## EIGHT — Deliberately guessing (exploration)

A small share of every deck batch is a probe: a card chosen to *learn*, not to
please. **12% at the start, decaying to 6% by swipe 60, and 0 once taste is
established.** `exploreRatioFor()`.

**Zero on Discover, always.** Exploration exists to learn, which is a swiping
activity. A probe in a recommendation grid is just an off-topic suggestion.

---

## NINE — What you have refused several times in a row (streaks)

Three consecutive skips sharing a value and that value is **hard-suppressed for
40 swipes**. `STREAK_TRIGGER = 3`, `COOLDOWN_SWIPES = 40`. Skip three Korean
dramas in a row and Korean dramas stop for a while.

Also `CONTRAST = 1.5`: a value you already love **absorbs some of the blame** for
one bad title. If you have liked eleven Scorsese films and dislike the twelfth,
the dislike is written mostly against the *other* things that title carries, not
against Scorsese. Floor of 0.15, so nothing ever becomes completely immune to new
evidence.

---

## TEN — A per-person random nudge (jitter)

`JITTER = 0.09`, a pure function of (title, your seed). It keeps your deck
**stable while you swipe** — a card holds the same nudge all session — while
ensuring two people ranking the same catalog never see the same order. Without it
the engine is fully deterministic and every new user's opening deck was
identical.

---

## The sum, exactly as it is written in the code

`src/lib/engine/recommend.ts`, around line 2134:

```
score =   0.25              × quality
        + wRecognition      × recognitionTerm      ← point 4
        + confidence × 1.6  × facetScore           ← points 1,2,3
        + 0.09              × jitter               ← point 10
        + coWatchScale      × coWatchTerm          ← point 5
        − CO_WATCH_AVERSION × aversionTerm
        + confidence × 1.4  × soulSim              ← always 0 today (§E.1)
        + coOccurrenceBonus                        ← cloud only, unused
```

`wRecognition` changes by screen and by how warm the profile is:
**0.9 cold → 0.55 warm** on the deck, **0.12** on Discover. Ranking a
recommendation list by fame just surfaces what you have already watched.

`confidence` is 0 for a brand-new user and rises with evidence, so taste
contributes nothing until there is taste to contribute.

---

# SECTION B — THE FOUR STAGES A CARD PASSES THROUGH

1. **The gate** — `fameGate()`. Decides which titles are even allowed to be
   considered. Ranks *within each kind* (film/series separately) and within each
   language, so films never crowd out series and English never crowds out Arabic.
   Opens a **language door** for languages you read: an Arabic reader gets Arabic
   candidates **from the first card**, before swiping anything, because skipping
   that at cold start meant 200 cards with zero Arabic — and then the language
   facet stays empty, so the door never opens later either. A closed loop.
2. **The score** — the sum above, over everything that got through.
3. **Diversity + exploration** — MMR over the top finalists (pool of 60, or 4× the
   batch size), then the exploration slots are filled.
4. **The queue** — `useDeck.ts` holds the batch and deals them one at a time.

---

# SECTION C — THE GATE, AND THE SETTING THAT CONTROLS IT

The gate is the most consequential thing in the engine and the least obvious.

## How big the pool is

`fameTierSize()` grows the pool as you answer:

```
confidence = answered / 250
growth     = 3 + confidence × (reachCeiling − 3)
earned     = 900 + 5×(times you said seen) − 30×(times you said not seen)
margin     = max(300, answered × (growth − 1))
tier       = min(60000, max(earned, answered + margin))
```

Note `−30` per "not seen": telling us you have not heard of things **shrinks**
the pool back toward the famous end, because that is evidence the pool is already
too deep for you. And if you skip **8 in a row** (`STREAK_TRIGGER = 8`), growth
is boosted by up to ×1.5 — a long run of "never heard of it" means the deck is in
the wrong neighbourhood entirely.

## The setting: Settings → How far the deck reaches

| Choice | `growth` ceiling | Effect |
|---|---|---|
| **Only what's famous** (default) | 3 | ~3,000 titles reachable. Measures best on MovieLens. |
| **Go deeper** | 8 | ~40% of the catalog in reach. |
| **Everything** | ∞ | **Bypasses the tier completely, from the first card.** |

**Why this is a setting and not a constant — the most honest paragraph in the
project.** Measured on 40 real watch histories, widening trades one loss for
another and comes out behind:

| | harvested | lost at gate | lost at ranking |
|---|---|---|---|
| narrow (~3,000) | **180.7** | 18.4% | 53.4% |
| everything (48,553) | 96.8 | **0.0%** | 84.9% |

Clear: narrow wins. **But those histories cannot see the case this exists for.**
They are MovieLens — American, English, already inside the famous few thousand —
so a wider net can only add noise for them. For a viewer whose titles are Arabic,
Turkish or Indian, widening is the **only way they appear at all**:

| Title | Rank by vote count |
|---|---|
| The Daily Show | 7,543 |
| Old Dads | 9,352 |
| **The Tonight Show with Jimmy Fallon** | 10,877 |
| **Key & Peele** | 14,600 |
| **الفيل الأزرق (The Blue Elephant)** | 23,979 |

At "narrow", **not one of those can ever be dealt.** They were never missing from
the catalog — they were outside what the engine was allowed to look at.

The measurement cannot decide this, so the person it affects decides it. The
default stays narrow, which is the measured best.

**Plumbing note:** the ranking runs on a worker with no access to the store, so
the setting travels **with every request**, not set once. A change takes effect
on the next card, not the next visit. The main-thread fallback is told too, or
the two paths disagree.

**Discover was never gated.** `DISCOVER_POOL = Infinity` — Discover has always
ranked the whole catalog on every load. Only the swipe deck was ever limited.

---

# SECTION D — THE COLLAPSE: WHAT IS KNOWN, AND WHAT IS NOT

The complaint, in the owner's words: *"of the first fifty I liked forty; of the
last fifty, I liked two."* This is the main unsolved problem. Everything below is
measured, not argued.

### It is NOT running out of titles
162 of his own films were still unfound at the end of the block that felt empty.

### It is NOT the scorer
Handed half of a real library and asked to rank **all 48,553** titles, where does
the other half land?

| scorer | median rank | top 100 | top 1,000 | top 5,000 |
|---|---|---|---|---|
| **shipped score** | **591** | 15.8% | 64.4% | 95.1% |
| taste only | 642 | 14.6% | 63.0% | 94.9% |
| fame only | 934 | 11.9% | 51.7% | 94.5% |
| a coin flip | 24,277 | 0.2% | 2.1% | 10.3% |

Median rank 591 of 48,553 — **41× better than chance** — and the taste term beats
the fame prior on its own. The scorer works.

### It is NOT fixed by opening the gate
See the table in Section C. Gate loss goes to zero; ranking loss goes to 84.9%;
the harvest halves. The reason the two results above are not contradictory:
`rank-all` hands the scorer ~300 library titles **up front** and asks for one
ranking. A real session has to **earn** its profile card by card, and opening the
pool to 48,553 immediately means the early cards are drawn from the whole catalog
on almost no evidence. It never converges.

Narrow-then-open was tested too (`LEARN_CARDS = 250`) and reads the same 96.8: in
grid mode the answered count climbs 40 at a time, so the pool is wide long before
the profile is.

### The tail is difficult, but it is not information-free
An earlier diagnosis called the late-session decay partly inherent because a
separate graph walk also decayed. The newer September 19 measurement supersedes
that conclusion: at about card 900, fame alone still had AUC ~0.757 and
degree+fame ~0.788 against a ~4.9% base rate. That does **not** justify shipping
degree weighting—the frontier/degree ranking experiments hurt harvest—but it
does show that useful predictive signal remains in the tail.

### What is still unexplained
**In the shipped configuration, roughly 54% of a person's library can sit
inside the candidate pool and never be dealt.** Not filtered out—considered,
then repeatedly outranked. The current evidence says this is not simply an
information-free tail. The unresolved question is how to convert remaining
signal into session coverage without repeating the ranking experiments that
already reduced harvest.

### What actually helped, and it was not a weighting change
- **The grid** (`/add`): 40 at a time. **2,490 titles/hour vs the deck's 1,121.**
- **The import**: a whole library in one file, 100% match rate.
- **The frontier**: +42% harvested in the grid.

Four separate attempts to fix the collapse by reweighting the ranking all failed.
Every real improvement came from **changing the question asked**, not from
retuning the answer.

---

# SECTION E — MEASURED AND FAILED. DO NOT RETRY.

**1. Meaning-vectors / text embeddings.** All titles embedded locally
(`all-MiniLM-L6-v2`, free, 57 s) from title + genres + overview + keywords +
director + cast. Benchmarked at several weights, twice — once on clipped
200-character summaries, once on re-fetched full-length ones:

```
baseline (no meaning)         15% overall,  4% on feel-defined tastes
clipped  w=0.25/0.5/0.9    13% / 8% / 13%,  feel 0%
full     w=0.4/0.8/1.4    13% / 11% / 15%,  feel 0%
```

Never better; the feel line went to **zero every time**. Why: *Mad Max ↔ Rebel
Moon* scores 0.359 while *Mad Max ↔ John Wick* scores 0.307. Their plots really
are alike — warrior versus tyrant in a wasteland. What separates them is craft
and tone, and **no plot summary mentions craft or tone.** The bottleneck is the
text, not the model. `W_SOUL = 1.4` and the `souls` hook remain for the day
something describes mood; nothing supplies it today, so that term is always 0.

**2. Co-watch degree in the gate or the ranking.** Twice. Worse twice.

**3. Lowering the fame weight** (0.55 → 0.1) to fix the collapse. Moved nothing.

**4. Raising the recognition weight** ×3. Moved the tail by 0.2. The reason is
written above `W_FACETS`: a term's influence is its weight **times its spread**,
and the facet score runs over [−1, 1] while `watchLikelihood` is a probability
bunched around 0.5. **The wide term still wins.** Any future attempt to rebalance
these two must change a *spread*, not a weight.

**5. Splitting the catalog** into an 11,000 ranking set and a 41,000 search set.
Worked; rejected; reverted.

**6. "Everything" as a ×20 growth multiplier.** Growth is multiplied by cards
answered, so at card 40 the pool was still ~340 titles. 15 of the first 31 cards
were identical to "narrow". It bypasses the tier outright now.

**7. `pendingVerdicts`** — re-dealing titles the 👁 button had touched. A bug that
jammed the deck for a week: **nine eye-presses produced three stored answers.**
Deleted. `scripts/deck-guard.mjs` exists so it cannot return.

**8. `TARGET_SEEN` active learning — tested and refuted at the proposed
settings.** The uncertainty argument was testable and was tested. The September
19 sweep was monotonically worse as the target moved toward 0.5 (198.1 → 133.4
at 0.5). Do not describe 0.5 as an untried promising fix. A smaller amount of
uncertainty may still be useful—the current engine's separately measured target
is documented in source—but the original "rank nearest 0.5" proposal did not
survive the harvest ruler.

---

# SECTION F — HOW TO EXPERIMENT WITHOUT EDITING CODE

Almost every constant reads an environment variable, specifically so that a
disagreement can be settled by running something.

```bash
W_FACETS=2.5 npm run benchmark          # taste weight
W_REC_COLD=0.5 npm run benchmark        # fame weight, cold
TIER_MAX=5000 npx tsx scripts/harvest.ts
GROWTH_MAX=8 npx tsx scripts/harvest.ts
LEARN_CARDS=100 npx tsx scripts/harvest.ts
TARGET_SEEN=0.5 npx tsx scripts/harvest.ts   # ← the active-learning idea
EXPLORE=0.3 npm run benchmark
DISLIKE=2 npm run benchmark
CONTRAST=0 npm run benchmark            # 0 = old behaviour, full blame
HOPS=3 npx tsx scripts/frontier-sim.ts
PURE=1 npx tsx scripts/harvest.ts       # no probes, no diversity — raw ranking
```

Full list: `grep -n 'process.env' src/lib/engine/*.ts`.

> **The rule that was learned the hard way: never edit engine files while a sweep
> is running.** Three separate measurement runs were contaminated that way and
> had to be killed and re-run. Finish the run, then edit.
