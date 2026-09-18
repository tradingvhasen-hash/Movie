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
