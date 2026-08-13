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
