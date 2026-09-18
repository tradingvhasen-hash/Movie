# FILE 2 — EVERYTHING THE CODE DOES NOT TELL YOU

The code says *what*. This says *why*, *what was tried*, *what is deliberately
missing*, and *what is still broken*. If you only read one file before touching
the engine, read this one and then `04-THE-ALGORITHM.md`.

---

## 1. The product, in one paragraph

**Dhawq (ذَوق — "taste")** is a website where you swipe through film and series
posters. Right = *I watched it and liked it*. Left = *I watched it and disliked
it*. Up = *I never watched it*. From those three answers it builds a picture of
your taste and starts choosing what to show you.

**The stated goal, which is the thing every decision is measured against:**

> A person should be able to enter **every film and show they have ever
> watched**, in about a week of ordinary use.

That is not a recommender's goal. A recommender wants to suggest one good film.
This wants to *harvest a life's worth of watching*, by asking the smallest
number of questions. Almost every surprising design decision in this project
follows from that difference.

---

## 2. Names

- **Dhawq / ذَوق** is the product name. The package is `dhawq`. The Render
  service is `dhawq`.
- **Seenit** appears in one page title (`src/app/calibrate/page.tsx`). Leftover
  from an earlier name. Harmless, not worth a commit on its own.
- The GitHub repository is called **Movie** — the name it was created with,
  before the product had one.

---

## 3. The vocabulary used everywhere in this project

You cannot read the commit messages or the code comments without these. They are
this project's own words, not industry terms.

| Word | Means |
|---|---|
| **the deck** | The main swipe screen. The cards. |
| **a card** | One title shown to you. |
| **the catalog** | `public/catalog.json` — all 48,553 titles, one file. |
| **a ruler** | A measuring script. Something that scores the engine on data and prints a number. In `scripts/`. |
| **a guard** | A script that fails loudly when something specific breaks. Not a score — a pass/fail. Files ending `.mjs` drive a real browser. |
| **the gate** | The filter that decides which titles the deck is even *allowed* to consider. `fameGate` in `recommend.ts`. |
| **the tier** | How many titles the gate lets through. `fameTierSize`. Grows as you swipe. |
| **fame** | TMDB vote count. Used as "how likely is it that a person has heard of this". |
| **the harvest** | How many of a person's real watched titles the app manages to get out of them in a session. The project's main score. |
| **the collapse** | The unsolved problem. Accuracy falls as the session gets longer. See section 7. |
| **the frontier** | Titles adjacent (in the co-watch graph) to something you have already confirmed watching. |
| **a facet** | One dimension of taste: story, genre, cast, director, era, language, fame. |
| **a token** | One value inside a facet. `"comedy"` is a genre token; `"Tom Hanks"` is a cast token. |
| **the co-watch graph** | 768,917 links of the form "people who watched A also watched B", from TMDB. |

---

## 4. How this project is documented — read this before looking for docs

There are three layers, and the least obvious one is the most valuable.

1. **`NOTES.md`** (151 KB, repo root) — the working log. Every experiment with
   its numbers, in the order it happened, including the failures. Not tidy. It
   is the primary record.
2. **Commit messages** — deliberately long. A typical one states what was
   measured, the numbers on both sides, and what it means. `git log` is a
   readable history of the reasoning, not a list of file changes.
3. **The comments at the top of source files** — this is the unusual one. Files
   like `recommend.ts`, `facets.ts`, `taste.ts` and `CalibrationGrid.tsx` open
   with several paragraphs explaining why they exist and what was already tried
   and rejected. **Several of those comments are warnings addressed to whoever
   reads the file next**, saying in effect: *this was measured, it did not work,
   do not try it again*. They are long on purpose. Do not tidy them away.

---

## 5. How to run it on your own machine

```bash
git clone https://github.com/tradingvhasen-hash/Movie.git
cd Movie
git checkout claude/movie-swipe-app-0bvkc8
npm install
npm run dev            # http://localhost:3000
```

No keys needed. The catalog is a committed file; Supabase is optional; nothing
calls an API at runtime.

**Requires Node 22.** The repo has no test runner and no linter configured — the
`scripts/` folder *is* the test suite, driven by hand (see `05-THE-TESTS.md`).

---

## 6. The decisions that a reader would otherwise have to guess

