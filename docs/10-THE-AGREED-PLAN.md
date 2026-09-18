# FILE 10 — THE COMPARISON AND THE AGREED PLAN

Two independent answers to the 23 problems in `09-THE-PROBLEMS.md`:

- **Mine** — `08-MY-SOLUTIONS.md`, written first and sealed.
- **Theirs** — an outside analysis the owner commissioned, delivered 18 Sep 2026.

They did not see mine. This file judges each pair and states the winner.

**Headline: theirs wins or materially improves on 20 of 23.** Mine survives as
sequencing, costing and de-risking, plus four specific additions. That is the
honest count and it is recorded rather than softened.

**Their central reframe, which I accept and which mine missed:**

> Dhawq is not a recommender. The deck's job is not *"what is the best film to
> suggest?"* but *"of 48,553 titles, how do I find the most things this person
> has watched, with the fewest questions?"*

That is **Active Search / Active Covering**, and it is a different problem with
different optimal behaviour. I had been tuning a ranker. Four failed reweighting
attempts are what that looks like from the inside.

---

# PART 1 — THE COMPARISON, PROBLEM BY PROBLEM

## 1 — The collapse · **THEIRS**, with my diagnostic first

**Mine:** measure `TARGET_SEEN` (rank by uncertainty, not by height); phase the
session; dump the lost titles and look at them.

**Theirs:** partition the catalog into thousands of small regions ("mines"),
preferably from the co-watch graph. Rich vein → dig deeper. 0 of 6 → cool it
down, move on. Card value is not *P(you watched it)* but *P(watched) + how much
a yes would reveal next* — a non-myopic policy that looks two or three moves
ahead. And when a rich vein is found, **open a Burst grid of 12–20 posters**
instead of one card.

**Why theirs wins.** My `TARGET_SEEN` is a myopic uncertainty heuristic — it
picks the single most uncertain *card*. Theirs makes the unit of reasoning the
*region*, which is what a person's watching history actually looks like. And the
Burst is the better idea in the whole document: I had already measured the grid
at **2,490 titles/hour against the deck's 1,121** and never once thought to fire
it *conditionally*, at the moment the engine detects it has struck a vein. The
data to justify it was in my own repository.

**What I keep:** run the lost-title dump **first**, before building any of it.
One day, and it tells us whether the lost 54% cluster into regions at all. If
they do not, the mine model is the wrong shape and we would have found out after
two weeks instead of one day.

**A cost correction in our favour:** `public/communities.json` already exists —
**100 communities computed from 32M MovieLens ratings**, with sizes and an index,
via `scripts/communities.py`. It clusters *people*, not titles, so it is not
directly the partition they describe, but the clustering pipeline, the data and
the code are already here. Their estimate of this work is too high.

## 2 — The 54% never shown · **THEIRS, entirely**

**Mine:** treat as part of problem 1; add quota slots if the lost set looks
systematically different.

**Theirs:** **exposure debt.** Every time a title is eligible and not shown,
`debt + 1`. Debt lifts priority slightly. Reserve 1 card in 5–10 for the highest
accumulated debt — but only among titles already over a decent watch-probability
threshold. New metric: **eligible-but-never-shown rate**, driven toward zero.

**Why theirs wins.** Mine was a deferral, and a weak one. Theirs is a precise,
cheap, separately-testable mechanism — it is aging from CPU schedulers, and the
analogy is exact: a good candidate must not starve because other candidates keep
edging past it. Their two rejections are also correct: a random slot fixes
starvation by showing garbage, and enlarging the finalist pool does not help
because the re-rank can keep punishing the same items at any pool size. This is
an **exposure guarantee**, not a retrieval problem.

**The metric is the part I most regret missing.** I have been measuring "lost at
ranking" as an aggregate for a month without ever instrumenting *which* titles.

## 3 — Fast ↑ on watched titles · **THEIRS**, plus retroactive repair

**Mine:** make ↑ harder (hold, or a longer throw); warn at high speed; a periodic
review pass.

