# FILE 5 — EVERY TEST

For each one: **where it is**, **why it exists**, **how to run it**, **what it
prints**, and **how to read the result**.

There are three kinds:

| Kind | What it is | Where |
|---|---|---|
| **Pages** | Screens on the live site you open in a browser and answer by hand. These are the side-page links you were sent. | Part 1 |
| **Rulers** | Scripts that score the engine and print a number. "Is it any good?" | Part 2 |
| **Guards** | Scripts that pass or fail. "Is it broken?" Some drive a real browser. | Part 3 |

Everything runs on your own machine except the pages. Nothing costs money.

**Before any of it:**
```bash
git clone https://github.com/tradingvhasen-hash/Movie.git
cd Movie && git checkout claude/movie-swipe-app-0bvkc8
npm install
```

---

# PART 1 — THE TEST PAGES (the links you were sent)

## 1.1 `/lab` — the block counter

**Link:** <https://dhawq.onrender.com/lab>

**Why it exists.** Five separate faults in this engine were found by one person
swiping two hundred cards and **writing down on paper**, in blocks of fifty, how
many of each fifty were actually his taste. That is the most accurate ruler this
project has and it was being produced with a notepad. This page does the counting
so the attention can go to the only part a machine cannot do: judging whether a
card is really yours.

**How to reach it.** Type the address. **It is deliberately not linked from the
navigation** — it is a temporary instrument, meant to be deleted once it has done
its job.

**How to run it.** Swipe normally, on the deck, for as long as you can. Then open
`/lab`.

**What it shows.** Your session broken into blocks (50 by default, changeable),
each with liked / disliked / never-seen / total. Plus a copy button that exports
the raw session as JSON — that export is what `scripts/replay.ts` and
`scripts/session-report.ts` read.

**How to read it.** **Read the blocks, never the total.** A running total hides
the exact thing every session has shown — the shape over time:

> `40, 26, 12, 11` is a finding.
> `89 of 200` is a number.

If block 1 is much higher than block 4, that is **the collapse**
(`04-THE-ALGORITHM.md` §D). If the blocks stay flat, the problem is fixed. That
flat line is the goal of the entire project.

**⚠️ It can reset your session.** There is a reset control on this page. It asks
for confirmation. If you want to keep a session, press copy first.

---

## 1.2 `/calibrate` — the only honest sample that will ever exist

**Link:** <https://dhawq.onrender.com/calibrate>

**Why it exists — this is the most important test on the list and the least
obvious.**

Every label this project owns was chosen by the gate. The deck draws from roughly
the top few thousand titles by vote count, so **every "have you seen this?"
answer we have was asked about a title the model already believed was likely.**
Every exposure model since has been fitted on the output of the model it was
meant to correct. A closed loop.

That loop produced a wrong conclusion once already. Vote count scored **AUC
0.500** against real answers and was declared worthless. But it was measured on a
sample *truncated by vote count* — range restriction drives AUC toward 0.5
mechanically, and 0.500 is close to the textbook artefact. The honest reading is
far narrower: *within the top 7% of the catalog, fame has no residual power* —
which says nothing about ranks 900 to 12,826, and that is precisely the range the
gate needs it for.

**This page breaks the loop.** It draws a **stratified random sample across the
whole catalog** — equal numbers from each fifth of the fame ranking, films and
series in proportion — and asks one question. Nothing is ranked, scored, gated or
personalised. The order is random.

**How to run it.** Open the link. 5 strata × 40 = **200 titles**. For each: have
you seen it, yes or no. It takes 10–20 minutes. The seed is deterministic, so a
reload continues the same sample rather than starting a new one.

**What to do with the answers.** Export them and save as
`.cache/calibration-200.json`, then:

```bash
npx tsx scripts/calibrate.ts .cache/calibration-200.json
```

**How to read it.** An **AUC** — the probability the model ranks a title you
*have* seen above one you have not.

| AUC | Means |
|---|---|
| 0.5 | worthless, a coin flip |
| 0.6–0.7 | real signal |
| 0.7+ | strong |

