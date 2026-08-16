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

## The deck was not running out of films. It was running out of room. (2026-08-16)

He said the hit rate collapses after card 300. His last three sessions read
63% → 22% → 12%, and every fix aimed at that curve had missed. Here is the
curve from the 378-card file he sent, in blocks of fifty, with the median vote
count of the cards in each block beside it:

    cards       he had watched it     median votes
      1-50            74.0%                4,537
     51-100           62.0%                6,980
    101-150           34.0%                6,561
    151-200           28.0%                6,605
    201-250           22.0%                7,114
    251-300           10.0%                6,292
    301-350            6.0%                5,409
    351-378           14.3%                7,824

**The median vote count does not fall.** The deck was not sinking into obscurity
and running out of famous films — it was offering films exactly as famous at
card 350 as at card 50, and he had not watched them. That kills the obvious
explanation and points at the pool instead of the ranking.

The pool is `fameTierSize`. It was:

    min(3000, max(900 + 5*seen - 30*unseen, answered + 300))

Replay his session through it. By the end: seen 122, unseen 256, so the ledger
term reads `900 + 610 - 7,680 = -6,170`. It is negative from about card twenty
onward. **For every card after the twentieth the gate was `answered + 300` and
nothing else** — a reviewer called the ledger dead code from reading it, and
this is that finding measured on a real session.

And `answered + 300` grows by exactly one title per swipe, which is exactly the
rate a person consumes it. The supply of unswiped candidates is a constant 300,
forever, however long anyone sits there. Once the ones he had watched inside
that 300 were gone, the hit rate had nowhere to go.

Worse, the numbers say where the gate was standing. A gate of 678 — his value
at card 378 — reaches down to **8,064 votes** in film. His own calibration
sample says his watch rate by band is:

    under 800 votes    0%        2k - 5k     14%
    800 - 2k          11%        5k - 12k    11%
    2k - 12k          13%        over 12k     0/8

He lives between 800 and 12,000 votes. The gate stopped at 8,064, and its
*ceiling* of 3,000 titles only ever reached 2,339 votes. **The band where most
of his library lives was never fully inside the pool**, which is also why
`Snatch` and `American Pie` never appeared in 1,100 cards.

### The fix, and why it is phrased the way it is

The floor is now written as supply rather than as a rank: `answered` plus a
margin that grows with the session, `max(300, 2 x answered)`, still capped by
TIER_MAX. Swept on 30 real histories at 1,500 cards — the length the product's
goal actually lives at:

| floor | harvested | reachable | lost to gate | lost to ranking |
|---|---|---|---|---|
| `answered + 300` (shipped) | 417.0 | 84.8% | 15.2% | 13.5% |
| **`answered + max(300, 2x)`** | **435.3** | **91.2%** | **8.8%** | 16.7% |
| `6x + 600` | 439.9 | 94.1% | 5.9% | 18.8% |
| `12x + 600`, max 9,000 | 436.8 | 99.3% | 0.7% | 24.6% |

Past 6x the gate stops being the binding constraint at all — 0.7% lost to the
gate against 24.6% lost to the ranking — so widening further only hands the
ranking more work it is not good enough to do.

**Why not the 6x that scored highest.** 439.9 against 435.3 is one percent, and
it is bought with real dilution: `simulate`'s taste-survival check reads comedy
lift 4.63x / 3.86x / 3.45x at 1x / 3x / 6x, and 6x fails that guard at 85% kept
against a 90% target. Moving a threshold so my own change can pass is the exact
mistake this project has made five times. The shipped value clears every guard.

**And a caveat on that guard, because it flatters the old gate.** At 1x it
reads *115%* kept — above 100% — because thirty "never heard of it" answers
contract the pool, and the pool is the denominator. Part of what it was
rewarding was the gate closing, not the taste surviving.

**Why "supply" and not `3 x answered + 400`.** They score the same, but the
multiplier form opens the *first forty cards* onto 520 titles instead of 340,
and `simulate`'s opening-fame guard caught it: lowest vote count 4,775 against
its 5,000 target. Phrasing the floor as "answered, plus a margin" leaves the
opening bit-identical to what shipped — the guard reads 5,379 either way — and
moves only the part that was broken.

### What it is worth, on every ruler

| | before | after |
|---|---|---|
| `harvest`, 30 people x 1,500 cards | 417.0 | **435.3** |
| `harvest`, 60 people x 500 cards | 238.6 | **243.9** |
| `replay`, his own 1,226 labels | 175.4 | **186.8** |
| — his cards 301-400 in that replay | 19.2 | **30.0** |
| `human`, swipe mode | 32.5% | 32.5% (untouched) |
| `simulate` | 12/13 | 12/13, same one failing |

`human` not moving is expected and worth stating: it builds a page from half a
full library, so the floor — which is driven by how much has been *answered* —
never binds there. It cannot see this class of fault at all.

The probe least able to fake it is `deck-drift`. A horror viewer had **one**
horror title left in the gate by swipe 150. The deck was starving, and no
ranking on earth could have fixed that.

---

## Tried and rejected: Wikipedia readership as an exposure prior (2026-08-16)

Everything this project knows about "has this person probably heard of it"
comes from one number, the TMDB vote count, and a reviewer named its bias
exactly: science fiction 3.0x, comedy 0.70x, romance 0.57x. Voters are not
viewers. So a second, independent measurement of the same latent thing was
worth a morning.

Wikipedia publishes a monthly clickstream per language: every (source article
-> target article) pair with ten or more clicks. Summed over sources, that is
how many people went and read about a film last month, in that language.
Nobody has to open an account. `scripts/wiki-clicks.py` joins it to our titles
through the article maps already in `.cache` — 21 languages, 61 million rows,
two minutes, 144,227 titles with any readership at all.

Then the only honest test: score it on the 199 answers the engine did not
choose.

| prior | AUC |
|---|---|
| vote count — what ships | **0.799** |
| wikipedia reads, all 21 languages | 0.578 |
| wikipedia reads, arrived by link | 0.616 |
| wikipedia reads, arrived by search | 0.573 |
| wikipedia reads, English only | 0.487 |
| votes x wikipedia | 0.719 |
| votes + wikipedia, equal weight | 0.726 |

Not close, and mixing it in makes vote count *worse*. Rejected, nothing
shipped, and the collector is kept because it took two minutes to run and the
next person to have this idea deserves the number rather than the argument.

**The obvious explanation is wrong.** The first guess was recency — July 2026
traffic measuring what is in the news rather than what people have seen. It is
not that: the median reads by release decade run 3,074 for the 1980s, 25,635
for the 1990s, 20,335 for the 2000s and **924** for the 2010s. The 2010s, the
most-watched decade in the sample, are the *quietest* on Wikipedia. Whatever
readership measures, it is not exposure.

One caveat recorded rather than hidden: only 93 of the 199 sampled titles have
an English article in our map, so the English-only row is confounded with
coverage. Restricted to covered titles the sample holds four positives, which
is too thin to conclude anything from, and the multilingual rows — which do
cover all 199 — lost on their own.

**A second null, worth as much as the first.** The same sample says "is it
English" scores 0.839, higher than vote count, because he had watched none of
129 non-English titles. That reads like an argument for an English-first gate
until you measure what the gate already does: across his real sessions the
deck was **95.0% and 97.1% English**. Non-English is 11 cards out of 378. There
was nothing to win, and a day was saved by counting before building.

---

## The measurement was the thing that was broken (2026-08-16)

199 titles, drawn uniformly at random from the whole catalog, seen or not-seen
answered by the person this is being built for. The first data in this project
that the engine did not choose. It cost him ten minutes and it overturned the
premise of the last several weeks.

### Fame was never worthless

    AUC of vote count, measured on cards the deck chose        0.500
    AUC of vote count, measured on the random sample           0.799

The deck draws from roughly the top 900 titles by vote count. Every label we
had was therefore collected from a sample already truncated on the very
quantity being tested, and AUC collapses toward 0.5 under range restriction as
a matter of arithmetic. "Fame is a coin flip, therefore worthless as an
exposure prior" was read off that 0.500. It shaped the reach model, the gate
reserve, and a long line of experiments that were all trying to replace
something that was working.

A second reviewer predicted this exact artefact from the code alone, before the
sample existed. That is the fifth and sixth time an instrument here has been
the broken thing, and the first time someone called it in advance.

### What a person's exposure actually looks like

    votes        asked   watched
    under 100       49         0
    100 - 500       55         0
    500 - 2k        50         4
    2k - 6k         33         5
    over 6k         12         0

A hill, not a ramp. Nothing below five hundred votes and nothing above six
thousand — the nine he had seen carry 1,176 to 5,914. Alien, Spirited Away,
Toy Story, Django Unchained: not watched.

Fitted as a fixed curve it scores 0.861 against the monotonic 0.799, and 0.841
with the centre never seeing the held-out point. Then measured against sixty
real viewing histories it is a rout the other way: harvest 225.4 to 161.5.
MovieLens users are film enthusiasts and they *have* watched the most-famous
titles.

Both results are true. The peak is a fact about a person, not about a catalog,
and a constant is the wrong container for it. So fame became the seventh facet:
a title carries a band token, the exposure tables learn which bands this viewer
answers yes to, and their peak is placed by their own swipes. Replayed through
his 1,478 real answers the tables recover the same curve the random sample
found independently — 2k-5k and 5k-12k at -0.47 and -0.46, everything either
side at -0.87 to -1.00.

    harvest 225.4 -> 234.2 · ranking loss 35.8% -> 34.2% · replay 169.7 -> 171.6

### Reading a language is not watching films in it

Of **129 non-English titles he was asked about, he had watched none**. Not one.
He reads Arabic.

Four passes of work that same morning had taken an Arabic reader from 0 Arabic
titles in 200 cards to 56, by seeding the language door from
`navigator.languages`. Every one of those 56 would have been a wasted swipe. It
was built on an assumption that felt too obvious to test, and the first data
that could test it refuted it in an afternoon. Strength set to zero the same
day it shipped.

### And the number that resized the product

A 4.5% base rate over 12,826 titles put his entire watchable library inside the
catalog at about 580 titles, against the 245 he had recorded. Some of the decay
everyone had been chasing was not a ranking failure at all. He was running out.

Which turned the question from "how do we rank better" to "what is missing",
and TMDB answered that directly:

    English films      TMDB has    we had    coverage
    500 - 2,000            4,067     1,363        34%
    2,000 - 6,000          1,771     1,770       100%
    6,000 - 12,000           570       570       100%

Complete above two thousand and a third below, because `LANG_FLOORS.en` was
1,000 and cut exactly there — in the one band the only unbiased evidence says
he lives. 2,257 titles added, 850 of them comedies, and his library inside the
catalog goes from about 580 to about 828.

No ruler here can score that: MovieLens histories contain no 500-vote films and
his old labels came from a catalog without them. harvest 234.2 -> 232.3 and
replay 171.6 -> 173.2 are what "did no harm" looks like, and the evidence is
TMDB's own counts rather than any instrument of ours.

### What this changes about how to work here

Every label this project owned was chosen by the model being tested. Six broken
instruments in, the pattern is not bad luck: an engine that selects its own
evaluation data will confirm itself, and no amount of care inside that loop
gets out of it. `npm run calibrate` makes the outside sample a permanent
instrument. It is one person and cannot fit a population — but a reference does
not need to be a population to show that a gauge reads wrong.

---

## The stutter was the site writing down what you just told it (2026-08-16)

"There is a slight hitch in the swipe, it is not smooth enough."

Frame timings at 4× CPU say the drag itself is perfect — 528 frames, median
16.7ms, **not one frame over 24ms**. The hitch is entirely at the instant the
finger lifts, and it is the same shape every time:

    release 1: 17 17 67 67 17 17 17 17 17 17 33 33 17 17
    release 4: 17 17 100 100 50 50 17 17 17 17 17 17 17 17

Profiling it found script was only 7% of the time, so the first instinct — the
engine, the re-rank — was wrong. Removing one rendering layer at a time found
no single owner either. What found it was asking a different question: **does
it get worse as the library grows?**

| library | stored | frames lost per swipe window | worst stall |
|---|---|---|---|
| empty | 3 KB | 25 | 67 ms |
| 200 swipes | 376 KB | 52 | 183 ms |
| 600 swipes | 992 KB | **79** | **250 ms** |

A quarter of a second of frozen screen on every card at six hundred swipes,
and the goal for this product is *every film a person has ever watched*.

