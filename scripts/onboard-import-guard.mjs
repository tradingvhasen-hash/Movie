/**
 * IMPORTING FROM THE FIRST SCREEN, WITHOUT TOUCHING A POSTER.
 *
 * The importer measured 100% and passed on /lab, but /lab is a page nobody
 * visits. This drives the path a real new user takes: land on the site, reach
 * the taste picker, hand it a Letterboxd file, and end up in the deck with a
 * library — no tile tapping at all.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { const { execFileSync } = await import("node:child_process");
  ({ chromium } = require(execFileSync("npm",["root","-g"],{encoding:"utf8"}).trim()+"/playwright")); }

const BASE = process.env.BASE || "http://localhost:3191";
const CSV = process.env.CSV || "scripts/data/letterboxd-sample.csv";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
await c.route("**://image.tmdb.org/**", r => r.abort());
const p = await c.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,160)));

await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.locator("button[aria-pressed]").first().waitFor({ timeout: 60000 });

const offer = await p.getByText(/Already track your films somewhere/).count();
await p.locator('input[type=file]').first().setInputFiles(CSV);

/* the receipt is shown for 1400ms and then the screen advances, so a
   one-second poll can step straight over it */
let status = "";
for (let i=0;i<120;i++){
  await p.waitForTimeout(150);
  const body = await p.locator("body").innerText().catch(()=>"");
  const m = body.match(/Added \d+ films?[^\n]*/);
  if (m) { status = m[0]; break; }
}
await p.waitForTimeout(3000);
const store = await p.evaluate(() => {
  try { const s = JSON.parse(localStorage.getItem("dhawq-store")||"{}").state?.swipes||{};
    return Object.keys(s).length; } catch { return -1; }
});
const inDeck = await p.locator(".swipe-stage h2").first().textContent().catch(()=>null);

console.log("\n— onboarding import —");
console.log("  offer on the first screen :", offer > 0 ? "yes" : "MISSING");
console.log("  status                    :", JSON.stringify(status));
console.log("  swipes stored             :", store);
console.log("  landed in the deck        :", inDeck ? JSON.stringify(inDeck.trim()) : "NO");
console.log("  page errors               :", errs.length ? errs.join(" | ") : "clean");
const ok = offer>0 && /Added [1-9]/.test(status) && store>=6 && Boolean(inDeck) && errs.length===0;
console.log(ok ? "\nPASS" : "\nFAIL");
await b.close();
process.exit(ok?0:1);