For reference, `scripts/seen-model.py` fitted genre and decade rates on this kind
of data and got **0.707** against fame's 0.453.

**Please do this again after any big catalog change.** It is the only measurement
in the project the engine did not choose, and it is worth more than all the
synthetic rulers combined.

---

## 1.3 `/add` — the grid

**Link:** <https://dhawq.onrender.com/add>

Not strictly a test, but it is the measured-fastest way to fill a library and it
is where the frontier result was found. 40 posters at once; tap what you have
watched; **"None of these" records forty answers in one press.**

**2,490 titles/hour, against the deck's 1,121.**

---

## 1.4 The live site itself

**Link:** <https://dhawq.onrender.com> · setting at **You → Settings → How far
the deck reaches**

The single most useful human test: swipe 40 cards at **"Only what's famous"**,
then flip to **"Everything"** and swipe 40 more. Does an Arabic, Turkish or
Indian title appear, and after how many cards? No script can answer that, because
the only reference libraries available are American.

**⚠️ First load takes 30–50 seconds** if nobody has visited recently — the free
Render instance is asleep. Not a bug in the site.

---

# PART 2 — THE RULERS (scripts that produce a score)

## 2.1 The two you run after *every* engine change

### `npm run simulate` — is anything broken?
10 named checks against the real catalog with synthetic users of known taste.
Includes: *skip learning — 10 superhero skips*, *no tunnel vision — 1 action
like*, *fame gate — first 40 cards*, *session variety — two seeds*, *facet
attribution — 4 likes from one director*, *co-watch coverage*, *deck still
explores with co-watch on*.

**Read:** `13/13 checks passed`. Anything less, stop and read the FAIL line — it
prints what it expected and what it got.

> One of these checks is worth knowing about. *"fame gate — first 40 cards"* used
> to assert an absolute vote count and failed at 4,935 votes; the offender was
> **Ghostbusters II**. It now asserts **catalog rank ≤ 2,000**, which cannot
> drift when the catalog is rebuilt and is stricter.

### `npm run benchmark` — is it any *good*?
The quality ruler. Three tests, six synthetic viewers.

**Read the last three lines:**
```
OVERALL QUALITY            __%
tastes defined by genre    __%   (baseline 88%)
tastes defined by feel     __%   (baseline 15%)
```
**The "feel" line is the one that matters.** Genre tastes are easy — a baseline
of 88% is nearly the ceiling. Feel is a taste genres cannot express, and that is
the project's actual question. Every failed embedding experiment failed *there*.

---

## 2.2 The harvest rulers — the product's real score

These answer the goal directly: *how much of a real person's watch history can
this get out of them?* They use **MovieLens** histories — real ratings by real
people, nobody here wrote them.

### `npx tsx scripts/harvest.ts` — the main one
```bash
npx tsx scripts/harvest.ts                    # 60 people, 500 cards
USERS=10 CARDS=250 npx tsx scripts/harvest.ts # quick
MODE=grid npx tsx scripts/harvest.ts          # the /add grid instead of the deck
PURE=1 npx tsx scripts/harvest.ts             # no probes, no diversity — raw ranking
```

**Output:**
```
  cards        found in this block     running total
  1-50              ...                    ...
 51-100             ...                    ...
  ...
  RATE      ____ titles harvested per hour
  HARVEST   ___ of ___ films  (__% of a real history, in 500 cards)
  REACHED   ___ were candidates at some point  (__%)
  LOST AT RETRIEVAL  __%   ·  LOST AT RANKING  __%
```

**How to read it — this is the most important reading skill in the project:**

- **The block column is the collapse.** Falling numbers = the problem. Flat = fixed.
- **RATE** is the headline. Deck ≈ **1,121/hour**. Grid with frontier ≈ **2,490**.
- **LOST AT RETRIEVAL** = the gate never let the title through. *A gate problem.
  No amount of ranking work can touch it.*
