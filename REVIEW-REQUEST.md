# A review request

You have the full repository. I would like a deep, unhurried read and your
honest opinion — including the opinion that the whole approach is wrong.

Nothing below is a hint at what you should conclude. It is the state of the
project, the measurements we have, and the things we cannot solve. Where we
have already tried something, it is listed with the number that killed it, so
you do not spend a day rediscovering it. Everything else is open.

---

## 1. What the product is meant to be

A person swipes cards. Each card is one film or one series.

    right   watched it, liked it
    left    watched it, did not like it
    up      have not watched it

From that, two things are meant to come out.

**The library.** Everything the person has ever watched. The target is
explicit and it is the whole product: **within about a week of ordinary use, a
person should be able to get literally every film they have watched in their
life into the site.** Thousands of titles, not hundreds.

**The taste.** Once the library exists, recommendations that match by *meaning*
— what a thing feels like — rather than by shared words. Two comedies with no
actor, no keyword and no director in common can be the same thing to a viewer,
and a system built on metadata overlap cannot see that.

The library is the harder and more important half. Without it the taste model
has nothing to work with.

---

## 2. What it is today

- Next.js 16 app, React 19, TypeScript. Deployed on Render.
- A catalog of **12,826 titles** (9,750 films, 3,076 series, 34 original
  languages) built offline from TMDB and shipped to the browser as one file,
  3.33 MB gzipped.
- All ranking happens **in the browser**. There is a Supabase account layer for
  cross-device sync, but the engine does not use a server.
- A taste model made of six "facet" tables (keywords, cast, director, genre,
  language, decade). Each table maps a token to two numbers: net evidence and
  observation mass.
- A **second, separate** set of six tables answering "has this person watched
  it" as distinct from "does this person like it".
- A **fame gate**: before scoring, the candidate pool is cut to roughly the top
  N titles by vote count, where N starts at 900 and moves with the person's
  answers. The reasoning is that a card for something you have never heard of
  is a wasted swipe.
- A **behavioural graph** of 261,237 edges — "people who watched this also
  watched that" — built from TMDB's own audience links, MovieLens 32M
  (commercial licence granted), and Wikipedia clickstream data. 97% of titles
  have edges, 20.4 on average. **42% of the edges join two titles that share at
  most one keyword, genre, actor or director** — that is the part no
  metadata-based system can reach.
- Scoring is a weighted sum: taste fit, "have you heard of it", graph
  proximity, a quality prior, and a small per-user random tie-break. Then
  maximal-marginal-relevance diversity with an extra penalty for repeating a
  genre, then a reserved slot or two for probing a genre we have not tested.
- A second surface, `/seen`: a grid of 30 posters, "which of these have you
  watched?". A tap means watched and nothing more.

---

## 3. How we measure anything

No change ships because it looks better. These are the instruments, and each
has a blind spot we know about.

| ruler | what it measures | its blind spot |
|---|---|---|
| `replay` | a full session graded against **865 real answers** from one real person | one person's taste |
| `harvest` | how much of a real viewing history the site can extract, using MovieLens users as histories — **this is the ruler aimed at the actual goal** | a MovieLens history is a floor on what someone watched, and carries MovieLens's own bias |
| `human-test` | 500 real libraries: hide half, see how much of the hidden half comes back | measures precision, not discovery |
| `simulate` | 13 guards — does it learn, does it tunnel, is the gate sane, is re-rank fast enough | synthetic personas |
| `vibe-pairs` | pairs that feel alike and share no words | we wrote the pairs |
| `deck-drift` | does a taste survive a long session | — |

Current readings:

    replay                  88.0
    harvest                 218.1 of 533.4 films (40.9%), ceiling 345.7 (64.8%)
    human-test, deck        32.4%   long tail 9.9%   (popularity baseline 12.6%)
    human-test, discover    32.6%   long tail 14.6%
    vibe, hard pairs        60%
    simulate                11-12 of 13

**Four separate times in this project the instrument was the broken thing, not
the code.** Twice a ruler was defined in terms of the very quantity being
changed, so it could only ever confirm the change. If you find a fifth, that is
the most useful thing you could tell us.

---

## 4. The problem we cannot solve

This is the reason for the review.

A real session, 1,100 swipes, from the person the product is being built for.
The number is what fraction of each block of cards he had actually watched:

    cards    1- 110      63%
    cards  111- 220      34%
    cards  221- 330      25%
    cards  331- 440      22%
    cards  441- 550      12%
    cards  551- 660      10%
    cards  661- 770      11%
    cards  771- 880      12%

