# Notebook — agreed ideas, deliberately not built yet

> **Everything here is groundwork.** The agreed end state is a hosted site with
> a real database and a catalog around 50,000 titles. Every piece built now
> must survive that move, so: nothing may assume the catalog fits in the
> browser, and nothing may assume there is no server. Where a shortcut was
> taken for the static build, it is written down as such below.

## Scale checklist for the current build
| Piece | Today (5,555, static) | At 50,000 (hosted) |
|---|---|---|
| Catalog | one 2.9 MB JSON, fetched whole | too big to ship — must be queried |
| Rarity index | built in the browser on load | precompute once, store in the DB |
| Co-watch links | 46k links inside catalog.json | own table, joined on demand |
| Ranking | runs in the browser | can stay client-side for the deck, server-side for Discover |
| TMDB fetch | 5,600 requests, ~4 min | ~50,000 requests, ~40 min — unchanged code, just longer |


Parked by decision, not forgotten. Each entry says what it is, why it is
waiting, and what it would take.

---

## 1. Watch later

A fourth action on the swipe page ("save for later"), the same action
available from Discover, and a new page in the menu listing everything saved.

Distinct from a like: a like means *I watched this and enjoyed it*, watch-later
means *I haven't seen it and I want to*. It must therefore not feed the taste
tables the way a like does — at most a weak positive on the story/genre facets.

**Needs:** a `watchLater` set in the store (+ store version bump), a fourth
button in `SwipeDeck`, a page under `src/app/later/`, a nav entry.

---

## 2. Facet probing after a strong like

After a like the engine knows *that* you liked something, not *why*. The
learned facet weights infer it over ~15 swipes; a probe would settle it in
three.

Idea: right after a notable like, deliberately queue four variants — same
director, same lead actor, same story shape, same genre but everything else
different — and let the next few swipes attribute the credit directly.

**Needs:** a probe scheduler in `useDeck`, and a candidate picker per facet in
`recommend.ts`. The facet tables built in v8 are the prerequisite, and they now
exist.

---

## 3. Watch providers (Netflix, etc.)

Show where a title can actually be streamed.

**Needs:** TMDB `watch/providers` per title at catalog build time, and it is
country-specific — so either a country picker or IP-based detection, plus a
meaningful increase in catalog size (one provider list per title per country).

---

## 4. Cloud storage (Supabase)

The schema, migrations, RLS policies, pgvector index and the `/api/recommend`
route are all written and dormant. Deferred by agreement until the site is
finished, so the app stays a pure static export with no accounts to manage.

**Needs:** project creation, env vars, running the seed script. No new code.

---

## 5. Semantic "soul" layer

The current engine matches *symbols* — shared keywords, genres, people. It
cannot see that two films tell the same story in different words. Measured on
the real catalog:

| Pair | Similarity today |
|---|---|
| Parasite ↔ Knives Out | 0.117 (zero shared keywords) |
| The Truman Show ↔ The Matrix | 0.135 |

Both pairs are obvious matches to a person. Fixing this needs actual language
understanding, not better arithmetic.

**Shape:** at build time, send each title's metadata to a small model to
extract a structured soul profile (mood, tone, themes, narrative shape,
emotional arc), embed that profile, precompute each title's 40 nearest
neighbours, and ship only the neighbour table — the embeddings themselves never
reach the browser.

**Cost:** ~$3 one-off for the whole 5,555-title catalog via the Batch API;
embeddings free within Voyage's allowance; ~0.7 MB added to the bundle
gzipped. API keys would be build-time environment variables only — never
committed, never shipped to the client, exactly like the TMDB key.

**Status:** revisit *after* living with v8. If the deck now reads your taste in
40 swipes, this may not be needed at all — and that judgement should be made
against the improved engine, not the old one.

---

## The signal was dying as you swiped (2026-08-14)

Reported by the user, and the shape of the report was the whole diagnosis:
"the first ten to fifteen cards were connected and really matched my taste,
then I swiped fifty or sixty more and none of them had anything to do with what
I picked."

