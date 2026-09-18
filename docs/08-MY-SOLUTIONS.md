# FILE 8 — MY PROPOSED SOLUTIONS (held back for comparison)

**Status: sealed until the outside answers arrive.**

The owner is sending the numbered problem list (`09-THE-PROBLEMS.md`) to several
people, without causes and without solutions, so their thinking is not anchored
by mine. This file is my answer to each one, written **before** seeing theirs, so
the comparison is honest.

**Numbers here match `09-THE-PROBLEMS.md` exactly.** Do not renumber either file.

Written 18 September 2026.

---

# GROUP A — THE SWIPING EXPERIENCE

## Problem 1 — The collapse

*First 50 cards: ~40 land. Last 50: ~2. Measured recognition per 100 cards across
one real 1,100-card session: 70 · 58 · 49 · 37 · 32 · 29 · 13 · 18 · 15 · 17 · 8.*

**My solution, in order of confidence:**

**1a. Change the question, not the weights.** Every improvement to date came from
changing what is asked (grid, import, frontier); four attempts at reweighting all
failed. So: measure `TARGET_SEEN` first. The deck currently maximises *"you
probably watched this"*, which at card 900 means confirming what it already
knows. The information-optimal card is the one it is **least sure** about.
`TARGET_SEEN=0.5` is built and has never been run. Sweep 0.3–0.6 on `harvest.ts`.

**1b. Stop treating a session as one phase.** The deck should behave differently
at card 50 and card 900 — narrow and confirming early, uncertain and probing
late. Right now the only thing that changes with time is pool size, which grows
*monotonically*. A late session probably needs a **different objective**, not a
bigger pool.

**1c. Look at the lost titles themselves.** Nobody has ever done this. Instrument
which titles are in the pool and never dealt, dump the set, and look for what
they share. Every attempt so far changed a number and re-read an average.

**Confidence: 1c is the one I would bet on.** It is the only unexplored direction
and it is cheap.

## Problem 2 — Half the library is in the system and never shown

*~54% of a person's titles are candidates and are never dealt.*

**My solution:** this is the same phenomenon as Problem 1 seen from the other
side, and I would not attack it separately — 1c covers it. If the dump shows the
lost titles are systematically *different* (older, foreign, series), the fix is a
quota inside the batch: reserve N of every 10 cards for under-represented slices.
If they are indistinguishable from the shown ones, the problem is ordering noise
and the honest answer is to lean on the grid and the import instead.

## Problem 3 — Fast swiping records "never seen" on things you did watch

*Measured: 92.3% agreement between careful grid answers and fast swipes, and the
error is one-sided — ~19% of watched titles get marked unseen, against 3.5% the
other way.*

**My solution:**
- **Make ↑ harder than ❤️ and 👎.** It is currently the easiest gesture and the
  most damaging answer. Swap it: a small hold, or a shorter throw distance for
  the verdicts and a longer one for "never seen".
- **A speed warning.** At >40 cards/minute, show a quiet line: *"going fast —
  ↑ removes a film from your library."*
- **A review pass.** Periodically re-show a handful of ↑'d titles the engine
  thinks you probably did watch. Cheap, and it repairs history rather than just
  preventing new errors.
- The single largest available gain here is behavioural, not code: the owner
  slowing down was worth ~7.5 percentage points on his own session.

## Problem 4 — The site cannot tell what two things *feel* like

**My solution:** text written to describe **mood and craft**, then embedded. This
is the one untried lever and the diagnosis is precise: embeddings over plot
summaries failed twice because *Mad Max ↔ Rebel Moon* (0.359) beats *Mad Max ↔
John Wick* (0.307) — their plots really are alike, and no plot summary mentions
pace, tone or craft. The `souls` hook in `recommend.ts` is already wired.
Generate 2–3 sentences per title about *how it feels to watch*, not what happens.
~$30–80 for the catalog via Batch API; validate on the 115-title set first.

**Related and already proven:** model-written recommendation edges. 115 titles
scored **16.4% overlap with TMDB co-watch against 0.15% for random — 107×
chance** — with an agreed abort condition of >60%. Never scaled. ~$3. **This
should ship before anything else on this list.**

---

# GROUP B — SPEED

## Problem 5 — 75.8 seconds to open on a slow connection

**My solution, recommended first:**
1. **Move the catalog behind the server.** `/api/recommend` and the pgvector
   schema already exist; this is why Render exists. ~2 days. Removes the ceiling
   permanently and unblocks 100,000 titles.
2. **Or stream in fame order** — ship 5,000, start the deck, fetch the rest in
   the background. ~1 day, keeps everything local, no server dependency.

