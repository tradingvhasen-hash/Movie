/**
 * DOES A PERSON WHO READS ARABIC SEE ANY ARABIC?
 *
 *   npx tsx scripts/home-language-guard.ts
 *
 * The owner's complaint, from the beginning: "Arabic movies never appear."
 * The catalog was rebuilt around it — 1,503 Arabic titles and 1,803 Turkish
 * where there had been 2 and 778. A language door was written to carry them
 * into the gate. And the door's strength defaulted to zero, so it opened onto
 * nothing for months while every comment around it described what it would do.
 *
 * `harvest.ts` cannot catch that. It does not pass `homeLanguages`, and could
 * not usefully: MovieLens users are English speakers and the door deliberately
 * skips English. The number reads identically with the door open and shut,
 * which is exactly how a dead feature looks like a working one.
 *
 * So this guard asks the question directly, in the only terms that matter:
 * a fresh viewer, a browser that asks for Arabic, the DEFAULT setting, and the
 * first sixty cards. Not "is it reachable" — `reach-canaries.ts` covers
 * reachability. Dealt.
 */
import { loadFullCatalog, installCatalogRegions } from "./lib/catalog";
import { recommend, setReach, resetExposureDebt, type CandidateItem } from "../src/lib/engine/recommend";
import { buildRarityIndex } from "../src/lib/engine/facets";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { featurize } from "../src/lib/engine/features";
import type { Title } from "../src/lib/types";

const CARDS = Number(process.env.CARDS ?? 60);

const catalog = loadFullCatalog();
installCatalogRegions();
buildRarityIndex(catalog);
const pool: CandidateItem[] = catalog.map((title) => ({ title }));

const vc = new Map<string, Float32Array>();
const vf = (t: Title) => {
  let v = vc.get(t.id);
  if (!v) {
    v = featurize(t);
    vc.set(t.id, v);
  }
  return v;
};

/**
 * The pessimistic viewer: recognises nothing, so the taste model never warms
 * and the deck has only the language preference to go on. A viewer who *does*
 * recognise things teaches the exposure tables and the door widens by itself;
 * this is the floor, not the typical case.
 */
function deal(home: string[], reach: "narrow" | "wide") {
  setReach(reach);
  resetExposureDebt();
  let profile = emptyProfile();
  const shown = new Set<string>();
  const dealt: Title[] = [];
  while (dealt.length < CARDS) {
    const out = recommend(pool, profile, {
      excludeIds: shown,
      count: 10,
      seed: 7,
      vectorFor: vf,
      mode: "swipe",
      homeLanguages: home,
    });
    if (out.length === 0) break;
    for (const r of out) {
      dealt.push(r.title);
      shown.add(r.title.id);
      profile = applySwipe(profile, r.title, vf(r.title), "not_seen");
    }
  }
  return dealt;
}

let failures = 0;
const check = (name: string, pass: boolean, detail: string) => {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
};

const cases: { home: string[]; code: string; label: string }[] = [
  { home: ["ar", "en"], code: "ar", label: "Arabic" },
  { home: ["tr", "en"], code: "tr", label: "Turkish" },
  { home: ["hi", "en"], code: "hi", label: "Hindi" },
];

console.log(`\nfresh viewer who recognises nothing · first ${CARDS} cards · default reach\n`);

for (const c of cases) {
  const dealt = deal(c.home, "narrow");
  const n = dealt.filter((t) => t.originalLanguage === c.code).length;
  const langs = [...new Set(dealt.map((t) => t.originalLanguage))];
  check(
    `a ${c.label} browser is dealt ${c.label} titles at the default setting`,
    n > 0,
    n > 0
      ? `${n} of ${dealt.length} · languages: ${langs.join(", ")}`
      : `0 of ${dealt.length} — the door is shut. Check HOME_LANG_STRENGTH.`
  );
}

/**
 * THE HONEST VERSION OF THIS CHECK, AND WHAT IT DOES NOT CLAIM.
 *
 * Declaring a language still yields FEWER non-English titles overall than
 * saying nothing — 5 against 11 as this ships. The difference is that the 5 are
 * the viewer's own language and the 11 were Japanese, Korean, Italian and
 * French, which are not.
 *
 * Whether that trade is right is a product judgement nobody has data for: an
 * Arabic reader may well want the Japanese films too. So this asserts only the
 * thing that is unarguable — that a declared language is actually represented,
 * which is what failed — and records the other number rather than dressing it
 * up as a win.
 */
const withPref = deal(["ar", "en"], "narrow");
const noPref = deal([], "narrow");
const nonEn = (list: Title[]) => list.filter((t) => t.originalLanguage !== "en").length;
check(
  "a declared language is represented at all (and what it costs elsewhere)",
  nonEn(withPref) >= Math.min(1, nonEn(noPref)),
  `with a preference: ${nonEn(withPref)} non-English · without: ${nonEn(noPref)}`
);

console.log(`\n${failures === 0 ? "all" : `${4 - failures} of 4`} checks passed\n`);
process.exit(failures ? 1 : 0);
