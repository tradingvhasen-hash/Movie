import { getSupabase } from "./client";
import { useDhawq } from "@/lib/store";
import { getLocalTitle } from "@/lib/catalog";
import { emptyProfile, type TasteProfile } from "@/lib/engine/taste";
import type { Swipe, SwipeAction, Title, UserList } from "@/lib/types";

/**
 * Carrying a taste between devices, in both directions.
 *
 * This file used to push only two fields — a 384-dimension blended direction
 * and a swipe count — because when it was written those two *were* the taste.
 * They have not been since the facet tables shipped. Pushing that alone and
 * calling it a sync would have meant a viewer signing in on a second device
 * and finding a site that had forgotten a month of swiping, with nothing in
 * any log to show it. The columns exist now (migration 0002) and this reads
 * and writes all of them.
 *
 * The rule everywhere below: **local storage wins ties, and the cloud is
 * never allowed to replace a taste with a thinner one.** A dropped connection
 * or a half-finished write must not be able to cost someone their history.
 */

/** every field the ranking actually reads, in the shape the table stores */
function toRow(userId: string, p: TasteProfile) {
  return {
    user_id: userId,
    taste: `[${p.taste.join(",")}]`,
    facets: p.facets,
    seen_facets: p.seenFacets,
    facet_weights: p.facetWeights,
    streaks: p.streaks,
    liked_sum: p.likedSum,
    liked_count: p.likedCount,
    disliked_sum: p.dislikedSum,
    disliked_count: p.dislikedCount,
    rated_swipes: p.ratedSwipes,
    total_swipes: p.totalSwipes,
    seen_count: p.seenCount,
    unseen_count: p.unseenCount,
    recent: p.recent,
    updated_at: new Date().toISOString(),
  };
}

type TasteRow = ReturnType<typeof toRow> & { taste: string };

function fromRow(row: Record<string, unknown>): TasteProfile | null {
  const facets = row.facets as TasteProfile["facets"] | null;
  // a row written before the facet engine carries a taste this engine cannot
  // read. Treat it as nothing rather than as an empty taste.
  if (!facets || Object.keys(facets).length === 0) return null;

  const base = emptyProfile();
  const nums = (v: unknown, fallback: number[]) =>
    Array.isArray(v) && v.length === fallback.length ? (v as number[]) : fallback;

  return {
    ...base,
    facets,
    // rows written before the exposure model come back empty, which is
    // exactly right: the fame prior carries alone until the tables refill
    seenFacets: (row.seen_facets as TasteProfile["seenFacets"]) ?? base.seenFacets,
    facetWeights: (row.facet_weights as TasteProfile["facetWeights"]) ?? base.facetWeights,
    streaks: (row.streaks as TasteProfile["streaks"]) ?? base.streaks,
    taste: parseVector(row.taste, base.taste),
    likedSum: nums(row.liked_sum, base.likedSum),
    dislikedSum: nums(row.disliked_sum, base.dislikedSum),
    likedCount: Number(row.liked_count ?? 0),
    dislikedCount: Number(row.disliked_count ?? 0),
    ratedSwipes: Number(row.rated_swipes ?? 0),
    totalSwipes: Number(row.total_swipes ?? 0),
    seenCount: Number(row.seen_count ?? 0),
    unseenCount: Number(row.unseen_count ?? 0),
    recent: Array.isArray(row.recent) ? (row.recent as string[][]) : base.recent,
  };
}

/** pgvector hands back "[0.1,0.2,…]"; older rows may hand back an array */
function parseVector(value: unknown, fallback: number[]): number[] {
  if (Array.isArray(value)) return value as number[];
  if (typeof value !== "string") return fallback;
  const parsed = value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(Number);
  return parsed.length === fallback.length && parsed.every(Number.isFinite)
    ? parsed
    : fallback;
}

/**
 * Guest → account: push what is on this device to the cloud.
 *
 * Swipes referencing titles absent from the cloud catalog are skipped to
 * respect the foreign key; they stay in local storage rather than being lost.
 */