- **LOST AT RANKING** = the title **was** a candidate and we did not deal it.
  *That one is ours.* Currently **~53%**, and it is the open problem.

Those two lines split the blame. Always read them before changing anything.

### `npx tsx scripts/rank-all.ts` — does the right answer come top?
Isolates the **scorer** from everything else. Give it half a real library, ask it
to rank all 48,553 titles, and see where the other half lands.

```bash
npx tsx scripts/rank-all.ts
USERS=60 npx tsx scripts/rank-all.ts
SESSION=1 npx tsx scripts/rank-all.ts   # run it as a consuming session instead
```

**The result that corrected a wrong claim to the owner:**

| scorer | median rank | top 100 | top 1,000 | top 5,000 |
|---|---|---|---|---|
| shipped | **591** | 15.8% | 64.4% | 95.1% |
| taste only | 642 | 14.6% | 63.0% | 94.9% |
| fame only | 934 | 11.9% | 51.7% | 94.5% |
| coin flip | 24,277 | 0.2% | 2.1% | 10.3% |

**Read:** lower median = better. 591 of 48,553 is 41× better than chance.

> ⚠️ **The trap that broke the first version of this file.** It built profiles
> from library titles only — all "seen", no "haven't seen" — which makes
> `answerBalance = 4p(1−p)` exactly **0**, which zeroes the taste weight, which
> makes the shipped score return the raw fame prior. It reported shipped and
> popularity as identical to three significant figures, and that was passed on as
> a finding about the product. **It was a finding about the test.** Any synthetic
> profile must contain realistic "haven't seen" answers.

### `npx tsx scripts/reach-audit.ts` — is the algorithm really applied to all 48,553?
The question behind it: *a catalog can be large and still be decorative.* Six
layers of audit. **Read:** what share of the catalog is genuinely reachable. It
answered **17.3%** at "narrow" — which is what a ceiling of 3 means in practice.

### `npx tsx scripts/reachable.ts` — can the deck reach the films *he* watched?
Uses the `/calibrate` answers — the unbiased sample — rather than MovieLens.

### `npx tsx scripts/frontier-sim.ts` — is the collapse in the code or in the problem?
```bash
CARDS=2400 USERS=60 MODE=grid npx tsx scripts/frontier-sim.ts
```
A **completely different algorithm** — a dumb walk over the co-watch graph,
sharing no code with the ranker. **Read:** compare its decay curve to
`harvest.ts`. They come out nearly identical, which is the evidence that the
decay is partly a property of the problem.

### `npx tsx scripts/session-report.ts` — what did the deck spend its cards on?
```bash
npx tsx scripts/session-report.ts .cache/user-swipes-v6.json
npx tsx scripts/session-report.ts          # every export, side by side
```
Feed it a real session export from `/lab`.

### `npx tsx scripts/tail-signal.ts` — is there anything left in the tail?
```bash
AT=900 USERS=40 npx tsx scripts/tail-signal.ts
```
AUC of **every** signal at card 900. Every fix so far assumed the ranking could
do better at the end of a session; this asks whether the information is even
there. **Read:** any signal above ~0.55 at card 900 is a lead worth chasing.

### `npx tsx scripts/discover-decay.ts` — does Discover decay the way the deck does?
```bash
USERS=150 PAGES=20 npx tsx scripts/discover-decay.ts
```
The complaint is about both screens. This separates them.

---

## 2.3 The taste-quality rulers

