import { getSupabase } from "./client";
import type { UserList } from "@/lib/types";

/**
 * Publishing a list, and the one design decision that makes it work.
 *
 * The server stores ids and nothing else. It does not join `public.titles` to
 * render posters, and it must not: that table holds whatever the seed script
 * last uploaded, while the catalog the browser ranks against is 15,083 rows —
 * migration 0006 dropped the foreign key for exactly this reason. A share page
 * built on that join would silently lose most of a person's list.
 *
 * So the browser resolves the ids from the catalog it has already downloaded.
 * The shared page then renders the same names and the same posters as the rest
 * of the app, works for every title in it, and stops being the one screen with
 * its own idea of what a film is.
 */
export async function publishList(list: UserList): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) return null;

  // one row per list, re-published in place so the link a person already sent
  // keeps working after they add to it
  const { data: existing } = await supabase
    .from("lists")
    .select("id, share_slug")
    .eq("user_id", userId)
    .eq("name", list.name)
    .maybeSingle();

  let listId = existing?.id as string | undefined;
  let slug = existing?.share_slug as string | undefined;

  if (!listId) {
    const { data: created, error } = await supabase
      .from("lists")
      .insert({
        user_id: userId,
        name: list.name,
        is_public: true,
        hide_owner: list.hideOwner ?? false,
      })
      .select("id, share_slug")
      .single();
    if (error || !created) return null;
    listId = created.id as string;
    slug = created.share_slug as string;
  } else {
    await supabase
      .from("lists")
      .update({ is_public: true, hide_owner: list.hideOwner ?? false })
      .eq("id", listId);
  }

  // replace rather than merge: the local list is the truth, and a title the
  // person removed should disappear from the shared copy too
  await supabase.from("list_items").delete().eq("list_id", listId);
  const rows = list.titleIds.map((title_id) => ({ list_id: listId!, title_id }));
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from("list_items").insert(rows.slice(i, i + 500));
  }

  return slug ?? null;
}

/** the shape the share page needs, and nothing more */
export type SharedList = {
  name: string;
  owner: string | null;
  avatar: string | null;
  titleIds: string[];
};