Every ruler here grades a single page from a fixed library, so a decay *over a
session* was invisible to all of them. `scripts/deck-drift.ts` swipes instead,
and reports the graph's contribution to the cards in blocks of ten:

| swipes | on taste | graph signal on the cards |
|---|---|---|
| 1-10 | 40% | **0.011** |
| 31-40 | 90% | 0.004 |
| 71-80 | 80% | **0.002** |

**An 80% collapse.** The walk starts with one unit of mass split across
everything the viewer has liked — five likes give each seed a fifth, fifty give
each a fiftieth — so the signal that knows Brooklyn Nine-Nine belongs with The
Office faded out exactly as the viewer taught us more. Meanwhile the keyword
model is scaled by confidence and therefore *rises*, so it quietly took over.

That is why the genre column stays high while the user says nothing matches:
after sixty swipes the deck was still returning comedies, just not *their*
comedies. Right category, wrong taste — the exact failure this project exists
to fix, reappearing at swipe sixty.

The fix is one paragraph of arithmetic: rescale the walk so its strongest
candidate always scores 1. The graph's job is to rank, not to hold an opinion
about how much someone has swiped. Weights re-tuned on the new scale — both
surfaces land at 0.6, and the deck has a sharp cliff at 0.7 where the
tunnel-vision guard fails.

| | before | after |
|---|---|---|
| graph signal at swipe 80 | 0.002 | 0.272 |
| deck accuracy | 22.8% | **24.4%** |
| vibe (hard pairs) | 30% | **33%** |

---

## The deck was never graded, and it showed (2026-08-14)

A user tried the site after the distillation shipped and said the cards had not changed: "I love Brooklyn Nine-Nine — anyone would say The Office, Modern
Family, How I Met Your Mother, and not one of them was suggested."

He was right, and the reason is that **every ruler in this repo graded Discover
only**. The deck kept the settings the robot-persona benchmark gave it — the
instrument we had already established has the least authority — and nobody
had ever asked 500 real people what they thought of it.

`scripts/deck-probe.ts` reproduced the complaint in one command. After liking
Brooklyn Nine-Nine the deck offered Interstellar, Spirited Away, Pulp Fiction,
The Dark Knight and Schindler's List, every card scoring ~56%.

**Two causes, and the second is worse than the first.**

*The weight.* Discover moved to 32 and the deck was left at 0.3, so fame
contributed up to 0.9 to a card while the whole graph contributed at most 0.26.

*The fame gate was measuring television on a film's ruler.* TMDB vote counts
are a film scale; a famous series collects a fraction of what a mid-tier film
does. Ranking one merged list meant **42 of 1,187 series sat inside the top
800**, against series being 21% of the catalog:

| | rank | in the first 40 cards? |
|---|---|---|
| The Office | 1,018 | locked out |
| How I Met Your Mother | 928 | locked out |
| Modern Family | 1,751 | locked out |
| Brooklyn Nine-Nine itself | 1,463 | locked out |

The three answers any human would give were unreachable by arithmetic. The
gate now takes the same *share* of each kind — the top 14% of films and the top
14% of series — which puts 171 series in the first tier instead of 42.

Graded on 500 real libraries in swipe mode, a ruler that did not exist before
this complaint:

| | deck | Discover |
|---|---|---|
| before | 19.3% [18.1–20.5] | 27.0% |
| **after** | **22.8% [21.5–24.1]** | 27.0% |

The deck weight is 12, not the higher-scoring 16 or 32, because the deck is
where a taste is *taught*: above ~16 it circles its own suggestions and the
tunnel-vision guard fails outright at 32. At 12 the deck is both more accurate
and *faster* to reach a new taste than with the signal off (0.87×).

Exploration also halved, 0.25 → 0.12 decaying to 0.06. A quarter of the deck
spent on probes was set when the ranking had nothing better to offer; measured
now it costs 2.4 points (25.7% with no probing against 23.3% with a quarter).

Side effect worth noting: the genre benchmark went 17% → 26% overall and
25% → 40% on genre-defined tastes. That panel grades the *deck*, which is
exactly what changed, and it had been reading low for the same reason.