| Command | Question | How to read |
|---|---|---|
| `npm run feel` | Can it recover a taste that **genres cannot express**? | The project's hardest question. Baseline 15%. |
| `npm run vibe` | Would a person say these two belong together? | The only test that asks the project's actual question, pair by pair. Aggregates can rise while this falls. |
| `npm run human` | Real people, real libraries, **nobody here wrote the key**. | Everything else was graded against lists written by the same model that wrote the engine. This one is not. |
| `npx tsx scripts/mixed-taste.ts` | Does telling the truth about what you **hate** cost you what you love? | Exists because the owner reported working *around* the engine rather than using it. |
| `npx tsx scripts/hated-genre.ts` | Swipe left 100 times — does it ever learn? | `GENRE=horror npx tsx scripts/hated-genre.ts`. The false-negative to `mixed-taste`'s false-positive. |
| `npx tsx scripts/cold-deck.ts` | **The first twenty cards**, which no ruler had ever graded. | Built after the owner said Discover improved while the deck got worse and every instrument disagreed with him. He was right. |
| `npx tsx scripts/deck-drift.ts` | What the deck does over **150 swipes**. | Every other ruler builds one page from a fixed library. Three faults slipped past all of them. |
| `npx tsx scripts/long-session.ts` | 200 swipes, graded against a taste written by hand. | Reproduces a documented real session. |
| `npx tsx scripts/replay.ts` | A session graded by **a real person's answers**. | `npx tsx scripts/replay.ts .cache/user-swipes.json` — feed it a `/lab` export. |
| `npx tsx scripts/exposure-auc.ts` | Does the engine know what he has watched? On data it did not pick. | AUC. The single model that decides whether the goal is reachable at all. |
| `npx tsx scripts/exposure-bench.ts` | Which signal finds the **rest** of a history? | `USERS=200 NEG=3000 …` |
| `npx tsx scripts/seen-probe.ts` | Does the **shipped** exposure model predict what a person watched? | The production counterpart to `seen-model.py`. |
| `npx tsx scripts/score-share.ts` | **What actually decides a card, as a percentage.** | Built because the weights in `recommend.ts` cannot answer this — they multiply quantities with different spreads. If you want "how much does each mechanism matter", run this, not `grep`. |
| `npx tsx scripts/why-new.ts` | What made these appear now and not before? | After the gate work, 61 of 283 titles he liked in a 1,100-card session had never been shown once across four earlier sessions. This explains why. |
| `npx tsx scripts/deck-probe.ts "Brooklyn Nine-Nine"` | What does the **deck** actually show? | Every other ruler grades Discover. |
| `npx tsx scripts/import-test.ts` | What share of a real library does the importer find? | 100% across 60 libraries with damaged names. |
| `npx tsx scripts/rank-cost.ts` | Where the re-rank spends its time. | Performance, per stage. |
| `npx tsx scripts/round-trip.ts` | Does a taste survive the trip to the database and back? | Only matters if you turn Supabase sync on. |

---

## 2.4 The Python experiments (research, not routine)

Run with `python3 scripts/<name>.py`. These built or evaluated the alternative
link graphs and exposure models.

`build-histories.py` (fetch the MovieLens histories — **run this first**, it
creates `.cache/histories.json` that most rulers need) · `seen-model.py` (the
0.707 AUC result) · `exposure-auc.py` · `behaviour-edges.py` · `wiki-edges.py`,
`wiki-edges-multi.py`, `wiki-clicks.py` (the Wikipedia graph) · `communities.py` ·
`distill.py` · `tag-probe.py` · `ceiling-test.py` (how good could any method
possibly be?) · `llm-exposure.py`, `llm-reach.py` (**these cost money** — they
call the Anthropic API).

---

# PART 3 — THE GUARDS (pass/fail, and several drive a real browser)

The browser guards use **Playwright**, which is **deliberately not a dependency**
of this project — it is resolved from a global install. Install it for a run
with:

```bash
npm i --no-save playwright
```

Start the dev server first (`npm run dev`), then run the guard.

### `node scripts/deck-guard.mjs` — 7 checks on the real swipe deck
**Why it exists:** a bug that **jammed the deck completely** stayed live for a
week and was found by the owner, not by any test. Pressing the 👁 button put that
title back at the front of the next rebuild, so nine presses produced three
stored answers.
**Read:** `7/7`. Anything else and the deck is broken for real users.

