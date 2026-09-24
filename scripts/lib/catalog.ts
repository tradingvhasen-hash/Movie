/**
 * THE CATALOG THE BROWSER RANKS.
 *
 * The production browser currently receives one encoded ranking catalog at
 * `public/catalog.json`; overviews are a separate lazy asset. Every benchmark
 * and experiment must load the same ranking catalog or it is grading a
 * different product. Keep this helper as the single script-side loader.
 */
import { readFileSync } from "node:fs";
import { installRegions } from "../../src/lib/engine/facets";
import { decodeCatalog, type EncodedCatalog } from "../../src/lib/data/catalog-codec";
import type { Title } from "../../src/lib/types";

const CORE = "public/catalog.json";
let cached: Title[] | null = null;

/** every rankable title that ships, in fame order */
export function loadFullCatalog(): Title[] {
  if (cached) return cached;
  cached = decodeCatalog(JSON.parse(readFileSync(CORE, "utf8")) as EncodedCatalog);
  return cached;
}

/**
 * Recommendation-graph regions, installed into the facet engine.
 *
 * Every ruler that measures the deck has to see the same regions the browser
 * sees, for the reason this file exists at all: an instrument that withholds
 * an input the thing under test consumes reports a number about neither. Call
 * this straight after `loadFullCatalog()`.
 *
 * Silent no-op when `public/regions.json` is absent, so a checkout that has
 * not run `build-regions.ts` still measures — the region facet is then empty
 * and contributes nothing, which is exactly the pre-region behaviour.
 *
 * IT LOADS THE FULL CATALOG ITSELF rather than taking the caller's. regions.json
 * is positional — one region id per title, in catalog order — and several
 * rulers filter before measuring: `harvest.ts` drops all 13,892 series because
 * MovieLens has no television. Passing that filtered list would have silently
 * mapped every region id to the wrong title. The length check below caught it
 * on the first run, and taking the argument away means it cannot recur.
 */
export function installCatalogRegions(): number {
  let raw: string;
  try {
    raw = readFileSync("public/regions.json", "utf8");
  } catch {
    return 0;
  }
  const catalog = loadFullCatalog();
  const data = JSON.parse(raw) as { v: number; count: number; r: number[] };
  if (data.r.length !== catalog.length) {
    throw new Error(
      `regions.json holds ${data.r.length} entries for a catalog of ${catalog.length}. ` +
        `Re-run: npx tsx scripts/build-regions.ts`
    );
  }
  const map = new Map<string, number>();
  for (let i = 0; i < catalog.length; i++) map.set(catalog[i].id, data.r[i]);
  installRegions(map);
  return data.count;
}
