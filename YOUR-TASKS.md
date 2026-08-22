# Where this stands

**https://dhawq.onrender.com** — verified serving the newest build.

**Done and closed:** the SQL migration is run, Google sign-in works, and
Supabase's URL Configuration points at the live site. Those three were the only
things blocking cloud accounts, and they are behind us. I have stopped
reminding you about them.

**The 👁 bug you reported is fixed, and it is live now** — I compared the
deployed file byte for byte against the build I tested, and they are the same
file. You can start.

It was worse than you described in two ways.

**It jammed the deck.** Measured on 44 button presses with every third one 👁:
the old build dealt 17 distinct films in 44 swipes and then stuck on a single
title from swipe 17 onward, forever. The new build deals 44 distinct films and
re-deals nothing.

**It destroyed answers you had already given.** A re-dealt card gets answered a
second time, and the second answer overwrites the first. In one 44-press run:
nine 👁 presses, **three** of them still recorded. So some films you told the
site you had watched are now stored as something else — including "haven't
seen", the one that drops a film out of your library entirely.

I cannot repair that. When a title is answered twice the store keeps only the
last answer and moves it to the end of the order; there is no copy of what you
said the first time. It only touched films you pressed 👁 on, and only since
15 August, so it should be a small number — but if you find a film in your
library filed wrongly, that is why, and the fix for it is one swipe.

The cause was mine. A helper called `pendingVerdicts` collected every 👁 answer
and put it at the **front** of every rebuild. I wrote it for a grid that says
"I watched this" without giving a verdict, so the deck could follow up. That
grid does not exist — `/calibrate` downloads a file and never touches your
library. Its only real source was the deck's own output, fed straight back into
the deck.

**And a note on why I did not catch it.** Every deck test I own pressed ❤️ and
👎 and nothing else, because the 👁 button is **off by default** — it appears
only once "Fourth button" is switched on in Settings. So the entire class of
bug was unreachable by every guard I had. There is now a guard
(`scripts/deck-guard.mjs`) that turns the setting on, presses all four answers
over 44 cards, and fails if the deck ever repeats a title. I ran it against the
broken build first to make sure it actually fails — 3 of 7 — before trusting it
to pass.

---

# 0 · What your two files said

Both arrived and both were worth having. Everything below is measured, not
argued.

## Your library is about 755 titles, and the site has 407 of them

Three blind calibration rounds now, and they agree closely: **4.52% · 5.00% ·
5.50%** of a random draw from the whole catalog. Combined, **5.0%** of 15,083
titles — call it **755 films and series**, give or take 130.

Across six sessions the deck has dealt you 1,826 distinct titles and you kept
**407**. So the site holds a bit over half your library, and the goal is the
rest.

## Your last session was the best one yet, and it still falls off a cliff

31.7% of the cards were things you had seen, against 26.2% and 18.8% for the
two previous long sessions. But the shape is the real story — recognition per
hundred cards:

    70%  58%  49%  37%  32%  29%  13%  18%  15%  17%   8%

The first hundred cards are excellent. The last hundred are worse than dealing
at random from the whole catalog would be.

**This is not the gate being too tight**, which is what I assumed and told you
last time. Broken down by fame, recognition is nearly flat — 36% for the top
500, 25% at rank 4,000–8,000. By language it is 98% English on both sides. The
deck is not wandering off into obscurity; it is running out of the part of your
library it can find.

## Your swiping under-reports by about a fifth

78 titles appear in both your blind grid and your swipe sessions. They agree
**92.3%** of the time, and the disagreement is one-sided:

|  | deck said watched | deck said never seen |
|---|---|---|
| **grid said watched** | 17 | **4** |
| **grid said not seen** | 2 | 55 |

So about **19% of your library gets ↑'d** when you swipe, against 3.5% the
other way. At 42 cards a minute that is not surprising. Your true recognition
last session was nearer **39%** than the 31.5% the file says — and it means the
single cheapest improvement available is you slowing down, not me writing code.

## Two things I had wrong, corrected by your data

**Fame is not worthless.** This codebase says in three separate files that a
vote count predicts recognition at AUC 0.500 — a coin flip — and an expensive
language-model estimate was commissioned to replace it. Measured properly on
your blind sample, where the engine did not choose the titles, fame scores
**0.826**. The old 0.500 came from measuring inside the top 7% of the catalog,
where range restriction drives any AUC to 0.5 mechanically. It could not have
come out differently.

**And the replacement never shipped.** The `reach` estimate is present in 0 of
15,083 catalog titles and its weight is 0 regardless. It has been dead the
whole time.

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

## 2.1 · The tail of a long session · IN PROGRESS, NO LONGER BLOCKED

Your export unblocked this, and it moved the diagnosis.

On 30 MovieLens strangers run for 1,100 cards each — the length your sessions
actually are — the site pulls out **71.8%** of a real watch history. The loss
splits cleanly:

    LOST AT RETRIEVAL   9.3%    the gate never admitted it. No ranking can help.
    LOST AT RANKING    18.9%    it was a candidate and we did not deal it.

So the gate is not the binding constraint; **the ranking is**, by two to one.
That is the opposite of what section 2.1 said yesterday, and your data is what
turned it round.

The change I am measuring now follows from one observation. The co-watch graph
records *who watched two titles* — it is TMDB's "people who watched this also
watched", with no opinion in it. The engine seeds that graph from your **likes
only**. Your 61 👁 answers contributed nothing to it, and neither did anything
you disliked, though a film you disliked is a film you watched.

On 120 MovieLens histories cut in half, asked to float the unseen half out of
2,000 random titles:

| signal | AUC | of the held-out half, share in the top 200 |
|---|---|---|
| vote count | 0.931 | 77.4% |
| what ships today | 0.957 | 87.8% |
| plus the co-watch walk | **0.979** | **94.7%** |

Those intervals do not overlap. Your blind sample points the same way (0.862
against fame's 0.826) though on 30 titles that gap is inside the noise and I am
quoting it only for its direction.

**It is not shipped yet.** A component bench is not the product; the number
that decides it is the harvest ruler above, before and after, and that sweep is
running. If it does not move the 71.8%, the change does not ship — however good
the component looks.

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
- The deck re-dealing every 👁 answer, and jamming on one of them — the deck was
  feeding its own output back into its own queue.
