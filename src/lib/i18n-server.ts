import { cookies, headers } from "next/headers";

export type ServerLocale = "ar" | "en";

/**
 * Resolve the language before React renders so the first document has the
 * correct lang/dir and metadata. An explicit UI choice is mirrored into a
 * cookie by LocaleProvider; otherwise Accept-Language is the server-side
 * equivalent of the browser's automatic locale choice.
 */
export async function getServerLocale(): Promise<ServerLocale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get("dhawq-locale")?.value;
  if (saved === "ar" || saved === "en") return saved;

  const accept = (await headers()).get("accept-language") ?? "";
  const ranked = accept
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qPart = params.find((p) => p.trim().startsWith("q="));
      const q = qPart ? Number(qPart.trim().slice(2)) : 1;
      return { base: tag.toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .sort((a, b) => b.q - a.q);

  for (const item of ranked) {
    if (item.base === "ar") return "ar";
    if (item.base === "en") return "en";
  }
  return "en";
}
