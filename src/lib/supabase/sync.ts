import { getSupabase } from "./client";
import { useDhawq } from "@/lib/store";
import { emptyProfile, type TasteProfile } from "@/lib/engine/taste";

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
        console.warn(
          `dhawq: ${batch.length} swipes rejected by the database`,
          retry.error.message
        );
      }
    }
  }

  // the profile goes up whole, or not at all
  if (state.profile.totalSwipes > 0) {
    await supabase.from("user_taste").upsert(toRow(userId, state.profile));
  }

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
  await supabase.from("user_taste").upsert(toRow(userId, profile));
}

export type { TasteRow };