### Why

`createJSONStorage` hands the persist middleware a *string*, so
`JSON.stringify` of the whole library ran inside every `set` — on the main
thread, at the worst possible moment. The write was already deferred; the
encoding, which is the expensive half, was not. I had written that deferral
myself and stopped one step short.

Implementing `PersistStorage` instead means the middleware hands over the
state *object* and we choose when to encode it. The state is immutable, so
holding the latest reference and encoding once per burst loses nothing.

### And a ceiling nobody had checked

Two fields were 61% of every stored swipe: `related` (the co-watch edge list,
derived from the bundled catalog) and `overview` (display prose, also in the
catalog). Neither is read by the taste model. Dropping them takes a stored
title from 1,412 bytes to 490 — which matters because localStorage stops at
five to ten megabytes:

    old shape    6.7 MB for 5,000 films   — over the limit, silent data loss
    new shape    2.3 MB for 5,000 films

`titleFor` also had its fallback backwards, preferring the stored copy over
the catalog. The catalog entry is complete and current; the stored copy exists
for the one case it cannot cover.

### Result

| library | frames lost, before → after | worst stall |
|---|---|---|
| empty | 25 → **19** | 67 → 50 ms |
| 200 swipes | 52 → **21** | 183 → 67 ms |
| 600 swipes | 79 → **46** | 250 → 100 ms |

Stored size at 600 swipes: 992 KB → 499 KB.

Also measured: the fly-off copy mounted a whole `PosterArt` — a React subtree
and a fresh `<img>` — at the instant of release, and cost 9 of 24 frames on its
own. It is now a background image on a bare div, which paints the same pixels
from the same cached URL.

### Tried and rejected, both measured

**Scheduling the flush through `requestIdleCallback`**: 46 frames lost against
45. No effect; the plain timer stays.

**Dropping backdrop blur from the cards behind the top one**: taking blur off
the *whole* deck saves 8 of 26 frames, so this looked free. Measured at the
deck level it was 39–46 against 42–46 — inside the noise. Reverted rather than
kept on the strength of a plausible story.

### Still open

At six hundred swipes the hitch is still twice what it is at zero, and the
remaining cost is not the encode (moving the write outside the measured window
changed nothing) and not `applySwipe` (flat at 1ms once the facet tables cap).
Ten percent of the sampled time is garbage collection, which grows with the
live heap. No fix measured yet.

---

## The deck was overwriting the question it had just asked (2026-08-16)

The first recording showed a broken deck and I found three real faults in it
(below). None of them was the one he was actually pointing at. He filmed it
again — 1.55 seconds this time, only the moment it happens — and added the
detail that closed it: **he had not flipped a single card. All of it was the
fault.**

At sixty frames a second the sequence is not ambiguous:

| time | on screen |
|---|---|
| 0.22s | he swipes Kick-Ass 2 right |
| 0.30s | Grown Ups settles on top, unanswered |
| 0.42–0.60s | **two live cards drawn over each other** — Limitless fading in *in front of* Grown Ups, which is pushed to second place |
| 0.63s | he swipes Limitless |
| 0.70s | Grown Ups is on top again |
| 1.02s | three Grown Ups cards on screen at once |

Two full cards, both with their year badges and their details buttons, one
fading in over the other. Not a fly-off copy — those carry no text. Two live
cards, and the one he had been about to answer was shoved into second place by
a card the deck had already dealt him.

### The cause: a rebuild that installs a snapshot of the past

`rebuild()` captured the top card, then — because Supabase is configured on the
live site, which it is not in any of my local runs — went to `/api/recommend`
and installed the answer when it came back. On mobile data that round trip is
a few hundred milliseconds, and the head it put back was the head from *before*
the round trip. By then the viewer had usually answered that card and moved on.

So the deck re-dealt a card he had judged, `AnimatePresence` was handed a key
it was still animating out, and both copies were drawn at once. Every symptom
in the recording follows from those two lines.

### How it was caught, after two probes that lied

The first two versions of the probe read the top card as
`document.querySelector('h2')`. That is wrong: an answered card stays mounted
for the 520ms of its fly-off and sits *earlier* in the DOM than the live one.
The probe reported "29 of 30 swipes dead" on a build where every swipe worked,
and then "0 faults" on the build that had them. Both readings were the
instrument, not the app. Recording it here because it is the fourth time in
this project that the ruler was the broken thing.

What finally worked was logging the install itself — what head it was about to
put back, and what head was actually live at that instant:

| | installs | installed a stale head |
|---|---|---|
| the build he filmed | 15 | **1** |
| after the fix | 5 | **0** |

The one stale install is visible in the log doing exactly what the video shows:
the head it restores becomes the top card on the very next line, and the card
that had been live is gone. On his phone — real network jitter, a real CPU, and
a build where the rebuild ran after *every* swipe rather than every sixteenth —
that rate is many times higher, which is why his 1.55 seconds contains four of
them and my 50 swipes contain one.

### The fix

The head is read at install time and never captured earlier, answered titles
are filtered out on the way in, and the queue is de-duplicated. The live top
card can no longer be displaced by a rebuild, by construction.

Two smaller things went with it. The fly-off copy took its title from
`queue[0]` in the deck's render closure while the commit read the live queue —
two swipes inside one React batch made them disagree, so the animation showed
one film leaving while a different one was recorded. It now uses the title the
commit returns. And the recommend endpoint, which answers 503 whenever the
Supabase catalog is not seeded, was asked again on every rebuild; one failure
is now enough to stop asking.

Measured on a production build at 4× CPU with 400ms of endpoint latency, 60
drag swipes 250ms apart: 2 cards re-dealt before, 0 after, twice each.

---

## Three faults behind one word: "glitching" (2026-08-16)

The user filmed it. Nineteen seconds, and it is unambiguous: cards frozen for
three and five seconds at a time while he swipes at them, the same two titles
alternating back and forth, blue placeholder cards sliding across, and — his
own observation, which turned out to be a separate bug — "if you see a card
that doesn't flip, that is also part of the problem."

### 1. I had been measuring a development build

Every performance number I took was against `next dev`. Profiling the phone
under CPU throttling showed the time going to `jsxDEV` — the JSX dev transform.
Rebuilt for production and measured again:

| 6x CPU throttle | six swipes, no rebuild |
|---|---|
| `next dev` | tasks of 250-295ms, nine over 150ms |
| `next start` | tasks of 64-92ms, none over 150ms |

Three times the cost, and it sent me looking in the wrong place first. **The
deck runs in production; measure production.**

### 2. The re-rank ran after every swipe and froze the phone

`recommend()` is one indivisible block of main-thread work. On this machine it
is 49ms; with the CPU throttled the way a mid-range handset behaves:

    1x       49 ms
    4x      247 ms
    6x      428 ms

The page is *frozen* for that whole time — no swipe, no tap, no flip, no
animation. It ran after **every** swipe, on the reasoning that a stale batch
makes a deck feel deaf. That reasoning was written when the catalog was 5,555
titles; it is now 12,826.

The reserve is now 24 cards, refilled when 8 remain: one rebuild per sixteen
swipes instead of one per swipe. The price is that a card can be sixteen swipes
stale, and that trade is not close — nobody notices ordering that is slightly
behind, and nobody fails to notice a screen that ignores them. The real answer
is to move this off the main thread, and a broken app should not wait for it.

Measured after, on production at 6x throttle: **20 of 20 swipes recorded at his
real pace and in bursts, with one freeze over 150ms in twenty cards.**

### 3. The flip was being eaten by the drag

The card is a drag surface and Framer starts a drag after a few pixels — which
a thumb tap always produces. The drag then swallows the click, and the details
button does nothing. `onPointerDownCapture` stops the pointer at the button so
the drag never begins. With a deliberately wobbly touch tap: **7 of 8 flips**.

I could not get a clean before/after on this one — the harness kept failing to
find the button on the control build — so the honest claim is that the
mechanism is specific and understood and the fix measures 7/8, not that I
watched it go from 0 to 7.

### 4. And a glitch I had added myself the same day

The fly-off copy introduced this morning re-mounts `PosterArt`, which draws
generated artwork first and cross-fades the real poster on decode. For a copy
of a card whose poster is already in cache that is simply wrong, and it flashed
the blue placeholder — visible in the recording as blue cards sliding across,
which is exactly the "the card changed into something else" he described. It
now shows the image immediately when the browser already has it.

### What this says about the rulers

Nothing here was findable by anything in the repo. Every instrument calls
`applySwipe` directly; not one touches the interface, renders a frame, or runs
on a slow device. The engine can be measurably excellent while a third of the
answers never arrive — and some fraction of the block counts he sent me over
the past days were cards he answered and the site dropped.

---

## The deck was deaf for half a second after every swipe (2026-08-15)

The user reported it and could not describe it precisely — "you swipe a card
and it returns to its place, like you didn't swipe", "the card shows a movie
and then it changed", "the whole thing is glitching". Not an algorithm
problem, and it made testing anything else impossible.

**Reproduced, and it is exact.** Real touch events through CDP on an iPhone
viewport, counting what actually reached the store:

| swipe every | flicks | recorded |
|---|---|---|
| 1200ms | 6 | 6 |
| 600ms | 6 | 6 |
| **250ms** | 6 | **4** |
| **120ms** | 6 | **3** |

### The cause

The swipe committed from `onAnimationComplete`, at the end of a **520ms**
fly-off. For that whole half-second the deck was deaf: `drag` is disabled once
a card is exiting, and the exiting card still sits at index 0 owning the
pointer, so a second gesture in that window reached nothing and the card simply
sat there. He swipes at 1.1s on average with bursts far faster, so he was
losing roughly every other card in the bursts — and the card that "came back"
was the *same card*, never answered.

Half a second is nothing to a machine and a very long time to a thumb.

### The fix

Input is decoupled from animation. A gesture commits the instant the finger
lifts; the deck keeps an inert copy of the answered card on screen for the
fly-off, `pointer-events: none`, starting roughly where the thumb let go so
the hand-off is invisible. The real card leaves the queue immediately, which
is what frees the deck to take the next gesture.

Buttons go through the same path now instead of setting a flag and waiting for
an animation to finish.

**After:** 6 of 6 recorded at every interval down to 120ms; 12 rapid alternating
swipes give exactly 12 swipes, 12 order entries and `totalSwipes` +12 — no
losses and no double-commits. Each action button commits exactly once, undo
still removes exactly one, and six rapid taps on the heart give six.

### Worth remembering

Nothing in the test suite could ever have caught this. Every ruler here calls
`applySwipe` directly — none of them touches the interface, so the entire
engine can be perfect while a third of the user's answers never arrive. He
found it in a minute of use, and it had presumably been corrupting his
sessions all along: some fraction of the "on taste" counts he has been sending
me are cards he answered and the site discarded.

---

## Paying the debts: a cache that lied, and a bucket with no tap (2026-08-15)

### The cache was returning another run's answer

The walk cache shipped this morning keyed on `liked.length` plus the last id,
on the reasoning that an append-only list is identified by those two. True for
one viewer in one session. False the moment two runs share a pool — and the
tunnel-vision guard runs the same persona twice, co-watch on and off, so their
liked lists collide on that key.

The guard's reading swung between **1.39x and 3.39x on identical code**, and I
spent an afternoon reading its noise as signal. Keyed on a rolling hash of
every id now, which costs microseconds against the 20ms it saves and cannot
collide. Verified: the cache on and off produce byte-identical results.

**The true reading is 3.39x, not the 1.39x recorded earlier.** The catalog
doubled since that number was taken, and the graph's neighbourhoods are now a
smaller fraction of a larger pool, so co-watch concentrates harder.

### And the guard is right about the shape

Measured directly: after four likes, **ten titles hold 66% of all co-watch
mass** and the median title scores 0.0000. The top is normalised to 1, so at a
weight of 0.8 a handful of candidates get a bonus larger than the entire
recognition term and everything else gets nothing. That is a shortlist, not a
ranking signal.

A root curve was the obvious fix — keep the ordering, spread the magnitude, so
the hundredth neighbour becomes a nudge instead of a rounding error. Swept
against the weight:

| weight | curve | guard | his labels |
|---|---|---|---|
| 0.8 | 1 (ships) | 3.39x | **87.6** |
| 0.8 | 0.5 | 1.72x | 80.4 |
| 0.6 | 1 | 1.83x | 83.9 |
| 0.5 | 1 | **1.22x** | 69.1 |
| 0.6 | 0.5 | 2.27x | 67.0 |

