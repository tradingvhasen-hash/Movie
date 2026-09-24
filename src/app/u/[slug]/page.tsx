import { getTranslations } from "next-intl/server";
import { getServerSupabase } from "@/lib/supabase/server";
import PublicProfileGrid from "@/components/PublicProfileGrid";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: PageProps<"/u/[slug]">) {
  const { slug } = await params;
  const t = await getTranslations();
  const supabase = getServerSupabase();

  if (!supabase) {
    return <ShareNotFound message={t("share.notFound")} />;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, is_public")
    .eq("public_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (profileError || !profile) {
    return <ShareNotFound message={t("share.notFound")} />;
  }

  // swipes.title_id intentionally has no FK to public.titles; that database
  // table is not the complete product catalog. Fetch ids only and let the
  // browser catalog resolve presentation data.
  const { data: rows, error: swipeError } = await supabase
    .from("swipes")
    .select("title_id")
    .eq("user_id", profile.id)
    .eq("action", "liked")
    .order("created_at", { ascending: false })
    .limit(120);

  if (swipeError) {
    return <ShareNotFound message={t("share.notFound")} />;
  }

  return (
    <div className="px-5 pb-16 pt-8">
      <h1 className="text-3xl font-bold">
        {t("share.libraryOf", { name: profile.display_name ?? "—" })}
      </h1>
      <PublicProfileGrid titleIds={(rows ?? []).map((row) => String(row.title_id))} />
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
