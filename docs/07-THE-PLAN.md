# FILE 7 — THE PLAN

Written 18 September 2026, after a 3.5-week pause. This is where the project
stopped, what is missing, and what to do next, in order.

**The last real engineering commit was `9288c9f`, 24 August** — the reach
setting. Everything between then and now is documentation. So the project is
exactly where that commit left it, and there is one open question from it that
was never answered.

---

# PART 1 — WHERE WE STOPPED, EXACTLY

## 1.1 The thing that was left hanging

The reach setting shipped (**Settings → How far the deck reaches → Everything**)
and **the report-back never came.** The question asked was:

> At "Everything", do Arabic / Turkish / Indian titles actually appear in the
> deck — and after how many cards?

No script can answer this. Every reference library available is MovieLens:
American, English, already inside the famous few thousand. The measurement
literally cannot see the case the whole catalog rebuild was done for.

**This blocks the next engine decision.** If "Everything" works, the default may
be wrong for a large share of users. If it does not, the gate needs rethinking
rather than widening.

## 1.2 The main problem, still untouched

**~54% of a person's library sits inside the candidate pool and is never
dealt.** Not filtered out by the gate — *considered, and not chosen*. That is
the collapse, and it is the same number it was on 24 August.

What is already ruled out (`04-THE-ALGORITHM.md` §D): it is not exhaustion, not
the scorer (median rank 591 of 48,553), and not fixable by widening. Four
attempts to fix it by reweighting all failed.

## 1.3 The best untried lead, built and switched off

`TARGET_SEEN` in `recommend.ts`. Two reviewers argued the deck asks the **wrong
question**: it maximises the probability a card is one you *have* watched, when
the information-optimal card is the one it is **least sure** about. A question
whose answer you can predict teaches nothing — and the opening blocks run at
74–78% against a 4.5% base rate, which is a lot of cards spent confirming.

The code exists. It has **never been measured.** `TARGET_SEEN=0.5` ranks by
nearness to 50/50 instead of by height.

## 1.4 The proven idea that was never scaled

Model-written recommendation edges (NOTES.md, 12 Aug). Written by hand for
**115 titles**, then validated against TMDB co-watch data that nobody here
authored:

| | |
|---|---|
| my picks TMDB also links | **16.4%** |
| random titles TMDB links | 0.15% |
| | **107× better than chance** |
| my picks TMDB does *not* have | **84%** — genuinely new information |

The pre-registered abort condition was ">60% overlap ⇒ abandon". It came in at
16.4%. On the benchmark it read 19% against the shipped engine's 17%.

**It covers 115 titles out of 48,553.** Scaling it costs roughly $3 via the
Anthropic Batch API. This is the only idea in the whole project that survived
external validation and was never shipped.

---

# PART 2 — WHAT IS MISSING OR STALE RIGHT NOW

## 2.1 ⚠️ The calibration data is invalid, and this matters more than it sounds

`/calibrate` was answered three times, on a catalog of **15,083 titles**. The
catalog is now **48,553**. Those answers set:

- the estimate of the library size (5.0% of 15,083 ≈ **755 titles**)
- the fame-band recognition curve
- where the gate's bands stop

Every one of those is computed as a **share of the catalog**, so every one of
them is now wrong. 5% of 48,553 would be 2,400, which is not a correction — it
means the sample no longer describes anything that exists.

**The blind sample has to be redone.** It is the only data in this project the
engine did not choose, and right now the project has none that is valid.

## 2.2 The load fails its own budget, knowingly

**13.81 MB over the wire · 75.8 seconds on Slow 4G.** The budget in
`load-guard.mjs` is 6.8 MB — what the app cost before the catalog grew. It is
exceeded by 2×, deliberately, with no decision taken.

## 2.3 Cloud sync has never run against a real account on two devices

The code has been there for weeks. Accounts work. Nobody has ever signed in on
one device, swiped, and opened the site on a second. **Untested code that ships
is not a feature, it is a claim.**

## 2.4 `YOUR-TASKS.md` and `REVIEW-REQUEST.md` are stale and now misleading

They describe a **12,826 / 15,083**-title catalog, a gate that is the binding
constraint, and a "reach" field that was dead. All of that has since changed.
A future reader — human or AI — will take them as current and be wrong.

## 2.5 The goal ruler is blind to all television

MovieLens has no TV. That was 3,076 invisible titles when it was noted. The
catalog now has **13,892 series** — so the main ruler is blind to **29% of the
catalog**, up from 20%. No fix exists; the data does not exist. But the number
should be quoted whenever a harvest figure is quoted.

## 2.6 Smaller open items

- `/lab` is a temporary instrument, still shipped, still meant to be deleted.
- Google sign-in shows the Supabase domain, not the app name. Needs a domain
  (~$15/yr) + Supabase custom domain ($10/mo). **Advice unchanged: do not pay
  yet.** Also worth noting the app is called Dhawq and the address says dhawq,
  but one page still says "Seenit".
- The grid (`/add`) measured **2,490 titles/hour vs the deck's 1,121** and it is
  not known whether it has ever been used in real life.

---

# PART 3 — THE PLAN, IN ORDER

## PHASE 0 — 30 minutes from you. Everything else waits on this.

These are the only things no script can do.

**0.1 · Swipe 60 cards at "Everything", and tell me what you see.** (10 min)
Settings → How far the deck reaches → Everything. Then swipe. Report: did any
Arabic / Turkish / Indian title appear, and at roughly which card number?
*Unblocks: the default reach decision, and possibly the whole gate design.*

**0.2 · Do `/calibrate` once, on the new catalog.** (15 min)
<https://dhawq.onrender.com/calibrate> — 200 titles, tap only what you watched.
Export and send it.
*Unblocks: everything in §2.1. Without it the project has no valid unbiased data.*

