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
 * CORE_ONLY=1 grades the core alone, which is what a viewer sees for the first
 * few seconds. That is a real question — just not the default one.
 */
import { readFileSync, existsSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../../src/lib/data/catalog-codec";
import type { Title } from "../../src/lib/types";

const CORE = "public/catalog.json";
const TAIL = "public/catalog-tail.json";

let cached: Title[] | null = null;

/** every title that ships, core plus tail, in fame order */
export function loadFullCatalog(): Title[] {
  if (cached) return cached;
  const core = decodeCatalog(JSON.parse(readFileSync(CORE, "utf8")) as EncodedCatalog);
  if (process.env.CORE_ONLY === "1" || !existsSync(TAIL)) {
    cached = core;
  } else {
    const tail = decodeCatalog(JSON.parse(readFileSync(TAIL, "utf8")) as EncodedCatalog);
    cached = [...core, ...tail];
  }
  return cached;
}
