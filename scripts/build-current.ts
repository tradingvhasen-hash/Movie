/**
 * FACTS ARE GENERATED. DECISIONS ARE WRITTEN. EXPERIMENTS ARE VERSIONED.
 *
 *   npx tsx scripts/build-current.ts     writes CURRENT.md
 *
 * This project has twice acted on a number that had quietly stopped being
 * true. `YOUR-TASKS.md` and `REVIEW-REQUEST.md` describe a catalog of 12,826
 * and 15,083 titles, which was correct when they were written and has been
 * false since 23 August. Worse, three rounds of `/calibrate` were answered
 * against 15,083 titles and every figure derived from them — the size of a
 * person's library, the fame curve, where the gate stops — is a SHARE of the
 * catalog, so all of them silently stopped describing anything real.
 *
 * Both failures have the same shape: a fact a computer could have checked,
 * written down by hand, read back later as current.
 *
 * So the rule is the one at the top of this file. Anything a computer can know
 * is generated here and never typed: the catalog size, the split, the
 * languages, the routes, the name, the commit. Anything a computer cannot know
 * — why co-watch rather than genres, why the gesture does not mirror — is
 * written by a person and lives in `docs/`, where being older than the code is
 * not the same as being wrong.
 *
 * CURRENT.md is therefore never edited by hand. It says so at the top of
 * itself, because that is the only place somebody about to edit it will look.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { loadFullCatalog } from "./lib/catalog";
import { BRAND, BRAND_LATIN } from "../src/lib/brand";

const git = (cmd: string, fallback = "unknown") => {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return fallback;
  }
};

const catalog = loadFullCatalog();
const movies = catalog.filter((t) => t.type === "movie").length;
const tv = catalog.length - movies;

const byLang = new Map<string, number>();
for (const t of catalog) {
  byLang.set(t.originalLanguage, (byLang.get(t.originalLanguage) ?? 0) + 1);
}
const langs = [...byLang.entries()].sort((a, b) => b[1] - a[1]);

let edges = 0;
let withOriginal = 0;
for (const t of catalog) {
  edges += t.related?.length ?? 0;
  if (t.title.original) withOriginal++;
}

/** every route the app actually serves, read from the tree rather than listed */
function routes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      out.push(...routes(full, `${prefix}/${entry}`));
    } else if (entry === "page.tsx" || entry === "route.ts") {
      out.push(prefix === "" ? "/" : prefix);
    }
  }
  return out.sort();
}

const mb = (path: string) => {
  try {
    return (statSync(path).size / 1048576).toFixed(2);
  } catch {
    return "—";
  }
};

let regionCount = "—";
try {
  regionCount = String(
    (JSON.parse(readFileSync("public/regions.json", "utf8")) as { count: number }).count
  );
} catch {
  /* regions are optional */
}

const md = `# CURRENT — what is true right now

> **GENERATED FILE. DO NOT EDIT.**
> Rebuild with \`npm run current\`. Anything a computer can check lives here so
> that it cannot quietly go stale; anything it cannot check lives in \`docs/\`.
>
> Generated ${new Date().toISOString().slice(0, 10)} from commit \`${git("rev-parse --short HEAD")}\`.

## The product

| | |
|---|---|
| Name | ${BRAND} |
| Package | \`${JSON.parse(readFileSync("package.json", "utf8")).name}\` |
| Live site | https://dhawq.onrender.com |
| Repository | https://github.com/tradingvhasen-hash/Movie |
| Branch | \`${git("rev-parse --abbrev-ref HEAD")}\` |
| Commits | ${git("rev-list --count HEAD", "—")} |

## The catalog

| | |
|---|---|
| Titles | **${catalog.length.toLocaleString()}** |
| Films / series | ${movies.toLocaleString()} / ${tv.toLocaleString()} |
| Languages | ${langs.length} |
| Co-watch links | ${edges.toLocaleString()} |
| Titles with an original-script name | ${withOriginal.toLocaleString()} |
| Co-watch regions | ${regionCount} |
| \`public/catalog.json\` | ${mb("public/catalog.json")} MB |
| \`public/overviews.json\` | ${mb("public/overviews.json")} MB |
| \`public/regions.json\` | ${mb("public/regions.json")} MB |

### Largest languages

${langs
  .slice(0, 12)
  .map(([l, n]) => `- \`${l}\` — ${n.toLocaleString()}`)
  .join("\n")}

## Routes

${routes("src/app")
  .map((r) => `- \`${r}\``)
  .join("\n")}

## Measurement caveats that apply to every number in \`docs/experiments/\`

- **MovieLens has no television.** The main harvest ruler is blind to
  ${tv.toLocaleString()} of ${catalog.length.toLocaleString()} titles — ${((100 * tv) / catalog.length).toFixed(0)}% of the catalog.
- **MovieLens is American, English and mainstream.** It is structurally
  incapable of containing the viewer this catalog was rebuilt for, so any
  result of the form "wider does not help" says nothing about Arabic, Turkish
  or Indian libraries.
- **Any figure expressed as a share of the catalog expires when the catalog is
  rebuilt.** Check the catalog size stamped on the experiment against the one
  above before quoting it.

---
*${BRAND_LATIN} · regenerate with \`npm run current\`*
`;

writeFileSync("CURRENT.md", md);
console.log(
  `CURRENT.md — ${catalog.length.toLocaleString()} titles, ${langs.length} languages, ` +
    `${routes("src/app").length} routes, commit ${git("rev-parse --short HEAD")}`
);
