# What needs you

**https://dhawq.onrender.com** — the app is now called **Seenit**; the address
has not changed.

**Before anything else: hard-refresh once.** Your browser is holding old code —
that is what made you report a total freeze that had already been fixed. On
iPhone Safari: close the tab entirely and reopen it. On desktop: Ctrl/Cmd +
Shift + R.

---

# 1 · Two things only you can do

These are blocked on your account and nothing I can do reaches them. Everything
in section 2 works without them; **sign-in, cross-device sync and sharing a
list do not.**

## 1.1 · Run one SQL file

Supabase → your project → **SQL Editor** → **New query** → paste the whole
contents of:

    supabase/migrations/0007_profiles_and_sharing.sql

→ **Run**.

**There used to be two files numbered 0007 and they contradicted each other.**
One added a column called `share_anonymous`, the other `hide_owner`; the app
only ever wrote `hide_owner`, but the security rule that decides whether a
stranger may read your name checked `share_anonymous`. So "share this list
without my name" would have set one column while the rule read the other, and
your name would have been visible anyway. I merged them into the single file
above and deleted the other. It is safe to run whether or not you ran either
of the old ones.

**How to know it worked:** the query returns `Success. No rows returned`. If it
errors, paste me the message.

## 1.2 · Turn on Google sign-in

Supabase → **Authentication** → **Providers** → **Google** → enable → save.

You will need a Google OAuth client ID and secret (Google Cloud Console →
APIs & Services → Credentials → OAuth client ID → Web application). The
redirect URL Supabase asks you to authorise is shown on that same Supabase
page — copy it from there rather than typing it.

**Until this is done the "Sign in" button does nothing.** That is the only
symptom.

---

# 2 · Then test, in this order

Nothing below needs section 1.

## 2.1 · The first sixty seconds — does it feel right now?

This is what I have spent this whole stretch on and it is the part I most need
your eyes on, because every measurement I have is indirect.

1. **Open the site cold** (hard refresh). Watch the "Seenit" title card and the
   three demonstration swipes. Previous version: 10.7 frames per second with
   one frame frozen for 1.5 seconds. Now measured at 25.2 fps with no freeze.
   **Does it still jump between poses?**
2. **Throw a card**, don't drag it — flick right and let go. It used to leave
   the screen in 284ms with the colour already gone. It now takes 417ms and the
   wash follows it out. **Is it slow enough to see?**
3. **Drag a card downward.** It should barely move and snap straight back. It
   used to travel 454px and take 1.75 seconds to return, which is what you were
   seeing as a freeze.
4. **Tap the buttons under the card** rather than swiping. Same verdict, and
   the heart should not stay lit after you lift your finger.

If any of those is still wrong, **film it**. Your recordings have found things
no number of mine did.

## 2.2 · Swipe a full session

Home → **Swipe**. Then `/lab` → **Export**, and send me the file.

**Export before you close the tab.** Your browser clears storage on close. If
something interrupts you, `/lab` → **Import a file** restores an export.

### Use the 👁 button

The row is: 👎 · undo · ↑ · **👁** · ❤️

**👁 means "I watched it, no strong feeling."** Use it for every work you have
seen and felt nothing much about.

Until it existed you had three lies to choose from, and the one that feels
least dishonest — ↑ "haven't seen it" — is the most damaging: it teaches the
site you never saw a film you did see, and drops the title out of your library.
Your last file had **812 "haven't seen" answers in 1,100 cards**. Some unknown
share of those are really 👁.

### And swipe left honestly

👎 no longer blames a whole genre for one bad title — measured. Disliking The
Office will not cost you Modern Family. Your last two files had **6 dislikes in
1,100 swipes, and 1 in 378**. That was rational before. It is not now.

## 2.3 · Walk the other four tabs

I opened every screen myself this round and they all render with no errors, but
"renders" is not "is any good". Ten minutes on each:

- **Discover** — are the recommendations recognisable *and* worth watching?
- **Together** — add two names, see what it proposes for both of you.
- **Library** — search inside it; the search field looks at what you have
  watched first and the whole catalog second.
- **You** — the counts, the settings.
- **Lists** — build one from your library. This screen used to open on an icon
  and a `+` and no words at all; it now explains itself. **Sharing it needs
  section 1.**

## 2.4 · Optional · a third calibration round

https://dhawq.onrender.com/calibrate — tap only what you have watched. One tap
anywhere on a card, a second tap undoes it. Untapped counts as not watched.

Two rounds are done (399 titles). A third tightens every band estimate, and
those estimates set where the gate stops. Not urgent.

---

# 3 · What I know is still wrong

I would rather you hear this from me than find it.

## 3.1 · The deck cannot reach what Discover finds — for comedy and horror

`npx tsx scripts/cold-deck.ts` builds a person who has liked 1, 3, 5 and 10
titles of one genre and asks what the next twenty cards are. Measured today:

| genre | own genre after 3 likes | can reach Discover's top 15 | recognised |
|---|---|---|---|
| comedy | 19/20 ✅ | **5/15** ❌ | **11/20** ❌ |
| horror | **11/20** ❌ | **7/15** ❌ | **16/20** ❌ |
| science fiction | 15/20 ✅ | 12/15 ✅ | 19/20 ✅ |

Science fiction is fine. Comedy and horror are not, in two different ways:
comedy shows you the right genre but too obscure (median fame rank 1,887), and
horror does not hold the genre at all after three likes.

**I have not fixed this, deliberately, and you should know why.** The ruler
above is a synthetic person I invented. Your real session is better evidence
than my invention, and if I retune the engine tonight and you swipe tomorrow,
neither of us can tell which change caused what. This is the fifth time in this
project that my ruler was the thing that was wrong. **Send me the export from
2.2 and I will tune against your labels instead of my guesses.**

## 3.2 · Load still costs about 0.4 seconds

Down from 1.5 seconds this round, and the remaining 377ms is Turbopack's module
runtime — React, Next and framer-motion registering themselves. I removed two
things that had no business being in it (the whole ranking engine, loaded on
the main thread as a fallback that almost never runs; and the Supabase SDK,
pulled in to read two environment variables). Cutting further means replacing
libraries, which I will not do without you asking.

**Symptom:** the first tap after a cold load can be ignored. Reloads are fine —
the browser caches it.

## 3.3 · MovieLens has no television

The goal ruler is blind to 3,076 of the 15,083 titles. No fix — the data does
not exist.

## 3.4 · Do not top up the Anthropic credit

That feature measured worse and ships disabled.

---

# 4 · Fixed since your last session

- The opening animation freeze — it was never a paint. `buildRarityIndex` was
  counting every keyword in 15,083 titles on the main thread, ~1.2s on your
  phone, exactly while the welcome animation played. It builds in idle slices
  now.
- Cards vanishing instead of flying — the real card was being deleted at the
  release instant and an inert copy flown in its place, starting 40px behind
  where your finger let go.
- A throw arriving faster than a drag — three separate causes: a front-loaded
  ease, opacity riding the same curve, and drag momentum.
- Dragging downward looking like a freeze.
- The whole-screen colour dying with your finger on a flick.
- The heart staying blue for twenty seconds after a tap.
- A poster placeholder flashing before every card.
- A failed network request on every single page load, waited on, for a data
  file that is deliberately not shipped.
- Two contradicting database migrations (see 1.1).
- Lists opening on a wordless empty screen.
