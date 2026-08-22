/** Both roads to the grid actually go there, from a cold start. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { const { execFileSync } = await import("node:child_process");
  ({ chromium } = require(execFileSync("npm",["root","-g"],{encoding:"utf8"}).trim()+"/playwright")); }
const BASE = process.env.BASE || "http://localhost:3191";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = [];

/* 1 — from onboarding */
{
  const c = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await c.route("**://image.tmdb.org/**", r=>r.abort());
  const p = await c.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,120)));
  await p.goto(BASE+"/",{waitUntil:"domcontentloaded"});
  await p.locator("button[aria-pressed]").first().waitFor({timeout:60000});
  const offer = await p.getByText("Add forty at a time").count();
  await p.getByText("Add forty at a time").click();
  await p.waitForTimeout(3000);
  const tiles = await p.locator("button[aria-pressed]").count();
  results.push(["onboarding → grid", offer>0 && tiles===40, `offer ${offer}, ${tiles} posters, ${errs.length} errors`]);
  await c.close();
}
/* 2 — from the library */
{
  const c = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await c.route("**://image.tmdb.org/**", r=>r.abort());
  const p = await c.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,120)));
  await p.goto(BASE+"/library",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(3500);
  const link = await p.getByLabel("Add films").count();
  if (link) { await p.getByLabel("Add films").click(); await p.waitForTimeout(3000); }
  const tiles = await p.locator("button[aria-pressed]").count();
  results.push(["library → grid", link>0 && tiles===40, `link ${link}, ${tiles} posters, ${errs.length} errors`]);
  await c.close();
}
console.log("\n— entry points —");
let bad=0;
for (const [n,ok,note] of results){ if(!ok) bad++; console.log(`  ${ok?"ok  ":"FAIL"}  ${n.padEnd(20)} ${note}`); }
console.log(bad?"\nFAIL":"\nPASS");
await b.close(); process.exit(bad?1:0);
