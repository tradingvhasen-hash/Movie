import { readFileSync } from "node:fs";

let failures = 0;
function check(name, pass) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}

const read = (p) => readFileSync(p, "utf8");

const rankClient = read("src/lib/engine/rank-client.ts");
check("worker receives neutral-seen ids", rankClient.includes("seenIds: q.seenIds"));

const deleteFn = read("supabase/functions/delete-account/index.ts");
const dataPanel = read("src/components/DataPanel.tsx");
check("deletion derives identity from JWT and performs one admin user delete",
  deleteFn.includes("auth.getUser(token)") &&
  deleteFn.includes("auth.admin.deleteUser(who.user.id)") &&
  !deleteFn.includes("req.json()")
);
check("browser deletion uses authenticated edge and guest reset clears local state",
  dataPanel.includes('functions.invoke("delete-account"') &&
  dataPanel.includes("if (!supabase || !session)") &&
  dataPanel.includes('t("data.localDeleted")') &&
  dataPanel.includes("eraseAllUserData()")
);

const labPage = read("src/app/lab/page.tsx");
const labScreen = read("src/app/lab/LabScreen.tsx");
check("production lab is guest-only before destructive test reset",
  labPage.includes("<LabScreen />") &&
  labScreen.includes("if (session)") &&
  labScreen.includes("eraseAllUserData()")
);

const publicSharing = read("supabase/migrations/0011_public_sharing_rpc.sql");
const publicProfilePage = read("src/app/u/[slug]/page.tsx");
const publicListPage = read("src/app/l/[slug]/page.tsx");
check("public sharing is exposed only through shaped RPC contracts",
  publicSharing.includes("get_public_profile") &&
  publicSharing.includes("get_public_list") &&
  publicSharing.includes("s.action = 'liked'") &&
  publicSharing.includes('create policy "swipes read own"') &&
  publicSharing.includes('create policy "lists read own"') &&
  publicProfilePage.includes('rpc("get_public_profile"') &&
  publicListPage.includes('rpc("get_public_list"')
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
check("starter deck is immediate and default swipe does not preload the full catalog",
  deck.includes("STARTER_PACK.filter") &&
  deck.includes("hydratedRef.current = true") &&
  !deck.includes("loadCatalog(")
);
check("dead remote recommender is not on the deck path", !deck.includes('fetch("/api/recommend"'));

const store = read("src/lib/store.ts");
check("account ownership is persisted", store.includes("accountOwner: string | null"));
check("full local erase exists", store.includes("eraseAllUserData"));
check("offline deletions are persisted as tombstones",
  store.includes("deletedSwipeIds: string[]") &&
  store.includes("deletedListIds: string[]") &&
  store.includes("deletedSwipeIds: st.deletedSwipeIds.includes(lastId)")
);

const account = read("src/lib/supabase/useAccount.ts");
check("account controller is a singleton provider",
  account.includes("AccountProvider") && account.includes("useAccountController") &&
  !account.includes("export function useAccountController")
);
check("sign-out flushes account truth before auth session ends",
  account.indexOf("await syncLocalToCloud(userId)") < account.indexOf("await supabase.auth.signOut()")
);
check("reconciliation applies offline deletion tombstones",
  account.includes("cloudAfterDeletes") &&
  account.includes("before.deletedSwipeIds.includes(id)") &&
  account.includes("before.deletedListIds.includes(list.id)")
);

const recommend = read("src/lib/engine/recommend.ts");
const rankRoute = read("src/app/api/rank/route.ts");
const rankClientSource = read("src/lib/engine/rank-client.ts");
check("ranking keeps request-scoped reach in the browser worker path",
  recommend.includes("reach?: ReachSetting") &&
  recommend.includes("fameTierSize(profile, mode, opts.reach)") &&
  rankClientSource.includes("reach: q.reach")
);
check("failed exposure-debt experiment remains disabled for shared server ranking",
  recommend.includes('const DEBT_EVERY = num("DEBT_EVERY", 0)')
);
check("normal ranking stays off the constrained Render process",
  !rankClientSource.includes("/api/rank") &&
  rankClientSource.includes("await sendCatalog(w)") &&
  rankRoute.includes("server_ranking_disabled")
);
const layout = read("src/app/layout.tsx");
const requestLocale = read("src/i18n/request.ts");
check("first document resolves locale before hydration",
  layout.includes("getServerLocale") && layout.includes('dir={locale === "ar" ? "rtl" : "ltr"}') &&
  requestLocale.includes("getServerLocale")
);

const hardening = read("supabase/migrations/0009_database_hardening.sql");
check("privileged maintenance RPCs are revoked from browser roles",
  hardening.includes("revoke execute on function public.rebuild_item_similarity") &&
  hardening.includes("from public, anon, authenticated")
);
check("owner RLS policies target authenticated explicitly",
  hardening.includes('create policy "swipes insert own"') &&
  hardening.includes("to authenticated") &&
  hardening.includes("(select auth.uid())")
);

const together = read("src/app/together/page.tsx");
check("custom recommendation dialogs have modal semantics and focus handling",
  (together.match(/role="dialog"/g) ?? []).length >= 2 &&
  (together.match(/aria-modal="true"/g) ?? []).length >= 2 &&
  together.includes("useDialogKeyboard")
);

console.log(`\n${failures ? "FAIL" : "PASS"} — ${23 - failures}/23 source invariants`);
process.exit(failures ? 1 : 0);