**Theirs:** do not fight the human — make the system tolerant. A first ↑ means
*"said not seen, confidence X"*, where X comes from dwell time, gesture speed,
whether the poster had even finished loading, and how far the answer contradicts
the model. Low confidence → **uncertain-not-seen**: drop it from this session,
but do not train hard on it and do not treat it as final. Days later, put ten of
the doubtful ones in a **Quick check** grid. And the hard rule: **a "not seen"
must never erase an existing "seen".**

**Why theirs wins.** I flagged in my own sealed file that making a gesture harder
is usually the wrong instinct, and that is exactly where they went the other way.
Mine taxes every user to correct a minority error. Theirs keeps the speed — which
is the product's main advantage — and repairs the record afterwards. Their
framing as a **false-negative problem** rather than a user-discipline problem is
correct and is standard practice in this field.

**Convergent:** my "review pass" and their "Quick check" are the same mechanism.

**What I add:** apply the never-erase rule **retroactively**. We already know
from `YOUR-TASKS.md` that the old 👁 bug overwrote real answers — nine presses,
three recorded. A one-time repair pass over existing libraries should run when
this ships. They could not know this; it is in our history.

## 4 — Feel / vibe · **THEIRS' method, MY sequencing**

**Mine:** write mood-and-craft text, embed it, use the existing `souls` hook. And
separately: scale the already-proven model-written edges.

**Theirs:** **Vibe DNA** — explicit named dimensions (pace, dialogue density,
light vs oppressive, intimate vs epic, warm vs cold, humour type, tension,
violence style, visual energy, practical vs polished vs gritty, character- vs
event-driven, ending type, how much concentration it demands). Sourced from
metadata, short critical description, trailer audio, trailer visuals and dialogue
statistics where licensing allows. Then — the key move — **do not cosine it.**
Build a **Vibe Graph**: per title, the 30–50 works closest *in experience*, using
a strong model offline as a **pairwise judge**: *"Mad Max — is John Wick or Rebel
Moon closer in experience?"* Precomputed; the app makes no API calls.

**Why their method wins.** Pairwise comparison is strictly better than absolute
embedding here, and my own failed experiment proves why: the embedding scored
*Mad Max ↔ Rebel Moon* at 0.359 and *Mad Max ↔ John Wick* at 0.307, because their
plots really are alike. A forced comparison on tone and craft cannot make that
error — it has to choose. That is a better instrument for exactly the failure I
measured.

**Why my sequencing stands.** They did not know that **the cheap version already
passed external validation.** Model-written edges for 115 titles scored **16.4%
overlap with TMDB co-watch against 0.15% for random — 107× chance** — with a
pre-registered abort at >60%, and **84% of the picks were information TMDB does
not have.** It has never been scaled to the other 48,438. That costs **~$3**.

So: **ship the proven edges first**, then build Vibe DNA on the evidence. A $3
proof before a $50–80 build.

**Staging note:** trailer audio/video and subtitle statistics are a large lift
with licensing questions — they flagged this themselves. Text-based Vibe DNA plus
pairwise judging gets most of the value first.

## 5 — 75.8 seconds to first card · **THEIRS**

**Mine:** move the catalog behind the server, or stream it in fame order.

**Theirs:** the browser must never download the catalog, full stop. Standard
retrieval shape: corpus → candidate generation → scoring → re-ranking, with the
corpus on the server. Phone holds UI + library + 100–300 ready cards. **Plus a
~20-card starter pack shipped inside the app so the first card renders instantly
while the server is still being asked.**

**Why theirs wins.** The core is my option 1. The **starter pack is the part I
missed**, and it is what converts "faster" into "instant": the order becomes
UI → card → data, instead of 13.8 MB → decode → index → worker → card. On a bad
connection that is the entire difference.

**Their two rejections are right:** compressing the JSON defers the problem to
100,000 titles, and lazy-loading ten files still ships data the user will never
use 99% of.

## 6 — Cold start 30–50s · **THEIRS**

**Mine:** pay Render Starter, $7/month. No engineering fix; keep-alive pinging
abuses the free tier.