**Perfectly monotone, and there is no free fix.** Every step that calms the
guard costs the only ruler graded against a real person's answers, and nothing
reaches 1.15x without giving up a fifth of it. Harvest — the ruler that
measures the actual goal — is flat across all of them.

So it stays red, deliberately. Its own comment calls four named titles "not a
goal in itself… any single one is a needle", two other tunnel checks in the
same suite pass, and its 1.15x limit was calibrated against a catalog less than
half the current size. Retuning it to pass would be moving the goalposts;
buying it with the real ruler would be paying for a proxy. Left failing, in the
open, with the table above in the code.

### The grid was harvesting into a bucket with no tap

The grid answers "have you watched it" and stops — thirty taps cannot carry
thirty verdicts. But the deck excludes everything already swiped, so a viewer
who marked five hundred titles had a library the site knew they watched and
would **never** ask about. Two surfaces, and the handoff between them did not
exist.

`pendingVerdicts` now puts them at the front of the deck, and they are the best
cards it will ever have: the viewer has already said they saw them, so the hit
rate is 100% and every answer is pure taste evidence with no recognition
guessing and no wasted swipe.

Driven in a browser: mark six on the grid, open the deck, and it asks about
them. Which surfaced a second thing only a browser could show — the deck
greeted a viewer who had just answered thirty questions with **"Swipe cards so
we learn your taste"**, because the welcome keyed off a screen flag rather than
off whether the person had told us anything. It now keys off `totalSwipes`.

---

## A better prior that the engine cannot use (2026-08-15)

The catalog gained 7,271 titles with no behavioural data of any kind — the
multi-language clickstreams rescued 61 — so they are ranked on metadata and a
prior. The prior is `recognizability(voteCount)`, and a TMDB vote count is a
survey of Western film enthusiasts: an Egyptian film fifty million people
watched carries eighty votes. Three paid experiments have asked a model about
*taste*; this asked about **exposure**, which is world knowledge rather than a
claim about art.

### In isolation it is clearly better

`scripts/llm-exposure.py`, on the user's 526 real labels split by time:

| | AUC |
|---|---|
| global vote count, what ships | **0.500** |
| the model, per title | **0.639** |
| his own genres + decade | 0.737 |
| 20% model blended into his own | **0.750** |

And the finding that made it look shippable: **the model scores 0.639 whether
or not it is told whose history it is looking at.** Told his tastes, told
nothing — identical. So it is not personalisation, it is a fact about the
title, computable once offline instead of an API call per screen forever.

Model choice measured rather than assumed: Opus 0.639, Sonnet 4.6 0.624, Haiku
4.5 0.593. `scripts/llm-reach.py` then scored the catalog — **11,880 of
12,826**, stopping when the API credit ran out. The 946 missing skew Malayalam,
Tamil and Arabic, which is the worst possible place for a gap.

### End to end it buys nothing

Shipped raw first, and it cost 40% of the real-label ruler — 88.0 to 52.5. Not
the ordering, which is what improved: the *distribution*. Median reach is 0.14
against the old prior's 0.583, and the score computes `wRecognition * known`
with the weight near 0.9, so substituting it silently divides the whole
recognition term by three and hands the ranking to taste and quality.

Fitted a power curve so reach's 10th, 50th and 90th percentiles land on the old
prior's, leaving the ordering untouched. Then swept the blend:

| weight | 0 | 0.25 | 0.35 | 0.5 | 1 |
|---|---|---|---|---|---|
| harvest | **243.1** | 240.7 | 241.8 | 237.6 | 229.7 |
| his labels | 87.6 | 89.4 | **92.3** | 84.5 | 62.9 |

The two rulers disagree in opposite directions and both moves sit inside their
own noise. Ordering the **gate** by reach instead of votes — the place it
should matter most, since that is what puts an Egyptian film at rank 8,000 —
changed harvest by nothing at all.

### Why, and the lesson

`recognizability` is not only an exposure prior in this engine. The gate ranks
by vote count, the tier ledger counts against it, the quality prior correlates
with it, and every constant around it was fitted with it in place. **The AUC
test isolated one of its four jobs and improved that one.** A term measured
better at the job you asked about can still be worse at the job it is doing.

Default is 0. The data is kept in `.cache/reach.json`, the loader is
best-effort, and `REACH=0.35 npm run replay` re-measures in one command. It is
**not** shipped to the browser — 55 KB for a term weighted zero is 55 KB
wasted.

### What would make it pay

Nothing here tests it on the case it was bought for. This viewer's labelled
history is almost entirely English-language film, so the measurement above says
nothing about whether reach helps an Arabic speaker find Egyptian cinema — the
one place the vote count is not merely weak but structurally blind. That needs
labels from someone whose history is not English, and we have none.

---

## The screen (2026-08-15)

`/seen` exists. Thirty posters, tap what you have watched, commit, next screen.
A tap writes `seen`; everything untapped writes `not_seen`, which is a real
answer and the whole reason the page is fast — twenty-odd "no"s cost the
person nothing to give.

Driven in a real browser rather than assumed: thirty tiles render, taps toggle,
the commit writes all thirty answers, the counter advances and the next screen
arrives. Two things only showed up by looking at it:

**Only ten of thirty posters fit on a phone.** The first build used three
columns, and a grid you have to scroll three times is a slower deck — the
speed comes entirely from the eye taking in many at a glance. Four columns puts
about twenty in view. A poster stays recognisable well below that size, because
recognising something you have already seen needs far less detail than reading
something you have not.

**The library badge marked grid titles as disliked.** It had two states, liked
and everything-else, and a title added from the grid is watched with no
verdict. Putting a thumbs-down on it invents the opinion the `seen` action
exists to avoid. Three states now.

The posters do not load in this sandbox — the headless browser cannot reach
`image.tmdb.org` although curl can, so every tile falls back to generated art.
That is the environment, not the page; `PosterArt` always draws art first and
cross-fades the real poster over it.

**Not decided, and deliberately left alone:** whether this should be where a
new account lands. It is a tab, not the front door. The measurement says the
grid harvests 2.2x faster while collecting no taste at all — so the answer is
probably "grid first, deck after", but that is a judgement about what someone
wants on their first visit and not something the harvest ruler can settle.

---

## A grid asks a different question, and it is 2.2x faster (2026-08-15)

The arithmetic the harvest ruler exposed: **a card asks about one title, so
harvesting H titles takes at least H interactions.** No ranking, gate, graph or
model beats that. 2,000 cards recovers 78% of a real history and costs 37
minutes of uninterrupted swiping, with the last hundred cards yielding four
titles each.

A grid inverts the cost. Thirty posters, tap the ones you know: thirty answers
for one screen, and a title the viewer has never heard of costs a glance rather
than a swipe.

### The fourth answer

`SwipeAction` gains `seen` — watched, no verdict — because nobody rates thirty
films by tapping and flattening a tap into `liked` would invent a preference
the person never expressed. It writes to the exposure tables at full strength
and **nothing** to the taste tables; it moves no facet importance, because
there is no verdict for a facet to have predicted; and it ends a skip streak,
because a tap is a person saying they know the thing. Thirty taps should teach
the site thirty more titles you have seen and nothing at all about what you
enjoy. Those are two questions and this answers one.

### Measured, with the cost model taken from his own sessions

1.1 seconds a card is his real rate across 1,288 swipes, not an assumption.
A grid screen is charged 1.5s to take in plus 0.35s a poster.

| | attention spent | titles harvested per hour |
|---|---|---|
| deck | 9.2 min | 1,667 |
| **grid** | **3.4 min** | **3,656** |

**2.2x.** 2,000 titles becomes seventeen minutes instead of thirty-seven. Not
the 5x the reviewer estimated — his figure assumed 2.5s a card and the user is
more than twice that fast — and not nothing.

### And it refuted my own reasoning about the gate

I argued that once a miss costs only a glance there is nothing left for a fame
window to protect, so the grid should rank the whole catalog by
`watchLikelihood`. Measured, wider pools are monotonically worse:

| candidate pool | the deck's gate | 3x | 8x | whole catalog |
|---|---|---|---|---|
| titles per hour | **3,656** | 2,533 | 2,075 | 1,979 |

A cheap miss is still a wasted tile. The gate is not only a cost control — it
is a statement about which titles a person plausibly knows, and that stays true
however little a wrong answer costs. The grid draws from exactly the deck's
pool; only the *question* changes.

Ranking a **deck** purely by exposure was also tried and was a wash (236.2
against 236.9), because the recognition term already dominates the deck's
blend. On a grid there is no such term to hide behind, so the objective has to
be stated outright — which is why `watchedGrid` exists rather than a mode flag.

### The cost of the bigger catalog, stated

The re-rank went from a 24ms median to 33-38ms against a 40ms guard, and
`simulate` now reports it as failing on some runs. Profiled at 120 swipes: the
whole re-rank 58ms, of which the graph walk 21ms and the fame gate 8ms. The
walk is cached now — it was recomputed after every swipe although the liked
list only changes on a right-swipe, so two thirds of that work was thrown away.

Sweeping `WALK_FRONTIER` at 150 / 300 / 600 gave 38.5 / 33.7 / 35.4ms — no
ordering, because this machine varies by ~5ms between identical runs. There is
no signal to tune against, so nothing was tuned. The guard is marginal rather
than comfortable; it is measured off the swipe critical path, and if it ever
matters on a real phone the answer is to ship less catalog rather than to shave
the walk.

**Still to build: the screen itself.** The engine, the fourth answer and the
selection are in and measured; no user can see any of it yet.

---

## The other thirty-nine Wikipedias, and why they do not save us (2026-08-15)

The catalog gained 7,271 titles and **not one of them had a behavioural edge**:
the distilled MovieLens graph covers the original 5,555, and the English
clickstream does not know Egyptian or Tamil cinema exists. They were in the
catalog and invisible to every signal that made this engine work.

The reviewer found the material, and it is exactly the right shape: Wikipedia
publishes the same monthly clickstream, same CC0 licence, for **forty
languages** — `arwiki`, `hiwiki`, `tawiki`, `mlwiki`, `trwiki`, `fawiki` among
them. Small, too: Arabic 12.5 MB, Hindi 1.6, Tamil 0.9, Malayalam 0.4, all ten
together less than the English dump alone. `scripts/wiki-edges-multi.py`, one
Wikidata query per language so nothing is matched by name, and deliberately no
cross-language edges — an Arabic reader moving between two Egyptian films is a
statement by that audience about that cinema, and routing it through English
articles would replace it with what English readers think of Egyptian film.

**Built, run, and it does almost nothing.** Click pairs found inside our
catalog, per language:

| | pairs | titles in catalog | rescued from having no graph |
|---|---|---|---|
| Arabic | 813 | 331 | **10** |
| Hindi | 36 | 500 | **0** |
| Tamil | 12 | 387 | 2 |
| Malayalam | 0 | 293 | **0** |
| Turkish | 1,435 | 578 | 4 |
| Japanese | 3,546 | 730 | 0 |

**61 titles in total.** The cause is not the mapping — 6,261 of our titles
have an Arabic article, 1,775 have a Hindi one. It is traffic. Wikipedia's
clickstream only publishes pairs above ten clicks in a month, and the small
wikis do not have ten clicks between two film articles. The data is not thin,
it is absent, and no threshold we control can recover it.

The signal that *is* there is real — `3 Idiots → Rang De Basanti, Nanban, Like
Stars on Earth, Jab Tak Hai Jaan` is a genuinely good Hindi neighbourhood, and
`Parasite → Mulholland Drive, Blue Is the Warmest Color, Talk to Her` is a
genuinely good one for Parasite. There is simply almost none of it.

Kept, because it is additive and costs nothing: the merge only fills titles
that have *no* graph at all and never displaces real co-watching. Measured on
the same 60 people, harvest 243.1 against 243.8 — unchanged, as 61 titles out
of 12,826 should be. On the user's own labels at 30 seeds the catalog now
reads **87.6 against the old catalog's 82.7**.

**So Arabic, Hindi, Tamil and Malayalam cinema are now in the catalog and still
have no behavioural data.** They are reachable — the language door and the
per-language floors did that — and they are ranked on metadata alone, which is
the weakest of the three signals this engine has and the one measured worst.
That is the honest state, and the next question is what could actually supply
it: the reviewer's LLM-for-exposure bet is the cheapest untested candidate, and
it is aimed at precisely this hole.

