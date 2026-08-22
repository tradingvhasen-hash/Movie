/**
 * THE DECK MUST NEVER DEAL THE SAME TITLE TWICE.
 *
 * This exists because a bug that *jammed the deck completely* stayed live for a
 * week and was found by the user, not by me. Pressing the 👁 button put that
 * title back at the front of the next rebuild, so a viewer who used the button
 * a few times stopped seeing new films at all: 44 presses produced 17 distinct
 * titles and then repeated one of them forever.
 *
 * Nothing caught it, and the reason is worth writing down. Every deck test I
 * had pressed ❤️ and 👎 and nothing else, because the 👁 button is **off by
 * default** — it only appears once "Fourth button" is switched on in Settings.
 * So the whole class of bug was unreachable by every guard I owned. A test that
 * only exercises the default configuration cannot find a bug in any other one.
 *
 * This guard therefore does three things the old ones did not:
 *
 *   1. turns the fourth button on, the way the user has it
 *   2. presses **every** answer, not just the two verdicts
 *   3. asserts the property the viewer actually cares about — that the deck
 *      keeps moving — rather than that any particular function was called
 *
 * It also checks the two things the fix must not have broken: 👁 still records
 * "watched" and still reaches the library, and undo still brings a card back.
 *
 * Run against the broken build it reported, and this is why the check on stored
 * answers is in here at all:
 *
 *     no title dealt twice        36 distinct of 44   FAIL
 *     👁 recorded as watched       3 stored, 9 pressed FAIL
 *
 * Nine 👁 presses, three surviving. A re-dealt card gets answered a second time,
 * and the second answer overwrites the first — so the bug did not only repeat
 * films, it **destroyed the answers already given**. Ordering bugs are annoying;
 * a deck that quietly rewrites what a person told it is a different category.
 *
 * Playwright is deliberately **not** a dependency of this project. Adding it
 * would put a browser download inside the deploy build for a test that never
 * runs there. Install it locally when you want to run this:
 *
 *     npm i --no-save playwright
 *     npx next build && npx next start -p 3191 &
 *     node scripts/deck-guard.mjs
 *
 * BASE overrides the address. CHROMIUM overrides the browser path.
 */
import { createRequire } from "node:module";

/**
 * Resolve playwright from wherever it happens to be.
 *
 * A bare `import "playwright"` only finds a copy inside this project, which is
 * exactly the copy we are not installing. A globally installed one is just as
 * good for a test, so try the project first and fall back to the global root
 * rather than failing on a package that is sitting right there.
 */
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
    console.error(
      "playwright is not installed. It is deliberately not a dependency of this\n" +
        "project — see the header. Install it for this run with:\n\n" +
        "    npm i --no-save playwright\n"
    );
    process.exit(2);
  }
}

const BASE = process.env.BASE || "http://localhost:3191";
const SWIPES = Number(process.env.SWIPES || 44);

/** the card exit flies for ~620ms; anything less reads a card mid-flight */
const SETTLE = 950;

const launch = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
/* pointing BASE at the deployed site only works if the browser goes through
   whatever proxy the shell is already using */
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy && !/localhost|127\.0\.0\.1/.test(BASE)) launch.proxy = { server: proxy };
const browser = await chromium.launch(launch);
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  ignoreHTTPSErrors: Boolean(proxy),
});
/* posters are not what this measures, and fetching 44 of them is slow */
await ctx.route("**://image.tmdb.org/**", (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

const top = async () =>
  ((await page.locator(".swipe-stage h2").first().textContent()) || "").trim();

const BUTTON = {
  eye: /Seen it, no strong feeling/,
  notSeen: /Haven't seen/,
  like: /Loved it/,
  dislike: /Not for me/,
  undo: /^Undo$/,
};

async function press(which) {
  await page.getByRole("button", { name: BUTTON[which] }).first().click({ timeout: 15000 });
  await page.waitForTimeout(SETTLE);
}

/* ── through onboarding, then switch the fourth button on ── */
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.locator("button[aria-pressed]").first().waitFor({ timeout: 60000 });
for (let i = 0; i < 6; i++) await page.locator("button[aria-pressed]").nth(i * 2).click();
await page.getByRole("button", { name: /^Start with/ }).click({ timeout: 20000 });
await page.waitForTimeout(2500);

await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.getByRole("switch", { name: "Fourth button" }).click();
await page.waitForTimeout(600); // the store batches its writes for 400ms
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const onScreen = await page
  .locator(".swipe-stage button, .swipe-actions button")
  .evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label") || e.textContent?.trim()).filter(Boolean)
  );

/* ── every answer, in rotation, deep enough to force several rebuilds ── */
const order = ["eye", "like", "dislike", "notSeen"];
const dealt = [];
const repeats = [];
const eyed = new Set();
for (let i = 0; i < SWIPES; i++) {
  const title = await top();
  if (!title) break;
  if (dealt.includes(title)) repeats.push({ at: i, title, eyed: eyed.has(title) });
  dealt.push(title);
  const which = order[i % order.length];
  if (which === "eye") eyed.add(title);
  await press(which);
}

/* ── undo is the one path that may legitimately bring a card back ── */
const beforeUndo = await top();
await press("undo");
const afterUndo = await top();

/* ── 👁 must still mean "watched": stored, and present in the library ── */
await page.goto(BASE + "/library", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const stored = await page.evaluate(() => {
  try {
    const raw = JSON.parse(localStorage.getItem("dhawq-store") || "{}");
    const swipes = raw?.state?.swipes || {};
    return Object.values(swipes).filter((s) => s.action === "seen").length;
  } catch {
    return -1;
  }
});
const libraryText = await page.locator("body").innerText();
const named = [...eyed].filter((t) => libraryText.includes(t)).length;

/* ── report ── */
const distinct = new Set(dealt).size;
const checks = [
  ["fourth button is on", onScreen.length === 5, onScreen.join(" · ")],
  ["deck kept moving", dealt.length === SWIPES, `${dealt.length} of ${SWIPES} cards dealt`],
  ["no title dealt twice", repeats.length === 0, `${distinct} distinct of ${dealt.length}`],
  ["undo brings a card back", afterUndo !== "" && afterUndo !== beforeUndo, `${beforeUndo} → ${afterUndo}`],
  ["👁 recorded as watched", stored === eyed.size, `${stored} stored, ${eyed.size} pressed`],
  ["👁 titles reach the library", named === eyed.size, `${named} of ${eyed.size} named`],
  ["no page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean"],
];

console.log("\n— deck guard —");
let failed = 0;
for (const [name, ok, note] of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name.padEnd(28)} ${note}`);
}
for (const r of repeats.slice(0, 8)) {
  console.log(`        re-dealt at swipe ${String(r.at).padStart(2)} ${r.eyed ? "👁 " : "   "}${r.title}`);
}
console.log(failed ? `\nFAIL — ${failed} of ${checks.length}` : `\nPASS — ${checks.length}/${checks.length}`);

await browser.close();
process.exit(failed ? 1 : 0);
