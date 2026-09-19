# Experiments

Every measurement, with the three things that make it readable a year later:

1. **the date**
2. **the commit** it was run at
3. **the catalog size** it was run against

The third is not optional. This project has already acted twice on figures that
had silently stopped being true — three rounds of `/calibrate` answered against
15,083 titles, every derived number expressed as a share of a catalog that is
now 48,553, and nothing anywhere said so.

An experiment with no catalog size stamped on it cannot be quoted.

The full working log, in the order things happened, is `NOTES.md` at the repo
root. This directory is for results somebody will want to find on purpose.

## Results so far

| Date | Catalog | Result | Where |
|---|---|---|---|
| 2026-09-18 | 48,553 | The lost 54% are 2.35× more obscure than the found, and late-admitted titles are lost at 82–84% | `scripts/lost-titles.ts`, commit 5924e36 |
| 2026-09-18 | 48,553 | Exposure debt: no effect at three settings (193.5 → 195.4, inside noise) | `recommend.ts` DEBT_*, commit 57d4157 |
| 2026-09-18 | 48,553 | Co-watch regions as a scoring term: worse at four settings (198.8 → 194.9) | `facets.ts` SEEN_WEIGHTS.region, commit 421ace5 |
| 2026-09-18 | 48,553 | "Go deeper" was identical to "narrow" for a new viewer (900 = 900) | `scripts/reach-canaries.ts`, commit 34b9dfb |
| 2026-09-19 | 48,553 | `TARGET_SEEN` (active learning) refuted: monotonically worse, 198.1 → 133.4 at 0.5 | `recommend.ts`, this commit |
| 2026-09-19 | 48,553 | Tail at card 900 is NOT information-free: fame 0.757, shipped 0.757, **degree+fame 0.788** AUC against a 4.9% base rate | `scripts/tail-signal.ts` |
| 2026-09-19 | 48,553 | Language door was shut (`HOME_LANG_STRENGTH = 0`): 0 Arabic in 60 cards for an Arabic browser; 5 at 0.05 | `scripts/home-language-guard.ts` |
| 2026-09-19 | 48,553 | Frontier in the deck's score: monotonically worse at every weight (198.1 → 191.9 → 160.6 → 135.1) **despite being the highest-AUC signal available**. AUC ≠ harvest: accuracy within a batch is bought with coverage across the session | `recommend.ts` DECK_FRONTIER |
| 2026-09-19 | 48,553 | Burst (deck + grid when hot) is an **interpolation, not a synthesis**: deck 198.1/1,297·h · burst 139.1/1,462·h · grid 98.9/1,745·h. Grid wins on time, deck on cards; burst beats neither on its own metric | `scripts/harvest.ts` MODE=burst |