---

## Two lines were keeping a language off the site (2026-08-15)

The user named eleven titles he loves that the site had never once shown him.
Four were not in the catalog at all, and they were not obscure: Key & Peele,
The Daily Show, The Tonight Show, Old Dads. He also said he likes Indian and
Arabic films and the site behaves as though they do not exist.

It behaves that way because they did not. `en 4,814 · ja 237 · hi 6 · ar 2` —
**two Arabic titles on a product whose first language is Arabic.**

### The cause, measured against TMDB itself

`MIN_VOTES = { movie: 1000, tv: 400 }`, one global floor. Films at or above it,
across the whole of TMDB:

| language | ≥1000 (our floor) | ≥100 | ≥20 |
|---|---|---|---|
| Arabic | **1** | 20 | 258 |
| Hindi | 6 | 299 | 1,163 |
| Tamil | **0** | 29 | 376 |
| Malayalam | **0** | 10 | 291 |
| Turkish | 1 | 102 | 609 |

**There is one Arabic film in existence above our floor.** Not
under-represented — arithmetically impossible. TMDB's voters are overwhelmingly
Western, so a vote count is an English scale: an Egyptian film fifty million
people watched carries perhaps eighty votes. This is the same mistake the code
already fixed once between film and television, made again one axis over.

The second line was `EXCLUDED_GENRES = {news, talk, reality, soap}`, written
because a chat show is not a story and would pollute the taste vectors. Sound
reasoning about *recommending*, and wrong about the actual goal: The Daily Show
carries 650 votes, well clear of the floor, and was excluded by definition.

### What shipped

Per-language floors, and a language pass per language because
`sort_by=vote_count.desc` over the whole corpus is an English ranking that
fills up before a single Arabic title appears. `reality` and `soap` stay out.

| | before | after |
|---|---|---|
| Arabic | 2 | **331** |
| Hindi | 6 | **500** |
| Tamil | 0 | **387** |
| Malayalam | 0 | **293** |
| Turkish | 7 | **578** |
| Persian | 1 | **117** |
| Japanese · Korean · Spanish | 237 · 80 · 109 | 730 · 469 · 636 |
| **total** | 5,555 | **12,826** |

Eight of his eleven named titles are now present. The three still missing —
Old Dads (480 votes), The Tonight Show (382), Key & Peele (252) — are English
titles under the English floor, and lowering that is a separate decision with
its own measurement.

### The gate fix, and the version of it that was wrong

Adding the titles is half the job: at 300 votes an Arabic film ranks near
global 8,000 and the gate ends around 1,700, so it would never be offered.

**Tried first: rank every title by its percentile within its own language.** The
exact analogue of the film/TV split, and it looks right. Measured, absolute
harvest fell **16%** — because the gate's ~900 slots then split across 27
languages *for everybody*, including the viewer who only watches English. It
hands every new person a deck proportional to the **catalog's** languages
instead of to **theirs**, which is the same class of error as answering "have
you seen this?" with a global vote count. Reverted.

What shipped instead is a **door**: the per-language fame lists exist, and the
gate opens one into a language only once the viewer's exposure tables show they
watch it. A new account gets the global fame order unchanged. The door widens
with the evidence, and `watchLikelihood` still decides what comes through it.

### And a false alarm worth recording

The first comparison said the new catalog was 20% worse. It was not the
catalog: the shipped `public/catalog.json` carries the distilled EASE and
Wikipedia graph, applied *after* the build by `apply-edges.ts`, and the fresh
build had only raw TMDB links — 6.4 per title against 40.6. I nearly threw out
a good catalog on that number.

| same 60 people, 500 cards | harvest |
|---|---|
| old catalog, 5,555 | 245.2 |
| new catalog, raw | 195.7 |
| new catalog + the graph | **243.8** |

**No regression, with 7,271 more titles and whole categories that did not
exist.** `simulate` 12/13 (the same pre-existing failure), `vibe` 60%
unchanged, and `replay` — the user's own labels — **82.7 → 94.4**.

The cost is real and should be stated: the download goes from 1.78 MB gzipped
to 3.33 MB. And 7,271 of the new titles have no behavioural edges at all,
because the distilled graph only covers the original 5,555. That is the next
piece of work, and the reviewer found the material for it: Wikipedia publishes
clickstreams for **40 languages**, `arwiki` and `hiwiki` and `tawiki` among
them, all CC0 — behavioural data for exactly the cinema just added.

---

## The first instrument that measures the actual goal (2026-08-15)

The user stated the goal plainly, and it is not the one anything here was
measuring: **within about a week, a person should be able to get every film
they have ever watched into the site.** Once it knows that, it knows them.

Every ruler in this repo grades recommendation quality — given what you like,
are the next twenty cards good. Not one measures how much of a person's
history the site can pull out of them. So weeks of work have been better and
better answers to a question nobody asked, which is exactly why three
consecutive real 400-swipe sessions came out looking identical to him.

His own three sessions, 1,288 cards, measured for the first time:

    block 1-50     41 watched per 50    3,061 titles/hour at that rate
    block 101-150  22                   1,577
    block 201-250  12                     853
    block 301-350   4                     220

**A sevenfold collapse in eight minutes.** At the marginal rate, 2,000 titles
would take five hours and the rate is still falling, so in practice it never
arrives.

### The ruler

`scripts/harvest.ts` with `scripts/build-histories.py`. A MovieLens user with
250+ of our films *is* a watch history — they rated it, so they watched it —
and MovieLens wrote it, so the oracle cannot be bent to flatter us. The
session runs for real: deck picks, person answers from their history, profile
updates. Two numbers:

  - **harvest** — how many of their real history the site got out of them
  - **ceiling** — how many the gate could ever have offered, at any length

When harvest sits below ceiling the ranking is at fault. When ceiling is low,
no ranking can help and the fault is reachability. First reading, 15 people,
500 cards: **harvest 43.5%, ceiling 63.0%**, and the same declining shape as
his real session (71.9 found in the first hundred, 33.1 in the fifth).

### It contradicted my plan within the hour

I had announced ruler → reachability → catalog → edges → interface, on the
argument that the gate's ceiling of rank 1,769 locks out the user's own films
at ranks 1,890 to 3,131. Swept against the new ruler:

| gate | ceiling | harvest (300 cards) |
|---|---|---|
| `TIER_BASE` 900 (shipped) | 55.6% | **33.5%** |
| 1,800 | 68.5% | 32.8% |
| 3,000 | 75.5% | 32.2% |
| `TASTE_DEPTH` 5 | 70.2% | 32.7% |

Widening the gate raises the ceiling by twenty points and harvest **does not
move**. Repeated at 800 cards in case the session was too short to exhaust the
narrow pool: 301.2 against 300.5. Identical.

So "delete the gate" — the reviewer's second recommendation — does not improve
the goal, and neither would my own Phase 1. The reachable supply is already
larger than the ranking can use.

### Except for exactly the people this is built for

That population is mainstream: the median film in their history sits near rank
500, so almost none of it was ever outside the gate. Selecting the twenty
whose history sits deepest — median rank 1,185 to 2,093, straddling and
passing the ceiling of 1,769 — flips the sign:

| gate | ceiling | harvest (500 cards) |
|---|---|---|
| shipped | 58.3% | 217.8 |
| wide | 64.7% | **230.8** |

**+6%.** Real, in the right direction, and small. Measuring only the first
population would have said the gate is harmless; only the second would have
overstated it. Both are kept for that reason.

### What actually binds, and it is arithmetic

A card asks about exactly one title. Harvesting H titles therefore needs at
least H interactions — no ranking, gate, graph or model can beat one title per
interaction. At the 59% hit rate the ruler measures, 2,000 titles is 3,390
cards; at the 35% his real sessions average, 5,714; at the 8% his sessions
*end* at, 25,000.

That is not a modelling problem and cannot be fixed by one. It is the reason
the reviewer's grid argument is right even though his numbers are not: his
"one question per 2.5 seconds" understates the user, who swipes at 1.1s, so
the speed gain is nearer 2-3x than 5x. The gain that matters is different —
**a card the viewer has not seen costs a full swipe, a poster in a grid they
do not tap costs a glance.** Make a miss nearly free and the reason for the
gate disappears with it.

### Verified from the reviewer's message

Every falsifiable claim in it, checked against the code and the data:

| claim | verdict |
|---|---|
| taste door tops out at rank 1,769 | **exact** — `shareOf(900x2.5)` = 0.4050 x 4,368 |
| his seven films at 1,890-3,131 | **exact**, all beyond it |
| the graph already links Let's Be Cops → We're the Millers, Neighbors, Central Intelligence | **true**, and its own keywords are `robbery, corruption, police` |
| catalog is `en 4,814 · hi 6 · ar 2` | **true** — two Arabic titles on an Arabic-first product |
| delete the gate | **refuted above** |

The third is the one that changes the diagnosis most, and I never thought to
check it: **the vibe answer is already computed and stored in our own file.**
Rush Hour-for-Hangover is not an unsolved modelling problem here. It is a
reachability and weighting problem, and the behavioural graph solved it days
ago.

---

## The gate stopped asking the world and started asking you (2026-08-15)

The user proposed growing the catalog from 5,555 titles to 50,000: "only 100
to 200 works suit my taste out of 5,000." Measured before answering, because
this question got a wrong answer from me once before.

**Every one of the 165 titles he liked is already in the catalog and already
inside the gate.** Not one is missing. The catalog holds 1,816 comedies, 909
of them reachable. Supply is roughly five times what he consumes.

And expansion would have added **nothing**. The gate takes the top N by vote
count; at its widest a film needs 2,366 votes to enter, and the *least* famous
film already in the catalog has 1,176. Every one of 45,000 new titles would
have sorted below the floor and never appeared. 2,555 of our 5,555 titles are
already unreachable. The bottleneck was never supply.

### The fix

The ranking stopped believing global fame when `watchLikelihood` shipped. The
gate still believed it, so the deck could rank beautifully over a pool chosen
by a question we had measured at AUC 0.453. It now takes three gate-fulls of
the fame-ordered list and keeps the ones *this viewer* is most likely to have
watched. At zero swipes `watchLikelihood` returns the fame prior unchanged, so
this reduces exactly to the old gate at cold start and personalises at the rate
the evidence already justifies — no second constant.

### Two faults the AUC probe could not have found

**An unknown value was being read as good.** For taste, an unseen token scores
0 — no evidence, no preference — and that is right. For exposure it is badly
wrong: a viewer who answers "never heard of it" forty times writes a negative
against everything he sees, so every *observed* value is negative while an
unobserved one sits at 0, above them all. Titles built entirely from keywords
he had never met floated to the top, and the deck served a 2,407-vote film to
someone who had recognised nothing. `seenScore` now falls back to the viewer's
own rate for that facet, so a person who has watched nothing gets a negative
for the unknown too and the ordering collapses back to fame — which is exactly
right, because he has told us nothing to personalise with.

**Volume is not information.** A persona that never swipes up took 2.5x as long
to reach four named titles. Its exposure tables held nothing but "watched", so
they were a blurred copy of the taste tables, and letting the gate select on
them double-counted taste and quietly narrowed the pool. `seenTrust` now scales
by `4p(1-p)`, the balance of the two answers — 1 when evenly split, 0 as either
takes over. Not a fudge: it is the variance of the thing being predicted, and a
predictor of a constant is worth nothing however much of it there is. His real
session (37% watched) reads 0.93, so the case this was built for is untouched.

Both faults live *outside* the set of cards the deck chose to show, and
`seen-probe.ts` only ranks cards inside it. The blind spot named in
`SEEN_CONFIDENCE_K`'s comment turned out to be real, and it was found by
instruments that walk the pool rather than grade a list.

### Also tried, also rejected

**Reserving part of the gate for the fame order**, so the exposure model could
never claim the whole pool. The guard reads 1.39x at a reserve of half, three
quarters, and none — identical, because that guard's persona has zero
`answerBalance` and the personal gate is not running at all. On the real-label
ruler the reserve is a straight cost: 82.7 → 78.9 → 75.5. Removed.

### The result

| ruler | before the gate change | after |
|---|---|---|
| **replay — real labels, 30 seeds** | 66.9 | **82.7** |
| replay, control (old labels only) | 71.0 | **78.2** |
| long session, swipe-up strategy | 63 | **80** |
| 500 people, deck | 32.0% | 32.0% |
| 500 people, long tail | 9.9% | 9.9% |
| Discover · vibe hard pairs | 34.2% · 60% | unchanged |
| `drift` · `roundtrip` | pass | pass |

