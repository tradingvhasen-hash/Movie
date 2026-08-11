import { getSupabase } from "./client";
import { useDhawq } from "@/lib/store";

/**
 * Guest → account migration: after sign-in, push locally-stored swipes,
 * taste fingerprint and lists to Supabase. Swipes referencing titles that
 * don't exist in the cloud catalog (e.g. bundled demo ids before seeding)
 * are skipped to respect the foreign key — they stay in local storage.
 */
export async function syncLocalToCloud(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const state = useDhawq.getState();
  const swipes = Object.values(state.swipes);
  if (swipes.length === 0 && state.lists.length === 0) return;

  // find which of our title ids exist in the cloud catalog
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

  // taste fingerprint
  await supabase.from("user_taste").upsert({
    user_id: userId,
    taste: `[${state.profile.taste.join(",")}]`,
    rated_swipes: state.profile.ratedSwipes,
    updated_at: new Date().toISOString(),
  });

  // lists
  for (const list of state.lists) {
    const { data: created } = await supabase
      .from("lists")
      .insert({ user_id: userId, name: list.name, is_public: list.isPublic })
      .select("id")
      .single();
    if (!created) continue;
    const items = list.titleIds
      .filter((id) => known.has(id))
      .map((title_id) => ({ list_id: created.id, title_id }));
    if (items.length > 0) await supabase.from("list_items").insert(items);
  }
}
