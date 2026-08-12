import { readFileSync } from "node:fs";
import { decodeCatalog, type EncodedCatalog } from "../src/lib/data/catalog-codec";
import { featurize } from "../src/lib/engine/features";
import { recommend, type CandidateItem } from "../src/lib/engine/recommend";
import { applySwipe, emptyProfile } from "../src/lib/engine/taste";
import { buildRarityIndex } from "../src/lib/engine/facets";
import type { Title } from "../src/lib/types";

const catalog = decodeCatalog(JSON.parse(readFileSync("public/catalog.json","utf8")) as EncodedCatalog);
const idOf = new Map(catalog.map(t=>[t.title.en.toLowerCase(), t.id]));

// optionally overlay AI edges
if (process.env.AI_EDGES) {
  const raw = JSON.parse(readFileSync("scripts/data/ai-edges.json","utf8")) as Record<string,string[]>;
  const byId = new Map(catalog.map(t=>[t.id,t]));
  for (const [n,recs] of Object.entries(raw)) {
    const id = idOf.get(n.toLowerCase()); if(!id) continue;
    byId.get(id)!.related = recs.map(r=>idOf.get(r.toLowerCase())).filter((x): x is string => !!x && x!==id);
  }
}
const pool: CandidateItem[] = catalog.map(t=>({title:t}));
buildRarityIndex(catalog);
const vc=new Map<string,Float32Array>();
const vf=(t:Title)=>{let v=vc.get(t.id);if(!v){v=featurize(t);vc.set(t.id,v);}return v;};
const find=(n:string)=>catalog.find(t=>t.title.en.toLowerCase()===n.toLowerCase());

// FEEL-DEFINED tastes, expressed as the films themselves — not as a genre rule.
// Half are liked to build the profile; the other half is HELD OUT and is the
// answer key. The engine never sees the held-out half.
const PANELS: [string,string[]][] = [
  ["Mad Max: Fury Road (gritty practical action)", [
    "John Wick","John Wick: Chapter 2","Dredd","The Raid","Edge of Tomorrow",
    "Terminator 2: Judgment Day","Aliens","District 9","Snowpiercer","Sicario",
    "Children of Men","Predator","Total Recall","Kill Bill: Vol. 1","Baby Driver",
    "Nobody","Extraction","Atomic Blonde","Upgrade","Blade Runner 2049"]],
  ["Before Sunrise (quiet talky romance)", [
    "Before Sunset","Before Midnight","Lost in Translation","Her",
    "Eternal Sunshine of the Spotless Mind","In the Mood for Love",
    "Call Me by Your Name","La La Land","Blue Valentine","Once",
    "Annie Hall","(500) Days of Summer","Frances Ha","Lady Bird",
    "Marriage Story","Amélie","Midnight in Paris","Sideways","Manhattan","Past Lives"]],
];

console.log(`AI edges: ${process.env.AI_EDGES ? "ON" : "off"}\n`);
for (const [label, names] of PANELS) {
  const films = names.map(find).filter((t): t is Title => !!t);
  const half = Math.floor(films.length/2);
  const seedFilms = films.slice(0, half);       // liked
  const heldOut = new Set(films.slice(half).map(t=>t.id)); // answer key
  let p = emptyProfile(); const excl = new Set<string>();
  for (const t of seedFilms) { p = applySwipe(p, t, vf(t), "liked"); excl.add(t.id); }
  const recs = recommend(pool, p, { excludeIds: excl, count: 12, seed: 5, vectorFor: vf, mode: "discover", likedTitles: seedFilms });
  const hits = recs.filter(r=>heldOut.has(r.title.id));
  console.log(`${label}`);
  console.log(`   liked ${seedFilms.length}, held out ${heldOut.size}  →  ${hits.length}/12 of Discover is in the held-out answer key (${Math.round(100*hits.length/12)}%)`);
  console.log(`   ${recs.map(r=>(heldOut.has(r.title.id)?"✓ ":"· ")+r.title.title.en).join("\n   ")}\n`);
}
