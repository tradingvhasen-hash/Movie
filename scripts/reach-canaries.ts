/**
 * DOES "EVERYTHING" ACTUALLY MEAN EVERYTHING?
 *
 *   npx tsx scripts/reach-canaries.ts
 *
 * The setting claims three depths and nobody could say whether the widest one
 * worked. The only check ever performed was a person swiping sixty cards and
 * reporting what they saw, which expires the moment the catalog is rebuilt and
 * cannot distinguish "not reachable" from "reachable and not dealt".
 *
 * THAT DISTINCTION IS THE WHOLE POINT, and it is the one the earlier attempt
 * at this setting got wrong. Two different things:
 *
 *     REACHABILITY   the gate admitted it, so the scorer saw it at all
 *     RECOMMENDATION the scorer ranked it highly enough to deal
 *
 * A canary does not have to appear in anybody's first ten cards. It has to
 * reach scoring. Asserting the stronger thing would make this test fail for
 * reasons that are not faults, and a test that cries wolf gets switched off.
 *
 * So: fixed canaries, chosen because they are the titles the owner named by
 * name as never appearing, plus one from each population the catalog rebuild
 * was for. Each must be OUTSIDE the gate on "narrow" — otherwise the setting
 * is not doing anything and the complaint was about something else — and
 * INSIDE it on "everything".
 *
 * Canaries are matched by title rather than by id so a catalog rebuild, which
 * changes ids, does not silently turn this into a test of nothing.
 */
import { loadFullCatalog, installCatalogRegions } from "./lib/catalog";
import {
  fameGate,
  fameTierSize,
  setReach,
  type CandidateItem,
} from "../src/lib/engine/recommend";
import { buildRarityIndex } from "../src/lib/engine/facets";
import { emptyProfile } from "../src/lib/engine/taste";
import type { Title } from "../src/lib/types";

const catalog = loadFullCatalog();
installCatalogRegions();
buildRarityIndex(catalog);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));

const byFame = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const fameRank = new Map(byFame.map((t, i) => [t.id, i + 1]));

/** the works the owner named, plus one per population the rebuild was for */
const CANARIES = [
  "The Tonight Show Starring Jimmy Fallon",
  "Key & Peele",
  "The Daily Show",
  "The Blue Elephant",
  "3 Idiots",
];

function find(name: string): Title | undefined {
  const want = name.toLowerCase();
  return (
    catalog.find((t) => t.title.en.toLowerCase() === want) ??
    catalog.find((t) => t.title.en.toLowerCase().includes(want)) ??
    catalog.find((t) => (t.title.original ?? "").toLowerCase() === want)
  );
}

/** a fresh viewer — the hardest case, and the one people actually arrive as */
const profile = emptyProfile();

function eligible(reach: "narrow" | "medium" | "wide"): Set<string> {
  setReach(reach);
  const gated = fameGate(pool, fameTierSize(profile, "swipe"), profile.facets, profile);
  return new Set(gated.map((c) => c.title.id));
}

const narrow = eligible("narrow");
const medium = eligible("medium");
const wide = eligible("wide");

let failures = 0;
const check = (name: string, pass: boolean, detail: string) => {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
};

console.log(
  `\ncatalog ${catalog.length}\n` +
    `  narrow      ${narrow.size} eligible (${((100 * narrow.size) / catalog.length).toFixed(1)}%)\n` +
    `  go deeper   ${medium.size} eligible (${((100 * medium.size) / catalog.length).toFixed(1)}%)\n` +
    `  everything  ${wide.size} eligible (${((100 * wide.size) / catalog.length).toFixed(1)}%)\n`
);

/**
 * The contract, stated as an assertion rather than as a sentence in Settings.
 * "Everything" that quietly means "most things" is the exact failure this had
 * once already: it shipped as a growth multiplier of 20, which at card 40 left
 * the pool at roughly 340 titles.
 */
check(
  "everything means the whole catalog, from the first card",
  wide.size === catalog.length,
  `${wide.size} of ${catalog.length} eligible for a brand-new viewer`
);

check(
  "the three settings are genuinely different",
  narrow.size < medium.size && medium.size < wide.size,
  `${narrow.size} < ${medium.size} < ${wide.size}`
);

console.log("\n  ── the titles that were never appearing ──\n");
for (const name of CANARIES) {
  const title = find(name);
  if (!title) {
    check(`canary present in the catalog: ${name}`, false, "not found in the catalog at all");
    continue;
  }
  const rank = fameRank.get(title.id) ?? 0;
  const inNarrow = narrow.has(title.id);
  const inWide = wide.has(title.id);
  check(
    `${title.title.en} (rank ${rank.toLocaleString()})`,
    !inNarrow && inWide,
    inNarrow
      ? "reachable even at narrow — this canary no longer tests anything"
      : inWide
        ? "outside the gate at narrow, reaches scoring at everything ✓"
        : "STILL unreachable at everything — the setting does not work"
  );
}

console.log(`\n${failures === 0 ? "all" : `${CANARIES.length + 2 - failures} of ${CANARIES.length + 2}`} checks passed\n`);
process.exit(failures ? 1 : 0);