**0.3 · Swipe one full session and export from `/lab`.** (as long as you like)
Use 👁 rather than ↑ when you watched something without a strong feeling — that
answer now feeds the co-watch graph and is worth **+5.4%** on the goal ruler.
*Unblocks: the collapse diagnosis on real data rather than MovieLens.*

## PHASE 1 — The collapse. The main problem. (I can start immediately.)

**1.1 · Measure `TARGET_SEEN`.** The most promising untried idea in the engine.
```
TARGET_SEEN=0.5 npx tsx scripts/harvest.ts
TARGET_SEEN=0.5 npx tsx scripts/rank-all.ts
```
Sweep 0.3 / 0.4 / 0.5 / 0.6. Read `LOST AT RANKING`. If it moves off ~54%, that
is the first real movement on this problem in a month.

**1.2 · Run `tail-signal.ts` again on the 48,553 catalog.** It was last run on a
smaller one. It asks whether there is *any* information left at card 900. If
every signal is at 0.5 there, the collapse is information-theoretic and the
honest answer is to stop attacking it and lean entirely on import + grid.

**1.3 · Attack the 54% directly.** Instrument *which* titles are in the pool and
never dealt, and look at what they have in common. Nobody has ever looked at the
lost set itself — every attempt so far changed a weight and re-measured the
aggregate.

## PHASE 2 — The one proven idea that was never shipped.

**2.1 · Scale the model-written edges from 115 titles to the catalog.**
`scripts/trial-enrich.ts` already exists for this (`MODE=edges npm run trial`,
Batch API, half price). ~$3.

**2.2 · Re-run the validation at scale** before shipping — the same external
check against TMDB co-watch, same abort condition (>60% overlap ⇒ abandon).

**2.3 · Then benchmark + harvest.** Ship only if the goal ruler moves.

## PHASE 3 — The load. Needs one decision from you.

**13.81 MB / 75.8 s.** Three options, my recommendation first:

1. **Move the catalog behind the server.** This is why Render exists and why
   `/api/recommend` was written. The endpoint and the pgvector schema already
   exist. ~2 days. Removes the ceiling permanently and unblocks 100,000 titles.
2. **Stream it in fame order** — ship the first few thousand, start the deck,
   fetch the rest in the background. ~1 day. Cheaper, keeps everything local.
3. **Accept it**, if the site is only ever opened on wifi.

**Do NOT** split into a small ranking set + large search set. Built, worked,
rejected, reverted.

## PHASE 4 — Housekeeping. Small, and prevents future wrong turns.

- Rewrite `YOUR-TASKS.md` and `REVIEW-REQUEST.md` against the real numbers, or
  move them to `docs/archive/` with a dated header saying they are historical.
- Fix the one page that still says "Seenit".
- Add the TV-blindness caveat to `harvest.ts`'s own output, so the number can
  never be quoted without it.
- Decide whether `/lab` stays.

## PHASE 5 — New features, in order of expected value.

**5.1 · Make the grid the default way in, not the deck.** *(highest value, and
it is mostly a routing change.)* The grid harvests **2,490 titles/hour against
the deck's 1,121** — more than double, measured. A new user currently lands on
the slower surface. The deck is the better *experience*; the grid is the better
*harvester*. Proposal: grid first until the library has some mass, then the
deck. Measurable with `MODE=grid npx tsx scripts/harvest.ts`.

**5.2 · Text written to describe mood and craft.** The one untried lever for
feel-based matching. Embeddings over *plot summaries* failed twice and the
diagnosis is precise: *Mad Max ↔ Rebel Moon* beats *Mad Max ↔ John Wick* because
their plots really are alike, and **no plot summary mentions craft or tone.**
The `souls` hook in `recommend.ts` is already wired for it. This is the only
path to the "two comedies with nothing in common that feel the same" goal.

**5.3 · More import sources.** Import measured **100% match on 60 real
libraries** and is by far the cheapest way to fill a library. Currently
Letterboxd / IMDb / Trakt / TV Time. Netflix viewing history is an obvious
addition.

**5.4 · Show the person what the site knows about them.** There is a real taste
model in there — seven facet tables with named tokens — and nothing surfaces it.
"You like: heist, slow-burn, Denis Villeneuve, 2010s" is both a feature and a
correction mechanism.

---

# PART 4 — THE ORDER I WOULD ACTUALLY WORK IN

```
NOW      you: Phase 0 (30 minutes)  ──┐
                                      │  these run in parallel
NOW      me:  1.1 TARGET_SEEN sweep ──┘
              1.2 tail-signal re-run

THEN     me:  1.3 look at the lost 54% directly
              (the first genuinely new angle in a month)

THEN     decision point on Phase 3 — needs your answer, not mine

THEN     2.x the model-written edges at scale (~$3)

THEN     5.1 grid-first onboarding (cheap, measured, big)

LATER    5.2 mood text — the real answer to the taste half
```

**Phase 1 and Phase 0 do not block each other.** I can start the sweeps now.

---

# PART 5 — THE HONEST SUMMARY

The **library half** of this product works: import at 100%, grid at 2,490/hour,
a catalog of 48,553 that reaches Arabic, Turkish and Indian titles for the first
time, and a scorer that puts a real watched title at median rank 591 of 48,553.

The **taste half** — "two comedies with nothing in common that feel the same" —
is not solved, and the only remaining path to it is 5.2.

And the **collapse** is still the collapse. Every real improvement to date came
from **changing the question asked** (grid, import, frontier), never from
retuning the answer. That is the strongest available hint about where to look
next, and 1.3 is the first attempt to look at it directly.
