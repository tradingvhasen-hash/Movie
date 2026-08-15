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
    const allIds = [...new Set(swipes.map((s) => s.titleId))];
    const known = new Set<string>();
    for (let i = 0; i < allIds.length; i += 200) {
      const { data } = await supabase
        .from("titles")
        .select("id")
        .in("id", allIds.slice(i, i + 200));
      for (const row of data ?? []) known.add(row.id);
    }

    const rows = swipes
      .filter((s) => known.has(s.titleId))
      .map((s) => ({
        user_id: userId,
        title_id: s.titleId,
        action: s.action,
        created_at: new Date(s.at).toISOString(),
      }));
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from("swipes").upsert(rows.slice(i, i + 500));
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
