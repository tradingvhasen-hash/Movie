/**
 * IS THERE ANY INFORMATION LEFT IN THE TAIL?
 *
 *   npx tsx scripts/tail-signal.ts
 *   AT=900 USERS=40 npx tsx scripts/tail-signal.ts
 *
 * Every fix tried so far assumed the ranking could do better at the end of a
 * long session and went looking for a better signal. Two of them measured
 * worse and one measured nothing:
 *
 *     co-watch degree in the gate        tail 12.1 -> 11.5
 *     co-watch degree in the ordering    tail 12.1 -> 10.8   (-14 titles)
 *     tripling the recognition weight    tail 12.1 -> 12.3   (nothing)
 *
 * The third is the informative one. Raising the weight on a signal changes
 * nothing when the signal is FLAT — when it gives every remaining candidate
 * the same score. That is a testable claim about the tail and nobody has
 * tested it, which is why three fixes were built on a guess.
 *
 * So: run a real session to card AT, stop, and look at what is left. Take the
 * candidates the gate holds that the person has not answered, label each one
 * by whether it is actually in their history, and ask of every signal
 * available — how well does it separate the two?
 *
 *     AUC 0.50   the signal cannot tell them apart at all
 *     AUC 0.70   there is real information here and the ranking is wasting it
 *
 * If everything reads near 0.5, no reordering can fix the collapse and the
 * answer has to come from somewhere else entirely — a different pool, a
 * different question, or the honest admission that a session has a natural
 * length. If something reads high, the collapse is a ranking bug and this
 * says which signal to build on.
 *
 * Deliberately measured at card AT rather than card 0: the opening is not
 * where the problem is, and a bench that scores a profile built in one shot
 * has already been shown to disagree with the session that matters.
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { buildRarityIndex, titleTokens } from "../src/lib/engine/facets";
import { fameGate, fameTierSize, recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile, watchLikelihood } from "../src/lib/engine/taste";
import type { SwipeAction, Title } from "../src/lib/types";

const AT = Number(process.env.AT ?? 900);
const USERS = Number(process.env.USERS ?? 40);
const OPENING = 12;

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
buildRarityIndex(catalog);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
const byId = new Map(catalog.map((t) => [t.id, t]));
const ranked = [...catalog].sort((a, b) => b.voteCount - a.voteCount);
const fameRank = new Map(ranked.map((t, i) => [t.id, i + 1]));
const fameOf = (t: Title) => 1 - fameRank.get(t.id)! / catalog.length;

const vc = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vc.get(t.id);
  if (!v) {
    v = featurize(t);
    vc.set(t.id, v);
  }
  return v;
};

const histories = JSON.parse(readFileSync(".cache/histories.json", "utf8")) as Record<
  string,
  [string, number][]
>;

/** area under the ROC curve, by the rank-sum identity */
function auc(scored: { s: number; pos: boolean }[]): number {
  const sorted = [...scored].sort((a, b) => a.s - b.s);
  let rank = 1;
  let sumPos = 0;
  let nPos = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].s === sorted[i].s) j++;
    // average rank across a tie group, or ties inflate a flat signal to 1.0
    const avg = (rank + (rank + (j - i))) / 2;
    for (let k = i; k <= j; k++) {
      if (sorted[k].pos) {
        sumPos += avg;
        nPos++;
      }
    }
    rank += j - i + 1;
    i = j + 1;
  }
  const nNeg = sorted.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

type Row = { s: number; pos: boolean };
const bags = new Map<string, Row[]>();
const add = (name: string, rows: Row[]) => {
  const b = bags.get(name) ?? [];
  b.push(...rows);
  bags.set(name, b);
};

let poolSizes = 0;
let positives = 0;
let people = 0;

