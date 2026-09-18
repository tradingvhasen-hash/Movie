# FILE 3 — HOW THE WHOLE SITE WORKS

Where the cards came from, how to make the catalog bigger, where your data is
kept, where the site is published, and what happens between opening the page and
seeing a card.

The algorithm itself has its own file: `04-THE-ALGORITHM.md`.

---

# PART 1 — WHERE THE MOVIES AND SERIES CAME FROM

## 1.1 One source, and it is TMDB

Every one of the 48,553 cards came from **TMDB — The Movie Database**
(<https://www.themoviedb.org>). Nothing was typed by hand. Nothing came from
IMDb, Netflix, or anywhere else. The posters are *still* coming from TMDB, live,
every time anyone opens the site — they are links to `image.tmdb.org`, not
copies.

## 1.2 How they were chosen — the quota, not the rating

This is the part that matters, and it is the answer to *"why did no Arabic film
ever appear?"*

The naive way is to ask TMDB for the most popular titles in the world and take
the top 50,000. Do that and you get 50,000 English-language titles, because
that is what the world ranks highest. The earlier catalog was built roughly that
way and it held **2 Arabic titles**.

So instead the builder holds a **quota per language**, and fills each one
separately, taking the **most-voted titles within that language**. From
`scripts/build-catalog.ts`:

```
en 20,000   ja 3,000   ko 2,200   tr 2,000   hi 2,000   es 2,000
fr 1,800    ar 1,600   zh 1,500   de 1,200   it 1,200   ru 1,000
pt 1,000    ta 800     th 800     te 600     ml 600     fa 600
id 600      vi 500     vi/pl/sv/da/no/nl/fi/cs/el/hu/ro/uk/kn/bn/ur/he/tl/ms/mr/pa …
```

39 languages, 51,400 places in total. Turkish gets 2,000 places of its own and
is not competing with Hollywood for them. That is why Turkish went from 778
titles to 1,803, and Arabic from 2 to 1,503.

**Films versus series is also per language,** because countries differ:

```
Turkey 55% series   Korea 50%   Japan 45%   China 40%
Thailand 40%        Arab world 35%   English 30%   everywhere else 25%
```

Turkey's best-known works are series. A 70/30 split towards film would have
spent most of Turkey's quota on the wrong medium.

## 1.3 The vote floor is only a junk filter

`MIN_VOTES` is **3 for films and 2 for series**. That is deliberately almost
nothing. An earlier build used 1,000 and the quotas could never fill — small
languages were being truncated by a rule meant to remove junk. **The quota is
the selection; the floor only removes things with no ratings at all.**

## 1.4 Getting past TMDB's page limit

TMDB refuses to serve past page 500 of any search — about 10,000 results. English
has far more than that. `collectLang()` handles it with a **descending vote
cursor**: walk 500 pages, remember the lowest vote count seen, then re-walk with
`vote_count.lte` set to that number, and repeat up to 12 times. Each sweep opens
a new window further down the fame ladder.

## 1.5 What is stored for each title

One TMDB detail call per title, with
`append_to_response=keywords,credits,translations,recommendations`. From that:

| Field | Used for |
|---|---|
| id, type (movie/tv) | identity |
| title in English | display, search |
| title in Arabic | display, search |
| **original_title** | search in the native script — see below |
| year | the "era" facet |
| overview (clipped to 200 chars) | display |
| genres | the "genre" facet |
| **keywords** (max 14) | the "story" facet — the strongest meaning signal |
| director | the "director" facet |
| cast (top 4) | the "cast" facet |
| original language | the "language" facet |
| rating + **vote count** | quality, and **fame** — the whole deck is built on this |
| popularity | initial sort order |
| poster path | the image |
| **recommendations** | the co-watch graph — 768,917 links |

**The original-title story, because it explains a whole class of bug.** Search
was storing the English title and TMDB's *Arabic translation*. A film whose name
is **already Arabic** has no Arabic translation to fetch — so `الفيل الأزرق`
(The Blue Elephant) carried an empty second name and matched nothing when typed
in Arabic. It was in the catalog the whole time. Capturing `original_title` fixed
it and gave **23,105 titles** a name in their own script. The field was appended
at the *end* of the row format (position 17) precisely so that a catalog written
before the change still decodes.

## 1.6 How the catalog is stored — the compact format

`public/catalog.json`, 25.6 MB. It is **not** a list of objects. Repeating ~18
JSON key names 48,553 times costs more than the data itself, so every title is a
**positional array**:

```
[tmdbId, isTv, titleEn, titleAr, overview, year, genreIdx[], keywords[],
 director, cast[], langIdx, rating, votes, popularity, posterPath,
 onboarding, relatedIdx[], originalTitle]
```

Genres and languages are **interned** — stored once in lookup tables `g` and `l`,
referenced by index. Co-watch neighbours are stored as **positions in the array**,
not as ids: an id like `"movie-27205"` costs ~14 bytes, its index costs 3–4.
Across 48,553 titles × up to 20 links each, that is the difference between
roughly 1.4 MB and 350 KB.

**Feature vectors are never stored.** They are recomputed in the browser at load
(`featurize` is a pure function), which keeps the download several times smaller.

`public/overviews.json` holds the longer plot summaries and is fetched **later,
when the browser is idle** — off the critical path to the first card.

---

# PART 2 — HOW TO MAKE THE CATALOG BIGGER (50,000 → 100,000)

Two ways. Pick by whether you want new *languages/depth* or just more of what is
already there.

## 2.1 The full rebuild — for changing the shape of the catalog

Use this when you want different quotas, new languages, or a different
film/series balance.

```bash
# 1. get the code and install
git clone https://github.com/tradingvhasen-hash/Movie.git
cd Movie && git checkout claude/movie-swipe-app-0bvkc8
npm install

# 2. EDIT THE QUOTAS — scripts/build-catalog.ts, the LANG_QUOTAS block
#    To double to 100,000, double the numbers you care about.
#    Do NOT just double everything blindly; see the warning below.

# 3. run it
TMDB_API_KEY=<your key> npm run catalog -- --count 100000

# 4. check what you got
node -e "const c=require('./public/catalog.json');console.log(c.t.length)"

# 5. run the tests (05-THE-TESTS.md), then commit and push
git add public/catalog.json scripts/build-catalog.ts
git commit -m "Catalog: 100,000 titles"
git push -u origin claude/movie-swipe-app-0bvkc8
```

Render redeploys by itself when the push lands.

**Time and cost.** 24 parallel workers, capped at 25 requests/second. At
~9–20 titles per second, 100,000 titles is roughly **2–3 hours**. Free — TMDB
does not charge. Run it on a machine that will not sleep.

**Useful knobs, all environment variables:**

| Variable | Default | Does |
|---|---|---|
| `TARGET` / `--count` | 50000 | overall target |
| `TV_SHARE` | 0.32 | global film/series balance |
| `MIN_VOTES_MOVIE` | 3 | junk floor for films |
| `MIN_VOTES_TV` | 2 | junk floor for series |
| `WORKERS` | 24 | parallel fetches |
| `CATALOG_OUT` | `public/catalog.json` | write somewhere else — **use this to keep the old catalog while you test the new one** |

### ⚠️ Read this before doubling the catalog

**The size problem is already the worst problem this project has.** 48,553
titles = 13.81 MB over the wire and **75.8 seconds to open on Slow 4G**. Doubling
the title count roughly doubles both. 150 seconds to open is not a website
anybody uses.

If you go to 100,000, you must also do **one** of these:

1. **Move the catalog behind the server.** This is the reason Render exists and
   the reason `/api/recommend` was written. The endpoint and the database schema
   already exist (`supabase/migrations/0001_init.sql`, with pgvector). Seed it
   with `npm run seed` and switch the client to fetch candidates instead of the
   whole file. This is the right answer and it is half-built already.
2. **Stream the catalog in fame order** — ship the first few thousand, let the
   deck start, fetch the rest in the background. The deck only uses the top of
   the ranking early on anyway (see `04-THE-ALGORITHM.md` §C).
3. **Accept it and say so**, if it is only ever going to be opened on wifi.

Do **not** solve it by shipping a small ranking set and a large search-only set.
That was built, it worked, and it was rejected: a title that can only be searched
for is a title the app will never suggest to you. See `02-PROJECT-INFO.md` §8.

## 2.2 The incremental extension — for adding a band without a rebuild

A full rebuild refetches everything and takes hours. It also **strands any
enrichment** that was computed afterwards (the distilled co-watch edges from
MovieLens and Wikipedia). If you just want to go deeper in one language:

```bash
TMDB_API_KEY=<key> npx tsx scripts/extend-catalog.ts --lang ar --min 100 --max 499
```

It reads the existing catalog, skips every title already present *before* making
its detail call, fetches only what is missing, and writes the merged file back.
Existing entries are never touched. Re-running it costs only the discover pages.

Repeat per language and per vote band. Slower to drive by hand, but safe and
resumable, and it preserves everything already computed.

## 2.3 After any catalog change — the checklist

1. `node -e "const c=require('./public/catalog.json');console.log(c.t.length)"` — count.
2. `npx tsx scripts/reach-audit.ts` — is the algorithm actually applied to all of them?
3. `npm run simulate` — nothing broken (13 checks).
4. `npm run benchmark` — did quality move?
5. `npm run dev`, then `node scripts/load-guard.mjs` — **did the site get too heavy?**
6. `node scripts/deck-guard.mjs` — 7 browser checks on the real deck.
7. Search a native-script title (`الفيل الأزرق`) to confirm original titles survived.
8. Commit, push, wait for Render, open the live site on a phone.

---

# PART 3 — WHERE YOUR INFORMATION IS STORED

Short answer: **in your browser, on your device, and nowhere else** — unless you
sign in, which nobody is required to do.

## 3.1 Without an account (the default, and how everyone uses it today)

Everything lives in your browser's **localStorage**, under one key:

```
dhawq-store   (schema version 5)
```

That holds: every swipe with a small snapshot of the title it was made on, the
order you made them in, your taste profile (the facet tables), your lists, your
settings, and a random seed. Written by a custom storage layer in `store.ts` that
**batches writes on a 400 ms trailing edge** — at 300 swipes, writing on every
keystroke of state would mean 300 full re-serialisations.

What this means in practice:

- **It never leaves your device.** No server sees it. There is no analytics, no
  tracking, no third party.
- **Clearing your browser data deletes everything.** There is no backup.
- **A different browser or phone is a different person.** Nothing follows you.
- **Private/incognito mode loses it when you close the tab.**
- localStorage caps at roughly 5–10 MB, which is why v5 slims the per-swipe title
  snapshot.

**Upgrades never lose a library.** Every swipe carries a snapshot of the title it
was made on, so when the model changes the whole history is simply replayed
through the new one (`migrate` in `store.ts`). An hour of swiping survives a
change to the engine.

## 3.2 With an account (optional, off by default)

Sign in via email link — no password. Then `src/lib/supabase/sync.ts` pushes to
Supabase:

| Table | Holds |
|---|---|
| `swipes` | your verdicts |
| `user_taste` | your taste profile |
| `lists`, `list_items` | your lists |
| `profiles` | display name, bio, avatar, public slug |

That gives you cross-device sync and public share links (`/l/<slug>`,
`/u/<slug>`). Access is controlled by Row Level Security in Postgres — the
browser's key is public by design and the database is what enforces who can read
what.

Your data then sits on Supabase's servers (the project is
`otgniwtpnxnyiqtrctqg`), under your Supabase account, until you delete it.

