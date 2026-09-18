# START HERE

**Written 18 September 2026.** For: Dhawq (ذَوق) — the swipe app for films and series.

You are reading this because the chat where this project was built is gone, or
you are a new person, or a new AI, holding nothing but these files and the code.
These six files are the whole project outside the code. Read them in order.

---

## The six files

| # | File | What it answers |
|---|---|---|
| 1 | `01-SERVICES.md` | Every website I signed up to for this project, the link, and what each one does. |
| 2 | `02-PROJECT-INFO.md` | Everything a person holding only the code would not know. |
| 3 | `03-HOW-THE-SITE-WORKS.md` | How the whole site works. Where the cards came from, how to grow the catalog, where user data lives, where it deploys. |
| 4 | `04-THE-ALGORITHM.md` | The algorithm, in numbered points. What it depends on, in order. |
| 5 | `05-THE-TESTS.md` | Every test. The link, how to run it, how to read the result, why it exists. |
| 6 | `06-DELETE-EVERYTHING.md` | How to erase every trace of this project, in order, step by step. |

There is also `KEYS.template.txt` — see the next section.

---

## The one thing these files do not contain

**They do not contain your passwords or your API keys.** Not because of a rule
about what I am allowed to say — because of a fact about where these files go:

> **This repository is PUBLIC.** `github.com/tradingvhasen-hash/Movie` is
> readable by anyone on Earth, right now, without logging in. Anything written
> into a file here and pushed is published to the world within seconds, and
> GitHub keeps it in the commit history even after the file is deleted.

Putting your TMDB key or your Supabase service-role key in here would be the
exact opposite of the thing you asked for. You want a private copy on your
phone; this is a public noticeboard.

So instead: **`KEYS.template.txt`** is a blank form listing every secret this
project uses, with the exact click-path to find each one in your own account.
Open it, follow each click-path, paste the value, and save the finished file to
your phone's notes or password manager — **not** back into this folder.

Every one of those values is in an account you own and can read in under a
minute. File 1 tells you where each account is.

---

## The 60-second version of the project

- **What it is.** A website. You are shown a film or series poster. You swipe
  **right** if you watched it and liked it, **left** if you watched it and
  disliked it, **up** if you never watched it. It learns your taste and starts
  showing you things that fit.
- **The goal.** That a person can enter *every film and show they have ever
  watched* in about a week of normal use.
- **The live site.** <https://dhawq.onrender.com>
- **The code.** <https://github.com/tradingvhasen-hash/Movie>, branch
  `claude/movie-swipe-app-0bvkc8`.
- **The catalog.** 48,553 titles — 34,661 films, 13,892 series, 39 languages.
- **The open problem.** Early cards feel accurate and late cards do not. Of the
  first 50, about 40 land; of the last 50, about 2. This is called *the
  collapse* throughout these files. It is measured, it is partly understood, and
  it is not solved. File 4, section D, is the honest account of it.

---

## If you are an AI reading this cold

Read `02-PROJECT-INFO.md` first, then `04-THE-ALGORITHM.md`. Then read
`NOTES.md` in the repository root — it is 151 KB of the actual working log, with
every measurement and every failed idea written down at the time. Almost every
source file has a long comment at the top explaining *why* it is that way; those
comments are the real documentation and they are deliberately verbose.

Do not re-try things that are already marked as measured-and-failed in the
comments. The list of those is in `04-THE-ALGORITHM.md`, section E.