**Why there is no AI / LLM in the running product.** It was tested, properly,
twice. All 5,555 titles of the time were embedded locally with a sentence model
(`all-MiniLM-L6-v2`, free, 57 seconds) from their own text, and the engine was
re-benchmarked at several weights — once on the shipped 200-character summaries
and again after re-fetching full-length ones. It was **never better**, and the
one line that mattered — recovering a taste that genres cannot express — went to
**zero every single time**. The diagnosis is written in `recommend.ts` above
`W_SOUL`: *Mad Max ↔ Rebel Moon* scores higher than *Mad Max ↔ John Wick*,
because their plots really are alike; what separates them is craft and tone, and
no plot summary mentions craft or tone. **The bottleneck is the text, not the
model.** The `souls` hook is left in place for the day something actually
describes mood, which nothing does today.

**Why the whole catalog is one 25 MB file in the repo.** Because the alternative
was worse for the person using it. The engine needs to score against everything;
round-tripping to a server per batch is slower and needs the server awake. The
file is downloaded once and cached. It was measured, it is heavy, and it is a
known cost — see section 7.

**Why fame (vote count) is weighted so heavily.** Because of the goal. A
perfectly-matched film with 300 ratings is still a film you have never heard of,
and a deck full of those reads as random and teaches nothing. To harvest a
history you must ask about things the person might actually have seen.

**Why the search index split was reverted.** There was a version that shipped
11,000 titles to the swipe/discover screens and 41,000 to search only. It halved
the download. It was rejected outright: *"I want the whole 50,000 in the discover
page, in the swiping page"*, and the algorithm must apply to all of them, not
just the top slice. It was undone in commit `fc7d02c`. **Do not re-introduce
it.**

**Why titles are not deduplicated away and keywords are not dropped.** Both were
proposed as size savings and both were refused. Keywords carry most of the real
meaning signal in the engine.

**Why the fifth button is hidden.** The deck had five verdicts. The count was
too high — three, or four with undo. The fifth ("watched it, no strong feeling")
still exists and can be switched on: **Settings → show the fourth verdict**.
Default off (`showSeenButton: false` in `store.ts`).

**Why "how far the deck reaches" is a setting and not a constant.** This is the
most honest thing in the project and it should not be quietly turned into a
constant by a future maintainer. The measurement genuinely does not decide it.
Full account in `04-THE-ALGORITHM.md`, section C.

---

## 7. What is known to be wrong, right now

**A. The collapse — the main open problem.** Reported from real sessions: *"of
the first fifty I liked forty; of the last fifty, I liked two."* What is now
known about it:

- It is **not** running out of titles. 162 of the person's own films were still
  unfound at the end of the block that felt empty.
- It is **not** a broken scorer. Handed a real library and asked to rank all
  48,553 titles, it puts a title the person actually watched at **median rank
  591** — 41× better than chance.
- It is **not** fixed by widening the pool. Opening the gate takes
  "missed because we never considered it" from 18.4% to 0%, but
  "considered and never dealt" from 53.4% to **84.9%**, and the harvest halves.
- A **completely different algorithm** (a dumb walk over the co-watch graph,
  sharing no code with the ranker) produces nearly the same decay curve. That is
  evidence the decay is partly a property of the problem, not of this code.
- **Still unexplained:** in the shipped configuration ~54% of a person's library
  sits inside the candidate pool and is never dealt. That is the number to
  attack.

**B. The first load is heavy.** 24.03 MB raw, 11.95 MB gzipped, **13.81 MB over
the wire**, and **75.8 seconds** to open on a throttled Slow-4G connection. A
24 MB version once genuinely broke the owner's phone — the main thread and the
web worker were each fetching the catalog separately. Fixed by handing the
catalog to the worker through `postMessage` instead. It is still heavy.

**C. The free Render plan sleeps.** First visitor after ~15 idle minutes waits
30–50 seconds. Measured 32.7s on 18 Sep 2026.

**D. `/api/recommend` and the entire Supabase catalog path are built, tested and
unused.** The app ranks in the browser. Do not assume the endpoint is dead code
to delete — it is the escape hatch for when the catalog outgrows the browser.

**E. `/lab` is a temporary instrument.** Deliberately not linked from the
navigation. It was built to do the counting that was being done by hand on
paper. It is meant to be deleted once it has done its job.

---

## 8. Ideas that were measured and FAILED — do not repeat these

Each of these cost real time. They are recorded in the source comments too, but
collected here so nobody has to rediscover them.

1. **Meaning-vectors / text embeddings in the ranking.** Never better; killed
   the feel signal entirely. Two rounds, including with full-length summaries.
2. **Using co-watch graph degree in the gate or in the ranking.** Tried twice,
   made results worse both times. Removed both times. The finding is kept as a
   comment where the temptation lives.