---

## The distillation — what shipped (2026-08-13)

`python3 scripts/distill.py`, then `npx tsx scripts/apply-edges.ts`.

The ceiling test said behaviour is worth twice our content engine, and that we
could not ship the behavioural model — wrong licence, and it only knows the
4,054 films it was trained on. So we shipped a function instead of a model:

    20,000 people's co-watching  →  a 256-dimension position per film
    our own TMDB metadata        →  a ridge fit predicting that position
    the fit                      →  run over all 5,555 titles, TV included

Predicted position matches the real one at **cosine 0.737** on the films where
both exist. Every title gets 40 neighbours, unioned with TMDB's own links so
the obvious pairs are not lost.

**Nothing about "feel" is written down anywhere.** No mood vocabulary, no
adjectives, no prose. That is why it worked where four earlier attempts did
not: the target is measured rather than authored.

Graded on the 500 people from the ceiling test:

| | score | long tail | vibe (hard) |
|---|---|---|---|
| before | 18.8% [17.7–20.0] | 2.6% | 23% |
| **after** | **27.0% [25.5–28.4]** | **6.1%** | **30%** |
| the ceiling (unshippable) | 41.2% | 2.3% | — |
| popularity floor | 13.3% | — | — |

The long-tail line more than doubling is the part that cannot be faked by
fame. And the shipped engine now beats the *ceiling model* on long tail, which
says the two are good at different things.

The weight went from 0.15 to 32 — absurd next to the old number, and correct:
the sweep climbs all the way (19.4 → 27.3 between 0.6 and 32). The old graph
was TMDB's franchise links and was throttled almost off for good reason; this
one is worth trusting. The deck was swept too and still wants 0.3.

**Cost: the catalog went from 1.33 MB to 1.92 MB gzipped**, which every visitor
downloads. Density now genuinely helps (12 edges scores 24.0%, 20 scores 25.5%,
47 scores 27.0%), so the size buys something. It also strengthens the case in
the scale checklist for moving the catalog server-side before 50,000 titles.

**Known weakness, visible in the output:** Parasite's neighbours came back as
eight Korean dramas. The model learned "Korean" as a strong predictor, which is
language leaking in as taste. Recorded, not fixed.

Genre benchmark: 18% → 17%. That panel rewards genre purity, which is what we
are deliberately moving away from — and it is a robot persona against 500 real
people.

---

## The ceiling test — the answer, and it is not close (2026-08-13)

`python3 scripts/ceiling-test.py`. MovieLens 32M: 200,948 real people, and
**4,109 of our 4,368 films are covered** (the small file covered 3,091).
Trained on 20,000 people, graded on 500 completely different ones, then our own
engine graded on **exactly those same 500 people with the same libraries and
the same twelve-slot page** — the whole point of the exercise.

| | score | its own popularity baseline | lift |
|---|---|---|---|
| our engine (shipped) | 18.8% [17.7–20.0] | 13.3% | 1.41× |
| our engine, diversity off | 19.7% [18.4–20.9] | 13.3% | 1.48× |
| **EASE, trained on 20k people** | **41.2% [39.5–42.8]** | 21.8% | 1.89× |

**Behavioural data is worth roughly 2.1× everything we have built.** The
intervals are nowhere near touching. Eleven experiments of content modelling,
one paid bake-off and a graph walk sit at 19; one matrix inversion over other
people's ratings sits at 41.

The diversity row matters: only 0.9 points of our gap is a deliberate product
choice. The rest is the model.

**Caveat, stated plainly.** The two popularity baselines differ (13.3 vs 21.8)
because each script ranks fame in its own currency — TMDB votes for us,
MovieLens rating counts for EASE, and the latter is a stronger baseline *on
MovieLens data*. So read 1.41× vs 1.89× as the conservative comparison and
18.8 vs 41.2 as the optimistic one. Both say the same thing.

