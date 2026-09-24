import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeCatalog, type EncodedCatalog } from "@/lib/data/catalog-codec";
import { buildRarityIndex } from "@/lib/engine/facets";
import { featurize } from "@/lib/engine/features";
import type { CandidateItem } from "@/lib/engine/recommend";
import type { Title } from "@/lib/types";

let catalogPromise: Promise<CandidateItem[]> | null = null;
let byId = new Map<string, CandidateItem>();
const vectors = new Map<string, Float32Array>();

/**
 * Full ranking catalog, resident on the server instead of being mandatory on
 * every phone. Render reads and decodes it once per process; subsequent rank
 * requests reuse the same immutable pool and rarity tables.
 */
export function getServerCatalog(): Promise<CandidateItem[]> {
  catalogPromise ??= (async () => {
    const raw = await readFile(join(process.cwd(), "public", "catalog.json"), "utf8");
    const encoded = JSON.parse(raw) as EncodedCatalog;
    const titles = decodeCatalog(encoded);
    buildRarityIndex(titles);
    const pool = titles.map((title) => ({ title }));
    byId = new Map(pool.map((item) => [item.title.id, item]));
    return pool;
  })();
  return catalogPromise;
}

export async function serverTitlesFor(ids: string[]): Promise<Title[]> {
  await getServerCatalog();
  const out: Title[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) out.push(item.title);
  }
  return out;
}

export function serverVectorOf(title: Title): Float32Array {
  let vector = vectors.get(title.id);
  if (!vector) {
    vector = featurize(title);
    vectors.set(title.id, vector);
  }
  return vector;
}
