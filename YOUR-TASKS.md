# What needs you

One site, one address: **https://dhawq.onrender.com**

Everything I could do alone is done and pushed. Wait for Render to finish
deploying, then **pull down to refresh once** so the browser drops the old code.

---

## 1 · The SQL — one block now, and it is bigger than the last one

Supabase → **SQL Editor** → New query → paste → **Run**:

```sql
alter table public.swipes drop constraint if exists swipes_title_id_fkey;
alter table public.list_items drop constraint if exists list_items_title_id_fkey;

alter table public.swipes drop constraint if exists swipes_action_check;
alter table public.swipes add constraint swipes_action_check
  check (action in ('liked', 'disliked', 'not_seen', 'seen'));

alter table public.user_taste add column if not exists seen_facets jsonb;
```

The first two lines matter more than everything I sent you yesterday. The
`swipes` table required every title id to already exist in a `titles` table
that holds a few hundred rows, while the catalog the site ranks against is
15,083. So the upload silently threw away every swipe whose film was not in
that small table — you could swipe a thousand cards, sign in on another device,
and find a few dozen. No error was raised anywhere, including to me.

The site now works either way: it uploads everything first and only falls back
to the old filtering if the database refuses. Running this makes the fallback
unnecessary.

---

## 2 · ⭐ One more calibration round

**Where:** https://dhawq.onrender.com/calibrate

You did 199 and it remains the most valuable ten minutes anyone has spent on
this project. Today it killed a second feature before I built it — see the
bottom of this file.

**Why again:** the catalog is 15,083 titles instead of 12,826, and the new ones
sit exactly in the band your answers said you live in. The old sample cannot
measure the new catalog. And nine watched titles out of 199 is a thin base for
everything now resting on it; another 200 roughly halves the error on every
number derived from it.

Tap **شاهدته** or **لم أشاهده**, "not watched" is worth exactly as much as
"watched", press تصدير, send me the file.

---

## 3 · Swipe 400 cards and export

**Where:** https://dhawq.onrender.com → **Swipe** → then `/lab` → Export.
**Do not reset first.**

**This is the test of today's main fix.** Your last file collapsed from 74% at
card 50 to 6% at card 350, and I found why: the pool the deck draws from grew
by exactly one title per swipe, which is exactly the rate you consume it. The
supply of unseen candidates was a constant 300 forever, so once the ones you
had watched inside that 300 ran out, there was nothing left to find. It was
never running out of famous films — the films at card 350 were just as famous
as at card 50. It was running out of room.

Replayed against your own 1,226 labelled titles, cards 301–400 went from 19.2
to **30.0**. That is the number I want your file to confirm or refute.

---

## 4 · Search — does it find what you actually remember?

**Where:** https://dhawq.onrender.com/search

Type film names you remember and add them. Try `Snatch` and `American Pie`
first: both were in the catalog the whole time, and I now know exactly why the
deck never showed you either — they sit below where the gate could reach.

**What I want to know:** how many do you type that come back with nothing? That
number is the honest size of the catalog's remaining gap, and no instrument I
have can measure it.

---

## 5 · The grid — and a correction to what I told you about it

**Where:** https://dhawq.onrender.com/seen

Yesterday I told you the grid had never worked and that the database was
rejecting every tap. **I tested it properly today, with real touch events on a
phone-sized screen, and the grid works.** Five taps recorded five titles as
watched and the other twenty-five as not watched, exactly as designed.

So the 219 posters in your session that came back with zero taps are more
likely to be eight screens where you pressed the button without tapping
anything — it reads "None of these · next" and advances either way.

Worth thirty seconds: tap five or six you have watched on one screen, press the
button, and check the counter at the bottom left goes to "6 added · 1 screens".
If it does not, tell me and I will have been wrong twice.

---

## What changed today

| | before | after |
|---|---|---|
| `harvest`, 30 people × 1,500 cards | 417.0 | **438.1** |
| lost because the gate never offered it | 15.2% | **6.4%** |
| replay on your own labels | 175.4 | **186.8** |
| — your cards 301–400 | 19.2 | **30.0** |

**Rejected today, with numbers rather than an opinion.** Wikipedia publishes
how many people read each film's article each month, in every language. It is a
measurement of "have you heard of this" made by people who never opened a film
database, so it should have been better than a TMDB vote count. Scored against
your 199 answers it reads **0.578 against vote count's 0.799**, and blending
the two makes vote count *worse*. Two minutes of collection, twenty of
analysis, and it is not shipped.

**Also rejected, and this one your data killed for free.** Your sample says "is
it English" predicts what you have watched better than fame does, which reads
like an argument for an English-first deck — until you count what the deck
already serves you: **95% and 97% English** across your two real sessions.
There was nothing to win. A day saved by counting before building.

---

## Known and open — recorded, not hidden

**`simulate` is 12/13.** The failure is a re-rank timing guard. I profiled it
and cut the rebuild from 37.5ms to 33.8ms by not recomputing three per-title
constants on every pass; the guard tests the single worst of twelve samples,
which is 44.7ms and mostly garbage collection. It runs in idle time between
swipes and never sits between your finger and the next card.

**One correction to yesterday's write-up, before you find it yourself.** I said
the fix rescued a starving pool in the `deck-drift` probe — one horror title
left in the gate becoming forty-nine. That is true of a more aggressive version
I measured and did not ship. What shipped is identical to the old gate for the
first ~300 cards by design, so that probe cannot see it either way. The
evidence for what shipped is `harvest` at 1,500 cards and the replay of your
own labels, both long enough for the change to bind.

**MovieLens has no television at all**, so the goal ruler is blind to 3,076 of
the 15,083 titles. No fix; the data does not exist.

**Do not top up the Anthropic credit.** That feature measured worse and ships
disabled.
