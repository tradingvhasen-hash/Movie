/**
 * WOULD THIS OPEN ON HIS PHONE?
 *
 *   BASE=http://localhost:3000 node scripts/load-guard.mjs
 *
 * The catalog expansion shipped with every size measured except the one that
 * mattered: the total a cold phone pulls across BOTH threads. The main thread
 * and the rank worker each fetch their own copy of everything, so a file that
 * looks affordable on its own is charged twice, and the number nobody computed
 * came to ~24 MB on 4G. The reporter got a skeleton that never resolved.
 *
 * So this loads the real app over a throttled connection with the HTTP cache
 * disabled — a first visit, not a reload — and answers two questions:
 *
 *   1. how many bytes crossed the wire, per file and in total
 *   2. did a card actually appear, and how long did it take
 *
 * A guard rather than a report: it exits non-zero past the budgets, so this
 * cannot regress silently the way it just did.
 */
import { createRequire } from "node:module";

/* playwright is deliberately not a dependency of this project; find whichever
   copy exists, exactly as deck-guard.mjs does */
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  const { execFileSync } = await import("node:child_process");
  try {
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    ({ chromium } = require(root + "/playwright"));
  } catch {
    console.error("playwright is not installed. Install it for this run with:\n\n    npm i --no-save playwright\n");
    process.exit(2);
  }
}

const BASE = process.env.BASE ?? "http://localhost:3000";
/** Chrome DevTools' own "Slow 4G" preset */
const DOWN = Number(process.env.DOWN ?? 180_000); // bytes/sec ≈ 1.44 Mbps
const LATENCY = Number(process.env.LATENCY ?? 400); // ms per round trip
/**
 * 6.8 MB, because that is what the app cost BEFORE the catalog grew.
 *
 * Not a round number picked to pass: 6.76 MB is the measured settled total of
 * the 15,083-title build that worked on the reporter's phone — main thread
 * 2.74 + overviews 1.28, doubled by the worker fetching its own copy. Any
 * budget looser than "no worse than what already worked" is not a guard.
 *
 * The catalog is now 51,922 titles against 15,083 and the total is 6.33 MB,
 * under that line, because the worker no longer double-fetches and the deep
 * half ships as a search index rather than ranking data.
 */
const BUDGET_MB = Number(process.env.BUDGET_MB ?? 6.8);
const DEADLINE = Number(process.env.DEADLINE ?? 90_000);
/** how long to keep counting after the app opens, for the idle-time fetches */
const SETTLE = Number(process.env.SETTLE ?? 45_000);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

/**
 * COUNT WIRE BYTES, NOT HEADERS.
 *
 * A first attempt read `content-length` and reported 0.00 MB for a page that
 * plainly downloaded megabytes: Next serves compressed responses with chunked
 * encoding, which has no such header. CDP's `loadingFinished` carries
 * `encodedDataLength` — the bytes that actually crossed the wire, after
 * compression — which is the number the budget is about.
 */
const bytes = new Map();
const urlOf = new Map();

const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
cdp.on("Network.requestWillBeSent", (e) => {
  try {
    urlOf.set(e.requestId, new URL(e.request.url).pathname);
  } catch {
    /* data: and blob: urls are not interesting here */
  }
});
cdp.on("Network.loadingFinished", (e) => {
  const url = urlOf.get(e.requestId);
  if (!url) return;
  bytes.set(url, (bytes.get(url) ?? 0) + (e.encodedDataLength ?? 0));
});
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  downloadThroughput: DOWN,
  uploadThroughput: DOWN / 2,
  latency: LATENCY,
});

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const started = Date.now();
let firstCard = null;
let atPaint = 0;
try {
  await page.goto(BASE, { waitUntil: "commit", timeout: DEADLINE });
  /* a new visitor lands on the calibration grid; a returning one on the deck.
     Either counts as "the app opened" — a skeleton counts as neither, which is
     exactly what the reporter was looking at. */
  await page.waitForSelector("button[aria-pressed], .swipe-stage h2", { timeout: DEADLINE });
  firstCard = Date.now() - started;
  atPaint = [...bytes.values()].reduce((a, b) => a + b, 0);
  /**
   * Then keep watching. The search index and the plot summaries are fetched on
   * idle, deliberately behind the first paint — but the viewer still pays for
   * them, and a budget that stops counting at first paint would have missed
   * the entire 19 MB file that broke the app.
   */
  await page.waitForTimeout(SETTLE);
} catch {
  /* left null — reported as a failure below */
}

const rows = [...bytes.entries()].sort((a, b) => b[1] - a[1]);
const total = rows.reduce((s, [, n]) => s + n, 0);

console.log(`\n  Slow 4G · ${(DOWN / 125).toFixed(0)} kbps · ${LATENCY}ms RTT · cache off\n`);
for (const [url, n] of rows.slice(0, 10)) {
  if (n < 20_000) continue;
  console.log(`    ${(n / 1048576).toFixed(2).padStart(6)} MB  ${url}`);
}
console.log(`\n    ${(atPaint / 1048576).toFixed(2).padStart(6)} MB  by first paint`);
console.log(`    ${(total / 1048576).toFixed(2).padStart(6)} MB  TOTAL, once the idle fetches settle`);
console.log(
  `    ${firstCard === null ? "  never" : (firstCard / 1000).toFixed(1).padStart(6) + "s"}  to first paint of real content`
);
if (errors.length) console.log(`\n  page errors: ${errors.slice(0, 3).join(" · ")}`);

await browser.close();

const overBudget = total / 1048576 > BUDGET_MB;
const failed = firstCard === null || overBudget || errors.length > 0;
console.log(
  failed
    ? `\n  FAIL${firstCard === null ? " — nothing rendered" : ""}${
        overBudget ? ` — ${(total / 1048576).toFixed(2)} MB over the ${BUDGET_MB} MB budget` : ""
      }${errors.length ? " — page errors" : ""}\n`
    : `\n  PASS — ${(total / 1048576).toFixed(2)} MB, opened in ${(firstCard / 1000).toFixed(1)}s\n`
);
process.exit(failed ? 1 : 0);