**Theirs:** either pay, **or split the frontend off entirely** — a static PWA on
a CDN, which has no server to wake, with only a small API on an edge function or
an always-on service.

**Why theirs wins.** It is architecturally consistent with 5 and 16, and strictly
better than paying to keep a Next.js process warm: opening the site stops
depending on a process being alive anywhere. We agree that keep-alive pinging is
a hack that hides the problem.

**Migration cost they could not see:** the app currently runs `next start` and
has three server-side routes — `/api/recommend`, `/l/[slug]`, `/u/[slug]`. Going
static means relocating those. It is proven possible: `.github/workflows/pages.yml`
already builds a static export today, by deleting exactly those three
directories. So the shape is known; the work is real but bounded.

## 7 — First tap lost · **THEIRS**

**Mine:** visibly disable the buttons until ready. Low priority.

**Theirs:** **Early Action Buffer** — a tiny script captures the three inputs
before React and the engine are ready, records the verdict immediately, gives
instant visual and haptic feedback, and the engine drains the queue when it
starts. Rule: *if you can render a clickable button, you must be able to record
the click; if you cannot, do not render it.*

**Why theirs wins.** Mine makes the app *feel* slower to fix a rare fault.
Theirs makes it feel instant, and the stated rule is a good general principle
worth adopting across the app. The user does not care whether the ranking engine
is ready — they gave us information and we can store it now and process it later.

## 8 — Arabic and RTL · **THEIRS**

**Mine:** wire `LocaleProvider` to a real locale, replace hard-coded strings,
`dir="rtl"`, audit layouts. I raised but did not answer: *in RTL, does swiping
right still mean liked?*

**Theirs:** same foundation, plus — detect from the phone's language on first
visit with an always-visible switch; `lang="ar"` + `dir="rtl"` at page level;
logical `start`/`end` instead of hard-coded left/right; **do not flip the
gesture — right stays ❤️**, because interaction is independent of text direction
and changing language must not retrain the user's muscle memory; and `dir="auto"`
on titles so mixed Arabic/Latin names do not break punctuation and digits.

**Why theirs wins: they answered the exact question I left open**, and the
reasoning is right. `dir="auto"` on titles is a real bug I would have hit later —
this catalog is 39 languages and a list mixing `الفيل الأزرق` with
*The Big Lebowski* is the normal case, not the edge case.

## 9 — Two names · **THEIRS**

**Mine:** pick one, sweep four `metadata` blocks + manifest + README + legal.
30 minutes. Recommend Dhawq.

**Theirs:** kill Seenit. One branding source of truth, from which page title,
manifest, icon name, OAuth screen, emails, share pages, social previews and PWA
all derive. **And: an active iPhone app already exists called "SeenIt – Movies &
TV Tracker", in this exact category.**

**Why theirs wins.** The existing-app fact is decisive and I did not have it.
Even setting trademark aside, building a brand on a crowded name in the same
category is a bad trade. And a single source of truth prevents the drift from
recurring, which my file-by-file sweep does not.

*Not independently verified from here — but it does not change the decision; ذَوق
was the recommendation either way.*

## 10 — No domain · **THEIRS**

**Mine:** ~$15/year, buy at the moment of sharing, not before.

**Theirs:** buy immediately after settling the name, before adding users.
`dhawq.xxx` for the app, `auth.dhawq.xxx` for Supabase Auth; old address becomes
a redirect. Registrar at cost.

**Why theirs wins on timing.** My "wait" was reasonable when the only benefit
was vanity — but problems 11, 12 and 13 all touch it, share links get bookmarked,
and changing a domain *after* people have saved links is far worse than buying
early. At $15 the option is worth more than the money.

## 11 — No account deletion · **THEIRS**

**Mine:** Settings → delete → confirm → remove Supabase rows, clear local. Half
a day. A publishing blocker.

**Theirs:** same, plus offer **Export first**, plus: it must be **server-side**,
because `admin.deleteUser` requires the `service_role` key, which must never
reach the browser. And no soft-delete presented as deletion.

