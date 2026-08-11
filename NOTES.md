# Notebook — agreed ideas, deliberately not built yet

Parked by decision, not forgotten. Each entry says what it is, why it is
waiting, and what it would take.

---

## 1. Watch later

A fourth action on the swipe page ("save for later"), the same action
available from Discover, and a new page in the menu listing everything saved.

Distinct from a like: a like means *I watched this and enjoyed it*, watch-later
means *I haven't seen it and I want to*. It must therefore not feed the taste
tables the way a like does — at most a weak positive on the story/genre facets.

**Needs:** a `watchLater` set in the store (+ store version bump), a fourth
button in `SwipeDeck`, a page under `src/app/later/`, a nav entry.

---

## 2. Facet probing after a strong like

After a like the engine knows *that* you liked something, not *why*. The
learned facet weights infer it over ~15 swipes; a probe would settle it in
three.

Idea: right after a notable like, deliberately queue four variants — same
director, same lead actor, same story shape, same genre but everything else
different — and let the next few swipes attribute the credit directly.

**Needs:** a probe scheduler in `useDeck`, and a candidate picker per facet in
`recommend.ts`. The facet tables built in v8 are the prerequisite, and they now
exist.

---

## 3. Watch providers (Netflix, etc.)

Show where a title can actually be streamed.

**Needs:** TMDB `watch/providers` per title at catalog build time, and it is
country-specific — so either a country picker or IP-based detection, plus a
meaningful increase in catalog size (one provider list per title per country).

---

## 4. Cloud storage (Supabase)

The schema, migrations, RLS policies, pgvector index and the `/api/recommend`
route are all written and dormant. Deferred by agreement until the site is
finished, so the app stays a pure static export with no accounts to manage.

**Needs:** project creation, env vars, running the seed script. No new code.

---

## 5. Semantic "soul" layer

The current engine matches *symbols* — shared keywords, genres, people. It
cannot see that two films tell the same story in different words. Measured on
the real catalog:

| Pair | Similarity today |
|---|---|
| Parasite ↔ Knives Out | 0.117 (zero shared keywords) |
| The Truman Show ↔ The Matrix | 0.135 |

Both pairs are obvious matches to a person. Fixing this needs actual language
understanding, not better arithmetic.

**Shape:** at build time, send each title's metadata to a small model to
extract a structured soul profile (mood, tone, themes, narrative shape,
emotional arc), embed that profile, precompute each title's 40 nearest
neighbours, and ship only the neighbour table — the embeddings themselves never
reach the browser.

**Cost:** ~$3 one-off for the whole 5,555-title catalog via the Batch API;
embeddings free within Voyage's allowance; ~0.7 MB added to the bundle
gzipped. API keys would be build-time environment variables only — never
committed, never shipped to the client, exactly like the TMDB key.

**Status:** revisit *after* living with v8. If the deck now reads your taste in
40 swipes, this may not be needed at all — and that judgement should be made
against the improved engine, not the old one.
