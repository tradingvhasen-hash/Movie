# What needs you

**https://dhawq.onrender.com** — the app is called **Seenit**; the address has
not changed.

**Hard-refresh once before anything else.** Your browser holds old code — that
is what made you report a total freeze that had already been fixed. On iPhone
Safari: close the tab entirely and reopen it. On desktop: Ctrl/Cmd + Shift + R.

---

# 1 · Two things only you can do

Blocked on your account; nothing I can do reaches them. Everything in section 2
works without them — **sign-in, cross-device sync and sharing a list do not.**

## 1.1 · Run one SQL file

Supabase → **SQL Editor** → **New query** → paste all of
`supabase/migrations/0007_profiles_and_sharing.sql` → **Run**.

There used to be two files numbered 0007 and they contradicted each other: one
added `share_anonymous`, the other `hide_owner`. The app only writes
`hide_owner`, but the security rule deciding whether a stranger may read your
name checked `share_anonymous` — so "share this list without my name" would
have left your name readable. Merged into the one file above; safe to run
whether or not you ran either old one.

Success looks like: `Success. No rows returned`. If it errors, send me the text.

## 1.2 · Turn on Google sign-in

Supabase → **Authentication** → **Providers** → **Google** → enable → save.
You need a Google OAuth client ID and secret (Google Cloud Console → APIs &
Services → Credentials → OAuth client ID → Web application). Copy the redirect
URL from the Supabase page rather than typing it.

**Until this is done the Sign in button does nothing.** That is the only symptom.

---

# 2 · Then test, in this order

## 2.1 · The opening — everything you filmed in images 1–6

1. **Open the site cold.** Previously blank for 5–7 seconds. Measured: first
   real content was at 3,353ms and is now at **1,296ms**. Is the wait gone?
2. **The name card.** The subtitle is gone as you asked, and the reveal is
   rebuilt — the word rises and settles and one pass of light crosses it. It
   used to animate `letter-spacing`, which repaints the text every frame, so an
   800ms animation was drawn about three times.
3. **The demo.** It now has the Seenit heading and sits exactly where the real
   deck sits, and **the card tilts** as it swipes. It never did before — I had
   it translating a rectangle while claiming to demonstrate a gesture.
4. **The taste picker.** Unselected tiles were 41% visible; they are 82% now.
   And each tile ran three animations, so one tap started about 140 at once —
   now one each.

## 2.2 · The swipe — images 7–10

5. **The glow is behind the cards.** You can see the card you are throwing, the
   buttons and the name. It is also lighter.
6. **The mark on the card is gone**, replaced by a stamp in the card's corner
   that tilts and flies away with it. Tell me if this is still not right — you
   said you did not like anything about the old one and I would rather hear it
   twice than ship it wrong.
7. **The float is back.** Drag a card and let go without committing: it should
   glide, not stop dead. I had turned `dragMomentum` off to fix the throw and
   broke the release doing it.
8. **A hard throw now leaves faster than a nudge** — 400ms against 620ms — but
   never fast enough to outrun the effect.
9. **The card that flew up by itself** is fixed. Any card dropped by a re-rank
   was playing the full "haven't seen it" fly-up because the exit pose fell
   through to it. They fade in place now.
10. **The dislike icon** is redrawn with curves at every join.

## 2.3 · Discover — image 11

11. The blur arrives over 380ms instead of snapping on, and the sheet slides
    out properly instead of being erased under a fade.
12. **The X is gone** — tapping outside closes it, as you said.
13. **A verdict no longer closes the sheet.** Keep reading; the button you
    pressed fills with its colour.
14. The three buttons no longer glare — they were reusing the deck's raised
    white pill, which is designed to float over a photograph.
15. **A card now leaves the grid with an animation.** The exit existed; it
    never ran, because recording a verdict replaced the whole list rather than
    removing one tile.

## 2.4 · Together and Library

16. **Together**: the empty slots are surfaces with an edge instead of dashed
    holes, and the search opens on the most-recognised titles so it can be
    tapped instead of typed.
17. **Library**: four stacked rows became two. Tiles have no captions and
    **flip on tap** to show the facts and the delete button. **Select** turns
    every tile into a checkbox with one Delete carrying the count — your
    twenty-or-thirty problem.

## 2.5 · Swipe a full session

Home → **Swipe**. Then `/lab` → **Export**, and send me the file.
**Export before you close the tab** — the browser clears storage on close.

**Use 👁** for everything you watched and felt nothing about. Your last file had
**812 "haven't seen" in 1,100 cards** and some unknown share of those are
really 👁 — and ↑ is the most damaging of the three, because it teaches the site
you never saw a film you did see.

**Swipe left honestly.** 👎 no longer blames a whole genre for one bad title —
measured. Your last two files had **6 dislikes in 1,100 swipes, and 1 in 378**.

---

# 3 · What I know is still wrong

## 3.1 · I could not reproduce your ten seconds

You said pressing Discover sometimes took more than ten seconds and called this
the important one. I measured every tab, three times round, with a library
built, on a phone-speed CPU: **87–600ms, worst blocked frame 259ms.** That is
not your ten seconds.

So I have not fixed it, and I will not pretend otherwise. What I did fix is
everything I could actually catch: the 5.7 MB the welcome screen was waiting
for, the whole ranking engine being evaluated on the opening screen as a
fallback that almost never runs, a 404 fired and awaited on every page load,
and ~140 simultaneous animations on the first tap of the picker. If it still
stalls, **film it with the clock visible** and tell me which tab and whether it
was the first press after opening the site — that distinction is what I am
missing.

## 3.2 · The deck cannot reach what Discover finds, for comedy and horror

`npx tsx scripts/cold-deck.ts`, after 3 likes of one genre:

| genre | own genre /20 | reaches Discover's top 15 | recognised /20 |
|---|---|---|---|
| comedy | 19 ✅ | **5** ❌ | **11** ❌ |
| horror | **11** ❌ | **7** ❌ | **16** ❌ |
| science fiction | 15 ✅ | 12 ✅ | 19 ✅ |

Deliberately not fixed yet: that ruler is a synthetic person I invented, your
real session is better evidence, and retuning the engine the night before you
swipe destroys the ability to attribute anything. **Send me the export from 2.5
and I will tune against your labels.**

## 3.3 · Load still costs about 0.4 seconds

Down from 1.5s. The rest is Turbopack's module runtime — React, Next and
framer-motion registering themselves. Cutting further means replacing
libraries, which I will not do without you asking.

## 3.4 · MovieLens has no television

The goal ruler is blind to 3,076 of 15,083 titles. No fix; the data does not exist.

## 3.5 · Do not top up the Anthropic credit

That feature measured worse and ships disabled.