**Why theirs wins.** The `service_role` constraint is the detail that matters and
it changes the estimate: this needs a small server endpoint (an Edge Function),
not just a settings button. My "half a day" was wrong because I had not named it.

## 12 — Google shows Supabase · **THEIRS**, staged

**Mine:** needs a domain + Supabase custom domain, $10/month. Do not pay yet.

**Theirs:** do both properly — Google brand verification **and** Supabase custom
auth domain. Do not roll your own OAuth to hide a branding problem.

**Why theirs wins:** they include **Google brand verification, which is free**
and which I omitted entirely — that is the half that can be done immediately.
The $10/month custom domain is the paid half and it only matters at launch, so it
stages behind problem 10.

## 13 — Hidden backup · **THEIRS**

**Mine:** move export/import from `/lab` into Settings.

**Theirs:** promote it from a developer tool to a **trust feature** in the
profile — *"Your library is safe · Cloud: synced 20 seconds ago · Export a copy"*
— in two formats: **CSV** (portable, opens in Excel, moves to another product)
and **full JSON** (restores the account literally). Plus a single, well-timed
prompt the first time a guest reaches 100 titles.

**Why theirs wins.** The two-format split is right and I had one format. The live
sync line converts a hidden tool into visible reassurance, which is the actual
job. And "once, at 100 titles" is better judged than either nagging or silence.

## 14 — Browser-only storage · **THEIRS, and this is the biggest idea in the document**

**Mine:** warn the user; offer the account as the answer.

**Theirs:** **local-first + cloud-mirrored + event log.** Every swipe becomes an
append-only event (`film X, liked, device A, time Y, event id Z`). Never
overwrite history. Store in **IndexedDB**, not localStorage. Upload events when
online; rebuild current state from events. Two devices that both went offline
merge their events instead of one winning. Plus `navigator.storage.persist()`
where supported — while being honest that it is not a backup.

**Why theirs wins, by a distance.** Mine was a warning label on a design flaw.
Theirs removes the flaw. Three things fall out for free:

- It fixes the merge half of problem 18 — no "which database is right?"
- IndexedDB lifts the 5–10 MB localStorage ceiling that forced the v5 migration
  to slim every stored title snapshot.
- An event log gives history and undo for nothing.

**The risk I must add:** this is the largest single change on the list and it
touches the store every screen reads. It must go behind the existing `migrate()`
path, which already replays a whole history through a new model — that mechanism
exists and has been used before, and it is what makes this safe.

## 15 — White screen on error · **THEIRS**

**Mine:** add `error.tsx` and `global-error.tsx`, plain message, reload button.
Two hours; best value per hour on the list.

**Theirs:** three layers — per-section boundaries, a global catch-all, and — the
good part — **if the UI breaks after it was working, do not wipe it.** Keep the
last good render and overlay a bar: *something broke, your data is safe ·
Retry · Home · Export*. Plus a short error ID (`DQ-7H2K`) reported with the
build version, without shipping the user's library.

**Why theirs wins.** Preserving the last good UI is better and Next.js supports
it. The error ID plus commit version is the difference between a user saying "it
broke" and us knowing where. We agree on the core point: **silence is the worst
possible error UI.**

## 16 — No offline · **THEIRS**

**Mine:** a service worker caching the app shell and the catalog. ~1 day.

**Theirs:** a **personal Offline Pack** — app shell, the full library, settings,
last recommendations, and 500–1,000 *personally suitable* upcoming cards,
prefetched on Wi-Fi. Answers queue offline and sync on reconnect.

**Why theirs wins.** Mine would cache the 25 MB catalog — the very thing problem 5
removes from the browser. Caching a personal slice is consistent with the new
architecture instead of fighting it.

## 17 — Icons · **THEIRS** (near-convergent)

**Mine:** PNG 192 / 512 / 180 + `apple-touch-icon`. One hour.

**Theirs:** the same, plus a **maskable** 512, no transparency, safe margins, and
a favicon.

**Why theirs wins:** maskable and the transparency warning are real and I missed
both. Otherwise the same answer.

