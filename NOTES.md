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
