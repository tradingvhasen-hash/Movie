import { getLocale } from "next-intl/server";

export interface SharedTitle {
  id: string;
  type: string;
  title_en: string;
  title_ar: string;
  year: number;
  rating: number;
  poster_path: string | null;
}

export default async function ShareGrid({ titles }: { titles: SharedTitle[] }) {
  const locale = await getLocale();
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {titles.map((title) => (
        <div
          key={title.id}
          className="overflow-hidden rounded-2xl border border-line bg-surface"
        >
          <div className="flex aspect-[10/14] w-full items-center justify-center bg-surface-2 text-4xl">
            {title.poster_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://image.tmdb.org/t/p/w342${title.poster_path}`}
                alt={locale === "ar" ? title.title_ar : title.title_en}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>🎬</span>
            )}
          </div>
          <div className="p-2.5">
            <div className="truncate text-sm font-semibold">
              {locale === "ar" ? title.title_ar || title.title_en : title.title_en}
            </div>
            <div className="mt-0.5 text-xs text-ink-faint">
              {title.year} · ⭐ {Number(title.rating).toFixed(1)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