## 18 — Sync untested · **THEIRS — AND THEY FOUND A LIVE BUG**

**Mine:** a human with two devices, 30 minutes.

**Theirs:** an automated two-browser test in CI. Browser A signs in, 50 swipes,
makes a list. Browser B, same account, must see **the same 50, title by title,
action by action** — not "does a taste vector exist". Then: B edits 5, A goes
offline and edits 3, A reconnects, both must converge. Then logout/login, refresh,
cleared storage, network cut mid-sync, same title edited on both devices.

**They suspected the sign-in path restores the taste profile but not the library.
I checked. They are right, and it is worse than they said.**

```
useAccount.ts:106   const cloud = await loadCloudProfile(userId)
useAccount.ts:110   useDhawq.setState({ profile: cloud })      ← profile ONLY
sync.ts:202-220     loadCloudProfile reads ONLY the user_taste table
```

Upload is complete (`titles`, `swipes`, `user_taste`, `lists`, `list_items`).
**Download is only `user_taste`.** The path is asymmetric. So on a second device:

1. Sign in. `loadCloudProfile` returns a profile with `totalSwipes = 1100`.
2. It is adopted. But `swipes = {}` and `swipeOrder = []` — never fetched.
3. **The library screen is empty** while the profile claims 1,100 swipes.
4. Worse: `useDeck`'s `answeredIds()` is `new Set(Object.keys(swipes))` — empty.
   **The deck re-deals every title the person already answered.**

Problem 18 is therefore not "untested". It is **broken**, and cross-device sync
has never worked. Found by reading, by someone who had the problem list and not
the codebase. That is the most valuable single line in their entire answer.

## 19 — The ruler cannot see television · **THEIRS as the fix, MINE as the stopgap**

**Mine:** print the caveat in the tool's own output. No fix exists; the data does
not exist.

**Theirs:** stop calling MovieLens a benchmark — it is a *movie* benchmark. Build
a real one from volunteers importing genuine history via the **Trakt API**, which
covers shows and episodes. Recruit ~30–50 people *chosen deliberately*:
English-heavy, Arabic-heavy, Turkish, Indian, movie-heavy, TV-heavy, casual, film
nerd. Then never report one number — report recall by segment: movies, TV,
Arabic, Turkish, Hindi, long tail, first 100, 100–500, 500–1500.

**Why theirs wins.** Mine accepted the blindness; theirs replaces the instrument.
And the argument is right for *this* product: 30 deliberately diverse real
libraries are worth more than 200,000 MovieLens users with no television.

**Both, not either:** recruiting takes weeks and needs consent handling. The
caveat costs an hour and stops a wrong number being quoted tomorrow.

## 20 — The honest sample is stale · **THEIRS as the fix, MINE as the bootstrap**

**Mine:** redo `/calibrate`. 200 titles, 15 minutes.

**Theirs:** **Sentinel cards.** One card in every 30–50 is not chosen by the
ranker — it is drawn by independent stratified sampling across type, language,
popularity band and era, with the selection probability recorded. The answer is
ordinary; the measurement is not used to grade the algorithm that did not pick
it. After weeks this yields thousands of unbiased labels with no calibration
session at all. Every measurement stamped with catalog version, algorithm version
and date.

**Why theirs wins.** Mine fixes the number once and it goes stale again the next
time the catalog changes — which is exactly how we got here. Theirs makes the
problem structurally unable to recur, and it is the standard answer to exposure
bias: today we only know the user's answer to things our own system chose to
show, so the system can prove itself right.

**Both:** sentinels accumulate over weeks and we need a valid baseline sooner.
One 15-minute run gives it immediately.

## 21 — "Everything" unverified · **THEIRS**

**Mine:** swipe 60 cards and report what appeared. 10 minutes.

**Theirs:** convert the setting from a claim into a **testable contract**. Assert
`eligible candidates == catalog − excluded`. Keep fixed **canary titles** — a very
deep Arabic work, Turkish, Indian, Japanese, a deep TV entry, something past rank
40,000 — which must be *outside* the gate on narrow and *eligible* on Everything.
And distinguish **reachability from recommendation**: a canary need not appear in
the top 10, but the engine must prove it reached scoring. Show the true count in
the UI, computed from the catalog rather than typed into it.

