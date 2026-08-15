# What needs you

Everything I could do alone is done and pushed. These need your hands, your
judgement, or an account only you own. Nothing here is urgent — the site works
today.

Ordered by how much it changes the outcome.

---

## 1 · Try the new flow, and answer one question

**Where:** `dhawq.onrender.com/seen` — the "Seen it?" tab.

Thirty posters a screen. Tap what you have watched, ignore the rest, press
next. Then open the **Swipe** tab: it now asks *"did you like it?"* about
exactly the titles you just tapped, before anything else. Grid finds what you
watched, deck finds what you thought of it.

**Measured:** the grid harvests 3,656 titles an hour against the deck's 1,667.
Two thousand titles becomes seventeen minutes instead of thirty-seven.

**The question only you can answer:** should a brand-new account land on the
grid instead of the swipe deck?

The measurement says the grid is more than twice as fast at learning what you
have watched and collects nothing at all about what you like. So "grid first,
deck after" is probably right — but that is a judgement about what a person
wants in their first thirty seconds, and no ruler I have can settle it.

Also worth telling me: are thirty posters comfortable or overwhelming? Four
across on a phone — right size, or too small?

---

## 2 · Swipe a session on the new catalog and export it

**Where:** `/lab` → Reset everything → Erase → swipe as you always do →
Export.

The catalog went from 5,555 titles to **12,826**. Arabic 2 → 331, Hindi 6 →
500, Tamil 0 → 387. Stand-up and talk shows are in. Eight of the eleven titles
you named are now present.

**What that gives me and nothing else can:** your real answers on titles that
did not exist in the catalog before. My best ruler is built from your 526
labels and has never been asked about an Arabic or Indian film, because there
were none to ask about.

**Do not read the first fifty cards as a verdict.** Two of your sessions
differed fivefold in the opening block on effectively identical code. That is
the random seed, and it nearly cost us a good change.

---

## 3 · One SQL statement in Supabase

```sql
alter table public.user_taste
  add column if not exists seen_facets jsonb;
```

Stores what the site learns about *what you watch* (as distinct from what you
like), so signing in elsewhere does not throw it away. Given to you before;
repeated here in case it never ran.

---

## 4 · Does the site feel slow to open on mobile data?

The catalog is now **3.33 MB gzipped**, up from 1.78 MB. Every visitor
downloads it once. Fixes exist — ship only the languages someone uses, or load
the tail after the first screen — but each costs complexity and I would rather
know it is a real problem first.

---

## 5 · Two questions at signup — your call

**Birth year, and country or language.** Two taps, once.

What a person has watched is dominated by what was showing when they were
twelve to twenty-five, and where they were. The site knows neither. It matters
more now: with 27 languages in the catalog, a new account cannot tell whether
to show Egyptian films or Korean ones until you have swiped enough to reveal
it.

**The tension:** two more taps before anyone sees a poster, and you have said
the opening should be immediate. Your call.

---

## Known and open — recorded, not hidden

**`simulate` reports 12/13, and the failure is deliberate.** The
tunnel-vision guard reads 3.39x against a 1.15x limit. Every way of calming it
costs the only ruler graded on your real answers, monotonically — 0.8/no curve
gives 87.6, and the setting that passes the guard gives 69.1. Harvest, the
ruler that measures your actual goal, is flat throughout. Its own comment calls
reaching four named titles "a needle", two other tunnel checks pass, and its
limit was set on a catalog less than half today's size. Left failing in the
open rather than retuned to pass.

**Re-rank time is 33–38ms against a 40ms guard**, up from 24ms because the
catalog doubled. Measured off the swipe critical path. This machine varies 5ms
between identical runs, so there is no signal to tune against.

**946 titles have no reach estimate** — the Anthropic credit ran out mid-run,
and the gap skews Malayalam, Tamil and Arabic. Do **not** top it up: the
feature measured worse end-to-end and ships disabled.

**7,271 new titles still have no behavioural data.** MovieLens has never heard
of them and the multi-language Wikipedia clickstreams rescued 61. They are
reachable and ranked on metadata alone, which is the weakest signal here. No
lead on fixing it that I have not already measured and rejected.

---

## Already decided — no action

Render, storage, accounts: live. MovieLens commercial licence: granted.
Amazon Reviews 2023 licence: asked, no reply — still the only lead that covers
television behaviourally.