Also: EASE's long-tail line is 2.3% against our 2.6%. It is not better at
finding obscure things — it is dramatically better at ranking the well-known
ones correctly, which is most of what a viewer actually wants.

**This closes the strategic question.** We are not in the world where content
is nearly as good as behaviour. The next investment is the distillation —
learning what our own metadata predicts about co-preference — not another
pass of describing films.

---

## Walking the graph (2026-08-13)

Two hops instead of one, symmetric, with arriving mass divided by the target's
own connectivity. Measured on the new vibe ruler:

| | hard pairs | easy pairs | human ruler |
|---|---|---|---|
| one hop, weight 0.15 (was shipped) | 18% | 40% | 20.7% [19.2–22.1] |
| **two hops, weight 0.6** | **23%** | **55%** | 20.4% [18.9–21.9] |

Three and four hops score identically to two, so the walk is done at two.

The weight is the other half of the result. The one-hop signal collapsed as it
was turned up — 20.1% down to 13.6% on the human ruler at full strength — which
is why it had been throttled to 0.15. The walk does not collapse: 20.2–20.6%
flat from 0.15 to 1.0. Degree damping is why. Without it a walk drains into the
few titles everything links to and the output is a popularity list with extra
steps; with it, the graph can be trusted four times as much as before.

**Tested and wrong: my own explanation of the density null.** I had guessed the
`CO_WATCH_MAX = 0.85` ceiling was silently discarding edges 4-6. Raising it to
3.0 moves the score from 25.3% to 25.5% — inside the interval, i.e. nothing.
The real reason extra edges did nothing is that one hop from a liked title
lands in the neighbourhood the first two edges already covered. More reach, not
more edges, was the missing thing.

Cost: median re-rank 11.8ms → 17.7ms, worst 27.3ms, guard is 40ms. The graph is
built once per catalog and cached.

The feel ruler dropped 14.6% → 13.1% on the same change. Recorded rather than
explained away: its lists are mine, its sample is 28 measurements, and the two
external rulers both moved the other way.

---

## The bake-off — results (2026-08-13)

Three methods, 800 films, one closed world, graded by all 398 real MovieLens
libraries. **Spent: $1.65.** Pre-registered bar, written before any result was
seen: **+3 points on the human ruler, or it does not get scaled.**

| arm | human score | vs baseline |
|---|---|---|
| baseline (TMDB co-watch @0.15) | 23.9% | — |
| **soul** — 60 words on how it feels, embedded locally | 23.1% | **−0.8** |
| tags — 10 from a fixed mood/craft vocabulary | 24.8% | +0.9 |
| edges — "loved X → watch these 12" | 25.3% | +1.4 |
| edges + tags | 25.8% | +1.9 |
| edges made symmetric | 26.3% | +2.4 |
| **symmetric edges + tags, weight 0.25** | **26.8%** | **+2.9** |
| (recommending pure blockbusters) | 13.5% | — |

**The soul layer lost.** It was the original plan, the thing this money was
asked for, and it made recommendations measurably worse than doing nothing.
Free-text mood descriptions embed into a soup: every film sounds like every
other film once you strip the plot, so the nearest neighbours are whichever
descriptions happened to use the same adjectives. Recorded next to the two
earlier failures — local embeddings, and sequence momentum. $4.20 saved by
finding out on 800 films instead of 5,555.

**Two findings cost nothing and mattered more than the model did:**

* *Density does not help.* Capping the graph at 2 edges per film scores the
  same as 5.8 (25.3% both). Asking for twelve recommendations and paying for
  twelve was waste; four would have done.
* *Direction does.* Making the graph symmetric — if A recommends B, let B
  point back at A — is a five-line change with no API involved, and it is the
  single largest gain in the whole table (+1.0 on top of edges).

**Verdict: 2.9 against a bar of 3.0.** The bar existed to stop noise being
mistaken for signal; noise here is ±0.3 across user samples and this run grades
every available person, so +2.9 is real. It is simply smaller than hoped, and
it is not my decision alone to spend the rest of the money on it.