**Why theirs wins.** Mine is an anecdote that expires; theirs is a permanent
assertion. And the reachability/recommendation distinction is one I had been
conflating in my own reasoning about the gate.

**Keep mine as a sanity check** — a human eye still catches what assertions do not.

## 22 — `/lab` public with a reset button · **THEIRS**

**Mine:** move the useful parts into Settings, delete the page.

**Theirs:** do not ship it to production at all — 404 there, alive on a staging
deployment behind a developer gate. If users ever need diagnostics, build a small
read-only page; never ship destructive tools alongside it.

**Why theirs wins.** Mine destroys a genuinely useful instrument to fix an
exposure problem. Theirs keeps it where it is useful and removes it where it is
dangerous. "A secret URL is not security" is correct, and so is the point that a
confirmation dialog protects against a misclick — it does not explain why a full
development tool is published to the world.

## 23 — Stale documents · **THEIRS**

**Mine:** move them to `docs/archive/` with a dated header.

**Theirs:** never mix three kinds of information. **Facts** (48,553, the name, the
branch, the deployment). **Decisions** (why co-watch, why IndexedDB). **Experiments**
(on commit X against catalog Y we measured 88.0). So: `CURRENT.md` for present
truth, `docs/decisions/`, `docs/experiments/` — each stamped with date, commit SHA
and catalog SHA — and `docs/archive/` under a loud banner. **And anything a
computer can know is generated, not typed**: catalog count, name, version, routes,
commit.

> **Facts are generated. Decisions are written. Experiments are versioned.**

**Why theirs wins.** Mine prevents the symptom once. Theirs prevents recurrence
permanently — and this exact failure has already bitten this project twice
(15,083 vs 48,553, and a calibration sample nobody noticed had expired).
Generation is the only durable fix.

---

# PART 2 — THE SCORECARD

| # | Problem | Winner |
|---|---|---|
| 1 | The collapse | **Theirs** + my diagnostic first |
| 2 | 54% never shown | **Theirs**, entirely |
| 3 | Fast ↑ | **Theirs** + my retroactive repair |
| 4 | Feel / vibe | **Their method, my sequencing** |
| 5 | 75.8s load | **Theirs** |
| 6 | Cold start | **Theirs** |
| 7 | First tap lost | **Theirs** |
| 8 | Arabic / RTL | **Theirs** |
| 9 | Two names | **Theirs** |
| 10 | No domain | **Theirs** (timing) |
| 11 | Account deletion | **Theirs** (server-side constraint) |
| 12 | OAuth branding | **Theirs**, staged |
| 13 | Hidden backup | **Theirs** |
| 14 | Browser-only storage | **Theirs** — biggest idea in the document |
| 15 | White screen | **Theirs** |
| 16 | Offline | **Theirs** |
| 17 | Icons | **Theirs** (near-convergent) |
| 18 | Sync | **Theirs** — and they found a real bug |
| 19 | TV blindness | **Theirs** as fix, mine as stopgap |
| 20 | Stale sample | **Theirs** as fix, mine as bootstrap |
| 21 | "Everything" | **Theirs** + my sanity check |
| 22 | `/lab` | **Theirs** |
| 23 | Stale docs | **Theirs** |

**What mine contributed:** de-risking and order. Run the cheap diagnostic before
building the mine model (1). Ship the $3 proven edges before the $80 vibe build
(4). Repair the historical data, not just future data (3). Bootstrap the
calibration while sentinels accumulate (20, 19). Keep a human check beside the
assertion (21). And the migration costs and money they could not see from
outside.

**What I got wrong, plainly:** I was tuning a ranker for a search problem. Four
failed reweighting attempts were the evidence and I read them as "the collapse is
partly inherent" — which I had flagged in my own sealed file as possibly "an
excuse, convenient for me". It was.

---

