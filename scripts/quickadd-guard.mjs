/**
 * THE GRID, DRIVEN THE WAY A PERSON DRIVES IT.
 *
 * The +56% was measured in a simulator. This checks the screen actually built
 * from it: forty posters arrive, tapping marks watched, "None of these" still
 * records forty "not seen" answers, and a fresh screen follows with no repeats.
 * The last one matters most — a grid that re-deals what it just asked about is
 * the eye-icon bug again, in a new surface.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { const { execFileSync } = await import("node:child_process");
  ({ chromium } = require(execFileSync("npm",["root","-g"],{encoding:"utf8"}).trim()+"/playwright")); }
const BASE = process.env.BASE || "http://localhost:3191";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
await c.route("**://image.tmdb.org/**", r=>r.abort());
const p = await c.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,150)));

await p.goto(BASE+"/add",{waitUntil:"domcontentloaded"});
await p.locator("button[aria-pressed]").first().waitFor({timeout:60000});
const names = async () => p.locator("button[aria-pressed] .truncate").allInnerTexts();

const tiles1 = await p.locator("button[aria-pressed]").count();
const first = await names();
for (const i of [0,3,7]) await p.locator("button[aria-pressed]").nth(i).click();
const chosenLabel = await p.getByRole("button",{name:/Add 3/}).count();
await p.getByRole("button",{name:/Add 3/}).click();
await p.waitForTimeout(1500);
const second = await names();
const overlap = second.filter(t=>first.includes(t)).length;

await p.getByRole("button",{name:/None of these/}).click();
await p.waitForTimeout(1500);
const third = await names();
const overlap2 = third.filter(t=>[...first,...second].includes(t)).length;

const store = await p.evaluate(()=>{try{const s=JSON.parse(localStorage.getItem("dhawq-store")||"{}").state?.swipes||{};
 const v=Object.values(s); return {seen:v.filter(x=>x.action==="seen").length, notSeen:v.filter(x=>x.action==="not_seen").length};}catch{return{seen:-1,notSeen:-1};}});

console.log("\n— quick add grid —");
console.log("  posters on a screen      :", tiles1);
console.log("  button showed the count  :", chosenLabel>0?"yes":"NO");
console.log("  marked watched (stored)  :", store.seen);
console.log("  not-seen recorded free   :", store.notSeen);
console.log("  repeats on screen 2      :", overlap);
console.log("  repeats on screen 3      :", overlap2);
console.log("  page errors              :", errs.length?errs.join(" | "):"clean");
const ok = tiles1===40 && chosenLabel>0 && store.seen===3 && store.notSeen>=70 && overlap===0 && overlap2===0 && !errs.length;
console.log(ok?"\nPASS":"\nFAIL");
await b.close(); process.exit(ok?0:1);
