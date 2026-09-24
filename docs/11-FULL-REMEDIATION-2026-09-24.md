# Full audit remediation — release reconciliation

Baseline audited: `e95646155e9e4faff926a6311f5157fba086cdde`

This file is the release checklist for the 2026-09-24 50-item audit. It is
deliberately terse; design/experiment history belongs in `docs/experiments/`.

## Data safety / privacy

1. ✅ Public sharing uses narrow security-definer RPCs. Anonymous direct table reads are closed; the public-profile RPC returns only explicit likes. Live rollback test passed: 0 direct rows, like included, non-like excluded.
2. ✅ Account deletion moved to authenticated Supabase Edge Function; one admin Auth-user delete + FK cascades.
3. ✅ Local account deletion uses `eraseAllUserData`, including lists/profile/settings/research state.
4. ✅ Persisted `accountOwner` prevents cross-account browser-library adoption.
5. ✅ Continuous sync writes actual swipe/list rows plus taste, not taste alone.
6. ✅ Swipe reconciliation is per-title timestamp-based, not aggregate-count-based.
7. ✅ Neutral `seenIds` are sent through worker/server ranking.
8. ✅ Service-worker caches are build-versioned; mutable JSON revalidates.
9. ✅ Starter cards render immediately; normal swipe no longer waits for/preloads full catalog.
10. ✅ Empty-deck recovery only refills/re-ranks; it never wipes the library.
11. ✅ Browser persistence failure raises a visible warning instead of silently continuing.
12. ✅ CSV resolves real catalog/snapshot title and year.
13. ✅ Backups carry title snapshots and restore settings/profile/lists after required metadata is available.
14. ✅ Invalid sentinel instrumentation removed from the live deck.
15. ✅ Unselected onboarding favourites are weak passes, never hard `not_seen`.
16. ✅ Untouched fast-add posters are weak passes, never hard `not_seen`.
17. ✅ One app-level AccountProvider owns auth/reconciliation/sync side effects.
18. ✅ Lists have stable client identity across devices and deterministic edit timestamps.
19. ✅ Publishing updates by stable list identity, never by name.
20. ✅ Shared-list copy deduplicates by source identity; name collisions create a distinct local list.
21. ✅ Public profile resolves title ids from the application catalog; no dropped FK embed.
22. ✅ Public list fetches owner separately; no inferred nonexistent list→profile relation.
23. ✅ Profile edits persist to Supabase; Google metadata is fallback only.

## Product / platform correctness

24. ✅ Core production UI is Arabic/English; research-only calibration route is hidden unless explicitly enabled.
25. ✅ Initial server document resolves locale before hydration and renders correct `lang`/`dir`.
26. ✅ Explicit UI language contributes to recommendation language prior.
27. ✅ Settings uses generated catalog metadata; it never shows starter-pack count.
28. ✅ Full 48.5k candidate catalog is server-first for ranking/search; phones receive result slices. Static full catalog is fallback only.
29. ✅ Dead Supabase/pgvector recommendation API removed.
30. ✅ Server-rank failures use bounded retry/backoff and exact local fallback; no permanent session disable.
31. ⚠️ Owner/platform action: Render service is still on the free sleeping plan. Code cannot remove provider sleep; switch the existing service to an always-on plan if predictable first-hit latency is required.
32. ✅ Next.js pinned to patched 16.3.6 for the current 2026-09-24 release window.
33. ✅ Deliberate CSP/frame/referrer/content-type/permissions headers defined in Next config.
34. ✅ Browser zoom is no longer globally disabled.
35. ✅ Custom production dialogs use dialog semantics, Escape, focus trap, and focus return.
36. ✅ Error copy no longer promises data survival unconditionally.
37. ✅ Privacy/terms updated to current sync/deletion/sharing behavior in English and Arabic.
38. ✅ TMDB notice and approved-logo attribution are present; legal copy flags commercial/permission considerations.
39. ✅ Historical AI catalog experiment removed from npm commands and hard-gated behind explicit authorization.
40. ✅ TMDB recommendation edges are documented as recommendation/relatedness edges, not raw viewer co-watch telemetry.
41. ✅ Algorithm docs incorporate the newer late-tail evidence and refuted active-learning/frontier experiments.
42. ✅ `CURRENT.md` generation is deterministic and CI fails on drift.
43. ✅ README describes the current auth, sync, server-first catalog, Render, Supabase, and release architecture.
44. ✅ Dangerous stale source claims/measurements were removed or rewritten; current invariants stay in source, experiments stay in docs.
45. ⚠️ Owner/platform action: stable `main` will be created at the verified release SHA. GitHub App cannot administer branch-protection/default-branch settings; owner must set `main` as default/protected and point Render at it after release.
46. ✅ CI gates type generation, TypeScript, production build, generated facts, safety invariants, sync reconstruction, reach canaries, home-language guard, and exact `npm run benchmark`.
47. ✅ GitHub Pages is manual-only and explicitly a separate static demo.
48. ✅ Copying a shared list is local-first and does not require Google sign-in.
49. ✅ One profile identity model: cloud profile is authoritative, Google fills missing fields, local state mirrors it.
50. ✅ Source-level Arabic/RTL/product cleanup completed; final live visual click-through is a post-deploy verification step, not a source change.

## Live Supabase verification

- Hardening migrations applied.
- `delete-account` Edge Function ACTIVE with JWT verification.
- Obsolete `swipes.title_id -> titles.id` FK absent.
- Stable list identity + update timestamp present.
- Anonymous rollback public-sharing test: direct profiles/swipes/lists/list_items all hidden; profile RPC returned like only; list RPC returned intended titles; transaction rolled back.
- Supabase security advisor cleaned of the database/RPC/RLS warnings addressed by this remediation.

## Release gate

Do not merge the release until the latest branch head passes the complete CI
workflow, including the unchanged `npm run benchmark`.