3. **Lowering the fame weight** (0.55 → 0.1) to fix the collapse. Moved nothing.
4. **Raising the recognition weight** (×3) to fix the collapse. Moved the tail by
   0.2. The reason is written down: a term's influence is its weight times its
   *spread*, and the facet score spans [-1,1] while the recognition term is a
   probability bunched near 0.5. The wide term still wins.
5. **Splitting the catalog into a small "ranking" set and a large "search" set.**
   Worked technically, rejected by the owner, reverted.
6. **"Everything" as a growth multiplier of 20.** Looked like a fix, did almost
   nothing — growth is multiplied by cards answered, so at card 40 the pool was
   still ~340 titles. 15 of the first 31 cards were identical to "narrow". It
   now bypasses the tier outright.
7. **Re-dealing titles the 👁 button had touched** (`pendingVerdicts`). This was
   a *bug*, not an idea, and it jammed the deck for a week: nine eye-presses
   produced only three stored answers. Deleted. `scripts/deck-guard.mjs` exists
   specifically so it cannot come back.

---

## 9. Working rules the owner set, in his own terms

These are preferences that came out of real friction. They are worth honouring.

- **Do not double down on a failed idea.** *"You try something, then it fails.
  And then you try to double down the same thing that failed, and then triple
  down… Just stop it. Find a different solution. Think out of the box."*
- **Do not change things that were not asked for.** Deleting names and keywords
  to save space was done without asking and was not acceptable.
- **Fix the main problem, not the adjacent easy one.** Hours spent on a hidden
  setting while the collapse stood untouched was the specific complaint.
- **Explain in plain words.** "Guard", "ruler", "gate" mean nothing to a reader
  who has not been told — which is why section 3 of this file exists.
- **Never leave background work running unwatched.** Long-running jobs were
  found still spinning hours after they had stopped being useful.
- **Measure, do not argue.** Almost every constant in `recommend.ts` is readable
  from an environment variable specifically so a disagreement can be settled by
  running something instead of debating it.

---

## 10. Map of the code

```
public/catalog.json        48,553 titles. 25 MB. THE data file.
public/overviews.json      plot summaries, loaded later, off the critical path
public/communities.json    community/cluster data from the graph work

src/app/                   the pages (see 03-HOW-THE-SITE-WORKS.md §6)
src/components/            SwipeDeck, SwipeCard, QuickAdd, ImportLibrary, …
src/lib/store.ts           all app state; persists to localStorage "dhawq-store"
src/lib/useDeck.ts         the deck queue — what card comes next
src/lib/catalog.ts         loads and decodes the catalog, hands it to the worker
src/lib/engine/
  recommend.ts             2,556 lines. The ranker, the gate, the tier. THE file.
  facets.ts                1,203 lines. The taste tables and how a swipe moves them.
  taste.ts                 the profile, seenTrust, watchLikelihood
  features.ts              the old 384-dim hashed vector (legacy, still used in places)
  rank-worker.ts           runs the ranking on a separate thread
  rank-client.ts           talks to that thread
src/lib/import/watchlist.ts   Letterboxd / IMDb / Trakt / TV Time CSV import
src/lib/supabase/          the optional cloud layer

scripts/                   every ruler, guard and build tool. See 05-THE-TESTS.md
scripts/lib/catalog.ts     ONE loader, so every ruler grades what actually ships
supabase/migrations/       0001–0007, the database schema
render.yaml                the Render configuration, as code
.github/workflows/pages.yml  the GitHub Pages build
```

**One trap worth knowing:** there was a period when all 46 measuring scripts read
`public/catalog.json` directly and would have graded 11,000 titles instead of
51,922. `scripts/lib/catalog.ts` now exists so every ruler loads the catalog the
same way the site does. **New scripts must use it.**

---

## 11. Numbers as of 18 September 2026

| | |
|---|---|
| Titles in the catalog | **48,553** |
| Films / series | 34,661 / 13,892 |
| Languages | 39 |
| Largest non-English | Japanese 2,998 · Korean 2,157 · Hindi 1,932 · Spanish 1,839 · **Turkish 1,803** · French 1,779 · **Arabic 1,503** |
| Co-watch links | 768,917 across 48,543 titles |
| Titles carrying their original-script name | 23,105 |
| Genres / interned languages | 22 / 39 |
| Catalog file size | 25.6 MB raw |
| Total first load | 13.81 MB over the wire · 75.8 s on Slow 4G |
| Commits | 154 |
| localStorage key / version | `dhawq-store` / v5 |

For comparison, where the catalog came from: it was **15,083** titles before the
rebuild, with **2** Arabic titles and **778** Turkish. It is now 1,503 and 1,803.
