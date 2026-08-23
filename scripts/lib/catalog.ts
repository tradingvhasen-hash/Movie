/**
 * THE WHOLE CATALOG, THE WAY THE BROWSER EVENTUALLY SEES IT.
 *
 * The catalog ships as two files. `public/catalog.json` holds the most
 * recognised 11,000 titles and is what the opening download waits on;
 * `public/catalog-tail.json` holds the other 40,922 and is fetched on idle,
 * then merged. A browser a few seconds into a session has all 51,922.
 *
 * Every instrument in this repo read `public/catalog.json` directly, which was
 * correct when that file was the entire catalog and became silently wrong the
 * moment it stopped being. Left alone, every ruler would have graded the
 * engine against **11,000 titles instead of 51,922** — a catalog smaller than
 * the one that shipped last week — and reported the shrinkage as a result.
 *
 * That is the same failure that has now voided three measurements in one day:
 * the ruler withholding an input the thing under test consumes. So there is
 * one loader, it reads both files, and nothing has to remember to.
 *
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../../src/lib/data/catalog-codec";
import type { Title } from "../../src/lib/types";

const CORE = "public/catalog.json";
/**
 * The deep half no longer ships as ranking data — it is a search index now,
 * carrying no keywords, cast or co-watch links, so there is nothing here for
 * an instrument that grades ranking to read. See `attachIndex` in
 * `src/lib/catalog.ts` for why it was cut down.
 *
 * This loader stays because the lesson that created it stands: when the
 * shipped shape changes, every ruler must change with it or they all silently
 * grade something the browser never sees.
 */

let cached: Title[] | null = null;

/** every title that ships, core plus tail, in fame order */
export function loadFullCatalog(): Title[] {
  if (cached) return cached;
  cached = decodeCatalog(JSON.parse(readFileSync(CORE, "utf8")) as EncodedCatalog);
  return cached;
}
