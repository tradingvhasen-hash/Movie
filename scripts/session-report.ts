/**
 * WHAT THE DECK ACTUALLY SPENT ITS CARDS ON.
 *
 *   npx tsx scripts/session-report.ts .cache/user-swipes-v6.json
 *   npx tsx scripts/session-report.ts            [every export, side by side]
 *
 * The product's stated goal is that a person can enter every film they have
 * watched in about a week of ordinary use. That makes exactly one number
 * matter, and it is not match quality: **what share of the cards dealt are
 * films this person has actually seen?** Every card spent on a film they have
 * never watched is a card that did not move the goal.
 *
 * `replay.ts` grades the engine's *taste* against his answers. This grades its
 * *aim*, and it does not simulate anything — it reads the cards the deck really
 * dealt him and the answers he really gave, and asks where the misses were.
 *
 * The breakdowns exist because "68% missed" is not actionable and
 * "68% missed, and 61% of those were non-English titles below fame rank 4,000"
 * is. The block table matters most: a deck that starts well and decays has a
 * different disease from one that is uniformly wrong, and only the first is
 * fixed by widening the gate.
 */
import { readFileSync, existsSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import type { SwipeAction, Title } from "../src/lib/types";

type Row = { id: string; a: SwipeAction; at: number };

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const byId = new Map(catalog.map((t) => [t.id, t]));

/**
 * Fame rank across the whole catalog, films and series together.
 *
 * The gate is expressed in these units ("the top 900"), so a report meant to
 * explain the gate has to speak them. Rank 1 is the most-voted title.
 */
const ranked = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const fameRank = new Map(ranked.map((t, i) => [t.id, i + 1]));

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      ".cache/user-swipes.json",
      ".cache/user-swipes-v2.json",
      ".cache/user-swipes-v3.json",
      ".cache/user-swipes-v4.json",
      ".cache/user-swipes-v5.json",
      ".cache/user-swipes-v6.json",
    ].filter(existsSync);

const pct = (n: number, d: number) => (d === 0 ? "  — " : `${((100 * n) / d).toFixed(1)}%`);
const median = (xs: number[]) =>
  xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** "watched it" in any form — the only thing the goal counts */
const watched = (a: SwipeAction) => a !== "not_seen";

for (const file of files) {
  const raw = JSON.parse(readFileSync(file, "utf8")) as { swipes?: Row[] } | Row[];
  const rows: Row[] = Array.isArray(raw) ? raw : (raw.swipes ?? []);
  /**
   * An import replays a whole file through `swipe()` inside one loop, so those
   * rows land microseconds apart and are not cards anybody was dealt. Anything
   * following its neighbour by under 50ms is machine-speed and is dropped, or
   * the report would grade a previous session twice.
   */
  const ordered = [...rows].sort((a, b) => a.at - b.at);
  const dealt = ordered.filter((r, i) => i === 0 || r.at - ordered[i - 1].at >= 50);
  const known = dealt.filter((r) => byId.has(r.id));

  const hit = dealt.filter((r) => watched(r.a));
  const miss = dealt.filter((r) => !watched(r.a));
  const minutes = (ordered[ordered.length - 1].at - ordered[0].at) / 60000;

  console.log(`\n${"═".repeat(78)}`);
  console.log(`${file}`);
  console.log(
    `  ${dealt.length} cards in ${minutes.toFixed(0)} min · ` +
      `${(dealt.length / Math.max(minutes, 1)).toFixed(0)} cards/min · ` +
      `${known.length} found in the catalog`
  );
  console.log(
    `  WATCHED ${hit.length} (${pct(hit.length, dealt.length)}) · ` +
      `never seen ${miss.length} (${pct(miss.length, dealt.length)})`
  );

  /* ── does it decay? the single most diagnostic table here ── */
  console.log("\n  by block of 100 cards");
  const BLOCK = 100;
  let line = "   ";
  for (let i = 0; i < dealt.length; i += BLOCK) {
    const block = dealt.slice(i, i + BLOCK);
    const w = block.filter((r) => watched(r.a)).length;
    line += ` ${String(Math.round((100 * w) / block.length)).padStart(3)}%`;
    if ((i / BLOCK) % 10 === 9) {
      console.log(line);
      line = "   ";
    }
  }
  if (line.trim()) console.log(line);

  /* ── where the misses come from ── */
  const bands: [string, number, number][] = [
    ["top 500", 1, 500],
    ["500–1k", 501, 1000],
    ["1k–2k", 1001, 2000],
    ["2k–4k", 2001, 4000],
    ["4k–8k", 4001, 8000],
    ["8k+", 8001, 1e9],
  ];
  console.log("\n  by fame rank        dealt   watched");
  for (const [label, lo, hi] of bands) {
    const inBand = known.filter((r) => {
      const rank = fameRank.get(r.id)!;
      return rank >= lo && rank <= hi;
    });
    if (inBand.length === 0) continue;
    const w = inBand.filter((r) => watched(r.a)).length;
    const bar = "█".repeat(Math.round((20 * inBand.length) / known.length));
    console.log(
      `    ${label.padEnd(10)} ${String(inBand.length).padStart(6)}  ${pct(w, inBand.length).padStart(7)}  ${bar}`
    );
  }

  /* ── language, because the catalog is 34 of them and he reads two ── */
  const byLang = new Map<string, { n: number; w: number }>();
  for (const r of known) {
    const t = byId.get(r.id)!;
    const e = byLang.get(t.originalLanguage) ?? { n: 0, w: 0 };
    e.n++;
    if (watched(r.a)) e.w++;
    byLang.set(t.originalLanguage, e);
  }
  console.log("\n  by language         dealt   watched");
  for (const [lang, e] of [...byLang.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)) {
    console.log(`    ${lang.padEnd(10)} ${String(e.n).padStart(6)}  ${pct(e.w, e.n).padStart(7)}`);
  }

  /* ── film vs series: MovieLens is blind to one of these ── */
  console.log("\n  by kind             dealt   watched");
  for (const kind of ["movie", "tv"] as const) {
    const inKind = known.filter((r) => byId.get(r.id)!.type === kind);
    if (inKind.length === 0) continue;
    const w = inKind.filter((r) => watched(r.a)).length;
    console.log(
      `    ${kind.padEnd(10)} ${String(inKind.length).padStart(6)}  ${pct(w, inKind.length).padStart(7)}`
    );
  }

  /* ── the shape of a miss, stated in one line ── */
  const missKnown = miss.filter((r) => byId.has(r.id));
  const hitKnown = hit.filter((r) => byId.has(r.id));
  console.log(
    `\n  median fame rank:  watched ${median(hitKnown.map((r) => fameRank.get(r.id)!))} · ` +
      `never seen ${median(missKnown.map((r) => fameRank.get(r.id)!))}`
  );
  const nonEnglish = (rs: Row[]) =>
    pct(rs.filter((r) => byId.get(r.id)!.originalLanguage !== "en").length, rs.length);
  console.log(
    `  non-English:       watched ${nonEnglish(hitKnown)} · never seen ${nonEnglish(missKnown)}`
  );
}
console.log();
