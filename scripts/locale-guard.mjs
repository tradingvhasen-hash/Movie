/**
 * DOES THE ARABIC INTERFACE ACTUALLY EXIST?
 *
 *   BASE=http://localhost:3000 node scripts/locale-guard.mjs
 *
 * `src/messages/ar.json` held 76 real Arabic translations for months while the
 * served page was `<html lang="en" dir="ltr">` with not one Arabic character
 * in it. Everything looked wired: the locale was declared, next-intl was
 * installed, the catalogue was complete. `LocaleProvider` was hard-coded to
 * English and nothing checked.
 *
 * A translation file is not an interface. This drives a real browser and
 * asserts the four things that have to be true for an Arabic speaker, none of
 * which a type-check or a unit test can see:
 *
 *   1. picking العربية actually puts Arabic on the screen
 *   2. the document flips to rtl, so the layout mirrors
 *   3. THE GESTURE DOES NOT FLIP — right stays ❤️. Swiping is motor memory,
 *      not a sentence; changing the language must not retrain the hand.
 *   4. a device set to Arabic gets Arabic without being asked
 *
 * Playwright is deliberately not a dependency of this project — it is
 * resolved from a global install, like every other browser guard here.
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "playwright is not installed in this project — that is deliberate.\n" +
      "Install it for this run with:\n\n    npm i --no-save playwright\n"
  );
  process.exit(2);
}

let failures = 0;
const check = (name, pass, detail) => {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
};

const ARABIC = /[؀-ۿ]/;

/**
 * The Chromium this environment already has, rather than one downloaded per
 * run. A Playwright installed fresh asks for whatever build it was pinned to
 * and refuses to start without it; the pre-installed binary works perfectly
 * well for asking a page what language it is in. `PW_CHROME` overrides it.
 */
const EXECUTABLE = process.env.PW_CHROME ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {}
);
try {
  /* ── 1 & 2 · choosing العربية ── */
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  /* posters come from TMDB and are irrelevant to a language check; blocking
     them keeps the guard fast and independent of that service being up */
  await page.route("**://image.tmdb.org/**", (r) => r.abort());

  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  const arabicButton = page.getByText("العربية", { exact: true }).first();
  const hasSwitch = await arabicButton.count();
  check(
    "there is a language switch at all",
    hasSwitch > 0,
    hasSwitch > 0 ? "found العربية in Settings" : "no Arabic option on the settings screen"
  );

  if (hasSwitch > 0) {
    await arabicButton.click();
    await page.waitForTimeout(600);

    const dir = await page.evaluate(() => document.documentElement.dir);
    const lang = await page.evaluate(() => document.documentElement.lang);
    check(
      "the document flips to Arabic, right to left",
      dir === "rtl" && lang === "ar",
      `lang="${lang}" dir="${dir}"`
    );

    const text = await page.evaluate(() => document.body.innerText);
    const arabicRuns = (text.match(/[؀-ۿ]+/g) ?? []).length;
    check(
      "Arabic words are actually on the screen",
      ARABIC.test(text) && arabicRuns >= 3,
      `${arabicRuns} Arabic words rendered`
    );

    /* ── 3 · the gesture must NOT mirror ── */
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const stillRtl = await page.evaluate(() => document.documentElement.dir);
    const deckText = await page.evaluate(() => document.body.innerText);
    check(
      "the deck stays in Arabic after navigating",
      stillRtl === "rtl" && ARABIC.test(deckText),
      `dir="${stillRtl}", Arabic present: ${ARABIC.test(deckText)}`
    );

    /**
     * The swipe map in Settings is pinned `dir="ltr"` precisely so the
     * ←👎 👍→ diagram does not mirror when the text does. If that container
     * ever loses its direction the diagram starts telling Arabic readers that
     * left means liked, and the engine will disagree with them forever after.
     */
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const mapDir = await page.evaluate(() => {
      const el = [...document.querySelectorAll("[dir='ltr']")].find((n) =>
        n.textContent?.includes("←")
      );
      return el ? el.getAttribute("dir") : null;
    });
    check(
      "the swipe diagram does NOT mirror — right still means liked",
      mapDir === "ltr",
      mapDir === "ltr"
        ? "the ← 👎 / 👍 → map is pinned ltr inside the rtl page"
        : "the gesture diagram mirrored, which would retrain the user's hand"
    );
  }
  await ctx.close();

  /* ── 4 · a device set to Arabic, with no preference stored ── */
  const arCtx = await browser.newContext({ locale: "ar-SA" });
  const arPage = await arCtx.newPage();
  await arPage.route("**://image.tmdb.org/**", (r) => r.abort());
  await arPage.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await arPage.waitForTimeout(900);
  const autoDir = await arPage.evaluate(() => document.documentElement.dir);
  const autoText = await arPage.evaluate(() => document.body.innerText);
  check(
    "an Arabic phone gets Arabic without asking",
    autoDir === "rtl" && ARABIC.test(autoText),
    `navigator.language=ar-SA -> dir="${autoDir}", Arabic present: ${ARABIC.test(autoText)}`
  );
  await arCtx.close();
} finally {
  await browser.close();
}

console.log(`\n${6 - failures}/6 checks passed\n`);
process.exit(failures ? 1 : 0);