## 3.3 What the site sends out, in every case

- **Poster images** are fetched from `image.tmdb.org`. TMDB therefore sees the
  IP addresses of visitors and which posters were loaded. Unavoidable without
  hosting every image yourself.
- **The page and the catalog** come from Render, so Render's logs see requests.
- **Nothing else.** No analytics script, no tags, no fonts from a third party.

`/legal` on the live site states this. It is deliberately one page rather than a
privacy policy and a terms page, on the reasoning that splitting them halves the
chance either is read.

---

# PART 4 — WHERE THE SITE IS PUBLISHED

Two places, on purpose.

| | **Render** (the real one) | **GitHub Pages** (the demo) |
|---|---|---|
| Link | **<https://dhawq.onrender.com>** | <https://tradingvhasen-hash.github.io/Movie/> |
| Type | real Node server, `next start` | static files only |
| Built by | `render.yaml` | `.github/workflows/pages.yml` |
| Has `/api/recommend` | yes | no — stripped at build |
| Has share links `/l/`, `/u/` | yes | no — stripped at build |
| Catalog ceiling | no practical limit | ~15,000 titles |
| Sleeps when idle | yes, ~15 min, 30–50 s to wake | no |
| Cost | free | free |

**Both deploy automatically on `git push` to `claude/movie-swipe-app-0bvkc8`.**
Nothing else has to be done. Render watches the branch; the GitHub Action runs on
the same push, strips `src/app/api`, `src/app/l` and `src/app/u`, and builds with
`STATIC_EXPORT=1 BASE_PATH=/Movie`.

