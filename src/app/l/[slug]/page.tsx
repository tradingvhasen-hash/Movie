import SharedList from "@/components/SharedList";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The server's whole job here is four fields: a name, an owner, and the ids.
 *
 * It used to join `list_items` to `public.titles` so it could render posters
 * server-side. That table holds whatever the seed script last uploaded and the
 * catalog the browser ranks against is 15,083 rows, so the join was quietly
 * dropping most of any list it was given — the same fault migration 0006
 * removed from swipes. The browser already has the catalog; let it resolve.
 */
export default async function SharedListPage({ params }: PageProps<"/l/[slug]">) {
  const { slug } = await params;
  const supabase = getServerSupabase();
  if (!supabase) return <NotFound />;

  const { data: list } = await supabase
    .from("lists")
    .select("id, name, hide_owner, profiles(display_name)")
    .eq("share_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (!list) return <NotFound />;

  const { data: items } = await supabase
    .from("list_items")
    .select("title_id")
    .eq("list_id", list.id);

  const profile = Array.isArray(list.profiles) ? list.profiles[0] : list.profiles;
  const owner = list.hide_owner
    ? null
    : ((profile as { display_name?: string } | null)?.display_name ?? null);

  return (
    <SharedList
      slug={slug}
      name={list.name as string}
      owner={owner}
      titleIds={(items ?? []).map((r) => String(r.title_id))}
    />
  );
}

/**
 * A dead link says so by looking like a dead link — an empty frame — rather
 * than by a paragraph apologising for itself.
 */
function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3">
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-24 w-16 rounded-xl border border-dashed border-line"
          />
        ))}
      </div>
    </div>
  );
}