**Do not** split into a ranking set + a search set. Built, worked, rejected,
reverted — a title that can only be searched for is one the app never suggests.

## Problem 6 — The first visitor waits 30–50 seconds

**My solution:** Render Starter, $7/month. There is no engineering fix; free
instances sleep by design. A keep-alive ping is against the terms and is the kind
of thing that gets an account suspended. Until it is paid for, the honest move is
to say so on the loading screen.

## Problem 7 — The first tap after opening is sometimes ignored

**My solution:** low priority. ~0.4s of framework startup. The only real fix is
dropping framer-motion for CSS animations across the whole app — a large, risky
rewrite of animations that took a week to get right. **Not worth it yet.**
Interim: disable the buttons visibly until ready, so a tap is never silently
swallowed.

---

# GROUP C — LANGUAGE AND IDENTITY

## Problem 8 — The whole site is in English only

*Verified on the live site: `<html lang="en" dir="ltr">`, zero Arabic characters
on the homepage. `ar.json` exists with 76 translations and is loaded by nothing —
`LocaleProvider` is hard-coded to `locale="en"`. No screen calls `useTranslations`
at all. The README promises "عربي + إنجليزي مع دعم RTL كامل".*

**My solution — and I rank this the single most important non-engine item.**

The product is named ذَوق. The catalog was rebuilt specifically so Arabic,
Turkish and Indian titles could appear. The owner is an Arabic speaker. And an
Arabic user arrives at an English, left-to-right interface.

1. Wire `LocaleProvider` to a real locale (browser preference + a stored setting).
2. Replace hard-coded strings with translation keys, screen by screen. ~30 files.
   The deck, settings and library first — that is where the time is spent.
3. Set `dir="rtl"` for Arabic and audit every layout that assumes left-to-right —
   the swipe directions especially. **In RTL, does swiping right still mean
   "liked"?** This needs a decision, not a default.
4. Add the one missing key (`lists.emptyTitle`).

**Estimate: 2–3 days.** It is not hard, it is broad.

## Problem 9 — The app calls itself two different names

*Browser tab says "Seenit" on 4 pages. The phone home-screen name says "Seenit".
Everything else says Dhawq / ذَوق. The address says dhawq.*

**My solution:** pick one and do a single sweep — `manifest.webmanifest`,
4 `metadata` blocks, README, `/legal`. 30 minutes. My recommendation is **ذَوق /
Dhawq**, because the address, the package, the Render service and the product
identity already agree; only leftovers say Seenit.

## Problem 10 — No real web address

**My solution:** ~$15/year for a domain. Worth buying **at the moment of sharing,
not before** — it also fixes Problem 12 and makes the name consistent. Buy
`dhawq.app` or similar; point Render at it.

---

# GROUP D — TRUST AND LEGAL, BEFORE PUBLISHING

## Problem 11 — You cannot delete your account

*Verified: no deletion path anywhere in the code.*

**My solution:** required before publishing anywhere with GDPR reach, which is
anywhere. Settings → Delete account → confirm → delete the Supabase rows and
clear local storage. Half a day. **This is a blocker, not a nice-to-have.**

## Problem 12 — Google sign-in shows a database company's address

**My solution:** needs a domain (~$15/yr) + Supabase custom domain ($10/month).
**Do not pay yet** — the owner is the only person who sees that screen. Buy both
together with Problem 10 at the moment of sharing.

## Problem 13 — There is no visible way to back up your library

*Export exists only on `/lab`, which is unlinked and meant to be deleted.*

**My solution:** move export/import out of `/lab` and into Settings, as
**"Back up my library"** and **"Restore from a backup"**. Half a day, and it also
satisfies the data-portability half of the same legal requirement as Problem 11.

## Problem 14 — Everything is stored in the browser, and nothing warns you

**My solution:** two parts, and the first is nearly free.
1. **Say so.** A line in Settings and on first run: *"your library lives on this
   device. Clearing your browser data erases it."*
2. **Offer the account as the answer**, once cross-device sync is actually tested
   (Problem 18).

---

# GROUP E — WHEN THINGS GO WRONG

## Problem 15 — A blank white page if anything breaks

*Verified: no `error.tsx`, no `global-error.tsx` anywhere.*

**My solution:** add `error.tsx` and `global-error.tsx` with a plain message and
a reload button. **Two hours, and it is the highest value-per-hour item on this
entire list.** Right now any unhandled error shows a white screen with no text
and no way out, and the user's library is still intact behind it — they just
cannot tell.

## Problem 16 — Nothing works without a connection

