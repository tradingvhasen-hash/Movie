import { getTranslations } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import ShareGrid, { type SharedTitle } from "@/components/ShareGrid";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: PageProps<"/u/[slug]">) {
  const { slug } = await params;
  const t = await getTranslations();
  const supabase = getServerSupabase();

  if (!supabase) {
    return <ShareNotFound message={t("share.notFound")} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, is_public")
    .eq("public_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (!profile) {
    return <ShareNotFound message={t("share.notFound")} />;
  }

  const { data: rows } = await supabase
    .from("swipes")
    .select("action, titles(id, type, title_en, title_ar, year, rating, poster_path)")
    .eq("user_id", profile.id)
    .eq("action", "liked")
    .order("created_at", { ascending: false })
    .limit(120);

  const titles: SharedTitle[] = (rows ?? [])
    .map((row) => {
      const t0 = Array.isArray(row.titles) ? row.titles[0] : row.titles;
      return t0 as SharedTitle | null;
    })
    .filter((x): x is SharedTitle => Boolean(x));

  return (
    <div className="px-5 pb-16 pt-8">
      <h1 className="text-3xl font-bold">
        {t("share.libraryOf", { name: profile.display_name ?? "—" })}
      </h1>
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
