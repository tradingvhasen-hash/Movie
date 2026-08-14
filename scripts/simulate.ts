/**
 * Engine simulation harness.
 *
 * Recommendation quality is not something you can eyeball from a few cards —
 * every regression in this app so far was found by measuring, not by looking.
 * This runs synthetic users with known tastes against the real catalog and
 * the real engine, and prints the numbers the v8 work is judged on.
 *
 *   npx tsx scripts/simulate.ts
 */
import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, fameTierSize, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile, type TasteProfile } from "../src/lib/engine/taste";
import { buildRarityIndex, titleTokens } from "../src/lib/engine/facets";
import type { SwipeAction, Title } from "../src/lib/types";

const catalog = decodeCatalog(
  JSON.parse(readFileSync("public/catalog.json", "utf8")) as EncodedCatalog
);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));
buildRarityIndex(catalog);

const vecCache = new Map<string, Float32Array>();
const vectorFor = (t: Title) => {
  let v = vecCache.get(t.id);
  if (!v) {
    v = featurize(t);
    vecCache.set(t.id, v);
  }
  return v;
};

const hasGenre = (t: Title, g: string) =>
  t.genres.some((x) => x.toLowerCase() === g.toLowerCase());
const hasKeyword = (t: Title, k: string) =>
  t.keywords.some((x) => x.toLowerCase().includes(k.toLowerCase()));

/** A synthetic viewer: decides an action for any title */
type Persona = (t: Title) => SwipeAction;

function runSession(
  persona: Persona,
  swipeCount: number,
  seed = 12345
): { profile: TasteProfile; shown: Title[]; timings: number[] } {
  let profile = emptyProfile();
  const shown: Title[] = [];
  const excludeIds = new Set<string>();
  const timings: number[] = [];

  while (shown.length < swipeCount) {
    const t0 = performance.now();
    const batch = recommend(pool, profile, {
      excludeIds,
      count: 10,
      seed,
      vectorFor,
    });
    timings.push(performance.now() - t0);
    if (batch.length === 0) break;

    for (const rec of batch) {
      if (shown.length >= swipeCount) break;
      const action = persona(rec.title);
      shown.push(rec.title);
      excludeIds.add(rec.title.id);
      profile = applySwipe(profile, rec.title, vectorFor(rec.title), action);
    }
  }
  return { profile, shown, timings };
}

