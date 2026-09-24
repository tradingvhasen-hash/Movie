import { readFileSync } from "node:fs";

let failures = 0;
function check(name, pass) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}

const read = (p) => readFileSync(p, "utf8");

const rankClient = read("src/lib/engine/rank-client.ts");
check("worker receives neutral-seen ids", rankClient.includes("seenIds: q.seenIds"));

const accountRoute = read("src/app/api/account/route.ts");
check("deletion requires service role before mutation",
  accountRoute.includes("account_deletion_not_configured") &&
  accountRoute.includes("auth.admin.deleteUser") &&
  !accountRoute.includes('["swipes","list_items","lists","user_taste","profiles"]')
);

const migration = read("supabase/migrations/0008_security_sync_hardening.sql");
check("public swipe policy is likes-only",
  /action\s*=\s*'liked'/.test(migration) &&
  migration.includes('drop policy if exists "public library readable"')
);

const sw = read("public/sw.js");
const swClient = read("src/components/ServiceWorker.tsx");
check("service-worker cache is build-versioned",
  sw.includes('searchParams.get("v")') && swClient.includes("encodeURIComponent(BUILD)")
);
check("mutable JSON revalidates", sw.includes("stale-while-revalidate"));

const quick = read("src/components/QuickAdd.tsx");
check("fast-add does not hard-label untouched posters not-seen",
  quick.includes("learnPasses(untouched)") && !quick.includes('swipe(t, "not_seen")')
);

const deck = read("src/lib/useDeck.ts");
const startup = deck.indexOf("rebuild();");
const load = deck.indexOf("void loadCatalog().then");
check("starter deck is installed before catalog resolves", startup >= 0 && load >= 0 && startup < load);
check("dead remote recommender is not on the deck path", !deck.includes('fetch("/api/recommend"'));

const store = read("src/lib/store.ts");
check("account ownership is persisted", store.includes("accountOwner: string | null"));
check("full local erase exists", store.includes("eraseAllUserData"));

console.log(`\n${failures ? "FAIL" : "PASS"} — ${10 - failures}/10 source invariants`);
process.exit(failures ? 1 : 0);
