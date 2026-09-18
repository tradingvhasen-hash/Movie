/**
 * THE ONE PLACE THE PRODUCT IS NAMED.
 *
 * It was named in six: `app.name` in en.json said "Seenit", four `metadata`
 * blocks said "Seenit", the web manifest said "Seenit", and everything else —
 * the package, the Render service, the address, the README — said Dhawq. A
 * person installing it to their home screen got an app called Seenit; the tab
 * above the Arabic product said Seenit.
 *
 * Sweeping those six files once would have fixed it once. The reason this is a
 * module instead is that the drift is what recurs: every new page writes its
 * own `metadata`, and the next one would have copied whichever neighbour it
 * happened to sit next to.
 *
 * SEENIT IS ALSO TAKEN. There is an active iPhone app called "SeenIt — Movies
 * & TV Tracker" doing the same job, which is reason enough not to build on the
 * name whatever the trademark position is.
 *
 * So the product is ذَوق, and Dhawq where the script has to be Latin.
 */

/** the name in its own script — what the product is actually called */
export const BRAND_AR = "ذَوق";

/** the Latin rendering, for URLs, package names and English surfaces */
export const BRAND_LATIN = "Dhawq";

/**
 * What goes in a browser tab, a manifest, an OAuth consent screen.
 *
 * Both scripts, because the audience is both and a tab is the one place the
 * name is read without any surrounding context to disambiguate it.
 */
export const BRAND = `${BRAND_AR} · ${BRAND_LATIN}`;

/** short enough for a phone home screen, which truncates past ~12 characters */
export const BRAND_SHORT = BRAND_AR;

export const TAGLINE_EN = "Everything you have ever watched";
export const TAGLINE_AR = "كل ما شاهدته في حياتك";

/**
 * The build this bundle came from, for error reports.
 *
 * Set in `next.config.ts` from Render's `RENDER_GIT_COMMIT`, falling back to a
 * local `git rev-parse`. "dev" when neither exists. Without it an error report
 * says what broke but not which version it broke in, which on a site that
 * deploys on every push is most of the answer missing.
 */
export const BUILD = process.env.NEXT_PUBLIC_BUILD || "dev";