# PART 3 — THINGS TO DECIDE BEFORE STARTING

## 3.1 Money

Today the project costs **$0/month**. Their architecture implies:

| Item | Cost |
|---|---|
| Domain | ~$15/year |
| Supabase paid plan (custom domains require one) | ~$25/month |
| Supabase custom domain add-on | ~$10/month |
| Always-on API or edge functions | $0–7/month |
| Vibe DNA generation (one-off) | ~$50–80 |
| Model-written edges (one-off) | **~$3** |

**Roughly $35/month plus ~$100 one-off.** Not large, but it is a conscious move
from free to paid and it should be a decision, not a side effect. Several items
can be deferred to the moment of launch — marked ⏸ below.

## 3.2 Scope

Their answer is explicitly a **re-architecture, not 23 patches** — they say so.
That is the right call and it is also the main risk: done all at once, everything
breaks at once. The plan below stages it so the site is working and deployable at
the end of every phase, with `v2-before-rebuild` as the rollback point.

## 3.3 The one thing that is not optional

**Problem 18 is a live bug.** Cross-device sync silently does not work and the
deck re-deals everything on a second device. Whatever else is agreed, that is
fixed early.

---

# PART 4 — THE PLAN

Rollback point: branch **`v2-before-rebuild`**, commit `efe5b12`, plus the full
zip sent to the owner on 18 Sep 2026.

Every phase ends with the site deployable. Nothing is merged without
`simulate 13/13` and `deck-guard 7/7`.

## PHASE A — Safety net and honest numbers · ~3 days

*Nothing here changes behaviour. It makes every later change measurable and every
later failure visible.*

| | Work | From |
|---|---|---|
| A1 | Error layers: per-section boundaries, global catch-all, keep the last good UI, error ID + build version | 15 · theirs |
| A2 | **Instrument the lost 54%** — record eligible-but-never-shown per title, dump the set | 1–2 · mine |
| A3 | Sentinel cards: 1 in 40, stratified, probability recorded, never used to grade the picker | 20 · theirs |
| A4 | Version-stamp every measurement (catalog SHA + algorithm version + date) | 20, 23 · theirs |
| A5 | `CURRENT.md` **generated**; `docs/decisions/`, `docs/experiments/`, `docs/archive/` with banners | 23 · theirs |
| A6 | TV-blindness caveat printed inside `harvest.ts`'s own output | 19 · mine |
| A7 | Canary assertions for reach; real eligible count shown in the UI | 21 · theirs |

**Owner, in parallel (~40 min):** one `/calibrate` run on the current catalog;
60 cards on "Everything" and a report.

**Gate:** A2 tells us whether the lost titles cluster into regions. **This decides
whether Phase D is built as designed.**

## PHASE B — Publishable · ~4 days

*Everything that must be true before a stranger uses this.*

| | Work | From |
|---|---|---|
| B1 | **Fix cross-device sync** — download swipes, swipeOrder and lists, not just the taste row | 18 · confirmed bug |
| B2 | Two-browser automated test in CI, asserting library equality title-by-title | 18 · theirs |
| B3 | Account deletion, server-side via an Edge Function; export offered first | 11 · theirs |
| B4 | Backup as a trust feature: CSV + full JSON, live sync status, one prompt at 100 titles | 13 · theirs |
| B5 | One name — ذَوق / Dhawq — from a single branding source | 9 · theirs |
| B6 | Icons: 192, 512, maskable 512, apple-touch, favicon; no transparency | 17 · theirs |
| B7 | `/lab` 404 in production, alive on staging behind a gate | 22 · theirs |
| B8 | Domain bought and pointed; old address redirects | 10 · theirs |
| B9 | Google brand verification (free half) | 12 · theirs |
| B9⏸ | Supabase custom auth domain (paid half) — at launch | 12 |

## PHASE C — Arabic · ~3 days