export async function syncLocalToCloud(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const state = useDhawq.getState();
  const swipes = Object.values(state.swipes);

  /* collected rather than logged: the caller turns these into the one line the
     profile screen shows, and `console.warn` reaches nobody on a phone */
  const rejected: string[] = [];

  if (swipes.length > 0) {
    /**
     * SWIPES USED TO BE THROWN AWAY HERE, SILENTLY, AND MOST OF THEM WERE.
     *
     * `swipes.title_id` carries a foreign key into `titles`, and `titles` holds
     * whatever the seed script last uploaded — a few hundred rows — while the
     * catalog the browser ranks against is 15,083. So this filtered every swipe
     * whose title was not in that small table and uploaded the remainder, with
     * no error anywhere: a person could swipe a thousand cards, sign in on a
     * second device, and find almost none of it. Migration 0006 drops the
     * constraint, because the browser's catalog is the source of truth for what
     * a title id means and the database has no business disagreeing with it.
     *
     * Both paths stay live, because the migration is run by hand and this must
     * not depend on that having happened. Everything goes up first; only if the
     * database rejects the batch do we find out which ids it will accept and
     * send those. And the failure is now returned instead of swallowed.
     */
    const rows = swipes.map((s) => ({
      user_id: userId,
      title_id: s.titleId,
      action: s.action,
      created_at: new Date(s.at).toISOString(),
    }));

    let known: Set<string> | null = null;
    const knownIds = async (batch: typeof rows) => {
      if (known) return known;
      known = new Set<string>();
      const ids = [...new Set(rows.map((r) => r.title_id))];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase
          .from("titles")
          .select("id")
          .in("id", ids.slice(i, i + 200));
        for (const row of data ?? []) known.add(row.id);
      }
      return known;
    };

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from("swipes").upsert(batch);
      if (!error) continue;
      const ok = await knownIds(batch);
      const kept = batch.filter((r) => ok.has(r.title_id));
      if (kept.length === 0) continue;
      const retry = await supabase.from("swipes").upsert(kept);
      if (retry.error) {
        /**
         * THE SUPABASE CLIENT DOES NOT THROW. IT RETURNS.
         *
         * `{ data, error }`, always resolved — so `await`ing one of these calls
         * and not reading `.error` means a rejected write is indistinguishable
         * from a successful one. Every caller above wrapped these in
         * `try/catch`, which caught network faults and could never once have
         * caught a permission denial or a missing column.
         *
         * That mattered the moment sign-in started working: a policy that says
         * no would have looked exactly like a policy that says yes, for as long
         * as anyone cared to keep swiping.
         */
        rejected.push(retry.error.message);
      }
    }
  }

  // the profile goes up whole, or not at all
  if (state.profile.totalSwipes > 0) {
    const { error } = await supabase.from("user_taste").upsert(toRow(userId, state.profile));
    if (error) throw new Error(error.message);
  }

  if (rejected.length > 0) throw new Error(rejected[0]);

  for (const list of state.lists) {
    const { data: created } = await supabase
      .from("lists")
      .insert({ user_id: userId, name: list.name, is_public: list.isPublic })
      .select("id")
      .single();
    if (!created) continue;
    const items = list.titleIds.map((title_id) => ({ list_id: created.id, title_id }));
    if (items.length > 0) await supabase.from("list_items").insert(items);
  }
}

/**
 * Sign-in on a second device: bring the stored taste down.
 *
 * Returns null when there is nothing usable — no row, or a row written before
 * the facet engine — so the caller keeps whatever is local. It also refuses a
 * cloud profile built on *fewer* swipes than the local one, because the common
 * case for that is a device that synced once, went offline, and kept swiping.
 * The larger history is the true one.
 */
export async function loadCloudProfile(
  userId: string
): Promise<TasteProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from("user_taste")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;

  const cloud = fromRow(data as unknown as Record<string, unknown>);
  if (!cloud) return null;

  const local = useDhawq.getState().profile;
  return cloud.totalSwipes >= local.totalSwipes ? cloud : null;
}

/** keep the cloud current after a swipe. Cheap: one upsert of one row. */
export async function pushProfile(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { profile } = useDhawq.getState();
  if (profile.totalSwipes === 0) return;
  const { error } = await supabase.from("user_taste").upsert(toRow(userId, profile));
  /* see the note in `syncLocalToCloud`: an unread `.error` here is a backup
     that silently is not one */
  if (error) throw new Error(error.message);
}

