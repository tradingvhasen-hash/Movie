import { getTranslations } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import ShareGrid, { type SharedTitle } from "@/components/ShareGrid";

export const dynamic = "force-dynamic";

export default async function SharedListPage({ params }: PageProps<"/l/[slug]">) {
  const { slug } = await params;
  const t = await getTranslations();
  const supabase = getServerSupabase();

  if (!supabase) {
    return <ShareNotFound message={t("share.notFound")} />;
  }

  const { data: list } = await supabase
    .from("lists")
    .select("id, name, is_public, profiles(display_name)")
    .eq("share_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (!list) {
    return <ShareNotFound message={t("share.notFound")} />;
  }

  const { data: items } = await supabase
    .from("list_items")
    .select("titles(id, type, title_en, title_ar, year, rating, poster_path)")
    .eq("list_id", list.id);

  const titles: SharedTitle[] = (items ?? [])
    .map((row) => {
      const t0 = Array.isArray(row.titles) ? row.titles[0] : row.titles;
      return t0 as SharedTitle | null;
    })
    .filter((x): x is SharedTitle => Boolean(x));

  const profileRow = Array.isArray(list.profiles) ? list.profiles[0] : list.profiles;
  const ownerName = (profileRow as { display_name?: string } | null)?.display_name ?? "—";

  return (
    <div className="px-5">
      <p className="text-sm text-ink-dim">{t("share.listBy", { name: ownerName })}</p>
      <h1 className="mt-1 text-3xl font-bold">{list.name}</h1>
      <ShareGrid titles={titles} />
      <p className="mt-10 text-center text-xs text-ink-faint">{t("share.poweredBy")}</p>
    </div>
  );
}

function ShareNotFound({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center px-5 pt-24 text-center">
      <div className="text-4xl text-ink-faint">●</div>
      <p className="mt-4 text-ink-dim">{message}</p>
    </div>
  );
}