### `node scripts/load-guard.mjs` — **would this open on his phone?**
```bash
BASE=http://localhost:3000 node scripts/load-guard.mjs
```
**Why it exists:** the catalog expansion shipped with every size measured except
the one that mattered — the total a cold phone pulls across **both** threads. The
main thread and the worker were each fetching the catalog. Result: ~24 MB on 4G
and a skeleton screen that never resolved. A real phone was broken by it.

**How it measures.** A first attempt read `content-length` and reported 0.00 MB,
because Next.js uses chunked encoding and sends no such header. It now counts
wire bytes through the Chrome DevTools Protocol —
`Network.loadingFinished` → `encodedDataLength` — which is the only reliable way.

**Read:** total MB and seconds on throttled Slow 4G, against a budget of
**6.8 MB** (`BUDGET_MB`). That budget is not a round number picked to pass: it is
what the app cost *before* the catalog grew (6.76 MB measured).

**Current status: 13.81 MB / 75.8 s. It fails its own budget, knowingly.** That
is the honest state of the size problem.

### `node scripts/quickadd-guard.mjs` — the grid, driven the way a person drives it
The +56% was measured in a simulator; this checks the real screen. Forty posters
arrive, tapping marks watched, "None of these" records forty "not seen", and a
fresh screen follows **with no repeats**.

### `node scripts/import-guard.mjs` — the import path a person actually uses
`import-test.ts` measures the matcher on 60 libraries. It cannot see the file
input, the CSV branch, the catalog load, or whether the swipes land in the store
— **all of which are where a wired-up feature usually breaks.**

### `node scripts/onboard-import-guard.mjs` — importing from the first screen
The importer measured 100% and passed on `/lab` — but `/lab` is a page nobody
visits. This drives the path a **real new user** takes: land on the site, reach
the taste picker, hand it a Letterboxd file, end up in the deck.

### `node scripts/entry-guard.mjs` — the front door still opens

---

# PART 4 — WHAT TO RUN, WHEN

**After any engine change:**
```bash
npm run simulate && npm run benchmark && npx tsx scripts/harvest.ts
```

**After any catalog change — add these:**
```bash
npx tsx scripts/reach-audit.ts
npm run dev &
node scripts/load-guard.mjs      # ← the one that catches the real disaster
node scripts/deck-guard.mjs
```

**Before pushing anything to the live site:**
```bash
npm run build && npm run simulate && node scripts/deck-guard.mjs && node scripts/entry-guard.mjs
```

The shipping line used in recent commit messages, as a template:
> `simulate 13/13 · deck-guard 7/7 · quickadd · entry · load 13.81 MB / 75.8s`

---

# PART 5 — THREE RULES ABOUT MEASURING, LEARNED PAINFULLY

**1. Never edit an engine file while a sweep is running.** Three separate runs
were contaminated this way and had to be killed and re-run. Finish the run first.

**2. Never leave a background job running unwatched.** Wait-loops were once left
spinning for **5 hours 34 minutes** after their output file had been renamed. Use
a task manager, check what is running, kill what is finished.

**3. Every ruler must load the catalog through `scripts/lib/catalog.ts`.** There
was a moment when all 46 scripts read `public/catalog.json` directly and would
have graded **11,000** titles instead of 51,922 — silently, with plausible
numbers. One loader, so every ruler sees exactly what ships.

---

# PART 6 — THE DATA FILES THE TESTS NEED

Most live in `.cache/`, which is **git-ignored** and therefore **not in the
repo**. A fresh clone has to regenerate them.

| File | What | How to get it |
|---|---|---|
| `.cache/histories.json` | MovieLens watch histories — **the outside referee** | `python3 scripts/build-histories.py` |
| `.cache/calibration-200.json` | Your answers from `/calibrate` | Do the page, export |
| `.cache/user-swipes*.json` | Real session exports | Copy button on `/lab` |
| `scripts/data/letterboxd-sample.csv` | Sample import file | **in the repo** |
| `scripts/data/ai-edges.json` | Output of the finished LLM bake-off | **in the repo** |

**Without `.cache/histories.json` most of the harvest rulers will not run.**
Build it first.