for (const [, history] of Object.entries(histories).slice(0, USERS)) {
  const seen = new Map<string, number>();
  for (const [id, rating] of history) if (byId.has(id)) seen.set(id, rating);
  if (seen.size < 100) continue;

  let profile = emptyProfile();
  const shown = new Set<string>();
  const liked: Title[] = [];
  const disliked: Title[] = [];
  const neutral: Title[] = [];

  const favourites = [...seen.entries()]
    .filter(([, r]) => r >= 4)
    .map(([id]) => byId.get(id)!)
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, OPENING);
  for (const t of favourites) {
    profile = applySwipe(profile, t, vf(t), "liked");
    liked.push(t);
    shown.add(t.id);
  }

  /* ── run a real session to card AT ── */
  let cards = 0;
  while (cards < AT) {
    const recs = recommend(pool, profile, {
      mode: "swipe",
      excludeIds: shown,
      count: 20,
      seed: 7,
      vectorFor: vf,
      likedTitles: liked,
      dislikedTitles: disliked,
      seenTitles: neutral,
    });
    if (recs.length === 0) break;
    for (const r of recs) {
      if (cards >= AT) break;
      const title = r.title;
      const rating = seen.get(title.id);
      const action: SwipeAction =
        rating === undefined ? "not_seen" : rating >= 4 ? "liked" : rating >= 3 ? "seen" : "disliked";
      if (action === "liked") liked.push(title);
      else if (action === "disliked") disliked.push(title);
      else if (action === "seen") neutral.push(title);
      profile = applySwipe(profile, title, vf(title), action);
      shown.add(title.id);
      cards++;
    }
  }

  /* ── freeze, and look at what the gate is holding that they have not answered ── */
  const watched = [...liked, ...neutral, ...disliked];
  const gated = fameGate(pool, fameTierSize(profile, "swipe"), profile.facets, profile);
  const rest = gated.filter((c) => !shown.has(c.title.id));
  if (rest.length === 0) continue;

  const known = new Set(watched.map((t) => t.id));
  const inbound = new Map<string, number>();
  for (const t of watched) for (const id of t.related ?? []) inbound.set(id, (inbound.get(id) ?? 0) + 1);
  const degreeOf = (t: Title) => {
    let out = 0;
    for (const id of t.related ?? []) if (known.has(id)) out++;
    return out + (inbound.get(t.id) ?? 0);
  };

  const label = (c: CandidateItem) => seen.has(c.title.id);
  const rows = (f: (c: CandidateItem) => number): Row[] =>
    rest.map((c) => ({ s: f(c), pos: label(c) }));

  add("fame (vote count)", rows((c) => fameOf(c.title)));
  add("watchLikelihood (ships)", rows((c) => watchLikelihood(profile, titleTokens(c.title), fameOf(c.title))));
  add("personal facets only", rows((c) => watchLikelihood(profile, titleTokens(c.title), 0)));
  add("co-watch degree", rows((c) => degreeOf(c.title)));
  add("rating", rows((c) => c.title.rating));
  add("year", rows((c) => c.title.year));
  add("degree + fame tiebreak", rows((c) => degreeOf(c.title) + fameOf(c.title)));

  poolSizes += rest.length;
  positives += rest.filter(label).length;
  people++;
}

console.log(`\n  ${people} people · session run to card ${AT} · then frozen`);
console.log(
  `  candidates still in the gate and unanswered: ${Math.round(poolSizes / people)} each\n` +
    `  of which actually in their history: ${Math.round(positives / people)} ` +
    `(${((100 * positives) / poolSizes).toFixed(1)}% — the base rate the deck faces at that point)\n`
);
console.log("    signal                        AUC     what it means");
for (const [name, rows] of bags) {
  const a = auc(rows);
  const verdict =
    a >= 0.7 ? "real information, being wasted" : a >= 0.6 ? "weak but present" : a >= 0.55 ? "barely anything" : "nothing";
  console.log(`    ${name.padEnd(28)} ${a.toFixed(3)}   ${verdict}`);
}
console.log(
  `\n  0.500 means the signal cannot separate a title they watched from one they\n` +
    `  did not. If every row here is near 0.5, no reordering can fix the tail.\n`
);
