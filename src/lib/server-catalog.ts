import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeCatalog, type EncodedCatalog } from "@/lib/data/catalog-codec";
import { buildRarityIndex } from "@/lib/engine/facets";
import { featurize } from "@/lib/engine/features";
import type { CandidateItem } from "@/lib/engine/recommend";
import type { Title } from "@/lib/types";
import { normalise, searchText } from "@/lib/search-core";

let catalogPromise: Promise<CandidateItem[]> | null = null;
let byId = new Map<string, CandidateItem>();
let searchHay: string[] = [];
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
    searchHay = titles.map(searchText);
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


export async function searchServerTitles(
  query: string,
  skipIds: Set<string>,
  limit = 24
): Promise<Title[]> {
  const q = normalise(query);
  if (q.length < 2) return [];
  const pool = await getServerCatalog();

  const starts: Title[] = [];
  const contains: Title[] = [];
  for (let i = 0; i < pool.length; i++) {
    const at = searchHay[i].indexOf(q);
    if (at < 0) continue;
    const title = pool[i].title;
    if (skipIds.has(title.id)) continue;
    if (at === 0 || searchHay[i].charCodeAt(at - 1) === 32) starts.push(title);
    else contains.push(title);
  }

  const byFame = (a: Title, b: Title) => b.voteCount - a.voteCount;
  starts.sort(byFame);
  if (starts.length >= limit) return starts.slice(0, limit);
  contains.sort(byFame);
  return [...starts, ...contains].slice(0, limit);
}