Rollback: revert the commit and push, or in the Render dashboard choose an
earlier deploy and click **Redeploy**.

---

# PART 5 — WHAT HAPPENS WHEN SOMEONE OPENS THE SITE

1. Browser asks Render for the page. **If the free instance is asleep, this is
   where the 30–50 seconds go.**
2. Next.js serves the HTML and JavaScript.
3. `src/lib/catalog.ts` fetches `public/catalog.json` — the big download.
4. It is decoded from the positional format into real objects, and the genre and
   language tables are un-interned.
5. **The whole decoded catalog is handed to a Web Worker** via `postMessage`
   (`installEncodedCatalog` / `getEncodedCatalog`). This is important: the
   worker does **not** fetch its own copy. It used to, and that doubled the
   download to 24 MB and broke a real phone. `sendCatalog(w)` is now **awaited**
   before the first ranking request, because a fire-and-forget version lost the
   race and the worker fetched anyway.
6. Feature vectors and the rarity (IDF) index are computed in the browser.
7. The worker ranks a batch on a separate thread, so the swipe animation never
   stutters.
8. `useDeck.ts` fills the queue and the first card appears.
9. When the browser goes idle, `public/overviews.json` is fetched and the long
   plot summaries are attached.

One detail worth knowing: the empty-deck message ("Reset all cards") is gated on
`hydrated && filled`, where `filled` only counts a catalog install that happened
*after* hydration. Without that gate the app told people the deck was empty while
it was still loading.

