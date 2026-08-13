/**
 * Build the trial's closed world.
 *
 *   npm run world
 *
 * A method that enriches 150 titles cannot be measured against a catalog of
 * 5,555: the engine picks from everything, so most of what it returns has no
 * enrichment and the comparison says nothing. The fix is a smaller catalog
 * where *every* title is enriched, and a ruler that runs entirely inside it.
 *
 * The world is the 800 films most often rated 4+ by real MovieLens users, kept
 * to those present in our catalog. Two reasons for that ordering rather than
 * TMDB's vote count: the human ruler's answer key lives in this data, so
 * picking by it maximises how much of the key is reachable, and it is real
 * people's attention rather than a popularity number.
 *
 * Measured coverage — people with 20+ of their favourites inside the world:
 *
 *     world size    500    800   1200   1500   3091 (all)
 *     people        371    398    415    422    427
 *
 * 800 keeps 93% of the judging power for a quarter of the enrichment cost.
 *
 * Output: .cache/world.json — ids, and the metadata each method is allowed to
 * see. Not committed; rebuilt in seconds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import type { Title } from "../src/lib/types";

const ML = ".cache/ml-latest-small";
const OUT = ".cache/world.json";
const SIZE = Number(process.env.WORLD_SIZE ?? 800);

if (!existsSync(`${ML}/ratings.csv`)) {
  mkdirSync(".cache", { recursive: true });
  execFileSync("curl", [
    "-sSL", "-o", ".cache/ml.zip",
    "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip",
  ]);
  execFileSync("unzip", ["-o", "-q", ".cache/ml.zip", "-d", ".cache"]);
}

const rows = (f: string) =>
  readFileSync(`${ML}/${f}`, "utf8").replace(/\r/g, "").trim().split("\n").slice(1);

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const byTmdb = new Map<string, Title>();
for (const t of catalog) if (t.type === "movie") byTmdb.set(String(t.tmdbId), t);

const mlToTitle = new Map<string, Title>();
for (const line of rows("links.csv")) {
  const [movieId, , tmdbId] = line.split(",");
  const t = tmdbId ? byTmdb.get(tmdbId) : undefined;
  if (t) mlToTitle.set(movieId, t);
}

const likeCount = new Map<string, number>();
for (const line of rows("ratings.csv")) {
  const [, movieId, score] = line.split(",");
  if (Number(score) < 4) continue;
  const t = mlToTitle.get(movieId);
  if (!t) continue;
  likeCount.set(t.id, (likeCount.get(t.id) ?? 0) + 1);
}

const ids = [...likeCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, SIZE)
  .map(([id]) => id);

const inWorld = new Set(ids);
const titles = catalog.filter((t) => inWorld.has(t.id));

/** exactly what an enrichment method is given about a title — no more */
const brief = titles.map((t) => ({
  id: t.id,
  title: t.title.en,
  year: t.year,
  genres: t.genres,
  director: t.people.director ?? "",
  cast: t.people.cast.slice(0, 4),
  keywords: t.keywords.slice(0, 10),
  overview: t.overview.en,
}));

mkdirSync(".cache", { recursive: true });
writeFileSync(OUT, JSON.stringify({ size: ids.length, ids, brief }, null, 0));

const years = titles.map((t) => t.year).sort((a, b) => a - b);
const genres = new Map<string, number>();
for (const t of titles) for (const g of t.genres) genres.set(g, (genres.get(g) ?? 0) + 1);

console.log(`world: ${ids.length} films → ${OUT}`);
console.log(`years ${years[0]}–${years[years.length - 1]}, median ${years[Math.floor(years.length / 2)]}`);
console.log(
  "genres: " +
    [...genres.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([g, n]) => `${g}(${n})`)
      .join(" ")
);
