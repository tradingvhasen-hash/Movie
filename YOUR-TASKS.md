# Where this stands

**https://dhawq.onrender.com** — verified serving the newest build.

**Done and closed:** the SQL migration is run, Google sign-in works, and
Supabase's URL Configuration points at the live site. Those three were the only
things blocking cloud accounts, and they are behind us. I have stopped
reminding you about them.

---

# 1 · Yours — three things, one of them blocking me

## 1.1 · Swipe a full session, then export

**This is the only item blocking real work.** Everything below it is optional.

Home → **Swipe** → swipe until you have had enough. Then `/lab` → **Export** →
send me the file.

**Export before you close the tab.** The browser clears storage on close. If
something interrupts you, `/lab` → **Import a file** restores an export.

### Use 👁

The row is 👎 · undo · ↑ · **👁** · ❤️. **👁 means "I watched it, no strong
feeling."** Your last file had **812 "haven't seen" answers in 1,100 cards**,
and some unknown share of those are really 👁 — ↑ is the most damaging of the
three because it teaches the site you never saw a film you did see, and drops
the title out of your library entirely.

### And swipe left honestly

👎 no longer blames a whole genre for one bad title — measured. Your last two
files had **6 dislikes in 1,100 swipes, and 1 in 378**. That was rational
before. It is not now.

## 1.2 · Sign in, swipe a few, then open the site on a second device

The cloud sync has **never once run against a real account** — accounts only
started working today. The code has been there for weeks and has never been
exercised.

If the history does not appear on the second device, the profile screen will
now tell you why in plain words. Send me that text.

## 1.3 · Optional · a third calibration round

https://dhawq.onrender.com/calibrate — tap only what you have watched. One tap
anywhere on a card, a second tap undoes it. Untapped counts as not watched.

Two rounds are done (399 titles). A third tightens every band estimate, and
those estimates set where the deck's gate stops. Not urgent.

---

# 2 · Mine — what is actually left

## 2.1 · The deck cannot reach what Discover finds · BLOCKED ON YOUR EXPORT

`npx tsx scripts/cold-deck.ts`, measured today, after 3 likes of one genre:

| genre | own genre /20 | reaches Discover's top 15 | recognised /20 |
|---|---|---|---|
| comedy | 19 ✅ | **5** ❌ | **11** ❌ |
| horror | **11** ❌ | **7** ❌ | **16** ❌ |
| science fiction | 15 ✅ | 12 ✅ | 19 ✅ |

Science fiction is fine. Comedy shows the right genre but too obscure (median
fame rank 1,887). Horror does not hold the genre at all after three likes.

**Why I have not fixed it:** that ruler is a synthetic person I invented. The
last time I tuned the gate against my own invention it measured better and felt
worse, and you were the one who caught it. Your session is better evidence than
my guess, and tuning the night before you swipe destroys the ability to
attribute anything. **Send the export and this becomes my next job.**

## 2.2 · Load still costs about 0.4 seconds · NEEDS A DECISION FROM YOU

Down from 1.5s. What remains is Turbopack's module runtime — React, Next and
framer-motion registering themselves before the first frame. I have taken out
everything that did not belong in it.

Cutting further means replacing libraries — most plausibly dropping
framer-motion for CSS animations across the whole app. That is a large,
risky rewrite of every animation you have spent this week getting right.
**I will not start it unless you ask.**

**Symptom:** the first tap after a cold load can be ignored. Reloads are fine.

## 2.3 · Google shows the Supabase domain, not "Seenit" · COSTS MONEY

Google displays the app name only for verified apps; unverified ones show the
redirect host, and you cannot verify a domain you do not own. Fixing it needs a
domain (~$15/year) plus Supabase's custom-domain add-on ($10/month).

My advice stands: **do not pay yet.** You are the only person who sees that
screen. Buy the domain when you decide to share the site — you will want it
then for better reasons, starting with the fact that the app is called Seenit
and the address says dhawq.

## 2.4 · MovieLens has no television

The goal ruler is blind to 3,076 of the 15,083 titles. No fix — the data does
not exist.

## 2.5 · Do not top up the Anthropic credit

That feature measured worse and ships disabled.

---

# 3 · Fixed since your first-impression walkthrough

Every item from the eleven screenshots and both recordings:

- The 5–7 second blank opening — the welcome screen was waiting for 5.7MB it
  never reads. First real content 3,353ms → **1,131ms**.
- The tab press that did nothing for seconds — **not slowness**. Safari's link
  preview menu was opening instead of navigating. Your recording showed it
  twice; my timings could never have.
- The logo's blue bar that looked like selected text — the light is inside the
  letters now.
- Demo cards rendering as unloaded placeholders — they are designed welcome
  cards, drawn in CSS, nothing to fetch. And each one says what it is about to
  do, which the old one got backwards.
- The glow covering the card, the buttons and the name — it is behind them now,
  and lighter.
- The mark floating over the poster — a stamp in the card's own corner.
- The lost float on release, and a throw that arrived faster than the effect.
- The card that flew upward on its own.
- The card underneath popping up after a throw — it rises with the drag now.
- The dislike icon's corners.
- The Discover sheet's instant blur, its X button, verdicts closing it, its
  glaring buttons, and cards vanishing from the grid without animation.
- Together's invisible slots and its blank search.
- The library: three across, no captions, tap to flip onto a deck-style back,
  Select mode with one Delete carrying the count, four header rows down to two.
- Two contradicting database migrations, one of which made "share without my
  name" do nothing.
- A 404 fired **and awaited** on every single page load.
- Cloud sync failing silently — Supabase returns errors rather than throwing
  them, so every `catch` in that file was catching nothing. The profile screen
  now says so in plain words.
