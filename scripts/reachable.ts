/**
 * CAN THE DECK REACH THE FILMS HE HAS ACTUALLY WATCHED?
 *
 *   npx tsx scripts/reachable.ts
 *
 * Three rounds of `/calibrate` drew 599 titles at random from every depth of
 * the catalog and asked one question. It is the only sample in this project the
 * engine did not choose, and it says he has watched **5.0%** of the catalog —
 * about 755 titles of 15,083.
 *
 * His last full session dealt 1,098 cards and found 346 of them.
 *
 * So the interesting titles are the ones in the blind sample he says he has
 * watched: they are a random draw from the ~400 the deck has not found, and
 * they can be looked up one by one. This prints them with their fame rank, so
 * "the gate is too tight" stops being an opinion — either they sit outside it
 * or they do not.
 *
 * It also prints the same for the titles he says he has NOT watched, because a
 * gate that admits his library and nothing else is the goal, and a rule that
 * only lets the right ones in is worth nothing if it lets everything else in
 * too.
 */
import { readFileSync, existsSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import type { SwipeAction } from "../src/lib/types";

type Cal = { id: string; seen: boolean; voteCount: number; lang: string; type: string; year: number };
type Row = { id: string; a: SwipeAction; at: number };

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const byId = new Map(catalog.map((t) => [t.id, t]));
const ranked = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const fameRank = new Map(ranked.map((t, i) => [t.id, i + 1]));

const CAL = [
  ".cache/calibration-199.json",
  ".cache/calibration-200-v2.json",
  ".cache/calibration-200-v3.json",
].filter(existsSync);

const sample: Cal[] = CAL.flatMap(
  (f) => (JSON.parse(readFileSync(f, "utf8")) as { sample: Cal[] }).sample
);

/** every title he has ever answered in the deck, across all six sessions */
const SESSIONS = [
  ".cache/user-swipes.json",
  ".cache/user-swipes-v2.json",
  ".cache/user-swipes-v3.json",
  ".cache/user-swipes-v4.json",
  ".cache/user-swipes-v5.json",
  ".cache/user-swipes-v6.json",
].filter(existsSync);

const dealtEver = new Set<string>();
const watchedEver = new Set<string>();
for (const f of SESSIONS) {
  const raw = JSON.parse(readFileSync(f, "utf8")) as { swipes?: Row[] } | Row[];
  for (const r of Array.isArray(raw) ? raw : (raw.swipes ?? [])) {
    dealtEver.add(r.id);
    if (r.a !== "not_seen") watchedEver.add(r.id);
  }
}

const seen = sample.filter((r) => r.seen);
const unseen = sample.filter((r) => !r.seen);

console.log(`\nBLIND SAMPLE — ${sample.length} titles drawn at random from the whole catalog`);
console.log(
  `  watched ${seen.length} (${((100 * seen.length) / sample.length).toFixed(1)}%) → ` +
    `about ${Math.round(catalog.length * (seen.length / sample.length))} of ${catalog.length} titles`
);
console.log(`  the deck has dealt him ${dealtEver.size} distinct titles across ${SESSIONS.length} sessions`);
console.log(`  of which he said he had watched ${watchedEver.size}`);

const line = (r: Cal) => {
  const t = byId.get(r.id);
  const rank = fameRank.get(r.id);
  const name = t ? t.title.en : "(not in catalog)";
  const flag = dealtEver.has(r.id) ? (watchedEver.has(r.id) ? "dealt·kept" : "dealt·MISSED") : "never dealt";
  return `    ${String(rank ?? "—").padStart(6)}  ${String(r.voteCount).padStart(6)} votes  ${flag.padEnd(12)} ${name}`;
};

console.log(`\n  ── the ${seen.length} he HAS watched ──`);
console.log("     rank   votes                     title");
for (const r of seen.sort((a, b) => (fameRank.get(a.id) ?? 1e9) - (fameRank.get(b.id) ?? 1e9))) {
  console.log(line(r));
}

/**
 * The gate is stated as a depth in this ranking, so the only question that
 * matters is what share of his library falls inside a given depth — and what
 * share of everything else comes in with it.
 */
console.log(`\n  ── what a gate at each depth would admit ──`);
console.log("     depth      his library     everything else     precision");
for (const depth of [500, 900, 1500, 2500, 4000, 6000, 9000, catalog.length]) {
  const inSeen = seen.filter((r) => (fameRank.get(r.id) ?? 1e9) <= depth).length;
  const inUnseen = unseen.filter((r) => (fameRank.get(r.id) ?? 1e9) <= depth).length;
  const total = inSeen + inUnseen;
  console.log(
    `    ${String(depth).padStart(6)}  ${String(inSeen).padStart(4)}/${seen.length} ` +
      `(${((100 * inSeen) / seen.length).toFixed(0).padStart(3)}%)   ` +
      `${String(inUnseen).padStart(4)}/${unseen.length} (${((100 * inUnseen) / unseen.length).toFixed(0).padStart(3)}%)   ` +
      `${total === 0 ? "  —" : ((100 * inSeen) / total).toFixed(1) + "%"}`
  );
}

console.log(
  `\n  A card dealt at random from the whole catalog would be one he has watched ` +
    `${((100 * seen.length) / sample.length).toFixed(1)}% of the time.`
);
console.log(
  `  His last session ran at 31.5%, and its last hundred cards at 8%.` +
    `\n  So the deck's tail is now performing WORSE than dealing at random.\n`
);
