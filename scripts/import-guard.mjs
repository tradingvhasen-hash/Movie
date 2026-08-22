/**
 * THE IMPORT PATH A PERSON ACTUALLY USES.
 *
 * `import-test.ts` measures the matcher on 60 libraries. It cannot see the
 * file input, the CSV branch, the catalog load, or whether the swipes land in
 * the store — all of which are where a wired-up feature usually breaks.
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

await p.goto(BASE + "/lab", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
await p.locator('input[type=file]').setInputFiles(CSV);

let status = "";
for (let i=0;i<40;i++){
  await p.waitForTimeout(1000);
  status = (await p.locator("body").innerText()).match(/added \d+ of \d+[^\n]*/)?.[0]
        ?? (await p.locator("body").innerText()).match(/could not[^\n]*/)?.[0] ?? "";
  if (status) break;
}
const store = await p.evaluate(() => {
  try { const s = JSON.parse(localStorage.getItem("dhawq-store")||"{}").state?.swipes||{};
    const out={}; for (const v of Object.values(s)) out[v.action]=(out[v.action]||0)+1;
    return { n: Object.keys(s).length, byAction: out };
  } catch { return { n:-1 }; }
});
console.log("\n— import guard —");
console.log("  status line   :", JSON.stringify(status));
console.log("  swipes stored :", store.n, JSON.stringify(store.byAction));
console.log("  page errors   :", errs.length ? errs.join(" | ") : "clean");
const ok = /added [1-9]/.test(status) && store.n >= 6 && errs.length === 0;
console.log(ok ? "\nPASS" : "\nFAIL");
await b.close();
process.exit(ok?0:1);