/** the next N cards the engine would serve, without swiping them */
function peek(profile: TasteProfile, shown: Title[], n: number, seed = 12345): Title[] {
  return recommend(pool, profile, {
    excludeIds: new Set(shown.map((t) => t.id)),
    count: n,
    seed,
    vectorFor,
  }).map((r) => r.title);
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const results: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

console.log(`catalog: ${catalog.length} titles\n`);

/* ── 1. skip learning: the superhero complaint, exactly ───────────────── */
{
  const isSuper = (t: Title) =>
    hasKeyword(t, "superhero") || hasKeyword(t, "marvel") || hasKeyword(t, "dc comics");
  let profile = emptyProfile();
  const shown: Title[] = [];

  // force-feed ten superhero films and skip every one
  const supers = [...pool]
    .filter((c) => isSuper(c.title))
    .sort((a, b) => b.title.voteCount - a.title.voteCount)
    .slice(0, 10);
  for (const c of supers) {
    profile = applySwipe(profile, c.title, vectorFor(c.title), "not_seen");
    shown.push(c.title);
  }

  const next = peek(profile, shown, 20);
  const leaked = next.filter(isSuper).length;
  check(
    "skip learning — 10 superhero skips",
    leaked === 0,
    `${leaked}/20 superhero titles in the next 20 cards (target 0)`
  );
}

/* ── 2. convergence speed: does 40 swipes find a known taste? ─────────── */
{
  // a viewer who likes crime/thriller dramas and dislikes animation/family
  const likes = (t: Title) =>
    (hasGenre(t, "thriller") || hasGenre(t, "crime") || hasGenre(t, "mystery")) &&
    !hasGenre(t, "animation");
  const persona: Persona = (t) => {
    if (likes(t)) return "liked";
    if (hasGenre(t, "animation") || hasGenre(t, "family")) return "disliked";
    return "not_seen";
  };

  for (const n of [20, 40, 80]) {
    const { profile, shown } = runSession(persona, n);
    const next = peek(profile, shown, 20);
    const hit = next.filter(likes).length / next.length;
    check(
      `convergence after ${n} swipes`,
      n < 40 ? true : hit >= 0.7,
      `${pct(hit)} of the next 20 cards match the persona${n >= 40 ? " (target ≥70%)" : ""}`
    );
  }
}

/* ── 3. tunnel vision: one action like must not lock the deck ─────────── */
{
  let profile = emptyProfile();
  const action = [...pool]
    .filter((c) => hasGenre(c.title, "action"))
    .sort((a, b) => b.title.voteCount - a.title.voteCount)[0];
  profile = applySwipe(profile, action.title, vectorFor(action.title), "liked");

  const next = peek(profile, [action.title], 20);
  const share = next.filter((t) => hasGenre(t, "action")).length / next.length;
  check(
    "no tunnel vision — 1 action like",
    share <= 0.4,
    `${pct(share)} of the next 20 cards are action (target ≤40%)`
  );
}

/* ── 4. fame: the opening deck must be titles people have heard of ────── */
{
  const { shown } = runSession(() => "not_seen", 40);
  const minVotes = Math.min(...shown.map((t) => t.voteCount));
  const tier = fameTierSize(emptyProfile());
  check(
    "fame gate — first 40 cards",
    minVotes >= 5000,
    `lowest vote count shown: ${minVotes.toLocaleString()} (tier = top ${tier}, target ≥5,000)`
  );
}

/* ── 5. two users must not get the same deck ──────────────────────────── */
{
  const a = runSession(() => "not_seen", 20, 111).shown.map((t) => t.id);
  const b = runSession(() => "not_seen", 20, 999).shown.map((t) => t.id);
  const overlap = a.filter((id) => b.includes(id)).length / a.length;
  check(
    "session variety — two seeds",
    overlap < 0.95,
    `${pct(overlap)} of the first 20 cards are shared between two users`
  );
}

/* ── 6. performance: a re-rank must not be felt ───────────────────────── */
{
  const { timings } = runSession(
    (t) => (hasGenre(t, "drama") ? "liked" : "not_seen"),
    120
  );
  const sorted = [...timings].sort((x, y) => x - y);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const worst = sorted[sorted.length - 1];
  /**
   * The threshold is deliberately loose because the absolute number is
   * hardware-dependent — the same commit measures ~12ms on one build machine
   * and ~21ms on another. It is a regression guard, not a spec.
   *
   * The guarantee that actually matters is structural and is verified in the
   * browser instead: the rebuild runs inside requestIdleCallback and
   * consecutive swipes collapse into one, so this cost never sits between a
   * user's gesture and the next card.
   */
  check(
    "re-rank cost",
    worst < 40,
    `median ${p50.toFixed(1)}ms, worst ${worst.toFixed(1)}ms over ${timings.length} rebuilds ` +
      `(guard <40ms; hardware-dependent, and off the swipe critical path)`
  );
}

/* ── 7. facet attribution: liking one director's films must be noticed ── */
{
  let profile = emptyProfile();
  const shown: Title[] = [];
  // pick a director with several titles in the catalog
  const counts = new Map<string, Title[]>();
  for (const c of pool) {
    const d = c.title.people.director;
    if (!d) continue;
    counts.set(d, [...(counts.get(d) ?? []), c.title]);
  }
  const [director, films] = [...counts.entries()]
    .filter(([, f]) => f.length >= 5)
    .sort((a, b) => b[1].reduce((s, t) => s + t.voteCount, 0) - a[1].reduce((s, t) => s + t.voteCount, 0))[0];

  for (const t of films.slice(0, 4)) {
    profile = applySwipe(profile, t, vectorFor(t), "liked");
    shown.push(t);
  }
  const next = peek(profile, shown, 20);
  const found = next.some((t) => t.people.director === director);
  check(
    "facet attribution — 4 likes from one director",
    found,
    `${director}: ${found ? "another of their films surfaced" : "no further film surfaced"} in the next 20`
  );
}

/* ── 8. Discover for a single-taste library: the reported failure ─────── */
{
  // a real "I only watch broad comedies" library, named explicitly rather
  // than filtered by genre tag — "top comedies by votes" is mostly Deadpool
  // and Thor: Ragnarok, which is a different viewer entirely
  const WANT = [
    "The Hangover", "Superbad", "Anchorman: The Legend of Ron Burgundy",
    "Step Brothers", "Bridesmaids", "21 Jump Street", "Ted", "Dumb and Dumber",
    "Zoolander", "Tropic Thunder", "We're the Millers", "Horrible Bosses",
    "The 40 Year Old Virgin", "Knocked Up", "Pineapple Express", "Old School",
    "Wedding Crashers", "Napoleon Dynamite", "Mean Girls",
  ];
  const liked = WANT.map((n) =>
    catalog.find((t) => t.title.en.toLowerCase() === n.toLowerCase())
  ).filter((t): t is Title => Boolean(t));

  let profile = emptyProfile();
  const exclude = new Set<string>();
  for (const t of liked) {
    profile = applySwipe(profile, t, vectorFor(t), "liked");
    exclude.add(t.id);
  }

  const recs = recommend(pool, profile, {
    excludeIds: exclude,
    count: 12,
    seed: 5,
    vectorFor,
    mode: "discover",
    likedTitles: liked,
  });
  const hits = recs.filter((r) => hasGenre(r.title, "comedy")).length;
  /**
   * The target was 10 when it was written, because 10 is what the co-watch
   * signal scored and the signal was the change being guarded.
   *
   * That was the wrong thing to lock in. Genre purity is not the goal — a good
   * answer to "I love Brooklyn Nine-Nine" is Modern Family, which shares no
   * genre with half the library, and this project exists because Discover kept
   * returning the right category with the wrong feel. Measured against 150
   * real MovieLens libraries, the setting that scored 10/12 here recommends
   * *worse* for actual people (13.6% vs 20.1%), so this check was rewarding
   * the thing that hurt them.
   *
   * It stays as a floor, not a target: Discover must not wander off the taste
   * altogether. 8/12 is what the engine scored before co-watch existed.
   */
  check(
    "Discover stays on a single-taste library",
    hits >= 8,
    `${hits}/12 recommendations are comedies for a ${liked.length}-comedy library ` +
      `(floor ≥8 — purity is not the goal; see the human ruler)`
  );
}

/* ── 9. co-watch reaches where shared metadata cannot ─────────────────── */
{
  /**
   * Data-health guard on the co-watch links, plus an honest measurement of
   * where their value comes from.
   *
   * The original hypothesis was that they would mostly connect titles our
   * metadata cannot relate at all. Measured, that is only ~7% of links — most
   * co-watch pairs are sequels or share a genre and cast, which the facet
   * tables already see. The real contribution turns out to be *ordering*:
   * among the many titles that look similar on paper, these say which ones
   * the same audience actually watches. That is what took the single-taste
   * Discover benchmark above from 8/12 to 12/12, not new reach.
   */
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const overlap = (a: Title, b: Title) => {
    const ta = titleTokens(a);
    const tb = titleTokens(b);
    let shared = 0;
    for (const kind of ["story", "genre", "cast", "director"] as const) {
      const set = new Set(tb[kind]);
      for (const tok of ta[kind]) if (set.has(tok)) shared++;
    }
    return shared;
  };

  let total = 0;
  let blind = 0;
  for (const t of catalog) {
    for (const id of t.related ?? []) {
      const other = byId.get(id);
      if (!other) continue;
      total++;
      if (overlap(t, other) <= 1) blind++;
    }
  }
  const share = blind / Math.max(total, 1);
  const linked = catalog.filter((t) => (t.related?.length ?? 0) > 0).length;
  const perTitle = total / catalog.length;
  check(
    "co-watch coverage",
    linked / catalog.length >= 0.95 && perTitle >= 5,
    `${pct(linked / catalog.length)} of titles have links, ${perTitle.toFixed(1)} each on ` +
      `average (${total.toLocaleString()} total); ${pct(share)} of them join titles sharing ` +
      `≤1 keyword/genre/actor/director`
  );
}

/* ── 10. the deck must not circle inside one family ───────────────────── */
{
  /**
   * Reaching a *specific* title by swiping. Not a goal in itself — hundreds of
   * titles usually match a taste equally well, so any single one is a needle —
   * but it is a sharp detector for a deck that has stopped exploring.
   *
   * At full strength the co-watch signal did exactly that: every like drags in
   * its own ~8 neighbours, so a handful of likes pinned the same few hundred
   * titles to the top of every batch. Total swipes across these targets went
   * 340 → 489. Scaling it down in deck mode brought it back to 343 while
   * Discover kept the full-strength signal, and its benchmark above.
   */
  const targets = ["Rush Hour", "The Conjuring", "La La Land", "Superbad"];
  let totalWith = 0;
  let totalWithout = 0;

  for (const name of targets) {
    const target = catalog.find((t) => t.title.en === name);
    if (!target) continue;
    const tg = new Set(target.genres.map((g) => g.toLowerCase()));
    const similar = (t: Title) => {
      const g = new Set(t.genres.map((x) => x.toLowerCase()));
      let shared = 0;
      for (const x of g) if (tg.has(x)) shared++;
      return shared / new Set([...g, ...tg]).size >= 0.5;
    };

    for (const useCoWatch of [false, true]) {
      let profile = emptyProfile();
      const seen = new Set<string>();
      const liked: Title[] = [];
      let swipes = 0;
      const CAP = 400;
      while (swipes < CAP) {
        const batch = recommend(pool, profile, {
          excludeIds: seen,
          count: 10,
          seed: 5,
          vectorFor,
          likedTitles: useCoWatch ? liked : undefined,
        });
        if (batch.length === 0) break;
        let found = false;
        for (const r of batch) {
          if (r.title.id === target.id) {
            found = true;
            break;
          }
          const action = similar(r.title) ? "liked" : "disliked";
          if (action === "liked") liked.push(r.title);
          profile = applySwipe(profile, r.title, vectorFor(r.title), action);
          seen.add(r.title.id);
          swipes++;
          if (swipes >= CAP) break;
        }
        if (found) break;
      }
      if (useCoWatch) totalWith += swipes;
      else totalWithout += swipes;
    }
  }

  const ratio = totalWith / Math.max(totalWithout, 1);
  check(
    "deck still explores with co-watch on",
    ratio <= 1.15,
    `${totalWith} swipes to reach ${targets.length} targets vs ${totalWithout} with the ` +
      `signal off (${ratio.toFixed(2)}×; target ≤1.15× — it was 1.44× at full strength)`
  );
}

/* ── 11. "I have not seen it" must never delete a taste ───────────────── */
{
  /**
   * The worst bug this engine has had, written as a check so it cannot come
   * back.
   *
   * The skip-streak detector benched any facet value skipped three times in a
   * row, and `genre` was one of the facets it was allowed to bench. A viewer
   * swiping up on unfamiliar comedies — "never heard of this one" — was read
   * as "this viewer dislikes comedy", and comedy left the deck for forty
   * cards. The user's words were "the taste gradually starts disappearing".
   *
   * The check is written the way the failure happened: a real comedy taste
   * first, then a run of honest "not seen" answers on comedies too obscure to
   * recognise. Their taste must survive it.
   */
  const comedies = [...pool]
    .filter((c) => hasGenre(c.title, "comedy"))
    .sort((a, b) => b.title.voteCount - a.title.voteCount)
    .map((c) => c.title);
  // a real broad-comedy library, not "the top comedies by votes" — that list
  // is Deadpool and Thor: Ragnarok, which is a superhero viewer
  const library = [
    "The Hangover", "Superbad", "Anchorman: The Legend of Ron Burgundy",
    "Step Brothers", "Bridesmaids", "21 Jump Street", "Ted", "Dumb and Dumber",
    "Zoolander", "Tropic Thunder",
  ]
    .map((n) => catalog.find((t) => t.title.en.toLowerCase() === n.toLowerCase()))
    .filter((t): t is Title => Boolean(t));
  // comedies far enough down the catalog that not having seen them is honest
  const unfamiliar = comedies.slice(1500).slice(0, 30);

  /**
   * The measure is *lift*, not share.
   *
   * Share cannot separate the two things that move it. Answering "not seen"
   * thirty times correctly narrows the pool to better-known titles, and the
   * better-known end of this catalog is less comedy-heavy — so the comedy
   * share falls even when the ranking is behaving perfectly. Lift over what
   * the pool itself offers isolates the ranking, which is the thing at risk.
   */
  const gateBase = (profile: TasteProfile, shown: Title[]) => {
    const seen = new Set(shown.map((t) => t.id));
    const inGate = [...catalog]
      .sort((a, b) => b.voteCount - a.voteCount)
      .slice(0, fameTierSize(profile))
      .filter((t) => !seen.has(t.id));
    return inGate.filter((t) => hasGenre(t, "comedy")).length / Math.max(inGate.length, 1);
  };

  const measure = (skips: Title[]) => {
    let profile = emptyProfile();
    const shown: Title[] = [];
    for (const t of library) {
      profile = applySwipe(profile, t, vectorFor(t), "liked");
      shown.push(t);
    }
    for (const t of skips) {
      profile = applySwipe(profile, t, vectorFor(t), "not_seen");
      shown.push(t);
    }
    const next = peek(profile, shown, 20);
    const share = next.filter((t) => hasGenre(t, "comedy")).length / Math.max(next.length, 1);
    const benched = Object.keys(profile.streaks.cooldown)
      .filter((k) => profile.streaks.cooldown[k] > profile.totalSwipes)
      .filter((k) => catalog.some((t) => t.genres.some((g) => g.toLowerCase() === k)));
    return { lift: share / Math.max(gateBase(profile, shown), 1e-6), benched };
  };

  const clean = measure([]);
  const after = measure(unfamiliar);
  const kept = after.lift / Math.max(clean.lift, 1e-6);

  check(
    "a taste survives 30 unfamiliar titles inside it",
    after.benched.length === 0 && kept >= 0.9 && after.lift >= 1.4,
    `comedy lift ${clean.lift.toFixed(2)}× before the skips, ${after.lift.toFixed(2)}× after ` +
      `(${pct(kept)} kept, target ≥90% and ≥1.40×); benched genres: ` +
      `${after.benched.join(", ") || "none"} (target none)`
  );
}

/* ── summary ──────────────────────────────────────────────────────────── */
const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? `\nfailing: ${failed.map((f) => f.name).join(", ")}` : "")
);
process.exit(failed.length > 0 ? 1 : 0);