| | Work | From |
|---|---|---|
| C1 | `LocaleProvider` on a real locale; detect from device; always-visible switch | 8 |
| C2 | Replace hard-coded strings across ~30 screens; deck, settings, library first | 8 · mine |
| C3 | `lang="ar"` + `dir="rtl"`; logical `start`/`end` throughout | 8 · theirs |
| C4 | **Gesture unchanged — right stays ❤️ in Arabic** | 8 · theirs |
| C5 | `dir="auto"` on every title string | 8 · theirs |
| C6 | Add the missing `lists.emptyTitle` key | 8 · mine |

## PHASE D — The engine · ~2 weeks · *gated on A2*

| | Work | From |
|---|---|---|
| D1 | **Exposure debt + reserved slots**, driving eligible-but-never-shown toward zero | 2 · theirs |
| D2 | Region partition from the co-watch graph — reusing `communities.py` | 1 · theirs |
| D3 | Active-search policy: rich vein → dig; empty → cool down; value = P(seen) + what a yes reveals | 1 · theirs |
| D4 | **Burst grid** — 12–20 posters fired when a rich vein is struck | 1 · theirs |
| D5 | `not_seen` becomes **confidence-weighted**; dwell time, gesture speed, poster loaded, model contradiction | 3 · theirs |
| D6 | **A "not seen" may never erase a "seen"** — plus a one-time repair of existing libraries | 3 · theirs + mine |
| D7 | Quick check: 10 doubtful titles, one tap each | 3 · both |
| D8 | Model-written edges scaled to 48,553 — **~$3, validate before shipping** | 4 · mine |

## PHASE E — Architecture · ~2 weeks

| | Work | From |
|---|---|---|
| E1 | **Event log + IndexedDB**, behind the existing `migrate()` path | 14 · theirs |
| E2 | Event-merge sync; two offline devices converge | 14, 18 · theirs |
| E3 | Catalog out of the browser; candidate generation server-side | 5 · theirs |
| E4 | **~20-card starter pack in the app** — first card before any network | 5 · theirs |
| E5 | Static PWA frontend on a CDN; API on edge/always-on; no cold start | 6 · theirs |
| E6 | Personal Offline Pack: shell + library + 500–1,000 personal cards | 16 · theirs |
| E7 | Early Action Buffer — a click is always recorded | 7 · theirs |

## PHASE F — The taste half · ~2 weeks + cost

| | Work | From |
|---|---|---|
| F1 | Vibe DNA dimensions, text sources first | 4 · theirs |
| F2 | **Vibe Graph via pairwise judging**, precomputed offline | 4 · theirs |
| F3 | Validate against the held-out sets before shipping | 4 · both |
| F4⏸ | Trailer audio/visual, dialogue statistics — licensing permitting | 4 · theirs |

## PHASE G — The real benchmark · ongoing

| | Work | From |
|---|---|---|
| G1 | Trakt-based import for volunteers | 19 · theirs |
| G2 | 30–50 deliberately diverse libraries, with consent | 19 · theirs |
| G3 | Segmented reporting — never one number again | 19 · theirs |

---

# PART 5 — THE ORDER, AND WHY

```
A  safety net + honest numbers        3 days    ← nothing breaks; everything becomes visible
B  publishable                        4 days    ← includes the live sync bug
C  Arabic                             3 days    ← the product stops excluding its own audience
─────────────────────────────────── a real, shippable product ───────
D  engine (active search)             2 weeks   ← the collapse
E  architecture (events, PWA, server) 2 weeks   ← speed and durability
F  vibe graph                         2 weeks   ← the taste half
G  real benchmark                     ongoing
```

**Why A first.** Every later phase is judged by measurements this project
currently cannot trust. A2 in particular decides the shape of D — and it costs
one day against two weeks of building the wrong model.

**Why B before D.** Sync is broken today, for anyone who signs in. A person who
loses a library does not wait for the engine to improve.

**Why C before D.** An Arabic speaker opening an English site has already
decided about this product before the ranking ever gets a turn.

**Why D before E.** D is the reason the project exists. E makes it fast and
durable, which matters most once it is worth waiting for.

**After C, the site is genuinely publishable.** Everything from D onward makes it
good rather than shippable. That is the natural place to stop and reassess.