---

# PART 6 — THE PAGES

| Route | What it is |
|---|---|
| `/` | **The deck.** The swipe screen. Where people spend their time. |
| `/discover` | "What should I watch next." Ranks the **whole** catalog, always — `DISCOVER_POOL` is `Infinity`. Almost no diversity forcing and almost no fame weighting. |
| `/add` | **The grid.** 40 posters at once, tap the ones you have watched, "None of these" records 40 answers in one press. Measured at **2,490 titles/hour against the deck's 1,121.** |
| `/library` | Everything you have marked. Lists live here too. |
| `/lists` | Kept alive because links to it exist in the wild; lists are really a view of the library now. |
| `/together` | The screen you open with somebody else in the room. |
| `/profile` | Your public profile, if you signed in. |
| `/settings` | Including **How far the deck reaches** — see `04-THE-ALGORITHM.md` §C. |
| `/legal` | Privacy and terms, one page. |
| `/l/<slug>` | A shared list. Render only. |
| `/u/<slug>` | A shared library. Render only. |
| `/calibrate` | **A test page.** See `05-THE-TESTS.md`. |
| `/lab` | **A test page.** Not linked from the navigation. See `05-THE-TESTS.md`. |

---

# PART 7 — IMPORTING A LIBRARY INSTEAD OF SWIPING

The fastest way to fill a library is not to swipe at all. `/lab` and the first
onboarding screen both accept a CSV export from **Letterboxd, IMDb, Trakt or
TV Time**.

Why it exists: the deck needs about 22 minutes to recover 411 of a 533-film
history and its rate falls the whole way. Four attempts to fix that by
reweighting the ranking all failed. A web search — which should have come first —
showed that **no product in this category solves it by asking.** Letterboxd,
Trakt, TV Time and Bingebase all solve it with an import.

`src/lib/import/watchlist.ts` finds columns **by name, not position**, so
Letterboxd's `Name,Year,Rating`, IMDb's `Title,Year,Your Rating,Const` and a
diary export with extra columns all work. The rating scale is decided **once**
from the largest value in the file — guessing per row would read a Letterboxd
library where nobody went above 2.5 as a wall of hatred.

Measured on 60 real libraries rendered as export files, with names damaged the
way real exports differ from our catalog:

| Damage | Matched | Wrong film |
|---|---|---|
| exact title | 100.0% | 0.02% |
| article moved to the end ("Thing, The") | 100.0% | 0.02% |
| accents stripped | 100.0% | 0.02% |
| punctuation changed | 100.0% | 0.02% |
| lower case | 100.0% | 0.02% |
| any of the above, year off by one | 100.0% | 0.23% |

"Thing, The" first measured 78.2% — stripping only the *leading* article misses
the form several services store. Both ends are stripped now, and that row was
re-measured rather than argued about.