Also tried and reverted: giving the mood tags their own facet kind rather than
piggybacking on keywords. It helps the tag arm by ~0.4 but costs a point on the
genre benchmark while the facet is empty, which it is for every title in the
shipped catalog. It goes in *with* the data or not at all.

---

## The human ruler — and what it says about spending money (2026-08-12)

`npm run human`. 150 real MovieLens libraries: half of one person's
highly-rated films handed to the engine, the other half held back. Nobody in
this project wrote any of it.

    our engine            20.1%
    pure blockbusters     11.9%   ← the line that matters
    chance                 0.6%

**Before this ruler existed we were shipping a setting that scored 13.6% —
barely above a list of the most famous films in the catalog.** Turning
Discover's co-watch weight from 1.0 down to 0.15 fixed it, and the same change
had looked like a *loss* on every instrument we had before (genre benchmark
19% → 18%, a purity check outright failing). Two rulers disagreed with one, and
the two were written by us.

### What this means for the bake-off

The question on the table was whether to spend ~$3 having a model write "soul"
text for all 5,555 titles. That plan was never tested, and the one method with
real evidence behind it — asking the model directly for recommendations —
already scores higher on every ruler we have. Deciding between them by argument
would be exactly the mistake above.

So: sample first, ~150 titles, several methods, judged by `npm run human`
(external) with `npm run feel` and `npm run benchmark` as secondaries. Scale
only what wins. Candidate methods:

| method | what it produces | plugs into |
|---|---|---|
| direct edges | "loved X → watch these 12" | the existing `related` graph |
| soul tags | ~200-word controlled vocabulary of mood/craft | the facet tables, natively |
| soul text + embeddings | free prose, then vectors | a new similarity path |
| forum mining | what people actually say about a title | either, after extraction |

Note the third is the most expensive to build *and* needs machinery we do not
have, while the second drops straight into the engine as it stands.

---

## The feel ruler, and the first thing it found (2026-08-12)

`npm run feel`. Seven tastes named by film rather than described by genre —
each list cut in half at random four times, half handed to the engine, half
held back as the answer key. Chance is printed next to every score, because
without it a number like 9% is unreadable.

    FEEL SCORE   9.2%    chance 2.0%    4.7× chance    first hit at rank 9/60

It has resolution the old feel line never had — 19% for the comfort-sitcom
taste, 4% for dry deadpan comedy — and it moved on the very first thing tried:

| arm | feel score | genre benchmark (8 seeds) |
|---|---|---|
| shipped engine | 9.2% | 19% |
| TMDB co-watch stripped | **14.9%** | **17%**, and a simulation check fails |
| hand-written AI edges instead | 24.1% (contaminated) | 19% |

**TMDB's "people who watched this also watched" data helps genre-defined
tastes and hurts feel-defined ones.** That is not a bug to fix by flipping a
constant — 19% → 17% is a real cost, and it breaks the comedy-library check.
It is a trade-off the old instrument could not see at all.

Nothing was changed in response. `COWATCH=<0..1> npm run feel` exists purely to
re-run the sweep, and defaults to today's behaviour in the browser. The right
moment to re-decide is *after* the soul layer, when there is a better source of
feel to weigh against co-watch instead of simply having less of everything.

The 24.1% row is recorded and not believed: those edges and these lists were
written by the same model, so they agree with themselves.

---

## Open question: what a tap on the onboarding grid really means

The benchmark's simulated viewer taps any tile sharing genres with its target,
which is the best a genre-rule persona can do and is *not* how a person picks.
For a Before Sunrise viewer it taps 12 Angry Men and The Sound of Music.

That is why the "taps only" arm made the later session worse (19% → 14%): six
loose taps teach six slightly wrong things. Learning from the untapped tiles
recovers it (→ 18%), but the underlying question is untested: **how much better
is the grid when the taps are genuinely felt?** Answering it needs personas
defined by named films rather than genre rules — the same fix the feel-defined
line has been waiting for.

---

## Tried and rejected: meaning-vectors over our own text (2026-08-12)