**+24% on the honest ruler**, and the same signature as before: every
instrument that can see the change improved, every instrument blind to it is
unchanged to the decimal. `human-test` and `cold-deck` feed likes only, so
their `answerBalance` is zero and the personal gate never runs — which is why
they read identically, and why they cannot be cited as evidence either way.

### A correction, and it is mine

`simulate` now reports **12/13**, and the failure is not new. The exploration
guard reads 1.39x against a 1.15x limit — and the engine of the day *before*
any of this reads exactly 1.39x too. `CO_WATCH_DECK_SCALE = 0.8` has never
passed that guard; the comment above it claimed 0.8 "improves every ruler at
once, including the tunnel-vision guard" while the table three lines higher
recorded 1.39. The exposure model briefly masked it by trusting a viewer who
had answered "watched" to everything, and `answerBalance` correctly removed
that false trust and restored the true reading.

I pulled co-watch back to 0.6 to make it pass, and it did — at the cost of the
long tail (10.9% → 8.6%), a cold-deck target, and the real-label ruler
(82.7 → 77.4). Four rulers prefer 0.8, one prefers 0.6. 0.8 stays and the
failure is recorded rather than papered over. The guard needs a look of its
own: it is a needle hunt by its own admission, and its absolute numbers say
the deck now reaches those four titles in 305 swipes where the build that set
the 1.15 limit took 547.

### So: expansion?

Now it can mean something — the gate is no longer an absolute fame window, so
depth is reachable. But it is still not the bottleneck, and the honest next
question is not "how many titles" but "how many more does the gate now admit
that are worth admitting". That is measurable with `replay.ts` before a single
title is downloaded.

---

## The second session, and what it settled (2026-08-15)

The user re-ran his 200+ session on the exposure model, 416 swipes, same
opening taps, `/lab` reset first. Liked cards per fifty:

| block | before (449) | after (416) |
|---|---|---|
| 1–50 | **33** | 19 |
| 51–100 | 26 | 18 |
| 101–150 | 31 | **27** |
| 151–200 | 18 | **25** |
| 201–250 | 18 | **30** |
| 251–300 | 15 | 11 |
| 301–350 | 6 | 9 |
| 351–400 | 4 | 7 |

Overall rate barely moved (36.1% → 35.3%) but the **shape** changed: the
collapse moved from block 4 to block 6, and the middle rose sharply. Block
201–250 is the whole point of the feature — 36 obscure cards (under 8k votes)
shown, **24 of them he had actually watched (67%)**, against 25 shown and 10
watched (40%) in the same block of the old session. That is the deck reaching
past the blockbuster list into titles he really knows, which is exactly what
`recognizability(voteCount)` could never do.

But blocks 1–2 fell hard: **15 comedy cards in the first 100, against 74**.

### Three hypotheses, two of them mine, all measured

1. **Coverage-gate the blend** — fall back to fame for titles whose tokens the
   tables have never observed, so the unexplored catalog keeps its ordering.
   This was the exact failure mode I had written into the code comment as the
   reason `K` is 8 and not 4. **Measured worse at every prefix** (AUC 0.663 →
   0.585 at 80 swipes). Coverage correlates with fame — obscure titles have
   obscure keywords — so gating by it re-imports the bias the model exists to
   remove. Rejected.

2. **Centre each facet on his own base rate**, because 63% of his swipes are
   "not seen" and a near-universal token like `2010s` therefore encodes the
   base rate rather than any discrimination — the same shape as the `corner()`
   bug. **A wash** (0.692 → 0.690 at 80; 0.760 → 0.772 on the second export).
   Rejected.

3. **It was the seed.** `makeSeed()` is random on reset, and the cold start
   compounds: a few early comedies produce comedy likes, which produce more
   comedies. Ten seeds through the real engine with his real answers as the
   oracle, first fifty cards:

   | | comedy /50 | liked /50 |
   |---|---|---|
   | with the exposure model | 10.3 | 22.5 |
   | without it | 10.0 | 22.7 |

   Identical. **The cold-start difference is not in the code.** His two real
   sessions differ by 5× in the first fifty on what is, for that stretch,
   effectively the same engine.

### The ruler that finally does not assume the answer

Every instrument here builds its viewer from the catalog, and the worst of
them defines him as someone who knows the most-voted titles — which is how
fame went unchallenged for the project's entire life. `scripts/replay.ts`
cannot make that mistake because it does not invent the viewer: a real person
labelled 526 titles, and those labels are the oracle. Ten seeds, 250 swipes,
scored **only** on cards he swiped himself.

| block | with the exposure model | without |
|---|---|---|
| 1–50 | 21.1 | 20.2 |
| 51–100 | **15.2** | 8.5 |
| 101–150 | **11.3** | 8.4 |
| 151–200 | **10.9** | 6.2 |
| 201–250 | **12.7** | 7.1 |
| **total** | **71.2** | 50.4 |

**+41%.** Cold start identical; every later block between 34% and 79% better,
which is precisely where his real sessions collapse and precisely the shape
the second session showed.

**The control matters more than the headline.** That oracle contains labels
from the *new* session, so the titles the new build chose to show are
over-represented in it. Re-run using **only the old session's labels** — an
oracle built entirely by the old build, which should favour it:

| | total, cards he really liked |
|---|---|
| with the exposure model | **77.2** |
| without | 49.6 |

**+56%**, larger under the control than under the contaminated version. The
effect is real.

### What is still true

Still one viewer. `replay.ts` grades against a real human's answers, which
removes the fame assumption, but it cannot remove the fact that the human is
him. And its `liked` column is mostly stand-in guesses for unlabelled cards —
it is near-identical between any two builds and means nothing. Only the middle
column is evidence, and the file says so in its own header so the next reader
does not repeat the mistake.

The gate is still an absolute fame window, so the tables still only learn from
what fame let through. That is the next thing to measure — with `replay.ts`,
which is now the only ruler that can judge it honestly.

---

## Fame was never an answer to "have you seen this?" (2026-08-15)

The deck's whole job is to show cards a viewer can rate, and a card they have
never seen cannot be rated. Since the first commit the engine answered "have
you seen this?" with `recognizability(voteCount)` — a global vote count, one
answer for the whole of humanity — and paid `W_RECOGNITION` 0.9 falling to
0.55 for it, a larger weight than the entire taste term's range.

**It was never tested, and it could not be.** Every simulated viewer in this
repo is *defined* as someone who knows the most-voted titles. Fame predicts
recognition by construction in every instrument here. The rulers encoded the
assumption they existed to check — the sixth time in this project that the
ruler, not the engine, was the fault, and the deepest one.

### What one real session says

The user swiped 449 cards as himself: right for watched-and-liked, left for
watched-and-disliked, up for never-watched — 167 watched, 37%. Exported from
`/lab`, ids and actions only. `scripts/seen-model.py`, training on the first
half and predicting the second:

| predicting "has watched" | AUC |
|---|---|
| fame — what shipped | **0.453** |
| his own genres + decade | **0.707** |
| fame *and* his genres | 0.704 |

0.5 is a coin. Fame carried **nothing**, and added nothing on top of the
personal model. Without any model at all the inversion is visible:

| votes | watched |
|---|---|
| over 50k | 13% |
| 8–20k | 37% |
| 3–8k | **41%** |

The most famous titles in the catalog were the ones he was *least* likely to
have seen. They are global blockbusters; he watches comedies. Comedy 57%
against drama 20%.

### What shipped

A second set of facet tables, `seenFacets`, learning the exposure question
from the same swipes: watched (liked **or** disliked) writes +1, not-seen
writes −1, symmetric, no rarity weighting and no skip discount — unlike taste,
both answers are equally certain. Fixed facet weights (`SEEN_WEIGHTS`), genre
and era leading, because that is what the 449 swipes say carries it.

`watchLikelihood(profile, tokens, fame)` blends the personal answer against
the global prior by `seenTrust`, and the ranking multiplies **that** by the
same untouched `W_RECOGNITION`. What changed is not the weight; it is that the
number it multiplies is about this person instead of about the world.

Every swipe-up now teaches something real. It used to be spent on a weak taste
signal with genre zeroed — the softest evidence in the engine — while being
the single most informative answer available to the question the engine
actually needed.

### Setting the blend, from the curve rather than by analogy

`scripts/seen-probe.ts` replays a real export through `applySwipe` and scores
the held-out remainder with the shipped `watchLikelihood` — the same function
the deck calls. AUC on everything not yet swiped, sweeping the blend weight:

| trained on | fame only | w=0.4 | w=0.8 | personal only |
|---|---|---|---|---|
| 5 swipes | 0.472 | 0.535 | 0.654 | **0.692** |
| 12 | 0.472 | 0.565 | 0.699 | **0.721** |
| 60 | 0.473 | 0.577 | **0.682** | 0.677 |
| 320 | 0.449 | 0.635 | 0.768 | **0.774** |

More personal is better at every prefix, from the **fifth swipe**. `K` was
written at 45 by analogy with taste and is 8 because of this table. It is not 4
— which the curve argues for — for a reason the ruler cannot see: the test
ranks cards the deck actually showed him, while in production the term ranks
the whole gate, most of which his tables have no data for. A title sharing no
token scores exactly 0.5, so at full trust the unexplored majority of the
catalog loses its ordering. `SEEN_MAX_TRUST` 0.75 holds a quarter on the prior
permanently for the same reason, plus the obvious one: someone whose watching
genuinely tracks the blockbuster list exists, and for them the prior is right.

### What the rulers said, including the ones that cannot see it

`scripts/long-session.ts`, 200 swipes, on-taste cards per fifty:

| strategy | before | after |
|---|---|---|
| right / **up** (teaches the exposure model) | 32 16 10 5 = **63** | 33 15 12 **10** = **70** |
| right / left (never says "not seen") | 33 26 20 13 = 92 | 33 27 16 15 = 91 |

The swipe-up strategy is the user's own, and its late blocks doubled. The
swipe-left strategy never writes a −1, so its exposure tables learn that
everything is watched and the term is uninformative — and it moved by one
card. **The ruler that can see the change shows the gain; the ruler that
cannot shows nothing.** That is the shape a real effect makes.

The rest, honestly:

| ruler | before | after |
|---|---|---|
| deck (500 real libraries) | 32.0% | 31.4% |
| deck, long tail only | 9.9% | **10.9%** |
| Discover | 34.2% | 34.2% |
| vibe, hard pairs | 60% | 60% |
| `simulate` | 13/13 | 13/13 |
| `drift` | 5/5 | 5/5 |
| `cold-deck` | same targets missed | same, own-genre equal or better in 6 of 12 rows |

The deck line dipping 0.6 points inside its own confidence interval
[28.6–34.3] is **not evidence against this**, and it is not evidence for it
either: `human-test` feeds the engine likes only, so its exposure tables see
nothing but +1 and the term degenerates into a weak duplicate of the taste
score. It is the same blindness as the paragraph above, and the long-tail line
rising while the headline dips is what de-emphasising fame looks like.

### The honest limit

**One viewer.** Enough to retire the claim that fame predicts recognition, and
enough to justify learning the answer per person — which is a mechanism, and
is what shipped. **Not** enough to move a global constant, which is why
`W_RECOGNITION` is untouched and the prior is still under the blend. The next
person's export runs through the same two commands.

And a bias this cannot escape on its own: the tables can only learn from cards
the deck chose to show, and the deck chooses by fame. The model cannot tell
"you skip these" from "you were never asked". Fixing that means a gate that is
not an absolute fame window — the next thing to measure, not something to
assume.

---

## Rejecting a card erases the taste that chose it (2026-08-14)

The user documented his own session in blocks of fifty, twice, with two
different swiping strategies, and the log is the best piece of evidence this
project has been given:

|  | 1-50 | 51-100 | 101-150 | 151-200 |
|---|---|---|---|---|
| right / up (never left) | 37 | 12 | 17 | 5 |
| right / left (never up) | 33 | 15 | 3 | 3 |

Two strategies that touch completely different machinery, and the same
collapse. That agreement is the finding: the fame ledger contracts on "never
heard of it" and does nothing on a dislike, so it behaves oppositely in the two
runs — it cannot be the cause. And he added the detail that settles the rest:
**Discover stayed good throughout.** The engine still understood him.

