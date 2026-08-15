# What needs you

Everything else I can do alone. These are the things that need your hands, your
judgement, or an account only you own. Nothing here is urgent — the site works
today and none of it blocks me.

Ordered by how much it changes the outcome, not by effort.

---

## 1 · Try `/seen` and tell me if it should be the front door

**Where:** `dhawq.onrender.com/seen` — the new "Seen it?" tab at the bottom.

Thirty posters a screen. Tap what you have watched, ignore the rest, press
next. A tap means *watched*, nothing about liking — that stays the deck's job.

**Measured:** 3,656 titles an hour against the deck's 1,667. Two thousand
titles becomes seventeen minutes instead of thirty-seven.

**What I need from you, and only you can answer it:**

- Are thirty posters per screen comfortable, or too many to take in at once?
- Four across on a phone — right, or should they be bigger?
- **Should a brand-new account land here instead of on the swipe deck?**

That last one is the real question. The measurement says the grid is more than
twice as fast at learning what you have watched, and collects nothing at all
about what you *like*. So "grid first, then deck" is probably right — but that
is a judgement about what a person wants to see in their first thirty seconds,
and no ruler I have can settle it. It is yours.

---

## 2 · Swipe a session on the new catalog, and export it

**Where:** `/lab` → Reset everything → Erase → swipe as you always do → Export.

The catalog went from 5,555 titles to **12,826**. Arabic went from 2 titles to
331, Hindi from 6 to 500, Tamil from 0 to 387. Stand-up and talk shows are in.
Eight of the eleven titles you named are now present.

**What that session gives me that nothing else can:** your real answers on
titles that did not exist in the catalog before. My best ruler is built from
your 526 labels, and it has never been asked about an Arabic or Indian film,
because there weren't any to ask about.

**Do not read the first fifty cards as a verdict.** Two of your sessions
differed fivefold in the opening block on effectively identical code — that is
the random seed, and it nearly cost us a good change. What matters is the shape
across all 400.

---

## 3 · Run one SQL statement in Supabase

**Where:** Supabase → SQL Editor.

```sql
alter table public.user_taste
  add column if not exists seen_facets jsonb;
```

Already given to you once; noting it here in case it did not run. It stores
what the site learns about *what you watch* (as opposed to what you like), so
signing in on another device does not throw it away.

---

## 4 · Decide about the download size

The catalog is now **3.33 MB gzipped**, up from 1.78 MB. Every visitor
downloads it once.

On a good connection that is unnoticeable. On a slow phone it is two or three
extra seconds on the first visit. Ways to fix it exist — ship only the
languages a person uses, or load the tail after the first screen — but each
costs complexity, and I would rather know whether you consider it a problem
before spending that.

**Tell me:** does the site feel slow to open on your phone, on mobile data?

---

## 5 · Two questions at signup — your call on whether to ask

**Birth year, and country or language.** Two taps, once.

What someone has watched is dominated by what was showing when they were
roughly twelve to twenty-five, and where they were. The site currently knows
neither and has to infer both from scratch.

It matters more now than it did last week: with 27 languages in the catalog, a
brand-new account has no way of knowing whether to show you Egyptian films or
Korean ones until you have swiped enough to reveal it. Two questions would skip
that entirely.

**The tension:** it is two more taps before anyone sees a single poster, and
you have said the opening should be immediate. Your call.

---

## Not yours — mine, in progress

- Testing whether an LLM can predict *what a person has watched* (as opposed
  to what they'd like) for the Arabic and Indian cinema that now has no
  behavioural data at all. Costs a few dollars of API, no action from you.
- The exploration guard in `simulate` has been failing since before any of
  today's work, at 1.39x against a 1.15x limit. Recorded, not hidden. I still
  owe it a proper look.

---

## Things you already decided — no action needed

- Publishing to Render · storage · accounts — all live.
- MovieLens commercial licence — granted 2026-08-14.
- Amazon Reviews 2023 licence — asked, no reply yet. The only lead that covers
  television behaviourally.