Cost: $0. No API key, no signup — all 5,555 titles embedded locally with
all-MiniLM-L6-v2 in under two minutes.

The idea was the cheap half of the "soul" plan: stop comparing titles by
matching words and compare them by meaning instead, using the text we already
have (title, genres, overview, keywords, director, cast).

**It made recommendations worse, at every weight, on both the clipped
200-character overviews and full-length ones re-fetched for the test.** The
benchmark's feel-defined tastes — the whole reason for trying — went from 4%
to 0% every single run.

The reason, from a direct probe:

| pair | similarity | should be |
|---|---|---|
| The Hangover ↔ Rush Hour | 0.369 (vs 0.117 by keywords) | high — **improved** |
| Before Sunrise ↔ Cosmos | 0.089 | low ✓ |
| Mad Max ↔ John Wick | 0.307 | **high** ✗ |
| Mad Max ↔ Rebel Moon | 0.359 | **low** ✗ |

Meaning-matching genuinely beats word-matching on *story* — Hangover ↔ Rush
Hour tripled. But Mad Max and Rebel Moon really do have similar plots; what
separates them is craft, pace and tone, and **no plot summary mentions craft,
pace or tone**. Embedding a summary faithfully preserves a summary.

**Conclusion: the bottleneck is the text, not the comparison method.** Better
maths on the same words cannot recover information the words never carried.
That is now measured rather than assumed, and it sharpens the remaining
question: the only untried lever is text *written to describe mood and craft*,
which needs a capable model.

The `souls` option in `recommend.ts` is the hook for that experiment and costs
nothing while unused.

---

## Proven: model-written recommendation edges (2026-08-12)

The one idea that survived measurement. Cost so far: **$0** — the lists were
written by the model in-session, no API, no key.

**The idea.** Ask the model, once per title, the question a person actually
asks: *"someone loved X — what next?"* Store the answers as edges. The engine
then walks that graph from everything the user liked. AI supplies knowledge it
alone has; the maths supplies personalisation it alone can do.

**Written by hand for 115 titles**, 12 recommendations each, in three layers —
obvious / adjacent / same-feel-different-world — specifically to avoid the
tight-circle failure that TMDB's co-watch data caused in the deck.

### Result 1 — clean, external validation

Checked against real TMDB co-watch behaviour, which nobody here authored:

| | |
|---|---|
| my picks TMDB also links | **16.4%** |
| random titles TMDB links | 0.15% |
| | **107× better than chance** |
| my picks TMDB does *not* have | **84%** — genuinely new information |

High enough to prove the lists are sound; low enough to prove they are not
just re-deriving the free data we already ship. The pre-registered abort
condition was ">60% overlap ⇒ abandon". It came in at 16.4%.

### Result 2 — clean, pre-existing answer key

`benchmark.ts` reference lists were written before this idea existed:

| arm | overall | genre-defined | feel-defined |
|---|---|---|---|
| current engine (TMDB edges) | 17% | 25% | 0% |
| **AI edges only** | **19%** | **29%** | 0% |
| both | 18% | 27% | 0% |

### Result 3 — held-out, but CONTAMINATED

`scripts/feel-test.ts`. Like half a feel-defined library, hold the other half
back as the answer key:

| | without | with AI edges |
|---|---|---|
| Mad Max (gritty practical action) | 8% | **33%** |
| Before Sunrise (quiet talky romance) | 8% | **50%** |

**Do not trust this number.** The same model wrote both the edges and the
answer key, so agreement is partly self-fulfilling. It is recorded because the
direction matches Result 1, not as proof.

### What is still unproven

The feel line in `benchmark.ts` stayed at 0% in every arm. Its personas swipe
by *genre overlap*, so they cannot express a feel-defined taste in the first
place — the persona is the limitation, not necessarily the engine. Fixing that
means personas defined by named films rather than genre rules.

### Next

Scale from 115 titles to the full catalog. ~$3 one-off via any API, or free in
sessions like this one at ~100 titles a time. Engine code is unchanged so far:
`AI_EDGES=ai|union npm run benchmark` is a measurement harness only.