**My solution:** a service worker caching the app shell and the catalog. The
catalog is the expensive part and it changes rarely, so it is an unusually good
fit for caching. Also fixes part of Problem 5 for returning visitors. ~1 day.
**Do this after Problem 5 is decided**, since the answer changes what to cache.

## Problem 17 — The home-screen icon may not appear properly

*Verified: `manifest.webmanifest` lists one SVG icon. iOS does not use SVG for
home-screen icons.*

**My solution:** export PNGs at 192, 512 and 180 (Apple touch icon), add them to
the manifest, add `apple-touch-icon`. One hour.

---

# GROUP F — THINGS WE CANNOT CURRENTLY MEASURE

## Problem 18 — Sync between two devices has never been tested

**My solution:** it needs a human with two devices; no script can do it. Sign in,
swipe 10, open on a second device. If it fails, the profile screen now reports
the reason in plain words. **30 minutes of the owner's time, and it either clears
a feature or exposes a broken one.**

## Problem 19 — The main measuring tool cannot see any series

*MovieLens has no television. The catalog has 13,892 series — 29% of it.*

**My solution:** no fix exists; the data does not exist. So: **print the caveat
in the tool's own output**, so a harvest number can never be quoted without it.
Longer term, the only honest source of series data is the owner's own sessions
and `/calibrate`. One hour for the caveat.

## Problem 20 — The one honest sample we own is out of date

*Three `/calibrate` rounds were answered against 15,083 titles. The catalog is
now 48,553. Every figure derived from them is a share of the catalog — library
size, the fame curve, where the gate stops — so none of them describes anything
that exists.*

**My solution:** redo it. 200 titles, 15 minutes, and it is the only data in this
project that the engine did not choose. **Nothing that depends on those numbers
should be trusted until it is redone.**

## Problem 21 — Nobody knows whether the widest setting actually works

**My solution:** 60 cards at "Everything" and a report of what appeared and when.
Structurally unanswerable by any script here — every reference library is
American and English, so the measurement is blind to the exact case the setting
exists for. **10 minutes of the owner's time.**

---

# GROUP G — HOUSEKEEPING

## Problem 22 — A test page is live for everyone, with a reset button

**My solution:** `/lab` was always meant to be temporary. Move the useful parts
(the block counter, export/import) into Settings — export is needed there anyway
for Problem 13 — then delete the page. Half a day.

## Problem 23 — Old documents in the project describe a version that no longer exists

**My solution:** `YOUR-TASKS.md` and `REVIEW-REQUEST.md` describe a
12,826/15,083-title catalog and a gate that is the binding constraint. Both false
since 24 August. Move to `docs/archive/` with a dated header. 20 minutes.

---

# MY ORDER, IF I WERE CHOOSING ALONE

**Before publishing — non-negotiable**

| | Problem | Cost |
|---|---|---|
| 1 | **15** — error screen | 2 hours |
| 2 | **11** — account deletion | half a day |
| 3 | **13** — visible backup/export | half a day |
| 4 | **14** — warn that data is local | 1 hour |
| 5 | **9** — one name | 30 min |
| 6 | **17** — icons | 1 hour |
| 7 | **22** — remove `/lab` | half a day |

**Then the thing that changes who can use it**

| | Problem | Cost |
|---|---|---|
| 8 | **8** — Arabic + RTL | 2–3 days |

**Then the product**

| | Problem | Cost |
|---|---|---|
| 9 | **4b** — scale the proven edges | ~$3 + a day |
| 10 | **5** — the load | 1–2 days, needs a decision |
| 11 | **1c** — dump the lost titles | 1 day |
| 12 | **3** — make ↑ harder | 1 day |
| 13 | **4** — mood text | ~$50 + 2 days |

**Owner's own time, unblocks the rest: 20, 21, 18 — about an hour total.**

**Deliberately last:** 6 and 12 cost money monthly and only matter at the moment
of sharing. 7 and 16 are real but small. 19, 23 are hygiene.

---

# WHERE I EXPECT TO BE WRONG

Written down in advance, so the comparison is fair.

- **Problem 1.** I have four failed attempts behind me and I am now arguing for
  "change the question." An outsider with no sunk cost may see something simpler.
  This is the one where I most want to be contradicted.
- **Problem 3.** I am proposing to make a gesture *harder*, which is usually the
  wrong instinct in interface design. Someone may have a way to keep it easy and
  still correct the record.
- **Problem 8.** I have costed this as a translation job. If the answer is
  "launch Arabic-first and treat English as secondary", that is a different and
  possibly better product decision, not just a bigger task.
- **The collapse generally.** Two structurally unrelated algorithms produce the
  same decay curve. I read that as "partly inherent to the problem." That reading
  could be an excuse, and I am aware it is convenient for me.
