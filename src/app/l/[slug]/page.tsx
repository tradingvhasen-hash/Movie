import SharedList from "@/components/SharedList";
import { getServerSupabase } from "@/lib/supabase/server";
import { serverTitlesFor } from "@/lib/server-catalog";

export const dynamic = "force-dynamic";

export default async function SharedListPage({ params }: PageProps<"/l/[slug]">) {
  const { slug } = await params;
  const supabase = getServerSupabase();
  if (!supabase) return <NotFound />;

  // lists.user_id and profiles.id both point at auth.users; there is no direct
  // foreign key between lists and profiles, so do not rely on an inferred
  // PostgREST embedded relation.
  const { data: list, error: listError } = await supabase
    .from("lists")
    .select("id, user_id, name, hide_owner")
    .eq("share_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (listError || !list) return <NotFound />;

  const [{ data: items, error: itemsError }, ownerResult] = await Promise.all([
    supabase.from("list_items").select("title_id").eq("list_id", list.id),
    list.hide_owner
      ? Promise.resolve({ data: null, error: null })
      : supabase.from("profiles").select("display_name").eq("id", list.user_id).maybeSingle(),
  ]);

  if (itemsError) return <NotFound />;

  const owner =
    list.hide_owner || ownerResult.error
      ? null
      : ((ownerResult.data as { display_name?: string } | null)?.display_name ?? null);
  const titleIds = (items ?? []).map((r) => String(r.title_id));
  const titles = await serverTitlesFor(titleIds);

  return (
    <SharedList
      listId={String(list.id)}
      name={String(list.name)}
      owner={owner}
      titleIds={titleIds}
      titles={titles}
    />
  );
}

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
