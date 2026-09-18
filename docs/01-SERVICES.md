# FILE 1 — EVERY SERVICE THIS PROJECT USES

Every website an account was made on, in the order of how much the project
depends on it. For each one: **what it is**, **the link**, **what it gives the
project**, **what breaks without it**, and **where the secret lives** (if it has
one).

Six services have accounts. Three more are used without any account at all —
they are listed at the end so nobody wastes time looking for a login.

---

## NUMBER ONE — GitHub

| | |
|---|---|
| **What it is** | Where the code lives. Also the version history — every change ever made, with a written reason. |
| **Link** | <https://github.com> |
| **Your account** | <https://github.com/tradingvhasen-hash> |
| **The repository** | <https://github.com/tradingvhasen-hash/Movie> |
| **The branch everything is on** | `claude/movie-swipe-app-0bvkc8` (this is also the repo's default branch) |
| **Visibility** | **PUBLIC.** Anyone can read it. This matters — see `00-START-HERE.md`. |
| **Cost** | Free. |

**What it gives the project — four separate things, not one:**

1. **The code itself.** 154 commits. Every commit message explains what was
   measured and why the change was made; several are 40 lines long. This is a
   large part of the project's memory.
2. **The deploy trigger.** Render watches this branch. Push to it and the live
   site rebuilds by itself. Nothing else has to be done.
3. **GitHub Pages** — a second, free copy of the site as a static demo:
   <https://tradingvhasen-hash.github.io/Movie/>
   Built by `.github/workflows/pages.yml` on every push. It strips the server
   routes (`/api`, `/l`, `/u`) and ships a browser-only build. It is a backup
   and a quick preview, not the real site.
4. **GitHub Actions** — the machine that runs that build. Free minutes, no
   setup.

**If this disappears:** everything stops. Render deploys from it, Pages builds
from it, and the whole history of reasoning is in it.

**Secret:** none you need to handle. Git pushes authenticate through your
already-logged-in GitHub session or a personal access token your machine holds.

---

## NUMBER TWO — Render

| | |
|---|---|
| **What it is** | The computer that runs the real website, 24 hours a day. |
| **Link** | <https://render.com> — dashboard at <https://dashboard.render.com> |
| **The live site** | **<https://dhawq.onrender.com>** |
| **Service name** | `dhawq` |
| **Plan** | Free |
| **Region** | Frankfurt |
| **Deploys from** | branch `claude/movie-swipe-app-0bvkc8`, automatically on every push |
| **Cost** | Free. |

**What it gives the project:** a real Node.js server running `next start`. This
is what makes the 48,553-title catalog possible at all. GitHub Pages can only
serve static files, so the browser would have to download the whole catalog; a
server can put it behind an endpoint whenever we decide to.

**The configuration lives in the repo, not in the dashboard.** The file
`render.yaml` at the root of the project *is* the Render setup — build command,
start command, region, plan, health check, environment variables. If you ever
rebuild the service from scratch, Render reads that file (choose "Blueprint"
when creating the service) and configures itself.

**The one thing to know about the free plan:** the service goes to sleep after
about 15 minutes of nobody visiting. The next visitor waits **30–50 seconds**
for it to wake up. This is not a bug in the site. Measured on 18 Sep 2026: a
cold request took 32.7 seconds. Paying for the Starter plan removes this.

**Environment variables set here:** `NODE_VERSION` (22),
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Read or change them at:
**Render dashboard → `dhawq` → Environment → Environment Variables.**

**If this disappears:** the live site dies. The code and data survive. Re-deploy
by connecting the repo to any Node host — Render again, Railway, Fly, a VPS.
Nothing in the code is Render-specific except `render.yaml`.

---

## NUMBER THREE — TMDB (The Movie Database)

| | |
|---|---|
| **What it is** | The free, public, community-maintained database of every film and TV series. This is where **all 48,553 cards came from.** |
| **Link** | <https://www.themoviedb.org> |
| **Where your key is** | <https://www.themoviedb.org/settings/api> |
| **Cost** | Free for this kind of use. |

**What it gives the project — this is the single most important external
dependency.** Every piece of data on every card is TMDB's:

- the title, in English **and** in Arabic, **and** in its own original script
- the year, the poster image, the plot summary
- the genres, the keywords (up to 14 per title — these carry the real meaning)
- the director, the top 4 cast members
- the original language
- the rating and, more importantly, **the vote count** — the project's measure
  of how famous a title is, which the whole deck is built around
- `recommendations` — TMDB's "people who watched this also watched" list, which
  became the project's co-watch graph: **768,917 links between titles**

**Posters are served straight from TMDB** at `image.tmdb.org` every time anyone
opens the site. That is not a copy — it is a live link. If TMDB goes down, every
poster on the site goes blank.

**Where the key is used:** only in build scripts, never in the website.
`scripts/build-catalog.ts`, `scripts/extend-catalog.ts`,
`scripts/add-original-titles.ts`, `scripts/refetch-overviews.ts`,
`scripts/seed.ts`. It is read from the `TMDB_API_KEY` environment variable and
is **not** stored on Render, because the running site never calls TMDB's API —
it reads the pre-built `public/catalog.json`.

**How to read your key:** log in → click your avatar (top right) → **Settings**
→ **API** in the left menu → the value labelled **"API Key (v3 auth)"**.

**If this disappears:** the existing catalog keeps working forever — it is a
file in the repo. You just could never rebuild or grow it, and posters would
stop loading.

---

## NUMBER FOUR — Supabase

| | |
|---|---|
| **What it is** | A free hosted PostgreSQL database plus a login system. |
| **Link** | <https://supabase.com> |
| **Your project dashboard** | <https://supabase.com/dashboard/project/otgniwtpnxnyiqtrctqg> |
| **Your project URL** | `https://otgniwtpnxnyiqtrctqg.supabase.co` |
| **Cost** | Free tier. |

**Important: the project URL and the "anon key" are not secrets.** They are
compiled into the website's JavaScript and every visitor's browser already has
them — that is how they are designed to work. Safety comes from Row Level
Security rules in the database, not from hiding the key. The **service-role
key** is a different thing entirely and *is* a real secret.

**What it gives the project — all of it optional:**

1. **Accounts.** Sign in by email link. No password to remember or lose.
2. **Sync.** Your swipes, your taste profile and your lists follow you to
   another device.
3. **Public share links.** `/l/<slug>` shares one list; `/u/<slug>` shares a
   whole library. These routes exist only on the Render site, not on Pages.
4. **A cloud catalog + cloud ranking**, via `/api/recommend` — built, working,
   and **not used**. The app ranks in the browser instead. It is there for the
   day the catalog outgrows the browser.

**Tables** (from `supabase/migrations/`): `titles`, `item_similarity`,
`profiles`, `swipes`, `user_taste`, `lists`, `list_items`, `co_occurrence`.
Seven migration files, `0001` to `0007`, run in order.

**Where the secrets are:** Supabase dashboard → **Project Settings** → **API**.
- `Project URL` → goes in `NEXT_PUBLIC_SUPABASE_URL` (public)
- `anon` / `public` key → goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
- `service_role` key → **SECRET.** Never goes anywhere near `NEXT_PUBLIC_*`,
  never into the repo, never into Render. Used only on your own machine by
  `scripts/seed.ts`.

**If this disappears:** the site keeps working completely. Verified in the code:
`src/lib/supabase/configured.ts` checks for the two variables, and when they are
absent every cloud feature simply switches off and the app runs local-only.
What is lost: login, cross-device sync, and share links.

---

## NUMBER FIVE — Anthropic API console

| | |
|---|---|
| **What it is** | Paid API access to Claude, used for **one experiment**, not by the website. |
| **Link** | <https://console.anthropic.com> |
| **Cost** | Pay per use. A few dollars total. |

**What it gave the project:** a one-off bake-off. `scripts/trial-enrich.ts` and
`scripts/llm-exposure.py` asked a language model to describe the *feel* of
titles — mood and craft, the things a plot summary never mentions — to test
whether that made recommendations better than keywords alone. The output is
frozen in `scripts/data/ai-edges.json`. **The website never calls this API.**
Nothing runs on a schedule. There is no recurring charge unless you run those
scripts again.

**Where the secret is:** console.anthropic.com → **API Keys**. Read from
`ANTHROPIC_API_KEY`. A key can only be *seen once*, at creation — if you did not
save it, create a new one and delete the old.

**If this disappears:** nothing at all breaks.

---

## NUMBER SIX — Claude / Claude Code (claude.ai)

| | |
|---|---|
| **What it is** | The AI that wrote this project with you. |
| **Link** | <https://claude.ai> — the coding surface is <https://claude.ai/code> |
| **Cost** | Your subscription. |

**What it gives the project:** all of the engineering. Also — and this is the
part worth protecting — **the conversation history**, which contains reasoning
that never made it into a commit message.

**This matters for deletion.** Your chats are stored in your Anthropic account.
Deleting the GitHub repo does not delete them. `06-DELETE-EVERYTHING.md` covers
this.

---

## Used with NO account — nothing to find, nothing to delete

**NUMBER SEVEN — MovieLens / GroupLens**
<https://grouplens.org/datasets/movielens/> · download host
`files.grouplens.org`
A free public research dataset of real people's real film ratings. Downloaded
once, kept in `.cache/histories.json` (not in the repo). **This is the outside
referee** — 40 to 60 real watch histories that nobody in this project wrote,
used to grade the engine honestly. Without it every test would be the engine
marking its own homework. No sign-up.

**NUMBER EIGHT — Wikipedia / Wikimedia dumps**
`en.wikipedia.org`, `dumps.wikimedia.org`, `query.wikidata.org`
Used by `scripts/wiki-edges.py` and friends to build a "people who read about
this film also read about that one" graph, as an alternative source of links
between titles. Public, no key.

**NUMBER NINE — TMDB image CDN**
`image.tmdb.org`
Part of TMDB. Listed separately only because it is the one external host the
*live site* talks to on every page load, and it needs no key.

---

## The whole thing on one line each

1. **GitHub** — holds the code, triggers the deploy, hosts the backup demo. Public.
2. **Render** — runs the live site at dhawq.onrender.com. Free, sleeps when idle.
3. **TMDB** — where all 48,553 titles and all the posters come from. Free key.
4. **Supabase** — optional login, sync and share links. Site works fine without.
5. **Anthropic API** — one finished experiment. Nothing running.
6. **Claude (claude.ai)** — built it; holds the conversation history.
7. **MovieLens** — free dataset, the outside referee for every test.
8. **Wikipedia dumps** — free data for an alternative link graph.
9. **image.tmdb.org** — serves every poster, live, on every visit.

---

## The three real secrets, and only three

| Secret | Env var | Where to read it | What it can do if stolen |
|---|---|---|---|
| TMDB API key | `TMDB_API_KEY` | themoviedb.org → Settings → API | Query TMDB as you. Low harm; rotate and move on. |
| Supabase service-role key | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | **Full read/write on your database, ignoring all security rules.** This is the dangerous one. |
| Anthropic API key | `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Spend your money. |

Not secrets, though they look like it: `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both are already public in every visitor's
browser by design.

Fill in `KEYS.template.txt` with the real values and keep that filled copy off
this repository.
