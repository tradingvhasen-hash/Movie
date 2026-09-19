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

/**
 * THIS GUARD DRIVES /lab, WHICH PRODUCTION NO LONGER SERVES.
 *
 * /lab is a development instrument and it 404s in a production build — it
 * carries a button that erases a library and an unlinked URL is not a
 * protection. So this guard needs a build where it exists.
 *
 * ENABLE_LAB=1 MUST BE SET FOR THE BUILD, NOT FOR THE SERVER. The page is a
 * server component and Next prerenders it statically, so the 404 is baked into
 * the output at build time; setting the variable when starting an already-built
 * server does nothing at all. That is the intended strength of the guard —
 * nothing in a production bundle can render it — and it is also the thing that
 * makes the obvious fix silently fail.
 *
 * The path a REAL person takes to import is the onboarding screen, and that
 * has its own guard: `scripts/onboard-import-guard.mjs`. This one tests the
 * matcher wired to a file input, which is still worth having and is still the
 * quickest way to see a CSV land in the store.
 *
 * Failing with the reason rather than a locator timeout, because the timeout
 * reads as "the importer is broken" and the truth is "the page is not here".
 */
const res = await p.goto(BASE + "/lab", { waitUntil: "domcontentloaded" });
if (res && res.status() === 404) {
  console.error(
    "\n/lab returns 404 — this is a production build, where it is deliberately\n" +
      "not served. Run the server with ENABLE_LAB=1, or use `npm run dev`.\n\n" +
      "The user-facing import path is covered by onboard-import-guard.mjs.\n"
  );
  await b.close();
  process.exit(2);
}
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
