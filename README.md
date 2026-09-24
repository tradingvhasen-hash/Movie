# ذَوق · Dhawq

ذَوق is a local-first movie and TV history app. Its primary job is not merely
"recommend something": it helps a person recover the titles they have actually
watched, record whether they liked them, and turn that history into a taste
profile and recommendations.

## Swipe language

- **Right** — watched and liked.
- **Left** — watched and disliked.
- **Up** — not watched by default. The meaning can be changed in Settings.
- **Eye button** — watched, no strong opinion.

The fast-add grid records only explicit watched taps. Untouched posters are weak
passes, not hard "not watched" answers.

## Current architecture

- Next.js 16 / React 19 / TypeScript.
- Zustand local-first state.
- Browser ranking worker over the shipped catalog.
- Optional Supabase account/sync using **Google sign-in**.
- Render is the production deployment.
- Public list/profile links are backed by Supabase RLS.
- PWA/service-worker caching is build-versioned.
- Arabic and English UI with RTL/LTR resolved before the first render.

The browser ranking engine is authoritative today. The old pgvector
`/api/recommend` endpoint was removed because the Supabase title catalog was not
the product's complete catalog and the endpoint added a cold network dependency
without contributing live recommendations.

## Local development

```bash
npm ci
npm run dev
```

Without Supabase keys the product still works as a local-first guest experience.

For account/sync features:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Account deletion runs in the authenticated Supabase Edge Function
`delete-account`. Its privileged key is supplied by Supabase's hosted function
environment and is never stored on Render or sent to the browser.

## Database

Schema changes live in `supabase/migrations/`. Apply migrations in order.
Current hardening migrations also:

- decouple swipe/list title identifiers from the incomplete Supabase
  `titles` seed table;
- restrict public profile libraries to explicit likes;
- keep list identity stable across devices;
- restrict maintenance RPCs to privileged roles;
- split RLS reads/writes by explicit roles.

Do not rewrite an already-applied historical migration to fix production. Add a
new migration.

## Catalog

The shipped catalog is generated from TMDB-derived data and currently contains
about 48.5k movie/TV titles. Rebuild tooling lives in `scripts/build-catalog.ts`.

TMDB's recommendation endpoint is used as a **TMDB recommendation graph**. It
must not be described as raw viewer-level "people who watched A also watched B"
telemetry; TMDB documents recommendation results, not that behavioral dataset.

See `/legal` for current TMDB attribution. Review the current TMDB terms before
commercial or ML/AI processing. Historical AI catalog experiments are disabled
unless separate authorization for that processing is explicitly confirmed.

## Recommendation work

The engine lives mainly under `src/lib/engine/`.

Before changing recommendation behavior:

```bash
npm run benchmark
```

That exact benchmark is the regression ruler. Do not replace a measured engine
change with a spec-sheet argument. The experiment log in
`docs/experiments/README.md` records ideas that were tested and rejected.

Useful additional guards include:

```bash
npm run sync
npm run canaries
npm run lang
npm run guard:source
```

CI also runs a production build and verifies that `CURRENT.md` can be
regenerated without a diff.

## Data safety

Every answer is written to the browser first. Signed-in accounts synchronize the
actual swipe rows, lists and taste profile rather than only a summary counter.

Local data has an explicit account owner. When a different account signs in on
the same browser, the previous account's library is not silently adopted by the
new account. Account deletion is a single Auth-user deletion inside Supabase;
verified foreign-key cascades remove the dependent cloud rows, then the browser
clears its local copy.

Browser persistence failures are surfaced in the UI instead of being silently
ignored. JSON backups are self-contained enough to restore titles even when the
catalog has changed, and CSV exports resolve human-readable title/year data.

## Deployment

Production is Render-backed. The GitHub Pages workflow is manual-only and should
be treated as a separate demo, not a second production site.

The release process is:

1. work on a feature/fix branch;
2. pass CI, build and recommendation benchmark;
3. review the diff;
4. merge into the stable production branch;
5. verify the deployed site and Supabase policy/schema state.

## Repository map

```text
src/app/                 routes and server endpoints
src/components/          product UI
src/lib/engine/          ranking/taste/exposure engine
src/lib/supabase/        auth, sync and sharing
src/lib/store.ts         local Zustand state and persistence
scripts/                 catalog, experiments and guards
supabase/migrations/     database schema / RLS changes
docs/                    architecture and experiment history
CURRENT.md               generated current facts
```

For the exact current catalog/routes, read `CURRENT.md`, not old experiment
notes.