`scripts/long-session.ts` reproduces the shape — 30/21/18/15 and 32/24/24/13 —
by defining "on taste" as Discover's own top 300 for the seed profile, frozen
at the start. Genre share cannot see this: a viewer whose taste is *broad
comedy* is served comedy the whole way and the session ruler reports lift
holding at 108%.

### It is not exhaustion. The engine changes its mind.

At swipe 200 the gate still held **110 unswiped titles from that reference
set** and the deck served 13 in the last fifty. And Discover's own top 300,
recomputed as the session went on, drifted away from where it started:

    swipe  50 — 103 of 300 shared with the original
    swipe 100 —  88
    swipe 150 —  72   ·  220 of the original never shown at all

### The mechanism, measured

Comedy's learned affinity across 150 swipes, for a viewer who is liking
comedies the entire time:

| swipe | net evidence | observation mass | affinity |
|---|---|---|---|
| 50 | 9 | 25 | 0.36 |
| 100 | 11 | 39 | 0.28 |
| 150 | 7 | 55 | **0.13** |

**A 64% collapse in the engine's belief that he likes comedy, while he says so
over and over.** The net signal never falls; the mass drowns it.

The cause is credit assignment. A dislike charges every token on the card,
including the token that is the reason the viewer is here. Shown *Ride Along*
— a comedy, but not his — he swipes left, and the tables record `comedy: -1`.
He did not reject it *because* it was a comedy; he rejected it *despite* that.

And it explains why his two runs agree. With left-swipes the genre erodes,
1.00 → 0.13. With swipe-ups the genre is protected — that was yesterday's fix,
`SKIP_SCALE.genre = 0`, and it holds at 1.00 across the whole run — but the
story keywords erode in its place. Two leaks, one felt collapse.

**This is a feedback loop, which is the worst kind of fault:** a wrong card
provokes a rejection, the rejection erases part of the taste, and the next card
is worse. Every fifty swipes damages the fifty that follow, which is why no
amount of ranking work upstream survives past the first block.

### The fix that followed from that, and did not work

Positive and negative evidence are both recoverable from what is already
stored — mass is the sum of magnitudes and net their sum, so
`positive = (mass + net) / 2` — so a rejection's weight on a value could be
shrunk by how much that value had already been endorsed, at read time, leaving
the counters and undo exact. Swept over the 200-swipe ruler:

    blame off        30 21 18 15  ·  32 24 24 13
    half-life 3      29 21 18 12  ·  31 23 21 14
    half-life 6      29 20 18 14  ·  31 23 20 14
    half-life 12     28 22 17 16  ·  32 25 18 14

**Nothing.** The likely reason is that `updateFacetWeights` already routes
around a facet that has stopped predicting: as `comedy` decays, genre's
*importance* decays with it and the narrower facets carry the ranking. The
affinity collapse is real, measured and reproducible — and it is not what the
deck's decline is made of.

Freezing the fame gate was measured in the same pass, on the theory that the
pool dilutes faster than the taste inside it grows. It does dilute: the gate
widens 1,165 → 1,915 across the session while the reachable taste falls 149 →
110. At 0, 2 and 5 titles earned per rated card: `30 21 20 12` · `30 21 18 15`.
Also nothing. Both reverted, both documented in place.

### And a flaw in this ruler, stated before anyone else finds it

"On taste" here is Discover's top 300 **frozen at the seed profile**, and the
engine's idea of the viewer legitimately sharpens as they swipe. So part of the
block-one-to-block-two drop is the reference going stale rather than the deck
going wrong — the user's own reference does not drift, and his drop was
steeper than this ruler's. The instrument is directionally right and
quantitatively soft, and the honest next step is a taste defined by hand, the
way `vibe-pairs.ts` defines its pairs, rather than by the engine grading itself.

**Two hypotheses, both mine, both measured, both wrong.** The collapse is real
and reproduced; its cause is still open.

### Fame does not predict what a person has watched (2026-08-14)

The first real ground truth this project has ever had. A user swiped 449 cards
using the gestures exactly as designed — right for watched and liked, left for
watched and not liked, up for **not watched, however famous** — and exported
them from `/lab`. 167 watched, 282 not: a 37% recognition rate.

The deck's whole job is to show titles a viewer has seen, because a card they
have not seen cannot be rated. The engine answers "have you seen this?" with
`recognizability(voteCount)` — a global vote count, one answer for all of
humanity — weighted 0.9 falling to 0.55, a range larger than the taste term's
entire spread.

**Measured on his session, that answer is a coin flip.** Trained on his first
224 swipes, tested on the next 225:

| predicting "has watched" | AUC |
|---|---|
| **fame — what ships today** | **0.453** |
| his own genres + decade | **0.707** |
| fame *and* his genres | 0.704 |

Fame carries nothing, and adds nothing on top of a personal model. The
inversion is visible without any model at all:

| | watched |
|---|---|
| over 50k votes | **13%** |
| 8–20k | 37% |
| 3–8k | **41%** |

**The most famous titles in the catalog are the ones he was least likely to
have seen.** They are global blockbusters; he watches comedies. By genre the
spread is 57% for comedy against 20% for drama — the thing the facet tables
already track, and the thing the fame term overrides.

