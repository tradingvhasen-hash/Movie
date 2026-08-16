# What needs you

One site, one address: **https://dhawq.onrender.com**

Everything I could do alone is done and pushed. Wait for Render to finish
deploying, then **pull down to refresh once** so the browser drops the old code.

---

## 1 · Swipe 400 cards and export

**Where:** https://dhawq.onrender.com → **Swipe** → then `/lab` → Export.

Since your last session the catalog grew by 2,257 titles, the deck stopped
asking only about things it was already sure of, and fame became something the
site learns from you instead of assumes about you.

**The one number I want from your file:** does the hit rate still collapse after
card 300? Your last three sessions went 63% → 22% → 12%. Everything shipped
today was aimed at that curve.

Do not reset first — I want to see what the deck does on top of the library you
already have.

---

## 2 · One more calibration round ⭐

**Where:** https://dhawq.onrender.com/calibrate

You did 199 and it was the most valuable ten minutes anyone has spent on this
project. It found six broken measurements, killed a feature I had shipped that
morning, and showed that 2,700 films you plausibly watched were missing from the
catalog entirely.

**Why again:** the catalog is different now — 15,083 titles instead of 12,826,
and the new ones sit exactly in the band your answers said you live in. The old
sample cannot measure the new catalog. And nine watched titles out of 199 is a
thin base for everything now resting on it; another 200 roughly halves the
error on every number derived from it.

Same as before: tap **شاهدته** or **لم أشاهده**, "not watched" is worth exactly
as much as "watched", press تصدير, send me the file.

---

## 3 · Try the grid — it has never once worked for you

**Where:** https://dhawq.onrender.com/seen

Your 1,100-card session contained eight grid screens and 219 posters, and
**not one tap was recorded**. Titanic, The Dark Knight, the Harry Potter films,
Star Wars — all marked "not seen".

The database was rejecting every grid tap: the `swipes` table only accepted
liked / disliked / not_seen, and the grid writes `seen`. **Run the SQL in §5
first or it will silently fail again.**

Tap five or six you have watched on one screen, press next, then tell me
whether the counter at the bottom went up. That is the whole test.

---

## 4 · Search — does it find what you actually remember?

**Where:** https://dhawq.onrender.com/search

Type film names you remember and add them. Try `Snatch` and `American Pie`
first: both were in the catalog the whole time and the deck never showed you
either across 1,100 cards.

**What I want to know:** how many do you type that come back with nothing? That
number is the honest size of the catalog's remaining gap, and no instrument I
have can measure it.

---

## 5 · The SQL — still not run, and §3 depends on it

Supabase → **SQL Editor** → New query → paste → **Run**:

```sql
alter table public.swipes drop constraint if exists swipes_action_check;
alter table public.swipes add constraint swipes_action_check
  check (action in ('liked', 'disliked', 'not_seen', 'seen'));
alter table public.user_taste add column if not exists seen_facets jsonb;
```

---

## What changed today, and what it cost

| | before | after |
|---|---|---|
| `harvest` — the goal ruler | 218.1 | **238.6** |
| catalog | 12,826 | **15,083** |
| your library inside it | ~580 | **~828** |
| first-paint download | 3.33 MB | **2.60 MB** |
| broken instruments found | — | **6** |

Your 199 answers did most of that. The single biggest thing they showed:

> **Fame was never worthless. The measurement was broken.** Vote count scored
> 0.500 — a coin flip — on cards the deck had chosen, and **0.799** on your
> random sample. Every label this project owned was picked by the model being
> tested, and a model that chooses its own exam will pass it.

---

## Known and open — recorded, not hidden

**`simulate` is 12/13.** The one failure is a re-rank timing guard that passes
and fails between identical runs on this machine. The tunnel-vision guard that
sat red for weeks now reads 1.00× against a 1.15× limit.

**Non-English is unresolved and I made it worse before I made it better.** I
built four passes of machinery to open Arabic film for an Arabic reader. Your
sample then said you had watched **none of 129 non-English titles**. It is
switched off. Whether that is true of you specifically or of our non-English
catalog specifically, I cannot yet tell — §4 is the test.

**MovieLens has no television at all**, so the goal ruler is blind to 3,076 of
the 15,083 titles. No fix; the data does not exist.

**Do not top up the Anthropic credit.** That feature measured worse and ships
disabled.