/**
 * THE HALF THAT WAS MISSING, AND THE BUG IT CAUSED.
 *
 * Upload covered everything: `titles`, `swipes`, `user_taste`, `lists`,
 * `list_items`. Download covered `user_taste` and nothing else. The path was
 * asymmetric and had been since it was written, which meant cross-device sync —
 * the entire reason to have an account — silently did not work.
 *
 * What a person actually got on a second device:
 *
 *   1. Sign in. `loadCloudProfile` returns a taste built on 1,100 swipes.
 *   2. It is adopted. But `swipes` stays `{}` and `swipeOrder` stays `[]`,
 *      because nothing ever fetched them.
 *   3. The library screen is empty while the profile claims 1,100 swipes.
 *   4. Worse: `useDeck`'s `answeredIds()` is `new Set(Object.keys(swipes))` —
 *      empty — so the deck re-deals every title they had already answered.
 *
 * Step 4 is the damaging one. A person who signs in on their phone does not
 * see "my library is missing"; they see a deck asking them about films they
 * answered last week, which reads as the product being broken rather than the
 * sync being broken.
 *
 * WHY THE TITLE SNAPSHOT DOES NOT COME BACK WITH THE SWIPE. The cloud stores
 * `title_id`, `action` and `created_at` — no snapshot, by design, since it
 * would mean storing the catalog once per user. The snapshot exists locally so
 * a library still renders when the catalog changes underneath it, and on a
 * second device the catalog is already downloaded, so `getLocalTitle` supplies
 * it. A title the local catalog does not know keeps the swipe and renders from
 * whatever the catalog gains later — the answer is the thing worth keeping,
 * and it is never dropped for want of a poster.
 */
export interface CloudLibrary {
  swipes: Record<string, Swipe>;
  swipeOrder: string[];
  lists: UserList[];
}

export async function loadCloudLibrary(userId: string): Promise<CloudLibrary | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  /* paged, because a person who has done what this product asks of them has
     thousands of these and PostgREST caps a response at a thousand rows */
  const rows: { title_id: string; action: string; created_at: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("swipes")
      .select("title_id, action, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const { data: listRows, error: listError } = await supabase
    .from("lists")
    .select("id, name, is_public, created_at, list_items(title_id)")
    .eq("user_id", userId);
  if (listError) throw new Error(listError.message);

  return reconstructLibrary(rows, (listRows ?? []) as unknown as CloudListRow[], getLocalTitle);
}

export interface CloudSwipeRow {
  title_id: string;
  action: string;
  created_at: string;
}
export interface CloudListRow {
  id: string;
  name: string;
  is_public: boolean;
  created_at: string | null;
  list_items: { title_id: string }[] | null;
}

/**
 * Rows in, store state out. No network, no Supabase client, no browser.
 *
 * Split out from the fetch above so the reconciliation can be *tested* rather
 * than trusted. The bug this file exists to fix shipped for weeks and was
 * found by reading, not by any test — because testing it appeared to require
 * two real browsers, two real devices and a real account, which is enough
 * friction that it never happened once.
 *
 * It does not require any of that. What went wrong was a pure function of
 * rows: swipes were never turned back into store state. `scripts/sync-guard.ts`
 * drives this directly and asserts library equality title-by-title,
 * action-by-action, in milliseconds, with no credentials.
 */
export function reconstructLibrary(
  swipeRows: CloudSwipeRow[],
  listRows: CloudListRow[],
  lookupTitle: (id: string) => Title | undefined
): CloudLibrary | null {
  const swipes: Record<string, Swipe> = {};
  const swipeOrder: string[] = [];

  /* oldest first, so "last answer wins" means what it says even if the caller
     hands these over unordered */
  const ordered = [...swipeRows].sort(
    (a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0)
  );

  for (const row of ordered) {
    if (!isSwipeAction(row.action)) continue;
    const title = lookupTitle(row.title_id);
    /* one entry per title — the same rule the local store applies, so a title
       answered twice cannot appear twice in the order */
    if (!(row.title_id in swipes)) swipeOrder.push(row.title_id);
    swipes[row.title_id] = {
      titleId: row.title_id,
      action: row.action,
      at: Date.parse(row.created_at) || Date.now(),
      ...(title ? { title: snapshotForSync(title) } : null),
    };
  }

  const lists: UserList[] = listRows.map((r) => ({
    id: r.id,
    name: r.name,
    isPublic: Boolean(r.is_public),
    titleIds: (r.list_items ?? []).map((i) => i.title_id),
    createdAt: r.created_at ? Date.parse(r.created_at) || Date.now() : Date.now(),
  }));

  if (swipeOrder.length === 0 && lists.length === 0) return null;
  return { swipes, swipeOrder, lists };
}

function isSwipeAction(value: string): value is SwipeAction {
  return value === "liked" || value === "disliked" || value === "not_seen" || value === "seen";
}

/** the same slimming the store's own v5 migration applies — see `snapshot` there */
function snapshotForSync(title: Title): Title {
  return { ...title, overview: { en: "", ar: "" }, related: undefined };
}

export type { TasteRow };