It starts well and collapses. Three sessions across three days, on three
different builds, produced the same curve — 37.3%, 36.1%, 35.9% over the first
440 cards. His description: *"every swipe should tell you more about me, not
less. What happens is exactly the opposite."*

Two facts about that same session:

- He was shown **39% comedy**. Of the titles he marked watched, **78% were
  comedy**. The system is spreading him across genres he does not watch while
  the genre he does watch is under-served.
- There are **658 English comedies from 1995–2020 with over 1,200 votes** in
  the catalog that he was never shown once in 1,100 cards. Among them: Knives
  Out, The Big Lebowski, Men in Black II, Snatch, American Pie, Kung Fu Panda.

And one fact about the catalog:

- 1,045 of his 1,100 cards were English-language. Zero Arabic, zero Hindi, zero
  Turkish, zero Tamil — although the catalog holds 331, 500, 578 and 387 of
  them. The gate ranks by TMDB vote count, non-English titles carry an order of
  magnitude fewer votes, so they sort below every English title and are never
  reached. The mechanism intended to fix this only opens a language once the
  viewer demonstrates they watch it — which they cannot do for a language they
  are never shown.

`harvest` says the same thing from the other side: the gate can reach **64.8%**
of a real person's history *at any session length*. A third of what they have
watched is structurally unreachable, and of the reachable part the ranking
finds 40.9%.

---

## 5. Already tried, with the number

Please do not spend time re-deriving these. If you think one was measured
wrongly, that is a finding in itself and we would rather hear it.

| tried | result |
|---|---|
| TMDB vote count as the estimate of "have you heard of it" | AUC **0.500** against a real person's answers — a coin flip |
| a language model estimating how widely each title was really watched, ~12,000 titles | worse end to end: the real-answer ruler fell 88.0 → 52.5; still no gain after calibration. Shipped disabled |
| opening the gate to any graph neighbour of a liked title, at any depth | recognition 93% → 83% *(note: measured against a recognition metric that was itself defined by fame — we now think this measurement was circular)* |
| ranking every title by its percentile **within its own language** | absolute harvest fell 16% — it splits the gate across 34 languages for everyone, including people who only watch one |
| a quarter of the deck reserved for probing unknown genres | −2.4 points of accuracy on 500 real libraries; reduced to 6–12% |
| Wikipedia clickstream in 40 languages | rescued 61 titles out of 7,271 with no behavioural data |
| widening the gate | no measurable difference |
| centring facet evidence on the base rate | a wash |
| meaning-vectors built from our own catalog text | no improvement |

---

## 6. Known-open, and honest about it

- `simulate` reports 11–12 of 13. One failure is a tunnel-vision guard reading
  3.39× against a 1.15× limit; every way of calming it costs the real-answer
  ruler monotonically, so it was left failing rather than retuned to pass. The
  other is a re-rank timing guard that passes and fails between identical runs.
- **7,271 titles have no behavioural data at all.** MovieLens has never heard
  of them. They are ranked on metadata alone, which is the weakest signal here.
- The whole library lives in the browser's localStorage, which stops at 5–10 MB.
  A library of 5,000 films currently needs 2.3 MB, so there is room, but the
  architecture has a ceiling and the target is "everything a person has ever
  watched".
- Amazon Reviews 2023 is the only lead we know of that covers **television**
  behaviourally. We asked for a licence and got no reply.

---

## 7. What we are asking for

Take your time. Think about it properly, and outside the frame we have been
working in — we have been circling the same three ideas for weeks and we would
rather be told the frame is wrong than be handed a better parameter.

Specific things we would value:

1. **The decay.** Why does the hit rate collapse, and what is the right shape
   for a system whose job is to keep finding things a person has watched
   after a thousand cards? Is "walk down a global fame list" the wrong model
   entirely, and if so what replaces it?
2. **Reachability.** A third of a person's history is outside the gate at any
   session length. Is a gate the right idea at all?
3. **The measurement.** Is any ruler above circular in a way we have not
   noticed? What should we be measuring that we are not?
4. **The data.** Is there a source — free or paid — that answers "what has a
   person like this watched" better than what we have, especially for
   television and for non-English film?
5. **Anything you would throw away.** Including the swipe interface, the gate,
   the facet model, the graph, or the premise.

Code quality comments are welcome but secondary. The product problem is the
problem.