**And this exposes the deepest ruler fault yet.** Every instrument here defines
its simulated viewer as *someone who knows the most-voted titles*
(`deck-drift.ts`, `cold-deck.ts`, the fame gate's whole justification). Fame
predicts recognition **by construction** in all of them. That is why sweeping
the recognition weight measured null twice today: the rulers cannot see a
change to an assumption they are built on.

Fifth time an instrument has been the fault, and the first time the fix is not
a better simulation but a real person's data.

**What this does and does not license.** It retires the claim that fame
predicts recognition, and it justifies learning the answer per person — the
machinery already exists, since the facet tables would only need a second set
of counters keyed on watched/not-watched rather than liked/disliked. It does
*not* license changing a global constant on n=1. `scripts/seen-model.py` runs
the same test on any future export in one command.

---

### Where the remaining decline actually comes from (2026-08-14)

Third logged session, after the graph weight went to 0.8:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| right / up | 71 | 89 | **93** |
| right / left | 54 | 111 | **108** |

Settled. And the wrong-feel signature is gone: the probe at swipe 150 that
previously served High School Musical, Charlie's Angels and Twilight now serves
American Wedding, Little Fockers and American Pie.

What replaced it is the failure the user described first — famous and
unrelated. Dawn of the Dead, Wonder Woman, Saw and 1917 were served while Dumb
and Dumber, Coming to America, Trading Places and Legally Blonde were withheld.
So every remaining dial was swept, and **none of them is the answer**:

    fame weight     0.9/0.55 → 0.35/0.15    155 → 152   (neutral, second time)
    taste weight    1.6 → 5                 worse
    exploration     off                     no change
    diversity       off                     no change
    both off        upper bound             64 / 94 against 63 / 92
    walk frontier   600 → 3000              byte-identical
    walk hops       2 → 3                   byte-identical

**Then the arithmetic that ends the question.** Lift is what the deck adds over
the pool it is drawing from:

| block | on taste /50 | reachable | pool | base rate | **lift** |
|---|---|---|---|---|---|
| 1-50 | 33 | 63 | 1,165 | 5.4% | **12.2x** |
| 51-100 | 26 | 22 | 1,415 | 1.6% | **33.4x** |
| 101-150 | 20 | 40 | 1,665 | 2.4% | **16.7x** |
| 151-200 | 13 | 32 | 1,915 | 1.7% | **15.6x** |

**The engine ends the session ranking better than it started, not worse.** The
card count falls because the taste runs out: 95 of the 131 hand-written titles
are consumed by swipe 200, while the pool it must find them in grows from 1,165
to 1,915. Thirteen on-taste cards from a pool where 1.7% are on-taste is not a
failing deck.

So the decline that has driven three days of work is now, finally, a catalog
problem. **5,555 titles cannot hold two hundred swipes of one specific taste.**
Everything above this line was a real bug; below it is arithmetic, and the fix
is the 50,000-title catalog that the scale checklist has always assumed.

---

### High School Musical, and the day's conclusion being wrong (2026-08-14)

The user logged the same two sessions again after the gate work:

| | before | after |
|---|---|---|
| right / up | 37 · 12 · 17 · 5 = 71 | 40 · 26 · 12 · 11 = **89** |
| right / left | 33 · 15 · 3 · 3 = 54 | 39 · 28 · 27 · 17 = **111** |

Real, and confirmed by the only judge who can tell whether a card is his taste.
But it still fades, and the supply columns say it is not exhaustion: at the end
of the up-heavy run **28 titles of his taste sat inside the gate, unshown, and
the deck served 2 in that block.** Supply was fixed; something else was picking.

The probe at swipe 150, for a viewer who had liked only broad comedies:

| the deck serves | taste | | the deck withholds | taste |
|---|---|---|---|---|
| **High School Musical** | +0.77 | | Meet the Parents | +0.56 |
| **Charlie's Angels** | +0.78 | | Groundhog Day | +0.49 |
| **Twilight: Breaking Dawn** | +0.62 | | Mean Girls | +0.47 |

**The facet tables had decided High School Musical was more his taste than
Groundhog Day.** They learned "comedy, teenagers, friends" literally and applied
it without a sense of feel — the right category and the wrong tone, which is the
exact failure this whole project was started to fix, reappearing at card 150.

The graph does not make that mistake — The Hangover's neighbours are not High
School Musical — it was simply too quiet to overrule the tables at a deck weight
of 0.45. Re-swept now that the gate no longer starves the deck:

| deck graph weight | 0.45 | **0.8** | 1.2 | 1.6 |
|---|---|---|---|---|
| session, up-heavy | 54 | **63** | 67 | 73 |
| session, left-heavy | 88 | **92** | 91 | 89 |
| 500 real people | 30.9% | **32.0%** | — | — |
| long tail | 7.2% | **9.9%** | — | — |
| tunnel-vision guard | 1.47x | **1.39x** | 3.21x | 3.55x |

**Everything improves at once, including the guard it used to trade against.**
A deck that trusts real co-watching wanders *less*, because it has stopped
following tables that have drifted. Above 0.8 the guard breaks outright.

**And this corrects the conclusion written a few hours earlier.** "Every
weighting change measured null and every supply change worked" was true of the
evidence at the time and is now wrong: this weighting change is the largest
single gain of the day. The reason it failed before is that the deck was
starving — with nothing good inside the gate, no weight on the graph could help.
Fix the supply and the weight starts to matter. **The order was the finding, not
the ranking's innocence.**

---

### The user stopped a ruler being built, and he was right (2026-08-14)

The plan was to build a ruler from MovieLens' low ratings, since every
instrument here feeds the engine likes only. He stopped it:

> *"Most works, even after two hundred swipes, are still famous and still
> highly rated. They are just not similar to the taste. I swipe left on The
> Dark Knight — one of the highest-rated films in the world — because it is not
> the taste I am testing. It is not about the rating. It is about how related
> it is to the taste."*

That is a correct objection and it kills the instrument. **You only rate what
you watched, and you watch what you expected to like.** A MovieLens rating of
1.5 means "I saw it and it disappointed me" — a judgement about quality. A left
swipe here means "I have seen it and it is not my taste", which is what The
Dark Knight is for a comedy viewer. Training or grading on one to fix the other
measures the wrong thing. The script was deleted before it ran.

**And the score composition proves his complaint exactly.** After ten broad
comedy likes:

| | taste | fame | quality | total |
|---|---|---|---|---|
| **The Dark Knight** | +0.18 | **+0.89** | +0.20 | **1.28** |
| Role Models | +0.36 | +0.65 | +0.12 | 1.13 |
| Pineapple Express | +0.25 | +0.71 | +0.12 | 1.08 |

The highest-scoring card in the deck is the one he named, and fame is why: it
separates those titles by 0.24 while taste separates them by 0.18. Worse, The
Dark Knight's taste score is *positive*. A viewer who has only ever liked
things has no negative evidence anywhere, so every title sharing an era, a
language or a popular actor scores above zero. **The engine cannot say "this is
not for you", only "this is less for you" — and then fame decides.**

Two obvious repairs, both swept, both wrong:

    amplify taste   W_FACETS 1.6 → 3 → 5   29 9 6 6 → 28 6 10 4 → 28 7 3 2
    reduce fame     WARM 0.55 → 0.1        no movement at any setting

At five the deck locks onto whatever the tables currently believe and never
recovers. Lowering fame does nothing because the *gate* already guarantees fame
— the weight was double-counting something already enforced.

**What worked was supply again, for the third time today.** His taste lives
deeper than the gate reaches: Role Models sits at film rank 2,541, Old School
2,576, Napoleon Dynamite 2,520, while the corner reached about 1,450. Sweeping
that depth:

| corner depth | up-heavy session | left-heavy session | recognition |
|---|---|---|---|
| 2 | 50 | 87 | 93% / 93% |
| **2.5** | **54** | **88** | **91% / 89%** |
| 3 | 61 | 85 | 89% / 84% |
| 4 | 69 | 81 | 85% / 75% |

2.5 rather than the higher-scoring 3 or 4: past it the horror viewer stops
recognising what they are shown, and 900 × 2.5 lands near the 2,500 mark that
the session ruler has always used as "how deep a fan knows their own corner".

Deck accuracy on 500 real people goes 30.4% → **30.9%**, its long tail 6.4% →
**7.2%**. Discover, the vibe pairs and every drift target unchanged.

**The pattern of the whole day, stated plainly: every weighting change measured
null, and every supply change worked.** Three separate attempts to make the
engine *think* differently about a rejection did nothing, while three changes to
what the deck is allowed to *see* did everything. The ranking was never the
problem.

---

### Why blame reweighting keeps doing nothing (2026-08-14)

Three attempts today at the same idea — make a rejection land on the value that
actually caused it — and two of the three did nothing at all.

The user put the case sharply: *"if a film has the word comedy, and comedy is
in three thousand films, it should not count much against it. What should count
is what makes this one special."* He also believed rarity applied only to
likes. It does not — `applyFacets` writes raw signal in both directions and
`tokenWeight` scales the accumulated total, so rarity has always been
symmetric. But the curve is gentle: `comedy` reads 0.67 against a one-off
keyword's 1.0, so a rejection does charge the genre at two-thirds strength, and
his conclusion survives his premise being wrong.

Sharpening rarity on the negative side only was implemented as an exponent and
swept. Per fifty swipes:

    exponent 1 (shipped)   29  9  6  6  ·  30 19 16 22
    exponent 2             29 10  8  7  ·  30 18 17 19
    exponent 3             29 10  9  5  ·  29 19 21 17

Four cards gained on one strategy, three lost on the other. The 500-people
ruler and the vibe pairs read *identically* at every setting, and the reason is
worth writing down: **both feed the engine likes only.** No ruler here has ever
graded what a dislike does. That is a hole, not a result.

**The pattern across all three attempts.** Damping blame by prior endorsement:
nothing. Sharpening rarity on rejections: a wash. Anchoring the corner's depth
so the gate stops shrinking: **that one worked, and it was not about blame at
all — it was about supply.**

The likely explanation is that `updateFacetWeights` already compensates. It
learns which facet predicts a viewer's swipes, so when `comedy` stops
discriminating, genre's *importance* falls and the narrower facets carry the
ranking on their own. The engine routes around a poisoned value without being
told to. Which means reweighting the poison changes little — and it also means
the affinity collapse measured earlier (0.36 → 0.13) mattered through the
*gate*, where there was no such compensation, and not through the ranking.

**What would actually test this: a ruler built from real people's dislikes.**
MovieLens has them — every rating below 4 is currently thrown away. Until that
exists, any further work on blame is unfalsifiable, and it should not be built.

---

### Found it — with the taste written out by hand

Rebuilding the ruler around 131 named titles instead of the engine's own
opinion reproduced the user's session almost exactly, and one column settled
it. "Reachable" counts titles from his taste that he has not been shown and
that the fame gate would currently admit:

| | 1-50 | 51-100 | 101-150 | 151-200 | reachable / unswiped at the end |
|---|---|---|---|---|---|
| right / up | 27 | 4 | 1 | 5 | **8 / 101** |
| right / left | 30 | 15 | 6 | 11 | 13 / 66 |

**He was not running out. Ninety-three titles of his taste were unswiped and
locked outside the gate**, and the gate held eight of them.

Two separate mechanisms, one felt result:

**1. The taste locked itself out.** The deep half of the gate opens for the
viewer's "corner", and the corner required a genre affinity above an absolute
0.4. But a viewer swiping through his own genre rejects most of it — the
comedies he does not care for are still comedies — so `comedy` falls from 0.36
to 0.13 while he is liking comedies. Below the bar the corner emptied and the
deep gate closed. **Rejecting most of a genre is what having a specific taste
looks like from the inside, and it was being read as not having the taste at
all.** The corner is now relative: the best genre and whatever ties with it,
provided it is liked at all and carries enough evidence that one swipe cannot
claim it.

**2. The corner shrank with the ledger.** A viewer who answers "never heard of
it" often has the whole pool narrowed, correctly — but their *own corner* is
the part they do know, and it was contracting along with everything else, down
to a gate of 360. The corner's depth is now anchored to the base gate rather
than the contracted one.

| after both | 1-50 | 51-100 | 101-150 | 151-200 |
|---|---|---|---|---|
| right / up | 29 | **9** | **6** | **6** |
| right / left | 30 | **19** | **16** | **22** |

And reachable stops collapsing: 8 → 40/31/25/19 in the first strategy, 13 → 52/46/41/28 in
the second. He now *consumes* his taste — unswiped falls 98 → 41 — instead of
being locked out of it.

Nothing else moved: deck 30.4%, Discover 34.2%, vibe 60%, session recognition
93%/93%, the drift targets all still met.

**What is left, and it is not an engine problem.** The first strategy still
declines. In it the user swiped *up* on everything that was not his taste —
but the card means "I have not watched this", and the engine believes it,
narrowing the pool to what he apparently recognises. He was using the gesture
to mean "not interested". That is a wording problem on the card, not a ranking
one, and it is the next thing to fix.

---

## The gate was locking the viewer's taste out of the deck (2026-08-14)

The user, an hour after the behavioural graph shipped: **"Discover maybe got
better — maybe. But the cards got worse!"** Every ruler here disagreed with him.
He was right.

After liking The Hangover, Superbad and Step Brothers:

| Discover | the deck |
|---|---|
| Role Models 73% · Pineapple Express 73% · Anchorman 72% · Wedding Crashers 67% · Old School 65% | 21 Jump Street 62% · **Slumdog Millionaire** · **Death Note** · **Iron Man** · **Spirited Away** · **Interstellar** · **Harry Potter** |

The reason line printed on most of the right-hand column was one word: `2000s`.
The only thing connecting them to his taste was the decade.

### The cause, measured

**Twelve of the fifteen titles Discover recommended were outside the deck's
gate entirely** — not ranked low, not visible at all:

| | film rank | gate = top 562 films |
|---|---|---|
| Anchorman | 1144 | locked out |
| Wedding Crashers | 1115 | locked out |
| Knocked Up | 1255 | locked out |
| Old School | 2576 | locked out |

And it got *worse* as the taste sharpened — of Discover's fifteen, the deck
could reach 12 after one like, 4 after three, **1 after ten**. The better we
understood him, the more completely the gate blocked the answer.

The gate exists to keep cards recognisable, and it was excluding Anchorman
while admitting Spirited Away and District 9. **Fame across the whole catalog
is a bad proxy for "have you heard of it" the moment a taste is known.**

### The fix

The gate now models recognition the way people work: everybody knows the
famous, and everybody knows their own corner far deeper. Base widened 700 →
900, and doubled again for titles in the genres the viewer likes *consistently*
— their favourite and whatever ties with it, not every genre they have nodded
at. Deck diversity also dropped from full strength to a quarter; it was set
when the ranking was weak and had been quietly interleaving one comedy with
four blockbusters.

**Not the taste door rejected in v10.** That admitted any graph neighbour at
any depth and cost eight points of recognition. This is bounded to a multiple
of the gate and to the viewer's own genre, and recognition does not move.

| | before | after |
|---|---|---|
| deck vs 500 real people | 27.7% | **30.4%** |
| deck, long tail | 3.2% | **6.4%** |
| cold deck, own genre in 20 (comedy/horror/scifi) | 5 / 6 / 9 | **7 / 9 / 10** |
| can reach Discover's picks (horror) | 6/15 | **9/15** |
| session recognition | 93% / 93% | **93% / 93%** |
| Discover · vibe hard pairs | 34.2% · 60% | 34.2% · 60% |

The first four cards for that comedy viewer are now 21 Jump Street, **Anchorman,
Pineapple Express**, Ted.

### A second bug the same probe found

`recognitionRate` returned 1 when fewer than ten cards had been answered —
"assume the pool is fine rather than punish a new account". A rate of 1 relaxes
the recognition weight to its *warmest* setting, so the viewer we knew least
about was pushed deepest into the catalog. Same inversion as the one fixed
yesterday, reappearing at the cold-start boundary. A new account now holds the
cold setting and earns its way out.

### And a ruler that was wrong about television

The session ruler decided what its viewer had heard of using rank across the
whole catalog. TMDB vote counts are a film scale, so Gilmore Girls reads as
rank 4,481 and the ruler was reporting "never heard of it" while the engine
served well-known sitcoms. `fameGate` has split the two scales since the
television lockout was found; the recognition model had not caught up. Fixed,
and the same correction applied to the new ruler.

The `median fame <= 900` check went with it — a proxy for the thing recognition
already measures directly, and wrong in both directions: Anchorman at 1,455 is
known to every comedy viewer, Gilmore Girls at 4,481 is known to most people.
It is printed now, not judged. **That is a check being removed after it failed,
which deserves the scrutiny: recognition is measured a few lines above with an
explicit model of the viewer, and it stayed at 93%.**

### What still fails, unfixed

- **The cold-deck own-genre target (60% of the first twenty) is missed** — 7,
  9 and 10 of 20 against a target of 12. Reaching it needs the deck's graph
  weight at 1.6, and there the tunnel-vision guard reads **3.0x**: the deck
  stops being able to find a taste it has not been shown. Not shipped.
- **The tunnel-vision guard regressed anyway**, 1.11x → 1.28x against a 1.15x
  limit, from the gate alone. A deeper pool inside your corner means more
  on-taste candidates, so reaching one specific other title takes longer. Part
  arithmetic, part real. Reported rather than tuned away.
- Comedy can still only reach 5 of Discover's 15; those sit past rank 2,900,
  beyond any gate that keeps recognition at 93%.

### Why no ruler caught this

- the 500-people ruler builds one page from **half a full library** — it has no
  notion of "three likes"
- the session ruler **exempts the opening blocks**, and that exemption is a
  line written by hand: *"the floor skips the opening… no drift can have
  happened yet"*
- the vibe pairs grade Discover, not the deck

The gap he complained about was precisely the gap excused from judgement.
`scripts/cold-deck.ts` grades it now, and its sharpest number needs no
interpretation: Discover and the deck rank the same catalog with the same
taste, so anything Discover finds that the deck cannot see is a gate problem by
definition.

**Fifth time in this project that the ruler was the fault, and the second time
the user saw with his eyes what no number here could.**

---

## Television finally has behaviour behind it (2026-08-14)

The user has raised the same example since the first week: *"I love Brooklyn
Nine-Nine — anyone would say The Office, Modern Family, How I Met Your Mother,
and not one of them was suggested."* Every ruler here confirmed the miss and
nothing fixed it, because MovieLens has no television and describing titles
instead had just failed a direct test (`tag-probe.py`).

Wikipedia publishes every article-to-article click pair above ten occurrences,
monthly, under CC0. `scripts/wiki-edges.py` maps our catalog through Wikidata's
TMDB properties — never by name, since "The Office" alone matches four
different series — and reads the July 2026 dump.

    3,495 of 5,555 titles have an English article
    17,042 click pairs inside the catalog, 12,944 distinct connections
    3,133 titles get neighbours — 909 of them television

**Brooklyn Nine-Nine → Parks and Recreation, New Girl, The Rookie, The Office,
The Good Place, Modern Family, Community, Superstore.**

Two ways of folding it in were built and graded. Appending it behind the
existing graph is worth little; **leading with it wherever there is no
behaviour** — every series, every film past the MovieLens snapshot — is worth a
great deal, because there it is not competing with a better signal, it is
replacing a guess.

| | shipped | + wiki appended | **+ wiki leading** |
|---|---|---|---|
| vibe, hard pairs | 53% | 55% | **60%** |
| vibe, easy pairs | 75% | 80% | **80%** |
| Discover, 500 people | 34.1% | — | 34.2% |
| deck, 500 people | 27.9% | — | 27.7% |

The film numbers do not move, which is the point: wiki leads on 948 titles, all
of them ones behaviour never covered.

**The pairs this project exists for, at last:**

    Brooklyn Nine-Nine → Modern Family        both directions
    Friends → How I Met Your Mother           both directions
    The Office → Parks and Recreation         both directions
    The Hangover → Rush Hour                  still missed

The last one is a film pair, and there behaviour rules: 60,000 people's
co-watching says they are not the same night in. That may be true and our
intuition wrong, or it may be the release-year clustering visible elsewhere in
the raw graph. Unresolved, and recorded as unresolved.

**The deck weight came down again, 0.5 → 0.45.** The tunnel-vision guard read
1.16x against its 1.15x limit, and the guard times four specific needles — one
flipping moves it several points — so the pass is taken with margin rather than
at the line. Costs 0.2 points of deck accuracy.

**What is still thin.** 2,060 titles have no English article matched at all, and
those with neighbours average 8.1 against behaviour's 40. Reading is also not
watching: a click can be curiosity, a cast member, a franchise. This is the
weakest of our three sources and it is carrying television alone — which is an
argument for the Amazon answer, not a reason to be pleased.

---

## Permission granted — and two experiments it killed (2026-08-14)

GroupLens granted commercial permission. Every licence header is corrected, and
the honest sentence stays alongside it: what ships is a derived work, and
calling the shipped table "computed from our own metadata" was the comfortable
description rather than the accurate one. The permission is what settles it.

Two things were held back behind that licence. Both were measured the moment it
lifted, and **both are negative.**

### More people do not help — the curve was already flat

We trained on 60,000 of the 144,286 usable people because this was measurement
rather than product. Retrained on 142,000:

| people trained on | Discover | long tail |
|---|---|---|
| 60,000 (shipped) | **34.1%** | 15.2% |
| 142,000 | 33.2% | 15.3% |

Inside the interval, and if anything lower. Nothing to ship. Worth knowing
because it removes "just use more data" from the list of things to try.

### Human-written tags add nothing — and this cancels the next planned step

MovieLens ships two million tags written by real people, and the most-used ones
read like the shopping list we were about to pay a model to invent:
`atmospheric`, `surreal`, `visually appealing`, `dark comedy`,
`thought-provoking`, `cinematography`, `quirky`, `stylized`, `dark`.

The plan — ours, and the outside reviewer's — was to buy mood and craft tags and
feed them to the distillation as regression features, on the reasoning that our
columns carry no craft signal. `scripts/tag-probe.py` tests that reasoning with
the vocabulary already on disk, fitted on one set of films and scored on a
disjoint set:

| features predicting the behavioural position | cosine |
|---|---|
| our metadata (what ships today) | **0.599** |
| human tags alone | 0.489 |
| both together | 0.600 (±0.003) |

**Two million human tags add one thousandth of a point**, inside the noise of
three seeds. And the tags the fit leans on hardest are `action`, `comedy`,
`funny`, `romance`, `animation`, `sci-fi` — genre words we already have. The
craft words it was supposed to be about (`atmospheric`, `cinematography`,
`surreal`) sit far down the list.

The plan was to spend $15 and a week having a model write these. It would have
bought the same nothing, and it is cancelled. Stated fairly: this tests tags as
linear features against a 256-dimension behavioural target, which is exactly the
formulation that was proposed — it does not prove every possible use of mood
vocabulary is worthless, only the one we were about to build.

**And a correction it forced.** Our fit quality is quoted as cosine 0.737
throughout; that is in-sample. Held out properly it is **0.599**. The
generalisation gap was never measured before, and the shipped number was
flattering.

### What this leaves

Television still has no behaviour, and the description route to fixing it just
failed a direct test. The remaining honest leads are behavioural: **Amazon
Reviews 2023**, which covers TV and is waiting on a licence answer, and the
**Wikipedia clickstream**, which is free and covers TV. Same lesson as the
ceiling test, arriving a third time: describing titles does not work, and
watching people does.

---

## We shipped the co-watching itself (2026-08-14)

The user asked whether behavioural data could be brought in from outside so the
site opens strong instead of waiting for its own users, and answered the licence
question himself: MovieLens forbids commercial use *without permission*, this is
a personal non-revenue project, and the permission request has been sent
besides.

That reframes the whole plan rather than adding to it. **The distillation exists
only because we believed we could not ship the behavioural model** — it says so
at the top of `distill.py`. If we can, the detour is not forced, and it costs
something measurable: the fitted function reproduces a title's true position at
cosine 0.737, while for the 4,109 films behaviour covers, the true position is
simply available.

`scripts/behaviour-edges.py` takes the same EASE matrix `ceiling-test.py`
already builds — same 60,000 people, same λ, same held-out 2,000 — symmetrises
it and exports the top 40 neighbours per film. `scripts/merge-edges.ts` then
chooses a source per title: real co-watching where it exists, the prediction
everywhere else.

| same 500 people, same page | before | after |
|---|---|---|
| Discover | 25.8% | **34.1%** |
| Discover, long tail | 8.0% | **15.2%** |
| deck | 24.1% | **27.9%** |
| deck, long tail | 1.9% | **3.2%** |
| **vibe, hard pairs** | 33% | **53%** |
| vibe, easy pairs | 55% | **75%** |
| catalog gzipped | 1.92 MB | **1.84 MB** |

The vibe line is the largest single move this project has made on its own score,
and the catalog got *smaller* — 40 real neighbours where 47 predicted ones were.

**Weights re-swept, because a better graph pulls harder.** The deck's share had
to come *down*: at 0.6 the tunnel-vision guard failed outright (1.22x against a
1.15x limit), so 0.5, costing half a point of accuracy inside the interval.
Discover's went the other way, 0.6 → 1.6, where its curve lands.

**What this did not touch, and it is half the product.** MovieLens has no
television. 1,466 of our 5,555 titles — every series, every film past the
snapshot — kept the predicted edges and gained nothing. Measured on the pair the
user has raised three times: `The Office → Parks and Recreation` hits, and
**`Brooklyn Nine-Nine → Modern Family` still misses**. That is now the sharpest
statement of what the mood-tag work is for: not a general improvement, but the
only route for the half of the catalog no behaviour covers.

**Artifacts, visible by eye before any ruler ran.** Raw co-watching puts *Avatar*
next to *The Hangover* because half the planet saw both, and it puts *Parasite*
next to Joker, Knives Out, Jojo Rabbit and 1917 — a release year, not a feeling.
The prediction cannot make that mistake because it never sees a calendar. Both a
`prefer` and a `union` merge were built and graded for exactly this reason;
they tied on hard pairs (53% each) and `prefer` won the easy floor, so the
smaller graph shipped. *The Hangover → Rush Hour* still misses.

**The genre benchmark fell, 21% → 15%, and it is noise.** Swept across deck
weights it reads 19, 18, 15, 18 — six needles, and one flipping from "reached at
160" to "never" moves it several points. It also rewards genre purity, which is
what we are deliberately trading away. Reported, not used as a gate.

**Licence, stated properly.** The header of `distill.py` claimed nothing shipped
was derived from MovieLens. The fitted coefficients are derived from it, and so
are these edges. Corrected in place. The permission request removes the question
rather than arguing it.

---

## The site was deleting the user's taste (2026-08-14)

The user, after a long session: "the first fifty or sixty I liked thirty of.
After that most of them I don't know — and plenty of them I do know, they're
famous, but they are not the taste I was testing. The taste gradually starts
disappearing and becomes scattered."

The second half of that sentence is the whole diagnosis, and it took a
correction from them to hear it. This was not only a recognition problem. The
taste itself was being dismantled, by two mechanisms I wrote myself.

### 1. A swipe-up was benching the viewer's own genre

`trackStreak` benches any facet value skipped three times in a row, for forty
swipes, and `genre` was on the list of facets it could bench. So three
unfamiliar comedies in a row — three honest "never heard of it" answers — were
read as "this viewer dislikes comedy", and comedy left the deck.

Measured over a simulated session, before the fix:

| swipes | comedy in the block | benched |
|---|---|---|
| 41-50 | **9** / 10 | — |
| 51-60 | **3** / 10 | **comedy** |
| 111-120 | **2** / 10 | **comedy** |

A horror viewer had `horror`, `thriller` *and* `drama` benched at once, and
saw 0 of 10.

The mechanism was built for a real complaint — "I skipped thirty superhero
films and it keeps showing them" — and that complaint is about `superhero`, a
keyword one title in a hundred carries. Benching it costs nothing. Benching
`action` deletes a fifth of the viewer's world on three data points.
`STREAK_KINDS` is now `["story", "cast"]`.

### 2. And the graded version of the same mistake

Removing genre from the bench was not enough, because every swipe-up still
wrote -0.35 against every genre on the card. Thirty "never heard of it"
answers therefore outweighed ten likes. Measured as *lift* — how far the deck
raises a viewer's genre above what the pool itself offers:

| skip evidence charged to genre | comedy lift after 30 unfamiliar comedies |
|---|---|
| full (before) | 1.66x → **1.09x** |
| none (shipped) | 1.66x → **1.64x** |

A genre is now learned only from titles the viewer has actually watched: a
dislike still writes the full -1. Not having seen something is not an opinion
about its category.

### 3. The pool only ever widened

`FAME_TIERS` stepped 800 → 1,800 → 3,000 on a swipe counter and never came
back. `seenCount` and `unseenCount` had both been stored for a month and never
read. It is now a ledger — every title actually seen earns depth, every "never
heard of it" pays some back — and the ratio is arithmetic, not taste: the pool
stops moving when 5 x seen equals 30 x unseen, which settles at a viewer
recognising six cards in seven. A first attempt at 20 and 15 settles at 43%,
and measured exactly that badly. `W_RECOGNITION` now follows the measured
recognition rate instead of confidence, which had it caring *less* whether you
had heard of a film the better it knew you.

### What it cost

Stated plainly, because it is a trade and not a free win. Baseline is the
previous commit, measured with the identical command:

| | before | after |
|---|---|---|
| session recognition (comedy / horror viewer) | 65% | **93% / 89%** |
| genre lift held, last third vs first | comedy collapsed | **133% / 194%** |
| genres ever benched | comedy, horror, thriller, drama | **none** |
| deck vs 500 real libraries | 23.9% | 24.1% |
| deck, long tail only | 2.4% | **1.9%** |
| needle benchmark | 22% | **21%** |
| Discover | 25.8% | 25.8% |
| vibe, hard pairs | 33% | 33% |

The long tail and the needle benchmark are worse on purpose. A tighter gate
cannot reach a title at catalog rank #2,468 — `Ride Along` went from 161 swipes
to never — and that is the same tightening that took recognition from 65% to
93%. The user's complaint was that they had not heard of the cards; this is the
bill for fixing it.

### Two experiments, measured and rejected

**A door in the gate for the viewer's own taste.** A horror fan knows obscure
horror, so admit any title the graph puts near something they liked, however
obscure. With the simulated viewer given exactly that property, recognition
fell 93% → 83% and the genre share it was meant to rescue fell too. The graph's
neighbours at that depth are not the ones a fan knows; they are simply obscure.

**Letting a genre's best value outweigh its worst.** The horror left in the
pool is mostly hybrid, and a punished co-genre can drag a strong horror score
negative. Tried once with the share ruler (no effect), then again with the lift
ruler because the reasoning still looked sound. It is clearly worse: horror
lift held 123% at full negative evidence, 71% at half damping, 53% at none.
Damping lets in hybrids whose other half the viewer has rejected a hundred
times.

### And a fault in the ruler, not the engine

The session ruler reported the deck ignoring nine horror titles sitting in the
gate. It was not. The gate admits the top share of films and the top share of
series *separately* — at a limit of 865 that is the 623 best-known films and
the 233 best-known series, not the 865 best-known titles — and all nine were
outside it. The ruler had reimplemented the gate by guessing. `fameGate` is now
exported and instruments call it. Once they did, every target passed.

Which leaves the real limit, and no ranking change reaches it: the gate a new
viewer sees holds about 190 comedies and about 30 horror titles. A horror
viewer exhausts every horror film the gate will admit by card 120. That is a
catalog problem, and only more titles fix it.

**The lesson, for the third time:** every ruler here grades one page from a
fixed library, and a user lives a whole session. `scripts/deck-drift.ts` is the
instrument that should have existed, and two of the four faults in this entry
were still invisible until it was pointed at the right pool.

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
